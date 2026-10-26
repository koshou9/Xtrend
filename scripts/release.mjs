import {
  readFile,
  mkdir,
  readdir,
  copyFile,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { implementationHash } from "./fingerprint.mjs";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const stamp = JSON.parse(
  await readFile("test-results/release-stamp.json", "utf8"),
);
if (
  stamp.version !== version ||
  stamp.implementationHash !== (await implementationHash())
)
  throw new Error(
    "Run npm run verify:release against the current implementation before packaging",
  );
const out = join("release", version);
await mkdir(out, { recursive: true });
for (const browser of ["chrome", "edge", "firefox"]) {
  const source = `.output/${browser}-mv3`;
  const manifest = JSON.parse(
    await readFile(join(source, "manifest.json"), "utf8"),
  );
  if (
    !manifest.content_scripts?.every((s) =>
      s.matches.every((match) =>
        ["https://x.com/*", "https://pro.x.com/*"].includes(match),
      ),
    )
  )
    throw new Error(`Unexpected page scope: ${browser}`);
  if (
    manifest.version !== version ||
    manifest.permissions.join(",") !== "storage,clipboardWrite,alarms"
  )
    throw new Error(`Unexpected permissions: ${browser}`);
  await copyFile(
    `.output/xtrend-${version}-${browser}.zip`,
    join(out, `Xtrend-${version}-${browser}.zip`),
  );
}
await mkdir(join(out, "licenses"), { recursive: true });
for (const pkg of ["react", "react-dom", "lucide-react", "@fontsource/geist"]) {
  const dir = join("node_modules", pkg),
    files = await readdir(dir);
  const license = files.find((name) => /^licen[cs]e(?:\.|$)/i.test(name));
  if (!license) throw new Error(`Missing license: ${pkg}`);
  await copyFile(
    join(dir, license),
    join(out, "licenses", pkg.replace("/", "_") + ".txt"),
  );
}
for (const file of [
  "README.md",
  "PRIVACY.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "CHANGELOG.md",
])
  await copyFile(file, join(out, file));
await writeFile(
  join(out, "README.md"),
  (await readFile("README.md", "utf8")).replaceAll("](docs/", "]("),
);
const localDocs = await readdir("docs");
for (const file of [
  "ARCHITECTURE.md",
  "VERIFICATION.md",
  "架构说明.md",
  "OPTIMIZATION-0.3.0.md",
  "优化实施清单.md",
  "优化完成说明.md",
  "验证记录-0.1.0.md",
])
  if (localDocs.includes(file))
    await copyFile(join("docs", file), join(out, file));
for (const report of localDocs)
  if (/^(全面功能检查与修复报告|界面修复与验证记录)-[\d.]+\.md$/.test(report))
    await copyFile(join("docs", report), join(out, report));
await mkdir(join(out, "verification"), { recursive: true });
for (const file of await readdir("test-results"))
  if (
    /^(release-stamp\.json|browser-results\.json|ai-browser-results\.json|unit-results\.json|dependency-audit\.json|performance-0\.3\.0\.json|extension-network\.json|bark-local-proof\.json|firefox-lint\.json|firefox-install\.log|safe-self-check\.json|.*\.(?:png|jpe?g))$/.test(
      file,
    ) &&
    !file.includes("failure") &&
    !file.startsWith("audit-")
  )
    await copyFile(join("test-results", file), join(out, "verification", file));
const evidence = await readdir("test-results");
for (const file of [
  "audit-before.json",
  "audit-insertion-before.json",
  "audit-marker-before.json",
  "audit-after.json",
  "live-x-readings.json",
  `live-visual-checks-${version}.json`,
])
  if (evidence.includes(file))
    await copyFile(join("test-results", file), join(out, "verification", file));
await writeFile(
  join(out, "INSTALL.txt"),
  `Xtrend ${version}\n\nChrome/Edge: unzip the matching package, open the extension manager, enable Developer mode and Load unpacked. Select the folder containing manifest.json. Refresh X.\n\nTo upgrade an existing unpacked install, replace the files in its original folder with this version, then click Reload and refresh X. Your locally saved settings remain.\n\nFirefox: unzip, open about:debugging#/runtime/this-firefox, Load Temporary Add-on, select manifest.json. Permanent installation requires Mozilla signing.\n\nAI comments: choose X Grok, an OpenAI-compatible service, or Ollama in the AI settings. External services need your own service address, model and any required key. Private Grok generation stops if private mode cannot be confirmed. Nothing is posted automatically.\n\nRead VERIFICATION.md for tested and unverified capabilities. Read PRIVACY.md before using AI or enabling Bark. Bark is optional and sends only the allowed notification metadata to your configured server. Alarms perform local cleanup and deliver already queued notifications; they never refresh X.\n`,
  "utf8",
);
console.log(
  "Browser packages, licenses and verification evidence copied to release/.",
);
