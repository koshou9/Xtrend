import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const forbidden = [
  "A small observation can change the way you see a whole day",
  "Synthetic post ",
  "reader_fixture_",
  "fixture_account",
  "data-xtrend-fixture",
];
for (const browser of ["chrome", "edge", "firefox"]) {
  let files = 0;
  async function inspect(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = join(folder, entry.name);
      if (entry.isDirectory()) await inspect(file);
      else if (file.endsWith(".js") || file.endsWith(".html")) {
        const source = await readFile(file, "utf8");
        for (const text of forbidden)
          assert.ok(
            !source.includes(text),
            `Test data found in ${file}: ${text}`,
          );
        files++;
      }
    }
  }
  await inspect(`.output/${browser}-mv3`);
  assert.ok(files > 0);
  console.log(
    `${browser}: ${files} installed files contain no demo posts, seeded monitor data, or test-only article markers`,
  );
}
