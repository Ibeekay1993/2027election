# NaijaPVT production architecture

## System boundaries

```text
Rep / reviewer browser
        |
        | static assets
        v
Netlify (HTML, CSS, JavaScript)
        |
        | Supabase Auth session + publishable key
        v
Supabase Auth + PostgreSQL (source of truth)
        |                         \
        | report RPC + RLS         \ public verified-results view
        v                           v
Private report records          Public collation pages
        |
        | short-lived upload authorization (to be implemented)
        v
Cloudflare R2 private evidence bucket (to be implemented)
```

Use one authoritative database. Supabase PostgreSQL owns accounts, polling-unit assignments, reports, review decisions, and official-result revisions. Do not dual-write election records to MongoDB, CockroachDB, or another database: that creates competing truth and reconciliation work without providing dependable failover. Netlify serves the static interface; it is not a trusted API or database.

## Repository map

- `index.html`, `login.html`, `dashboard.html`, `results.html`, `compare.html`: static browser pages.
- `css/`: shared responsive styles and interaction states.
- `js/store.js`: current UI data facade and consensus rules. Replace the guarded local adapter with asynchronous Supabase calls; keep presentation code out of SQL and credentials out of this file.
- `supabase/migrations/`: versioned PostgreSQL schema, constraints, RPCs, RLS, and safe public read model.
- `docs/`: operational architecture and deployment decisions.
- `netlify.toml`: static publish configuration and security response headers.

## Report integrity path

1. Supabase Auth identifies the rep. A staff-controlled profile and assignment determine eligibility.
2. The client requests a short-lived upload authorization for an assigned election, polling unit, and rep. A Cloudflare Worker validates the user's Supabase JWT and issues a constrained R2 upload URL. The bucket stays private; uploads are size/type limited and stored under server-derived object keys.
3. The browser submits figures and the resulting evidence key through `submit_report()`. The database checks election status, active rep status, exact three-person team, complete party set, vote totals, evidence-key scope, and one-time uniqueness in a transaction.
4. The public page reads only `verified_pu_results`; it does not read individual reports or evidence. Three identical reports become matched. Disagreements require a reviewer decision with a recorded rationale.
5. Official figures are versioned and attributed to a staff account. A separate publication action should control when a revision becomes visible.

Evidence upload authorization and the UI's Supabase adapter have not been implemented yet. Until those are complete and deployed, the public pages remain informational and the rep reporting flow stays disabled. The current SQL is a foundation, not a complete admin or production deployment.

## Secrets and access

- Netlify may receive only the Supabase project URL and publishable/anon key as public build settings. Every exposed table must remain protected by RLS.
- Never put a Supabase `service_role` key, database password, Cloudflare API token, or R2 secret in browser JavaScript, Git, or Netlify client-side variables.
- Keep R2 private. Give the upload service only the permissions it needs, verify session and assignment server-side, and issue short-lived, object-scoped upload authorization.
- Staff role changes and rep assignments must be performed through authenticated admin-only server operations. Do not let a browser update its own role or assignment.
- Use separate Supabase projects for development/staging and live election operations. Apply migrations in order and retain database backups and evidence retention procedures.

## Go-live gates

- Provision trusted rep accounts; define identity checks and a secure admin bootstrap process.
- Load and validate the official state/LGA/ward/polling-unit register and the sample frame.
- Implement admin assignment and review workflows, with audit events for changes.
- Implement and threat-review the R2 upload service, file validation, malware handling, access logging, and retention policy.
- Replace the local data facade with authenticated asynchronous database operations and explicit loading/error states.
- Add recovery drills, monitoring, rate limits, privacy notice, incident response, accessibility review, and election-day support coverage.
- Validate sampling weights before describing sample totals as state or national estimates.

