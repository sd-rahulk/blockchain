import { readFileSync, writeFileSync } from "node:fs";
import { JsonRpcProvider, Wallet, formatEther } from "ethers";
import { ask, secret } from "./prompts.mjs";
await import("../server/config.mjs");
const rpc = await ask("Sepolia HTTPS RPC URL: ");
if (!rpc.startsWith("https://")) throw new Error("Use an HTTPS RPC endpoint.");
const privateKey = await secret("Operator private key (input hidden): ");
const provider = new JsonRpcProvider(rpc);
try {
  const network = await provider.getNetwork();
  if (network.chainId !== 11155111n)
    throw new Error("This RPC endpoint is not Ethereum Sepolia.");
  const wallet = new Wallet(privateKey, provider);
  const balance = await provider.getBalance(wallet.address);
  if (balance === 0n)
    throw new Error(
      "Fund the operator address with Sepolia test ETH before configuring.",
    );
  const origin =
    (await ask("App origin (press Enter for http://localhost:5173): ")) ||
    "http://localhost:5173";
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin)
    throw new Error("Enter an origin without a trailing slash or path.");
  const directory =
    (await ask("Sepolia data directory (press Enter for data/sepolia): ")) ||
    "data/sepolia";
  let env = readFileSync(".env", "utf8");
  for (const [key, value] of Object.entries({
    RPC_URL: rpc,
    OPERATOR_PRIVATE_KEY: privateKey,
    CHAIN_ID: "11155111",
    CHAIN_CONFIRMATIONS: "3",
    APP_ORIGIN: origin,
    DATA_DIR: directory,
  })) {
    if (/[\r\n]/.test(value))
      throw new Error("Configuration values must be single-line.");
    env = env.replace(new RegExp(`^${key}=.*(?:\\r?\\n|$)`, "gm"), "");
    env += `${key}=${value}\n`;
  }
  writeFileSync(".env", env, { mode: 0o600 });
  console.log(
    `Sepolia configured. Operator ${wallet.address}, balance ${formatEther(balance)} test ETH. Restart the app to deploy or reuse its contract.`,
  );
} finally {
  provider.destroy();
}
