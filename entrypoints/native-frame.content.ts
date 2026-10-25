import { installNativePage } from "../src/page/native";
export default defineContentScript({
  matches: ["https://x.com/*", "https://pro.x.com/*"],
  runAt: "document_start",
  world: "MAIN",
  main() {
    installNativePage();
  },
});
