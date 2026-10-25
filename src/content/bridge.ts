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
        if (pending) {
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
    return new Promise((resolve, reject) => {
      const dispose = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        this.pending.delete(id);
      };
      const abort = () => {
        window.postMessage(
          {
            channel: CHANNEL,
            event: "command",
            id: crypto.randomUUID(),
            command: { type: "cancel", target: id },
          },
          location.origin,
        );
        dispose();
        reject(new Error("cancelled"));
      };
      const timer = setTimeout(() => {
        abort();
      }, 65_000);
      signal?.addEventListener("abort", abort, { once: true });
      this.pending.set(id, { resolve, reject, dispose });
      window.postMessage(
        { channel: CHANNEL, event: "command", id, command },
        location.origin,
      );
    });
  }
  destroy() {
    window.removeEventListener("message", this.listener);
    for (const [id, pending] of this.pending) {
      window.postMessage(
        {
          channel: CHANNEL,
          event: "command",
          id: crypto.randomUUID(),
          command: { type: "cancel", target: id },
        },
        location.origin,
      );
      pending.dispose();
      pending.reject(new Error("cancelled"));
    }
  }
}
