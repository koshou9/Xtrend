import assert from "node:assert/strict";
import { join } from "node:path";

export async function runDockingChecks({ check, context, output }) {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const original = await worker.evaluate(
    async () =>
      (await chrome.storage.local.get("settings:v1"))["settings:v1"] ?? {},
  );
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const root = page.locator("#xtrend-workspace"),
    panel = root.locator(".xt-rankings"),
    tab = root.locator(".xt-edge-tab");
  const drag = async (locator, x, y) => {
    await locator.evaluate(async (element) => {
      const panel = element.closest(".xt-rankings");
      await Promise.all(
        [...element.getAnimations(), ...(panel?.getAnimations() ?? [])].map(
          (animation) => animation.finished.catch(() => {}),
        ),
      );
    });
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + Math.min(85, box.width / 2), box.y + 25);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 12 });
    await page.mouse.up();
  };
  try {
    await page.goto("https://x.com/home");
    await panel.waitFor();
    await page.waitForTimeout(900);
    await check(
      "new collapse button slides continuously to the nearest right edge",
      async () => {
        await root
          .getByRole("button", { name: "Collapse to screen edge", exact: true })
          .click();
        const motion = await panel.evaluate(
          (element) =>
            new Promise((resolve) => {
              const samples = [],
                start = performance.now();
              const frame = () => {
                samples.push({
                  x: element.getBoundingClientRect().x,
                  opacity: Number(getComputedStyle(element).opacity),
                });
                if (performance.now() - start < 430)
                  requestAnimationFrame(frame);
                else resolve(samples);
              };
              requestAnimationFrame(frame);
            }),
        );
        assert.ok(
          new Set(motion.map((sample) => Math.round(sample.x))).size >= 3,
          "folding should contain intermediate positions",
        );
        assert.ok(
          motion.some((sample) => sample.opacity > 0 && sample.opacity < 1),
          "folding should fade continuously",
        );
        for (let i = 1; i < motion.length; i++)
          assert.ok(motion[i].x >= motion[i - 1].x - 1);
        await panel.waitFor({ state: "hidden" });
        await root.locator(".xt-edge-tab.right").waitFor();
        await page.screenshot({
          path: join(output, "docking-folded-right.png"),
        });
      },
    );
    await check(
      "dragging the folded edge tab directly restores a floating panel and saves its new position",
      async () => {
        const box = await tab.boundingBox();
        await page.mouse.move(box.x + 14, box.y + 25);
        await page.mouse.down();
        await page.mouse.move(box.x - 486, box.y + 105, { steps: 12 });
        assert.ok((await panel.boundingBox()).x < 700);
        assert.equal(
          await panel.evaluate(
            (element) => getComputedStyle(element).transitionDuration,
          ),
          "0s",
        );
        await page.mouse.up();
        assert.equal(await tab.count(), 0);
        await page.waitForTimeout(120);
        await page.reload();
        await panel.waitFor();
        assert.equal(await tab.count(), 0);
        assert.ok((await panel.boundingBox()).x < 700);
        await page.screenshot({
          path: join(output, "docking-dragged-open.png"),
        });
      },
    );
    await check(
      "dragging to the left edge folds automatically and the button also chooses the nearest left edge",
      async () => {
        await drag(root.locator(".xt-panel-header"), 93, 200);
        await panel.waitFor({ state: "hidden" });
        await root.locator(".xt-edge-tab.left").waitFor();
        await page.reload();
        await root.locator(".xt-edge-tab.left").waitFor();
        await drag(tab, 374, 240);
        await panel.waitFor();
        assert.equal(await tab.count(), 0);
        await root
          .getByRole("button", { name: "Collapse to screen edge", exact: true })
          .click();
        await panel.waitFor({ state: "hidden" });
        await root.locator(".xt-edge-tab.left").waitFor();
      },
    );
    await check(
      "reduced-motion settings keep collapse and hover expansion usable without animation",
      async () => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await tab.hover();
        await panel.waitFor();
        await root
          .getByRole("button", { name: "Collapse to screen edge", exact: true })
          .click();
        await panel.waitFor({ state: "hidden" });
        assert.equal(
          await panel.evaluate(
            (element) => getComputedStyle(element).transitionDuration,
          ),
          "0s",
        );
        await tab.waitFor();
        await page.emulateMedia({ reducedMotion: "no-preference" });
      },
    );
    await check(
      "a folded tab can be dragged free in a narrow viewport and the restored panel remains on screen",
      async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await drag(tab, 195, 270);
        await panel.waitFor();
        assert.equal(await tab.count(), 0);
        const box = await panel.boundingBox();
        assert.ok(box.x >= 7 && box.x + box.width <= 383);
        await page.screenshot({
          path: join(output, "docking-mobile-open.png"),
        });
      },
    );
    await check(
      "cancelled drags restore the previous position and never leave a stuck dragging state",
      async () => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        const header = root.locator(".xt-panel-header"),
          box = await header.boundingBox();
        await page.mouse.move(box.x + 85, box.y + 25);
        await page.mouse.down();
        await page.mouse.move(650, 400, { steps: 8 });
        await header.dispatchEvent("pointercancel", {
          pointerId: 1,
          isPrimary: true,
        });
        await page.mouse.up();
        await page.waitForTimeout(430);
        assert.equal(await root.locator(".is-dragging").count(), 0);
        assert.equal(await tab.count(), 0);
        const restored = await header.boundingBox();
        assert.ok(
          Math.abs(restored.x - box.x) <= 1 &&
            Math.abs(restored.y - box.y) <= 1,
        );
      },
    );
  } catch (error) {
    await page.screenshot({ path: join(output, "docking-failure.png") });
    throw error;
  } finally {
    await worker.evaluate(async (original) => {
      const current = (await chrome.storage.local.get("settings:v1"))[
        "settings:v1"
      ];
      await chrome.storage.local.set({
        "settings:v1": {
          ...current,
          position: original.position ?? null,
          dock: original.dock ?? null,
          edgeHide: original.edgeHide ?? true,
        },
      });
    }, original);
    await page.waitForTimeout(430);
    await page.close();
  }
}
