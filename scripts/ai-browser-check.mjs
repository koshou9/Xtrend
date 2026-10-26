import { chromium } from "playwright";
import { mkdtemp, cp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import assert from "node:assert/strict";

const output = resolve("test-results"),
  requests = [],
  results = [];
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  let text = "";
  for await (const part of req) text += part;
  requests.push({
    path: req.url,
    authorization: req.headers.authorization ?? "",
    body: JSON.parse(text),
  });
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      choices: [
        {
          message: {
            content:
              "```\nFirst choice\n```\n```\nSecond choice\n```\n```\nThird choice\n```",
          },
        },
      ],
    }),
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
const temp = await mkdtemp(join(tmpdir(), "xtrend-ai-"));
const extension = join(temp, "extension");
await cp(resolve(".output/chrome-mv3"), extension, { recursive: true });
const manifestPath = join(extension, "manifest.json"),
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
// Only this isolated test copy pregrants loopback; the shipped manifest remains unchanged.
manifest.host_permissions = [
  ...(manifest.host_permissions ?? []),
  "http://127.0.0.1/*",
];
await writeFile(manifestPath, JSON.stringify(manifest));
let context,
  nativeMissing = false;
const grokRequests = [];
const check = async (name, fn) => {
  await fn();
  results.push(name);
  console.log("PASS", name);
};
try {
  context = await chromium.launchPersistentContext(join(temp, "profile"), {
    channel: "chromium",
    headless: true,
    locale: "en-US",
    viewport: { width: 1200, height: 950 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  await context.route("https://x.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/i/grok")
      return route.fulfill({
        contentType: "text/html",
        body: `<main><textarea aria-label="Ask Grok"></textarea><button aria-label="Send">Send</button>${nativeMissing ? "" : '<button aria-label="Private">Private</button>'}</main><script src="/grok-fixture.js"></script>`,
      });
    if (url.pathname === "/grok-fixture.js")
      return route.fulfill({
        contentType: "application/javascript",
        body: `let temporary=false;document.querySelector('[aria-label="Private"]')?.addEventListener('click',()=>{temporary=true;const p=document.createElement('p');p.textContent="This chat won't appear in your history";document.querySelector('main').append(p);});document.querySelector('[aria-label="Send"]').onclick=()=>fetch('/i/api/2/grok/add_response.json',{method:'POST',body:JSON.stringify({message:document.querySelector('textarea').value,temporary})});`,
      });
    if (url.pathname === "/i/api/2/grok/add_response.json") {
      grokRequests.push(JSON.parse(route.request().postData()));
      return route.fulfill({
        contentType: "text/event-stream",
        body:
          "data: " +
          JSON.stringify({
            result: { response: { token: "```\nPrivate reply\n```" } },
          }) +
          "\n\ndata: [DONE]\n",
      });
    }
    return route.fulfill({
      contentType: "text/html",
      body: `<main><article data-testid="tweet"><div data-testid="User-Name"><a href="/fixture">Fixture Author</a><a href="/fixture/status/123456789"><time datetime="2026-10-25T00:00:00Z">1h</time></a></div><div data-testid="tweetText">Representative original post.</div><div role="group"><button data-testid="reply">Reply</button><button data-testid="retweet">Repost</button><button data-testid="like">Like</button><button data-testid="share" aria-haspopup="menu">Share</button><a href="/fixture/status/123456789/analytics" aria-label="48000 Views">Views</a></div></article></main>`,
    });
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage(),
    popup = await context.newPage();
  page.setDefaultTimeout(12000);
  popup.setDefaultTimeout(12000);
  await page.goto("https://x.com/home");
  const workspace = page.locator("#xtrend-workspace");
  await page
    .locator("article")
    .getByRole("button", { name: "Grok reply assistant", exact: true })
    .waitFor();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator(".xt-hub-header select").selectOption("en");
  await popup.getByRole("button", { name: "AI replies", exact: true }).click();
  const save = async () => {
    await popup
      .getByRole("button", { name: "Save", exact: true })
      .last()
      .click();
    await popup
      .locator('.xt-ai-settings > [role="status"]')
      .filter({ hasText: "Saved on this device" })
      .waitFor();
  };
  const openAssistant = async () => {
    await page
      .locator("article")
      .getByRole("button", { name: "Grok reply assistant", exact: true })
      .click();
  };
  const closeAssistant = async () => {
    await workspace.getByRole("button", { name: "Close", exact: true }).click();
  };
  await check(
    "narrow flat popup and editable templates save and reopen",
    async () => {
      assert.equal(
        await popup
          .locator(".xt-extension-hub")
          .evaluate((el) => el.getBoundingClientRect().width),
        360,
      );
      assert.equal(
        await popup
          .locator(".xt-hub-card")
          .first()
          .evaluate((el) => getComputedStyle(el).borderRadius),
        "0px",
      );
      await popup
        .getByRole("button", { name: "Add template", exact: true })
        .click();
      await popup
        .getByLabel("Template name", { exact: true })
        .fill("My reply style");
      await popup
        .getByLabel("Template instructions", { exact: true })
        .fill("Make it precise.");
      await popup.getByLabel("Number of comments", { exact: true }).fill("3");
      await save();
      await popup.reload();
      await popup
        .getByRole("button", { name: "AI replies", exact: true })
        .click();
      assert.equal(
        await popup.getByLabel("Template name", { exact: true }).inputValue(),
        "My reply style",
      );
      assert.equal(
        await popup
          .getByLabel("Number of comments", { exact: true })
          .inputValue(),
        "3",
      );
    },
  );
  await check(
    "OpenAI compatible generation reaches a real local test server and returns selectable replies",
    async () => {
      await popup.getByRole("button", { name: /OpenAI compatible/ }).click();
      await popup.getByLabel("Service address", { exact: true }).fill(endpoint);
      await popup
        .getByLabel("Model name", { exact: true })
        .fill("test-compatible-model");
      await popup
        .getByLabel("API key", { exact: true })
        .fill("synthetic-test-key");
      await save();
      await openAssistant();
      await workspace
        .getByRole("button", { name: "Generate draft", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#xtrend-workspace")
            .shadowRoot.querySelector(".xt-draft")?.value === "First choice",
      );
      assert.equal(requests.at(-1).authorization, "Bearer synthetic-test-key");
      assert.equal(requests.at(-1).path, "/v1/chat/completions");
      assert.match(
        requests.at(-1).body.messages[0].content,
        /Representative original post/,
      );
      assert.match(requests.at(-1).body.messages[0].content, /exactly 3/);
      await workspace
        .getByLabel("Choose a reply", { exact: true })
        .selectOption("1");
      assert.equal(
        await workspace.locator(".xt-draft").inputValue(),
        "Second choice",
      );
      await workspace.locator(".xt-draft").fill("Edited second choice");
      await workspace
        .getByLabel("Choose a reply", { exact: true })
        .selectOption("0");
      await workspace
        .getByLabel("Choose a reply", { exact: true })
        .selectOption("1");
      assert.equal(
        await workspace.locator(".xt-draft").inputValue(),
        "Edited second choice",
      );
      await workspace.screenshot({
        path: join(output, "ai-comment-options.png"),
      });
      await closeAssistant();
      await popup.reload();
      await popup
        .getByRole("button", { name: "AI replies", exact: true })
        .click();
      assert.equal(
        await popup.getByLabel("API key", { exact: true }).inputValue(),
        "",
      );
    },
  );
  await check(
    "Ollama uses the local server without sending the other service key",
    async () => {
      await popup.getByRole("button", { name: /Ollama/ }).click();
      await popup.getByLabel("Service address", { exact: true }).fill(endpoint);
      await popup
        .getByLabel("Model name", { exact: true })
        .fill("test-local-model");
      await save();
      await openAssistant();
      await workspace
        .getByRole("button", { name: "Generate draft", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#xtrend-workspace")
            .shadowRoot.querySelector(".xt-draft")?.value === "First choice",
      );
      assert.equal(requests.at(-1).authorization, "");
      assert.equal(requests.at(-1).body.model, "test-local-model");
      await closeAssistant();
    },
  );
  await check(
    "Grok temporary mode confirms the native privacy message before sending",
    async () => {
      await popup.getByRole("button", { name: /X Grok/ }).click();
      await popup
        .getByRole("switch", {
          name: "Use temporary chat (keep Grok history clean)",
          exact: true,
        })
        .check();
      await save();
      await openAssistant();
      await workspace
        .getByRole("button", { name: "Generate draft", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#xtrend-workspace")
            .shadowRoot.querySelector(".xt-draft")?.value === "Private reply",
      );
      assert.equal(grokRequests.at(-1).temporary, true);
      await closeAssistant();
    },
  );
  await check(
    "Grok refuses to send if temporary mode cannot be confirmed",
    async () => {
      nativeMissing = true;
      const before = grokRequests.length;
      await openAssistant();
      await workspace
        .getByRole("button", { name: "Generate draft", exact: true })
        .click();
      await workspace.getByRole("alert").waitFor();
      assert.equal(grokRequests.length, before);
      assert.equal(await workspace.locator(".xt-draft").inputValue(), "");
      await closeAssistant();
    },
  );
  await check(
    "template deletion and restore work; Chinese layout stays within its bounds",
    async () => {
      await popup
        .getByRole("button", {
          name: "Delete template: My reply style",
          exact: true,
        })
        .click();
      assert.equal(
        await popup
          .getByRole("button", { name: "My reply style", exact: true })
          .count(),
        0,
      );
      await popup
        .getByRole("button", { name: "Restore default templates", exact: true })
        .click();
      await save();
      await popup.locator(".xt-hub-header select").selectOption("zh");
      await popup.locator(".xt-hub-main").evaluate((el) => (el.scrollTop = 0));
      assert.equal(
        await popup
          .locator(".xt-hub-main")
          .evaluate((el) => el.scrollWidth > el.clientWidth),
        false,
      );
      await popup
        .locator(".xt-extension-hub")
        .screenshot({ path: join(output, "ai-settings-zh.png") });
    },
  );
  await writeFile(
    join(output, "ai-browser-results.json"),
    JSON.stringify(
      {
        notice:
          "Isolated Chrome with synthetic X and real loopback AI service. No live AI account or real key used.",
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await context?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
