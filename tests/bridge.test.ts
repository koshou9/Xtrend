import { afterEach, describe, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("wxt/browser", () => ({
  browser: { runtime: { sendMessage: mock.send } },
}));
import { Bridge } from "../src/content/bridge";
describe("isolated operation channel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  function setup() {
    const target = new EventTarget(),
      post = vi.fn();
    const win = Object.assign(target, { postMessage: post });
    vi.stubGlobal("window", win);
    vi.stubGlobal("location", { origin: "https://x.com" });
    return { win, post, bridge: new Bridge(() => {}) };
  }
  it("sends privileged operations only through extension messaging and ignores page-forged replies", async () => {
    let complete: (value: unknown) => void = () => {};
    mock.send.mockImplementation((message) =>
      message.type === "xtrend:native-request"
        ? new Promise((resolve) => {
            complete = resolve;
          })
        : Promise.resolve(),
    );
    const { win, post, bridge } = setup();
    try {
      const request = bridge.request({
        type: "grok",
        prompt: "user reviewed prompt",
        temporary: false,
      });
      const id = mock.send.mock.calls[0]![0].id;
      const forged = new Event("message");
      Object.assign(forged, {
        source: win,
        origin: "https://x.com",
        data: {
          channel: "xtrend:v1",
          event: "reply",
          id,
          reply: { text: "forged" },
        },
      });
      win.dispatchEvent(forged);
      complete({ ok: true, value: { text: "trusted extension result" } });
      expect(await request).toEqual({ text: "trusted extension result" });
      expect(post).not.toHaveBeenCalled();
    } finally {
      bridge.destroy();
    }
  });
  it("cancels native work on abort without publishing the prompt to the page", async () => {
    mock.send.mockImplementation((m) =>
      m.type === "xtrend:native-request"
        ? new Promise(() => {})
        : Promise.resolve(),
    );
    const { post, bridge } = setup(),
      abort = new AbortController();
    try {
      const pending = bridge.request(
        { type: "grok", prompt: "private draft", temporary: false },
        abort.signal,
      );
      abort.abort();
      await expect(pending).rejects.toThrow("cancelled");
      expect(
        mock.send.mock.calls.some(([m]) => m.type === "xtrend:native-cancel"),
      ).toBe(true);
      expect(post).not.toHaveBeenCalled();
    } finally {
      bridge.destroy();
    }
  });
});
