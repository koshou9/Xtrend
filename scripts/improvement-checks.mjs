import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function runImprovementChecks({
  check,
  context,
  page,
  output,
  popupURL,
}) {
  const popup = await context.newPage();
  popup.setDefaultTimeout(10000);
  await popup.goto(popupURL);
  const tab = (name) =>
    popup
      .locator(".xt-hub-tabs")
      .getByRole("button", { name, exact: true })
      .click();
  const saved = () =>
    popup.getByText("Saved on this device", { exact: true }).waitFor();
  const workspace = page.locator("#xtrend-workspace");
  await popup.locator(".xt-hub-header select").selectOption("en");
  await check(
    "old forms and ordinary settings messages cannot reenable a disabled Bark configuration",
    async () => {
      await popup.evaluate(async () => {
        const value = (await chrome.storage.local.get("settings:v1"))[
          "settings:v1"
        ];
        await chrome.storage.local.set({
          "settings:v1": {
            ...value,
            bark: {
              enabled: true,
              server: "https://example.invalid",
              deviceKey: "test_device",
            },
          },
        });
      });
      await popup.reload();
      await popup
        .getByRole("button", { name: "Settings", exact: true })
        .click();
      const second = await context.newPage();
      await second.goto(popupURL);
      await second
        .locator(".xt-hub-tabs")
        .getByRole("button", { name: "Monitor", exact: true })
        .click();
      await second
        .getByRole("button", { name: "Disable Bark", exact: true })
        .click();
      await second.getByText("Saved on this device", { exact: true }).waitFor();
      await popup.getByLabel("Rising starts at", { exact: true }).fill("3000");
      await popup
        .getByRole("button", { name: "Save settings", exact: true })
        .click();
      await saved();
      const result = await popup.evaluate(async () => {
        await chrome.runtime.sendMessage({
          type: "xtrend:settings-update",
          patch: { bark: { enabled: true } },
        });
        return (await chrome.storage.local.get("settings:v1"))["settings:v1"];
      });
      assert.equal(result.bark.enabled, false);
      assert.equal(result.rising, 3000);
      const denied = await popup.evaluate(() =>
        chrome.runtime.sendMessage({
          type: "xtrend:bark-config",
          bark: {
            enabled: true,
            server: "https://example.invalid",
            deviceKey: "test_device",
          },
        }),
      );
      assert.equal(denied.ok, false);
      assert.equal(denied.error, "permissionDenied");
      await second.close();
    },
  );
  await check(
    "templates follow edits in general settings and unsaved section changes require an explicit choice",
    async () => {
      await popup
        .getByLabel("Reply template", { exact: true })
        .fill("Current template {{text}}");
      await popup
        .getByRole("button", { name: "Save settings", exact: true })
        .click();
      await saved();
      await tab("AI replies");
      assert.equal(
        await popup.getByLabel("Reply template", { exact: true }).inputValue(),
        "Current template {{text}}",
      );
      await popup
        .getByLabel("Reply template", { exact: true })
        .fill("Unsaved edit");
      await tab("About");
      await popup
        .getByRole("alertdialog", { name: "Unsaved changes", exact: true })
        .waitFor();
      await popup
        .getByRole("button", { name: "Keep editing", exact: true })
        .click();
      assert.equal(
        await popup.getByLabel("Reply template", { exact: true }).inputValue(),
        "Unsaved edit",
      );
      await tab("About");
      await popup
        .getByRole("button", { name: "Discard changes", exact: true })
        .click();
      await popup
        .getByRole("heading", {
          name: "Local first. Yours to control.",
          exact: true,
        })
        .waitFor();
      await tab("AI replies");
      assert.equal(
        await popup.getByLabel("Reply template", { exact: true }).inputValue(),
        "Current template {{text}}",
      );
    },
  );
  await check(
    "reply filtering survives removal of the original post and explains temporary restore and whitelist actions",
    async () => {
      await page.goto("https://x.com/fixture_0/status/1000000000000000001");
      await page.waitForTimeout(1100);
      await tab("Filters");
      await popup
        .getByRole("switch", {
          name: "Hide spam and promotional replies",
          exact: true,
        })
        .check();
      await saved();
      const reply = page.locator(
        'article:has(a[href="/fixture_1/status/1000000000000000002"])',
      );
      await reply.waitFor({ state: "hidden" });
      await page
        .locator("article")
        .first()
        .evaluate((el) => el.remove());
      await page.waitForTimeout(400);
      assert.equal(await reply.isVisible(), false);
      await workspace
        .getByRole("button", { name: /Review hidden posts/ })
        .click();
      await workspace
        .getByRole("dialog", { name: "Hidden content", exact: true })
        .waitFor();
      assert.ok(
        (await workspace.locator(".xt-reading-tools").innerText()).includes(
          "Profile-content bait",
        ),
      );
      await workspace
        .getByRole("button", { name: "Show for this page", exact: true })
        .first()
        .click();
      await reply.waitFor({ state: "visible" });
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await page.reload();
      await page.waitForTimeout(1100);
      await reply.waitFor({ state: "hidden" });
      await workspace
        .getByRole("button", { name: /Review hidden posts/ })
        .click();
      await workspace
        .getByRole("button", { name: "Allow this author", exact: true })
        .first()
        .click();
      await reply.waitFor({ state: "visible" });
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await popup
        .getByRole("switch", {
          name: "Hide spam and promotional replies",
          exact: true,
        })
        .uncheck();
      await saved();
    },
  );
  await check(
    "self-check reports real extension reading and exports only safe diagnostic fields",
    async () => {
      await page.goto("https://x.com/home");
      await page.waitForTimeout(2000);
      await tab("About");
      await popup
        .getByRole("button", { name: "Run self-check", exact: true })
        .click();
      await popup.locator(".xt-diagnostics").waitFor();
      assert.ok(
        (await popup.locator(".xt-diagnostics").innerText()).includes("x.com"),
      );
      const event = popup.waitForEvent("download");
      await popup
        .getByRole("button", { name: "Export safe check results", exact: true })
        .click();
      const download = await event,
        path = join(output, "safe-self-check.json");
      await download.saveAs(path);
      const text = await readFile(path, "utf8"),
        data = JSON.parse(text);
      assert.ok(data.pages.length > 0);
      for (const token of [
        "test_device",
        "deviceKey",
        "Synthetic post",
        "/status/",
        "fixture_account",
      ])
        assert.ok(!text.includes(token));
      await popup
        .locator(".xt-extension-hub")
        .screenshot({ path: join(output, "improved-self-check.png") });
    },
  );
  await check(
    "backup export excludes secrets and restore requires review and disables networking features",
    async () => {
      const event = popup.waitForEvent("download");
      await popup
        .getByRole("button", { name: "Download settings backup", exact: true })
        .click();
      const download = await event,
        path = join(output, "safe-settings-backup.json");
      await download.saveAs(path);
      const text = await readFile(path, "utf8"),
        data = JSON.parse(text);
      assert.ok(!text.includes("deviceKey") && !text.includes("test_device"));
      data.preferences.rising = 4000;
      data.preferences.monitoring.enabled = true;
      data.preferences.bark = {
        enabled: true,
        server: "https://evil.invalid",
        deviceKey: "not_imported",
      };
      await popup
        .getByLabel("Choose backup file", { exact: true })
        .setInputFiles({
          name: "backup.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(data)),
        });
      await popup
        .getByRole("region", { name: "Review before restoring", exact: true })
        .waitFor();
      let stored = await popup.evaluate(
        async () =>
          (await chrome.storage.local.get("settings:v1"))["settings:v1"],
      );
      assert.equal(stored.rising, 3000);
      await popup
        .getByRole("button", { name: "Restore these settings", exact: true })
        .click();
      await saved();
      stored = await popup.evaluate(
        async () =>
          (await chrome.storage.local.get("settings:v1"))["settings:v1"],
      );
      assert.equal(stored.rising, 4000);
      assert.equal(stored.bark.enabled, false);
      assert.equal(stored.monitoring.enabled, false);
      assert.equal(stored.bark.deviceKey, "test_device");
    },
  );
  await check(
    "notification schedules and individual thresholds are editable, saved and restored after reopening",
    async () => {
      await tab("Monitor");
      await popup
        .getByLabel("Individual watch thresholds", { exact: true })
        .fill("account | fixture_0 | 100 | 0");
      await popup
        .getByRole("button", { name: "Save watchlist", exact: true })
        .click();
      await saved();
      await popup.getByLabel("Quiet hours", { exact: true }).check();
      await popup
        .getByLabel("Quiet hours start", { exact: true })
        .fill("21:30");
      await popup.getByLabel("Quiet hours end", { exact: true }).fill("07:15");
      await popup
        .getByLabel("Merge notifications for minutes", { exact: true })
        .fill("2");
      await popup
        .getByLabel("Minimum minutes between pushes", { exact: true })
        .fill("3");
      await popup
        .getByRole("button", {
          name: "Save notification controls",
          exact: true,
        })
        .click();
      await saved();
      await popup.reload();
      await tab("Monitor");
      assert.equal(
        await popup
          .getByLabel("Quiet hours start", { exact: true })
          .inputValue(),
        "21:30",
      );
      assert.equal(
        await popup
          .getByLabel("Individual watch thresholds", { exact: true })
          .inputValue(),
        "account | fixture_0 | 100 | 0",
      );
      await popup.locator(".xt-extension-hub").screenshot({
        path: join(output, "improved-notification-controls.png"),
      });
    },
  );
  await check(
    "measured trends use actual updated readings and batch selection exports only chosen posts",
    async () => {
      await page.goto("https://x.com/home");
      await page.waitForTimeout(1100);
      await page.locator("#native-boost").click();
      await page.waitForTimeout(350);
      await page
        .locator("article")
        .first()
        .getByRole("button", { name: "Observed view trend", exact: true })
        .click();
      await workspace
        .getByRole("dialog", { name: "Observed view trend", exact: true })
        .waitFor();
      await workspace.locator(".xt-trend").waitFor();
      await page.screenshot({
        path: join(output, "improved-reading-trend.png"),
      });
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await workspace
        .getByRole("button", { name: "Select and export", exact: true })
        .click();
      await workspace
        .getByRole("checkbox", { name: "Select post @fixture_0", exact: true })
        .check();
      const event = page.waitForEvent("download");
      await workspace
        .getByRole("button", {
          name: "Download selected Markdown",
          exact: true,
        })
        .click();
      const download = await event,
        path = join(output, "selected-posts.md");
      await download.saveAs(path);
      const markdown = await readFile(path, "utf8");
      assert.ok(markdown.includes("@fixture\\_0"));
      assert.ok(!markdown.includes("Synthetic post 2."));
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
    },
  );
  await check(
    "Pro columns have independent ranking limits and passive monitoring controls",
    async () => {
      await page.goto("https://pro.x.com/");
      await page.waitForTimeout(1300);
      await workspace
        .getByLabel("Columns", { exact: true })
        .selectOption("pro-column-1");
      await workspace
        .getByRole("button", { name: "Settings", exact: true })
        .click();
      await workspace
        .getByLabel("Column ranking limit", { exact: true })
        .fill("1");
      await workspace
        .getByLabel("Column minimum views", { exact: true })
        .fill("12000");
      await workspace
        .getByLabel("Monitor this column", { exact: true })
        .uncheck();
      await workspace
        .getByRole("button", { name: "Save column settings", exact: true })
        .click();
      await workspace
        .getByText("Saved on this device", { exact: true })
        .waitFor();
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
      assert.equal(await workspace.locator(".xt-ranked-row").count(), 1);
      await workspace
        .getByLabel("Columns", { exact: true })
        .selectOption("pro-column-2");
      assert.ok((await workspace.locator(".xt-ranked-row").count()) > 1);
      await page.screenshot({ path: join(output, "improved-pro-columns.png") });
    },
  );
  await check(
    "the new controls remain usable in Chinese, Japanese and a narrow window",
    async () => {
      await popup.locator(".xt-hub-header select").selectOption("zh");
      await popup.getByRole("button", { name: "关于", exact: true }).click();
      await popup
        .getByRole("button", { name: "开始自检", exact: true })
        .click();
      await popup.locator(".xt-diagnostics").waitFor();
      await popup
        .locator(".xt-extension-hub")
        .screenshot({ path: join(output, "improved-tools-zh.png") });
      await popup.locator(".xt-hub-header select").selectOption("ja");
      await popup.setViewportSize({ width: 390, height: 760 });
      assert.equal(
        await popup
          .locator(".xt-extension-hub")
          .evaluate((el) => el.scrollWidth > el.clientWidth),
        false,
      );
      await popup
        .locator(".xt-extension-hub")
        .screenshot({ path: join(output, "improved-tools-ja-narrow.png") });
      await popup.locator(".xt-hub-header select").selectOption("en");
    },
  );
  await popup.close();
}
