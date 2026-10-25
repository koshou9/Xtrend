import assert from "node:assert/strict";
import { join } from "node:path";

export async function runTooltipChecks({ check, page, output, label }) {
  const badge = page.locator("article .xt-badge").first();
  const tooltip = page.getByRole("tooltip");
  const original = await page
    .locator("article")
    .evaluateAll((articles) => articles.map((a) => a.style.cssText));
  const viewport = page.viewportSize();
  const verifyCard = async () => {
    await tooltip.waitFor();
    const result = await tooltip.evaluate((card) => {
      const b = card.getBoundingClientRect();
      const host = card.getRootNode().host;
      const points = [
        [b.left + 4, b.top + 4],
        [b.right - 4, b.bottom - 4],
        [b.left + b.width / 2, b.top + b.height / 2],
      ];
      return {
        visible:
          b.left >= 7 &&
          b.top >= 7 &&
          b.right <= innerWidth - 7 &&
          b.bottom <= innerHeight - 7,
        unobscured: points.every(([x, y]) => {
          const top = document.elementFromPoint(x, y);
          return host ? top === host : card.contains(top);
        }),
        width: b.width,
        height: b.height,
      };
    });
    assert.ok(
      result.visible,
      `card must fit viewport: ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.unobscured,
      "tweet clipping or another tweet must not cover the card",
    );
    assert.ok(result.width >= 200 && result.height > 180);
  };
  try {
    await page.addStyleTag({
      content: ".xt-rankings{visibility:hidden!important}",
    });
    await check(
      `${label} badge card escapes tweet clipping and overlapping engagement controls`,
      async () => {
        await page.locator("article").evaluateAll((articles) =>
          articles.forEach((a, i) => {
            Object.assign(a.style, {
              position: "relative",
              isolation: "isolate",
              overflow: "hidden",
              transform: "translateZ(0)",
              zIndex: String(i + 1),
              background: "#fff",
            });
          }),
        );
        await badge.hover();
        await tooltip.waitFor();
        await page.screenshot({
          path: join(output, `tooltip-${label.toLowerCase()}-unclipped.png`),
        });
        await verifyCard();
        await tooltip.hover();
        await page.waitForTimeout(250);
        await verifyCard();
        await page.mouse.move(2, 2);
        await tooltip.waitFor({ state: "detached" });
      },
    );
    await page
      .locator("article")
      .evaluateAll(
        (articles, styles) =>
          articles.forEach((a, i) => (a.style.cssText = styles[i])),
        original,
      );
    await check(
      `${label} badge card fits viewport corners and supports keyboard dismissal`,
      async () => {
        for (const position of [
          "position:fixed;left:8px;top:8px;z-index:5",
          "position:fixed;right:8px;bottom:8px;z-index:5",
        ]) {
          await badge.evaluate((b, css) => (b.style.cssText = css), position);
          await badge.focus();
          await verifyCard();
          assert.ok(
            await badge.evaluate((b) =>
              b
                .getRootNode()
                .getElementById(b.getAttribute("aria-describedby"))
                ?.textContent.includes("Bookmarks"),
            ),
            "keyboard focus must have a readable description in the same root",
          );
          await page.keyboard.press("Escape");
          await tooltip.waitFor({ state: "detached" });
          assert.equal(await badge.getAttribute("aria-expanded"), "false");
          await badge.blur();
        }
        await badge.evaluate((b) => (b.style.cssText = ""));
        await badge.hover();
        await tooltip.waitFor();
        await page.mouse.click(2, 2);
        await tooltip.waitFor({ state: "detached" });
        await badge.focus();
        await tooltip.waitFor();
        await page.evaluate(() => document.dispatchEvent(new Event("scroll")));
        await tooltip.waitFor({ state: "detached" });
        assert.equal(await page.locator('[data-xtrend="tooltip"]').count(), 0);
        await badge.blur();
        await page.setViewportSize({ width: 320, height: 240 });
        await page.evaluate(
          () =>
            new Promise((done) =>
              requestAnimationFrame(() => requestAnimationFrame(done)),
            ),
        );
        await badge.evaluate(
          (b) =>
            (b.style.cssText = "position:fixed;right:8px;bottom:8px;z-index:5"),
        );
        await badge.focus();
        await verifyCard();
        await tooltip.evaluate((card) => (card.scrollTop = card.scrollHeight));
        await page.waitForTimeout(160);
        await verifyCard();
        await page.screenshot({
          path: join(output, `tooltip-${label.toLowerCase()}-small-window.png`),
        });
        await page.setViewportSize(viewport);
        await tooltip.waitFor({ state: "detached" });
        await badge.blur();
      },
    );
  } finally {
    await page.setViewportSize(viewport);
    await page
      .locator("article")
      .evaluateAll(
        (articles, styles) =>
          articles.forEach((a, i) => (a.style.cssText = styles[i])),
        original,
      );
    await badge.evaluate((b) => (b.style.cssText = "")).catch(() => {});
    await page.reload();
    await page.locator("article .xt-badge").first().waitFor();
  }
}
