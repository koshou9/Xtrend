import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function runFeatureChecks({
  check,
  context,
  page,
  output,
  popupURL,
}) {
  const popup = await context.newPage();
  popup.setDefaultTimeout(10000);
  await popup.goto(popupURL);
  await popup.locator(".xt-hub-header select").selectOption("en");
  await popup.getByRole("button", { name: "Filters", exact: true }).waitFor();
  const tab = (name) =>
    popup
      .locator(".xt-hub-tabs")
      .getByRole("button", { name, exact: true })
      .click();
  const saved = () =>
    popup.getByText("Saved on this device", { exact: true }).waitFor();
  const detail = (name) =>
    popup
      .locator("details")
      .filter({ has: popup.locator("summary").filter({ hasText: name }) });
  const post = (index) =>
    page.locator('article[data-testid="tweet"]').nth(index);
  const visible = (index, value) =>
    post(index).waitFor({ state: value ? "visible" : "hidden" });
  await check(
    "extension click opens a real six-section workspace with local rules and no trial paywall",
    async () => {
      assert.equal(await popup.locator(".xt-hub-tabs button").count(), 6);
      await popup
        .getByRole("heading", { name: "Content filtering", exact: true })
        .waitFor();
      assert.equal(
        await popup
          .getByRole("switch", {
            name: "Hide spam and promotional replies",
            exact: true,
          })
          .isChecked(),
        false,
      );
      assert.ok(
        await popup
          .getByRole("button", { name: "Standard · 23", exact: true })
          .isVisible(),
      );
      await popup
        .locator(".xt-extension-hub")
        .screenshot({ path: join(output, "hub-filters-en.png") });
    },
  );
  await check(
    "reply filtering really hides matching detail replies, keeps the main post and respects strength",
    async () => {
      await page.goto("https://x.com/fixture_0/status/1000000000000000001");
      await page.waitForTimeout(1000);
      await popup
        .getByRole("switch", {
          name: "Hide spam and promotional replies",
          exact: true,
        })
        .check();
      await saved();
      await visible(1, false);
      await visible(0, true);
      await visible(2, true);
      await visible(3, true);
      await popup
        .getByRole("button", { name: "Loose · 1", exact: true })
        .click();
      await saved();
      await visible(1, true);
      await popup
        .getByRole("button", { name: "Strict · 26", exact: true })
        .click();
      await saved();
      await visible(1, false);
      await visible(3, false);
      await visible(0, true);
      await popup
        .getByRole("button", { name: "Standard · 23", exact: true })
        .click();
      await saved();
      await visible(3, true);
    },
  );
  await check(
    "whitelist overrides blacklist and blacklist hides an otherwise ordinary reply",
    async () => {
      await detail("Whitelist / blacklist").locator("summary").click();
      await popup
        .getByLabel("Whitelist accounts", { exact: true })
        .fill("@fixture_1");
      await popup
        .getByLabel("Blacklist accounts", { exact: true })
        .fill("@fixture_1\n@fixture_5");
      await popup
        .getByRole("button", { name: "Save lists", exact: true })
        .click();
      await saved();
      await visible(1, true);
      await visible(5, false);
      await popup.getByLabel("Whitelist accounts", { exact: true }).fill("");
      await popup
        .getByRole("button", { name: "Save lists", exact: true })
        .click();
      await saved();
      await visible(1, false);
    },
  );
  await check(
    "custom rules can be added, edited and actually hide matching replies",
    async () => {
      await detail("Custom rules").locator("summary").click();
      await popup.getByLabel("Rule name", { exact: true }).fill("Local phrase");
      await popup
        .getByLabel("Matching phrases", { exact: true })
        .fill("secret promo phrase");
      await popup
        .getByRole("button", { name: "Save rule", exact: true })
        .click();
      await saved();
      await visible(4, false);
      await popup
        .getByRole("button", { name: "Edit Local phrase", exact: true })
        .click();
      await popup
        .getByLabel("Matching phrases", { exact: true })
        .fill("different phrase");
      await popup
        .getByRole("button", { name: "Save rule", exact: true })
        .click();
      await saved();
      await visible(4, true);
      await popup
        .getByRole("button", { name: "Edit Local phrase", exact: true })
        .click();
      await popup
        .getByLabel("Matching phrases", { exact: true })
        .fill("secret promo phrase");
      await popup
        .getByRole("button", { name: "Save rule", exact: true })
        .click();
      await saved();
      await visible(4, false);
    },
  );
  await check(
    "local rule import/export works and malformed imports do not overwrite saved rules",
    async () => {
      await popup.locator('input[type="file"]').setInputFiles({
        name: "rules.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            version: 1,
            rules: [
              {
                id: "reply",
                label: "Imported phrase",
                terms: ["A thoughtful reply"],
                match: "any",
                severity: 2,
              },
            ],
          }),
        ),
      });
      await popup
        .getByText("Rules imported locally.", { exact: true })
        .waitFor();
      await visible(2, false);
      await popup.locator('input[type="file"]').setInputFiles({
        name: "invalid.json",
        mimeType: "application/json",
        buffer: Buffer.from("invalid JSON"),
      });
      await popup.getByRole("alert").waitFor();
      await visible(2, false);
      const downloadEvent = popup.waitForEvent("download");
      await popup
        .getByRole("button", { name: "Export custom rules", exact: true })
        .click();
      const download = await downloadEvent;
      const path = join(output, "exported-rules.json");
      await download.saveAs(path);
      const exported = JSON.parse(await readFile(path, "utf8"));
      assert.equal(exported.version, 1);
      assert.equal(exported.rules.length, 2);
      assert.ok(!JSON.stringify(exported).includes("deviceKey"));
    },
  );
  await check(
    "the all-rules switch affects actual matching and filtering does not affect home/search/profile",
    async () => {
      await popup.getByLabel("Blacklist accounts", { exact: true }).fill("");
      await popup
        .getByRole("button", { name: "Save lists", exact: true })
        .click();
      await saved();
      await detail("All rules").locator("summary").click();
      const builtin = popup
        .locator(".xt-all-rules label")
        .filter({ hasText: "Profile-content bait" })
        .locator("input");
      await builtin.uncheck();
      await saved();
      await visible(1, true);
      await builtin.check();
      await saved();
      await visible(1, false);
      for (const url of [
        "https://x.com/home",
        "https://x.com/search",
        "https://x.com/fixture_0",
      ]) {
        await page.goto(url);
        await page.waitForTimeout(900);
        assert.equal(await page.locator("[data-xtrend-filtered]").count(), 0);
      }
      await popup
        .getByRole("button", { name: "Restore filter defaults", exact: true })
        .click();
      await saved();
    },
  );
  await check(
    "custom color cards persist and immediately change the real popup, rankings and badges",
    async () => {
      await page.goto("https://x.com/home");
      await page.waitForTimeout(900);
      await tab("Appearance");
      await popup.getByLabel("Name", { exact: true }).fill("Personal blue");
      await popup.getByLabel("Background", { exact: true }).fill("#ffffff");
      await popup.getByLabel("Text", { exact: true }).fill("#111111");
      await popup.getByLabel("Accent", { exact: true }).fill("#173d8b");
      await popup
        .getByRole("button", { name: "Save color card", exact: true })
        .click();
      await saved();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#xtrend-workspace")
            ?.shadowRoot.querySelector(".xt-app")
            ?.style.getPropertyValue("--accent") === "#173d8b",
      );
      assert.equal(
        await popup
          .locator(".xt-extension-hub")
          .evaluate((el) =>
            getComputedStyle(el).getPropertyValue("--accent").trim(),
          ),
        "#173d8b",
      );
      assert.equal(
        await post(0)
          .locator(".xt-inline")
          .evaluate((el) =>
            getComputedStyle(el).getPropertyValue("--accent").trim(),
          ),
        "#173d8b",
      );
      await popup.reload();
      await tab("Appearance");
      assert.ok(
        await popup
          .getByRole("button", { name: "Personal blue", exact: true })
          .isVisible(),
      );
      await popup
        .locator(".xt-extension-hub")
        .screenshot({ path: join(output, "hub-color-cards.png") });
      await popup
        .getByRole("button", { name: "Remove Personal blue", exact: true })
        .click();
      await saved();
      assert.equal(
        await popup
          .getByRole("button", { name: "Personal blue", exact: true })
          .count(),
        0,
      );
    },
  );
  await check(
    "passive private monitoring records matches once through the real background worker, without storing post bodies",
    async () => {
      await tab("Monitor");
      await popup
        .getByLabel("Accounts to watch", { exact: true })
        .fill("@fixture_0");
      await popup.getByLabel("Minimum views", { exact: true }).fill("10000");
      await popup
        .getByRole("button", { name: "Save watchlist", exact: true })
        .click();
      await saved();
      await popup
        .getByRole("switch", { name: "Monitor loaded posts", exact: true })
        .check();
      await saved();
      await popup.locator(".xt-monitor-events article").waitFor();
      assert.equal(
        await popup.locator(".xt-monitor-events article").count(),
        1,
      );
      await page.locator("#native-timeline").click();
      await page.waitForTimeout(800);
      assert.equal(
        await popup.locator(".xt-monitor-events article").count(),
        1,
      );
      const stored = await popup.evaluate(() => chrome.storage.local.get(null));
      const events = stored["monitor-events:v1"];
      assert.equal(events.length, 1);
      assert.equal(events[0].pushStatus, "off");
      assert.ok(!JSON.stringify(events).includes("Synthetic post"));
      assert.ok(!Object.keys(events[0]).includes("text"));
      await popup
        .locator(".xt-extension-hub")
        .screenshot({ path: join(output, "hub-private-monitor.png") });
      await popup
        .getByRole("switch", { name: "Monitor loaded posts", exact: true })
        .uncheck();
      await saved();
    },
  );
  await check(
    "Bark stays off without a valid configuration and never claims phone delivery",
    async () => {
      await popup
        .getByRole("button", { name: "Authorize and enable Bark", exact: true })
        .click();
      await popup.getByRole("alert").waitFor();
      assert.ok(
        (await popup.getByRole("alert").innerText()).includes("valid server"),
      );
      const stored = await popup.evaluate(() =>
        chrome.storage.local.get("settings:v1"),
      );
      assert.equal(stored["settings:v1"].bark.enabled, false);
      assert.equal(
        await popup
          .getByRole("button", { name: "Send test notification", exact: true })
          .isEnabled(),
        false,
      );
    },
  );
  await check(
    "the optimized popup supports all sections, three languages and a narrow viewport",
    async () => {
      await tab("AI replies");
      await popup
        .getByLabel("Reply template", { exact: true })
        .fill("Reply in {{language}} to {{text}}");
      await popup
        .getByRole("button", { name: "Save template", exact: true })
        .click();
      await saved();
      await tab("About");
      await popup
        .getByRole("heading", {
          name: "Local first. Yours to control.",
          exact: true,
        })
        .waitFor();
      await popup.locator(".xt-hub-header select").selectOption("zh");
      await popup.getByRole("button", { name: "过滤", exact: true }).click();
      await popup
        .getByRole("heading", { name: "内容屏蔽", exact: true })
        .waitFor();
      await popup
        .locator(".xt-extension-hub")
        .screenshot({ path: join(output, "hub-filters-zh.png") });
      await popup.locator(".xt-hub-header select").selectOption("ja");
      await popup.getByRole("button", { name: "外観", exact: true }).click();
      await popup
        .getByRole("heading", { name: "カラーカード", exact: true })
        .waitFor();
      await popup.setViewportSize({ width: 390, height: 760 });
      assert.equal(
        await popup
          .locator(".xt-extension-hub")
          .evaluate((el) => el.scrollWidth > el.clientWidth),
        false,
      );
      await popup
        .locator(".xt-extension-hub")
        .screenshot({ path: join(output, "hub-narrow-ja.png") });
      await popup.locator(".xt-hub-header select").selectOption("en");
    },
  );
  await popup.close();
}
