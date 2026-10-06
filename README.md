# NaijaPVT — Citizen Election Result Monitoring & Collation Platform

A **private, multi-page web platform** for parallel vote tabulation (PVT) in Nigerian elections.
Independent of INEC and all government bodies.

## Core Concept

Multiple trained representatives (default: **3 reps per polling unit**) are recruited and assigned to
each sampled polling unit (starting with a ~1% stratified sample of Nigeria's polling units).
Every rep logs in and independently:

1. **Types the result figures they witnessed** — votes per party, accredited voters, rejected ballots
2. **Uploads a photo** of the posted result sheet (Form EC8A)

Each of the three reps can report **only once** per polling unit. The current interface blocks duplicate reports from the same account and a fourth report for a PU.

The system then:

1. **Cross-checks** the reps at each PU against each other:
   - All three match on accredited voters, rejected ballots, and every party's votes → PU marked **VERIFIED**
   - Any difference → PU **flagged** for the collation team to review the three photos
   - Fewer than three reports → PU stays **PENDING**
2. **Collates** verified figures only. Pending and disputed PUs are excluded from totals.
3. **Compares** only verified PUs with entered official figures. Gaps above 5% are flagged for review.

The comparison screen currently shows raw totals for reported PUs. It is not a statistically weighted estimate of a full state's result; sample-frame configuration and weights are still needed before interpreting it as a statewide comparison.

## Pages

| File | Purpose |
|---|---|
| `index.html` | Landing page — concept, recruitment model, safeguards, service status |
| `login.html` | Representative access status (authentication is not connected) |
| `dashboard.html` | Rep portal interface — reporting remains disabled pending the backend |
| `results.html` | Collation interface — no results are shown until the shared service is connected |
| `compare.html` | Enter official figures per state — auto comparison and discrepancy flags |
| `css/style.css` | Shared stylesheet |
| `js/store.js` | UI data facade + strict consensus engine (backend guard is off) |
| `supabase/migrations/` | PostgreSQL schema, report RPC, RLS, and safe verified-results view |
| `docs/production-architecture.md` | Service boundaries, security model, and go-live checklist |

## Run it

No build step is required to preview the pages locally:

```bash
open index.html          # macOS
start index.html         # Windows
xdg-open index.html      # Linux
```

## Deploy to Netlify

This is a static site with no build step. In Netlify, import the GitHub repository and set the publish directory to `.` (the project root); leave the build command blank. `netlify.toml` includes the same publish setting. The site can also be deployed by dragging this project folder into Netlify Drop.

The pages start without fabricated election results. Reporting and account access are intentionally disabled. Do not use this static site to collect live election data.

## Production build status

The current UI does not connect to a shared backend and does not persist reports. An initial Supabase migration is provided as a starting point; it is not a deployed or complete production backend. The migration has not been applied to a project. Before live collection, complete the go-live gates in [the architecture guide](docs/production-architecture.md), including authenticated database calls, an admin workflow, private evidence upload, security review, sampling design, backups, and an operational recovery plan.

## Suggested roadmap

1. Review and apply migrations to a separate Supabase development project.
2. Build Supabase Auth integration and authenticated async data access; never put service-role credentials in the browser.
3. Build an admin interface with server-validated rep approval, PU assignment, and auditable review/resolution.
4. Build a constrained upload service for a private Cloudflare R2 evidence bucket.
5. Connect the public collation view to verified-only database records.
6. Review statistical sampling and weighting before presenting estimates.
7. Complete security, accessibility, privacy, load, and disaster-recovery reviews before election operations.

## Push to GitHub

```bash
unzip naijapvt.zip
cd naijapvt
git init
git add .
git commit -m "NaijaPVT v2: multi-rep per polling unit with cross-check collation"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/naijapvt.git
git push -u origin main
```

## License / use

Private civic-tech project. Not affiliated with INEC or any government body. Built for
transparency, not politics.
