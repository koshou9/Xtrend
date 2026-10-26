# Xtrend 0.3.1 architecture

The existing page observer / isolated workspace / core logic / React UI / browser background layers remain. There is no hosted backend, telemetry or remote rule service.

## Trust boundaries

The MAIN-world observer reads allowlisted X responses and emits bounded, validated snapshots. It cannot initiate graph or Grok operations through window messages. The isolated Bridge sends user-triggered graph/Grok commands directly through runtime messaging to the background, which validates sender, operation and fields. Temporary native tabs are bound to their exact owner and token. The relay only services background-created native tabs; it no longer forwards owner-page window commands. Prompts and replies are not published on the owner page message channel.

The old request replay action path was removed. Native X pages construct their own current requests. Temporary chat remains disabled. Ordinary chat retention is disclosed. Cancelling, route/account changes, page closure and expiry clean up jobs.

## Local state and storage

Workspace retains 1500 tweets, sixty actual readings per tweet, page-local search and selection. Batch ingestion ranks once after merging the batch. Preferences and cache writes are coordinated by the background. Cache prune does not write unchanged data.

Budgets: settings 750KB; account-scoped graph cache 5MB / seven days; monitor records 1MB / 200 records / thirty days; manually saved posts 2MB / 100 records. Anonymous graph caches are not persisted. Saved posts explicitly include text, tags and notes, are shared across local accounts, never silently evicted and are exported separately from settings backups. No saved posts are automatically added to notification payloads.

Repeat alerts default to off, require a fresh exact reading with 25/50/100 percent more views and five minutes since the previous eligible match. Both workspace and durable monitor engine apply that gate; existing quiet hours, queueing, send limits and restart deduplication remain.

Search operates on already read posts. Presets change ranking presentation only. CSV exports only selected posts, quote cells and neutralize spreadsheet formulas. Rules preview reuses the production matcher with current unsaved form values and never writes settings.

## Verification and delivery

Unit tests cover untrusted input, storage bounds, concurrent saves, export literals, repeat alerts, batch notifications and channel isolation. Browser tests exercise existing flows plus malicious page messages, saved-post reload/export/delete, filtering, presets, CSV and route/column regressions. Release verification includes dependency auditing and all browser builds. CI runs the same verification; remote CI and store signing require their own acceptance. See VERIFICATION.md and OPTIMIZATION-0.3.0.md.
