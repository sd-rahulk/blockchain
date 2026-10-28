import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import path from "node:path";
import { existsSync } from "node:fs";
import { config, production } from "./config.mjs";
import {
  db,
  createUser,
  getUser,
  publicUser,
  accessiblePatients,
  hasAccess,
  listEvents,
  eventData,
  addEvent,
  auditRead,
} from "./db.mjs";
import {
  emailKey,
  passwordMatches,
  token,
  hash,
  passwordHash,
} from "./security.mjs";
import { flushPending, networkState, verifyEvent } from "./chain.mjs";
export const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
    strictTransportSecurity: production ? undefined : false,
  }),
);
app.use(express.json({ limit: "128kb" }));
app.use(cookieParser());
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    const allowed = [
      config.origin,
      ...(!production
        ? [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
          ]
        : []),
    ];
    if (origin && !allowed.includes(origin))
      return res.status(403).json({ error: "Request origin is not allowed." });
    if (production && !origin)
      return res
        .status(403)
        .json({ error: "A same-origin browser request is required." });
  }
  next();
});
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 240,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Try again in a minute." },
  }),
);
const authLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again in 15 minutes." },
});
const credentials = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(128),
});
const name = z.string().trim().min(2).max(100);
const text = z.string().trim().min(2).max(10000);
const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};
const sessionCookie = production ? "__Host-careledger" : "careledger";
const cookieOptions = {
  httpOnly: true,
  secure: production,
  sameSite: "strict",
  path: "/",
  maxAge: 8 * 60 * 60 * 1000,
};
function startSession(user, res) {
  const raw = token(),
    csrf = token();
  db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
    hash(raw),
    user.id,
    csrf,
    Date.now() + cookieOptions.maxAge,
  );
  res.cookie(sessionCookie, raw, cookieOptions);
  return { user, csrf };
}
function auth(req, res, next) {
  const session = db
    .prepare("SELECT * FROM sessions WHERE token=? AND expires>?")
    .get(hash(req.cookies[sessionCookie] || ""), Date.now());
  if (!session) return res.status(401).json({ error: "Sign in to continue." });
  req.user = getUser(session.user_id);
  req.session = session;
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.get("x-csrf-token") !== session.csrf
  )
    return res
      .status(403)
      .json({ error: "Your security token has expired. Refresh the page." });
  next();
}
function access(req, patient) {
  if (!hasAccess(req.user, patient))
    fail(403, "This patient has not granted you access.");
}
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.post("/api/auth/register", authLimit, async (req, res) => {
  const value = credentials.extend({ name }).parse(req.body);
  if (
    db
      .prepare("SELECT 1 FROM users WHERE email_key=?")
      .get(emailKey(value.email))
  )
    fail(409, "An account with this email already exists.");
  const user = await createUser({ ...value, role: "patient" });
  res.status(201).json(startSession(user, res));
});
let dummyHash;
app.post("/api/auth/login", authLimit, async (req, res) => {
  const value = credentials.parse(req.body);
  const row = db
    .prepare("SELECT * FROM users WHERE email_key=?")
    .get(emailKey(value.email));
  dummyHash ||= await passwordHash(token());
  const valid = await passwordMatches(
    value.password,
    row?.password || dummyHash,
  );
  if (!row || !valid) fail(401, "Email or password is incorrect.");
  db.prepare("DELETE FROM sessions WHERE expires<=?").run(Date.now());
  res.json(startSession(publicUser(row), res));
});
app.get("/api/auth/me", auth, (req, res) =>
  res.json({ user: req.user, csrf: req.session.csrf }),
);
app.post("/api/auth/logout", auth, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token=?").run(req.session.token);
  res.clearCookie(sessionCookie, cookieOptions);
  res.json({ ok: true });
});
app.get("/api/workspace", auth, (req, res) => {
  auditRead(req.user.id, "workspace");
  const people = accessiblePatients(req.user);
  const doctors = db
    .prepare("SELECT * FROM users WHERE role='doctor'")
    .all()
    .map((row) => {
      const u = publicUser(row);
      return {
        id: u.id,
        name: u.name,
        specialty: u.specialty,
        granted:
          req.user.role === "patient"
            ? !!db
                .prepare(
                  "SELECT 1 FROM grants WHERE patient=? AND doctor=? AND active=1",
                )
                .get(req.user.id, u.id)
            : true,
      };
    });
  res.json({
    patients: people,
    doctors,
    events: listEvents(req.user),
    evaluation: !!db
      .prepare("SELECT 1 FROM metadata WHERE key='evaluation'")
      .get(),
  });
});
app.post("/api/access", auth, async (req, res) => {
  if (req.user.role !== "patient")
    fail(403, "Only patients can change access.");
  const { doctor, active } = z
    .object({ doctor: z.uuid(), active: z.boolean() })
    .parse(req.body);
  if (getUser(doctor)?.role !== "doctor") fail(404, "Doctor not found.");
  let event;
  db.exec("BEGIN IMMEDIATE");
  try {
    event = addEvent(req.user, req.user.id, "access.changed", {
      doctor,
      active,
    });
    db.prepare(
      "INSERT INTO grants VALUES(?,?,?) ON CONFLICT(patient,doctor) DO UPDATE SET active=excluded.active",
    ).run(req.user.id, doctor, Number(active));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  void flushPending().catch(() => console.error("Anchor worker failed"));
  res.status(201).json(event);
});
app.post("/api/records", auth, async (req, res) => {
  if (req.user.role !== "doctor")
    fail(403, "Only verified doctors can author medical records.");
  const v = z
    .object({
      patient: z.uuid(),
      title: name,
      category: z.enum([
        "Consultation",
        "Lab report",
        "Prescription",
        "Discharge summary",
      ]),
      content: text,
    })
    .parse(req.body);
  access(req, v.patient);
  const event = addEvent(req.user, v.patient, "record.created", {
    title: v.title,
    category: v.category,
    content: v.content,
    author: req.user.name,
  });
  void flushPending().catch(() => console.error("Anchor worker failed"));
  res.status(201).json(event);
});
app.get("/api/records/:id/verify", auth, async (req, res) => {
  const row = db.prepare("SELECT * FROM events WHERE id=?").get(req.params.id);
  if (!row) fail(404, "Record not found.");
  access(req, row.patient);
  auditRead(req.user.id, `verify:${row.id}`);
  res.json(await verifyEvent(row));
});
app.post("/api/tasks", auth, async (req, res) => {
  const v = z
    .object({
      patient: z.uuid(),
      title: name,
      description: z.string().trim().max(3000).default(""),
      due: z.iso.date(),
      assignee: z.enum(["doctor", "patient"]),
      priority: z.enum(["Routine", "High"]).default("Routine"),
    })
    .parse(req.body);
  access(req, v.patient);
  if (req.user.role === "patient" && v.assignee !== "patient")
    fail(403, "You can create tasks for yourself.");
  const event = addEvent(req.user, v.patient, "task.created", v);
  void flushPending().catch(() => console.error("Anchor worker failed"));
  res.status(201).json(event);
});
app.post("/api/tasks/:id/complete", auth, async (req, res) => {
  const rows = listEvents(req.user);
  const task = rows.find(
    (e) => e.id === req.params.id && e.kind === "task.created",
  );
  if (!task) fail(404, "Task not found.");
  if (task.payload.assignee !== req.user.role)
    fail(403, "Only the assigned role can complete this task.");
  if (
    rows.some(
      (e) => e.kind === "task.completed" && e.payload.taskId === task.id,
    )
  )
    fail(409, "This task is already complete.");
  const event = addEvent(req.user, task.patient, "task.completed", {
    taskId: task.id,
    title: task.payload.title,
  });
  void flushPending().catch(() => console.error("Anchor worker failed"));
  res.status(201).json(event);
});
app.post("/api/appointments", auth, async (req, res) => {
  const v = z
    .object({
      patient: z.uuid(),
      doctor: z.uuid(),
      title: name,
      at: z.iso.datetime({ offset: true }),
      type: z.enum(["In person", "Video consultation"]),
    })
    .parse(req.body);
  access(req, v.patient);
  if (req.user.role === "doctor" && v.doctor !== req.user.id)
    fail(403, "Select yourself as the clinician.");
  const doctor = getUser(v.doctor);
  if (
    doctor?.role !== "doctor" ||
    !db
      .prepare("SELECT 1 FROM grants WHERE patient=? AND doctor=? AND active=1")
      .get(v.patient, v.doctor)
  )
    fail(403, "Grant this doctor access before booking.");
  if (new Date(v.at).getTime() < Date.now() - 60000)
    fail(400, "Choose a future appointment time.");
  const events = db
    .prepare("SELECT * FROM events WHERE kind LIKE 'appointment.%'")
    .all()
    .map(eventData);
  const conflict = events.some(
    (e) =>
      e.kind === "appointment.created" &&
      e.payload.doctor === v.doctor &&
      Math.abs(new Date(e.payload.at) - new Date(v.at)) < 30 * 60000 &&
      !events.some(
        (s) =>
          s.kind === "appointment.cancelled" &&
          s.payload.appointmentId === e.id,
      ),
  );
  if (conflict)
    fail(
      409,
      "This doctor already has an appointment within 30 minutes. Choose another time.",
    );
  const event = addEvent(req.user, v.patient, "appointment.created", {
    ...v,
    doctorName: doctor.name,
    patientName: getUser(v.patient).name,
  });
  void flushPending().catch(() => console.error("Anchor worker failed"));
  res.status(201).json(event);
});
app.post("/api/appointments/:id/:action", auth, async (req, res) => {
  const { action } = z
    .object({ action: z.enum(["confirm", "cancel"]) })
    .parse(req.params);
  const rows = listEvents(req.user);
  const appointment = rows.find(
    (e) => e.id === req.params.id && e.kind === "appointment.created",
  );
  if (!appointment) fail(404, "Appointment not found.");
  if (req.user.role === "doctor" && appointment.payload.doctor !== req.user.id)
    fail(403, "Only the assigned doctor can change this appointment.");
  if (action === "confirm" && req.user.role !== "doctor")
    fail(403, "The doctor must confirm the appointment.");
  if (
    rows.some(
      (e) =>
        e.kind === "appointment.cancelled" &&
        e.payload.appointmentId === appointment.id,
    )
  )
    fail(409, "This appointment is cancelled.");
  if (
    action === "confirm" &&
    rows.some(
      (e) =>
        e.kind === "appointment.confirmed" &&
        e.payload.appointmentId === appointment.id,
    )
  )
    fail(409, "This appointment is already confirmed.");
  const event = addEvent(
    req.user,
    appointment.patient,
    action === "confirm" ? "appointment.confirmed" : "appointment.cancelled",
    { appointmentId: appointment.id, title: appointment.payload.title },
  );
  void flushPending().catch(() => console.error("Anchor worker failed"));
  res.status(201).json(event);
});
app.get("/api/network", auth, async (_req, res) =>
  res.json(await networkState()),
);
app.get("/api/export", auth, (req, res) => {
  auditRead(req.user.id, "export");
  res
    .set(
      "Content-Disposition",
      'attachment; filename="careledger-records.json"',
    )
    .json({
      exportedAt: new Date().toISOString(),
      user: req.user,
      events: listEvents(req.user),
    });
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "API endpoint not found." }),
);
const dist = path.resolve("dist");
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false }));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(dist, "index.html")),
  );
}
app.use((error, _req, res, _next) => {
  if (error instanceof z.ZodError)
    return res.status(400).json({
      error: error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    });
  if (error.type === "entity.parse.failed")
    return res.status(400).json({ error: "Invalid JSON request." });
  if (error.type === "entity.too.large")
    return res.status(413).json({ error: "Request exceeds the 128 KB limit." });
  if (!error.status) console.error("Request failed:", error.code || error.name);
  res.status(error.status || 500).json({
    error: error.status
      ? error.message
      : "The request could not be completed. Please try again.",
  });
});
