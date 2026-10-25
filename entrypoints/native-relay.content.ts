import { browser } from "wxt/browser";

const CHANNEL = "xtrend:native:v1";
export default defineContentScript({
  matches: ["https://x.com/*", "https://pro.x.com/*"],
  runAt: "document_start",
  main(ctx) {
    const token =
      location.hash.match(/^#xtrend-native=([a-f0-9-]{36})$/)?.[1] ??
      window.name.match(/^xtrend-native-([a-f0-9-]{36})$/)?.[1];
    const pending = new Set<string>();
    if (token) {
      let ready = false;
      const callbacks = new Map<string, (value: unknown) => void>();
      ctx.addEventListener(window, "message", (event) => {
        if (
          event.source !== window ||
          event.origin !== location.origin ||
          event.data?.channel !== CHANNEL
        )
          return;
        if (event.data.event === "ready") ready = true;
        if (event.data.event === "reply") {
          callbacks.get(event.data.id)?.({
            reply: event.data.reply,
            error: event.data.error,
          });
          callbacks.delete(event.data.id);
        }
      });
      browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (
          sender.id !== browser.runtime.id ||
          message?.type !== "xtrend:native-run" ||
          message.token !== token ||
          callbacks.size
        )
          return;
        callbacks.set(message.id, sendResponse);
        window.postMessage(
          {
            channel: CHANNEL,
            event: "request",
            id: message.id,
            command: message.command,
          },
          location.origin,
        );
        return true;
      });
      const timer = setInterval(() => {
        if (!ready)
          window.postMessage(
            { channel: CHANNEL, event: "probe" },
            location.origin,
          );
        else
          void (async () => {
            const result = await browser.runtime.sendMessage({
              type: "xtrend:native-ready",
              token,
            });
            if (result?.ok && result.value === true) clearInterval(timer);
          })().catch(() => {});
      }, 250);
      ctx.onInvalidated(() => clearInterval(timer));
      return;
    }
    ctx.addEventListener(window, "pagehide", () => {
      void browser.runtime
        .sendMessage({ type: "xtrend:native-clear" })
        .catch(() => {});
    });
    ctx.addEventListener(window, "message", (event) => {
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        event.data?.channel !== CHANNEL
      )
        return;
      const { id, command } = event.data;
      if (event.data.event === "native-clear") {
        void browser.runtime
          .sendMessage({ type: "xtrend:native-clear" })
          .catch(() => {});
        return;
      }
      if (typeof id !== "string" || id.length > 100) return;
      if (event.data.event === "native-cancel") {
        void browser.runtime
          .sendMessage({ type: "xtrend:native-cancel", id })
          .catch(() => {});
        return;
      }
      if (
        event.data.event !== "native-request" ||
        pending.has(id) ||
        pending.size >= 3
      )
        return;
      pending.add(id);
      void (async () => {
        try {
          const result = await browser.runtime.sendMessage({
            type: "xtrend:native-request",
            id,
            command,
          });
          window.postMessage(
            {
              channel: CHANNEL,
              event: "native-reply",
              id,
              reply: result?.ok ? result.value : undefined,
              error: result?.ok
                ? undefined
                : (result?.error ?? "requestFailed"),
            },
            location.origin,
          );
        } catch {
          window.postMessage(
            {
              channel: CHANNEL,
              event: "native-reply",
              id,
              error: "refreshConnection",
            },
            location.origin,
          );
        } finally {
          pending.delete(id);
        }
      })();
    });
  },
});
