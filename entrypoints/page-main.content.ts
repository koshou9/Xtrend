import { installObserver } from "../src/page/observer";
export default defineContentScript({
  matches: ["https://x.com/*", "https://pro.x.com/*"],
  runAt: "document_start",
  world: "MAIN",
  main() {
    if (
      location.hash.startsWith("#xtrend-native=") ||
      window.name.startsWith("xtrend-native-")
    )
      return;
    installObserver();
  },
});
