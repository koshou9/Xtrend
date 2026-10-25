import assert from "node:assert/strict";
import { join } from "node:path";

export async function runConnectionChecks({ check, page, context, output }) {
  const root = page.locator("#xtrend-workspace"),
    line = root.locator(".xt-connection-line");
  const row = (id) => root.locator(`.xt-ranked-row[data-tweet-id="${id}"]`);
  const first = "1000000000000000001",
    last = "1000000000000000006";
  await page.goto("https://x.com/home");
  await root.locator(".xt-rankings").waitFor();
  await page.waitForTimeout(900);
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }),
  );
  await row(last).waitFor();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await check(
    "clicking a ranked title locates the exact post and draws one highlighted connection",
    async () => {
      await row(last).locator(".xt-excerpt").click();
      await line.waitFor();
      assert.equal(
        await root
          .locator(".xt-tweet-connection")
          .getAttribute("data-tweet-id"),
        last,
      );
      assert.equal(await root.locator(".xt-ranked-row.selected").count(), 1);
      assert.equal(await line.count(), 1);
      await page.waitForFunction((id) => {
        const post = [...document.querySelectorAll("article")].find((a) =>
          a
            .querySelector("time")
            ?.closest("a")
            ?.getAttribute("href")
            ?.includes(id),
        );
        const r = post?.getBoundingClientRect();
        return scrollY > 0 && r && r.top < innerHeight && r.bottom > 0;
      }, last);
      assert.equal(
        await root
          .locator(".xt-tweet-connection")
          .evaluate((el) => getComputedStyle(el).pointerEvents),
        "none",
      );
      await page.screenshot({ path: join(output, "tweet-connection.png") });
      await row(first).locator(".xt-excerpt").click();
      await page.waitForFunction(
        (id) =>
          document
            .querySelector("#xtrend-workspace")
            ?.shadowRoot.querySelector(".xt-tweet-connection")
            ?.getAttribute("data-tweet-id") === id,
        first,
      );
      assert.equal(await line.count(), 1);
      assert.equal(await row(last).getAttribute("aria-current"), null);
    },
  );
  await check(
    "scrolling, resizing and dragging keep the connection attached to the selected row",
    async () => {
      await page.waitForFunction(() => scrollY === 0);
      const before = await line.getAttribute("d");
      await page.mouse.move(720, 700);
      await page.mouse.wheel(0, 100);
      await page.waitForFunction(
        (value) =>
          document
            .querySelector("#xtrend-workspace")
            ?.shadowRoot.querySelector(".xt-connection-line")
            ?.getAttribute("d") !== value,
        before,
      );
      const header = root.locator(".xt-panel-header"),
        box = await header.boundingBox(),
        old = await line.getAttribute("d");
      await page.mouse.move(box.x + 85, box.y + 25);
      await page.mouse.down();
      await page.mouse.move(box.x + 10, box.y + 75, { steps: 8 });
      await page.mouse.up();
      await page.waitForFunction(
        (value) =>
          document
            .querySelector("#xtrend-workspace")
            ?.shadowRoot.querySelector(".xt-connection-line")
            ?.getAttribute("d") !== value,
        old,
      );
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.waitForFunction(
        () =>
          document
            .querySelector("#xtrend-workspace")
            ?.shadowRoot.querySelector(".xt-tweet-connection")
            ?.getAttribute("viewBox") === "0 0 1280 900",
      );
      const end = await root
        .locator(".xt-connection-end")
        .last()
        .evaluate((el) => ({
          x: Number(el.getAttribute("cx")),
          y: Number(el.getAttribute("cy")),
        }));
      const currentRow = await row(first).boundingBox();
      assert.ok(Math.abs(end.x - currentRow.x) < 2);
      assert.ok(Math.abs(end.y - currentRow.y - currentRow.height / 2) < 2);
      await page.setViewportSize({ width: 390, height: 844 });
      await line.waitFor();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#xtrend-workspace")
            ?.shadowRoot.querySelector(".xt-tweet-connection")
            ?.getAttribute("viewBox") === "0 0 390 844",
      );
      const narrow = await line.boundingBox();
      assert.ok(narrow.width > 0);
      await page.screenshot({
        path: join(output, "tweet-connection-narrow.png"),
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
    },
  );
  await check(
    "page controls preserve the line but a real blank-area click clears the line and highlights",
    async () => {
      await page.locator("#native-timeline").click();
      await line.waitFor();
      await page.mouse.click(1400, 930);
      await line.waitFor({ state: "detached" });
      assert.equal(await root.locator(".xt-ranked-row.selected").count(), 0);
      assert.equal(await root.locator(".xt-linked-outline").count(), 0);
    },
  );
  await check(
    "returning restores the original reading position and removes the connection",
    async () => {
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await row(last).locator(".xt-excerpt").click();
      await line.waitFor();
      await root
        .getByRole("button", {
          name: "Return to reading position",
          exact: true,
        })
        .click();
      await line.waitFor({ state: "detached" });
      await page.waitForFunction(() => scrollY === 0);
    },
  );
  await check(
    "removing a virtualized target clears stale connections and a missing target never draws a fake line",
    async () => {
      await row(first).locator(".xt-excerpt").click();
      await line.waitFor();
      await page
        .locator("article")
        .first()
        .evaluate((el) => el.remove());
      await line.waitFor({ state: "detached" });
      const popup = context.waitForEvent("page");
      await row(first).locator(".xt-excerpt").click();
      const detail = await popup;
      assert.equal(await line.count(), 0);
      assert.equal(await row(first).getAttribute("aria-current"), null);
      await detail.close();
    },
  );
  await check(
    "collapsing the panel and switching the timeline clean up the selection",
    async () => {
      await page.goto("https://x.com/home");
      await root.locator(".xt-ranked-row").first().waitFor();
      await row(first).locator(".xt-excerpt").click();
      await line.waitFor();
      await root
        .getByRole("button", { name: "Collapse panel", exact: true })
        .click();
      await line.waitFor({ state: "detached" });
      await root
        .getByRole("button", { name: "Open page rankings", exact: true })
        .click();
      await row(first).locator(".xt-excerpt").click();
      await line.waitFor();
      await page.locator("#route-change").click();
      await line.waitFor({ state: "detached" });
    },
  );
  await check(
    "Pro column scrolling locates the right column and keeps connection endpoints in that visible column",
    async () => {
      await page.goto("https://pro.x.com/");
      await root.locator(".xt-rankings").waitFor();
      await page.waitForTimeout(900);
      await page.locator("#column-1").evaluate((el) => {
        el.scrollTop = 600;
      });
      const target = "1000000000000000010";
      await row(target).waitFor();
      const leftBefore = await page
        .locator("#column-0")
        .evaluate((el) => el.scrollTop);
      await row(target).locator(".xt-excerpt").click();
      await line.waitFor();
      assert.equal(
        await page.locator("#column-0").evaluate((el) => el.scrollTop),
        leftBefore,
      );
      const outline = await root.locator(".xt-linked-outline").boundingBox(),
        column = await page.locator("#column-1").boundingBox();
      assert.ok(outline.x >= column.x - 2);
      assert.ok(outline.y >= column.y - 2);
      assert.ok(outline.y + outline.height <= column.y + column.height + 2);
      const old = await line.getAttribute("d");
      await page.locator("#column-1").evaluate((el) => {
        el.scrollTop -= 30;
      });
      await page.waitForFunction(
        (value) =>
          document
            .querySelector("#xtrend-workspace")
            ?.shadowRoot.querySelector(".xt-connection-line")
            ?.getAttribute("d") !== value,
        old,
      );
      await root
        .getByRole("button", {
          name: "Return to reading position",
          exact: true,
        })
        .click();
      await line.waitFor({ state: "detached" });
      assert.equal(
        await page.locator("#column-1").evaluate((el) => el.scrollTop),
        600,
      );
    },
  );
}
