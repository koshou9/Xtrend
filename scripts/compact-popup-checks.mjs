import assert from "node:assert/strict";
import { join } from "node:path";

export async function runCompactPopupChecks({
  check,
  popup,
  output,
  label,
  native = false,
}) {
  const language = popup.locator(".xt-hub-header select"),
    main = popup.locator(".xt-hub-main"),
    hub = popup.locator(".xt-extension-hub");
  const prefix = native ? "compact-native" : `compact-${label.toLowerCase()}`;
  await popup.setViewportSize({ width: 440, height: 560 });
  await check(
    `${label} compact popup keeps all sections readable in three languages and two themes`,
    async () => {
      for (const lang of ["en", "zh", "ja"]) {
        await language.selectOption(lang);
        for (const theme of ["light", "dark"]) {
          await popup.locator(".xt-hub-tabs button").nth(3).click();
          await popup
            .locator(".xt-hub-inline-label select")
            .selectOption(theme);
          for (let index = 0; index < 7; index++) {
            if (index === 6)
              await popup.locator(".xt-hub-header-tools button").last().click();
            else await popup.locator(".xt-hub-tabs button").nth(index).click();
            const geometry = await hub.evaluate((el) => {
              const main = el.querySelector(".xt-hub-main"),
                header = el.querySelector(".xt-hub-header"),
                nav = el.querySelector(".xt-hub-tabs");
              return {
                width: el.getBoundingClientRect().width,
                overflow:
                  el.scrollWidth > el.clientWidth ||
                  main.scrollWidth > main.clientWidth,
                mainHeight: main.clientHeight,
                header: header.getBoundingClientRect().height,
                nav: nav.getBoundingClientRect().height,
                footerVisible:
                  el.querySelector(".xt-hub-status").getBoundingClientRect()
                    .bottom <= el.getBoundingClientRect().bottom,
              };
            });
            assert.ok(
              geometry.width <= 440 &&
                !geometry.overflow &&
                geometry.mainHeight > 330 &&
                geometry.header <= 56 &&
                geometry.nav <= 54 &&
                geometry.footerVisible,
              `${lang}/${theme}/${index}: ${JSON.stringify(geometry)}`,
            );
            await main.evaluate((el) => {
              el.scrollTop = el.scrollHeight;
            });
            if (await main.evaluate((el) => el.scrollHeight > el.clientHeight))
              assert.ok(await main.evaluate((el) => el.scrollTop > 0));
            await main.evaluate((el) => {
              el.scrollTop = 0;
            });
            if (lang === "zh" && theme === "light" && [0, 6].includes(index))
              await hub.screenshot({
                path: join(
                  output,
                  `${prefix}-${index === 0 ? "filters" : "settings"}-zh.png`,
                ),
              });
          }
        }
      }
    },
  );
  await check(
    `${label} preference dropdowns use bounded aligned fields and preserve native selection`,
    async () => {
      await language.selectOption("en");
      await popup.locator(".xt-hub-header-tools button").last().click();
      const fields = popup.locator(".xt-settings .xt-preferences select");
      const bounds = await fields.evaluateAll((selects) =>
        selects.map((el) => {
          const box = el.getBoundingClientRect(),
            label = el
              .closest("label")
              .querySelector("span")
              .getBoundingClientRect(),
            styles = getComputedStyle(el),
            canvas = document.createElement("canvas"),
            ctx = canvas.getContext("2d");
          ctx.font = styles.font;
          return {
            width: box.width,
            right: box.right,
            labelRight: label.right,
            x: box.x,
            padding: parseFloat(styles.paddingRight),
            textWidth: ctx.measureText(el.selectedOptions[0].textContent).width,
            available:
              el.clientWidth -
              parseFloat(styles.paddingLeft) -
              parseFloat(styles.paddingRight),
          };
        }),
      );
      assert.equal(bounds.length, 2);
      for (const b of bounds)
        assert.ok(
          b.width <= 162 &&
            b.width >= 125 &&
            b.x >= b.labelRight + 8 &&
            b.padding >= 9 &&
            b.textWidth + 7 <= b.available,
          JSON.stringify(b),
        );
      assert.ok(Math.abs(bounds[0].right - bounds[1].right) <= 1);
      const field = fields.first();
      await field.scrollIntoViewIfNeeded();
      await field.focus();
      if (
        await popup.evaluate(() => CSS.supports("appearance", "base-select"))
      ) {
        await field.press("Alt+ArrowDown");
        await popup.screenshot({
          path: join(output, `${prefix}-dropdown-open.png`),
        });
        await popup.keyboard.press("End");
        await popup.keyboard.press("Enter");
      } else {
        // Headless macOS Firefox cannot drive even a bare OS select with keys; use the native control API.
        await field.selectOption("ja");
      }
      assert.equal(await field.inputValue(), "ja");
      await field.selectOption("en");
      await popup.locator(".xt-hub-tabs button").first().click();
    },
  );
  await check(
    `${label} compact popup fits narrow short windows and keeps scrolling and footer accessible`,
    async () => {
      for (const size of [
        { width: 390, height: 560 },
        { width: 320, height: 480 },
      ]) {
        await popup.setViewportSize(size);
        assert.equal(
          await hub.evaluate((el) => el.scrollWidth > el.clientWidth),
          false,
        );
        if (native)
          assert.equal(
            await popup.evaluate(
              () =>
                document.documentElement.scrollWidth > innerWidth ||
                document.documentElement.scrollHeight > innerHeight,
            ),
            false,
          );
        await popup.locator(".xt-hub-header-tools button").last().click();
        await main.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        assert.ok(await main.evaluate((el) => el.scrollTop > 0));
        await hub.screenshot({
          path: join(output, `${prefix}-${size.width}.png`),
        });
        await popup.locator(".xt-hub-tabs button").first().click();
        await main.evaluate((el) => {
          el.scrollTop = 0;
        });
      }
      await popup.setViewportSize({ width: 440, height: 560 });
      await popup.emulateMedia({ forcedColors: "active" });
      await popup.locator(".xt-hub-header-tools button").last().click();
      assert.equal(
        await popup
          .locator(".xt-settings .xt-preferences select")
          .first()
          .evaluate((el) => getComputedStyle(el).appearance),
        "auto",
      );
      await popup.emulateMedia({ forcedColors: "none" });
      await popup.locator(".xt-hub-tabs button").nth(3).click();
      await popup.locator(".xt-hub-inline-label select").selectOption("auto");
      await popup.locator(".xt-hub-tabs button").first().click();
    },
  );
}
