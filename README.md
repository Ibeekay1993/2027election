# NaijaPVT — Citizen Election Result Monitoring & Collation Platform

A **private, multi-page web platform** for parallel vote tabulation (PVT) in Nigerian elections.
Independent of INEC and all government bodies.

## Core Concept

Multiple trained representatives (default: **3 reps per polling unit**) are recruited and assigned to
each sampled polling unit (starting with a ~1% stratified sample of Nigeria's polling units).
Every rep logs in and independently:

1. **Types the result figures they witnessed** — votes per party, accredited voters, rejected ballots
2. **Uploads a photo** of the posted result sheet (Form EC8A)

Each of the three reps can report **only once** per polling unit. The demo refuses duplicate reports from the same account and refuses a fourth report for a PU.

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
| `index.html` | Landing page — concept, recruitment model, safeguards, live snapshot |
| `login.html` | Rep registration / sign-in |
| `dashboard.html` | Rep portal — type figures + upload photo + submit (once per rep) |
| `results.html` | Live collation — rep cross-check per PU, consensus standings, state totals, evidence gallery |
| `compare.html` | Enter official figures per state — auto comparison and discrepancy flags |
| `css/style.css` | Shared stylesheet |
| `js/store.js` | Shared data layer + consensus engine + demo seed data |

## Run it

No build step, no server needed for the demo:

```bash
open index.html          # macOS
start index.html         # Windows
xdg-open index.html      # Linux
```

## Deploy to Netlify

This is a static site with no build step. In Netlify, import the GitHub repository and set the publish directory to `.` (the project root); leave the build command blank. `netlify.toml` includes the same publish setting. The site can also be deployed by dragging this project folder into Netlify Drop.

Demo seed data (14 states, 3 reps per PU, including deliberate rep disagreements so you can see
the verification flags) is preloaded. Register rep accounts via `login.html` to try submissions.

## Project status: front-end prototype

This is a front-end demonstration, not a live election reporting system. Data and demo accounts live only in one browser's `localStorage`; different reps on different devices do not share reports. The form accepts a PU code but does not authenticate team assignment. Browser storage can be edited or cleared, and must not be used as a security boundary. For production you need:

- [ ] Central backend database (**Supabase** recommended — fast to ship; Firebase or PostgreSQL + API also fine)
- [ ] Verified rep accounts (phone OTP + ID check) and PU team assignment
- [ ] Server-side enforcement of one-report-per-rep-per-PU
- [ ] Secure image storage (S3 / Cloudinary) with tamper-evident timestamps
- [ ] HTTPS hosting + role-based access (public dashboards vs rep portal)
- [ ] Admin panel: approve/recruit reps, assign exactly three reps to each PU, review flagged PUs
- [ ] Statistical weighting module for projections from the sample

## Suggested roadmap

1. **Connect Supabase** — replace `localStorage` calls in `js/store.js` with Supabase tables
   (`reps`, `results`, `official`, `pu_teams`)
2. **Real auth** — Supabase Auth with phone OTP
3. **Image storage** — Supabase Storage bucket for result-sheet photos
4. **Deploy frontend** — GitHub Pages / Netlify / Vercel (free tiers)
5. **Admin panel** — new page for managing reps and reviewing flagged PUs

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
