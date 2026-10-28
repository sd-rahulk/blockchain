import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDir } from "./config.mjs";
import { encrypt, decrypt, emailKey, passwordHash } from "./security.mjs";
export const db = new DatabaseSync(path.join(dataDir, "careledger.sqlite"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email_key TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('doctor','patient')), profile TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS grants(patient TEXT NOT NULL REFERENCES users(id), doctor TEXT NOT NULL REFERENCES users(id), active INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(patient,doctor));
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,kind TEXT NOT NULL,actor TEXT NOT NULL REFERENCES users(id),patient TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,digest TEXT NOT NULL,created TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',tx TEXT,block INTEGER,error TEXT);
CREATE INDEX IF NOT EXISTS events_patient ON events(patient,created);
CREATE INDEX IF NOT EXISTS events_status ON events(status);
CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS access_log(id TEXT PRIMARY KEY,actor TEXT NOT NULL,resource TEXT NOT NULL,created TEXT NOT NULL);
`);
export const publicUser = (row) =>
  row ? { id: row.id, role: row.role, ...decrypt(row.profile, row.id) } : null;
export function getUser(id) {
  return publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(id));
}
export async function createUser({
  name,
  email,
  password,
  role,
  specialty = "",
}) {
  const id = randomUUID();
  const created = new Date().toISOString();
  db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)").run(
    id,
    emailKey(email),
    await passwordHash(password),
    role,
    encrypt({ name, email: email.toLowerCase(), specialty }, id),
    created,
  );
  return getUser(id);
}
export function hasAccess(user, patient) {
  return user.role === "patient"
    ? user.id === patient
    : !!db
        .prepare(
          "SELECT 1 FROM grants WHERE patient=? AND doctor=? AND active=1",
        )
        .get(patient, user.id);
}
export function accessiblePatients(user) {
  if (user.role === "patient") return [user];
  return db
    .prepare(
      "SELECT u.* FROM users u JOIN grants g ON u.id=g.patient WHERE g.doctor=? AND g.active=1",
    )
    .all(user.id)
    .map(publicUser);
}
const eventContext = (row) =>
  JSON.stringify({
    id: row.id,
    kind: row.kind,
    actor: row.actor,
    patient: row.patient,
    created: row.created,
  });
export function eventData(row) {
  return {
    ...row,
    ...decrypt(row.body, eventContext(row)),
    body: undefined,
    error: row.error
      ? "Blockchain confirmation pending; automatic retry is active."
      : null,
  };
}
export function listEvents(user) {
  const patients = accessiblePatients(user).map((p) => p.id);
  if (!patients.length) return [];
  return db
    .prepare(
      `SELECT * FROM events WHERE patient IN (${patients.map(() => "?").join(",")}) ORDER BY created DESC,rowid DESC`,
    )
    .all(...patients)
    .map(eventData);
}
export function addEvent(user, patient, kind, payload) {
  const id = randomUUID().replaceAll("-", "");
  const created = new Date().toISOString();
  const body = encrypt(
    { payload },
    eventContext({ id, kind, actor: user.id, patient, created }),
  );
  const digest = hashEnvelope(id, kind, user.id, patient, created, body);
  db.prepare(
    "INSERT INTO events(id,kind,actor,patient,body,digest,created) VALUES(?,?,?,?,?,?,?)",
  ).run(id, kind, user.id, patient, body, digest, created);
  return eventData(db.prepare("SELECT * FROM events WHERE id=?").get(id));
}
import { hash } from "./security.mjs";
export const hashEnvelope = (id, kind, actor, patient, created, body) =>
  hash(JSON.stringify({ id, kind, actor, patient, created, body }));
export function auditRead(actor, resource) {
  db.prepare("INSERT INTO access_log VALUES(?,?,?,?)").run(
    randomUUID(),
    actor,
    resource,
    new Date().toISOString(),
  );
}
