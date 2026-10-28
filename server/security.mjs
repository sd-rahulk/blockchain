import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  createHmac,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { config } from "./config.mjs";
const scrypt = promisify(scryptCallback);
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const emailKey = (email) =>
  createHmac("sha256", config.lookupKey)
    .update(email.trim().toLowerCase())
    .digest("hex");
export function encrypt(value, context) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", config.dataKey, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    ciphertext.toString("hex"),
  ].join(".");
}
export function decrypt(value, context) {
  const [iv, tag, ciphertext] = value.split(".");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    config.dataKey,
    Buffer.from(iv, "hex"),
  );
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(Buffer.from(tag, "hex"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(ciphertext, "hex")),
      cipher.final(),
    ]).toString(),
  );
}
export async function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `${salt}:${derived.toString("hex")}`;
}
export async function passwordMatches(password, stored) {
  const [salt, key] = stored.split(":");
  const derived = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return timingSafeEqual(derived, Buffer.from(key, "hex"));
}
export const token = () => randomBytes(32).toString("hex");
