import assert from "node:assert/strict";
import { join } from "node:path";

export async function runRankingChecks({
  check,
  context,
  page,
  output,
  popupURL,
}) {
  const root = page.locator("#xtrend-workspace"),
    rows = root.locator(".xt-ranked-row");
  const open = async () => {
    await root.getByRole("button", { name: "Settings", exact: true }).click();
    await root
      .getByRole("heading", { name: "Ranking settings", exact: true })
      .waitFor();
  };
  const close = () =>
    root.getByRole("button", { name: "Close", exact: true }).click();
  const saved = () =>
    root.getByText("Saved on this device", { exact: true }).waitFor();
  const countRows = (count) =>
    page.waitForFunction(
      (n) =>
        document
          .querySelector("#xtrend-workspace")
          ?.shadowRoot.querySelectorAll(".xt-ranked-row").length === n,
      count,
    );
  await page.goto("https://x.com/home");
  await root
    .getByRole("heading", { name: "On this page", exact: true })
    .waitFor();
  await page.waitForTimeout(900);
  await check(
    "ranking gear opens the requested auto-saving settings panel",
    async () => {
      await open();
      assert.equal(
        await root
          .getByRole("button", { name: "Save settings", exact: true })
          .count(),
        0,
      );
      await root.getByLabel("Show top", { exact: true }).fill("2");
      await countRows(2);
      await saved();
      await close();
      await page.reload();
      await countRows(2);
      await open();
      assert.equal(
        await root.getByLabel("Show top", { exact: true }).inputValue(),
        "2",
      );
      await root.getByLabel("Show top", { exact: true }).fill("0");
      await root.getByRole("alert").waitFor();
      await countRows(2);
      await root.getByLabel("Show top", { exact: true }).fill("10");
      await saved();
      await close();
    },
  );
  await check(
    "all six display columns affect actual rows and save without losing quick changes",
    async () => {
      await open();
      for (const name of ["Rank", "Level icon", "Post preview", "Views"])
        await root.getByRole("checkbox", { name, exact: true }).uncheck();
      await root
        .getByRole("checkbox", { name: "Username", exact: true })
        .check();
      await root
        .getByRole("checkbox", { name: "Velocity", exact: true })
        .uncheck();
      await saved();
      assert.ok(await rows.first().locator(".xt-author").isVisible());
      for (const selector of [
        ".xt-rank-number",
        ".xt-rank-tier",
        ".xt-excerpt",
        ".xt-col-views",
        ".xt-col-speed",
      ])
        assert.equal(await rows.locator(selector).count(), 0);
      await root
        .getByRole("checkbox", { name: "Username", exact: true })
        .click();
      await root
        .getByText("Keep at least one column visible.", { exact: true })
        .waitFor();
      assert.equal(
        await root
          .getByRole("checkbox", { name: "Username", exact: true })
          .isChecked(),
        true,
      );
      for (const name of [
        "Rank",
        "Level icon",
        "Post preview",
        "Views",
        "Velocity",
      ])
        await root.getByRole("checkbox", { name, exact: true }).check();
      await root
        .getByRole("checkbox", { name: "Username", exact: true })
        .uncheck();
      await saved();
      await close();
      await page.reload();
      await root.locator(".xt-excerpt").first().waitFor();
      assert.equal(await rows.locator(".xt-author").count(), 0);
      assert.ok((await rows.locator(".xt-rank-number").count()) > 0);
      assert.ok((await rows.locator(".xt-rank-tier").count()) > 0);
    },
  );
  await check(
    "popular-only really hides low-view timeline posts, preserves unknown views and restores posts on new data",
    async () => {
      await open();
      await root
        .getByRole("switch", { name: "Only popular posts", exact: true })
        .check();
      await root.getByLabel("Minimum views", { exact: true }).fill("50000");
      await saved();
      await page.waitForFunction(
        () =>
          document
            .querySelector("article")
            ?.getAttribute("data-xtrend-filtered") === "true",
      );
      assert.equal(
        await page
          .locator("article")
          .nth(2)
          .getAttribute("data-xtrend-filtered"),
        null,
      );
      assert.equal(await page.locator("article").count(), 6);
      await close();
      await page.reload();
      await page.waitForTimeout(1000);
      assert.equal(await page.locator("article").first().isVisible(), false);
      assert.equal(await page.locator("article").nth(2).isVisible(), true);
      await page.locator("#native-boost").click();
      await page.locator("article").first().waitFor({ state: "visible" });
      await open();
      await root
        .getByRole("switch", { name: "Only popular posts", exact: true })
        .uncheck();
      await saved();
      await close();
      assert.equal(await page.locator("[data-xtrend-filtered]").count(), 0);
    },
  );
  await check(
    "scope settings immediately disable the current page and restore the timeline",
    async () => {
      await open();
      await root
        .getByRole("switch", { name: "Only popular posts", exact: true })
        .check();
      await saved();
      await root
        .getByRole("checkbox", { name: "Home / recommendations", exact: true })
        .uncheck();
      await saved();
      assert.equal(await root.locator(".xt-rankings").count(), 0);
      assert.equal(await page.locator("[data-xtrend-filtered]").count(), 0);
      await root
        .getByRole("checkbox", { name: "Home / recommendations", exact: true })
        .check();
      await root.locator(".xt-rankings").waitFor();
      await root
        .getByRole("switch", { name: "Only popular posts", exact: true })
        .uncheck();
      for (const name of ["Home / recommendations", "Profiles", "Post details"])
        await root.getByRole("checkbox", { name, exact: true }).uncheck();
      await saved();
      await close();
    },
  );
  await check(
    "list/profile/detail scope choices work on navigation and from the real popup",
    async () => {
      await page.goto("https://x.com/i/lists/123");
      await root
        .getByRole("heading", { name: "On this page", exact: true })
        .waitFor();
      await open();
      assert.equal(await root.locator(".xt-current").innerText(), "Current");
      await close();
      await page.goto("https://x.com/fixture_0");
      await page.waitForTimeout(900);
      assert.equal(await root.locator(".xt-rankings").count(), 0);
      const popup = await context.newPage();
      await popup.goto(popupURL);
      await popup
        .getByRole("button", { name: "Rankings", exact: true })
        .click();
      await popup
        .getByRole("checkbox", { name: "Profiles", exact: true })
        .check();
      await popup.getByText("Saved on this device", { exact: true }).waitFor();
      await root.locator(".xt-rankings").waitFor();
      await page.goto("https://x.com/fixture_0/status/1000000000000000001");
      await page.waitForTimeout(900);
      assert.equal(await root.locator(".xt-rankings").count(), 0);
      await popup
        .getByRole("checkbox", { name: "Post details", exact: true })
        .check();
      await popup.getByText("Saved on this device", { exact: true }).waitFor();
      await root.locator(".xt-rankings").waitFor();
      await popup
        .getByRole("checkbox", { name: "Home / recommendations", exact: true })
        .check();
      await popup.getByText("Saved on this device", { exact: true }).waitFor();
      await popup.close();
      await page.goto("https://x.com/search");
      await page.waitForTimeout(900);
      assert.equal(await root.locator(".xt-rankings").count(), 0);
      await page.goto("https://x.com/home");
      await root.locator(".xt-rankings").waitFor();
    },
  );
  const dragTo = async (side) => {
    const header = root.locator(".xt-panel-header"),
      box = await header.boundingBox(),
      viewport = page.viewportSize();
    const desiredLeft = side === "left" ? 8 : viewport.width - 398 - 8;
    await page.mouse.move(box.x + 85, box.y + 25);
    await page.mouse.down();
    await page.mouse.move(desiredLeft + 85, box.y + 25, { steps: 10 });
    await page.mouse.up();
  };
  await check(
    "dragging to either edge really tucks the panel away and persists after reload",
    async () => {
      await dragTo("left");
      await root.locator(".xt-edge-tab.left").waitFor();
      await page.reload();
      await root.locator(".xt-edge-tab.left").waitFor();
      await root.locator(".xt-edge-tab").hover();
      await root.locator(".xt-rankings").waitFor();
      await page.mouse.move(750, 900);
      await root.locator(".xt-edge-tab").waitFor();
      await root.locator(".xt-edge-tab").focus();
      await root.locator(".xt-rankings").waitFor();
      await root
        .locator(".xt-rankings")
        .evaluate((element) =>
          Promise.all(
            element
              .getAnimations()
              .map((animation) => animation.finished.catch(() => {})),
          ),
        );
      const undock = await root.locator(".xt-panel-header").boundingBox();
      await page.mouse.move(undock.x + 85, undock.y + 25);
      await page.mouse.down();
      await page.mouse.move(585, undock.y + 25, { steps: 8 });
      assert.ok((await root.locator(".xt-rankings").boundingBox()).x > 400);
      await page.mouse.up();
      assert.equal(await root.locator(".xt-edge-tab").count(), 0);
      await open();
      await root
        .getByRole("checkbox", { name: "Hide at screen edge", exact: true })
        .uncheck();
      await saved();
      await close();
      await dragTo("right");
      assert.equal(await root.locator(".xt-edge-tab").count(), 0);
      assert.equal(await root.locator(".xt-rankings").isVisible(), true);
      await open();
      await root
        .getByRole("checkbox", { name: "Hide at screen edge", exact: true })
        .check();
      await saved();
      await close();
      const box = await root.locator(".xt-panel-header").boundingBox();
      await page.mouse.move(box.x + 85, box.y + 25);
      await page.mouse.down();
      await page.mouse.move(box.x + 75, box.y + 30, { steps: 3 });
      await page.mouse.up();
      await root.locator(".xt-edge-tab.right").waitFor();
    },
  );
  await check(
    "ranking settings match the reference in Chinese and remain usable at narrow widths",
    async () => {
      await root.locator(".xt-edge-tab").focus();
      await root.locator(".xt-rankings").waitFor();
      await open();
      await root
        .getByRole("checkbox", { name: "Hide at screen edge", exact: true })
        .uncheck();
      await saved();
      await root
        .getByRole("button", { name: "All settings", exact: true })
        .click();
      await root.getByLabel("Language", { exact: true }).selectOption("zh");
      await root.getByRole("button", { name: "保存设置", exact: true }).click();
      await root.getByText("已保存在本机", { exact: true }).waitFor();
      await root
        .getByRole("button", { name: "热度榜设置", exact: true })
        .click();
      await root
        .getByRole("checkbox", { name: "贴边隐藏", exact: true })
        .check();
      await root.getByText("已保存在本机", { exact: true }).waitFor();
      await page.screenshot({ path: join(output, "ranking-settings-zh.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      await root
        .getByRole("heading", { name: "热度榜设置", exact: true })
        .waitFor();
      assert.equal(
        await root.locator(".xt-ranking-settings-dialog").evaluate((dialog) => {
          const box = dialog.getBoundingClientRect();
          return (
            box.left < 0 ||
            box.right > innerWidth ||
            dialog.scrollWidth > dialog.clientWidth
          );
        }),
        false,
      );
      await page.screenshot({
        path: join(output, "ranking-settings-mobile.png"),
      });
      await root.getByRole("button", { name: "关闭", exact: true }).click();
      await page.setViewportSize({ width: 1440, height: 1000 });
    },
  );
}
