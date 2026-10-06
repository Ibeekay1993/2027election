# NaijaPVT Secure Reporting and Staff Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver invite-only representative reporting, private evidence handling, and a distinct audited admin/review console backed by Supabase.

**Architecture:** Supabase Auth and PostgreSQL own identity, assignments, reports, and review state. Supabase Edge Functions perform privileged invitation and staff operations; a Cloudflare Worker handles private R2 evidence. The current multi-page frontend stays multi-page and calls focused JavaScript modules.

**Tech Stack:** Existing HTML/CSS/vanilla JavaScript, Supabase Auth/Postgres/Edge Functions, Cloudflare Workers/R2/Images, Node `node:test`, Supabase CLI, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-naijapvt-production-platform-design.md`

## Global Constraints

- “One report per `(election_id, pu_id, rep_id)` is enforced by a unique database constraint and a transactional RPC.”
- “No public route requires authentication.”
- “Administrative authorization is enforced in database policies and server functions. Hiding a link or route in JavaScript is not access control.”
- “Keep the R2 bucket private.”
- “Public aggregate views expose no rep PII, per-rep figures, private notes, invite tokens, or raw evidence keys.”
- No service-role key, database password, R2 secret, or signed URL secret in Git, browser code, command output, or client-side environment.
- No fake results in production. Seed data is opt-in and development-only.
- Keep source reports immutable; staff resolutions append a decision and rationale.
- Reps can read only their own reports and assignment; staff permissions are role- and MFA-gated.
- No live-election availability or scale claim until deployment tests support it.

## Review Focus

- Concurrent invitation claims or duplicate report requests: exactly one succeeds; the other receives a safe conflict response.
- Expired, revoked, wrong-phone, malformed, or already-used invitations never activate a rep account or assignment.
- Oversized/spoofed images, missing evidence, or upload timeout never produce a report accepted for collation.
- A rep cannot read or mutate another rep's profile, assignment, report, resolution, or official result by calling an API directly.
- Staff sessions without the required role and MFA assurance cannot perform privileged operations, even when calling functions directly.

---

### Task 1: Add repeatable test and development tooling

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `playwright.config.mjs`
- Create: `.github/workflows/checks.yml`
- Create: `tests/unit/` and `tests/browser/` scaffolds
- Modify: `.gitignore`, `README.md`

**Interfaces:**
- Produces: `npm test` for pure unit tests, `npm run test:browser` for browser flows, `npm run test:integration` for Supabase-backed flows, and `npm run seed:dev` for opt-in development-only seed data.
- Use the installed Node 24 runtime for tooling. Do not migrate the public site to a single-page application.

- [ ] **Step 1: Write a passing ES module smoke test** at `tests/unit/tooling-smoke.test.mjs` and run `node --test tests/unit/tooling-smoke.test.mjs`; record the baseline.
- [ ] **Step 2: Add package scripts and lockfile** for Node tests, Playwright, and automated accessibility checks using `@axe-core/playwright`; keep browser-only code separate from database and Worker code.
- [ ] **Step 3: Add GitHub Actions** to run `npm ci`, `npm test`, and browser/accessibility checks with mocked backend APIs; never put remote service credentials in CI for basic checks.
- [ ] **Step 4: Run `npm ci`, `npm test`, and `npm run test:browser -- --list`**; confirm the smoke test passes and Playwright discovers tests.
- [ ] **Step 5: Ignore `.env*` (except `.env.example`), `.dev.vars`, Playwright output, local seed state, and test reports; document commands and commit.**

### Task 2: Enforce invitations, role boundaries, immutable reports, and audit in Postgres

**Files:**
- Create: `supabase/migrations/202610060002_secure_reporting.sql`
- Create: `supabase/tests/database/secure_reporting.test.mjs`
- Create: `scripts/import-pu-register.mjs`
- Create: `tests/unit/pu-register-import.test.mjs`
- Modify: `supabase/config.toml`, `supabase/migrations/202610060001_core_schema.sql` only if the follow-up migration cannot safely add the required policy/index

**Interfaces:**
- Consumes: current profile/election/party/geography/assignment/report/resolution schema.
- Produces: `invitations(token_hash, phone_e164, election_id, pu_id, rep_slot, expires_at, revoked_at, claimed_at, issued_by)`, append-only `audit_log`, `claim_invitation(token, verified_phone, auth_user_id)`, and these staff RPCs: `admin_create_invitation(phone, election_id, pu_id, rep_slot, expires_at) -> {invitationId, registrationUrl}` (raw token returned once), `admin_revoke_invitation(invitation_id)`, `admin_set_rep_status(rep_id, status)`, `admin_assign_rep(election_id, pu_id, rep_id, rep_slot)`, `admin_list_review_queue(election_id)`, `admin_resolve_pu(election_id, pu_id, selected_report_id, rationale)`, `admin_request_clarification(report_id, note)`, `admin_escalate_pu(election_id, pu_id, rationale)`, `admin_draft_official_entry(election_id, state_code, party_code, revision, votes, source_note)`, `admin_publish_official_revision(election_id, state_code, revision)`, and `admin_get_audit_page(cursor, page_size)`.
- PU register importer accepts CSV fields `state_code,lga_code,ward_code,pu_code,name,registered_voters,urban_rural`; it validates hierarchy, duplicate codes, nonnegative counts, and reports a dry-run summary before writes. The source dataset is not present and must be provenance-checked before any import.
- Invitation creation returns the registration URL once for an authorized admin to copy/share. Automated SMS delivery requires a separately configured provider and is outside this pass; do not put tokens in application logs or analytics.
- Preserves `submit_report(election_id, pu_id, accredited_voters, rejected_ballots, party_votes, evidence_key, evidence_sha256) -> report UUID`.

- [ ] **Step 1: Write database assertions** for invitation expiry/revocation/phone binding/one-time claim, slot uniqueness, exact party set, vote arithmetic, report uniqueness/immutability, role access, public-view PII exclusion, and audit append-only behavior.
- [ ] **Step 2: Write importer tests** for valid hierarchy, duplicate PU codes, invalid references/counts, and dry-run with no database writes.
- [ ] **Step 3: Run the database/importer tests**; verify expected failures before implementing the new schema and import path.
- [ ] **Step 4: Add a forward-only migration and importer** with token hashes, 24–72-hour invite expiry, row-locked claim/consume bound to `auth.uid()`, unique `(election_id, rep_id)` assignment (one PU per rep per election), three unique rep slots per PU, election-configured parties including “other”, MFA assurance checks, immutable reports/resolutions/audit records, separate official-result draft/publication, and no direct client writes to privileged entities. Import PU CSV only after dry-run review.
- [ ] **Step 5: Re-run database/importer assertions**; require every deny/allow case and import report to match expected output.
- [ ] **Step 6: Apply migrations to the designated development Supabase project** using a secure process environment or interactive prompt. Do not inline the database password in a command, URI argument, log, or file; verify the target project ref before applying.
- [ ] **Step 7: Commit** migration, importer, and tests.

### Task 3: Add invitation claim, Supabase browser client, and role-aware sessions

**Files:**
- Create: `netlify/functions/public-config.mjs`
- Create: `supabase/functions/claim-invitation/index.ts`
- Create: `js/modules/supabase-client.js`
- Create: `js/modules/auth.js`
- Create: `js/modules/rep-api.js`
- Create: `js/modules/admin-api.js`
- Create: `tests/unit/invitation-token.test.mjs`
- Modify: `netlify.toml`, `login.html`, `.env.example`

**Interfaces:**
- Produces: `loadPublicConfig() -> { supabaseUrl, publishableKey }`, `getSession()`, `claimInvitation(token, phone, otp, password)`, `signInRep(phone, password)`, `signOut()`, and `requireAdminMfa() -> session | authorization error`.
- `rep-api.js` exports `getAssignment() -> Promise<Assignment|null>`, `getTeamStatus(electionId, puId) -> Promise<TeamStatus>`, `subscribeTeamStatus(electionId, puId, callback) -> unsubscribe`, and `submitReport(payload, evidenceKey) -> Promise<ReportReceipt>`.
- `admin-api.js` exports role/MFA-guarded wrappers for every `admin_*` RPC above; the client never writes protected tables directly.
- `/api/public-config` returns only Supabase URL and publishable key. Privileged keys remain in Supabase Function secrets.

- [ ] **Step 1: Write unit tests** that invitation tokens use 32 cryptographically random bytes, are hashed before storage, are removed from the URL immediately after exchange, and are never emitted in logs or error messages.
- [ ] **Step 2: Run `node --test tests/unit/invitation-token.test.mjs`**; verify failure is due to absent implementation.
- [ ] **Step 3: Implement** the config function, pinned `@supabase/supabase-js@2.117.2` UMD client from the official CDN, phone OTP and password claim flow, single-use invite exchange, session handling, and MFA AAL2 guard. Document the required Supabase phone-auth provider setup and its messaging costs/limits. Disable generic sign-up; the registration route must demand a valid invitation.
- [ ] **Step 4: Run unit tests** and require token hygiene and URL cleanup assertions to pass.
- [ ] **Step 5: Add browser tests** for successful claim, wrong phone, expired/replayed invite, rep sign-in/out, and admin MFA gating; commit the auth layer.

### Task 4: Add secured Cloudflare evidence Worker

**Files:**
- Create: `workers/evidence-api/src/index.ts`
- Create: `workers/evidence-api/wrangler.toml`
- Create: `workers/evidence-api/package.json`
- Create: `workers/evidence-api/tests/evidence-api.test.ts`
- Create: `workers/evidence-api/README.md`

**Interfaces:**
- Produces: `POST /v1/uploads` (authenticated assigned rep requests one upload and a 5-minute presigned PUT URL into a private quarantine prefix), `POST /v1/uploads/:id/complete` (validates, sanitizes, hashes, and promotes the image to its final private key), and `GET /v1/evidence/:reportId` (staff reviewer or explicitly approved public evidence).
- Object names are server-generated UUIDs under election/PU/rep prefixes; the API never accepts arbitrary object keys from the browser.

- [ ] **Step 1: Write Worker tests** for JWT/assignment denial, unauthorized object retrieval, >5 MiB bodies, MIME/signature mismatch, EXIF removal, >1600 px dimensions, upload expiry/replay, CORS, and failed-storage handling.
- [ ] **Step 2: Run `npm test` in `workers/evidence-api`**; verify expected handler failures.
- [ ] **Step 3: Implement** JWT validation, assignment check, a five-minute signed R2 PUT URL to a private quarantine bucket, validation and retrieval from quarantine, then a separate private evidence bucket for sanitized output. Re-encode/resize at max 1600 px with Cloudflare Images `metadata=none`, verify the transformed object and SHA-256 before report submission, and delete the quarantine original after promotion. Never store an unsanitized original as evidence. Configure separate bucket bindings without committing account credentials.
- [ ] **Step 4: Run Worker unit tests and a development-binding integration check** that inspects transformed bytes/metadata and confirms quarantine deletion; require all unauthorized and malformed upload cases to be rejected.
- [ ] **Step 5: Document R2 bucket bindings and secure `wrangler secret put` setup**. Cloudflare Images' free transformation allowance is 5,000 unique transformations/month; 1% of 176,000 PUs with 3 rep photos each is about 5,280 unique images, so estimate paid-window cost or secure another sanitation path. Fail safely at quota rather than storing unsanitized originals. Keep secrets out of tracked files. See [Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing/).

### Task 5: Build the representative portal as a separate route

**Files:**
- Create: `rep/invite.html`
- Create: `rep/login.html`
- Create: `rep/index.html`
- Create: `js/modules/rep-dashboard.js`
- Create: `tests/browser/rep-flow.spec.mjs`
- Modify: `dashboard.html`, `login.html`, `css/style.css`

**Interfaces:**
- Consumes: `auth.js`, `rep-api.js`, evidence Worker routes, `getAssignment()`, `getTeamStatus()`, and `submitReport()`.
- Produces: assignment-bound report UI; state, LGA, ward, and PU are server-sourced and non-editable.

- [ ] **Step 1: Write browser checks** that a rep sees only their assignment and team progress, cannot change location, submits once with required evidence, receives a durable receipt, and cannot query another PU/rep.
- [ ] **Step 2: Run `npm run test:browser -- tests/browser/rep-flow.spec.mjs`**; verify failure on the missing invite/report flow.
- [ ] **Step 3: Implement** mobile-first numeric entry, derived valid-vote total, accredited-vote validation, camera upload/progress, retry-safe submit, locked post-submit state, and eventual verification status.
- [ ] **Step 4: Run browser checks** against development services; ensure upload/network failure cannot create a partial report or duplicate.
- [ ] **Step 5: Commit** rep routes and flow.

### Task 6: Build a distinct MFA-gated admin and collation console

**Files:**
- Create: `admin/login.html`
- Create: `admin/index.html`
- Create: `admin/invitations.html`
- Create: `admin/review.html`
- Create: `admin/results.html`
- Create: `js/modules/admin-dashboard.js`
- Create: `docs/admin-bootstrap.md`
- Create: `tests/browser/admin-flow.spec.mjs`

**Interfaces:**
- Consumes: `admin-api.js`, staff RPCs/audit events, evidence Worker, and MFA AAL2 session.
- Produces: invite issue/revoke/bulk-import, rep approval and slot assignment/removal, disagreement decision/request/escalation, official-result draft/publish, audit browsing, coverage/submissions-per-hour metrics, and CSV/browser-print-to-PDF export.

- [ ] **Step 1: Write browser/security tests** for anonymous, rep, reviewer, admin without MFA, and admin with MFA; include direct API calls, invalid bulk invite rows, side-by-side evidence, immutable resolution, official result publication, and audit records.
- [ ] **Step 2: Run `npm run test:browser -- tests/browser/admin-flow.spec.mjs`**; verify expected denial/failure cases before implementation.
- [ ] **Step 3: Implement** separate admin routes, server-validated actions, accessible filters/tables, confirmation for revocation/resolution/publication, and visible operation/audit status. Document a controlled first-admin bootstrap using the Supabase Dashboard/secure CLI, require MFA enrollment before privileged use, and prevent self-elevation afterward.
- [ ] **Step 4: Run security checks**; prove UI hiding is not the control by invoking each privileged API as an unauthorized role.
- [ ] **Step 5: Commit** admin console and tests.

### Task 7: Add opt-in development-only seed data and end-to-end verification

**Files:**
- Create: `scripts/seed-dev.mjs`
- Create: `tests/integration/reporting-lifecycle.spec.mjs`
- Create: `tests/fixtures/election-fixture.mjs`
- Modify: `README.md`

**Interfaces:**
- Produces: fictional states/PUs/users and 3-rep teams with matching and deliberately differing reports, only when an explicit development environment and project allowlist match.
- Production, unknown project refs, and any environment not explicitly marked development reject seeding.

- [ ] **Step 1: Write seed-guard tests** for development success and production/unknown-project refusal; write lifecycle assertions for three-way agreement, disagreement withholding, resolution, and duplicate denial.
- [ ] **Step 2: Run unit/integration tests**; verify each guard fails before seed implementation and lifecycle tests fail before complete wiring.
- [ ] **Step 3: Implement** deterministic fictional fixtures without real rep PII; require an explicit project ref and `NAIJAPVT_ENV=development` before seeding.
- [ ] **Step 4: Run full unit, database, Worker, browser, and lifecycle suites** and inspect every result.
- [ ] **Step 5: Commit** the seed guard, end-to-end coverage, and run instructions.
