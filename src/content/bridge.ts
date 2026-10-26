import { browser } from "wxt/browser";
import type {
  Command,
  PageTransport,
  Reply,
  PageSnapshot,
} from "../core/types";
import { CHANNEL } from "../page/observer";
import { cleanSnapshot, cleanReply } from "../core/wire";

export class Bridge implements PageTransport {
  private pending = new Map<
    string,
    {
      native: boolean;
      resolve: (v: Reply) => void;
      reject: (e: Error) => void;
      dispose: () => void;
    }
  >();
  private listener: (event: MessageEvent) => void;
  constructor(onSnapshot: (value: PageSnapshot) => void) {
    this.listener = (event) => {
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        event.data?.channel !== CHANNEL
      )
        return;
      const value = event.data;
      if (
        value.event === "snapshot" &&
        value.snapshot &&
        Array.isArray(value.snapshot.tweets)
      ) {
        // Page data is untrusted. This channel never grants extension storage or tab privileges.
        const snapshot = cleanSnapshot(value.snapshot);
        if (snapshot) onSnapshot(snapshot);
      } else if (value.event === "reply" && typeof value.id === "string") {
        const pending = this.pending.get(value.id);
        if (pending && !pending.native) {
          pending.dispose();
          const reply = cleanReply(value.reply);
          value.error
            ? pending.reject(new Error(String(value.error)))
            : reply
              ? pending.resolve(reply)
              : pending.reject(new Error("requestFailed"));
        }
      }
    };
    window.addEventListener("message", this.listener);
  }
  request(command: Command, signal?: AbortSignal): Promise<Reply> {
    if (signal?.aborted) return Promise.reject(new Error("cancelled"));
    const id = crypto.randomUUID();
    const native =
      command.type === "graph" ||
      command.type === "grok" ||
      command.type === "ai";
    if (command.type === "reset") this.clearNative();
    return new Promise((resolve, reject) => {
      const dispose = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        this.pending.delete(id);
      };
      const abort = () => {
        if (native)
          void browser.runtime
            .sendMessage({ type: "xtrend:native-cancel", id })
            .catch(() => {});
        dispose();
        reject(new Error("cancelled"));
      };
      const timer = setTimeout(() => {
        abort();
      }, 65_000);
      signal?.addEventListener("abort", abort, { once: true });
      this.pending.set(id, { native, resolve, reject, dispose });
      if (native) {
        void browser.runtime
          .sendMessage({ type: "xtrend:native-request", id, command })
          .then((result) => {
            if (!this.pending.has(id)) return;
            dispose();
            const reply = cleanReply(result?.value);
            if (!result?.ok || !reply)
              reject(new Error(result?.error ?? "requestFailed"));
            else resolve(reply);
          })
          .catch((error) => {
            if (this.pending.has(id)) {
              dispose();
              reject(error);
            }
          });
        return;
      }
      window.postMessage(
        { channel: CHANNEL, event: "command", id, command },
        location.origin,
      );
    });
  }
  clearNative() {
    void browser.runtime
      .sendMessage({ type: "xtrend:native-clear" })
      .catch(() => {});
  }
  destroy() {
    window.removeEventListener("message", this.listener);
    this.clearNative();
    for (const pending of this.pending.values()) {
      pending.dispose();
      pending.reject(new Error("cancelled"));
    }
  }
}
