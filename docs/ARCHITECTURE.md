# Architecture and implementation notes

## Version 0.2.0 implementation update

The original page observer / isolated workspace / local computation / UI / optional background architecture is retained. Shared settings and graph writes are now coordinated in the existing background. Preferences apply field differences to the newest stored value; ordinary writes cannot enable Bark or change its destination. Only a dedicated extension-page operation may configure Bark after checking exact-origin permission. Graph clients use a shared worker cache; same-port core clients also serialize together. Cache budget is 2MB, settings 750KB and monitor records 1MB.

Local alarms run cleanup and flush already queued opt-in notifications. They do not request X pages. Expired monitor records are removed from storage during reads/startup/maintenance; unchanged reads do not write, preventing storage-event feedback loops. Failed sends, test sends and retries share durable attempt limits; quiet hours, merge delay and cooldown are checked before delivery. Pending notices become local-only when Bark is disabled. Notification JSON is bounded and contains approved metadata only.

The workspace removes samples with evicted tweets and retains at most sixty genuine readings per tweet. Trends, temporary restores and batch selections stay in page memory and reset on navigation. Filters retain a confirmed detail identity when the focal DOM article is virtualized away. Compact DOM counts remain unknown. Mutation scans collect affected articles; filter signatures and workspace selectors avoid unrelated repeated work. Fetch clones and selected responses are read with a byte limit during streaming.

The popup adds diagnostics, credential-free backups with reviewed restore, unsaved-navigation protection and synchronized template/list editing. Diagnostics retain only narrow counters, timestamps, capability flags and fixed error codes in worker memory. They never trigger X requests or Bark sending. Column controls follow visible Pro column ordering and require live-account acceptance separately. Source formatting, regression checks and an implementation fingerprint gate release packaging. See the current [verification record](VERIFICATION.md) and Chinese optimization completion document for exact tested scope.

## Build and runtime

The extension uses WXT 0.21.4, TypeScript, React and Lucide icons. Motion uses the native Web Animations API with cleanup and reduced-motion handling. Chrome, Edge and Firefox have separate Manifest V3 builds. Firefox starts at 128 because MAIN-world content scripts are required; optional Bark requires Firefox 140+ with websiteContent consent. An extension background worker serializes local monitoring records and optional Bark requests. No hosted backend, remote code or telemetry SDK is present.

Runtime paths:

1. A `document_start` MAIN-world observer wraps `fetch` and XMLHttpRequest. It returns the original fetch promise/result, clones a successful supported response before yielding, and observes an explicit allowlist of current-origin timeline/tweet/repost/quote/Grok operations. DM/history, account-setting and posting operations are excluded even if they share the GraphQL prefix.
2. Structured tweet records cross a bounded, validated window-message bridge into the isolated content script. Auth headers and original request bodies remain in the MAIN world and never cross this bridge.
3. DOM adapters bind records to main tweet articles, track viewport exposure, handle X's recycled DOM nodes, and mount independent Shadow DOM UI. Text is rendered as text, never HTML.
4. A page-local workspace handles metrics, ranked candidates, dialogs and cancellation. `storage.local` contains versioned settings (including rules, palettes and optional Bark credentials), bounded graph caches and bounded metadata-only monitor records.
5. Monitoring messages pass through a separate runtime listener. Top-frame X content scripts may report narrowed candidate metadata; monitor list/clear/retry/test commands are limited to the extension's own pages. Every hit is revalidated against current settings in the worker. The page bridge cannot read the Bark key or request arbitrary network operations.

The window bridge is not a secrecy boundary against X itself: page scripts can see MAIN-world state and messages. It grants no arbitrary extension storage, tab, URL-fetch or posting capability. Messages are untrusted, validated and narrowed before use. The allowed command set is capabilities/reset, selected-tweet graph reads, Grok drafts and cancellation.

## Modules

### Velocity and rankings

Structured counts override rounded DOM counts. Missing data remains `null`; zero is accepted only when explicitly supplied. Long-form note text overrides truncated legacy text. Timestamp parsing, URL expansion and nested visibility wrappers are normalized centrally.

Average velocity uses the publication timestamp with a one-minute floor. Measured growth uses actual response timestamps at least 60 seconds apart, resets on a decreasing view count, and ignores duplicate/out-of-order samples. Ranking separates measured candidates from average-only candidates. The 15-second display timer recomputes average age without manufacturing measurements or triggering requests.

Only viewport-exposed tweets become candidates; unmounted but previously exposed candidates remain until route/tab changes. Memory is bounded to 1,500 normalized tweets. Jumping captures the document and every mounted independent scroll container; return restores each retained container. Missing/unmounted posts open the canonical detail URL instead of inventing an in-page position.

The dedicated ranking settings dialog autosaves limits (1–1,000), minimum view counts, four page scopes, edge docking and six independently visible row fields. Settings are applied optimistically and writes are serialized so rapid changes do not overwrite one another; own earlier storage echoes cannot revert pending changes. Failed writes restore the prior visible state and show an error. Old version-1 settings receive defaults for the added fields.

Ranked-title selection is page-local and never persisted. A successful locate selects the exact tweet ID, highlights the selected row, and draws a pointer-transparent SVG outline and cubic connection to the matching mounted article. Bounding rectangles are clipped to the viewport and scroll-container bounds. Captured scroll events (including Shadow DOM list scrolling), resize/load events, ResizeObserver and scoped DOM observers coalesce updates into one animation frame; no idle rendering loop is used. Overlapping panels route through a free side strip. Non-interactive page-background clicks clear selection via composed event paths; original tweet and control interactions are preserved. Return, collapse, route/account resets and removed/recycled targets clear stale selection. An unavailable target still uses the existing original-link fallback and does not draw a fabricated connection.

Popular-only filtering excludes known low-view records before the ranking limit. On eligible pages it also hides corresponding timeline cells using an owned removable attribute and stylesheet, preserving unknown counts. Source-data updates, settings changes, route changes and teardown restore cells as appropriate. It never deletes or edits the underlying tweet data and does not initiate additional X requests. Scope detection distinguishes home/Pro decks, lists, profiles and detail routes; unrelated routes are not treated as profiles. Edge release uses a 24px zone; pointer cancellation does not commit a dock. A persisted edge tab can expand via pointer, keyboard or touch and can be dragged back into the page.

### Image reader

Only official `/media/` image URLs are upgraded. The ordered candidates are 4096, original, large, then the existing URL. Transform math keeps the pointer's image coordinate fixed while zooming. Pointer capture handles panning. Long-image mode uses normal vertical overflow at `min(900px, available width)`. Keyboard handling is limited to the active reader and ignores editable elements.

### Markdown

Share-menu insertion is scoped to the recently activated tweet share control, expires after six seconds, and is cleaned up when X removes the menu. Output includes a canonical link, explicit ISO/UTC time, escaped text, retained paragraphs and an incomplete-body notice when appropriate. Clipboard failure falls back to a selectable textarea.

### Repost map

Only successful page-observed `Retweeters`, `QuoteTweets`, or specifically `quoted_tweet_id:` SearchTimeline operations become request templates. Hashes and feature flags are not hardcoded. The UI requests one page per explicit click, deduplicates by user/repost or quote ID, retains independent cursors for reposts and quotes, and allows aborting. Quote relations are included only when the source tweet explicitly references the selected original.

The SVG map renders up to 250 direct relations and the searchable list pages locally in groups of 80. List selection and map selection are linked. The quote river is chronological. No inferred cascading edges are drawn. Fresh observed graph data is page-local; active star-map requests may save results to the account-scoped seven-day / 2MB LRU cache. Anonymous results are not persisted.

### Grok

Adapters learn supported text-only first-turn request shapes from successful current-page activity. Existing conversation IDs are not reused. When a supported `CreateGrokConversation` call is observed, a fresh conversation can be created for a draft and its returned ID inserted into the learned response request. Templates with attachments, history or parent-response references are rejected. No static bearer token, query ID, external proxy or login automation is included.

SSE/NDJSON/plain JSON response records are parsed with streaming UTF-8 decoding. The draft is editable, cancellable, copyable, and may be inserted only into an identifiable open composer for that post. Sending/publishing is never automated.

Temporary chat is disabled until an observed request supports the relevant flag and a successful server response explicitly confirms temporary status. Unknown X formats remain unavailable; a speculative temporary flag is not presented as a privacy guarantee. Ordinary-chat retention is disclosed before generation.

## Popup, filtering, palettes and monitoring

The six-section popup reuses ranking settings and reply templates. Settings writes are serialized and optimistic, with rollback on failure. Labels remain stable after controlled textarea values change. All strings are bundled in English, Chinese and Japanese.

Reply filtering is restricted to detail routes, articles after the focal post in its primary column, and records with explicit reply metadata. Whitelist overrides blacklist and matching phrases. Twenty-six local plain-text rules have three strength cutoffs (1/23/26 rules), individual enable states and localized labels. Custom/imported rules are validated (version 1 JSON, <=100KB and <=100 rules per source), never evaluated as regex or code. Import replaces the imported set only. Export includes imported/custom rules, never credentials.

Color cards store three validated hex colors, with at least 4.5:1 ink/paper and accent/paper contrast, four bundled presets and <=12 custom cards. Derived variables apply to popup, content UI, inline badges and connector SVGs; system-theme listeners are cleaned up. Dark colors are derived locally.

Passive monitoring runs on viewport exposure, incoming records and settings changes, never on the age display timer. It matches any account OR keyword followed by both enabled numeric gates. Unknown counts do not satisfy an enabled gate. Reports contain only canonical post ID/URL, author, account scope, counts, reasons and observation time; no body. Local records expire after 30 days and cap at 200. A serial engine persists deduplication before attempting a push, so interrupted workers do not automatically double-send. Five accepted attempts per minute are allowed. Excess is recorded as limited; explicit retries use the same gate. Previously recorded hits are not backfilled when Bark is enabled.

Bark is disabled by default. A user gesture requests the exact configured origin from optional permissions; on Firefox it also requests optional websiteContent consent. Unsupported Firefox versions leave Bark disabled. HTTPS is required except loopback testing. Worker POSTs JSON to the configured base path plus `/push`, omits credentials/referrer, rejects redirects and times out after 15 seconds. The device key is local-only. Payload includes only author, match reasons, counts and canonical link. A JSON code 200 means server acceptance, not phone delivery. UI reports permission, failure and rate-limit states without logging credentials. The background has no X polling or arbitrary content-page fetch command.

## Compatibility and known constraints

- X internal endpoints are undocumented and change independently of the extension. A successful synthetic transport test does not establish availability for a live account.
- The same-origin requirement is intentional. If the X web client uses only `grok.x.com` or another origin for a feature, that transport is unsupported until the product's allowed-origin policy is explicitly changed.
- Request templates expire after 15 minutes, are cleared on account changes, and do not refresh transaction headers by guessing X algorithms. X may reject a replayed transaction header; the UI reports this instead of hiding it.
- Current X Pro access requires an eligible subscription. Multi-column behavior can be checked locally; real acceptance requires actual access.
- Firefox ZIPs are for temporary development installation until signed by Mozilla. Store publication is outside this local delivery.

## References

- [WXT content scripts](https://wxt.dev/guide/essentials/content-scripts)
- [MDN execution worlds and browser support](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts)
- [X Grok data handling](https://help.x.com/en/using-x/about-grok)
- [Bark request format](https://github.com/Finb/Bark/blob/master/docs/en-us/tutorial.md)
- [Firefox optional data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
