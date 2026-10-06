# NaijaPVT production platform — design

**Status:** Proposed for user review  
**Date:** 2026-10-06  
**Scope:** Convert the current static five-page shell and initial SQL draft into a connected, secure, multi-role platform while keeping the public experience short and results-first.

## 1. Product intent and boundaries

NaijaPVT is an independent, citizen-run parallel vote tabulation platform. Public visitors need no account and should reach current verified results with little reading or navigation. Representatives and administrators use separate, authenticated work areas. The platform must make the origin and verification state of every published number clear; three matching reports are a cross-check, not proof of official certification.

The frontend may be delivered as cached static assets, but the product is not a static prototype: reporting, access, review, and result reads use live backend services. The UI must show an explicit connection or data freshness state when live data is unavailable. It must never substitute fabricated election results for a failed or empty backend response.

The existing decisions remain binding: Netlify for the web asset deployment, Supabase Auth and PostgreSQL as the single source of truth, and Cloudflare R2 for private result-sheet evidence. Do not add MongoDB, CockroachDB, or a second election database. All-free service tiers do not provide a dependable election-night uptime commitment; the operating plan must specify a paid election-window tier and tested recovery.

## 2. Information architecture and user journeys

### Public (anonymous, read-only)

- `/` — concise homepage: one-sentence purpose, current reporting status, verified-result KPIs, leading-party summary, latest verified units, and clear links to full results and methodology. Remove long narrative sections and repeated explanations. Do not put login or account creation in the public journey.
- `/results.html` — national live overview, party standings, coverage, and verified-unit feed.
- `/state.html?state=<code>` — state totals with drill-down to LGA, ward, and polling unit. Preserve the hierarchy in the URL/query so views can be linked directly.
- `/evidence.html` — only approved, privacy-reviewed result-sheet images. Never expose rep identity, contact data, internal notes, or raw private object URLs.
- `/methodology.html` — sample design, weighting, verification, comparison thresholds, uncertainty, and anomaly-screen limitations.
- `/analysis.html` — Analysis Lab, available after the aggregate API and historical data are reliable.
- `/about.html` — mission, independence, contact, and corrections policy.

No public route requires authentication. Public pages query only an anonymous, versioned aggregate API; they cannot query raw reports or rep profiles.

### Representative (invite-only)

- `/rep/invite.html` — exchange the invitation token for a single-use claim; after exchange, remove the token from the URL/history.
- `/rep/login.html` — sign in to an already claimed account.
- `/rep/index.html` — mobile-first assigned-unit workspace. The rep sees only their assignment, team count/status, and their own submitted record. PU/state/ward details are selected from the assignment, not free text.
- Submission captures per-party votes, accredited voters, valid votes (derived and checked), rejected ballots, and a required EC8A image. The system locks a report after its single successful submission for that election and PU. The rep receives a durable receipt and the eventual cross-check state.

### Administrator / collation team

- `/admin/login.html` and `/admin/index.html` are separate from the rep portal and require an active staff role plus Supabase MFA at the required assurance level.
- Admin sections: invitations, rep approvals and PU slots, disagreement review, official-result revisions/publication, exports, audit history, and operational coverage metrics.
- Reviewers see the three reports and private evidence side by side only for assigned review work. They may choose a matching majority report, request clarification, or escalate. Every resolution requires a reason and an immutable audit event; source submissions remain unchanged.
- Administrative authorization is enforced in database policies and server functions. Hiding a link or route in JavaScript is not access control.

## 3. Experience and visual system

Use a restrained civic-editorial visual system: forest green `#0B3D2E`, warm ivory, and one muted gold accent `#C9A227`; serif display headings and a highly legible sans-serif for controls and figures. Avoid gradient-heavy backgrounds, decorative emoji, generic feature-card grids, and long marketing copy. Number presentation should use consistent Nigerian locale formatting and clearly label verified, pending, disputed, estimated, and official data.

Public homepage order: compact masthead; short headline and current status; KPI strip; party standings; state coverage/map; recent verified results; methodology link. The empty state is informative and concise. Results tables support narrow screens, keyboard navigation, sort/filter controls, clear loading and stale-data states, and sticky column labels where useful.

Rep forms are designed for one-handed mobile use: assigned PU shown first, numeric party entry with validation and running totals, camera/photo capture, upload progress, confirmation, and retry-safe failure handling. Admin tables may be dense but must include keyboard-accessible filters, action confirmation, visible audit context, and review evidence comparisons.

All interfaces use semantic landmarks, visible focus, labels, status announcements, and WCAG AA contrast. Respect reduced-motion preferences. The 3D analysis page lazy-loads WebGL assets, offers an equivalent 2D canvas/table fallback, and does not make critical values available only through 3D interaction.

## 4. Architecture and data flow

```text
Anonymous visitor ──> Netlify CDN (HTML/CSS/JS) ──> Cloudflare Worker aggregate API
                                                        │ short TTL cache
                                                        v
Rep/Admin browser ──> Supabase Auth ──> Supabase Postgres (source of truth)
        │                       │       ├── write RPCs + RLS
        │ signed upload         │       ├── private reports and audit trail
        v                       │       └── verified rollup/read model
Cloudflare Worker ──> private Cloudflare R2
```

- Keep the existing multi-page, no-build frontend initially. Split shared browser code into focused modules: API client, auth/session, public data, report flow, and common UI. Do not put secrets or privileged decisions in browser code.
- Supabase PostgreSQL is authoritative for election configuration, party register, geographic register, rep profiles, invitations, assignments, reports, resolutions, official-result revisions, and audit events.
- Supabase RPCs/Edge Functions handle invitation claims, privileged administration, report submission, evidence authorization, and publication. Enforce invariants in SQL with unique constraints, row locks, transaction boundaries, and RLS.
- Cloudflare R2 stays private. A Cloudflare Worker validates a Supabase JWT and assignment before issuing a short-lived, object-scoped signed upload or approved evidence read. It validates size and content type, strips EXIF, downsizes images, computes a SHA-256 digest, and records server time. Reject unsafe filenames; derive object keys server-side.
- Public aggregates are generated from verified and published records into a narrow read model. Anonymous clients call a read-only Worker endpoint that returns versioned JSON with CDN cache headers and an explicit `generated_at`/freshness marker. Election writes invalidate or refresh affected aggregates. Public users never subscribe directly to raw Supabase tables. Do not claim a 100,000-concurrent-visitor capacity until load tests against the deployed CDN/API prove the target.
- Realtime: staff/reps may receive narrowly scoped Supabase changes for operational status. Public pages use cached aggregate refresh/polling or a public broadcast of aggregate deltas; avoid one database subscription per visitor.
- Use schema migrations in order. Local/test seeds are opt-in and restricted to a separate development project; no fake result records are automatically seeded or deployed to the live project.

## 5. Data integrity, roles, and security

### Invitations and identity

An admin issues a cryptographically random, single-use invitation tied to one election, rep slot, assigned PU team, and verified phone number, with an expiry between 24 and 72 hours. Store only a cryptographic hash of the token. Claiming is a server-side transaction that validates expiry, phone verification, unused state, and slot availability before creating/activating the profile and consuming the token. Concurrent claims must not consume the same invitation twice. Admins can revoke unclaimed tokens. The raw token is not logged or stored; prefer a URL fragment followed by immediate server exchange so it is not sent in normal HTTP requests.

Rep access uses Supabase Auth and verified phone OTP; reps cannot insert profiles, change their role, or alter assignments from the browser. Admin roles require TOTP MFA and a verified second-factor session for privileged operations. Apply rate limits and abuse controls to claim/auth endpoints. CAPTCHA/Turnstile is an abuse control, not a replacement for rate limits or authorization.

### Reports and review

- One report per `(election_id, pu_id, rep_id)` is enforced by a unique database constraint and a transactional RPC. No update/delete path is provided to reps.
- Submission requires an active assigned rep, open election, complete three-slot PU team, all configured party codes exactly once, nonnegative integer values, valid arithmetic, and an uploaded object key owned by that rep/election/PU.
- All three reports must match on accredited, valid/rejected, and every party figure to auto-verify. Any mismatch is withheld from verified collation and enters the review queue. A reviewer resolution is separate, reasoned, attributed, and immutable; the original entries are retained.
- Public aggregate views expose no rep PII, per-rep figures, private notes, invite tokens, or raw evidence keys. Public evidence is explicitly approved and served through the evidence access layer.
- Official results are versioned, source-attributed, and published via a distinct authorized action. Differences are computed per state and party; >5% is a review flag, 5–15% gold, >15% red. A flag is a prompt for review, not a finding of wrongdoing.
- Append-only audit records cover invite lifecycle, account/assignment changes, report review, official-result entry/publication, and exports. Server-side timestamps are authoritative.

### Statistical interpretation

Do not publish a national/state projection until the sample frame, inclusion probabilities, nonresponse handling, strata, weights, and confidence-interval method are documented and independently reviewed. Turnout thresholds, historical swings, last-digit patterns, and Benford-style checks are triage signals only. Benford tests on a small or stratified sample can be misleading; they must not be labeled proof of manipulation. Show methodology, sample coverage, effective sample size, and uncertainty next to any estimate.

## 6. Performance, availability, and operations

- Target fast public reads through CDN-cached aggregate JSON; establish p95 latency, freshness, error-rate, and concurrency objectives before launch, then verify with load tests and cache-miss stress tests.
- Use bounded pagination, query indexes, precomputed rollups, and least-privilege database functions. Do not recompute the national aggregate from raw reports for every visitor.
- Set cache policy by data type: static assets may be long-lived and content-hashed; aggregate data uses a short configurable TTL and purge/invalidation on verified publication; private reports and evidence are never public-cacheable.
- Provide health checks and visible stale/outage states. A cached last-known aggregate can remain available during a brief database outage with a clear timestamp; rep submissions must fail safely and be retryable without duplicate reports.
- Before an election window, select a paid Supabase plan that avoids inactivity pausing and meets expected limits, configure alerting, nightly encrypted logical backups outside the primary project (R2 with separate credentials), and rehearse restore into a clean project. Free tiers do not guarantee zero downtime.
- Maintain staging and production projects, secret rotation, incident response, access review, evidence retention/deletion rules, and an election-night staffing/runbook. Never put database passwords, service-role keys, R2 secrets, or signing keys in Git or client-side environment variables. Commit only a blank `.env.example`.

## 7. Analysis Lab

Ship `/analysis.html` after the verified aggregate API and methodology are established. Lazy-load Three.js for a Nigeria state-level extruded map and a turnout-versus-margin scatter plot. A state click links to the regular state drill-down. Provide zoom/rotation controls with keyboard alternatives and a 2D canvas/table fallback when WebGL is unavailable or reduced motion is requested. Use only published aggregate data. Label low coverage, missing history, uncertainty, and anomaly markers as screening indicators; never imply the visual model establishes fraud. Do not add a speculative vote-share surface unless its time-series data exists and can be explained accurately.

## 8. Delivery phases and acceptance

1. **Foundation and public experience:** modular frontend shell, concise homepage, public routes and anonymous read model, migration revisions, environment template, no fake live data. Acceptance: visitors need no account; read API reveals aggregates only; unavailable/stale backend is clearly represented.
2. **Invite and representative reporting:** hashed invite lifecycle, phone verification, rep session, fixed PU assignment, private photo pipeline, immutable RPC submission and team status. Acceptance: invite race/expiry/revocation and duplicate report attempts are rejected server-side; a rep cannot read another rep's details or PU data.
3. **Admin and review:** MFA-gated route, least-privilege admin operations, assignment tooling, flagged-PU evidence comparison, resolution workflow, official-result revisions, exports and audit. Acceptance: direct API calls without staff role and MFA fail; every privileged write is auditable.
4. **Scale and analysis:** aggregate cache invalidation, load test and monitoring, state drill-down, public approved evidence, methodology, Analysis Lab and 2D fallback. Acceptance: measured load objective is met and all charts derive from published data only.
5. **Election readiness:** data-register validation, paid capacity plan, restore drill, security/accessibility review, privacy/legal review, support rota, incident and rollback exercises. No live-election claim until all gates pass.

## 9. Dependencies and limits

The supplied Supabase URL and publishable key can be used as public client configuration. The database URI still contains a password placeholder, so migrations cannot be applied until the actual password is supplied through a secure local/CLI prompt or environment variable. Cloudflare R2 bucket credentials and domain/Worker configuration are also not yet available. Do not write any pasted secret into this spec, `.env.example`, source, command history, logs, or Git. After temporary testing, rotate credentials before production. The current repository contains only a starter schema; it has no connected auth, invitation claim, R2 Worker, admin UI, realtime API, or aggregate cache yet.

