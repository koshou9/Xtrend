import { runResearchChecks } from "./research-checks.mjs";
import { chromium, firefox } from "playwright";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import sharp from "sharp";
import { runRankingChecks } from "./ranking-checks.mjs";
import { runConnectionChecks } from "./connection-checks.mjs";
import { runFeatureChecks } from "./feature-checks.mjs";
import { runImprovementChecks } from "./improvement-checks.mjs";
import { runMetricsChecks } from "./metrics-checks.mjs";
import { runDockingChecks } from "./docking-checks.mjs";
import { runAuditRuntimeChecks } from "./audit-runtime-checks.mjs";
import { runVisualChecks } from "./visual-checks.mjs";
import { runCompactPopupChecks } from "./compact-popup-checks.mjs";
import { runTooltipChecks } from "./tooltip-checks.mjs";

const output = resolve("test-results");
await mkdir(output, { recursive: true });
const results = [],
  errors = [];
async function check(name, fn) {
  await fn();
  results.push({ name, status: "passed" });
  process.stdout.write(`PASS ${name}\n`);
}
const id = "1000000000000000001";
const makeTweet = (suffix = 0, views = 48000) => ({
  __typename: "Tweet",
  rest_id: String(BigInt(id) + BigInt(suffix)),
  core: {
    user_results: {
      result: {
        __typename: "User",
        rest_id: String(9001 + suffix),
        legacy: {
          name: `Fixture Author ${suffix + 1}`,
          screen_name: `fixture_${suffix}`,
          profile_image_url_https: `https://pbs.twimg.com/profile_images/author_${suffix}/current.jpg`,
        },
      },
    },
  },
  views: { count: suffix === 2 ? undefined : String(views) },
  legacy: {
    full_text: `Synthetic post ${suffix + 1}. A representative paragraph for local extension testing.\nA second line.`,
    created_at: new Date(Date.now() - (2 + suffix) * 3600000).toUTCString(),
    favorite_count: 120 + suffix,
    retweet_count: 30 + suffix,
    reply_count: 10 + suffix,
    bookmark_count: suffix === 2 ? undefined : 20 + suffix,
    truncated: false,
    extended_entities: {
      media: [
        {
          type: "photo",
          media_url_https: "https://pbs.twimg.com/media/xtrendfixture.jpg",
        },
      ],
    },
  },
});
const pageScript = `
  const origin = location.origin;
  const call = async (operation, variables) => fetch(origin + '/i/api/graphql/fixture/' + operation + '?variables=' + encodeURIComponent(JSON.stringify(variables))).then(r=>r.json()).then(data=>{if(operation==='TweetDetail')for(const tweet of data.data.timeline.entries){const article=[...document.querySelectorAll('article')].find(a=>a.querySelector('time')?.closest('a')?.getAttribute('href')?.includes(tweet.rest_id));const body=article?.querySelector('[data-testid="tweetText"]');if(body)body.textContent=tweet.legacy.full_text;}return data;});
  document.getElementById('native-timeline').onclick = () => call('HomeTimeline',{});
  const boost=document.createElement('button'); boost.id='native-boost'; boost.textContent='Native updated views'; document.querySelector('nav').append(boost); boost.onclick=()=>call('HomeTimeline',{boost:true});
  document.getElementById('native-reposts').onclick = () => call('Retweeters',{tweetId:'${id}',count:20});
  document.getElementById('native-quotes').onclick = () => call('QuoteTweets',{tweetId:'${id}',count:20});
  document.getElementById('native-grok').onclick = () => fetch('/i/api/2/grok/add_response.json',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Synthetic setup request',temporary:false})}).then(r=>r.text());
  document.getElementById('account-change').onclick = () => document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]').textContent='Fixture @other_account';
  document.getElementById('route-change').onclick = () => { history.pushState({},'', '/following'); document.querySelector('main').replaceChildren(); };
  document.querySelectorAll('[data-testid="share"]').forEach(button=>button.onclick=()=>{document.querySelector('[role="menu"]')?.remove(); const menu=document.createElement('div');menu.role='menu';menu.style='position:fixed;top:60px;left:15px;background:white;z-index:9999;padding:15px'; menu.textContent='Native share menu';document.body.append(menu);});
  setTimeout(()=>call(location.pathname.includes('/status/') ? 'TweetDetail' : 'HomeTimeline',{}),500);
`;
const markup = (multi = false) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>Xtrend synthetic ${multi ? "Pro" : "X"} fixture</title><style>body{margin:0;font:14px system-ui;background:#faf9f5;color:#222}nav{padding:14px;position:sticky;top:0;background:#eee;z-index:1}button{cursor:pointer;padding:7px;margin:3px}main{${multi ? "display:flex;height:650px;overflow-x:auto;" : "width:600px;max-width:100%;margin:0 0 0 80px;"}}.column{${multi ? "overflow:auto;min-width:560px;height:620px;" : ""}}article{padding:25px;border-bottom:1px solid #ddd;min-height:220px}article header{display:flex;align-items:center;gap:10px}article time{font-size:12px}img{width:100px;height:60px;object-fit:cover}[data-testid=tweetText]{font-size:18px;line-height:1.6;margin:15px 0}[role=group]{display:flex;gap:15px}h1{font-size:20px}</style></head><body><nav><strong>LOCAL TEST FIXTURE · no real X connection</strong><button data-testid="SideNav_AccountSwitcher_Button">Fixture @fixture_account</button><button id="native-timeline">Native timeline</button><button id="native-reposts">Native reposts</button><button id="native-quotes">Native quotes</button><button id="native-grok">Native Grok</button><button id="account-change">Switch fixture account</button><button id="route-change">Switch route</button></nav><main>${[
    0, 1,
  ]
    .slice(0, multi ? 2 : 1)
    .map(
      (column) =>
        `<section class="column" id="column-${column}">${Array.from(
          { length: 6 },
          (_, i) => {
            const n = i + column * 6;
            return `<article data-testid="tweet"><header><div data-testid="User-Name"><a href="/fixture_${n}">Fixture Author ${n + 1}</a><span><a href="/fixture_${n}/status/${BigInt(id) + BigInt(n)}"><time datetime="${new Date(Date.now() - (2 + n) * 3600000).toISOString()}">${n + 2}h</time></a></span></div></header><div data-testid="tweetText">Synthetic post ${n + 1}. A representative paragraph for local extension testing.<br>A second line.</div><a href="/fixture_${n}/status/${BigInt(id) + BigInt(n)}/photo/1"><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/xtrendfixture.jpg" alt="Fixture photo"></div></a><div role="group"><button data-testid="reply" aria-label="10 Replies">Reply</button><button data-testid="retweet" aria-label="30 Reposts">Repost</button><button data-testid="like" aria-label="120 Likes">Like</button><a href="/fixture_${n}/status/${BigInt(id) + BigInt(n)}/analytics" aria-label="${n === 2 ? "48K" : "48000"} Views">Views</a><button data-testid="bookmark">Bookmark</button><button data-testid="share" aria-haspopup="menu" aria-label="Share post">Share</button></div></article>`;
          },
        ).join("")}</section>`,
    )
    .join("")}</main><script src="/fixture.js"></script></body></html>`;
const image = await sharp({
  create: { width: 900, height: 2300, channels: 3, background: "#d8dbc3" },
})
  .jpeg()
  .toBuffer();
const profile = await mkdtemp(join(tmpdir(), "xtrend-browser-"));
let context, activePage;
try {
  const extension = resolve(".output/chrome-mv3");
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    locale: "en-US",
    viewport: { width: 1440, height: 1000 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const requests = [];
  let failGraph = false;
  let renderedGrok = false;
  let xhrGrok = false;
  let classicGrok = false;
  let avatarVersion = 1;
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.protocol === "chrome-extension:") return route.continue();
    if (!["x.com", "pro.x.com", "pbs.twimg.com"].includes(url.hostname)) {
      errors.push(`Unexpected external request: ${url.origin}`);
      return route.abort();
    }
    requests.push({
      host: url.hostname,
      path: url.pathname,
      method: request.method(),
      variables: url.searchParams.get("variables"),
    });
    if (
      url.hostname === "pbs.twimg.com" &&
      url.pathname.includes("broken_avatar")
    )
      return route.fulfill({ status: 404, body: "" });
    if (url.hostname === "pbs.twimg.com")
      return route.fulfill({
        status:
          url.searchParams.get("name") === "4096x4096" ||
          url.pathname.includes("broken_avatar")
            ? 404
            : 200,
        contentType: "image/jpeg",
        body: image,
      });
    if (/^\/i\/status\/\d+\/(retweets|quotes)$/.test(url.pathname)) {
      return route.fulfill({
        contentType: "text/html",
        headers: {
          "X-Frame-Options": "DENY",
          "Content-Security-Policy": "frame-ancestors 'none'",
        },
        body: `<!doctype html><html><head><meta charset="utf-8"></head><body><main style="height:2500px">Native list</main><script src="/native-list.js"></script></body></html>`,
      });
    }
    if (url.pathname === "/native-list.js")
      return route.fulfill({
        contentType: "application/javascript",
        body: `
      let loading=false,pageNo=0;
      const load=async()=>{if(loading||pageNo>=2)return;loading=true;await fetch('/i/api/graphql/current-native/'+(location.pathname.endsWith('/retweets')?'Retweeters':'QuoteTweets')+'?variables='+encodeURIComponent(JSON.stringify({tweetId:'${id}',count:20,...(pageNo++?{cursor:'fixture-page-2'}:{})})),{headers:{'x-client-transaction-id':'fresh-from-X'}});loading=false;if(pageNo===1)setTimeout(()=>void load(),150);};
      window.addEventListener('scroll',()=>void load());setTimeout(()=>void load(),100);
    `,
      });
    if (url.pathname === "/i/grok")
      return route.fulfill({
        contentType: "text/html",
        headers: {
          "X-Frame-Options": "DENY",
          "Content-Security-Policy": "frame-ancestors 'none'",
        },
        body: `<!doctype html><html><head><meta charset="utf-8"></head><body><main><textarea aria-label="Ask Grok"></textarea><button aria-label="Send">Send</button></main><script src="/native-grok.js"></script></body></html>`,
      });
    if (url.pathname === "/native-grok.js")
      return route.fulfill({
        contentType: "application/javascript",
        body: renderedGrok
          ? `
      document.querySelector('button').addEventListener('click',()=>{
        const stop=document.createElement('button');stop.ariaLabel='Stop';document.querySelector('main').append(stop);
        const answer=document.createElement('div');answer.className=${classicGrok ? "''" : "'leading-relaxed wrap-break-word'"};answer.textContent='Native rendered';
        if(${classicGrok}) { const row=document.createElement('div');const text=document.createElement('div');text.dir='ltr';answer.append(text);const toolbar=document.createElement('div');const copy=document.createElement('button');copy.ariaLabel='复制文本';toolbar.append(copy);const suggestions=document.createElement('button');suggestions.textContent='Suggested follow-up must not be in the draft';row.append(answer,toolbar,suggestions);document.querySelector('main').append(row); } else document.querySelector('main').append(answer);
        setTimeout(()=>{if(${classicGrok}) {answer.textContent='';const content=document.createElement('div');content.dir='ltr';content.textContent='Native rendered draft.';answer.append(content);}else answer.textContent='Native rendered draft.';stop.remove();},3500);
      });
    `
          : xhrGrok
            ? `
      document.querySelector('button').addEventListener('click',()=>{const xhr=new XMLHttpRequest();xhr.open('POST','/i/api/2/grok/add_response.json');xhr.setRequestHeader('content-type','application/json');xhr.send(JSON.stringify({message:document.querySelector('textarea').value}));});
    `
            : `
      document.querySelector('button').addEventListener('click',async()=>{const prompt=document.querySelector('textarea').value;
        const response=await fetch('/rest/app-chat/conversations/new',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:prompt})});
        const answer=document.createElement('div');answer.className='markdown';answer.textContent=await response.text();document.querySelector('main').append(answer);
      });
    `,
      });
    if (url.pathname === "/rest/app-chat/conversations/new")
      return route.fulfill({
        contentType: "text/event-stream",
        body: 'data: {"result":{"response":{"token":"Native draft."}}}\n\ndata: [DONE]\n',
      });
    if (url.pathname === "/fixture.js")
      return route.fulfill({
        contentType: "application/javascript",
        body: pageScript,
      });
    if (
      url.pathname.endsWith("/HomeTimeline") ||
      url.pathname.endsWith("/TweetDetail")
    ) {
      const detail = url.pathname.endsWith("/TweetDetail"),
        texts = [
          "Full video in my bio",
          "Full video in my bio",
          "A thoughtful reply",
          "check my bio",
          "secret promo phrase",
          "An ordinary reply",
        ];
      const entries = Array.from({ length: 12 }, (_, i) => {
        const tweet = makeTweet(
          i,
          48000 -
            i * 2500 +
            (JSON.parse(url.searchParams.get("variables") ?? "{}").boost
              ? 10000
              : 0),
        );
        if (detail && i < 6) {
          tweet.legacy.full_text = texts[i];
          if (i) tweet.legacy.in_reply_to_status_id_str = id;
        }
        return tweet;
      });
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ data: { timeline: { entries } } }),
      });
    }
    if (url.pathname.endsWith("/Retweeters")) {
      if (failGraph)
        return route.fulfill({
          status: 429,
          contentType: "application/json",
          body: "{}",
        });
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            users: Array.from({ length: 6 }, (_, i) => ({
              __typename: "User",
              rest_id: String(7001 + i),
              ...(i > 0 && i < 5
                ? {
                    avatar: {
                      image_url: `https://pbs.twimg.com/profile_images/${avatarVersion}/${i === 2 ? "broken_avatar" : `reader_${i}`}.jpg`,
                    },
                  }
                : {}),
              legacy: {
                name: `Reader ${i + 1}`,
                screen_name: `reader_fixture_${i}`,
                ...(i === 0
                  ? {
                      profile_image_url_https: `https://pbs.twimg.com/profile_images/${avatarVersion}/reader_0.jpg`,
                    }
                  : {}),
              },
            })),
            cursor: {
              cursorType: "Bottom",
              value: JSON.parse(url.searchParams.get("variables") ?? "{}")
                .cursor
                ? ""
                : "fixture-page-2",
            },
          },
        }),
      });
    }
    if (url.pathname.endsWith("/QuoteTweets")) {
      const quote = makeTweet(50);
      quote.legacy.quoted_status_id_str = id;
      quote.legacy.full_text = "A synthetic quote from a real-shaped response.";
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ data: { entries: [quote] } }),
      });
    }
    if (url.pathname === "/i/api/2/grok/add_response.json")
      return route.fulfill({
        contentType: "text/event-stream",
        body: 'data: {"result":{"response":{"token":"Synthetic "}}}\n\ndata: {"result":{"response":{"token":"draft."}}}\n\ndata: [DONE]\n',
      });
    return route.fulfill({
      contentType: "text/html",
      headers: {
        "Content-Security-Policy":
          "script-src 'self'; object-src 'none'; font-src 'self' data:; img-src 'self' https://pbs.twimg.com;",
      },
      body: markup(url.hostname === "pro.x.com"),
    });
  });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error")
      process.stdout.write(`BROWSER ${message.text().slice(0, 500)}\n`);
  });
  const workspace = page.locator("#xtrend-workspace");
  await check(
    "packaged Chrome extension loads on matching X pages",
    async () => {
      await page.goto("https://x.com/home");
      await workspace
        .getByRole("heading", { name: "On this page", exact: true })
        .waitFor();
      await page.waitForTimeout(900);
      assert.ok((await page.locator("article [data-xtrend]").count()) >= 6);
    },
  );
  await check("passive reading makes no extension data requests", async () => {
    const before = requests.filter((r) => r.path.startsWith("/i/api/")).length;
    await page.waitForTimeout(1300);
    assert.equal(
      requests.filter((r) => r.path.startsWith("/i/api/")).length,
      before,
    );
  });
  await check(
    "real-shaped response updates badges and missing bookmark counts remain unknown",
    async () => {
      const first = page.locator("article").first();
      await first.locator(".xt-badge").focus();
      await page.getByRole("tooltip").waitFor();
      assert.match(
        await page.getByRole("tooltip").innerText(),
        /Bookmarks\s+20/,
      );
      await first.locator(".xt-badge").blur();
    },
  );
  await runMetricsChecks({ check, context, output });
  const tooltipPage = await context.newPage();
  try {
    await tooltipPage.goto("https://x.com/home");
    await tooltipPage.locator("article .xt-badge").first().waitFor();
    await runTooltipChecks({
      check,
      page: tooltipPage,
      output,
      label: "Chrome",
    });
    await tooltipPage.goto("https://pro.x.com/");
    await tooltipPage.locator("article .xt-badge").first().waitFor();
    await check(
      "Pro column scrolling closes the badge card and removed tweets leave no card",
      async () => {
        const badge = tooltipPage.locator("article .xt-badge").first();
        await badge.focus();
        await tooltipPage.getByRole("tooltip").waitFor();
        await tooltipPage
          .locator("#column-0")
          .evaluate((column) => (column.scrollTop = 40));
        await tooltipPage.getByRole("tooltip").waitFor({ state: "detached" });
        await badge.blur();
        await badge.focus();
        await tooltipPage.getByRole("tooltip").waitFor();
        await tooltipPage
          .locator("article")
          .first()
          .evaluate((article) => article.remove());
        await tooltipPage.getByRole("tooltip").waitFor({ state: "detached" });
        assert.equal(
          await tooltipPage.locator('[data-xtrend="tooltip"]').count(),
          0,
        );
      },
    );
  } finally {
    await tooltipPage.close();
  }
  await runDockingChecks({ check, context, output });
  await check("page ranking columns reorder with keyboard", async () => {
    await workspace.getByRole("button", { name: "Post", exact: true }).focus();
    await page.keyboard.press("Alt+ArrowRight");
    await page.waitForFunction(
      () =>
        document
          .querySelector("#xtrend-workspace")
          .shadowRoot.querySelector(".xt-table-head .xt-col-label")
          ?.textContent === "Views",
    );
  });
  await check("floating panel can be dragged and collapsed", async () => {
    const header = workspace.locator(".xt-panel-header"),
      before = await header.boundingBox();
    await page.mouse.move(before.x + 100, before.y + 26);
    await page.mouse.down();
    await page.mouse.move(before.x - 70, before.y + 80, { steps: 6 });
    await page.mouse.up();
    const after = await header.boundingBox();
    assert.ok(after.x < before.x);
    await workspace.getByRole("button", { name: "Collapse panel" }).click();
    await workspace.getByRole("button", { name: "Open page rankings" }).click();
  });
  await check(
    "threshold settings and language changes propagate into the timeline",
    async () => {
      await workspace
        .getByRole("button", { name: "Settings", exact: true })
        .click();
      await workspace
        .getByRole("button", { name: "All settings", exact: true })
        .click();
      await workspace.getByLabel("Rising starts at").fill("2000");
      await workspace.getByLabel("Viral starts at").fill("20000");
      await workspace
        .getByLabel("Language", { exact: true })
        .selectOption("zh");
      await workspace
        .getByRole("button", { name: "保存设置", exact: true })
        .click();
      await workspace.getByText("已保存在本机", { exact: true }).waitFor();
      await workspace
        .getByRole("button", { name: "关闭", exact: true })
        .click();
      assert.ok(
        await workspace
          .getByRole("heading", { name: "本页热榜", exact: true })
          .isVisible(),
      );
    },
  );
  await check(
    "Japanese settings are complete and can switch back to English",
    async () => {
      await workspace
        .getByRole("button", { name: "设置", exact: true })
        .click();
      await workspace
        .getByRole("button", { name: "全部设置", exact: true })
        .click();
      await workspace.getByLabel("界面语言").selectOption("ja");
      await workspace
        .getByRole("button", { name: "設定を保存", exact: true })
        .click();
      await workspace
        .getByText("この端末に保存しました", { exact: true })
        .waitFor();
      await workspace.getByLabel("表示言語").selectOption("en");
      await workspace
        .getByRole("button", { name: "Save settings", exact: true })
        .click();
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
    },
  );
  await check("native share menu contains the Markdown action", async () => {
    await page
      .locator("article")
      .first()
      .getByRole("button", { name: "Share post" })
      .click();
    await page.getByRole("menuitem", { name: "Copy as Markdown" }).click();
    await workspace.getByRole("status").waitFor();
  });
  await check(
    "star map automatically loads through the native X page without learned or guessed endpoints",
    async () => {
      const before = await page.evaluate(() => ({
        url: location.href,
        y: scrollY,
      }));
      await page
        .locator("article")
        .first()
        .getByRole("button", { name: "Thank-You star map", exact: true })
        .click();
      await workspace.locator(".xt-node").first().waitFor();
      assert.equal(await workspace.locator(".xt-node").count(), 6);
      const authorAvatar = workspace.locator(".xt-star-context .xt-avatar");
      assert.equal(
        await authorAvatar.getAttribute("href"),
        "https://x.com/fixture_0",
      );
      await authorAvatar.locator("img").waitFor();
      await page.waitForFunction(() => {
        const img = document
          .querySelector("#xtrend-workspace")
          .shadowRoot.querySelector(".xt-star-context .xt-avatar img");
        return img?.complete && img.naturalWidth > 0;
      });
      const points = await workspace
        .locator(".xt-node circle")
        .evaluateAll((nodes) =>
          nodes.map((el) => [
            Number(el.getAttribute("cx")),
            Number(el.getAttribute("cy")),
          ]),
        );
      for (let i = 0; i < points.length; i++)
        for (let j = 0; j < i; j++)
          assert.ok(
            Math.hypot(
              points[i][0] - points[j][0],
              points[i][1] - points[j][1],
            ) > 12,
          );

      assert.deepEqual(
        await page.evaluate(() => ({ url: location.href, y: scrollY })),
        before,
      );
      await page.screenshot({ path: join(output, "star-map-native.png") });
      await workspace
        .getByRole("button", { name: "Load next page", exact: true })
        .click();
      await page.waitForTimeout(1100);
      assert.equal(await workspace.locator(".xt-node").count(), 6);
      assert.equal(await workspace.locator(".xt-primary").isDisabled(), true);
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
    },
  );
  await check(
    "Grok generates in a fresh native composer without a setup conversation",
    async () => {
      await page.waitForTimeout(1000);
      await page
        .locator("article")
        .first()
        .getByRole("button", { name: "Grok reply assistant", exact: true })
        .click();
      await workspace
        .getByRole("button", { name: "Generate draft", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#xtrend-workspace")
            .shadowRoot.querySelector(".xt-draft")?.value === "Native draft.",
      );
      assert.equal(
        context.pages().filter((tab) => tab.url().includes("#xtrend-native="))
          .length,
        0,
      );
      await page.screenshot({ path: join(output, "grok-native.png") });
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
    },
  );
  await check(
    "native Grok XHR returns the tested prompt response without reading history",
    async () => {
      xhrGrok = true;
      await page
        .locator("article")
        .first()
        .getByRole("button", { name: "Grok reply assistant", exact: true })
        .click();
      await workspace
        .getByRole("button", { name: "Generate draft", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#xtrend-workspace")
            .shadowRoot.querySelector(".xt-draft")?.value ===
          "Synthetic draft.",
      );
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
      xhrGrok = false;
    },
  );
  await check(
    "new Grok rendering waits for completion and returns the whole answer",
    async () => {
      renderedGrok = true;
      await page
        .locator("article")
        .first()
        .getByRole("button", { name: "Grok reply assistant", exact: true })
        .click();
      await workspace
        .getByRole("button", { name: "Generate draft", exact: true })
        .click();
      await page.waitForTimeout(3200);
      assert.equal(await workspace.locator(".xt-draft").inputValue(), "");
      await page.waitForFunction(
        () =>
          document
            .querySelector("#xtrend-workspace")
            .shadowRoot.querySelector(".xt-draft")?.value ===
          "Native rendered draft.",
      );
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
      renderedGrok = false;
    },
  );
  await check(
    "classic Grok returns only the answer and excludes suggested questions",
    async () => {
      renderedGrok = true;
      classicGrok = true;
      await page
        .locator("article")
        .first()
        .getByRole("button", { name: "Grok reply assistant", exact: true })
        .click();
      await workspace
        .getByRole("button", { name: "Generate draft", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#xtrend-workspace")
            .shadowRoot.querySelector(".xt-draft")?.value ===
          "Native rendered draft.",
        undefined,
        { timeout: 20000 },
      );
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
      renderedGrok = false;
      classicGrok = false;
    },
  );
  await check(
    "canceling native generation removes the temporary page and keeps the draft empty",
    async () => {
      renderedGrok = true;
      await page
        .locator("article")
        .first()
        .getByRole("button", { name: "Grok reply assistant", exact: true })
        .click();
      const created = context.waitForEvent("page");
      await workspace
        .getByRole("button", { name: "Generate draft", exact: true })
        .click();
      const native = await created;
      await native.waitForURL("https://x.com/i/grok#xtrend-native=*");
      await workspace
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      if (!native.isClosed()) await native.waitForEvent("close");
      assert.equal(await workspace.locator(".xt-draft").inputValue(), "");
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
      renderedGrok = false;
    },
  );
  await check(
    "learned repost connection loads, caches, searches and deduplicates one page at a time",
    async () => {
      await page.locator("#native-reposts").click();
      await page.waitForTimeout(1000);
      await page
        .locator("article")
        .first()
        .getByRole("button", { name: "Thank-You star map", exact: true })
        .click();
      await workspace
        .getByRole("button", { name: "People", exact: true })
        .click();
      await workspace.getByText("Reader 1", { exact: true }).waitFor();
      await workspace
        .getByLabel("Search people or quote text")
        .fill("reader_fixture_2");
      assert.equal(await workspace.locator(".xt-person").count(), 1);
      await workspace.getByLabel("Search people or quote text").fill("");
      await workspace
        .getByRole("button", { name: "Refresh", exact: true })
        .click();
      await page.waitForTimeout(1000);
      await workspace
        .getByRole("button", { name: "Load next page", exact: true })
        .click();
      await page.waitForTimeout(1200);
      assert.equal(await workspace.locator(".xt-person").count(), 6);
      const request = requests
        .filter((r) => r.path.endsWith("/Retweeters"))
        .at(-1);
      assert.equal(JSON.parse(request.variables).tweetId, id);
      assert.equal(JSON.parse(request.variables).cursor, "fixture-page-2");
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
    },
  );
  await check(
    "people show current avatars, open profiles and retain map selection with safe image fallbacks",
    async () => {
      const openPeople = async () => {
        await page
          .locator("article")
          .first()
          .getByRole("button", { name: "Thank-You star map", exact: true })
          .click();
        await workspace
          .getByRole("button", { name: "People", exact: true })
          .click();
      };
      const first = workspace.locator('[data-relation="r:7001"]');
      const expectAvatar = async (version) => {
        await page.waitForFunction((version) => {
          const img = document
            .querySelector("#xtrend-workspace")
            .shadowRoot.querySelector(
              '.xt-person a[href="https://x.com/reader_fixture_0"] img',
            );
          return (
            img?.getAttribute("src") ===
              `https://pbs.twimg.com/profile_images/${version}/reader_0.jpg` &&
            img.complete &&
            img.naturalWidth > 0
          );
        }, version);
      };
      await openPeople();
      await expectAvatar(1);
      const avatar = first.getByRole("link", {
        name: "Open profile @reader_fixture_0",
        exact: true,
      });
      const [profile] = await Promise.all([
        context.waitForEvent("page"),
        avatar.click(),
      ]);
      await profile.waitForLoadState();
      assert.equal(profile.url(), "https://x.com/reader_fixture_0");
      await profile.close();
      assert.equal(
        await workspace.locator(".xt-people-list").isVisible(),
        true,
      );
      const broken = workspace.locator('[data-relation="r:7003"]');
      await broken.locator(".xt-avatar img").waitFor({ state: "detached" });
      assert.equal(await broken.locator(".xt-avatar").innerText(), "R");
      const missing = workspace.locator('[data-relation="r:7006"]');
      assert.equal(await missing.locator(".xt-avatar img").count(), 0);
      assert.equal(
        await missing.locator(".xt-avatar").getAttribute("href"),
        "https://x.com/reader_fixture_5",
      );
      await first
        .getByRole("button", { name: "Star map Reader 1", exact: true })
        .click();
      assert.equal(await workspace.locator(".xt-node.selected").count(), 1);
      await workspace
        .getByRole("button", { name: "People", exact: true })
        .click();
      avatarVersion = 2;
      await workspace
        .getByRole("button", { name: "Refresh", exact: true })
        .click();
      await expectAvatar(2);
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
      avatarVersion = 3;
      await openPeople();
      await expectAvatar(3);
      await workspace.screenshot({
        path: join(output, "star-map-profile-avatars.png"),
      });
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
    },
  );
  await check(
    "quotes appear in the river and filtering does not invent extra relations",
    async () => {
      await page.locator("#native-quotes").click();
      await page.waitForTimeout(1000);
      await page
        .locator("article")
        .first()
        .getByRole("button", { name: "Thank-You star map", exact: true })
        .click();
      await workspace
        .getByRole("button", { name: "Quote river", exact: true })
        .click();
      await workspace
        .getByText("A synthetic quote from a real-shaped response.", {
          exact: true,
        })
        .waitFor();
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
    },
  );
  await check(
    "rate limits produce a clear error without modifying the page",
    async () => {
      failGraph = true;
      await page
        .locator("article")
        .first()
        .getByRole("button", { name: "Thank-You star map", exact: true })
        .click();
      await workspace
        .getByRole("button", { name: "Refresh", exact: true })
        .click();
      await workspace.getByRole("alert").waitFor();
      assert.match(await workspace.getByRole("alert").innerText(), /slow down/);
      failGraph = false;
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
    },
  );
  await check(
    "Grok drafts stay on the internal extension channel even after native page activity; temporary mode is available",
    async () => {
      await page.locator("#native-grok").click();
      await page.waitForTimeout(1100);
      await page
        .locator("article")
        .first()
        .getByRole("button", { name: "Grok reply assistant", exact: true })
        .click();
      assert.equal(
        await workspace
          .getByRole("switch", { name: "Temporary chat" })
          .isEnabled(),
        true,
      );
      await workspace
        .getByRole("button", { name: "Generate draft", exact: true })
        .click();
      await workspace.locator(".xt-draft").filter({ hasText: "" }).waitFor();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#xtrend-workspace")
            .shadowRoot.querySelector(".xt-draft")?.value === "Native draft.",
      );
      await workspace
        .getByRole("button", { name: "Fill reply box", exact: true })
        .click();
      await workspace.getByRole("alert").waitFor();
      assert.match(await workspace.getByRole("alert").innerText(), /reply box/);
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
    },
  );
  await check(
    "image viewer zooms at cursor, handles fallback, pans and reads long images",
    async () => {
      await page
        .locator("article")
        .first()
        .locator('a[href*="/photo/"]')
        .click();
      await workspace.getByRole("dialog", { name: "Image reader" }).waitFor();
      await page.waitForTimeout(500);
      await page.keyboard.press("+");
      const scale = await workspace
        .locator(".xt-image-stage img")
        .evaluate((el) => el.style.transform);
      assert.match(scale, /scale\(/);
      await page.mouse.move(650, 450);
      await page.mouse.wheel(0, -300);
      await page.mouse.down();
      await page.mouse.move(720, 490);
      await page.mouse.up();
      await workspace
        .getByRole("button", { name: "Long-image mode", exact: true })
        .click();
      const width = await workspace
        .locator(".xt-image-stage img")
        .evaluate((el) => el.getBoundingClientRect().width);
      assert.equal(width, 900);
      await page.keyboard.press("Escape");
      assert.equal(await workspace.locator(".xt-image-reader").count(), 0);
    },
  );
  await check(
    "account switch clears drafts and native pages, while allowing a fresh connection",
    async () => {
      await page.locator("#account-change").click();
      await page.waitForTimeout(900);
      await page.locator("#native-timeline").click();
      await page.waitForTimeout(300);
      await page
        .locator("article")
        .first()
        .getByRole("button", { name: "Grok reply assistant", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#xtrend-workspace")
            ?.shadowRoot?.querySelector(".xt-grok-form .xt-primary")
            ?.disabled === false,
      );
      assert.equal(
        await workspace
          .getByRole("button", { name: "Generate draft", exact: true })
          .isEnabled(),
        true,
      );
      assert.equal(await workspace.locator(".xt-draft").inputValue(), "");
      assert.equal(
        context.pages().filter((tab) => tab.url().includes("#xtrend-native="))
          .length,
        0,
      );
      await workspace
        .getByRole("button", { name: "Close", exact: true })
        .click();
    },
  );
  await page.screenshot({ path: join(output, "packaged-chrome.png") });
  await check(
    "single-page navigation clears the ranking candidates",
    async () => {
      await page.locator("#route-change").click();
      await page.waitForTimeout(1000);
      assert.equal(await workspace.locator(".xt-ranked-row").count(), 0);
    },
  );
  await check(
    "pro.x.com supports separate scrollable columns in the packaged extension",
    async () => {
      await page.goto("https://pro.x.com/");
      await workspace
        .getByRole("heading", { name: "On this page", exact: true })
        .waitFor();
      await page.waitForTimeout(1200);
      await page.locator("#column-1").evaluate((el) => {
        el.scrollTop = 600;
      });
      await page.waitForTimeout(400);
      const before = await page
        .locator("#column-1")
        .evaluate((el) => el.scrollTop);
      await workspace.locator(".xt-ranked-row").first().click();
      await workspace
        .getByRole("button", {
          name: "Return to reading position",
          exact: true,
        })
        .click();
      assert.equal(
        await page.locator("#column-1").evaluate((el) => el.scrollTop),
        before,
      );
    },
  );
  await check(
    "popup loads as a real extension page with saved settings",
    async () => {
      const extensionId = createHash("sha256")
        .update(extension)
        .digest("hex")
        .slice(0, 32)
        .split("")
        .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
        .join("");
      const popup = await context.newPage();
      activePage = popup;
      popup.on("pageerror", (e) => {
        errors.push(e.message);
        process.stdout.write(`POPUP ${e.message}\n`);
      });
      popup.on("console", (message) => {
        if (message.type() === "error")
          process.stdout.write(`POPUP ${message.text().slice(0, 500)}\n`);
      });
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await popup
        .getByRole("button", { name: "Settings", exact: true })
        .click();
      await popup
        .getByRole("heading", { name: "Settings", exact: true })
        .waitFor();
      assert.equal(
        await popup.getByLabel("Rising starts at").inputValue(),
        "2000",
      );
      const storage = await popup.evaluate(() =>
        chrome.storage.local.get(null),
      );
      assert.ok(
        Object.keys(storage).every((key) =>
          ["settings:v1", "graph-cache:v1"].includes(key),
        ),
      );
      assert.ok(!JSON.stringify(storage).includes("Synthetic draft."));
      assert.ok(!JSON.stringify(storage).includes("Native draft."));
      await popup.screenshot({ path: join(output, "popup.png") });
      await popup.close();
      activePage = page;
    },
  );
  const extensionId = createHash("sha256")
    .update(extension)
    .digest("hex")
    .slice(0, 32)
    .split("")
    .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
    .join("");
  await runAuditRuntimeChecks({
    check,
    context,
    popupURL: `chrome-extension://${extensionId}/popup.html`,
  });
  await runVisualChecks({
    check,
    context,
    output,
    popupURL: `chrome-extension://${extensionId}/popup.html`,
  });
  await runConnectionChecks({ check, context, page, output });
  await runRankingChecks({
    check,
    context,
    page,
    output,
    popupURL: `chrome-extension://${extensionId}/popup.html`,
  });
  await runFeatureChecks({
    check,
    context,
    page,
    output,
    popupURL: `chrome-extension://${extensionId}/popup.html`,
  }).catch(async (error) => {
    const popup = context
      .pages()
      .find((p) => p.url().startsWith("chrome-extension:"));
    if (popup) {
      await popup.screenshot({ path: join(output, "hub-failure.png") });
      await writeFile(join(output, "hub-failure.html"), await popup.content());
    }
    throw error;
  });
  await runResearchChecks({
    check,
    context,
    output,
    popupURL: `chrome-extension://${extensionId}/popup.html`,
  });
  await runImprovementChecks({
    check,
    context,
    page,
    output,
    popupURL: `chrome-extension://${extensionId}/popup.html`,
  }).catch(async (error) => {
    const popup = context
      .pages()
      .find((p) => p.url().startsWith("chrome-extension:"));
    if (popup) {
      await popup.screenshot({ path: join(output, "improvement-failure.png") });
      await writeFile(
        join(output, "improvement-failure.html"),
        await popup.content(),
      );
    }
    throw error;
  });
  assert.equal(errors.length, 0, errors.join("\n"));
  await writeFile(
    join(output, "extension-network.json"),
    JSON.stringify({ synthetic: true, requests, unexpected: errors }, null, 2),
  );
} catch (error) {
  await writeFile(
    join(output, "native-failure-debug.json"),
    JSON.stringify(
      {
        pages: await Promise.all(
          context.pages().map(async (tab) => ({
            url: tab.url(),
            text: (
              await tab
                .locator("body")
                .innerText()
                .catch(() => "")
            ).slice(0, 2000),
          })),
        ),
        session: await context
          .serviceWorkers()[0]
          ?.evaluate(() => chrome.storage.session.get(null)),
      },
      null,
      2,
    ),
  );
  if (activePage) {
    await activePage.screenshot({ path: join(output, "failure.png") });
    await writeFile(join(output, "failure.html"), await activePage.content());
  }
  const extensionPage = await context?.newPage();
  if (extensionPage) {
    await extensionPage.goto("chrome://extensions");
    process.stdout.write(
      (await extensionPage.locator("body").innerText()).slice(0, 3000),
    );
  }
  throw error;
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}

for (const [name, browserType] of [
  ["Chromium", chromium],
  ["Firefox", firefox],
]) {
  const browser = await browserType.launch({ headless: true });
  try {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "reduce",
      }),
      page = await context.newPage();
    page.setDefaultTimeout(8000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await check(
      `${name} default preview contains no simulated posts or numeric rankings`,
      async () => {
        await page.goto("http://127.0.0.1:5179/");
        await page
          .getByRole("heading", { name: "On this page", exact: true })
          .waitFor();
        assert.equal(await page.locator("article").count(), 0);
        assert.equal(await page.locator(".xt-ranked-row").count(), 0);
        assert.ok(
          (await page.locator("body").innerText()).includes(
            "Not connected to X",
          ),
        );
        await page.screenshot({
          path: join(output, `${name.toLowerCase()}-preview-no-data.png`),
        });
      },
    );
    await check(
      `${name} preview monitoring never exposes simulated matches or an enable control`,
      async () => {
        for (const suffix of ["?view=popup", "?view=popup&test-fixtures=1"]) {
          await page.goto(`http://127.0.0.1:5179/${suffix}`);
          await page
            .locator(".xt-hub-tabs")
            .getByRole("button", { name: "Monitor", exact: true })
            .click();
          await page
            .getByText("Monitoring is unavailable in local previews.", {
              exact: false,
            })
            .waitFor();
          assert.equal(
            await page
              .getByRole("switch", {
                name: "Monitor loaded posts",
                exact: true,
              })
              .count(),
            0,
          );
          assert.equal(await page.locator(".xt-monitor-event").count(), 0);
          assert.ok(
            (await page.locator(".xt-hub-main").innerText()).includes(
              "Local matches · 0",
            ),
          );
        }
        await page.screenshot({
          path: join(
            output,
            `${name.toLowerCase()}-preview-monitor-disabled.png`,
          ),
        });
      },
    );
    await check(
      `${name} renders the isolated local verification UI`,
      async () => {
        await page.goto("http://127.0.0.1:5179/?test-fixtures=1");
        await page
          .getByRole("heading", { name: "On this page", exact: true })
          .waitFor();
        await page.screenshot({
          path: join(output, `${name.toLowerCase()}-desktop.png`),
        });
      },
    );
    await runTooltipChecks({ check, page, output, label: name });
    await check(
      `${name} title clicks connect the post and blank clicks clear the line`,
      async () => {
        await page
          .locator(".xt-ranked-row")
          .first()
          .locator(".xt-excerpt")
          .click();
        // A horizontal stroked path has zero box height; verify its visible SVG.
        await page.locator(".xt-tweet-connection").waitFor();
        assert.equal(await page.locator(".xt-connection-line").count(), 1);
        await page.screenshot({
          path: join(output, `tweet-connection-${name.toLowerCase()}.png`),
        });
        await page.mouse.click(1420, 970);
        await page
          .locator(".xt-connection-line")
          .waitFor({ state: "detached" });
      },
    );
    await check(
      `${name} supports star-map/list/river interactions`,
      async () => {
        await page
          .getByRole("button", {
            name: "Thank-You star map Field Notes",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", { name: "Load one page", exact: true })
          .click();
        await page.getByRole("button", { name: "People", exact: true }).click();
        await page.getByText("Mina 2", { exact: true }).waitFor();
        await page.getByLabel("Search people or quote text").fill("Mina 2");
        assert.ok((await page.locator(".xt-person").count()) >= 1);
        await page.getByRole("button", { name: "Close", exact: true }).click();
      },
    );
    await check(
      `${name} respects dark mode and a narrow viewport`,
      async () => {
        await page.getByRole("button", { name: "Dark", exact: true }).click();
        await page.setViewportSize({ width: 390, height: 844 });
        const horizontalOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        assert.equal(horizontalOverflow, false);
        await page.screenshot({
          path: join(output, `${name.toLowerCase()}-mobile-dark.png`),
        });
      },
    );
    await check(
      `${name} opens the new popup sections and applies filtering and color choices in the isolated preview`,
      async () => {
        await page.goto("http://127.0.0.1:5179/?view=popup");
        await page.locator(".xt-hub-header select").selectOption("en");
        await page
          .getByRole("switch", {
            name: "Hide spam and promotional replies",
            exact: true,
          })
          .check();
        await page.getByText("Saved on this device", { exact: true }).waitFor();
        await page
          .locator(".xt-hub-tabs")
          .getByRole("button", { name: "Appearance", exact: true })
          .click();
        await page.getByRole("button", { name: "Forest", exact: true }).click();
        await page.getByText("Saved on this device", { exact: true }).waitFor();
        assert.equal(
          await page
            .getByRole("button", { name: "Forest", exact: true })
            .getAttribute("aria-pressed"),
          "true",
        );
        await page
          .locator(".xt-hub-tabs")
          .getByRole("button", { name: "Filters", exact: true })
          .click();
        assert.equal(
          await page
            .getByRole("switch", {
              name: "Hide spam and promotional replies",
              exact: true,
            })
            .isChecked(),
          true,
        );
        await page
          .locator(".xt-hub-tabs")
          .getByRole("button", { name: "Monitor", exact: true })
          .click();
        await page
          .getByText("Monitoring is unavailable in local previews.", {
            exact: false,
          })
          .waitFor();
        assert.equal(
          await page
            .locator(".xt-extension-hub")
            .evaluate((el) => el.scrollWidth > el.clientWidth),
          false,
        );
        await page.locator(".xt-extension-hub").screenshot({
          path: join(output, `${name.toLowerCase()}-hub-narrow.png`),
        });
      },
    );
    await runCompactPopupChecks({ check, popup: page, output, label: name });
    assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
    await context.close();
  } finally {
    await browser.close();
  }
}
await writeFile(
  join(output, "browser-results.json"),
  JSON.stringify(
    {
      runAt: new Date().toISOString(),
      notice:
        "Synthetic fixture verification. Not an authenticated X/Grok acceptance test.",
      results,
    },
    null,
    2,
  ),
);
process.stdout.write(`${results.length} browser checks passed.\n`);
