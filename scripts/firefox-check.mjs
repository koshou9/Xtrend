import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { firefox } from "playwright";
await mkdir("test-results", { recursive: true });
const child = spawn(
  "npx",
  [
    "--yes",
    "web-ext@10.8.0",
    "run",
    "--source-dir",
    ".output/firefox-mv3",
    "--firefox",
    firefox.executablePath(),
    "--no-input",
    "--no-reload",
    "--no-config-discovery",
    "--start-url",
    "http://127.0.0.1:5179/",
    "--args=-headless",
  ],
  { detached: true, stdio: ["ignore", "pipe", "pipe"] },
);
let logs = "",
  installed = false;
const receive = (chunk) => {
  const line = chunk.toString();
  logs += line;
  process.stdout.write(line);
  if (/Installed .*temporary add-on/i.test(logs)) installed = true;
};
child.stdout.on("data", receive);
child.stderr.on("data", receive);
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(poll);
      reject(new Error("Firefox temporary installation timed out"));
    }, 40000);
    const poll = setInterval(() => {
      if (installed) {
        clearInterval(poll);
        clearTimeout(timeout);
        resolve();
      }
    }, 200);
    child.once("exit", (code) => {
      clearInterval(poll);
      clearTimeout(timeout);
      installed
        ? resolve()
        : reject(new Error(`Firefox runner exited ${code}`));
    });
    child.once("error", reject);
  });
} finally {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    /* The isolated process may already have exited. */
  }
  await writeFile(
    "test-results/firefox-install.log",
    `Synthetic installation smoke check; not an authenticated X test.\n${logs}\nTemporary add-on installed: ${installed}\n`,
  );
}
if (!installed) process.exitCode = 1;
