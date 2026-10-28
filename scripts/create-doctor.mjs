import { ask, secret } from "./prompts.mjs";
import { createUser, db } from "../server/db.mjs";
import { z } from "zod";
const name = await ask("Verified clinician full name: "),
  email = await ask("Email address: "),
  specialty = await ask("Clinical specialty: "),
  password = await secret(
    "Initial password, 12–128 characters (input hidden): ",
  );
const input = z
  .object({
    name: z.string().min(2).max(100),
    email: z.email(),
    specialty: z.string().min(2).max(100),
    password: z.string().min(12).max(128),
  })
  .parse({ name, email, specialty, password });
try {
  const user = await createUser({ ...input, role: "doctor" });
  console.log(
    `Clinician provisioned: ${user.name} (${user.id}). Share the credentials through your clinic's secure onboarding channel.`,
  );
} finally {
  db.close();
}
