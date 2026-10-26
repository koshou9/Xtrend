import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  data: {} as Record<string, any>,
  remove: vi.fn(),
  create: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock("wxt/browser", () => ({
  browser: {
    storage: {
      session: {
        get: async (key: string | null) =>
          key === null
            ? structuredClone(mock.data)
            : { [key]: structuredClone(mock.data[key]) },
        set: async (value: Record<string, unknown>) => {
          Object.assign(mock.data, structuredClone(value));
        },
        remove: async (key: string) => {
          delete mock.data[key];
        },
      },
    },
    tabs: {
      remove: mock.remove,
      create: mock.create,
      sendMessage: mock.sendMessage,
    },
  },
}));
import {
  cleanupNativeTabs,
  nativeTabMessage,
} from "../src/platform/native-tabs";

describe("native X tab boundary", () => {
  const token = "12345678-1234-1234-1234-123456789012";
  const key = "xtrend-native-job:" + token;
  beforeEach(() => {
    mock.data = {};
    vi.clearAllMocks();
  });
  it("rejects arbitrary sites and malformed commands before opening a tab", async () => {
    await expect(
      nativeTabMessage(
        {
          type: "xtrend:native-request",
          id: "one",
          command: { type: "grok", prompt: "hello", temporary: false },
        },
        { url: "https://evil.test/", tab: { id: 10 } },
      ),
    ).rejects.toThrow("invalidRequest");
    for (const command of [
      { type: "graph", tweetId: "../../logout", kind: "repost" },
      { type: "grok", prompt: "hello", temporary: "true" },
      { type: "grok", prompt: { text: "hello" }, temporary: false },
    ])
      await expect(
        nativeTabMessage(
          { type: "xtrend:native-request", id: "one", command },
          { url: "https://x.com/home", tab: { id: 10 } },
        ),
      ).rejects.toThrow();
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("accepts readiness only from the exact native tab created for this token", async () => {
    mock.data[key] = {
      token,
      owner: 10,
      tabId: 20,
      key: "100:repost",
      requestId: "one",
      ready: false,
      expires: Date.now() + 10000,
    };
    expect(
      await nativeTabMessage(
        { type: "xtrend:native-ready", token },
        { url: "https://x.com/i/status/100/retweets", tab: { id: 21 } },
      ),
    ).toBe(false);
    expect(mock.data[key].ready).toBe(false);
    expect(
      await nativeTabMessage(
        { type: "xtrend:native-ready", token },
        { url: "https://x.com/i/status/100/retweets", tab: { id: 20 } },
      ),
    ).toBe(true);
    expect(mock.data[key].ready).toBe(true);
  });
  it("cleans persisted native tabs after an owner closes or a job expires", async () => {
    mock.data[key] = {
      token,
      owner: 10,
      tabId: 20,
      key: "100:repost",
      requestId: "one",
      ready: true,
      expires: Date.now() + 10000,
    };
    await cleanupNativeTabs(11);
    expect(mock.remove).not.toHaveBeenCalled();
    await cleanupNativeTabs(10);
    expect(mock.remove).toHaveBeenCalledWith(20);
    expect(mock.data[key]).toBeUndefined();
    mock.data[key] = { token, owner: 10, tabId: 21, expires: Date.now() - 1 };
    await cleanupNativeTabs();
    expect(mock.remove).toHaveBeenCalledWith(21);
  });
});
