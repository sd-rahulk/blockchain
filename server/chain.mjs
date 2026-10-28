import { readFileSync } from "node:fs";
import solc from "solc";
import {
  JsonRpcProvider,
  Wallet,
  NonceManager,
  Contract,
  ContractFactory,
  ZeroHash,
  id as ethereumId,
} from "ethers";
import { startLocalChain, stopLocalChain } from "./local-chain.mjs";
import { config, production } from "./config.mjs";
import { db, hashEnvelope } from "./db.mjs";
let provider,
  contract,
  embedded,
  inFlight = null,
  lastError = null;
const output = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: {
        "CareLedger.sol": {
          content: readFileSync(
            new URL("../contracts/CareLedger.sol", import.meta.url),
            "utf8",
          ),
        },
      },
      settings: {
        evmVersion: "shanghai",
        optimizer: { enabled: true, runs: 200 },
        outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      },
    }),
  ),
);
if (output.errors?.some((e) => e.severity === "error"))
  throw new Error(output.errors.map((e) => e.formattedMessage).join("\n"));
export const artifact = output.contracts["CareLedger.sol"].CareLedger;
export const chainEventId = (id) => ethereumId(id);
export async function initChain() {
  let signer;
  if (config.rpc) {
    provider = new JsonRpcProvider(config.rpc, undefined, { cacheTimeout: 0 });
    signer = new NonceManager(new Wallet(config.privateKey, provider));
  } else {
    if (production) throw new Error("Local chain is disabled in production.");
    const local = await startLocalChain();
    provider = local.provider;
    embedded = local.processHandle;
    signer = await provider.getSigner();
  }
  const network = await provider.getNetwork();
  const savedChain = db
    .prepare("SELECT value FROM metadata WHERE key='chain_id'")
    .get()?.value;
  const priorContract = db
    .prepare(
      "SELECT key FROM metadata WHERE key LIKE 'contract:%' AND key NOT LIKE '%:start' LIMIT 1",
    )
    .get()?.key;
  const priorChain = savedChain || priorContract?.split(":")[1];
  if (priorChain && BigInt(priorChain) !== network.chainId)
    throw new Error(
      "This data directory belongs to a different chain. Use a fresh DATA_DIR for Sepolia; confirmed events cannot move between networks.",
    );
  db.prepare("INSERT OR IGNORE INTO metadata VALUES('chain_id',?)").run(
    String(network.chainId),
  );
  if (
    config.rpc &&
    network.chainId !== BigInt(process.env.CHAIN_ID || "11155111")
  )
    throw new Error(
      "RPC chain ID does not match CHAIN_ID (Sepolia 11155111 by default).",
    );
  const key = `contract:${network.chainId}`;
  const address =
    config.contract ||
    db.prepare("SELECT value FROM metadata WHERE key=?").get(key)?.value;
  if (address) {
    if ((await provider.getCode(address)) === "0x")
      throw new Error(
        "Saved contract has no deployed code. Check network and data directory.",
      );
    contract = new Contract(address, artifact.abi, signer);
  } else {
    contract = await new ContractFactory(
      artifact.abi,
      artifact.evm.bytecode.object,
      signer,
    ).deploy();
    await contract.waitForDeployment();
    db.prepare("INSERT OR REPLACE INTO metadata VALUES(?,?)").run(
      key,
      await contract.getAddress(),
    );
    const deployment = await contract.deploymentTransaction().wait();
    db.prepare("INSERT OR REPLACE INTO metadata VALUES(?,?)").run(
      `${key}:start`,
      String(deployment.blockNumber),
    );
  }
  if (
    (await contract.operator()).toLowerCase() !==
    (await signer.getAddress()).toLowerCase()
  )
    throw new Error("Operator key does not match the deployed contract.");
  await flushPending();
  return { provider, contract };
}
export function flushPending() {
  if (!contract) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = processPending().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
async function processPending() {
  const processed = new Set();
  while (true) {
    const batch = db
      .prepare("SELECT * FROM events WHERE status='pending' ORDER BY rowid")
      .all()
      .filter((row) => !processed.has(row.id));
    if (!batch.length) break;
    for (const row of batch) {
      processed.add(row.id);
      try {
        if (
          hashEnvelope(
            row.id,
            row.kind,
            row.actor,
            row.patient,
            row.created,
            row.body,
          ) !== row.digest
        )
          throw new Error("Local commitment integrity failure");
        const eventId = chainEventId(row.id);
        const existing = await contract.commitments(eventId);
        let tx, block;
        if (existing !== ZeroHash) {
          if (existing !== `0x${row.digest}`)
            throw new Error("On-chain digest mismatch");
          const head = await provider.getBlockNumber();
          const receipt = row.tx
            ? await provider.getTransactionReceipt(row.tx)
            : null;
          if (receipt?.status === 1) {
            tx = receipt.hash;
            block = receipt.blockNumber;
          } else {
            const network = await provider.getNetwork();
            const first = Number(
              db
                .prepare("SELECT value FROM metadata WHERE key=?")
                .get(`contract:${network.chainId}:start`)?.value ||
                process.env.CONTRACT_DEPLOYMENT_BLOCK ||
                0,
            );
            for (let end = head; end >= first; end -= 2000) {
              const logs = await contract.queryFilter(
                contract.filters.Anchored(eventId),
                Math.max(first, end - 1999),
                end,
              );
              const log = logs.at(-1);
              if (log) {
                tx = log.transactionHash;
                block = log.blockNumber;
                break;
              }
            }
          }
          if (!tx) throw new Error("Anchor receipt unavailable");
          if (head - block + 1 < config.confirmations) continue;
        } else {
          if (row.tx) {
            const pending = await provider.getTransaction(row.tx);
            if (pending && pending.blockNumber === null) continue;
            if (
              !pending &&
              Date.now() - new Date(row.created).getTime() < 120000
            )
              continue;
          }
          const sent = await contract.anchor(eventId, `0x${row.digest}`);
          db.prepare("UPDATE events SET tx=? WHERE id=?").run(
            sent.hash,
            row.id,
          );
          const receipt = await sent.wait(config.confirmations, 30000);
          if (!receipt || receipt.status !== 1)
            throw new Error("Transaction not confirmed");
          tx = receipt.hash;
          block = receipt.blockNumber;
        }
        db.prepare(
          "UPDATE events SET status='confirmed',tx=?,block=?,error=NULL WHERE id=?",
        ).run(tx, block, row.id);
        lastError = null;
      } catch (error) {
        contract.runner.reset?.();
        lastError = "Blockchain anchoring needs attention";
        db.prepare("UPDATE events SET error=? WHERE id=?").run(
          String(error.message).slice(0, 500),
          row.id,
        );
      }
    }
  }
}
export async function verifyEvent(row) {
  const actual = hashEnvelope(
    row.id,
    row.kind,
    row.actor,
    row.patient,
    row.created,
    row.body,
  );
  const onchain = await contract.commitments(chainEventId(row.id));
  return {
    valid: actual === row.digest && onchain === `0x${actual}`,
    localValid: actual === row.digest,
    onchainDigest: onchain,
    eventId: chainEventId(row.id),
    digest: `0x${actual}`,
    tx: row.tx,
    block: row.block,
    status: row.status,
  };
}
export async function networkState() {
  const network = await provider.getNetwork();
  const height = await provider.getBlockNumber();
  const blocks = await Promise.all(
    Array.from({ length: Math.min(height + 1, 10) }, (_, i) =>
      provider.getBlock(height - i),
    ),
  );
  const total = Number(await contract.eventCount());
  return {
    chainId: Number(network.chainId),
    name: config.rpc
      ? "Connected EVM network"
      : "Local EVM development network",
    mode: config.rpc ? "external" : "local",
    height,
    total,
    contract: await contract.getAddress(),
    operator: await contract.operator(),
    peerCount: config.rpc
      ? await provider
          .send("net_peerCount", [])
          .then((v) => parseInt(v, 16))
          .catch(() => null)
      : 0,
    confirmations: config.confirmations,
    error: lastError,
    pending: db
      .prepare("SELECT count(*) AS n FROM events WHERE status='pending'")
      .get().n,
    blocks: blocks.filter(Boolean).map((b) => ({
      number: b.number,
      hash: b.hash,
      parentHash: b.parentHash,
      timestamp: b.timestamp,
      transactions: b.transactions,
      gasUsed: b.gasUsed.toString(),
    })),
  };
}
export async function closeChain() {
  await inFlight;
  await stopLocalChain(embedded);
  await provider?.destroy();
}
