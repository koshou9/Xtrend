import { spawn } from "node:child_process";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { implementationHash } from "./fingerprint.mjs";

const initial = await implementationHash();
const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} failed (${code})`)),
    );
  });
await mkdir("test-results", { recursive: true });
await run("npm", ["run", "format:check"]);
await run("npm", ["run", "check"]);
await run("npm", ["run", "audit"]);
await run("npm", [
  "test",
  "--",
  "--reporter=default",
  "--reporter=json",
  "--outputFile=test-results/unit-results.json",
]);
await run("npm", ["run", "build:all"]);
await run("node", ["scripts/verify-data-origin.mjs"]);
let server;
try {
  try {
    const response = await fetch("http://127.0.0.1:5179");
    if (!(await response.text()).includes("Xtrend"))
      throw new Error("Port 5179 is used by another app");
  } catch (error) {
    if (error.message?.includes("another app")) throw error;
    server = spawn(
      "npm",
      ["run", "preview", "--", "--port", "5179", "--strictPort"],
      { stdio: "ignore" },
    );
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        ready = (await (await fetch("http://127.0.0.1:5179")).text()).includes(
          "Xtrend",
        );
      } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error("Preview server did not start");
  }
  await run("npm", ["run", "test:browser"]);
  await run("node", ["scripts/firefox-check.mjs"]);
  const lint = await new Promise((resolve, reject) => {
    const child = spawn("npx", [
      "--yes",
      "web-ext@10.8.0",
      "lint",
      "--source-dir",
      ".output/firefox-mv3",
      "--output",
      "json",
    ]);
    let output = "";
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => process.stderr.write(data));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(`Firefox lint failed (${code})`)),
    );
  });
  await writeFile("test-results/firefox-lint.json", lint);
  const result = JSON.parse(lint);
  if (result.summary.errors) throw new Error("Firefox manifest errors");
  if (initial !== (await implementationHash()))
    throw new Error("Implementation changed during verification; run again");
  const units = JSON.parse(
      await readFile("test-results/unit-results.json", "utf8"),
    ),
    browsers = JSON.parse(
      await readFile("test-results/browser-results.json", "utf8"),
    ),
    ai = JSON.parse(
      await readFile("test-results/ai-browser-results.json", "utf8"),
    );
  if (
    !units.success ||
    browsers.results.some((r) => r.status !== "passed") ||
    !Array.isArray(ai.results) ||
    !ai.results.length
  )
    throw new Error("Incomplete test results");
  const stamp = {
    checkedAt: new Date().toISOString(),
    version: JSON.parse(await readFile("package.json", "utf8")).version,
    implementationHash: initial,
    unitChecks: units.numPassedTests,
    browserChecks: browsers.results.length + ai.results.length,
    aiBrowserChecks: ai.results.length,
    firefoxWarnings: result.summary.warnings,
    authenticatedXVerified: false,
    phoneDeliveryVerified: false,
  };
  await writeFile(
    "test-results/release-stamp.json",
    JSON.stringify(stamp, null, 2),
  );
  console.log("Release verification passed:", stamp);
} finally {
  if (server) server.kill("SIGTERM");
}
