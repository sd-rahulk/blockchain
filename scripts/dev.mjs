import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["server/index.mjs"], {
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
    stdio: "inherit",
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (children[0].connected) children[0].send("shutdown");
  else children[0].kill();
  children[1].kill();
  setTimeout(() => children[0].kill(), 12000).unref();
  process.exitCode = code;
}
for (const child of children) child.on("exit", (code) => stop(code || 0));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
