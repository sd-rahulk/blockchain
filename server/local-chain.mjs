import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import { Mnemonic, JsonRpcProvider } from "ethers";
import { config, dataDir } from "./config.mjs";
const require = createRequire(import.meta.url);
export async function startLocalChain() {
  const platform = { win32: "win32", linux: "linux", darwin: "darwin" }[
    process.platform
  ];
  const arch = { x64: "amd64", arm64: "arm64" }[process.arch];
  if (!platform || !arch)
    throw new Error(
      "Unsupported local Anvil platform. Configure a Sepolia RPC instead.",
    );
  const pkg = require.resolve(
    `@foundry-rs/anvil-${platform}-${arch}/package.json`,
  );
  const executable = path.join(
    path.dirname(pkg),
    "bin",
    platform === "win32" ? "anvil.exe" : "anvil",
  );
  const port = await new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
  const processHandle = spawn(
    executable,
    [
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--chain-id",
      "1337",
      "--accounts",
      "1",
      "--mnemonic",
      Mnemonic.entropyToPhrase(`0x${config.chainSeed}`),
      "--state",
      path.join(dataDir, "anvil-state.json"),
      "--state-interval",
      "1",
      "--preserve-historical-states",
      "--silent",
    ],
    { stdio: "ignore", windowsHide: true },
  );
  let failed;
  processHandle.once("error", (error) => {
    failed = error;
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (failed || processHandle.exitCode !== null)
      throw new Error(
        "Local Anvil could not start. Reinstall dependencies or configure Sepolia.",
      );
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      });
      if (response.ok)
        return {
          provider: new JsonRpcProvider(url, undefined, {
            cacheTimeout: 0,
            pollingInterval: 200,
          }),
          processHandle,
        };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  processHandle.kill();
  throw new Error("Local Anvil startup timed out.");
}
export async function stopLocalChain(processHandle) {
  if (!processHandle) return;
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const exit = new Promise((resolve) => processHandle.once("exit", resolve));
  processHandle.kill();
  await Promise.race([
    exit,
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
}
