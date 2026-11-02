# Finance overhaul, Stage 0b: frontend report

## Summary

- Branch: `finance-overhaul`. Nothing pushed.
- Checked against the backend code in `L:\coplaces_backend` (`src/services/bookings.ts`, `src/routes/resources.ts`, `src/routes/floorplan.ts`, `test/pricingTab.test.ts`), not only its knowledge file.
- Tests: 206 before, 231 after, in 18 files. All pass. Typecheck clean.
- Not checked in a browser.

## What the backend does now

- A space has one price: `hourlyRateCents`. Day, half-day, full-day, peak, off-peak and no-plan prices are gone, and `dailyRateCents` is unused.
- `POST` / `PATCH /resources`, the floor plan save and templates **ignore every price**, the hourly price included (unknown fields are stripped).
- `PriceBasis` is exactly `plan`, `minutes`, `shift`, `hourly`.

## Commits

- `2497de7` Space form
  - Price boxes removed and no prices sent.
  - When editing, a read-only line shows the hourly price, or says the space has none and cannot be booked by the hour.
  - `rateOf` shows the hourly price for any priced space, never a day rate.
  - Rate-card fields removed from the `Resource` type.
- `23fb9a2` Floor plan editor
  - The inspector's hourly and day rate boxes are removed.
  - New, imported and template spaces no longer carry prices, and saves never send one.
  - Default prices removed from the catalogue, and `dailyRateCents` removed from the type.
- `9830b89` Booking dialog
  - `basisNote` moved to `lib/priceBasis.ts`. It handles only the four server bases, with an exhaustive switch.
  - Texts updated: free meeting time, shift price set in Plans, hourly price from the price list.
  - A test compares the four bases against the backend's own type when the backend repo is next to this one.

## The price list endpoint (no screen yet)

- `PUT /api/resources/pricing`, permission `plans`.
- Body: `{ locationId, prices: [{ resourceId, hourlyRateCents }] }`.
  - 1 to 1000 entries.
  - Each price is a whole number from 0 to 1,000,000,000,000 cents.
  - Every space must be in that location, or the server answers 404.
- Returns `{ changed }`, the number of spaces whose price actually changed. Runs in one transaction.
- A price of 0 takes the price away. The space then disappears from the booking grid and from new requests (requests already made are kept), and is only used through plans and contracts.
- Any space kind can be priced. A priced dedicated desk or office can be booked or requested by the hour.
- **Missing screen:** a price list for owners and anyone with `plans`. It should show every space at the location with its hourly price, editable in bulk, and save them in one request.
- **Until that screen exists, nobody can set or change a price from the web app.** New spaces start at 0 and cannot be booked by the hour. This was already true before Stage 0b, because the old boxes were silently ignored; now the screens say so honestly.

## Knowledge file

- `COPLACES_KNOWLEDGE.md` updated in its own commit (see the git log after this report). It now covers:
  - the single hourly price (§6.2) and the price list endpoint (§11)
  - the read-only price line in the space form (§7.6) and the editor note (§10.2)
  - the four price bases (§11), the new helpers, and the test count
  - the missing price list screen as a known issue (§16)

## Still open

- No price list screen: nobody can set a price from the web app yet.
- The booking dialog lists only rooms and hot desks, although the server allows booking any priced space by the hour.
