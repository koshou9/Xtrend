import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export async function runAuditRuntimeChecks({ check, context, popupURL }) {
  const popup = await context.newPage();
  try {
    await popup.goto(popupURL);
    await popup.locator(".xt-hub-header select").selectOption("en");
    await check(
      "a fresh installed extension contains no prefilled demo monitor matches",
      async () => {
        const result = await popup.evaluate(() =>
          chrome.runtime.sendMessage({ type: "xtrend:monitor-list" }),
        );
        assert.equal(result.ok, true);
        assert.deepEqual(result.value, []);
      },
    );
    await check(
      "installed About version agrees with the actual package version",
      async () => {
        const { version } = JSON.parse(await readFile("package.json", "utf8"));
        await popup
          .locator(".xt-hub-tabs")
          .getByRole("button", { name: "About", exact: true })
          .click();
        await popup
          .getByText(`Xtrend ${version} · MIT`, { exact: true })
          .waitFor();
      },
    );
    await check(
      "extension pages cannot inject fabricated monitor-hit messages into real monitoring history",
      async () => {
        const result = await popup.evaluate(() =>
          chrome.runtime.sendMessage({
            type: "xtrend:monitor-hit",
            hit: { id: "1", account: "fake", views: 999999999, at: Date.now() },
          }),
        );
        assert.equal(result.ok, false);
        assert.equal(result.error, "operationFailed");
      },
    );
  } finally {
    await popup.close();
  }
}
