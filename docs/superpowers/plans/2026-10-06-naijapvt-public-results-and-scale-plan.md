# NaijaPVT Public Results and Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Give anonymous visitors a concise, fast, accessible results experience with state drill-down, approved evidence, reliable freshness indicators, and a data-backed Analysis Lab.

**Architecture:** Public pages consume a versioned Cloudflare Worker API backed only by published, precomputed Supabase aggregates. CDN cache and bounded polling keep visitor traffic away from raw reports. Rep/admin realtime channels remain private and separate.

**Tech Stack:** Multi-page HTML/CSS/vanilla JS, Supabase Postgres aggregate read model, Cloudflare Workers Cache API/R2/Images, Three.js lazy-loaded with canvas/table fallback, Node/Worker/browser/load verification.

**Spec:** `docs/superpowers/specs/2026-10-06-naijapvt-production-platform-design.md`

## Dependencies

Run after `docs/superpowers/plans/2026-10-06-naijapvt-secure-reporting-plan.md` Tasks 1–6 establish the published verified-result view, private evidence approvals, and development services.

## Global Constraints

- Anonymous users read only precomputed aggregates and approved evidence; no public PII or raw report access.
- The public experience is live-backend driven even though CDN delivers static page assets.
- Do not show fabricated results after API failure or empty responses.
- Public API responses include a schema version and `generated_at`; stale/outage states are visible.
- Keep a compact results-first homepage; remove long repeated marketing/story sections.
- All charts have accessible text/table equivalents; 3D is supplemental, never required to understand a result.
- 100,000 concurrent visitors is a target to test, not a guarantee.
- No estimates or anomaly claims without documented method and uncertainty.
- Official comparison thresholds are >5% gold and >15% red; they are review flags, never a fraud finding.
- Turnout is accredited voters divided by registered voters. If a validated registered-voter denominator is absent, show turnout as unavailable rather than using valid votes/accredited voters as a substitute.

## Review Focus

- API cache key/query manipulation cannot bypass election/state scope or return private fields.
- Worker cache invalidation/freshness failure shows a stale timestamp rather than presenting old values as live.
- Missing/zero denominators never create NaN/Infinity turnout or party-share displays.
- State geometry missing/invalid or WebGL disabled still leaves complete keyboard-accessible data and drill-down.
- Very large totals and low-coverage state samples remain legible and are not mislabeled as representative estimates.

---

### Task 1: Add precomputed public rollups and safe published evidence read model

**Files:**
- Create: `supabase/migrations/202610060003_public_rollups.sql`
- Create: `tests/database/public_rollups.test.mjs`
- Modify: `supabase/tests/database/secure_reporting.test.mjs`

**Interfaces:**
- Produces tables/views `pu_rollups`, `lga_rollups`, `state_rollups`, `election_rollups`, and a public approved-evidence projection.
- All public read fields are counts/sums/status and approved evidence IDs; no rep ID, phone, email, per-rep figures, reviewer rationale, token, or storage key.
- Rollups update only after consensus verification, staff resolution, or official publication; incomplete/disputed units do not contribute to verified totals.

- [ ] **Step 1: Write database assertions** for rollup deltas on 0→pending→verified, verified→reviewed, and publication; verify repeated updates are idempotent and public projections omit private columns.
- [ ] **Step 2: Run `npm run test:integration -- tests/database/public_rollups.test.mjs`** against the development project; confirm missing rollups fail as expected.
- [ ] **Step 3: Add an idempotent migration** with indexed rollup rows and transactional update functions called by report/review/publication RPCs. Include registered-voter denominators only when a validated register is available; otherwise omit turnout/anomaly metrics requiring it.
- [ ] **Step 4: Run database assertions**; compare each rollup with an independent SQL recomputation over fixture records.
- [ ] **Step 5: Commit** rollup migration and verification cases.

### Task 2: Build a cacheable public aggregate API

**Files:**
- Create: `workers/public-api/src/index.ts`
- Create: `workers/public-api/wrangler.toml`
- Create: `workers/public-api/package.json`
- Create: `workers/public-api/tests/public-api.test.ts`
- Create: `workers/public-api/README.md`

**Interfaces:**
- `GET /v1/elections/:slug/summary` returns `{schemaVersion: 1, generatedAt: ISO timestamp, election: {slug, status}, totals: {sampledPus, reportedPus, verifiedPus, accreditedVoters, validVotes, rejectedBallots, coveragePct|null}, parties: [{code, votes, sharePct|null}], states: [{code, name, reportedPus, verifiedPus, coveragePct|null, parties}], freshness: "fresh"|"stale"}`.
- `GET /v1/elections/:slug/states/:stateCode` returns that state’s published rollup and LGA/ward selector data; `GET /v1/elections/:slug/states/:stateCode/lgas/:lgaCode` returns that LGA’s rollup and ward selector data; `GET /v1/elections/:slug/states/:stateCode/lgas/:lgaCode/wards/:wardCode` returns ward/PU status without rep details.
- `GET /v1/elections/:slug/comparison` returns `{comparisonAvailable, reason, rows: [{stateCode, partyCode, citizenVotes, officialVotes, difference, differencePct|null, band}]}` for published official data only, and only when the reviewed sampling/weighting method is active. Otherwise it returns `comparisonAvailable:false` and a clear reason.
- `GET /v1/elections/:slug/evidence` returns approved `[{evidenceId, puCode, stateCode, caption}]` only; image bytes require the evidence API from the secure-reporting plan.
- Summary values are sourced from public rollup views using the publishable key; never use service-role credentials.

- [ ] **Step 1: Write Worker tests** for response schema, CORS, cache headers, invalid slug/state, no raw columns, no PII/storage keys, stale origin handling, and zero-denominator values.
- [ ] **Step 2: Run Worker tests**; verify expected failures before implementing handlers.
- [ ] **Step 3: Implement** schema-versioned reads, stable cache keys, configurable short TTL (default 30 seconds), `generatedAt`, stale-on-origin-error behavior, bounded response size, and safe error payloads. Do not expose Supabase response bodies or request credentials.
- [ ] **Step 4: Run Worker tests** and verify cache/freshness behavior, including an unavailable Supabase origin.
- [ ] **Step 5: Commit** the public Worker and tests.

### Task 3: Replace the long homepage with a compact results-first public site

**Files:**
- Modify: `results.html`, `index.html`, `compare.html`
- Create: `state.html`, `evidence.html`, `methodology.html`, `about.html`
- Create: `js/modules/public-api.js`, `js/modules/public-results.js`, `js/modules/state-map.js`
- Create: `data/geo/nigeria-states.topojson` and `data/geo/README.md`
- Modify: `css/style.css`, `netlify.toml`
- Create: `tests/browser/public-results.spec.mjs`

**Interfaces:**
- `fetchElectionSummary(slug) -> Summary`; `fetchStateSummary(slug, stateCode) -> StateSummary`; `fetchWardResults(slug, stateCode, lgaCode, wardCode) -> WardResults`; `fetchComparison(slug) -> ComparisonRow[]`; `fetchApprovedEvidence(slug) -> EvidenceCard[]`. API types match Task 2 response schemas.
- Public navigation contains no login wall; representative/admin links are separate and visually secondary.

- [ ] **Step 1: Write browser tests** for anonymous results access, compact homepage section order, leading-party preview sourced only from verified published aggregates, no-winner empty state at zero verified PUs, loading/empty/stale/error states, state→LGA→ward filters and shareable URL state, accessible charts/table fallback, and absence of rep PII.
- [ ] **Step 2: Run public browser tests**; confirm failure against existing pages before implementing the new data path.
- [ ] **Step 3: Implement** the results-first civic-editorial homepage and pages in the spec. The homepage includes a compact ranked preview of leading parties with verified vote totals and share; show no winner when there are no verified results. Use live API data only; explain “verified” and “official” distinctly; remove long repeated story blocks and authentication prompts from public navigation. Add sample/methodology disclosure beside any totals; keep statewide estimates hidden until an approved sampling frame and weight inputs exist.
- [ ] **Step 4: Add linked State, LGA, and Ward selectors and sortable location columns to the results view.** Each selection narrows the next selector, resets descendant selections when a parent changes, and updates query parameters so a filtered view can be shared. Allow sorting by state, LGA, ward, and PU, with a visible sort direction. Display only published verified totals and PU statuses; retain clear loading, empty, and stale states at every level.
- [ ] **Step 5: Add a licensed state-boundary dataset** with source/license/provenance recorded in `data/geo/README.md`; render keyboard-accessible map controls and a state list so map availability is not a dependency.
- [ ] **Step 6: Run browser tests** with empty, populated, stale, and unavailable API fixtures; verify no path falls back to fake data.
- [ ] **Step 7: Commit** public pages, map data/provenance, and browser checks.

### Task 4: Add the public Analysis Lab with accessible fallback

**Files:**
- Create: `analysis.html`
- Create: `js/modules/analysis-lab.js`, `js/modules/analysis-2d.js`
- Create: `tests/browser/analysis-lab.spec.mjs`

**Interfaces:**
- Consumes only Task 2 published aggregates and Task 3 public state geometry.
- Produces a standalone public analysis page with national/state/LGA/ward scope selection, a leading-party and vote-share view, verified-PU coverage, and turnout/margin views only when the relevant validated denominator and sample coverage are present. Otherwise shows a concise unavailable-methodology state, not invented metrics.
- National/state projections and confidence intervals remain unavailable until a reviewed sample frame, inclusion probabilities, registered-voter denominators, nonresponse policy, historical baseline, and confidence-interval method are supplied and validated. Do not synthesize these values from the 1% target alone.

- [ ] **Step 1: Write browser tests** for scope selection at national/state/LGA/ward, lazy-load, data consistency with results summary and filtered results, WebGL disabled, reduced motion, keyboard use, missing historical/register data, and 2D/table fallback.
- [ ] **Step 2: Run tests**; confirm missing Analysis Lab behaviors fail before implementation.
- [ ] **Step 3: Implement** the dedicated Analysis page with linked geography scope selectors, lazy-loaded Three.js state columns and scatter plot; add 2D canvas plus data table fallback and links to the matching results scope. Do not add a time-series terrain without a real time series.
- [ ] **Step 4: Run browser tests** on WebGL and fallback paths; verify no analysis presents anomaly signals as proof of manipulation.
- [ ] **Step 5: Commit** Analysis Lab and tests.

### Task 5: Add measured scale, backup, restore, and election-night runbooks

**Files:**
- Create: `docs/election-night-runbook.md`
- Create: `scripts/load/public-aggregate.js`
- Create: `scripts/backup/README.md`
- Modify: `README.md`, `docs/production-architecture.md`, `netlify.toml`

**Interfaces:**
- Load script accepts only `PUBLIC_API_URL`, `ELECTION_SLUG`, and a configurable visitor/request profile; no private credential is needed.
- Runbook records cache freshness, p95 latency, error rate, throughput, alert thresholds, backup destination/retention, recovery RTO/RPO, and operator steps.
- Runbook states that 100,000 concurrent public visitors and zero downtime are goals requiring a measured deployment and paid election-window capacity; free tiers are not an availability commitment.

- [ ] **Step 1: Write load-run assertions** for anonymous aggregate API rate profiles and stale-data detection, without calling raw Supabase endpoints.
- [ ] **Step 2: Run the load profile** against local/development services and capture baseline output; do not claim 100k capacity from local measurements.
- [ ] **Step 3: Add CDN cache/security configuration** and a runbook covering paid election-window capacity, cache purge, nightly encrypted backups to a separate R2 location, restore to a clean project, fail-safe report retries, OTP/Cloudflare transformation/storage cost assumptions, and incident contacts.
- [ ] **Step 4: Perform one documented restore drill** and repeat the public endpoint load profile against the deployed candidate; record measured results and remaining bottlenecks.
- [ ] **Step 5: Commit** scripts and runbooks; claim only the measured capacity.
