import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Wallet, ContractFactory } from "ethers";
const testDir = mkdtempSync(path.join(tmpdir(), "careledger-test-"));
Object.assign(process.env, {
  DOTENV_CONFIG_PATH: path.join(testDir, 'isolated-test.env'),
  DATA_DIR: testDir,
  DATA_KEY: randomBytes(32).toString("hex"),
  LOOKUP_KEY: randomBytes(32).toString("hex"),
  CHAIN_SEED: randomBytes(32).toString("hex"),
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:5173",
});
delete process.env.RPC_URL;
delete process.env.OPERATOR_PRIVATE_KEY;
delete process.env.CONTRACT_ADDRESS;
const { app } = await import("../server/app.mjs");
const { db, createUser, eventData } = await import("../server/db.mjs");
const { initChain, closeChain, flushPending, artifact } =
  await import("../server/chain.mjs");
const { encrypt, decrypt, passwordHash, passwordMatches } =
  await import("../server/security.mjs");
let server,
  base,
  doctor,
  patient,
  other,
  docSession,
  patientSession,
  otherSession,
  chain,
  recordId,
  taskId,
  appointmentId;
const password = "Test!SecurePassword2026";
async function request(
  url,
  { method = "GET", body, session, csrf = true } = {},
) {
  const response = await fetch(base + url, {
    method,
    headers: {
      Origin: "http://localhost:5173",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session
        ? {
            Cookie: session.cookie,
            ...(csrf ? { "X-CSRF-Token": session.csrf } : {}),
          }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie"),
  };
}
async function login(email) {
  const response = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(response.status, 200);
  return { cookie: response.cookie.split(";")[0], csrf: response.data.csrf };
}
before(async () => {
  chain = await initChain();
  doctor = await createUser({
    name: "Dr Test Clinician",
    email: "doctor@test.example",
    password,
    role: "doctor",
    specialty: "General medicine",
  });
  patient = await createUser({
    name: "Test Patient",
    email: "patient@test.example",
    password,
    role: "patient",
  });
  other = await createUser({
    name: "Other Patient",
    email: "other@test.example",
    password,
    role: "patient",
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  docSession = await login(doctor.email);
  patientSession = await login(patient.email);
  otherSession = await login(other.email);
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeChain();
  db.close();
  const resolved = path.resolve(testDir);
  assert.ok(
    resolved.startsWith(path.resolve(tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith("careledger-test-"),
  );
  rmSync(resolved, { recursive: true, force: true });
});
test("encryption authenticates content and metadata; passwords are salted", async () => {
  const value = encrypt({ note: "Private clinical text" }, "context");
  assert.ok(!value.includes("Private"));
  assert.deepEqual(decrypt(value, "context"), {
    note: "Private clinical text",
  });
  assert.throws(() => decrypt(value, "different"));
  const a = await passwordHash(password),
    b = await passwordHash(password);
  assert.notEqual(a, b);
  assert.equal(await passwordMatches(password, a), true);
  assert.equal(await passwordMatches("WrongPassword123!", a), false);
});
test("unauthenticated reads and missing CSRF tokens are rejected", async () => {
  assert.equal((await request("/api/workspace")).status, 401);
  assert.equal(
    (
      await request("/api/tasks", {
        method: "POST",
        body: {},
        session: patientSession,
        csrf: false,
      })
    ).status,
    403,
  );
});
test("patient registration cannot self-provision a doctor", async () => {
  const response = await request("/api/auth/register", {
    method: "POST",
    body: {
      name: "New Patient",
      email: "new@test.example",
      password,
      role: "doctor",
    },
  });
  assert.equal(response.status, 201);
  assert.equal(response.data.user.role, "patient");
});
test("doctor cannot author records before patient consent; patients cannot author records", async () => {
  const body = {
    patient: patient.id,
    title: "Consultation note",
    category: "Consultation",
    content: "Clinical content for authorized care.",
  };
  assert.equal(
    (
      await request("/api/records", {
        method: "POST",
        body,
        session: docSession,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/records", {
        method: "POST",
        body,
        session: patientSession,
      })
    ).status,
    403,
  );
});
test("consent grants, medical creation, confirmed on-chain verification and privacy isolation", async () => {
  assert.equal(
    (
      await request("/api/access", {
        method: "POST",
        body: { doctor: doctor.id, active: true },
        session: patientSession,
      })
    ).status,
    201,
  );
  const response = await request("/api/records", {
    method: "POST",
    body: {
      patient: patient.id,
      title: "Wellness review",
      category: "Consultation",
      content: "Sensitive clinical finding remains encrypted.",
    },
    session: docSession,
  });
  assert.equal(response.status, 201);
  recordId = response.data.id;
  await flushPending();
  const row = db.prepare("SELECT * FROM events WHERE id=?").get(recordId);
  assert.equal(row.status, "confirmed");
  assert.ok(!row.body.includes("Sensitive"));
  const verification = await request(`/api/records/${recordId}/verify`, {
    session: patientSession,
  });
  assert.equal(verification.data.valid, true);
  assert.equal(
    (
      await request(`/api/records/${recordId}/verify`, {
        session: otherSession,
      })
    ).status,
    403,
  );
  const workspace = await request("/api/workspace", { session: otherSession });
  assert.equal(workspace.data.events.length, 0);
});
test("tampering with clinical ciphertext or patient metadata is detected", async () => {
  const row = db.prepare("SELECT * FROM events WHERE id=?").get(recordId);
  assert.throws(() => eventData({ ...row, patient: other.id }));
  assert.throws(() =>
    eventData({ ...row, body: row.body.slice(0, -2) + "ff" }),
  );
  db.prepare("UPDATE events SET digest=? WHERE id=?").run(
    "a".repeat(64),
    recordId,
  );
  const result = await request(`/api/records/${recordId}/verify`, {
    session: patientSession,
  });
  assert.equal(result.data.valid, false);
  db.prepare("UPDATE events SET digest=? WHERE id=?").run(row.digest, recordId);
});
test("recovered pending anchors are idempotent and do not duplicate events on-chain", async () => {
  const count = await chain.contract.eventCount();
  db.prepare("UPDATE events SET status='pending' WHERE id=?").run(recordId);
  await flushPending();
  assert.equal(await chain.contract.eventCount(), count);
  assert.equal(
    db.prepare("SELECT status FROM events WHERE id=?").get(recordId).status,
    "confirmed",
  );
});
test("task completion enforces assignment and retains immutable history", async () => {
  const created = await request("/api/tasks", {
    method: "POST",
    session: docSession,
    body: {
      patient: patient.id,
      title: "Review care instructions",
      description: "Read the signed care plan.",
      due: "2026-12-01",
      assignee: "patient",
      priority: "Routine",
    },
  });
  assert.equal(created.status, 201);
  taskId = created.data.id;
  assert.equal(
    (
      await request(`/api/tasks/${taskId}/complete`, {
        method: "POST",
        body: {},
        session: docSession,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/api/tasks/${taskId}/complete`, {
        method: "POST",
        body: {},
        session: patientSession,
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request(`/api/tasks/${taskId}/complete`, {
        method: "POST",
        body: {},
        session: patientSession,
      })
    ).status,
    409,
  );
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM events WHERE id=?").get(taskId).n,
    1,
  );
});
test("appointment booking prevents overlapping slots and enforces doctor confirmation", async () => {
  const at = new Date(Date.now() + 86400000).toISOString();
  const body = {
    patient: patient.id,
    doctor: doctor.id,
    title: "Follow-up review",
    at,
    type: "In person",
  };
  const created = await request("/api/appointments", {
    method: "POST",
    body,
    session: patientSession,
  });
  assert.equal(created.status, 201);
  appointmentId = created.data.id;
  assert.equal(
    (
      await request("/api/appointments", {
        method: "POST",
        body,
        session: patientSession,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/api/appointments/${appointmentId}/confirm`, {
        method: "POST",
        body: {},
        session: patientSession,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/api/appointments/${appointmentId}/confirm`, {
        method: "POST",
        body: {},
        session: docSession,
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request(`/api/appointments/${appointmentId}/cancel`, {
        method: "POST",
        body: {},
        session: patientSession,
      })
    ).status,
    201,
  );
});
test("revoked consent immediately removes doctor access while preserving patient history", async () => {
  assert.equal(
    (
      await request("/api/access", {
        method: "POST",
        body: { doctor: doctor.id, active: false },
        session: patientSession,
      })
    ).status,
    201,
  );
  assert.equal(
    (await request(`/api/records/${recordId}/verify`, { session: docSession }))
      .status,
    403,
  );
  const doctorWorkspace = await request("/api/workspace", {
    session: docSession,
  });
  assert.equal(doctorWorkspace.data.events.length, 0);
  const patientWorkspace = await request("/api/workspace", {
    session: patientSession,
  });
  assert.ok(patientWorkspace.data.events.some((e) => e.id === recordId));
});
test("contract rejects unauthorized writes, duplicate IDs and zero commitments", async () => {
  const signer = await chain.provider.getSigner();
  const wallet = Wallet.createRandom().connect(chain.provider);
  await (
    await signer.sendTransaction({ to: wallet.address, value: 10n ** 18n })
  ).wait();
  const contract = chain.contract;
  const id = "0x" + "12".repeat(32),
    digest = "0x" + "34".repeat(32);
  await assert.rejects(contract.connect(wallet).anchor(id, digest));
  await (await contract.anchor(id, digest)).wait();
  await assert.rejects(contract.anchor(id, digest));
  await assert.rejects(contract.anchor("0x" + "00".repeat(32), digest));
  const isolated = await new ContractFactory(
    artifact.abi,
    artifact.evm.bytecode.object,
    signer,
  ).deploy();
  await isolated.waitForDeployment();
  assert.equal(await isolated.eventCount(), 0n);
});
test("network endpoint returns actual block data and session logout invalidates access", async () => {
  const result = await request("/api/network", { session: patientSession });
  assert.equal(result.status, 200);
  assert.equal(result.data.chainId, 1337);
  assert.ok(result.data.height > 0);
  assert.ok(result.data.blocks[0].hash.startsWith("0x"));
  assert.equal(result.data.peerCount, 0);
  assert.equal(
    (
      await request("/api/auth/logout", {
        method: "POST",
        body: {},
        session: otherSession,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/api/workspace", { session: otherSession })).status,
    401,
  );
});
