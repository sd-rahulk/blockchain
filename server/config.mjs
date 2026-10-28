import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
export const production = process.env.NODE_ENV === "production";
export const dataDir = path.resolve(process.env.DATA_DIR || "data");
mkdirSync(dataDir, { recursive: true });
if (
  !process.env.DATA_KEY ||
  !process.env.LOOKUP_KEY ||
  !process.env.CHAIN_SEED
) {
  if (production)
    throw new Error("Production requires DATA_KEY, LOOKUP_KEY and CHAIN_SEED.");
  const envPath = path.resolve(".env");
  if (existsSync(envPath))
    throw new Error(
      ".env is missing required secrets. Restore DATA_KEY, LOOKUP_KEY and CHAIN_SEED before starting.",
    );
  const values = {
    DATA_KEY: randomBytes(32).toString("hex"),
    LOOKUP_KEY: randomBytes(32).toString("hex"),
    CHAIN_SEED: randomBytes(32).toString("hex"),
  };
  writeFileSync(
    envPath,
    Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
    { mode: 0o600, flag: "wx" },
  );
  Object.assign(process.env, values);
}
for (const name of ["DATA_KEY", "LOOKUP_KEY", "CHAIN_SEED"])
  if (!/^[a-f0-9]{64}$/i.test(process.env[name]))
    throw new Error(`${name} must contain 32 random bytes as hexadecimal.`);
export const config = {
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || "127.0.0.1",
  origin: process.env.APP_ORIGIN || "http://localhost:5173",
  dataKey: Buffer.from(process.env.DATA_KEY, "hex"),
  lookupKey: process.env.LOOKUP_KEY,
  chainSeed: process.env.CHAIN_SEED,
  rpc: process.env.RPC_URL,
  privateKey: process.env.OPERATOR_PRIVATE_KEY,
  contract: process.env.CONTRACT_ADDRESS,
  confirmations: Number(
    process.env.CHAIN_CONFIRMATIONS || (production ? 3 : 1),
  ),
};
if (
  production &&
  (!config.rpc || !config.privateKey || !config.origin.startsWith("https://"))
)
  throw new Error(
    "Production requires RPC_URL, OPERATOR_PRIVATE_KEY, and an HTTPS APP_ORIGIN.",
  );
if (config.rpc && !config.privateKey)
  throw new Error("OPERATOR_PRIVATE_KEY is required with RPC_URL.");
if (!Number.isInteger(config.confirmations) || config.confirmations < 1)
  throw new Error("CHAIN_CONFIRMATIONS must be a positive integer.");
