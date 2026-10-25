import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { defaultSettings, validateSettings } from "../../src/core/settings";
import {
  loadSettings,
  saveSettings,
  remoteGraphCache,
  watchSettings,
} from "../../src/platform/storage";
import type { Settings } from "../../src/core/types";
import { ExtensionHub } from "../../src/ui/ExtensionHub";
import { hubServices } from "../../src/platform/monitoring";
import "../../src/ui/styles.css";
function Popup() {
  const [settings, setSettings] = useState<Settings | null>(null),
    [error, setError] = useState(false);
  const current = useRef<Settings | null>(null),
    queue = useRef(Promise.resolve()),
    pending = useRef(0);
  const accept = (value: Settings) => {
    current.current = value;
    setSettings(value);
  };
  useEffect(() => {
    loadSettings()
      .then(accept)
      .catch(() => {
        accept(defaultSettings());
        setError(true);
      });
    return watchSettings((value) => {
      if (!pending.current) accept(value);
    });
  }, []);
  const update = (patch: Partial<Settings>) => {
    const previous = current.current!,
      next = validateSettings({ ...previous, ...patch });
    accept(next);
    pending.current++;
    const write = queue.current.then(() => saveSettings(next, previous));
    queue.current = write.then(
      () => {},
      () => {},
    );
    return write
      .then((saved) => {
        if (current.current === next) accept(saved);
      })
      .catch((error) => {
        if (current.current === next) accept(previous);
        throw error;
      })
      .finally(() => {
        pending.current--;
      });
  };
  if (!settings) return <div className="xt-app xt-popup-loading">Xtrend</div>;
  return (
    <>
      {error && <p role="alert">Local settings could not be read.</p>}
      <ExtensionHub
        settings={settings}
        update={update}
        services={hubServices}
        clearCache={() => remoteGraphCache.clear()}
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Popup />);
