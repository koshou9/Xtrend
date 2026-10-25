import assert from "node:assert/strict";
import { join } from "node:path";

export async function runMetricsChecks({ check, context, output }) {
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const id = "1000000000000000001";
  const row = (postId = id) =>
    page.locator(`#xtrend-workspace .xt-ranked-row[data-tweet-id="${postId}"]`);
  const speed = (postId = id) => row(postId).locator(".xt-col-speed > span");
  const waitSpeed = (value, postId = id) =>
    speed(postId)
      .filter({ hasText: new RegExp(`^${value}$`) })
      .waitFor();
  const changeViews = (label) =>
    page
      .locator("article")
      .first()
      .locator('a[href$="/analytics"]')
      .evaluate((link, value) => link.setAttribute("aria-label", value), label);
  try {
    await page.goto("https://x.com/home");
    await page.waitForTimeout(900);
    await waitSpeed("24K");
    await check(
      "hourly rates use exact page counts and update on aria-label changes",
      async () => {
        await changeViews("72,000 Views");
        await waitSpeed("36K");
        assert.match(
          await row().locator(".xt-col-speed").getAttribute("title"),
          /Views: 72000/,
        );
        assert.match(
          await page
            .locator("#xtrend-workspace .xt-ranking-group")
            .first()
            .innerText(),
          /Average since publication/,
        );
      },
    );
    await check(
      "new response readings survive unrelated DOM rescans without stale page counts taking over",
      async () => {
        await page.locator("#native-boost").click();
        await waitSpeed("29K");
        const title = await row()
          .locator(".xt-col-speed")
          .getAttribute("title");
        await page
          .locator("article")
          .first()
          .locator('[data-testid="tweetText"]')
          .evaluate((body) => {
            body.firstChild.textContent += " Unrelated page edit.";
          });
        await page.waitForTimeout(400);
        assert.equal(await speed().innerText(), "29K");
        assert.equal(
          await row().locator(".xt-col-speed").getAttribute("title"),
          title,
        );
      },
    );
    await check(
      "corrected lower page counts, including zero, replace old inflated rates",
      async () => {
        await changeViews("10,000 Views");
        await waitSpeed("5K");
        await changeViews("0 Views");
        await waitSpeed("0");
        assert.match(
          await row().locator(".xt-col-speed").getAttribute("title"),
          /Views: 0/,
        );
      },
    );
    await check(
      "compact-only counts and posts less than one minute old show unknown rates",
      async () => {
        await page.evaluate(
          ({ originalId }) => {
            const source = document.querySelector("article");
            for (const [postId, label, age] of [
              ["7777777777777777777", "12K Views", 7200000],
              ["8888888888888888888", "48000 Views", 15000],
            ]) {
              const article = source.cloneNode(true);
              article
                .querySelectorAll("[data-xtrend]")
                .forEach((node) => node.remove());
              for (const link of article.querySelectorAll("a[href]"))
                link.setAttribute(
                  "href",
                  link.getAttribute("href").replaceAll(originalId, postId),
                );
              article
                .querySelector("time")
                .setAttribute(
                  "datetime",
                  new Date(Date.now() - age).toISOString(),
                );
              article
                .querySelector('a[href$="/analytics"]')
                .setAttribute("aria-label", label);
              document.querySelector("main section").append(article);
            }
          },
          { originalId: id },
        );
        for (const postId of ["7777777777777777777", "8888888888888888888"]) {
          await page
            .locator(`article:has(a[href="/fixture_0/status/${postId}"])`)
            .scrollIntoViewIfNeeded();
          await waitSpeed("—", postId);
          assert.equal(
            await row(postId).locator(".xt-col-speed small").innerText(),
            "Unknown",
          );
        }
      },
    );
    await check(
      "real X detail labels supply exact views while edit timestamps never masquerade as publication time",
      async () => {
        await page.evaluate(
          ({ originalId }) => {
            const source = document.querySelector("article");
            for (const [postId, edited] of [
              ["9999999999999999900", false],
              ["9999999999999999901", true],
            ]) {
              const article = source.cloneNode(true);
              article
                .querySelectorAll("[data-xtrend]")
                .forEach((node) => node.remove());
              for (const link of article.querySelectorAll("a[href]"))
                link.setAttribute(
                  "href",
                  link.getAttribute("href").replaceAll(originalId, postId),
                );
              article
                .querySelector("time")
                .setAttribute(
                  "datetime",
                  new Date(Date.now() - 7200000).toISOString(),
                );
              if (edited)
                article
                  .querySelector("time")
                  .closest("a")
                  .setAttribute("href", `/fixture_0/status/${postId}/history`);
              const analytics = article.querySelector('a[href$="/analytics"]');
              analytics.removeAttribute("aria-label");
              analytics.textContent = "3.2万 查看";
              article
                .querySelector('[role="group"]')
                .setAttribute(
                  "aria-label",
                  "10 回复、7 次转帖、134 喜欢、205 书签、32834 次观看",
                );
              document.querySelector("main section").append(article);
            }
          },
          { originalId: id },
        );
        for (const [postId, expected] of [
          ["9999999999999999900", "16.4K"],
          ["9999999999999999901", "—"],
        ]) {
          await page
            .locator(`article:has(a[href$="/status/${postId}/analytics"])`)
            .scrollIntoViewIfNeeded();
          await waitSpeed(expected, postId);
          assert.match(
            await row(postId).locator(".xt-col-speed").getAttribute("title"),
            /Views: 32834/,
          );
        }
        await page
          .locator("#xtrend-workspace .xt-rankings")
          .screenshot({ path: join(output, "realtime-readings.png") });
      },
    );
  } finally {
    await page.close();
  }
}
