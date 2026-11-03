# Finance charts and site speed: report

## Summary

- Branch `finance-overhaul` in `coplaces_frontend`. Commits only: nothing pushed, `main` untouched.
- Backend matched: `ahmed-dev`, which is the same commit as backend `main` (`6fa7440`). The backend repo was only read; its working tree belongs to another session and was not touched.
- Tests: 268 passing in 22 files (231 before this round). Typecheck clean. Production build passes.
- End-to-end: tested in Chrome against the real `ahmed-dev` backend code, running on a throwaway local database with the demo data. Never against the live database.

## Matching the backend (`ahmed-dev`)

- Every frontend API call was checked against the backend's route list: each one has a matching route.
- The finance report's shape matches the frontend type field for field.
- On this backend, each month's money in equals that month's P&L income, so the chart and the table agree.
- Backend routes the frontend does not use yet:
  - the hourly price list (`PUT /resources/pricing`)
  - amenity invoices and amenity requests
  - overstaying members
  - `GET /attendance/mine`
  - `PUT /contracts/:id/spaces`

## Finance charts (commits `28fcdca`, `de04d52`)

- On the finance overview, from data the backend already returns:
  - money in, money out and the net result, month by month
  - invoiced against money received, month by month
  - income by kind, month by month (stacked)
  - costs by category, and payments by method, each with shares
  - what is owed, by how late it is
  - invoices issued in the period: paid, to pay and overdue, with the paid share
  - the largest open balances by member
- The invoice-based charts add up whole cents from the invoice list and are checked against the report's own totals. If they ever disagree, the chart says so instead of showing a wrong number.
- Every chart has a legend, a focusable tooltip, and "Show as table"; the table is what prints. Colours come from a validated, colour-blind-safe palette, and money in is always blue, money out always orange.

### Tested in Chrome

- All finance pages load with no console errors. Every chart fills its box; the invoice charts matched the report exactly.
- The period switch updates the address, the sentence and the charts, and the table rows add up to the headline figure.
- A payment typed in Urdu digits (۱۰۰۰) was recorded. The report's money in and amount owed moved by exactly Rs 1,000. Removing it with the in-place confirmation (no browser pop-up) put both back.
- As front desk: Finance opens on Invoices, only the Invoices and Payments tabs show, the overview says "No access", and Today shows no month figures.
- As the owner: the space form shows "Rs 4,500 an hour" read-only, with no old price boxes.
- As a member: the home banner, the Invoices page and the owner's debtor list all show the same Rs 44,070 owed.
- Three bugs found in Chrome and fixed:
  - charts drawn about 18px too narrow (the page's entry animation fooled the measurement)
  - series names cut off in the tooltip
  - a coarse axis that squashed the columns

## Site speed (commits `6e6462d`, `d381936`, `21c3bdf`, `3194244`, `f1436cc`)

- Measured causes, and what was done:
  - **The whole 3D engine was in the first download** because the sign-in page imported one small helper from the 3D code. Fixed: the main bundle went from 1,012 KB to 631 KB.
  - **Every page was in the first download.** Pages now load on demand and are fetched in the background once you are signed in. Main bundle: 300 KB (94 KB gzipped), down 70% overall. The finance overview runs 483 KB of script, down from 1,112 KB.
  - **Slow, piece-by-piece page transitions.** Each page took about 0.7 s, with an animated blur, then table rows one by one. Now a 180 ms fade.
  - **Constant background work.** Five light pools drifted forever, and every mouse move restyled the whole page, behind 32 frosted panels that had to re-blur every frame. The backdrop is now still and the blur lighter. Same look; zero animations running at rest.
  - **The 3D scene was built immediately** on Today, Bookings, Spaces and the sign-in page. It now waits until it is on screen and the browser is idle.
  - **WebGL was probed on every page** without releasing the test context, which can exhaust the browser's limit. It is now probed once per visit.
- The bundle sizes and animation counts are exact measurements. Frame rates could not be measured: Chrome throttles a window that is not in front.

## Not done, or worth knowing

- **The local test servers were stopped by the system for low memory** near the end: the backend copy, the dev server and both preview servers. I was not allowed to restart them without you. So the last speed commit, `f1436cc` (deferring the 3D scene and the single WebGL probe), was checked by tests, typecheck and build only, not in Chrome.
- **No price list screen yet.** Nobody can set a price from the web app (see `FINANCE_STAGE0b_frontend.md`).
- **The first screen after a full reload still waits** for the session check (`/auth/me`) before showing anything.
- **Charts still waiting on the backend:** revenue by plan, space or contract; a collection rate over time; deposits over time. Invoice lines carry no plan, space or contract link today.

## How to run the end-to-end setup again

- Extract the backend: `git archive ahmed-dev` from `coplaces_backend` into a scratch folder, and link its `node_modules` to the backend's.
- Run `e2e-server.ts` with tsx. It seeds a throwaway `e2e.db` with the demo data and serves the API on port 4320.
- Start the frontend against it: `API_URL=http://localhost:4320 npx vite --port 5180`.
- Sign in as `owner@nest.test` / `coplaces123`, or use the demo buttons, which appear in development only.
