import assert from "node:assert/strict";
import { join } from "node:path";

export async function runResearchChecks({ check, context, popupURL, output }) {
  const page = await context.newPage(),
    popup = await context.newPage();
  try {
    await page.goto("https://x.com/home");
    await page.locator("article .xt-badge").first().waitFor();
    const workspace = page.locator("#xtrend-workspace");
    await check(
      "webpage messages cannot open native tabs or submit a Grok prompt",
      async () => {
        const before = context.pages().length;
        await page.evaluate(() => {
          for (const channel of ["xtrend:native:v1", "xtrend:v1"])
            window.postMessage(
              {
                channel,
                event: channel.includes("native")
                  ? "native-request"
                  : "command",
                id: "untrusted-page-probe",
                command: {
                  type: "grok",
                  prompt: "Must never be submitted",
                  temporary: false,
                },
              },
              location.origin,
            );
        });
        await page.waitForTimeout(1000);
        await page
          .getByRole("button", { name: "Grok reply assistant", exact: true })
          .first()
          .evaluate((button) => button.click());
        assert.equal(await workspace.getByRole("dialog").count(), 0);
        await page
          .getByRole("button", { name: "Grok reply assistant", exact: true })
          .first()
          .click();
        await workspace
          .getByRole("button", { name: "Generate draft", exact: true })
          .evaluate((button) => button.click());
        await page.waitForTimeout(500);
        assert.equal(await workspace.locator(".xt-draft").inputValue(), "");
        await workspace
          .getByRole("button", { name: "Close", exact: true })
          .click();
        assert.equal(context.pages().length, before);
        assert.equal(
          context
            .pages()
            .filter((p) => p.url().includes("/i/grok#xtrend-native=")).length,
          0,
        );
      },
    );
    await check(
      "saved posts preserve notes and tags after reopening and export on request",
      async () => {
        await page
          .getByRole("button", { name: "Save post", exact: true })
          .first()
          .click();
        const dialog = workspace.getByRole("dialog");
        await dialog.getByLabel("Note", { exact: true }).fill("Research note");
        await dialog
          .getByLabel("Tags (comma separated)", { exact: true })
          .fill("research, cats");
        await dialog.getByRole("button", { name: "Save", exact: true }).click();
        await dialog.getByText("Research note", { exact: true }).waitFor();
        await dialog
          .getByRole("button", { name: "Close", exact: true })
          .click();
        await page.reload();
        await page.locator("article .xt-badge").first().waitFor();
        await workspace
          .getByRole("button", { name: "Saved posts", exact: true })
          .click();
        await dialog.getByText("Research note", { exact: true }).waitFor();
        const download = page.waitForEvent("download");
        await dialog
          .getByRole("button", { name: "Export saved posts", exact: true })
          .click();
        const file = await download;
        await file.saveAs(join(output, "saved-posts-export.json"));
        const { readFile } = await import("node:fs/promises");
        const data = JSON.parse(
          await readFile(join(output, "saved-posts-export.json"), "utf8"),
        );
        assert.equal(data.entries[0].note, "Research note");
        assert.deepEqual(data.entries[0].tags, ["research", "cats"]);
        await page.screenshot({ path: join(output, "saved-posts.png") });
        await dialog
          .getByRole("button", { name: "Remove", exact: true })
          .click();
        await dialog.getByText("No matching posts", { exact: true }).waitFor();
        await dialog
          .getByRole("button", { name: "Close", exact: true })
          .click();
      },
    );
    await check(
      "ranking search filters loaded posts and spreadsheet export contains only selected posts",
      async () => {
        await workspace.locator(".xt-reading-search summary").click();
        await workspace
          .getByLabel("Search text", { exact: true })
          .fill("Synthetic post 1.");
        assert.equal(await workspace.locator(".xt-ranked-row").count(), 1);
        await workspace
          .getByRole("button", { name: "Clear filters", exact: true })
          .click();
        await workspace
          .getByRole("button", { name: "Select and export", exact: true })
          .click();
        const dialog = workspace.getByRole("dialog");
        await dialog.getByRole("checkbox").first().check();
        const download = page.waitForEvent("download");
        await dialog
          .getByRole("button", { name: "Download spreadsheet", exact: true })
          .click();
        const file = await download;
        await file.saveAs(join(output, "selected-posts.csv"));
        const { readFile } = await import("node:fs/promises");
        const csv = await readFile(join(output, "selected-posts.csv"), "utf8");
        assert.ok(csv.includes('"Views/hour"'));
        assert.ok(csv.includes("Synthetic post"));
        assert.equal((csv.match(/https:\/\/x.com\/fixture_/g) ?? []).length, 1);
        await dialog
          .getByRole("button", { name: "Close", exact: true })
          .click();
      },
    );
    await popup.goto(popupURL);
    await check(
      "rule trial previews unsaved text without changing stored rules",
      async () => {
        const before = await popup.evaluate(
          async () =>
            (await chrome.storage.local.get("settings:v1"))["settings:v1"],
        );
        await popup.getByText("Try filter rules", { exact: true }).click();
        await popup
          .getByLabel("Sample reply", { exact: true })
          .fill("Full video in my bio");
        await popup
          .locator(".xt-rule-preview")
          .getByRole("status")
          .filter({ hasText: "Would hide" })
          .waitFor();
        const settings = await popup.evaluate(
          async () =>
            (await chrome.storage.local.get("settings:v1"))["settings:v1"],
        );
        assert.deepEqual(settings?.filtering, before?.filtering);
        await popup
          .getByLabel("Sample reply", { exact: true })
          .fill("A thoughtful discussion of this topic");
        await popup
          .locator(".xt-rule-preview")
          .getByRole("status")
          .filter({ hasText: "Would keep" })
          .waitFor();
      },
    );
    await check(
      "reading presets preserve notification settings and repeat reminders remain explicitly selectable",
      async () => {
        await popup
          .getByRole("button", { name: "Rankings", exact: true })
          .click();
        await popup.getByText("Reading presets", { exact: true }).click();
        await popup
          .getByRole("button", { name: "Daily reading", exact: true })
          .click();
        await popup.waitForFunction(
          async () =>
            (await chrome.storage.local.get("settings:v1"))["settings:v1"]
              ?.rankingLimit === 10,
        );
        const before = await popup.evaluate(
          async () =>
            (await chrome.storage.local.get("settings:v1"))["settings:v1"],
        );
        await popup
          .getByRole("button", { name: "Research", exact: true })
          .click();
        await popup.waitForFunction(
          async () =>
            (await chrome.storage.local.get("settings:v1"))["settings:v1"]
              .rankingLimit === 50,
        );
        const after = await popup.evaluate(
          async () =>
            (await chrome.storage.local.get("settings:v1"))["settings:v1"],
        );
        assert.deepEqual(after.bark, before.bark);
        assert.deepEqual(after.monitoring, before.monitoring);
        await popup
          .getByRole("button", { name: "Monitor", exact: true })
          .click();
        await popup
          .getByLabel("Remind again after views grow", { exact: true })
          .selectOption("50");
        await popup.waitForFunction(
          async () =>
            (await chrome.storage.local.get("settings:v1"))["settings:v1"]
              .monitoring.repeatPercent === 50,
        );
        await popup
          .getByLabel("Remind again after views grow", { exact: true })
          .selectOption("0");
      },
    );
    await check(
      "navigation removes the old star dialog and retained native tab",
      async () => {
        await page
          .getByRole("button", { name: "Thank-You star map", exact: true })
          .first()
          .click();
        await workspace
          .getByRole("button", { name: "Refresh", exact: true })
          .click();
        await page.waitForTimeout(1000);
        assert.ok(
          context
            .pages()
            .some((p) => p.url().includes("/retweets#xtrend-native=")),
        );
        await page.evaluate(() => {
          history.pushState({}, "", "/following");
          document.querySelector("main").replaceChildren();
        });
        await page.waitForTimeout(1000);
        assert.equal(await workspace.getByRole("dialog").count(), 0);
        assert.equal(
          context.pages().filter((p) => p.url().includes("#xtrend-native="))
            .length,
          0,
        );
      },
    );
    await check(
      "removing and adding Pro columns never reuses another column identity",
      async () => {
        await page.goto("https://pro.x.com/home");
        await page.locator("article .xt-badge").first().waitFor();
        const select = workspace.locator(".xt-column-select select");
        await select.waitFor();
        await page.evaluate(() => {
          window.auditColumn = document.querySelector(".column").outerHTML;
          document.querySelector(".column").remove();
        });
        await page.waitForTimeout(350);
        await page.evaluate(() => {
          const container = document.createElement("div");
          container.innerHTML = window.auditColumn.replaceAll(
            "1000000000000000001",
            "1000000000000000099",
          );
          const column = container.firstElementChild;
          column.id = "new-column";
          document.querySelector("main").append(column);
        });
        await page.waitForTimeout(350);
        const keys = await select
          .locator("option")
          .evaluateAll((es) => es.map((e) => e.value));
        assert.equal(keys.length, 3);
        assert.equal(new Set(keys).size, keys.length);
        await page.screenshot({
          path: join(output, "pro-columns-repaired.png"),
        });
      },
    );
  } finally {
    await page.close();
    await popup.close();
  }
}
