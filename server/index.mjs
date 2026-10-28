import { app } from "./app.mjs";
import { initChain, flushPending, closeChain } from "./chain.mjs";
import { config } from "./config.mjs";
import { db } from "./db.mjs";
import { production } from "./config.mjs";
if (
  production &&
  db.prepare("SELECT 1 FROM metadata WHERE key='evaluation'").get()
)
  throw new Error(
    "Use a fresh production DATA_DIR. Synthetic evaluation accounts must not be deployed.",
  );
await initChain();
const server = app.listen(config.port, config.host, () =>
  console.log(`CareLedger API: http://${config.host}:${config.port}`),
);
const retry = setInterval(
  () => flushPending().catch(() => console.error("Anchor retry failed")),
  10000,
);
async function shutdown() {
  clearInterval(retry);
  server.close(async () => {
    await closeChain();
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("message", (message) => {
  if (message === "shutdown") void shutdown();
});
