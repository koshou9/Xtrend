import { browser } from "wxt/browser";
import type { Command, Reply } from "../core/types";
import { cleanReply } from "../core/wire";

const PREFIX = "xtrend-native-job:";
type Job = {
  token: string;
  owner: number;
  tabId: number;
  key: string;
  requestId: string;
  ready: boolean;
  expires: number;
};
const jobs = async (): Promise<Job[]> =>
  Object.entries(await browser.storage.session.get(null))
    .filter(([key]) => key.startsWith(PREFIX))
    .map(([, job]) => job as Job);
async function close(job: Job) {
  await browser.storage.session.remove(PREFIX + job.token);
  try {
    if (job.tabId >= 0) await browser.tabs.remove(job.tabId);
  } catch {
    /* Already closed. */
  }
}
export async function cleanupNativeTabs(removed?: number) {
  for (const job of await jobs())
    if (
      job.owner === removed ||
      job.tabId === removed ||
      job.expires < Date.now()
    )
      await close(job);
}
export async function nativeTabMessage(
  value: Record<string, any>,
  sender: { url?: string; tab?: { id?: number; windowId?: number } },
): Promise<unknown> {
  const owner = sender.tab?.id;
  if (
    owner === undefined ||
    !/^https:\/\/(x\.com|pro\.x\.com)\//.test(sender.url ?? "")
  )
    throw new Error("invalidRequest");
  if (value.type === "xtrend:native-ready") {
    if (typeof value.token !== "string" || !/^[a-f0-9-]{36}$/.test(value.token))
      return false;
    const job = (await browser.storage.session.get(PREFIX + value.token))[
      PREFIX + value.token
    ] as Job | undefined;
    if (!job || job.tabId !== owner) return false;
    await browser.storage.session.set({
      [PREFIX + job.token]: { ...job, ready: true },
    });
    return true;
  }
  if (
    value.type === "xtrend:native-clear" ||
    value.type === "xtrend:native-cancel"
  ) {
    for (const job of await jobs())
      if (
        job.owner === owner &&
        (value.type === "xtrend:native-clear" || job.requestId === value.id)
      )
        await close(job);
    return null;
  }
  if (value.type !== "xtrend:native-request") throw new Error("invalidRequest");
  const command = value.command as Command;
  if (
    typeof value.id !== "string" ||
    value.id.length > 100 ||
    !command ||
    !["graph", "grok"].includes(command.type)
  )
    throw new Error("invalidRequest");
  if (
    command.type === "graph" &&
    (typeof command.tweetId !== "string" ||
      !/^\d{1,30}$/.test(command.tweetId) ||
      !["repost", "quote"].includes(command.kind) ||
      (command.cursor !== undefined &&
        (typeof command.cursor !== "string" || command.cursor.length > 4096)))
  )
    throw new Error("invalidRequest");
  if (
    command.type === "grok" &&
    (typeof command.prompt !== "string" ||
      !command.prompt.trim() ||
      command.prompt.length > 20000 ||
      command.temporary !== false)
  )
    throw new Error("invalidPrompt");
  if (command.type !== "graph" && command.type !== "grok")
    throw new Error("invalidRequest");
  const key =
    command.type === "graph" ? `${command.tweetId}:${command.kind}` : "grok";
  const existing = (await jobs()).filter((job) => job.owner === owner);
  let job = existing.find(
    (job) => job.key === key && job.expires >= Date.now(),
  );
  let destination: string | undefined;
  if (command.type === "graph" && command.cursor && !job)
    throw new Error("refreshConnection");
  if (!job || !(command.type === "graph" && command.cursor)) {
    for (const old of existing)
      if (
        old.key === key ||
        (command.type === "graph" &&
          old.key !== "grok" &&
          !old.key.startsWith(command.tweetId + ":"))
      )
        await close(old);
    job = {
      token: crypto.randomUUID(),
      owner,
      tabId: -1,
      key,
      requestId: value.id,
      ready: false,
      expires: Date.now() + 15 * 60_000,
    };
    await browser.storage.session.set({ [PREFIX + job.token]: job });
    const path =
      command.type === "graph"
        ? `/i/status/${command.tweetId}/${command.kind === "repost" ? "retweets" : "quotes"}`
        : "/i/grok";
    destination = `https://x.com${path}#xtrend-native=${job.token}`;
    const tab = await browser.tabs.create({
      url: "about:blank",
      active: false,
      openerTabId: owner,
      windowId: sender.tab?.windowId,
    });
    if (tab.id === undefined) {
      await close(job);
      throw new Error("requestFailed");
    }
    job.tabId = tab.id;
    if (
      !(await browser.storage.session.get(PREFIX + job.token))[
        PREFIX + job.token
      ]
    ) {
      await browser.tabs.remove(tab.id);
      throw new Error("cancelled");
    }
  }
  job.requestId = value.id;
  await browser.storage.session.set({ [PREFIX + job.token]: job });
  try {
    if (destination) await browser.tabs.update(job.tabId, { url: destination });
    for (let i = 0; i < 160; i++) {
      const current = (await browser.storage.session.get(PREFIX + job.token))[
        PREFIX + job.token
      ] as Job | undefined;
      if (!current) throw new Error("cancelled");
      if (current.ready) break;
      if (i === 159) throw new Error("refreshConnection");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const result = await browser.tabs.sendMessage(
      job.tabId,
      { type: "xtrend:native-run", token: job.token, id: value.id, command },
      { frameId: 0 },
    );
    if (result?.error) throw new Error(String(result.error));
    const reply = cleanReply(result?.reply);
    if (
      !reply ||
      (command.type === "graph" ? !("page" in reply) : !("text" in reply))
    )
      throw new Error("unrecognizedResponse");
    if (command.type === "grok" || ("page" in reply && !reply.page.cursor))
      await close(job);
    return reply satisfies Reply;
  } catch (error) {
    await close(job);
    throw error;
  }
}
