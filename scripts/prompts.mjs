import readline from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
import { stdin, stdout } from "node:process";
export async function ask(label) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(label)).trim();
  } finally {
    rl.close();
  }
}
export async function secret(label) {
  if (!stdin.isTTY)
    throw new Error("Use an interactive terminal to enter secrets.");
  stdout.write(label);
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const handler = (text, key) => {
      if (key?.ctrl && key.name === "c") {
        finish();
        reject(new Error("Cancelled."));
      } else if (key?.name === "return") {
        finish();
        resolve(value);
      } else if (key?.name === "backspace") {
        value = value.slice(0, -1);
      } else if (text && !key?.ctrl) {
        value += text;
      }
    };
    function finish() {
      stdin.off("keypress", handler);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    }
    stdin.on("keypress", handler);
  });
}
