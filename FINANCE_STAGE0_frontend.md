# Finance overhaul, Stage 0: frontend report

## Summary

- Repository: `coplaces_frontend`
- Branch: `finance-overhaul`, created from `manan-dev`. Nothing has been pushed. `main` was not touched.
- Goal: fix the browser-side finance problems that do not depend on new backend work. No new charts or pages.
- Result: 12 commits (10 for the seven steps, 1 follow-up for CSV prefixing, 1 for the knowledge file), plus the commit that adds this report.
- Tests: 86 before, 206 after, in 15 test files. All pass.
- `npm run typecheck`: clean.
- `npm run build`: succeeds. The build rewrites the committed `dist/` folder; those changes were thrown away, not committed.
- Not checked in a browser. Every change is covered by tests and the type checker, but nobody has clicked through the screens yet.

## Commits, in order

- `eac8cb8` Make CSV exports safe to open in a spreadsheet (step 1)
- `df1db14` Show deposit and advance dates on the location's day (step 2)
- `035c94c` Refresh every money figure after any money change (step 3)
- `db0fbde` Never show '-Rs 0', and read typed amounts exactly (step 4)
- `f3ae0db` Check permission and package feature together for money screens (step 5)
- `053a375` Confirm voids, payment removals and expense deletions in place (step 6)
- `68ed0a1` Offer Try again on every finance error (step 6)
- `4afa7fd` Keep the finance period in the address and figures on screen while it loads (step 6)
- `b7d8773` Search invoices once typing pauses (step 6)
- `6e68a30` Fix profit and loss assumptions about months, zero and losses (step 6)
- `c853f49` Prefix every formula-like string in CSV exports; write amounts as numbers (follow-up A)
- `543beaa` Add the frontend knowledge base, with finance matching the current code (follow-up B)

## Step 1: CSV safety

- Commit: `eac8cb8`, tightened in `c853f49` (see follow-up A)
- File: `src/lib/format.ts` (`csvCell`, `toCsv`, `downloadCsv`)
- Every string cell starting with `=`, `+`, `-`, `@`, tab or carriage return gets a leading `'`, so a spreadsheet treats it as text and never runs it.
- Quotes are doubled; cells containing quotes, commas, newlines or carriage returns are wrapped in quotes.
- Rows end with CRLF.
- The file starts with a UTF-8 byte order mark, so Excel reads Urdu text correctly.
- Tests: `src/lib/csv.test.ts`, 7 tests (5 in the first commit, 2 added in the follow-up). They cover formulas, the `-1+cmd` and `-Ali` cases, quotes, commas, newlines, empty cells, real numbers, amounts and Urdu.

## Step 2: Time zone

- Commit: `df1db14`
- Every `occurredAt.slice(0, 10)` now uses `localDateOf(occurredAt, location time zone)`:
  - `src/pages/staff/FinanceOverview.tsx` (deposit and advance movements)
  - `src/components/MemberMoney.tsx` (member money record)
  - `src/pages/staff/Contracts.tsx` (contract money record)
  - `src/components/ContractPrint.tsx` (printed contract)
  - `depositRows` in `ContractPrint.tsx` (the contract-money CSV), which now takes the time zone
- Whole-codebase search for the same pattern (`slice(0, 10)`, `toISOString()`, `split('T')`, `getDate()` and similar): no other money dates came from UTC.
  - The other matches compare instants (correct as they are) or use the browser's own time on purpose (announcement scheduling, device command text).
- Also fixed: the contract-money CSV wrote "undefined" for a payment method it did not know.
- Tests: `src/lib/time.test.ts`, 6 tests. They cover 00:30, 23:59 and 00:00 in Asia/Karachi, month and year ends, `todayIn`, and the CSV export rows.

## Step 3: Stale numbers

- Commit: `035c94c`
- New: `FINANCE_KEYS` in `src/lib/queries.ts`: reports, dashboard, invoices, invoice, payments, expenses, members, member, contracts, summary, bookings.
- Removed: the dead `refresh('finance')` key (two places in `Amenities.tsx`).
- Every mutation touched, 27 in all:
  - Invoices: create a manual invoice, generate monthly invoices (`Invoices.tsx`)
  - Invoice page: record a payment, void, remove a payment (`InvoiceView.tsx`)
  - Members: add a member, which may record an advance and deposit (`Members.tsx`)
  - Member detail: edit (details, member money, plan change), renew the plan, delete the member (`MemberDetail.tsx`)
  - Member deposit: settle (`MemberMoney.tsx`)
  - Contracts: save the contract form; record the advance or the deposit; settle the deposit; start, end or cancel (`Contracts.tsx`)
  - Contract wizard: create and optionally start (`CompanyContractWizard.tsx`)
  - Contract tools: add a person, a person leaves, edit company and prices, extend (`CompanyContractTools.tsx`)
  - Expenses: add or edit, delete (`Expenses.tsx`)
  - Amenities: record an order, mark collected (`Amenities.tsx`)
  - Plans and shifts: save a plan, save a shift, delete a shift, delete a plan (`Plans.tsx`). Included because shift prices make up recurring revenue.
- Guard test: `src/lib/financeRefresh.test.ts`, 30 tests. It reads every `useMutation` in the source; any one that calls a money endpoint must refresh `FINANCE_KEYS`, or the test fails. It also checks the list itself and that `'finance'` is never refreshed.

## Step 4: Formatting

- Commit: `db0fbde`
- `money` and `moneyWhole` use `signDisplay: 'negative'`: an amount that rounds to zero reads "Rs 0", never "-Rs 0". Real negatives keep their sign.
- `toCents`:
  - Works in whole numbers instead of `parseFloat`, so there is no floating point rounding.
  - Rejects anything above `MAX_MAJOR_UNITS` (100,000,000 whole units).
  - Reads full-width digits and separators. It also reads Arabic-Indic and Urdu digits, which goes beyond the request (`plainDigits`).
- Not changed: the rule of whole rupees on summary pages versus paisa in tables (decision pending).
- Tests: `src/lib/format.test.ts`, 13 tests: PKR and USD, zero and minus zero, negatives, large values, ordinary input, exact cases like 0.29, invalid input, the cap, and other digit forms.

## Step 5: Gating

- Commit: `f3ae0db`
- New: `src/lib/access.ts`, with four money areas that each need a permission and a package feature together:
  - invoices: permission `invoices` and feature `invoicing`
  - billing: permission `billing_admin` and feature `invoicing`
  - expenses: permission `expenses` and feature `expenses`
  - reports: permission `reports` and feature `reports`
- Helpers: `canUse`, `anyFinance`, `financeHome`, `dashboardMoney`, `overviewSections`, and the `useCanUse` hook in `auth.tsx`.
- Used in:
  - Member detail: the Invoices section, the New invoice button and the invoice request need the invoices area. The account balance shows only on packages with invoicing.
  - Today's "This month" block: shown only to the invoices or reports area. Invoiced, Outstanding and Overdue need invoicing. Expenses needs the expenses area. The overview link needs the reports area.
  - Finance overview: Still owed, the overdue notice and the aging table need invoicing. "See the invoices" needs the invoices area.
  - The Finance menu link, the finance tabs and the `/finance` landing page.
- Links that led to a "No access" page, now hidden:
  - Today: "Check in" (needs `front_desk`), "Create plans" (needs `plans`), "Add members" (needs `members`)
  - Space scan page: "Open bookings" for team members without `bookings`
  - Member home: "See invoices" on packages without invoicing
- Tests: `src/lib/access.test.ts`, 33 tests, covering every area with permission and feature present or missing, owners on smaller packages, members, nobody signed in, the menu, the landing page, the Today rules and the overview rules.

## Step 6: UX bugs

- Inline confirmation: `053a375`
  - `ConfirmButton` added to `src/components/ui.tsx`.
  - Replaces `window.confirm` for void invoice, remove payment and delete expense.
  - Adds jsdom and Testing Library as dev dependencies for component tests.
- Retry: `68ed0a1`
  - `ErrorNote` takes `onRetry` and shows Try again.
  - Used on the overview, profit and loss, invoices list, invoice page, payments, expenses and the member's invoices.
- Period in the URL and previous figures kept: `4afa7fd`
  - The period is `?months=1|3|6|12`. Six is the default and is left out.
  - While a new period loads, the old figures stay, dimmed with "Updating…", but only for the same location.
  - The overview's sentence follows the figures shown, not the period just picked.
- Debounced invoice search: `b7d8773`. The search waits 300 ms after the last key, and the rows already shown stay until the answer comes.
- Profit and loss fixes: `6e68a30`
  - Monthly arrays that do not match the months are fitted and flagged with a visible notice.
  - Zero is neutral, not green.
  - A loss margin reads "(20%)", and the overview says "The loss is 20% of money in".
  - The CSV gains the margin row.
- Tests:
  - `src/components/ui.test.tsx`: 8 tests for `ConfirmButton` and `ErrorNote`
  - `src/lib/financePeriod.test.tsx`: 7 tests for the period and the placeholder behaviour, using real react-query and router
  - `src/lib/useDebounced.test.tsx`: 2 tests
  - `src/lib/profitLoss.test.ts`: 14 tests
- Note: `b7d8773` was amended once before anything was pushed. The first version had a wrong timer value in its test; the hook itself was unchanged.

## Step 7: Checks

- `npm run typecheck`: clean.
- `npm test`: 15 files, 206 tests, all passing (86 before Stage 0).
- Tests added per step:
  - Step 1: 5, plus 2 in follow-up A
  - Step 2: 6
  - Step 3: 30
  - Step 4: 13
  - Step 5: 33
  - Step 6: 31
- `npm run build`: succeeds; it rewrites `dist/`, which was restored afterwards.

## Follow-up A: CSV prefixing confirmed

- Commit: `c853f49`
- The first version left strings that looked like plain numbers alone (for example `"-1500.00"`). That exemption is gone.
- Now every string starting with `=`, `+`, `-`, `@`, tab or carriage return is prefixed, whatever follows. `"-1+cmd"`, `"-Ali Raza"`, `"+92 300 1234567"` and `"-1500.00"` all get the `'`.
- Only values that are numbers in the code are left alone.
- So that amounts stay real numbers in Excel (negative profit and loss figures included), every CSV export now writes amounts through `csvAmount(cents)`, which returns a number:
  - bookings, contracts, expenses, invoices, payments, profit and loss, the contract-money export, and platform payments.
- Tests: two added to `src/lib/csv.test.ts`, covering exactly the cases above, and the deposit export test now expects a number.

## Follow-up B: knowledge file

- Commit: `543beaa`
- `COPLACES_KNOWLEDGE.md` (repository root) was not in git before; this commit adds it.
- Its finance sections now match the current code: money areas, the period in the URL, `FINANCE_KEYS`, CSV safety, the profit and loss rules, `ConfirmButton`, Try again, the new helper files and the test list.
- Where it describes the same rule as the backend's knowledge file, it now agrees with backend §9:
  - cash-basis reports, and what Collected includes
  - the dashboard finance block needs `reports` plus `invoicing`
  - `reports` requires `invoicing`
  - only hourly and shift prices remain (rate cards were removed)
  - tax is rounded once per invoice
  - payments cannot exceed the balance
- It points to the backend file instead of repeating server rules.
- New section 16, "Known finance issues (waiting on backend)", cross-referenced to backend H1 to H6.

## Deliberately not touched

### Needs backend work

- Making the same figure agree on every screen. Today:
  - "Collected" and "Money in" include advances, kept deposits and desk amenity collections.
  - The Payments page and "How members paid" cover invoice payments only.
  - Shared definitions and a cash ledger are needed.
- The overview chart's claim that it matches the profit and loss table; the two read different fields of the report.
- Totals summed in the browser: Payments, Expenses and the member's "Rs X due". These need server totals and pagination.
- The new-invoice tax preview, which is computed in the browser. It needs `POST /invoices/preview`.
- A payment date field. The server accepts `paidAt`, but back-dating is tied to backend H5 (no audit trail).
- How the previous period is compared, receivables aging, top debtors, revenue by plan, space or contract, deposits over time: these need the new endpoints from the audit.
- Server-side enforcement of permissions, features and location access. The Stage 0 gating only hides things on screen.
- The server calculation issues H1 to H6 in backend §9.4.

### Needs your decision

- Whole rupees or paisa on summary pages.
- Currencies with 0 or 3 decimal places.
- Compact numbers in lakh/crore or millions.
- Who may see member names with amounts owed, and the deposits section (still visible to anyone with the reports area).
- Whether booking create, cancel and no-show should refresh `FINANCE_KEYS`. They do not today; bookings only reach the finance figures once invoiced, and invoicing refreshes everything.

### Out of scope for Stage 0

- New charts and pages, including the MoneyChart redesign.
- A preview before generating monthly invoices.
- Expense categories from the server (the list is still kept in the frontend).
- The seven non-finance `window.confirm` calls: floor plan templates, suspending a tenant, announcements, two on devices, two in maintenance.
- The subscription banner's fixed Asia/Karachi time zone.

### Found while updating the knowledge file (frontend behind the backend)

- The space form still edits rate-card prices the server no longer uses.
- The booking dialog still explains the `daily`, `dayshare` and `rates` price bases.
- There is no screen for the server's hourly price list (`PUT /resources/pricing`), amenity invoices, amenity requests or overstaying members.
- On Today, the frontend shows the month figures to the invoices or reports area, while the server sends them only for reports plus invoicing. The effect is the same today, but the frontend rule should be made to match exactly.
