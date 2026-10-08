# OpenBEXI Timeline: complete recreation prompt

## Mission and baseline

Build a working OpenBEXI Timeline application from this specification, including
the browser application, local demos, connected data service, model editor,
versioned API, embedding interface, tests, and deployment instructions. Deliver
running code and representative synthetic datasets, not just designs or mockups.

This specification describes the locally inspected OpenBEXI Timeline **2.6.1**
source tree on **2026-10-08**, plus the explicitly requested HBDS diagram behavior
in section 14. The reference repository is
<https://github.com/arcazj/openbexi_timeline>. Source paths below are relative to
that repository unless explicitly marked HBDS. They identify implementations;
the contracts, examples, and inventories in this document must also be usable
when the original source tree is unavailable.

Implemented baseline requirements are described in sections 1–13. The HBDS
conceptual model and diagram requirements are companion requirements, not new
mandatory fields in Timeline event payloads. Proposed extensions are identified
separately in section 15. Do not silently replace existing formats with a new
schema or describe an unimplemented feature as implemented.

## 1. Product and application surfaces

Users explore dated events, duration sessions, nested activities, and contextual
zones. Support calendar dates, BCE dates, and numeric axes such as millions of
years ago. Provide Timeline, Table, and Split views, plus optional 3D perspective.
All views share the selected records, query, filter, grouping, and visible range.

Provide these entry points:

- `index.html`: public gallery and navigation.
- `demos.html`: catalog-driven local datasets; `?demo=<id>` selects a demo.
- `openbexi_timeline.html` and provider-specific pages: connected timelines.
- `openbexi_timeline_model.html`: model and YAML workspace, optionally scoped by
  `?modelId=<id>`.
- `openbexi_timeline_embed.html`: isolated renderer used by the embedding SDK.
- `docs/api.html`: offline API reference using the checked-in OpenAPI contract.
- Markdown and HTML help with matching control names and examples.

Bundle seven public, read-only examples with stable IDs: `default-dataset`,
`dinausaurs` (retain this existing spelling), `ephemeris`, `jfk`, `monet`,
`religions`, and `space_exploration`. They exercise operations, numeric geological
time, satellite intervals, historical chronology, artists, BCE history, and
space missions. Use synthetic or appropriately licensed content and images.
Users edit copies of examples; changes must not overwrite bundled datasets.

## 2. Architecture and reproducible build

Use browser JavaScript ES modules, HTML, CSS, Three.js, and independent modules
for model validation, rendering preferences, dates/scales/ticks, data parsing,
loading, transport, filtering, search, paging, overview, views, selection,
descriptors, settings, model editing, sharing, and embedding. Keep data and
application state independent of DOM/WebGL objects. Dispose listeners, workers,
requests, object URLs, and GPU resources when replacing or destroying a view.

The baseline uses Node.js 24 for development, JDK 17+ and Maven for Java,
embedded Tomcat with `javax.servlet`, and a JSON-backed managed API repository.
Its npm manifest declares Three.js `^0.168.0`, three-spritetext `^1.8.2`,
simple-jscalendar `^1.4.5`, and yaml `^2.8.3`; development tools include
Playwright `1.63.0`, Ajv `8.20.0`, and jsdom `30.1.0`. Preserve a lockfile.
These are inspected baseline versions, not a claim that they remain the newest
versions. Review dependency updates and run compatibility tests when changing them.

Suggested source organization matching the baseline responsibilities:

```text
src/openbexi_timeline.js                     orchestration and public constructor
src/openbexi_timeline_{data,data_parser,local_data,data_worker}.js
src/openbexi_timeline_{loader,transport,live,matches,results,paging}.js
src/openbexi_timeline_{scale,ticks,overview,overview_panel,viewport}.js
src/openbexi_timeline_{views,controls,settings,perspective,appearance}.js
src/openbexi_timeline_{filters,filter_expression,search,exploration}.js
src/openbexi_timeline_{descriptor,event_interaction,activity_focus}.js
src/openbexi_timeline_model_{editor,editor_document,editor_workspace,preview,validation,startup,link}.js
src/openbexi_timeline_{rendering,saved_views,share,embed,embed_frame,earth_orbit}.js
src/com/openbexi/timeline/{api,data_browser,servlets,server,websockets}/
models/  models/demos/  schemas/  demos/  json/test-data/  css/  icons/
tests/  tests/browser/  tests/java/  tests/integration/  tools/  docs/
```

Static mode must work without Java. Connected mode must discover its public model
and data endpoints without exposing deployment credentials or absolute source
paths. File-backed and connected records use the same presentation pipeline.

## 3. Core concepts and compatibility

Use nouns for conceptual classes and verbs for relationships. Separate User,
Model, Source, Record, Namespace, Filter, and Render. A user's role is an
attribute or a grant value, not a class called Role in the simplified HBDS model.
Persist actual authorization grants in a separate access store.

- A Model controls presentation and connects to data sources. It has identity,
  geometry, date, typography, colors, parameters, bands, ranges, focus intervals,
  ticks, grouping conditions, zones, headers, scales, and namespaces.
- A Source supplies Records. A record may be an event, session, activity, or zone
  under the existing data contract. Source connectivity and source include/exclude
  rules are distinct from user filters and rendering preferences.
- A Filter selects Records. Its conceptual expression property is `regex` for
  legacy expressions; its wire representation remains `filter_value` where that
  existing format is used. Advanced `expr:` expressions have their own parser.
- Render defines shared Model presentation. Local overrides take precedence.
  A Filter has no conceptual `backgroundColor`; preserve that legacy field in
  settings adapters as presentation state when round-tripping old documents.

Never add role, entitlement, AI provenance, `datasetId`, or HBDS wrappers to
existing events, sessions, or activities. Preserve names, types, nesting, array
order, stable identifiers, unknown keys, null versus absent values, and original
metadata. Normalize a working copy for rendering. Editing models, filters,
permissions, or AI drafts must not mutate record payloads.

## 4. Timeline models and configuration

Implement two validated model families:

1. File-backed demo models: strict `params`, `dataSource`, `bands`, optional
   `rendering`; reject unsupported keys and report errors at their property path.
2. Provider/legacy models: preserve extension fields, numeric-string intervals,
   `AUTO` subintervals, textures, alternate group colors, and legacy camera/geometry
   options, while validating the centralized `rendering` object strictly.

The appendices specify all schema properties, defaults, constraints, and observed
field paths from every JSON model under `models/`. Observed fields are evidence
of supported legacy input, not a declaration that every field is mandatory.

`params` contains one initial configuration. Important fields include `name`,
`title`, `date`, `timeZone`, `timeZoneLabel`, `displayOffsetMinutes`, `top`, `left`,
`width`, `height`, `fullWindow`, `camera`, typography, overview placement, current
time visibility, and shared/per-band axes. Keep UTC instants independent of display
time-zone formatting. Startup precedence is explicit page model, deployment YAML
model, then built-in defaults. Runtime navigation does not rewrite the model.

Bands retain array order and define geometry, time scales, colors, row packing,
labels, grouping, filtering, and optional overview projection. A context or focus
requires a range. Focus can be one interval or several intervals. Preserve invertible
time-to-position mapping across focus/context boundaries. Calendar ticks use
calendar arithmetic; month and year lengths must not be treated as fixed days.

An explicit model renders independently of other timeline instances: deeply
resolve defaults into fresh copies and retain the untouched input document.
Band and record overrides keep their established scope; record typography overrides
band typography. Existing source styling remains effective for source-grouped bands.

Minimal complete file-backed model:

```json
{
  "params": [{"name":"sample","title":"Operations","date":"2026-01-01T12:00:00Z","timeZone":"UTC","width":1200,"height":600,"fullWindow":true,"overview":true,"fontSize":13}],
  "dataSource": {"format":"json","url":"./json/test-data/sample.json","recordsPath":"records"},
  "bands": [{"name":"main","height":"100%","intervalUnit":"HOUR","intervalPixels":80,"dateFormat":"HH:mm","color":"#eef1f2","textColor":"#263238","SessionColor":"#5c9ddb","eventColor":"#7675c8","trackIncrement":32,"sessionHeight":8,"defaultEventSize":4}]
}
```

## 5. Records, sources, and namespaces

Support JSON and SIMILE XML inputs, ordered fallback field mappings, per-record
icons and colors, zones, and a configurable record-array path. Support both
legacy `events` with nested `activities` and snapshots using `records` plus
`parentSessionId`. The public API queries both representations without rewriting
the original input just to render it.

Synthetic snapshot:

```json
{"records":[
  {"id":"session-1","start":"2026-01-01T11:00:00Z","end":"2026-01-01T13:00:00Z","namespace":"operations","data":{"title":"Observation","status":"RUNNING"},"render":{"color":"#5c9ddb"}},
  {"id":"activity-1","parentSessionId":"session-1","start":"2026-01-01T12:00:00Z","end":"2026-01-01T12:10:00Z","data":{"title":"Capture"}},
  {"id":"event-1","start":"2026-01-01T12:30:00Z","data":{"title":"Signal received","kind":"event"}}
]}
```

Legacy equivalent shape:

```json
{"dateTimeFormat":"iso8601","events":[{"id":"session-1","start":"2026-01-01T11:00:00Z","end":"2026-01-01T13:00:00Z","data":{"title":"Observation"},"activities":[{"id":"activity-1","start":"2026-01-01T12:00:00Z","end":"2026-01-01T12:10:00Z","data":{"title":"Capture"}}]}]}
```

Numeric axes declare `kind:"numeric"`, `unit`, positive `millisecondsPerUnit`,
and direction `1` or `-1`; decreasing values can represent advancing time.
Keep domain units in API queries and use a reversible internal transform.
Preserve approximation prefixes and distinguish uncertain intervals from confirmed
dates. BCE dates require signed extended years and tests across the era boundary.

Connected source configuration includes `namespace`, `type`, `enable`,
`connector`, `data_model`, `data_path`, `url`, `converter2events_class`,
`permission`, `filter.include/exclude`, and `render` overrides. A sample deployment
entry is `connector: "secure_sse:8441|secure:8442"` with a date-partitioned
`data_model: "/data/sample/yyyy/mm/dd"`. Paths and secrets stay on the server.
`json_file` supports bounded progressive reads; legacy MongoDB, Kafka, HTTP, and
Oracle adapter code must not be advertised as equally complete writable API
repositories. Isolate optional providers behind capability checks and clear errors.

Preserve the existing settings envelope with `dateTimeFormat`, `scene`,
`namespace`, and `openbexi_timeline[]`. Each timeline entry can contain identity,
user/email, start, geometry, camera, presentation, `sources[]`, and `filters[]`.
Legacy filters retain `name`, `filter_value`, `sortBy`, and `current` markers.
Decode numeric strings without silently changing their original serialized types.

## 6. Filtering, search, grouping, and sorting

Implement legacy `include|exclude`: `;` combines alternatives, `+` combines
required terms, and exclusion wins. Terms are case-sensitive regexes over the
serialized whole event/session including activities. Evaluate source exclusions
before the active user expression; user filters cannot bypass source rules.

Implement an advanced parser only for the explicit `expr:` prefix. Support
parentheses, NOT, AND, OR in that precedence; typed equality `=`/`==`/`!=`,
comparisons `< <= > >=`, `CONTAINS`, `STARTS_WITH`, `ENDS_WITH`, `IN (...)`, and
`EXISTS(field)`. Operators ignore case; fields and strings retain case. Support
strings, numbers, booleans, null, dotted paths, escaped quotes/backslashes and
newline/tab escapes. Bare fields check the record and then `data`. Missing-field
comparisons are false; `EXISTS` distinguishes absence from null. Bound expressions
to 4096 characters, 512 tokens, and 32 nested levels. Report error positions and
retain the last valid filter when a draft is invalid.

Examples that must work:

```text
namespace:operations+status:STARTED|description:Cancelled
|system:RNG+status:FINISHED;description:(90% used);system:CRON;system:SCRIPT
expr: namespace = "operations" AND status IN ("STARTED", "SCHEDULE")
expr: priority >= 3 AND NOT status = "CANCELLED"
expr: EXISTS(data.owner) AND data.owner STARTS_WITH "Team"
```

Filtering selects a top-level session as a unit and retains its in-range activities.
Apply legacy exclusions before time-scoping its activities. Share semantics between
browser, finite REST reads, and SSE-triggered reconciliation.

Search is separate from filtering: Text is literal and case-insensitive, Pattern
is case-insensitive regex, and Legacy retains its original case-sensitive rules.
Omitted protocol search mode means Legacy for older clients. Highlight and navigate
matches without confusing loaded matches with exhaustive archive results.

Provide a field/operator/value builder, syntax help, preset creation/edit/delete,
save/cancel, active-filter indicator, and grouping/sort selectors. Store grouping
and sort with a preset and restore them in main and overview views. An omitted
connected `filter` resolves the current user/timeline preset; explicit `filter=`
clears it. Preserve the legacy file format and distinguish it from API query objects.

## 7. Timeline UI and rendering

Provide primary and secondary toolbars, date/calendar navigation, previous/next
activity, Today/current time, time zoom, Fit, search modes, filter/grouping controls,
refresh, status/report, Settings, Help, and responsive More controls. Keep the
plot clear of status overlays. Hide or disable controls only with an explanation
appropriate to their state. Keyboard navigation and visible focus must work.

Timeline rows show point events, duration sessions, activities, images/icons,
labels, uncertainty, and zones without obscuring their time relationship.
Selection changes highlighting and focus, not record dimensions. Clicking an
activity opens its own details, not an unrelated containing record. Preserve
selection through ordinary refresh when its ID survives.

Table supports sorting/filtering, useful fields, opening details, copying, and
exporting the filtered result as CSV with proper escaping. Split synchronizes
Timeline and Table. Descriptors show title, dates, metadata, links and images;
allow their existing resize and close behavior. Render untrusted text as text and
validate link/image schemes.

Overview projects normal data independently, supports its own linear zoom, shows
the main visible range with handles, and can dock. Overview zoom is local and
must not fetch data or change the main range. Clicking/dragging its visible range
deliberately navigates the main view. Keep projection and grouping synchronized.

Every normal page load starts in 2D. Optional 3D restores saved perspective only
when enabled. Separate camera zoom/orbit from time navigation. Adjust perspective
must be explicitly enabled; Escape returns to navigation. Settings expose camera
position/target, viewing angle, lighting, surface properties, save/reset, appearance,
and layout options. Built-in appearance choices are `default`, `apple`, `windows`,
`minimal`, and `contrast`. Rendering defaults and allowed ranges are in the appendix.

Support narrow screens, full-window and bounded custom layouts, large labels,
high contrast, keyboard menus, semantic control labels, tooltips, and readable
error messages. Keep view changes responsive without rebuilding unrelated state.

## 8. Loading, live updates, and status

Create the frame before fetching records. Local JSON loads directly without
Java requests. Use a worker for large JSON when available; support cancellation,
progress, and retention of the previous valid snapshot after failure.

For connected data, load the visible interval first and one visible-span buffer
on either side. After useful visible data or four empty pages, give both neighbors
a page, then alternate continuations. Permit one active fetch and at most four
aligned retained windows. Reuse completed/cached coverage while panning; invalidate
superseded filters/searches and ignore stale responses. Include query, range,
search mode, source revision and filter in cache/cursor identity.

The inspected limits retain 15,000 top-level records, 50,000 including activities,
and 8 Mi characters of JSON payload. File scans can use up to 512 pages per interval;
fallback providers without scan counters use 32 visible and four neighboring pages.
When a limit is hit, retain accepted data, release cursors, mark coverage partial,
and allow the user to narrow the range. Never call an incomplete empty page a
confirmed empty interval or exact no-match result.

Status states distinguish Loading/Searching (orange), Ready (green when visible
coverage is complete), partial/connection problems (orange), Error (red), and
Cancelled (gray). The status button toggles a report with progress and coverage;
Stop/Escape cancels work and Retry retains the coherent view. Calendar month
arrows browse only; selecting a day changes the timeline range.

Legacy routes:

| Route | Behavior |
| --- | --- |
| `/openbexi_timeline/config` | Public model/data URLs; no deployment secrets |
| `/openbexi_timeline/sessions` GET | Bounded records; `matchProtocol=1`, `progressive=1`, `startDate`, `endDate`, `search`, `searchMode`, `filter`, optional `cursor`, `cancel=1`, `history=backward` |
| `/openbexi_timeline/sessions` POST | Existing `ob_request` operations including `readFilters`, `updateFilter`, `saveFilter`, `readDescriptor` |
| `/openbexi_timeline_sse/sessions` | Finite JSON reads or `live=1` revision-only SSE |

Progressive responses retain `events` and add `timelineMatch` with version, query,
mode, provider, revision, domain, batch, complete, nextCursor, examined/excluded/
returned counts, cache information, warnings, and optional history status.
Use opaque cursors bound to the original request. Include random per-load IDs and
purpose values such as initial, visible, past-prefetch, future-prefetch, refresh,
and retry in diagnostics without logging secrets.

SSE uses one subscription, `Last-Event-ID`, and revision notifications. Heartbeats
cause no reads. Reconcile changes through bounded filtered JSON reads, preserving
the selected item/range. REST stays idle after finite loading; Refresh checks
retained windows and conditional reads may return 304.

If an active search has no loaded match, scan eligible earlier history through
the original visible end. Show progress without moving the view; center the first
match once. A final no-match requires exhausted, complete eligible coverage.
Source failures and unsupported providers remain incomplete. The legacy fallback
is bounded to eight expanding windows, 32 pages, and 20 seconds and never claims
an exhaustive negative result. Connected empty views must not silently jump dates.

## 9. Managed API, storage, users, and permissions

Implement the API inventory in the appendix under `/api/v1`. Public catalog data
is read-only. Managed datasets require authentication for reads and writes. A
managed Model currently binds to a dataset with the same ID; do not invent shared
dataset aliases. Model configuration, records, filters, access state, history, and
configuration documents remain separate concerns.

Use JSON files outside the static root, atomic replacement, in-process and
filesystem locks, and stable IDs. This is a single-host repository. Validate before
writing; failure leaves the prior file intact. Limit request bodies to 2 MiB.
Read collections in pages with default limit 100, maximum 1000, and response
`items`, `total`, `offset`, `limit`, `nextOffset`, `timeAxis`. Filter by inclusive
overlap bounds `from`/`to`, search, namespace, kind, and filterId. Order by time-axis
start and stable ID; saved sort metadata does not redefine this API order.

POST may generate a top-level record ID. Initial imported and nested activity IDs
must already be stable. PUT replaces records; PATCH merges objects, removes
null-valued fields, and replaces arrays. Preserve the item contract. A populated
dataset's time-axis semantics cannot be changed by replacing its Model.

Return ETags on reads. Require exact `If-Match` for mutations to existing datasets,
including collection POST. Missing preconditions return 428 and stale ones 412.
Support `If-None-Match` on GET/HEAD. Access and entitlement stores have independent
revisions; configuration document saves use document revisions. Return structured
`application/problem+json` with type, title, status, detail, instance. Cover
400, 401, 403, 404, 405, 409, 412, 415, 422, and 428 conditions.

Provision users and workspaces through system-admin APIs. Generated user bearer
tokens are returned once and stored as hashes. Built-in model roles are `admin`,
`readWrite`, and `readOnly`. Custom roles can grant read, record-write, filter-write;
only the built-in admin opens managed configuration editing. Grants reference
active users in the workspace and a protected model retains an active admin.
Enforce every check server-side, including direct requests.

`OPENBEXI_API_TOKEN` supplies system-admin recovery access;
`OPENBEXI_API_WRITE_TOKEN` and `OPENBEXI_API_READ_TOKEN` retain legacy access to
unscoped models only. Scoped models require grants. Personal filters are visible
to their creator and model administrators; shared filters to authorized readers.
Cloning a protected dataset inherits its workspace/grants before publication,
rebinds filter ownership, and leaves records unchanged. Deleted IDs remain reserved.

Workspace entitlement is independent of permissions. Modes are community,
commercial, and exempt. Exempt categories include student, researcher, charity,
nonprofit, and approved cases, with verification and optional expiry/suspension.
The current feature gate controls AI and does not constitute billing, purchase
verification, or a legal license. New workspaces have active community eligibility
and an AI feature flag, but AI also requires configured providers and model admin.

## 10. Model and YAML editor

Provide model and source-YAML drafts, form and advanced text editing, validation,
import/export, duplicate, undo/redo, revert, dirty-state warnings, and error paths.
Support models written directly as JSON or YAML. Preserve YAML comments, unrelated
keys, and structure; edit anchors/aliases explicitly in text to preserve meaning.
Reject duplicate keys and unsafe tags. Validate before any persistent operation.

Live preview runs the actual renderer in an isolated frame, debounces valid edits,
and retains the last valid preview after invalid input. Pause/manual refresh must
work. Preview supports Timeline/Table/Split, overview, filtering and 3D without
saving. Preview data selected by an administrator is fetched with credentials in
the editor, then passed through a temporary blob URL, never a token URL.

When opened from Settings, inherit the origin's current date, search, view, and
camera. Explicitly edited date/camera settings override that context. Apply to
original timeline uses a one-use, instance-scoped override, expires after one
minute, and reloads in 2D; it does not write a file. Support stable `instanceId`
for pages with multiple timelines. An intentionally changed nonempty data URL
takes precedence; otherwise retain original source precedence.

Model admins manage isolated `/models/{id}/config-files`; system admins manage
global `/config-files` and explicitly registered deployment roots. IDs are
server-issued; accept simple filenames rather than arbitrary paths. POST/PUT use
`{name,kind,text}`, with kind model or yaml. Responses include id, name, kind, text,
location, writable, restartRequired. Lists omit text. Require document ETags for
PUT/DELETE. Save before renaming; rename requires unchanged text. Reference
conflicts return 409. Atomic saves preserve original validated YAML text.

History contains configuration, not record snapshots. Opening an old version
creates a local draft; saving a copy does not roll back/deploy the active service.
Report history-write warnings without undoing a successful model save. Deployment
YAML changes report restart requirements. Static hosting retains local import,
preview and export; authenticated server CRUD is available only when connected.

Optional AI explains, generates, or repairs model configuration and may consume
a supported image as a rendering reference. Implement operator-configured provider
adapters/capabilities, server-held keys, request limits, cancellation, timeout,
schema validation, a reviewable diff, and stale-base protection. Apply changes the
draft; Save is separate. Never send source/deployment secrets or mutate records.
The editor remains fully usable without AI. Do not hard-code paid provider model
IDs or claim live-account compatibility from mocked tests alone.

## 11. Saved views, sharing, export, and embedding

Store at most 20 named views per source in browser storage. Same-name save replaces
that view; open/delete and storage-error feedback are required. Include source,
range, zoom, view, query/filter, grouping, overview settings and surviving selection.
Share local demos through URL state; connected pages must not leak private source
configuration. Copy/share actions do not publish datasets. Diagnostics omit record
content, query text, backend URLs, and browser storage.

Export filtered Table results as CSV. Bundle license/notices with static exports.

Expose `createTimelineEmbed(container, options)` from a dependency-free host module.
Use an iframe owning its CSS, Three.js version, controls, and WebGL context.
Options: url, title, model, data, view, appearance, timeoutMs (30000), onSelect,
onRangeChange, onStatus, onError. Commands are ordered promises, including those
queued before readiness:

| Member | Contract |
| --- | --- |
| `ready` | Resolves `{count,view,range}` after initialization |
| `setData(payload)` | Replaces a valid full snapshot, retaining view/range/surviving selection; rejects invalid input without discarding old data |
| `setRange(from,to)` | Uses ISO dates or epoch milliseconds, including numeric-axis models |
| `selectEvent(id)` | Focuses a unique item using mapped IDs; rejects missing/ambiguous IDs; does not echo onSelect |
| `setView(value)` | timeline, table, split |
| `setAppearance(value)` | default, apple, windows, minimal, contrast |
| `destroy()` | Removes frame/resources/listeners and rejects pending commands; idempotent |
| `iframe` | Exposes the frame element |

`onSelect` receives a copy of the original record plus ID and source path;
`onRangeChange` reports epoch-millisecond bounds; `onStatus` reports loading,
ready, or error. Validate sender window, exact origin, instance channel, and
command IDs. Isolate concurrent instances. Host handles authentication and data
fetching; embedded models never auto-fetch configured provider URLs. Disable
record editing and the model editor inside the frame. Respect CSP frame policies.

Provide an Earth Orbit adapter for launches, confirmed decays, and predicted
re-entry windows. Preserve NORAD IDs as strings and date precision, use distinct
stable IDs, prefer confirmed evidence over predictions, report invalid input,
and keep a host-side selection map outside record payloads. Refresh on catalog
revisions, not animation frames. This adapter accepts complete snapshots.

## 12. Installation, deployment, and licensing

Static quick start: `npm ci`, `npm run demo`, then
`http://localhost:8780/demos.html`. API quick start: configure independent random
tokens of at least 32 characters, use private `OPENBEXI_API_DATA_DIR`, run
`npm run api`, then `http://localhost:8781/api/v1/health`. Development listeners
bind to loopback. Optional CORS origins are exact allowlisted origins.

Native service launchers accept `-data_conf <yaml-file>` and respect explicit
arguments, `OPENBEXI_TIMELINE_CONFIG`, legacy `OPENBEXI_TIMELINE_DATA_PATH`, then
`yaml/sources_startup.yml`. The last is a local deployment file, not a shipped
secret. `JDK_HOME`, then `JAVA_HOME`, then PATH selects Java. Preserve environment
configuration and fail clearly on missing files. Maven populates `target/runtime`.

Provide a Docker build with an unprivileged runtime and persistent data volume.
Serve only allowlisted public assets; prevent traversal, symlink escape, dotfile,
YAML, Java source, build-output, and arbitrary-file exposure. Keep mutable API data
outside the web root. Use HTTPS remotely and pass bearer credentials only in
Authorization headers. Do not persist tokens in URLs, models or local storage.

Build static deployment output with `npm run pages:build`; verify relative paths
under a subdirectory with `npm run pages:verify`. Package releases from an explicit
public manifest with versions, source archive, checksums and dependency notices.
Do not publish or push as part of merely recreating the application.

Preserve the supplied Commercial and Exempt Use License and third-party notices.
The Timeline repository's `LICENSE` governs that application; HBDS has its own
`COMMERCIAL_LICENSE.md`. Do not replace either with an invented license. Historical
GPL text preserves historical grants, not an alternative license for the current
distribution. Entitlement settings do not themselves grant legal rights.

## 13. Delivery sequence and acceptance tests

Implement and verify in this order: contracts and synthetic fixtures; static
rendering and time math; UI/filters/search/overview; connected loading; API/storage
and authorization; model editing/history; embedding/optional AI; deployment and
documentation. Each stage must have runnable behavior before expanding its scope.

Required acceptance cases:

1. All seven demos load without Java or browser console errors. All 14 inspected
   model files validate under the correct family without losing legacy fields.
2. Calendar, leap years, DST display, BCE and decreasing numeric axes remain
   correct across navigation, ticks, range queries, focus and overview mapping.
3. Legacy and advanced filters agree across browser and Java; invalid expressions
   retain the valid view. Include/source exclusions win and pagination is filtered.
4. Event/session/activity payloads survive model edits, preview, access changes,
   AI drafts, embedding and save/reload without metadata/type/nesting loss.
5. All views, details, selection, filters, grouping, CSV, saved views, share state,
   keyboard actions, 3D switching, resizing and narrow layouts work together.
6. Empty first pages, partial coverage, cancellation, stale responses, bounded
   caches, unavailable sources, final no-match, and revision-only SSE are tested.
7. API CRUD survives restart. Missing/stale ETags, conflicting writers, malformed
   input, duplicate IDs, read-only examples, scoped grants and protected clones
   return the specified behavior without partial writes or cross-model access.
8. Editor import/export, YAML comments, live preview, invalid drafts, dirty-state
   protection, one-use apply, config CRUD, rename conflicts and history are tested.
9. AI requests use local mock providers in automated tests and require review;
   cancellation, invalid candidates and stale drafts preserve existing work.
10. Embedding supports multiple instances, early commands, invalid snapshots,
    original-record selection, cross-origin validation and resource cleanup.
11. Public hosting exposes only allowed assets and excludes private configuration.
12. The HBDS companion passes the visualization checks in section 14.

Baseline validation commands to implement and document:

```sh
npm ci
npm run demos:schemas -- --check
npm run demos:validate
npm run demos:readme -- --check
npm run api:spec -- --check
npm test
npx playwright install chromium --only-shell
npm run test:browser
npm run test:browser:compat
npm run test:browser:performance
mvn --batch-mode --no-transfer-progress verify
npm run test:integration
npm run test:embed
npm run pages:build
npm run pages:verify
```

Install the browsers required by compatibility/performance configurations before
those suites. Use temporary data directories and synthetic credentials. Report
which checks actually ran and disclose failures or external dependencies. Do not
regenerate frozen compatibility fixtures just to hide a format change.

## 14. HBDS companion model and attribute visualization

These requirements apply to **openbexi_hbds**, which documents the Timeline domain;
they are not extra Timeline wire-format requirements.

Create `models/openbexi_timeline.json` with noun class names and verb relationships.
Keep User outside Model, with a role attribute and creates/updates/deletes links to
Model and Filter. Record belongs to Source. Namespace belongs to Model. Model
nests Parameter, Band, Zone, Range, Focus, Tick, Grouping, Condition, Header, and
Scale as well as Namespace. Source also contains Rule and Time.

Use `Filter —filters→ Record`, `Model —connects to→ Source`, and exactly one
`Model —uses→ Render`. Render is outside Source. All descendants of Model inherit
its render settings, with local overrides; do not draw an extra uses edge for
each descendant or confuse containment with class inheritance. Keep source-field
mappings and coverage for every observed model path, including nested options.

In Layout and view, place the **Separates links** checkbox immediately after
Algorithm. It defaults on, preserves an explicit saved off preference, and separates
parallel links and labels with border clearance. Avoid unrelated nodes and labels.
None retains node positions. Grid/Radial/Hierarchy optimization is deterministic.

Preserve the existing rounded class containers, dimensions, colors, square markers,
and small upper-right circular connection points. ATT1 is outside the container,
level with the existing circle. Draw exactly one horizontal segment from the
circle's right edge to ATT1's marker. ATT2 and later attributes form one aligned
column below ATT1 with no extra connectors. Empty lists have no connector.
Use the actual existing point; do not reposition or restyle it. Apply the same
rule to classes and hyperclasses, regardless of attribute count.

Use a very small default clear row gap, **0.02 world units**. Add **Attribute
spacing** to the **2D attribute inspector** with a slider and visible numeric
value (0 to 1, step 0.01), immediate feedback, Reset, Undo/Redo, read-only disabling,
and normal save/reload persistence. It adjusts the selected attribute owner's
whole list, stored as `rendering.attributes.spacing`; it never adds a field to
an individual domain attribute. Changing spacing does not resize the container
or move ATT1. Reserve text/marker height separately from clear spacing.

Double default attribute font size: **24px instead of 12px**. Inherit twice the
overall size when no attribute-specific setting exists, capped by the existing
72px limit; retain explicit font controls. For the shipped Timeline model, double
the previous explicit 20px attribute setting to **40px**. Other text types retain
their settings. At overview zoom reserve **0.34 world units** for text, twice the
previous 0.17-unit allowance, and fit text within its column. Row pitch is the
larger of text/marker height plus the chosen gap, so reducing spacing does not
shrink labels or cause adjacent rows to overlap.

Validate zero, one, two, four and many attributes; both owner types; minimum and
maximum spacing; custom markers; zoom; reset/undo; read-only mode; and reload.
Assert one connector only, stable ATT1/circle, aligned labels/markers, unchanged
domain attributes and class sizes, and larger default text. Run the HBDS layout
and browser regressions and `models/validate_satellite_models.py`.

## 15. Explicit future scope and limitations

The baseline does not implement public registration/federated login, billing or
automated exemption verification, a distributed transactional repository, shared
managed-dataset aliases, automatic deployment/rollback, embedded record editing,
or streaming JSON patch input to the embed SDK. Treat these as proposed extensions
requiring separate design and acceptance criteria. Optional legacy providers do
not automatically support the file provider's historical scan capabilities.

When reproducing the baseline without its source, implement the contracts and
synthetic examples above, then validate every appendix field and acceptance case.
Record any consciously deferred provider or integration; do not substitute silent
success for unavailable capabilities.

<!-- GENERATED_CONTRACT_INVENTORY -->

## Appendix A. Inspected model inventory

All JSON models under the source `models/` directory were recursively scanned.
Hashes identify the inspected content; no operational record data is copied.

| File | Family | Bands | SHA-256 prefix |
| --- | --- | ---: | --- |
| `models/demos/default-dataset.json` | demo | 2 | `53153e961128807c` |
| `models/demos/dinausaurs.json` | demo | 2 | `d25419b739a6da4a` |
| `models/demos/ephemeris.json` | demo | 1 | `f0892529049f7236` |
| `models/demos/jfk.json` | demo | 2 | `2cc61e8d3a621897` |
| `models/demos/monet.json` | demo | 2 | `38d39f3fd411b0b7` |
| `models/demos/religions.json` | demo | 4 | `432f33534528d110` |
| `models/demos/space_exploration.json` | demo | 2 | `55181dba269ca766` |
| `models/MCC_timeline.json` | legacy | 2 | `7bef6d54ae2f8215` |
| `models/regular_timeline.json` | legacy | 2 | `6e8b404f184a5911` |
| `models/regular_timeline_earthquake.json` | legacy | 2 | `13721a90906ba90c` |
| `models/regular_timeline_esoc.json` | legacy | 2 | `57695d8194c5860e` |
| `models/regular_timeline_mcc.json` | legacy | 2 | `99453c8168369711` |
| `models/regular_timeline_pov.json` | legacy | 2 | `de3d92b2c4708a4a` |
| `models/SOC_timeline.json` | legacy | 2 | `80aa6cfc8d8511c1` |

Observed property paths (JSON Pointer notation; `*` means an array element):

| Path | Observed types |
| --- | --- |
| `/bands` | array |
| `/bands/*` | object |
| `/bands/*/SessionColor` | string |
| `/bands/*/color` | string |
| `/bands/*/context` | object |
| `/bands/*/context/from` | number, string |
| `/bands/*/context/to` | number, string |
| `/bands/*/dateColor` | string |
| `/bands/*/dateFormat` | string |
| `/bands/*/defaultEventSize` | number |
| `/bands/*/eventColor` | string |
| `/bands/*/eventKind` | string |
| `/bands/*/filter` | object |
| `/bands/*/filter/equals` | string |
| `/bands/*/filter/field` | string |
| `/bands/*/fitRows` | boolean |
| `/bands/*/focus` | array, object |
| `/bands/*/focus/*` | object |
| `/bands/*/focus/*/from` | string |
| `/bands/*/focus/*/magnification` | number |
| `/bands/*/focus/*/ticks` | object |
| `/bands/*/focus/*/ticks/format` | string |
| `/bands/*/focus/*/ticks/step` | number |
| `/bands/*/focus/*/ticks/unit` | string |
| `/bands/*/focus/*/to` | string |
| `/bands/*/focus/from` | string |
| `/bands/*/focus/magnification` | number |
| `/bands/*/focus/tickMinutes` | number |
| `/bands/*/focus/ticks` | object |
| `/bands/*/focus/ticks/step` | number |
| `/bands/*/focus/ticks/unit` | string |
| `/bands/*/focus/to` | string |
| `/bands/*/fontSize` | number |
| `/bands/*/groupBy` | string |
| `/bands/*/height` | string |
| `/bands/*/intervalPixels` | number, string |
| `/bands/*/intervalUnit` | string |
| `/bands/*/intervalUnitPos` | string |
| `/bands/*/labelPosition` | string |
| `/bands/*/model` | array |
| `/bands/*/model/*` | object |
| `/bands/*/model/*/alternateColor` | string |
| `/bands/*/model/*/sortBy` | string |
| `/bands/*/name` | string |
| `/bands/*/overviewLabel` | boolean, string |
| `/bands/*/range` | object |
| `/bands/*/range/from` | number, string |
| `/bands/*/range/to` | number, string |
| `/bands/*/scaleHeader` | object |
| `/bands/*/scaleHeader/color` | string |
| `/bands/*/scaleHeader/height` | number |
| `/bands/*/scaleHeader/label` | string |
| `/bands/*/scaleHeader/textColor` | string |
| `/bands/*/scaleHeader/unit` | string |
| `/bands/*/secondaryScale` | object |
| `/bands/*/secondaryScale/color` | string |
| `/bands/*/secondaryScale/format` | string |
| `/bands/*/secondaryScale/height` | number |
| `/bands/*/secondaryScale/origin` | string |
| `/bands/*/secondaryScale/position` | string |
| `/bands/*/secondaryScale/step` | number |
| `/bands/*/secondaryScale/suffix` | string |
| `/bands/*/secondaryScale/textColor` | string |
| `/bands/*/sessionHeight` | number |
| `/bands/*/showContextLabel` | boolean |
| `/bands/*/sourceBands` | array |
| `/bands/*/sourceBands/*` | string |
| `/bands/*/subIntervalPixels` | string |
| `/bands/*/textColor` | string |
| `/bands/*/tickMinutes` | number |
| `/bands/*/ticks` | object |
| `/bands/*/ticks/format` | string |
| `/bands/*/ticks/step` | number |
| `/bands/*/ticks/unit` | string |
| `/bands/*/topPadding` | number |
| `/bands/*/trackIncrement` | number |
| `/bands/*/uncertaintyOpacity` | number |
| `/bands/*/viewportHandles` | boolean |
| `/dataSource` | object |
| `/dataSource/fields` | object |
| `/dataSource/fields/namespace` | string |
| `/dataSource/format` | string |
| `/dataSource/iconColors` | object |
| `/dataSource/iconColors/..~1..~1api~1images~1dark-red-circle.png` | string |
| `/dataSource/iconColors/..~1..~1api~1images~1green-circle.png` | string |
| `/dataSource/recordsPath` | string |
| `/dataSource/time` | object |
| `/dataSource/time/approximatePrefixes` | array |
| `/dataSource/time/approximatePrefixes/*` | string |
| `/dataSource/time/direction` | number |
| `/dataSource/time/kind` | string |
| `/dataSource/time/millisecondsPerUnit` | number |
| `/dataSource/time/unit` | string |
| `/dataSource/zones` | array |
| `/dataSource/zones/*` | object |
| `/dataSource/zones/*/color` | string |
| `/dataSource/zones/*/end` | string |
| `/dataSource/zones/*/opacity` | number |
| `/dataSource/zones/*/render` | object |
| `/dataSource/zones/*/render/labelPosition` | string |
| `/dataSource/zones/*/start` | string |
| `/dataSource/zones/*/title` | string |
| `/params` | array |
| `/params/*` | object |
| `/params/*/data` | string |
| `/params/*/data_default_port` | number |
| `/params/*/data_sse_port` | number |
| `/params/*/date` | number, string |
| `/params/*/displayOffsetMinutes` | number |
| `/params/*/dockOverview` | boolean |
| `/params/*/fontSize` | number |
| `/params/*/fullWindow` | boolean |
| `/params/*/height` | number |
| `/params/*/left` | number |
| `/params/*/name` | string |
| `/params/*/overview` | boolean |
| `/params/*/overviewHeightRatio` | number |
| `/params/*/showCurrentTime` | boolean |
| `/params/*/timeZone` | string |
| `/params/*/timeZoneLabel` | string |
| `/params/*/title` | string |
| `/params/*/top` | number |
| `/params/*/width` | number |

## Appendix B. Exact model validation contract

The following draft-07 schema is the strict file-backed model contract.
Its rendering property is supplied by Appendix C. All local definition references
resolve within this schema. Reinsert Appendix C at `properties.rendering`.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://openbexi.org/schemas/demo-model.schema.json",
  "title": "OpenBEXI file-backed timeline model",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "params",
    "dataSource",
    "bands"
  ],
  "properties": {
    "$schema": {
      "type": "string"
    },
    "params": {
      "type": "array",
      "minItems": 1,
      "maxItems": 1,
      "items": {
        "$ref": "#/definitions/params"
      }
    },
    "dataSource": {
      "$ref": "#/definitions/dataSource"
    },
    "bands": {
      "type": "array",
      "minItems": 1,
      "items": {
        "$ref": "#/definitions/band"
      }
    }
  },
  "definitions": {
    "text": {
      "type": "string",
      "minLength": 1
    },
    "positive": {
      "type": "number",
      "exclusiveMinimum": 0
    },
    "timeValue": {
      "type": [
        "string",
        "number"
      ],
      "minLength": 1
    },
    "unit": {
      "enum": [
        "MILLISECOND",
        "SECOND",
        "MINUTE",
        "HOUR",
        "DAY",
        "WEEK",
        "MONTH",
        "YEAR",
        "DECADE",
        "CENTURY"
      ]
    },
    "path": {
      "type": "string",
      "pattern": "^[A-Za-z_][A-Za-z0-9_-]*(\\.[A-Za-z0-9_-]+)*$"
    },
    "field": {
      "anyOf": [
        {
          "$ref": "#/definitions/path"
        },
        {
          "type": "array",
          "minItems": 1,
          "uniqueItems": true,
          "items": {
            "$ref": "#/definitions/path"
          }
        }
      ]
    },
    "range": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "from",
        "to"
      ],
      "properties": {
        "from": {
          "$ref": "#/definitions/timeValue"
        },
        "to": {
          "$ref": "#/definitions/timeValue"
        }
      }
    },
    "ticks": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "unit",
        "step"
      ],
      "properties": {
        "unit": {
          "enum": [
            "MILLISECOND",
            "SECOND",
            "MINUTE",
            "HOUR",
            "DAY",
            "WEEK",
            "MONTH",
            "YEAR",
            "DECADE",
            "CENTURY",
            "NUMERIC"
          ]
        },
        "step": {
          "$ref": "#/definitions/positive"
        },
        "format": {
          "$ref": "#/definitions/text"
        }
      }
    },
    "focus": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "from",
        "to",
        "magnification"
      ],
      "properties": {
        "from": {
          "$ref": "#/definitions/timeValue"
        },
        "to": {
          "$ref": "#/definitions/timeValue"
        },
        "magnification": {
          "type": "number",
          "minimum": 1
        },
        "ticks": {
          "$ref": "#/definitions/ticks"
        },
        "tickMinutes": {
          "$ref": "#/definitions/positive"
        }
      }
    },
    "params": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name",
        "date",
        "width",
        "height"
      ],
      "properties": {
        "name": {
          "$ref": "#/definitions/text"
        },
        "title": {
          "type": "string"
        },
        "date": {
          "$ref": "#/definitions/timeValue"
        },
        "timeZone": {
          "type": "string"
        },
        "timeZoneLabel": {
          "type": "string"
        },
        "displayOffsetMinutes": {
          "type": "number",
          "minimum": -1440,
          "maximum": 1440
        },
        "top": {
          "type": "number"
        },
        "left": {
          "type": "number"
        },
        "width": {
          "$ref": "#/definitions/positive"
        },
        "height": {
          "$ref": "#/definitions/positive"
        },
        "fontSize": {
          "$ref": "#/definitions/positive"
        },
        "fontFamily": {
          "$ref": "#/definitions/text"
        },
        "data": {
          "type": "string"
        },
        "overview": {
          "type": "boolean"
        },
        "dockOverview": {
          "type": "boolean"
        },
        "overviewHeightRatio": {
          "type": "number",
          "exclusiveMinimum": 0,
          "exclusiveMaximum": 1
        },
        "showCurrentTime": {
          "type": "boolean"
        },
        "dateAxisMode": {
          "enum": [
            "shared",
            "per-band"
          ],
          "default": "shared",
          "description": "shared shows one date axis at the top of each visible page; per-band shows each main band's axis using intervalUnitPos. Overview keeps its independent context axis."
        },
        "fullWindow": {
          "type": "boolean",
          "default": true,
          "description": "Fill available browser space; false uses custom geometry bounded by the viewport."
        },
        "camera": {
          "enum": [
            "Orthographic",
            "Perspective"
          ]
        },
        "fontStyle": {
          "enum": [
            "normal",
            "italic",
            "oblique"
          ]
        },
        "fontWeight": {
          "type": [
            "string",
            "number"
          ]
        }
      }
    },
    "dataSource": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "format"
      ],
      "properties": {
        "format": {
          "enum": [
            "json",
            "simile-xml"
          ]
        },
        "url": {
          "$ref": "#/definitions/text"
        },
        "recordsPath": {
          "$ref": "#/definitions/path"
        },
        "fields": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "id": {
              "$ref": "#/definitions/field"
            },
            "title": {
              "$ref": "#/definitions/field"
            },
            "description": {
              "$ref": "#/definitions/field"
            },
            "namespace": {
              "$ref": "#/definitions/field"
            },
            "color": {
              "$ref": "#/definitions/field"
            }
          }
        },
        "iconColors": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/text"
          }
        },
        "zones": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/zone"
          }
        },
        "time": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "kind",
            "unit",
            "millisecondsPerUnit"
          ],
          "properties": {
            "kind": {
              "const": "numeric"
            },
            "unit": {
              "$ref": "#/definitions/text"
            },
            "millisecondsPerUnit": {
              "$ref": "#/definitions/positive"
            },
            "direction": {
              "enum": [
                -1,
                1
              ]
            },
            "approximatePrefixes": {
              "type": "array",
              "uniqueItems": true,
              "items": {
                "$ref": "#/definitions/text"
              }
            }
          }
        }
      }
    },
    "zone": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "start",
        "end",
        "title"
      ],
      "properties": {
        "id": {
          "type": [
            "string",
            "number"
          ]
        },
        "start": {
          "$ref": "#/definitions/timeValue"
        },
        "end": {
          "$ref": "#/definitions/timeValue"
        },
        "title": {
          "type": "string"
        },
        "color": {
          "$ref": "#/definitions/text"
        },
        "opacity": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "render": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "color": {
              "$ref": "#/definitions/text"
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "height": {
              "$ref": "#/definitions/positive"
            },
            "verticalAlign": {
              "enum": [
                "top",
                "center"
              ]
            },
            "labelPosition": {
              "enum": [
                "top",
                "bottom"
              ]
            }
          }
        }
      }
    },
    "band": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name",
        "height",
        "intervalUnit",
        "intervalPixels"
      ],
      "dependencies": {
        "context": [
          "range"
        ],
        "focus": [
          "range"
        ]
      },
      "properties": {
        "name": {
          "$ref": "#/definitions/text"
        },
        "height": {
          "anyOf": [
            {
              "$ref": "#/definitions/positive"
            },
            {
              "type": "string",
              "pattern": "^(?:[1-9][0-9]*(?:\\.[0-9]+)?|0\\.[0-9]*[1-9][0-9]*)%$"
            }
          ]
        },
        "intervalUnit": {
          "$ref": "#/definitions/unit"
        },
        "intervalPixels": {
          "$ref": "#/definitions/positive"
        },
        "color": {
          "$ref": "#/definitions/text"
        },
        "SessionColor": {
          "$ref": "#/definitions/text"
        },
        "eventColor": {
          "$ref": "#/definitions/text"
        },
        "dateColor": {
          "$ref": "#/definitions/text"
        },
        "textColor": {
          "$ref": "#/definitions/text"
        },
        "dateFormat": {
          "$ref": "#/definitions/text"
        },
        "fontSize": {
          "$ref": "#/definitions/positive"
        },
        "intervalUnitPos": {
          "enum": [
            "TOP",
            "BOTTOM"
          ]
        },
        "model": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "sortBy"
            ],
            "properties": {
              "sortBy": {
                "const": "NONE"
              }
            }
          }
        },
        "range": {
          "$ref": "#/definitions/range"
        },
        "context": {
          "$ref": "#/definitions/range"
        },
        "focus": {
          "anyOf": [
            {
              "$ref": "#/definitions/focus"
            },
            {
              "type": "array",
              "minItems": 1,
              "items": {
                "$ref": "#/definitions/focus"
              }
            }
          ]
        },
        "ticks": {
          "$ref": "#/definitions/ticks"
        },
        "tickMinutes": {
          "$ref": "#/definitions/positive"
        },
        "labelPosition": {
          "enum": [
            "above",
            "inside"
          ]
        },
        "topPadding": {
          "type": "number",
          "minimum": 0
        },
        "trackIncrement": {
          "$ref": "#/definitions/positive"
        },
        "sessionHeight": {
          "$ref": "#/definitions/positive"
        },
        "defaultEventSize": {
          "$ref": "#/definitions/positive"
        },
        "groupBy": {
          "$ref": "#/definitions/path"
        },
        "eventKind": {
          "enum": [
            "event",
            "duration"
          ]
        },
        "filter": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "field",
            "equals"
          ],
          "properties": {
            "field": {
              "$ref": "#/definitions/path"
            },
            "equals": {
              "type": [
                "string",
                "number",
                "boolean",
                "null"
              ]
            }
          }
        },
        "sourceBands": {
          "type": "array",
          "minItems": 1,
          "uniqueItems": true,
          "items": {
            "$ref": "#/definitions/text"
          }
        },
        "fitRows": {
          "type": "boolean"
        },
        "showContextLabel": {
          "type": "boolean"
        },
        "viewportHandles": {
          "type": "boolean"
        },
        "overviewContextRatio": {
          "type": "number",
          "minimum": 1,
          "maximum": 12
        },
        "overviewMarkerSize": {
          "type": "number",
          "minimum": 1,
          "maximum": 12
        },
        "overviewLabel": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "const": false
            }
          ]
        },
        "uncertaintyOpacity": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "scaleHeader": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "label"
          ],
          "properties": {
            "label": {
              "type": "string"
            },
            "unit": {
              "type": "string"
            },
            "height": {
              "$ref": "#/definitions/positive"
            },
            "color": {
              "$ref": "#/definitions/text"
            },
            "textColor": {
              "$ref": "#/definitions/text"
            }
          }
        },
        "secondaryScale": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "format",
            "origin",
            "step"
          ],
          "properties": {
            "format": {
              "const": "elapsedYears"
            },
            "origin": {
              "$ref": "#/definitions/timeValue"
            },
            "step": {
              "$ref": "#/definitions/positive"
            },
            "position": {
              "enum": [
                "top",
                "bottom"
              ]
            },
            "height": {
              "$ref": "#/definitions/positive"
            },
            "color": {
              "$ref": "#/definitions/text"
            },
            "textColor": {
              "$ref": "#/definitions/text"
            },
            "suffix": {
              "type": "string"
            },
            "min": {
              "type": "number"
            }
          }
        },
        "fontFamily": {
          "$ref": "#/definitions/text"
        },
        "fontStyle": {
          "enum": [
            "normal",
            "italic",
            "oblique"
          ]
        },
        "fontWeight": {
          "type": [
            "string",
            "number"
          ]
        }
      }
    }
  }
}
```


For the legacy family, start with that schema, replace these root fields,
then replace each named definition below. Retain all other definitions and
the same strict rendering contract. This preserves extension fields.

```json
{
  "root": {
    "$id": "https://openbexi.org/schemas/legacy-model.schema.json",
    "title": "OpenBEXI provider and legacy timeline model",
    "additionalProperties": true,
    "required": [
      "params",
      "bands"
    ]
  },
  "properties": {},
  "definitions": {
    "params": {
      "type": "object",
      "additionalProperties": true,
      "required": [
        "name"
      ],
      "properties": {
        "name": {
          "$ref": "#/definitions/text"
        },
        "title": {
          "type": "string"
        },
        "date": {
          "$ref": "#/definitions/timeValue"
        },
        "timeZone": {
          "type": "string"
        },
        "timeZoneLabel": {
          "type": "string"
        },
        "displayOffsetMinutes": {
          "type": "number",
          "minimum": -1440,
          "maximum": 1440
        },
        "top": {
          "type": "number"
        },
        "left": {
          "type": "number"
        },
        "width": {
          "$ref": "#/definitions/positive"
        },
        "height": {
          "$ref": "#/definitions/positive"
        },
        "fontSize": {
          "$ref": "#/definitions/positive"
        },
        "fontFamily": {
          "$ref": "#/definitions/text"
        },
        "data": {
          "type": "string"
        },
        "overview": {
          "type": "boolean"
        },
        "dockOverview": {
          "type": "boolean"
        },
        "overviewHeightRatio": {
          "type": "number",
          "exclusiveMinimum": 0,
          "exclusiveMaximum": 1
        },
        "showCurrentTime": {
          "type": "boolean"
        },
        "dateAxisMode": {
          "enum": [
            "shared",
            "per-band"
          ],
          "default": "shared",
          "description": "shared shows one date axis at the top of each visible page; per-band shows each main band's axis using intervalUnitPos. Overview keeps its independent context axis."
        },
        "fullWindow": {
          "type": "boolean",
          "default": true,
          "description": "Fill available browser space; false uses custom geometry bounded by the viewport."
        },
        "camera": {
          "enum": [
            "Orthographic",
            "Perspective"
          ]
        },
        "fontStyle": {
          "enum": [
            "normal",
            "italic",
            "oblique"
          ]
        },
        "fontWeight": {
          "type": [
            "string",
            "number"
          ]
        }
      }
    },
    "band": {
      "type": "object",
      "additionalProperties": true,
      "required": [
        "name"
      ],
      "dependencies": {
        "context": [
          "range"
        ],
        "focus": [
          "range"
        ]
      },
      "properties": {
        "name": {
          "$ref": "#/definitions/text"
        },
        "height": {
          "anyOf": [
            {
              "$ref": "#/definitions/positive"
            },
            {
              "type": "string",
              "pattern": "^(?:[1-9][0-9]*(?:\\.[0-9]+)?|0\\.[0-9]*[1-9][0-9]*)%$"
            }
          ]
        },
        "intervalUnit": {
          "$ref": "#/definitions/unit"
        },
        "intervalPixels": {
          "anyOf": [
            {
              "$ref": "#/definitions/positive"
            },
            {
              "type": "string",
              "pattern": "^[0-9]+(?:\\.[0-9]+)?$"
            }
          ]
        },
        "color": {
          "$ref": "#/definitions/text"
        },
        "SessionColor": {
          "$ref": "#/definitions/text"
        },
        "eventColor": {
          "$ref": "#/definitions/text"
        },
        "dateColor": {
          "$ref": "#/definitions/text"
        },
        "textColor": {
          "$ref": "#/definitions/text"
        },
        "dateFormat": {
          "$ref": "#/definitions/text"
        },
        "fontSize": {
          "type": [
            "number",
            "string"
          ]
        },
        "intervalUnitPos": {
          "enum": [
            "TOP",
            "BOTTOM"
          ]
        },
        "model": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": true,
            "properties": {
              "sortBy": {
                "type": "string"
              },
              "alternateColor": {
                "$ref": "#/definitions/text"
              }
            }
          }
        },
        "range": {
          "$ref": "#/definitions/range"
        },
        "context": {
          "$ref": "#/definitions/range"
        },
        "focus": {
          "anyOf": [
            {
              "$ref": "#/definitions/focus"
            },
            {
              "type": "array",
              "minItems": 1,
              "items": {
                "$ref": "#/definitions/focus"
              }
            }
          ]
        },
        "ticks": {
          "$ref": "#/definitions/ticks"
        },
        "tickMinutes": {
          "$ref": "#/definitions/positive"
        },
        "labelPosition": {
          "enum": [
            "above",
            "inside"
          ]
        },
        "topPadding": {
          "type": "number",
          "minimum": 0
        },
        "trackIncrement": {
          "$ref": "#/definitions/positive"
        },
        "sessionHeight": {
          "$ref": "#/definitions/positive"
        },
        "defaultEventSize": {
          "$ref": "#/definitions/positive"
        },
        "groupBy": {
          "$ref": "#/definitions/path"
        },
        "eventKind": {
          "enum": [
            "event",
            "duration"
          ]
        },
        "filter": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "field",
            "equals"
          ],
          "properties": {
            "field": {
              "$ref": "#/definitions/path"
            },
            "equals": {
              "type": [
                "string",
                "number",
                "boolean",
                "null"
              ]
            }
          }
        },
        "sourceBands": {
          "type": "array",
          "minItems": 1,
          "uniqueItems": true,
          "items": {
            "$ref": "#/definitions/text"
          }
        },
        "fitRows": {
          "type": "boolean"
        },
        "showContextLabel": {
          "type": "boolean"
        },
        "viewportHandles": {
          "type": "boolean"
        },
        "overviewContextRatio": {
          "type": "number",
          "minimum": 1,
          "maximum": 12
        },
        "overviewMarkerSize": {
          "type": "number",
          "minimum": 1,
          "maximum": 12
        },
        "overviewLabel": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "const": false
            }
          ]
        },
        "uncertaintyOpacity": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "scaleHeader": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "label"
          ],
          "properties": {
            "label": {
              "type": "string"
            },
            "unit": {
              "type": "string"
            },
            "height": {
              "$ref": "#/definitions/positive"
            },
            "color": {
              "$ref": "#/definitions/text"
            },
            "textColor": {
              "$ref": "#/definitions/text"
            }
          }
        },
        "secondaryScale": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "format",
            "origin",
            "step"
          ],
          "properties": {
            "format": {
              "const": "elapsedYears"
            },
            "origin": {
              "$ref": "#/definitions/timeValue"
            },
            "step": {
              "$ref": "#/definitions/positive"
            },
            "position": {
              "enum": [
                "top",
                "bottom"
              ]
            },
            "height": {
              "$ref": "#/definitions/positive"
            },
            "color": {
              "$ref": "#/definitions/text"
            },
            "textColor": {
              "$ref": "#/definitions/text"
            },
            "suffix": {
              "type": "string"
            },
            "min": {
              "type": "number"
            }
          }
        },
        "fontFamily": {
          "$ref": "#/definitions/text"
        },
        "fontStyle": {
          "enum": [
            "normal",
            "italic",
            "oblique"
          ]
        },
        "fontWeight": {
          "type": [
            "string",
            "number"
          ]
        },
        "subIntervalPixels": {
          "type": [
            "number",
            "string"
          ]
        },
        "texture": {
          "type": "string"
        },
        "defaultSessionTexture": {
          "type": "string"
        }
      }
    }
  }
}
```


## Appendix C. Rendering schema, defaults, and bounds

Every group below is optional. Reject unlisted keys within these groups.
Deeply apply the listed defaults when a key is omitted; explicit null
theme colors retain the stylesheet. These are presentation preferences.
Decode HTML entities in table cells when reconstructing JSON: `&#124;`
represents a pipe and `&#96;` represents a backtick.

| JSON property | Validation and default |
| --- | --- |
| `rendering` | `{"type":"object","additionalProperties":false,"description":"Optional rendering settings. Omitted properties retain the existing presentation."}` |
| `rendering.theme` | `{"type":"object","additionalProperties":false,"description":"Scene and optional application surface colors."}` |
| `rendering.theme.sceneBackground` | `{"type":"string","default":"#f7f9fc","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Canvas background."}` |
| `rendering.theme.headerBackground` | `{"type":["string","null"],"default":null,"minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Header background; null keeps the stylesheet theme."}` |
| `rendering.theme.panelBackground` | `{"type":["string","null"],"default":null,"minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Timeline panel background; null keeps the stylesheet theme."}` |
| `rendering.theme.panelText` | `{"type":["string","null"],"default":null,"minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Panel text color; null keeps the stylesheet theme."}` |
| `rendering.axis` | `{"type":"object","additionalProperties":false,"description":"Date axes and automatic tick spacing."}` |
| `rendering.axis.background` | `{"type":"string","default":"#f7f9fc","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Date axis and date-label background."}` |
| `rendering.axis.separatorColor` | `{"type":"string","default":"#8090a0","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Date-axis boundary color."}` |
| `rendering.axis.textColor` | `{"type":"string","default":"#233449","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Date label color."}` |
| `rendering.axis.minimumHeight` | `{"type":"number","default":28,"minimum":16,"maximum":160,"description":"Minimum date-axis height in pixels."}` |
| `rendering.axis.verticalPadding` | `{"type":"number","default":16,"minimum":0,"maximum":80,"description":"Additional axis height above the band font size."}` |
| `rendering.axis.minimumFontSize` | `{"type":"number","default":12,"minimum":6,"maximum":48,"description":"Minimum canvas date-label font size in pixels."}` |
| `rendering.axis.targetTickPixels` | `{"type":"number","default":100,"minimum":30,"maximum":400,"description":"Preferred distance between automatically chosen time labels."}` |
| `rendering.axis.groupHeaderHeight` | `{"type":"number","default":24,"minimum":12,"maximum":120,"description":"Space reserved for a group heading."}` |
| `rendering.axis.scaleHeaderColor` | `{"type":"string","default":"#edf0f1","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Default scale-header background."}` |
| `rendering.axis.scaleHeaderText` | `{"type":"string","default":"#397a9c","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Default scale-header text."}` |
| `rendering.axis.secondaryColor` | `{"type":"string","default":"#ffd58a","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Default secondary-scale background."}` |
| `rendering.axis.secondaryText` | `{"type":"string","default":"#704308","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Default secondary-scale text."}` |
| `rendering.overview` | `{"type":"object","additionalProperties":false,"description":"Overview SVG labels, markers and visible-range indicators."}` |
| `rendering.overview.borderColor` | `{"type":"string","default":"#aab8bf","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Top divider."}` |
| `rendering.overview.headingColor` | `{"type":"string","default":"#566871","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Heading and record-count text."}` |
| `rendering.overview.headingFontSize` | `{"type":"number","default":11,"minimum":6,"maximum":32,"description":"Default overview heading size."}` |
| `rendering.overview.countFontSize` | `{"type":"number","default":10,"minimum":6,"maximum":32,"description":"Record-count size."}` |
| `rendering.overview.axisFontSize` | `{"type":"number","default":10,"minimum":6,"maximum":32,"description":"Overview date-label size."}` |
| `rendering.overview.markerStroke` | `{"type":"string","default":"#253746","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Record marker outline."}` |
| `rendering.overview.markerStrokeWidth` | `{"type":"number","default":0.35,"minimum":0,"maximum":8,"description":"Record marker outline width."}` |
| `rendering.overview.dimmedOpacity` | `{"type":"number","default":0.25,"minimum":0,"maximum":1,"description":"Opacity multiplier for nonmatching records during search."}` |
| `rendering.overview.matchColor` | `{"type":"string","default":"#ffe04b","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Search-match fill."}` |
| `rendering.overview.matchOpacity` | `{"type":"number","default":0.95,"minimum":0,"maximum":1,"description":"Search-match opacity."}` |
| `rendering.overview.matchStroke` | `{"type":"string","default":"#783800","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Search-match outline and count text."}` |
| `rendering.overview.matchStrokeWidth` | `{"type":"number","default":2,"minimum":0,"maximum":8,"description":"Search-match outline width."}` |
| `rendering.overview.viewportColor` | `{"type":"string","default":"#ffffff","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Visible-range fill."}` |
| `rendering.overview.viewportOpacity` | `{"type":"number","default":0.08,"minimum":0,"maximum":1,"description":"Visible-range fill opacity."}` |
| `rendering.overview.viewportStroke` | `{"type":"string","default":"#536872","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Visible-range outline."}` |
| `rendering.overview.viewportStrokeWidth` | `{"type":"number","default":1,"minimum":0,"maximum":8,"description":"Visible-range outline width."}` |
| `rendering.overview.handleColor` | `{"type":"string","default":"#eff8ff","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Visible-range handle fill."}` |
| `rendering.overview.handleStroke` | `{"type":"string","default":"#4d89ae","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Visible-range handle outline."}` |
| `rendering.overview.handleWidth` | `{"type":"number","default":7,"minimum":3,"maximum":24,"description":"Handle width in pixels."}` |
| `rendering.overview.handleMaxHeight` | `{"type":"number","default":48,"minimum":12,"maximum":120,"description":"Maximum handle height in pixels."}` |
| `rendering.camera` | `{"type":"object","additionalProperties":false,"description":"3D camera and lighting. The UI starts in 2D; the model editor can preview either mode."}` |
| `rendering.camera.mode` | `{"type":"string","default":"Orthographic","enum":["Orthographic","Perspective"],"description":"Camera mode for model preview. Page startup always uses 2D."}` |
| `rendering.camera.fieldOfView` | `{"type":"number","default":30,"minimum":10,"maximum":100,"description":"Perspective field of view in degrees."}` |
| `rendering.camera.yaw` | `{"type":"number","default":-0.9948376736367678,"minimum":-3.141592653589793,"maximum":3.141592653589793,"description":"Initial horizontal orbit angle in radians."}` |
| `rendering.camera.pitch` | `{"type":"number","default":0.2792526803190927,"minimum":-1.48,"maximum":1.48,"description":"Initial vertical orbit angle in radians."}` |
| `rendering.camera.roll` | `{"type":"number","default":0,"minimum":-0.5,"maximum":0.5,"description":"Board rotation in radians."}` |
| `rendering.camera.rotationSensitivity` | `{"type":"number","default":0.002,"minimum":0.0001,"maximum":0.02,"description":"Orbit rotation sensitivity; 0.002 is the default speed."}` |
| `rendering.camera.ambientColor` | `{"type":"string","default":"#ffffff","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Perspective ambient light."}` |
| `rendering.camera.ambientIntensity` | `{"type":"number","default":0.3,"minimum":0,"maximum":5,"description":"Perspective ambient light intensity."}` |
| `rendering.camera.directionalColor` | `{"type":"string","default":"#ffffff","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Perspective directional light."}` |
| `rendering.camera.directionalIntensity` | `{"type":"number","default":1.8,"minimum":0,"maximum":5,"description":"Perspective directional light intensity."}` |
| `rendering.activity` | `{"type":"object","additionalProperties":false,"description":"Activity labels, 3D materials and selection brightness. Selection never enlarges activities."}` |
| `rendering.activity.labelMinWidth` | `{"type":"number","default":80,"minimum":20,"maximum":400,"description":"Minimum wrapping width in pixels."}` |
| `rendering.activity.labelMaxWidth` | `{"type":"number","default":360,"minimum":40,"maximum":1600,"description":"Maximum wrapping width in pixels."}` |
| `rendering.activity.labelHorizontalPadding` | `{"type":"number","default":24,"minimum":0,"maximum":200,"description":"Space reserved around labels."}` |
| `rendering.activity.lineHeight` | `{"type":"number","default":1.25,"minimum":1,"maximum":3,"description":"Label line-height multiplier."}` |
| `rendering.activity.shininess` | `{"type":"number","default":24,"minimum":0,"maximum":100,"description":"3D activity material shininess."}` |
| `rendering.activity.shadowColor` | `{"type":"string","default":"#17363d","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"3D activity shadow."}` |
| `rendering.activity.shadowOpacity` | `{"type":"number","default":0.16,"minimum":0,"maximum":1,"description":"3D activity shadow opacity."}` |
| `rendering.activity.laneOpacity` | `{"type":"number","default":0.08,"minimum":0,"maximum":1,"description":"3D row lane opacity."}` |
| `rendering.activity.glowColor` | `{"type":"string","default":"#ffca28","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Selected activity glow."}` |
| `rendering.activity.glowOutline` | `{"type":"string","default":"#ae5b00","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Selected activity glow outline."}` |
| `rendering.activity.glowOpacity` | `{"type":"number","default":0.22,"minimum":0,"maximum":1,"description":"Selected activity resting glow opacity."}` |
| `rendering.activity.glowPulse` | `{"type":"number","default":0.12,"minimum":0,"maximum":1,"description":"Additional glow opacity during the selection pulse."}` |
| `rendering.activity.transitionMs` | `{"type":"number","default":850,"minimum":0,"maximum":5000,"description":"Selection pulse duration; zero disables animation."}` |
| `rendering.activity.matchBackground` | `{"type":"string","default":"#fff6bd","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Matching activity label background."}` |
| `rendering.activity.leaderColor` | `{"type":"string","default":"#507585","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"3D label connector."}` |
| `rendering.activity.selectedLeaderColor` | `{"type":"string","default":"#9c5900","minLength":1,"maxLength":80,"pattern":"^(#[0-9a-fA-F]{3,8}&#124;[a-zA-Z]+&#124;(?:rgb&#124;hsl)a?\\([0-9.,% +\\-]+\\))$","description":"Selected label connector."}` |
| `rendering.layout` | `{"type":"object","additionalProperties":false,"description":"Responsive layout preferences; computed positions and page membership are not persisted."}` |
| `rendering.layout.sidebarBreakpoint` | `{"type":"number","default":900,"minimum":320,"maximum":2400,"description":"Viewport width below which the Data panel overlays the plot."}` |
| `rendering.layout.sidebarMinimum` | `{"type":"number","default":320,"minimum":180,"maximum":800,"description":"Minimum docked Data panel width."}` |
| `rendering.layout.sidebarDefaultMaximum` | `{"type":"number","default":480,"minimum":180,"maximum":1400,"description":"Maximum initial Data panel width."}` |
| `rendering.layout.sidebarDefaultRatio` | `{"type":"number","default":0.22,"minimum":0.1,"maximum":0.7,"description":"Initial Data panel width relative to the viewport."}` |
| `rendering.layout.sidebarMaximumRatio` | `{"type":"number","default":0.6,"minimum":0.2,"maximum":0.85,"description":"Maximum docked Data panel width relative to the viewport."}` |
| `rendering.layout.minimumPlotWidth` | `{"type":"number","default":420,"minimum":80,"maximum":1200,"description":"Space retained next to a docked Data panel."}` |
| `rendering.layout.overviewMaxHeight` | `{"type":"number","default":180,"minimum":40,"maximum":800,"description":"Maximum height per docked overview."}` |
| `rendering.layout.minimumDetailHeight` | `{"type":"number","default":100,"minimum":40,"maximum":800,"description":"Space retained above the overview."}` |
| `rendering.layout.splitRatio` | `{"type":"number","default":0.5,"minimum":0.2,"maximum":0.8,"description":"Timeline share of the split view width."}` |
| `rendering.interaction` | `{"type":"object","additionalProperties":false,"description":"Initial search preferences and user navigation increments. Saved/URL state still takes precedence."}` |
| `rendering.interaction.searchMode` | `{"type":"string","default":"highlight","enum":["highlight","only"],"description":"Initial search presentation."}` |
| `rendering.interaction.highlight` | `{"type":"boolean","default":true,"description":"Highlight matching activities."}` |
| `rendering.interaction.autoScale` | `{"type":"boolean","default":false,"description":"Enable density-based scaling initially."}` |
| `rendering.interaction.adaptiveRatio` | `{"type":"number","default":8,"minimum":1,"maximum":16,"description":"Maximum initial adaptive scaling ratio."}` |
| `rendering.interaction.zoomInFactor` | `{"type":"number","default":0.8,"minimum":0.1,"maximum":0.99,"description":"Zoom-in span multiplier."}` |
| `rendering.interaction.zoomOutFactor` | `{"type":"number","default":1.25,"minimum":1.01,"maximum":10,"description":"Zoom-out span multiplier."}` |
| `rendering.interaction.overviewPanFraction` | `{"type":"number","default":0.5,"minimum":0.05,"maximum":1,"description":"Overview button navigation fraction."}` |
| `rendering.interaction.overviewKeyboardFraction` | `{"type":"number","default":0.1,"minimum":0.01,"maximum":1,"description":"Overview arrow-key navigation fraction."}` |
| `rendering.interaction.resizeStep` | `{"type":"number","default":20,"minimum":1,"maximum":100,"description":"Data panel keyboard resize step in pixels."}` |
| `rendering.interaction.resizeLargeStep` | `{"type":"number","default":50,"minimum":1,"maximum":300,"description":"Shift-arrow resize step in pixels."}` |
| `rendering.controls` | `{"type":"object","additionalProperties":false,"description":"Labels for existing, approved view and overview actions."}` |
| `rendering.controls.timelineLabel` | `{"type":"string","default":"Timeline","minLength":1,"maxLength":160,"description":"Timeline view button label."}` |
| `rendering.controls.tableLabel` | `{"type":"string","default":"Table","minLength":1,"maxLength":160,"description":"Table view button label."}` |
| `rendering.controls.splitLabel` | `{"type":"string","default":"Split","minLength":1,"maxLength":160,"description":"Split view button label."}` |
| `rendering.controls.previousOverviewLabel` | `{"type":"string","default":"←","minLength":1,"maxLength":160,"description":"Overview previous button label."}` |
| `rendering.controls.previousOverviewTitle` | `{"type":"string","default":"Navigate earlier","minLength":1,"maxLength":160,"description":"Overview previous button tooltip."}` |
| `rendering.controls.nextOverviewLabel` | `{"type":"string","default":"→","minLength":1,"maxLength":160,"description":"Overview next button label."}` |
| `rendering.controls.nextOverviewTitle` | `{"type":"string","default":"Navigate later","minLength":1,"maxLength":160,"description":"Overview next button tooltip."}` |
| `rendering.controls.fitOverviewLabel` | `{"type":"string","default":"Fit context","minLength":1,"maxLength":160,"description":"Fit overview button label."}` |
| `rendering.controls.fitOverviewTitle` | `{"type":"string","default":"Fit loaded context in Overview","minLength":1,"maxLength":160,"description":"Fit overview button tooltip."}` |
| `rendering.table` | `{"type":"object","additionalProperties":false,"description":"Table columns and details links."}` |
| `rendering.table.emptyText` | `{"type":"string","default":"No events to display.","minLength":1,"maxLength":160,"description":"Empty table message."}` |
| `rendering.table.columns` | `{"type":"array","minItems":1,"maxItems":20,"description":"Columns in display order; field is a supported record value.","default":[{"field":"title","label":"Title"},{"field":"start","label":"Start"},{"field":"end","label":"End"},{"field":"source","label":"Source"},{"field":"status","label":"Status"}],"items":{"type":"object","additionalProperties":false,"required":["field","label"],"properties":{"field":{"type":"string","enum":["title","start","end","source","status","description","id"]},"label":{"type":"string","minLength":1,"maxLength":80},"width":{"type":"number","minimum":40,"maximum":1200},"visible":{"type":"boolean","default":true}}}}` |

## Appendix D. Legacy settings example

This is the original supplied settings shape. Keep its wire names and
numeric strings; adapt them to the conceptual Model/Filter classes rather
than rewriting incoming files. The color on a preset is presentation state.

```json
{
  "dateTimeFormat": "iso8601",
  "scene": "Timeline report real-time",
  "namespace": "0",
  "openbexi_timeline": [
    {
      "name": "ob_timeline_2",
      "title1": "null",
      "user": "",
      "email": "",
      "start": "current_time",
      "top": "0",
      "left": "0",
      "width": "1350",
      "height": "921",
      "camera": "Orthographic",
      "backgroundColor": "#a1d9ff",
      "sortBy": "NONE",
      "sources": [
        {
          "filter": {
            "include": "",
            "exclude": ""
          },
          "connector": "secure_sse:8441|secure:8442",
          "enable": true,
          "data_model": "tests/data/SOURCES1/yyyy/mm/dd",
          "namespace": "SOURCE1",
          "converter2events_class": "build_in",
          "permission": "",
          "type": "json_file",
          "render": {
            "alternateColor": "#e6e6e6",
            "color": "#000000",
            "dateColor": "#ffffff",
            "textColor": "#ffffff"
          },
          "url": null,
          "data_path": "tests/data/"
        },
        {
          "filter": {
            "include": "",
            "exclude": ""
          },
          "connector": "secure_sse:8441|secure:8442",
          "enable": false,
          "data_model": "tests/data/SOURCES2/yyyy/mm/dd",
          "namespace": "SOURCE2",
          "converter2events_class": "build_in",
          "permission": "",
          "type": "json_file",
          "render": {
            "alternateColor": "#e6e6e6",
            "color": "#D3D3D3",
            "dateColor": "#000000",
            "textColor": "#000000"
          },
          "url": null,
          "data_path": "tests/data/"
        }
      ],
      "filters": [
        {
          "name": "Exclude_NOMINAL_RNG",
          "backgroundColor": "#a1d9ff",
          "filter_value": "|system:RNG+status:FINISHED;description:(90% used);system:CRON;system:SCRIPT;description:attribute MonitorProgram not set",
          "sortBy": "NONE",
          "current": "yes"
        }
      ]
    }
  ]
}
```


## Appendix E. API resource inventory and payload schemas

Methods and summaries come from the checked-in OpenAPI contract. The
resource table complements the authentication, revision, error, and
pagination rules in section 9. Schema references below resolve against
the following components object.

| Method | Path | Operation |
| --- | --- | --- |
| GET | `/health` | API availability and links |
| OPTIONS | `/health` | Check configured cross-origin access |
| HEAD | `/health` | Read response headers without a body |
| GET | `/openapi.json` | This OpenAPI contract |
| OPTIONS | `/openapi.json` | Check configured cross-origin access |
| HEAD | `/openapi.json` | Read response headers without a body |
| GET | `/datasets` | List public datasets and, when authenticated, managed datasets |
| POST | `/datasets` | Administrator: create a managed dataset or clone an example |
| OPTIONS | `/datasets` | Check configured cross-origin access |
| HEAD | `/datasets` | Read response headers without a body |
| GET | `/datasets/{datasetId}` | Read dataset metadata and capabilities |
| PATCH | `/datasets/{datasetId}` | Administrator: update title or description |
| DELETE | `/datasets/{datasetId}` | Administrator: delete a managed dataset and its records |
| OPTIONS | `/datasets/{datasetId}` | Check configured cross-origin access |
| HEAD | `/datasets/{datasetId}` | Read response headers without a body |
| GET | `/models` | List datasets and their model links |
| OPTIONS | `/models` | Check configured cross-origin access |
| HEAD | `/models` | Read response headers without a body |
| GET | `/models/{datasetId}` | Read the dataset model |
| PUT | `/models/{datasetId}` | Administrator: replace a managed dataset model |
| OPTIONS | `/models/{datasetId}` | Check configured cross-origin access |
| HEAD | `/models/{datasetId}` | Read response headers without a body |
| GET | `/config-files` | Administrator: list configuration documents in approved roots |
| POST | `/config-files` | Administrator: create a model or YAML file in managed configuration storage |
| OPTIONS | `/config-files` | Check configured cross-origin access |
| HEAD | `/config-files` | Read response headers without a body |
| GET | `/config-files/{documentId}` | Administrator: read original model or YAML text |
| PUT | `/config-files/{documentId}` | Administrator: replace document text, or rename unchanged content after reference checks |
| DELETE | `/config-files/{documentId}` | Administrator: delete an unreferenced configuration file |
| OPTIONS | `/config-files/{documentId}` | Check configured cross-origin access |
| HEAD | `/config-files/{documentId}` | Read response headers without a body |
| GET | `/me` | Inspect the authenticated principal |
| OPTIONS | `/me` | Check configured cross-origin access |
| HEAD | `/me` | Read response headers without a body |
| GET | `/access/users` | System administrator: list users without credentials |
| POST | `/access/users` | System administrator: create a user and workspace memberships |
| OPTIONS | `/access/users` | Check configured cross-origin access |
| HEAD | `/access/users` | Read response headers without a body |
| GET | `/workspaces` | System administrator: list workspaces |
| POST | `/workspaces` | System administrator: create a workspace |
| OPTIONS | `/workspaces` | Check configured cross-origin access |
| HEAD | `/workspaces` | Read response headers without a body |
| GET | `/workspaces/{workspaceId}/entitlement` | System administrator: read independent commercial/AI entitlement |
| PUT | `/workspaces/{workspaceId}/entitlement` | System administrator: update entitlement without granting model access |
| OPTIONS | `/workspaces/{workspaceId}/entitlement` | Check configured cross-origin access |
| HEAD | `/workspaces/{workspaceId}/entitlement` | Read response headers without a body |
| GET | `/models/{datasetId}/access` | Read model scope, grants and effective permissions |
| PUT | `/models/{datasetId}/access` | Model administrator: replace grants and custom roles, retaining an active admin |
| OPTIONS | `/models/{datasetId}/access` | Check configured cross-origin access |
| HEAD | `/models/{datasetId}/access` | Read response headers without a body |
| GET | `/models/{datasetId}/config-files` | Model administrator: list isolated model documents |
| POST | `/models/{datasetId}/config-files` | Model administrator: create an isolated model document |
| OPTIONS | `/models/{datasetId}/config-files` | Check configured cross-origin access |
| HEAD | `/models/{datasetId}/config-files` | Read response headers without a body |
| GET | `/models/{datasetId}/config-files/{documentId}` | Model administrator: read a scoped configuration document |
| PUT | `/models/{datasetId}/config-files/{documentId}` | Model administrator: save or rename a scoped configuration document |
| DELETE | `/models/{datasetId}/config-files/{documentId}` | Model administrator: delete an unreferenced scoped document |
| OPTIONS | `/models/{datasetId}/config-files/{documentId}` | Check configured cross-origin access |
| HEAD | `/models/{datasetId}/config-files/{documentId}` | Read response headers without a body |
| GET | `/models/{datasetId}/versions` | Model administrator: list saved configuration revisions |
| OPTIONS | `/models/{datasetId}/versions` | Check configured cross-origin access |
| HEAD | `/models/{datasetId}/versions` | Read response headers without a body |
| GET | `/models/{datasetId}/preview` | Model administrator: read unchanged items for an authenticated editor preview |
| OPTIONS | `/models/{datasetId}/preview` | Check configured cross-origin access |
| HEAD | `/models/{datasetId}/preview` | Read response headers without a body |
| GET | `/models/{datasetId}/versions/{revision}` | Model administrator: read a saved configuration revision |
| OPTIONS | `/models/{datasetId}/versions/{revision}` | Check configured cross-origin access |
| HEAD | `/models/{datasetId}/versions/{revision}` | Read response headers without a body |
| GET | `/models/{datasetId}/ai/providers` | Model administrator: discover configured AI providers and capabilities without credentials |
| OPTIONS | `/models/{datasetId}/ai/providers` | Check configured cross-origin access |
| HEAD | `/models/{datasetId}/ai/providers` | Read response headers without a body |
| POST | `/models/{datasetId}/ai/generate` | Model administrator with AI entitlement: explain or propose configuration; never save or mutate records |
| OPTIONS | `/models/{datasetId}/ai/generate` | Check configured cross-origin access |
| POST | `/models/{datasetId}/ai/cancel` | Model administrator: cancel their own in-flight AI request for this model |
| OPTIONS | `/models/{datasetId}/ai/cancel` | Check configured cross-origin access |
| GET | `/datasets/{datasetId}/events` | List events |
| POST | `/datasets/{datasetId}/events` | Writer: create a event |
| OPTIONS | `/datasets/{datasetId}/events` | Check configured cross-origin access |
| HEAD | `/datasets/{datasetId}/events` | Read response headers without a body |
| GET | `/datasets/{datasetId}/events/{recordId}` | Read one event |
| PUT | `/datasets/{datasetId}/events/{recordId}` | Writer: replace one record |
| PATCH | `/datasets/{datasetId}/events/{recordId}` | Writer: merge-patch one record |
| DELETE | `/datasets/{datasetId}/events/{recordId}` | Writer: delete one record |
| OPTIONS | `/datasets/{datasetId}/events/{recordId}` | Check configured cross-origin access |
| HEAD | `/datasets/{datasetId}/events/{recordId}` | Read response headers without a body |
| GET | `/datasets/{datasetId}/sessions` | Query duration records and explicit sessions |
| POST | `/datasets/{datasetId}/sessions` | Writer: create a session |
| OPTIONS | `/datasets/{datasetId}/sessions` | Check configured cross-origin access |
| HEAD | `/datasets/{datasetId}/sessions` | Read response headers without a body |
| GET | `/datasets/{datasetId}/sessions/{recordId}` | Read one session |
| PUT | `/datasets/{datasetId}/sessions/{recordId}` | Writer: replace one record |
| PATCH | `/datasets/{datasetId}/sessions/{recordId}` | Writer: merge-patch one record |
| DELETE | `/datasets/{datasetId}/sessions/{recordId}` | Writer: delete one record |
| OPTIONS | `/datasets/{datasetId}/sessions/{recordId}` | Check configured cross-origin access |
| HEAD | `/datasets/{datasetId}/sessions/{recordId}` | Read response headers without a body |
| GET | `/datasets/{datasetId}/filters` | List filters |
| POST | `/datasets/{datasetId}/filters` | Writer: create a filter |
| OPTIONS | `/datasets/{datasetId}/filters` | Check configured cross-origin access |
| HEAD | `/datasets/{datasetId}/filters` | Read response headers without a body |
| GET | `/datasets/{datasetId}/filters/{recordId}` | Read one filter |
| PUT | `/datasets/{datasetId}/filters/{recordId}` | Writer: replace one record |
| PATCH | `/datasets/{datasetId}/filters/{recordId}` | Writer: merge-patch one record |
| DELETE | `/datasets/{datasetId}/filters/{recordId}` | Writer: delete one record |
| OPTIONS | `/datasets/{datasetId}/filters/{recordId}` | Check configured cross-origin access |
| HEAD | `/datasets/{datasetId}/filters/{recordId}` | Read response headers without a body |
| GET | `/models/{datasetId}/filters` | List filters |
| POST | `/models/{datasetId}/filters` | Writer: create a filter |
| OPTIONS | `/models/{datasetId}/filters` | Check configured cross-origin access |
| HEAD | `/models/{datasetId}/filters` | Read response headers without a body |
| GET | `/models/{datasetId}/filters/{recordId}` | Read one filter |
| PUT | `/models/{datasetId}/filters/{recordId}` | Writer: replace one record |
| PATCH | `/models/{datasetId}/filters/{recordId}` | Writer: merge-patch one record |
| DELETE | `/models/{datasetId}/filters/{recordId}` | Writer: delete one record |
| OPTIONS | `/models/{datasetId}/filters/{recordId}` | Check configured cross-origin access |
| HEAD | `/models/{datasetId}/filters/{recordId}` | Read response headers without a body |

Reusable API components (including request/response schemas and parameters):

```json
{
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "description": "OPENBEXI_API_TOKEN (system administrator), legacy unscoped writer/reader service tokens, or a user token issued through /access/users. Tokens are never URL parameters. Only digests of user tokens are stored."
      }
    },
    "schemas": {
      "ConfigFileInput": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "name",
          "kind",
          "text"
        ],
        "properties": {
          "name": {
            "type": "string",
            "description": "Simple filename, with .json for models or .yaml/.yml for YAML. No directories."
          },
          "kind": {
            "enum": [
              "model",
              "yaml"
            ]
          },
          "text": {
            "type": "string",
            "description": "Original document text, retained verbatim after validation."
          }
        }
      },
      "ConfigFile": {
        "type": "object",
        "required": [
          "id",
          "name",
          "kind",
          "text",
          "writable",
          "restartRequired",
          "location"
        ],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-f0-9]{32}$"
          },
          "name": {
            "type": "string"
          },
          "kind": {
            "enum": [
              "model",
              "yaml"
            ]
          },
          "text": {
            "type": "string"
          },
          "writable": {
            "type": "boolean"
          },
          "restartRequired": {
            "type": "boolean"
          },
          "location": {
            "type": "string"
          }
        }
      },
      "Problem": {
        "type": "object",
        "required": [
          "type",
          "title",
          "status",
          "detail",
          "instance"
        ],
        "properties": {
          "type": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "status": {
            "type": "integer"
          },
          "detail": {
            "type": "string"
          },
          "instance": {
            "type": "string"
          }
        }
      },
      "TimeAxis": {
        "type": "object",
        "required": [
          "kind"
        ],
        "properties": {
          "kind": {
            "enum": [
              "calendar",
              "numeric"
            ]
          },
          "unit": {
            "type": "string"
          },
          "direction": {
            "enum": [
              -1,
              1
            ]
          },
          "millisecondsPerUnit": {
            "type": "number"
          },
          "approximatePrefixes": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      },
      "Model": {
        "type": "object",
        "description": "Validated with schemas/demo-model.schema.json and cross-field checks. API representations use dataSource.format=json and recordsPath=events.",
        "required": [
          "params",
          "bands",
          "dataSource"
        ],
        "properties": {
          "params": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object"
            }
          },
          "bands": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object"
            }
          },
          "dataSource": {
            "type": "object"
          }
        }
      },
      "Event": {
        "type": "object",
        "required": [
          "start",
          "data"
        ],
        "properties": {
          "id": {
            "type": "string",
            "description": "Generated for a collection POST when omitted; required in initial dataset imports and nested activities. Immutable afterwards."
          },
          "start": {
            "oneOf": [
              {
                "type": "string",
                "description": "ISO 8601 date/time or calendar year (including BCE)"
              },
              {
                "type": "number",
                "description": "Value in the declared numeric axis units; calendar numbers are Unix milliseconds"
              }
            ]
          },
          "end": {
            "oneOf": [
              {
                "type": "string",
                "description": "ISO 8601 date/time or calendar year (including BCE)"
              },
              {
                "type": "number",
                "description": "Value in the declared numeric axis units; calendar numbers are Unix milliseconds"
              }
            ]
          },
          "namespace": {
            "type": "string"
          },
          "zone": {
            "type": "boolean"
          },
          "render": {
            "type": "object"
          },
          "data": {
            "type": "object",
            "required": [
              "title"
            ],
            "properties": {
              "title": {
                "type": "string",
                "minLength": 1
              },
              "description": {
                "type": "string"
              },
              "kind": {
                "type": "string"
              }
            }
          },
          "activities": {
            "type": "array",
            "items": {
              "allOf": [
                {
                  "$ref": "#/components/schemas/Event"
                },
                {
                  "required": [
                    "id"
                  ]
                }
              ]
            }
          }
        }
      },
      "FilterQuery": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "from": {
            "oneOf": [
              {
                "type": "string",
                "description": "ISO 8601 date/time or calendar year (including BCE)"
              },
              {
                "type": "number",
                "description": "Value in the declared numeric axis units; calendar numbers are Unix milliseconds"
              }
            ]
          },
          "to": {
            "oneOf": [
              {
                "type": "string",
                "description": "ISO 8601 date/time or calendar year (including BCE)"
              },
              {
                "type": "number",
                "description": "Value in the declared numeric axis units; calendar numbers are Unix milliseconds"
              }
            ]
          },
          "search": {
            "type": "string",
            "maxLength": 500
          },
          "namespace": {
            "type": "string",
            "maxLength": 500
          },
          "kind": {
            "enum": [
              "event",
              "session",
              "zone"
            ]
          }
        }
      },
      "Filter": {
        "type": "object",
        "required": [
          "title",
          "query"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string",
            "minLength": 1
          },
          "query": {
            "$ref": "#/components/schemas/FilterQuery"
          },
          "modelId": {
            "type": "string"
          },
          "createdBy": {
            "type": "string"
          },
          "visibility": {
            "enum": [
              "shared",
              "personal"
            ]
          },
          "sortBy": {
            "oneOf": [
              {
                "type": "string"
              },
              {
                "type": "object",
                "required": [
                  "field",
                  "direction"
                ],
                "properties": {
                  "field": {
                    "type": "string"
                  },
                  "direction": {
                    "enum": [
                      "asc",
                      "desc"
                    ]
                  }
                }
              }
            ]
          }
        }
      },
      "Dataset": {
        "type": "object",
        "required": [
          "id",
          "title",
          "readOnly",
          "recordCount",
          "timeAxis",
          "capabilities",
          "links"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "readOnly": {
            "type": "boolean"
          },
          "recordCount": {
            "type": "integer"
          },
          "zoneCount": {
            "type": "integer"
          },
          "timeAxis": {
            "$ref": "#/components/schemas/TimeAxis"
          },
          "capabilities": {
            "type": "object",
            "properties": {
              "read": {
                "type": "boolean"
              },
              "create": {
                "type": "boolean"
              },
              "update": {
                "type": "boolean"
              },
              "delete": {
                "type": "boolean"
              }
            }
          },
          "links": {
            "type": "object"
          }
        }
      },
      "CreateDataset": {
        "type": "object",
        "required": [
          "id"
        ],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "sourceId": {
            "type": "string"
          },
          "model": {
            "$ref": "#/components/schemas/Model"
          },
          "events": {
            "type": "array",
            "items": {
              "allOf": [
                {
                  "$ref": "#/components/schemas/Event"
                },
                {
                  "required": [
                    "id"
                  ]
                }
              ]
            }
          }
        },
        "oneOf": [
          {
            "required": [
              "sourceId"
            ],
            "not": {
              "anyOf": [
                {
                  "required": [
                    "model"
                  ]
                },
                {
                  "required": [
                    "events"
                  ]
                }
              ]
            }
          },
          {
            "required": [
              "model"
            ],
            "not": {
              "required": [
                "sourceId"
              ]
            }
          }
        ]
      },
      "DatasetPatch": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "title": {
            "type": "string"
          },
          "description": {
            "type": "string"
          }
        }
      },
      "DatasetList": {
        "type": "object",
        "required": [
          "items"
        ],
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Dataset"
            }
          }
        }
      },
      "Principal": {
        "type": "object",
        "required": [
          "id",
          "systemAdmin",
          "serviceRole",
          "workspaceIds"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "systemAdmin": {
            "type": "boolean"
          },
          "serviceRole": {
            "type": "integer"
          },
          "workspaceIds": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      },
      "AccessUserInput": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "workspaceIds"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "displayName": {
            "type": "string"
          },
          "token": {
            "type": "string",
            "minLength": 32,
            "writeOnly": true
          },
          "workspaceIds": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "minItems": 1,
            "uniqueItems": true
          }
        }
      },
      "AccessUser": {
        "type": "object",
        "required": [
          "id",
          "displayName",
          "workspaceIds",
          "enabled"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "displayName": {
            "type": "string"
          },
          "workspaceIds": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "enabled": {
            "type": "boolean"
          },
          "token": {
            "type": "string",
            "description": "Returned once when a user is created; never listed or stored in plaintext."
          }
        }
      },
      "WorkspaceInput": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "organizationId": {
            "type": "string"
          }
        }
      },
      "EntitlementInput": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "mode",
          "status",
          "features"
        ],
        "properties": {
          "mode": {
            "enum": [
              "community",
              "commercial",
              "exempt"
            ]
          },
          "status": {
            "enum": [
              "active",
              "suspended",
              "expired"
            ]
          },
          "eligibilityCategory": {
            "enum": [
              "none",
              "student",
              "researcher",
              "charity",
              "nonprofit",
              "other"
            ]
          },
          "verificationStatus": {
            "enum": [
              "notRequired",
              "pending",
              "verified",
              "rejected"
            ]
          },
          "expiresAt": {
            "type": "string"
          },
          "features": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "ai": {
                "type": "boolean"
              }
            }
          }
        }
      },
      "Entitlement": {
        "type": "object",
        "required": [
          "mode",
          "status",
          "features",
          "revision"
        ],
        "properties": {
          "mode": {
            "enum": [
              "community",
              "commercial",
              "exempt"
            ]
          },
          "status": {
            "enum": [
              "active",
              "suspended",
              "expired"
            ]
          },
          "features": {
            "type": "object"
          },
          "revision": {
            "type": "string"
          }
        }
      },
      "ModelPermissions": {
        "type": "object",
        "required": [
          "read",
          "write",
          "writeRecords",
          "writeFilters",
          "admin"
        ],
        "properties": {
          "read": {
            "type": "boolean"
          },
          "write": {
            "type": "boolean"
          },
          "writeRecords": {
            "type": "boolean"
          },
          "writeFilters": {
            "type": "boolean"
          },
          "admin": {
            "type": "boolean"
          }
        }
      },
      "ModelGrant": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "userId",
          "role"
        ],
        "properties": {
          "userId": {
            "type": "string"
          },
          "role": {
            "type": "string",
            "description": "admin, readWrite, readOnly, or a named custom role for this model."
          }
        }
      },
      "CustomRole": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "name",
          "permissions"
        ],
        "properties": {
          "name": {
            "type": "string"
          },
          "permissions": {
            "type": "array",
            "uniqueItems": true,
            "items": {
              "enum": [
                "read",
                "writeRecords",
                "writeFilters"
              ]
            },
            "description": "Read is required; custom roles cannot confer administrator/editor access."
          }
        }
      },
      "ModelAccessInput": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "grants"
        ],
        "properties": {
          "workspaceId": {
            "type": "string"
          },
          "grants": {
            "type": "array",
            "maxItems": 1000,
            "items": {
              "$ref": "#/components/schemas/ModelGrant"
            }
          },
          "roles": {
            "type": "array",
            "maxItems": 50,
            "items": {
              "$ref": "#/components/schemas/CustomRole"
            }
          }
        }
      },
      "ModelAccess": {
        "type": "object",
        "required": [
          "modelId",
          "datasetId",
          "workspaceId",
          "grants",
          "roles",
          "scoped",
          "revision",
          "role",
          "permissions"
        ],
        "properties": {
          "modelId": {
            "type": "string"
          },
          "datasetId": {
            "type": "string",
            "description": "External binding; never a new event/session property."
          },
          "workspaceId": {
            "type": "string"
          },
          "grants": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/ModelGrant"
            }
          },
          "roles": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/CustomRole"
            }
          },
          "scoped": {
            "type": "boolean"
          },
          "revision": {
            "type": "string"
          },
          "role": {
            "type": "string"
          },
          "permissions": {
            "$ref": "#/components/schemas/ModelPermissions"
          }
        }
      },
      "ModelRevision": {
        "type": "object",
        "required": [
          "revision",
          "savedAt",
          "savedBy",
          "state"
        ],
        "properties": {
          "revision": {
            "type": "string",
            "pattern": "^[a-f0-9]{64}$"
          },
          "savedAt": {
            "type": "string"
          },
          "savedBy": {
            "type": "string"
          },
          "state": {
            "enum": [
              "baseline",
              "saved"
            ]
          },
          "configuration": {
            "type": "object",
            "description": "Present only when reading an individual revision. Saving does not imply deployment."
          }
        }
      },
      "AiRequest": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "requestId",
          "providerId",
          "providerModelId",
          "operation",
          "prompt",
          "document"
        ],
        "properties": {
          "requestId": {
            "type": "string",
            "pattern": "^[A-Za-z0-9_-]{8,80}$"
          },
          "providerId": {
            "type": "string"
          },
          "providerModelId": {
            "type": "string"
          },
          "operation": {
            "enum": [
              "explain",
              "generate",
              "repair"
            ]
          },
          "prompt": {
            "type": "string",
            "maxLength": 16000
          },
          "baseRevision": {
            "type": "string",
            "maxLength": 200
          },
          "document": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "kind",
              "format",
              "text"
            ],
            "properties": {
              "kind": {
                "const": "model"
              },
              "format": {
                "enum": [
                  "json",
                  "yaml"
                ]
              },
              "text": {
                "type": "string",
                "description": "Model configuration only. Never records, source/deployment secrets, or API credentials."
              }
            }
          },
          "image": {
            "type": [
              "object",
              "null"
            ],
            "additionalProperties": false,
            "required": [
              "mimeType",
              "dataBase64"
            ],
            "properties": {
              "mimeType": {
                "enum": [
                  "image/png",
                  "image/jpeg",
                  "image/webp",
                  "image/gif"
                ]
              },
              "dataBase64": {
                "type": "string",
                "description": "Selected image, at most 1 MiB decoded. Requires the configured vision capability."
              }
            }
          }
        }
      },
      "AiResult": {
        "type": "object",
        "required": [
          "requestId",
          "explanation",
          "assumptions",
          "warnings",
          "validation"
        ],
        "properties": {
          "requestId": {
            "type": "string"
          },
          "explanation": {
            "type": "string"
          },
          "assumptions": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "warnings": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "baseRevision": {
            "type": "string"
          },
          "usage": {
            "type": "object"
          },
          "proposal": {
            "type": "object",
            "required": [
              "format",
              "text"
            ],
            "properties": {
              "format": {
                "enum": [
                  "json",
                  "yaml"
                ]
              },
              "text": {
                "type": "string"
              }
            }
          },
          "validation": {
            "type": "object",
            "required": [
              "valid",
              "errors"
            ],
            "properties": {
              "valid": {
                "type": "boolean"
              },
              "errors": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            }
          }
        }
      }
    }
  }
}
```


## Appendix F. Reference verification map

| Requirement | Baseline source/tests |
| --- | --- |
| Models and rendering | `schemas/*.schema.json`; `openbexi_timeline_rendering.js`; `model-validation.test.mjs`; `timeline-rendering.test.mjs` |
| Immutable item contract | `event-session-compatibility.test.mjs`; `tests/fixtures/event-session-contract.json` |
| Dates, axes, overview | `timeline-scale.test.mjs`; `timeline-ticks.test.mjs`; `overview-projection.test.mjs`; `overview-panel.test.mjs` |
| Filtering/search/loading | `filter-expressions.test.mjs`; `timeline-matches.test.mjs`; `timeline-loader-limits.test.mjs`; `historical-search.spec.mjs`; `FilterExpressionTest.java` |
| UI and interactions | `timeline-controls.test.mjs`; `timeline-event-targets.test.mjs`; `timeline-table-tools.test.mjs`; `tests/browser/*` |
| Model editing | `model-editor.test.mjs`; `model-editor-workspace.test.mjs`; `tests/integration/model-workspace.mjs` |
| API, roles, history | `TimelineApiTest.java`; `TimelineAccessTest.java`; `TimelineModelsTest.java`; `TimelineModelHistoryTest.java`; `TimelineConfigFilesTest.java` |
| Optional AI | `TimelineAiTest.java`; integration mock providers |
| Embedding | `timeline-embed.test.mjs`; `earth-orbit-adapter.test.mjs`; `embedding.spec.mjs` |
| Deployment | `PublicAssetServletTest.java`; `tools/verify-pages.mjs`; release manifest and CI |
| HBDS drawing | HBDS `scripts/hbds_layout_test.mjs`, `scripts/collaboration_browser_regression.py --suite separation`, `models/validate_satellite_models.py` |

End of recreation prompt. Deliver the application, fixtures, documentation,
and actual validation results against these contracts.
