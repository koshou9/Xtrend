import assert from "node:assert/strict";
import { join } from "node:path";
import { runCompactPopupChecks } from "./compact-popup-checks.mjs";

export async function runVisualChecks({ check, context, output, popupURL }) {
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const root = page.locator("#xtrend-workspace"),
    id = "1000000000000000006";
  let popup;
  const verifyOutline = async (postId) => {
    await page.waitForFunction((postId) => {
      const article = [
        ...document.querySelectorAll('article[data-testid="tweet"]'),
      ].find((a) =>
        a
          .querySelector("time")
          ?.closest("a")
          ?.getAttribute("href")
          ?.includes(`/status/${postId}`),
      );
      const outline = document
        .querySelector("#xtrend-workspace")
        ?.shadowRoot.querySelector(".xt-linked-outline");
      if (!article || !outline) return false;
      const b = article.getBoundingClientRect(),
        top = Math.max(0, b.top),
        bottom = Math.min(innerHeight, b.bottom);
      return (
        Math.abs(Number(outline.getAttribute("y")) - top - 1) < 2 &&
        Math.abs(Number(outline.getAttribute("height")) - (bottom - top - 2)) <
          2
      );
    }, postId);
  };
  try {
    await page.goto("https://x.com/home");
    await root.locator(".xt-rankings").waitFor();
    await page.waitForTimeout(900);
    await check(
      "post outlines remain complete after scrolling beyond a viewport-height document root",
      async () => {
        await page.evaluate(() => {
          document.documentElement.style.height = "100%";
          document.documentElement.style.overflowY = "scroll";
          document.body.style.height = "100%";
          for (const article of document.querySelectorAll(
            'article[data-testid="tweet"]',
          ))
            article.style.minHeight = "480px";
          window.scrollTo({
            top: document.body.scrollHeight,
            behavior: "instant",
          });
        });
        await root.locator(`.xt-ranked-row[data-tweet-id="${id}"]`).waitFor();
        await root
          .locator(`.xt-ranked-row[data-tweet-id="${id}"] .xt-excerpt`)
          .click();
        assert.ok(
          await page.evaluate(() => scrollY > innerHeight),
          "the regression must scroll farther than the root's visible height",
        );
        await verifyOutline(id);
        await page.screenshot({
          path: join(output, "visual-complete-post-outline.png"),
        });
      },
    );
    await check(
      "selected outlines disappear only offscreen and recover on return without losing selection",
      async () => {
        const position = await page.evaluate(() => scrollY);
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: "instant" }),
        );
        await root.locator(".xt-linked-outline").waitFor({ state: "detached" });
        assert.equal(
          await root
            .locator(`.xt-ranked-row[data-tweet-id="${id}"]`)
            .getAttribute("aria-current"),
          "true",
        );
        await page.evaluate(
          (y) => window.scrollTo({ top: y, behavior: "instant" }),
          position,
        );
        await verifyOutline(id);
      },
    );
    popup = await context.newPage();
    await check(
      "native popup content has a stable intrinsic size even from Chrome's minimum initial viewport",
      async () => {
        await popup.setViewportSize({ width: 25, height: 25 });
        await popup.goto(popupURL);
        const intrinsic = await popup.evaluate(() => ({
          width: document.body.scrollWidth,
          height: document.body.scrollHeight,
        }));
        assert.ok(
          intrinsic.width === 360 && intrinsic.height === 560,
          JSON.stringify(intrinsic),
        );
        await popup.setViewportSize({ width: 360, height: 560 });
        await popup.locator(".xt-hub-tabs").waitFor();
        const layout = await popup.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          hub: document
            .querySelector(".xt-extension-hub")
            .getBoundingClientRect()
            .toJSON(),
          mainHeight: document.querySelector(".xt-hub-main").clientHeight,
          tabs: [...document.querySelectorAll(".xt-hub-tabs button")].map((e) =>
            e.getBoundingClientRect().toJSON(),
          ),
        }));
        assert.equal(layout.width, 360);
        assert.equal(layout.height, 560);
        assert.ok(
          layout.hub.x >= 0 &&
            layout.hub.right <= 360 &&
            layout.hub.bottom <= 560,
        );
        assert.ok(layout.mainHeight > 300);
        assert.ok(
          layout.tabs.every((b) => b.width >= 50 && b.x >= 0 && b.right <= 360),
        );
        await popup.screenshot({
          path: join(output, "visual-native-popup-card.png"),
        });
      },
    );
    await runCompactPopupChecks({
      check,
      popup,
      output,
      label: "Packaged Chrome",
      native: true,
    });
    await check(
      "rounded ranking settings preserve every control at normal and narrow widths",
      async () => {
        await popup.locator(".xt-hub-header select").selectOption("zh");
        await page.goto("https://x.com/home");
        await root.getByRole("button", { name: "设置", exact: true }).click();
        const dialog = root.locator(".xt-ranking-settings-dialog");
        await dialog.waitFor();
        await dialog.evaluate((element) =>
          Promise.all(
            element
              .getAnimations()
              .map((animation) => animation.finished.catch(() => {})),
          ),
        );
        for (const name of [
          "首页 / 推荐流",
          "列表",
          "个人主页",
          "推文详情页",
          "排名",
          "等级图标",
          "用户名",
          "推文预览",
          "浏览量",
          "流速",
        ])
          assert.equal(
            await dialog.getByRole("checkbox", { name, exact: true }).count(),
            1,
          );
        await page.screenshot({
          path: join(output, "visual-ranking-settings-card.png"),
        });
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(
          await dialog.evaluate((e) => e.scrollWidth > e.clientWidth),
          false,
        );
        await dialog
          .getByRole("button", { name: "全部设置", exact: true })
          .scrollIntoViewIfNeeded();
        assert.equal(
          await dialog
            .getByRole("button", { name: "全部设置", exact: true })
            .isVisible(),
          true,
        );
        await dialog.evaluate((e) => (e.scrollTop = 0));
        await page.screenshot({
          path: join(output, "visual-ranking-settings-card-mobile.png"),
        });
      },
    );
  } catch (error) {
    await page.screenshot({
      path: join(output, "visual-regression-failure.png"),
    });
    throw error;
  } finally {
    if (popup) {
      await popup.locator(".xt-hub-header select").selectOption("en");
      await popup.getByText("Saved on this device", { exact: true }).waitFor();
      await popup.close();
    }
    await page.close();
  }
}
