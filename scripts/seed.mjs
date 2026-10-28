import { production, config } from "../server/config.mjs";
import { db, createUser, addEvent } from "../server/db.mjs";
import { emailKey } from "../server/security.mjs";
import { initChain, flushPending, closeChain } from "../server/chain.mjs";
if (production || config.rpc)
  throw new Error(
    "Synthetic evaluation seed is restricted to the local development chain.",
  );
if (
  db
    .prepare("SELECT 1 FROM users WHERE email_key=?")
    .get(emailKey("doctor@careledger.test"))
)
  throw new Error(
    "Evaluation accounts already exist. Seed is intentionally not repeated.",
  );
await initChain();
db.prepare("INSERT INTO metadata VALUES('evaluation','true')").run();
const password = "CareLedger!Demo2026";
const doctor = await createUser({
  name: "Dr. Olivia Bennett",
  email: "doctor@careledger.test",
  password,
  role: "doctor",
  specialty: "Internal Medicine",
});
const patients = [];
for (const [name, email] of [
  ["Alex Morgan", "patient@careledger.test"],
  ["Emma Wilson", "emma@careledger.test"],
  ["James Anderson", "james@careledger.test"],
  ["Sophia Chen", "sophia@careledger.test"],
]) {
  const patient = await createUser({ name, email, password, role: "patient" });
  patients.push(patient);
  db.prepare("INSERT INTO grants VALUES(?,?,1)").run(patient.id, doctor.id);
  addEvent(patient, patient.id, "access.changed", {
    doctor: doctor.id,
    active: true,
  });
}
for (const [i, patient] of patients.entries()) {
  addEvent(doctor, patient.id, "record.created", {
    title: [
      "Annual wellness consultation",
      "Complete blood count review",
      "Medication review",
      "Follow-up care summary",
    ][i],
    category: ["Consultation", "Lab report", "Prescription", "Consultation"][i],
    content: [
      "Synthetic evaluation record. Annual wellness review completed. Patient reports regular activity and no new concerns. Preventive screening schedule discussed. Plan: continue current routine and arrange routine blood work before the next appointment.",
      "Synthetic evaluation record. Complete blood count reviewed with the patient. Results and relevant trends discussed in context of clinical history. Plan: monitor symptoms and review follow-up testing at the next consultation.",
      "Synthetic evaluation record. Medication list reconciled during consultation. Patient confirmed current regimen and discussed adherence. No prescription is issued by this evaluation system. Plan: follow the verified treating clinician’s instructions.",
      "Synthetic evaluation record. Follow-up review of the prior care plan completed. Questions addressed and next steps agreed with the patient. Plan: maintain the care diary and contact the clinic if symptoms change.",
    ][i],
    author: doctor.name,
  });
  const at = new Date();
  at.setHours(9 + i, 0, 0, 0);
  if (at < Date.now()) at.setDate(at.getDate() + 1);
  const appointment = addEvent(patient, patient.id, "appointment.created", {
    title: [
      "Annual health check-up",
      "Blood work follow-up",
      "Medication consultation",
      "Routine follow-up",
    ][i],
    doctor: doctor.id,
    doctorName: doctor.name,
    patientName: patient.name,
    patient: patient.id,
    at: at.toISOString(),
    type: i % 2 ? "Video consultation" : "In person",
  });
  if (i !== 2)
    addEvent(doctor, patient.id, "appointment.confirmed", {
      appointmentId: appointment.id,
      title: appointment.payload.title,
    });
}
const due = new Date().toISOString().slice(0, 10);
addEvent(doctor, patients[0].id, "task.created", {
  title: "Review the wellness care plan",
  description:
    "Check the preventive screening schedule before your next visit.",
  due,
  assignee: "patient",
  priority: "Routine",
});
addEvent(doctor, patients[1].id, "task.created", {
  title: "Review follow-up laboratory notes",
  description: "Read the latest blood work review and document the next step.",
  due,
  assignee: "doctor",
  priority: "High",
});
addEvent(doctor, patients[2].id, "task.created", {
  title: "Complete medication reconciliation",
  description: "Confirm the current medication list with the patient.",
  due,
  assignee: "doctor",
  priority: "Routine",
});
addEvent(doctor, patients[3].id, "task.created", {
  title: "Prepare the follow-up care plan",
  description: "Summarize the agreed next steps before the scheduled visit.",
  due,
  assignee: "doctor",
  priority: "Routine",
});
await flushPending();
await closeChain();
db.close();
console.log(
  "Synthetic evaluation data created.\nDoctor: doctor@careledger.test\nPatient: patient@careledger.test\nLocal evaluation password: CareLedger!Demo2026\nDo not use these accounts for real patient data.",
);
