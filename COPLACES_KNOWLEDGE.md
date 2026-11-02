# Coplaces: Complete Product and Codebase Knowledge Base

> **Purpose:** Give any AI agent or new developer full working knowledge of Coplaces: what it does, who uses it, every feature and small behaviour, the data model, the API it calls, and how the frontend code is organised.
>
> **Scope:** Written from the **frontend repository** (`coplaces_frontend`). The backend is a separate service (`https://coplacesbackend.vercel.app`, repository `coplaces_backend`). Where a rule is enforced server-side, this document says so. When in doubt, the server is the source of truth.
>
> **Companion file:** the backend repository has its own `COPLACES_KNOWLEDGE.md`. Its **§9 "Finance rules as they behave today"** is the reference for how the server calculates money (it lists known server issues as **H1–H6**). Where both files describe the same rule, they must agree; this file points to backend §9 instead of repeating it.
>
> Last updated: 2026-11-03 (branch `finance-overhaul`, after the Stage 0 finance fixes).

---

## Table of contents

1. [What Coplaces is](#1-what-coplaces-is)
2. [Tech stack and project setup](#2-tech-stack-and-project-setup)
3. [Architecture of the frontend](#3-architecture-of-the-frontend)
4. [Users, roles, permissions and package features](#4-users-roles-permissions-and-package-features)
5. [Routing map (every page)](#5-routing-map-every-page)
6. [Core domain concepts and data model](#6-core-domain-concepts-and-data-model)
7. [Staff app: feature by feature](#7-staff-app-feature-by-feature)
8. [Member portal: feature by feature](#8-member-portal-feature-by-feature)
9. [Platform admin (super admin): feature by feature](#9-platform-admin-super-admin-feature-by-feature)
10. [3D floor view, floor plan editor and plan import](#10-3d-floor-view-floor-plan-editor-and-plan-import)
11. [Pricing and billing rules](#11-pricing-and-billing-rules)
12. [Complete API endpoint reference](#12-complete-api-endpoint-reference)
13. [Shared UI, formatting and helpers](#13-shared-ui-formatting-and-helpers)
14. [Design system](#14-design-system)
15. [Conventions and gotchas for agents](#15-conventions-and-gotchas-for-agents)
16. [Known finance issues (waiting on backend)](#16-known-finance-issues-waiting-on-backend)
17. [Glossary](#17-glossary)

---

## 1. What Coplaces is

Coplaces is a **multi-tenant SaaS for running coworking spaces**. It is built for the Pakistani market: the default currency is PKR, the default time zone is `Asia/Karachi`, and JazzCash and Easypaisa are payment methods. It still works with any currency or time zone.

Tagline on the sign-in page: *"Your whole coworking space, in one view. Rooms, desks, members, visitors and invoices, live on every floor you run."*

There are three products in one app. Which one a person sees depends on their role:

| App | Who | What they do |
|---|---|---|
| **Platform admin** | `superadmin` (Coplaces staff) | Register coworking businesses (tenants), sell them packages, record subscription payments, suspend or reactivate them. |
| **Staff app** | `owner`, `manager`, `staff` of a coworking business | Run the space day to day: front desk, bookings, members, spaces and the 3D floor plan, plans and shifts, company contracts, finance, maintenance, announcements, fingerprint attendance devices, settings. |
| **Member portal** | `member` (people who rent space) | Check in and out, request meeting rooms, add visitors, view invoices, report problems, see announcements. |

### Tenancy hierarchy

```
Platform (Coplaces)
 └── Organization (a coworking business, "tenant")  ← subscribes to a Package
      └── Location (a physical site; has code, time zone, currency, hours, tax)
           ├── Floors
           ├── Resources ("spaces": rooms, desks, offices, storage)
           ├── Floor objects (kitchen, walls, doors, etc.; drawn, never booked)
           ├── Plans → Shifts
           ├── Members, Bookings, Visitors, Attendance
           ├── Invoices, Payments, Expenses
           ├── Contracts, Room requests, Issues, Tasks, Assets
           ├── Announcements, Holidays, Amenities
           └── Attendance devices (ZKTeco fingerprint machines)
```

A user can belong to several locations. Staff switch between them in the sidebar.

---

## 2. Tech stack and project setup

| Area | Choice |
|---|---|
| Framework | **React 19** + **TypeScript** (strict, `noUncheckedIndexedAccess`) |
| Build | **Vite 8**, `@vitejs/plugin-react` |
| Routing | **react-router v7** (`BrowserRouter`, nested `<Routes>`) |
| Server state | **@tanstack/react-query v5** (no Redux or other global store) |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`), tokens in `src/index.css` `@theme`, glass effects in `src/glass.css` |
| Fonts | Archivo Variable (display), Public Sans Variable (body), via `@fontsource-variable` |
| Icons | `lucide-react` |
| 3D | `three`, `@react-three/fiber`, `@react-three/drei` |
| PDF reading | `pdfjs-dist` (plan import) |
| OCR | `tesseract.js` + `@tesseract.js-data/eng` (plan import, runs fully in the browser) |
| QR codes | `qrcode` |
| Tests | `vitest` (tests for the editor model, plan import layout, plan vision and permissions) |
| Hosting | **Vercel** |

### Scripts

```bash
npm run dev        # Vite dev server on :5173, proxies /api → API_URL from .env
npm run build      # tsc --noEmit && vite build
npm run preview
npm run typecheck
npm test           # vitest run
```

### Environment and API routing

- The frontend always calls **`/api`** on its own domain (`src/api.ts`, `API_URL = '/api'`).
- **Development:** `vite.config.ts` proxies `/api` to the `API_URL` value in `.env`.
- **Production:** `vercel.json` rewrites `/api/:path*` to `https://coplacesbackend.vercel.app/api/:path*`. Every other path goes to `/index.html` (SPA fallback).
- Auth is **cookie-based** (`credentials: 'same-origin'`). The frontend never handles tokens.
- A custom Vite plugin (`ocrData`) serves and bundles `ocr/eng.traineddata.gz` so OCR works offline with no third-party fetch.

### Folder layout

```
src/
  main.tsx              Root: QueryClient, BrowserRouter, AuthProvider, ToastProvider, GlassFX
  App.tsx               All routes; Gate picks Platform / Staff / Member app
  api.ts                fetch wrapper (get/post/patch/put/del), ApiError, 401 event
  auth.tsx              AuthProvider, useAuth, useLocation, useFeature, useCanUse, isStaff
  types.ts              Every shared TypeScript type (the data model)
  index.css, glass.css  Design tokens and glass effects
  lib/
    queries.ts          Shared react-query hooks (dashboard, schedule, resources…), FINANCE_KEYS
    permissions.ts      PERMISSION_KEYS, FRONT_DESK_PRESET, can(), accessLabel()
    access.ts           Money areas: permission AND package feature together (canUse…)
    financePeriod.ts    Finance period in the URL, period range, keep figures while loading
    profitLoss.ts       Profit and loss maths: columns, totals, margin, tone
    useDebounced.ts     Value that settles after typing pauses
    features.ts         FEATURE_LABELS, ROLE_LABEL
    catalogue.ts        Space styles, floor object catalogue, amenity options, palette
    spaceState.ts       Live status of each space (free/busy/mine/hold/idle)
    format.ts           money, toCents, CSV export, KIND_LABEL, METHOD_LABEL
    time.ts             Time-zone-aware date/time helpers
    calendar.ts         Month grids, weeks, closed-day rule
    planPeriod.ts       "Plan ends soon / has ended" logic
    planFile.ts         PDF/image → one picture for plan import
    planVision/         In-browser floor plan reading (detect, interpret, ocr)
  components/           Shared UI, forms, modals, booking views
    space3d/            3D scene, floor plan editor, plan import, shapes
  pages/
    Login.tsx, SpaceScan.tsx
    staff/              Staff app pages
    member/             Member portal pages
    platform/           Super admin pages
```

---

## 3. Architecture of the frontend

### Boot sequence (`main.tsx`)

`StrictMode` → `GlassFX` (animated backdrop) → `QueryClientProvider` → `BrowserRouter` → `AuthProvider` → `ToastProvider` → `App`.

QueryClient defaults: `staleTime: 15s`, `refetchOnWindowFocus: true`, `retry: 1`.

### The Gate (`App.tsx`)

1. `/login` always shows the Login page.
2. Everything else goes through `Gate`:
   - While the session loads, it shows "Loading".
   - If the session check failed for a reason other than 401, it shows "Can't reach the server" with a **Try again** button.
   - Not signed in: redirect to `/login`, keeping `state.from` so the user returns to where they were going (used by QR-code scans).
   - `superadmin`: `PlatformRoutes`.
   - No location assigned: "No location assigned. Ask the owner to give your account access to a location."
   - `owner` / `manager` / `staff`: `StaffRoutes`. `member`: `MemberRoutes`.

The same URL (for example `/`) shows different pages depending on role.

### Auth (`auth.tsx`)

- Session = `GET /auth/me` → `{ user, org, locations }`. Cached forever (`staleTime: Infinity`) under query key `['session']`.
- `login(email, password)` → `POST /auth/login`. `logout()` → `POST /auth/logout`.
- On login, logout or any 401, **every cached query except the session is removed**, so no data from a previous user is ever shown.
- Any 401 response anywhere fires a `cp:unauthorized` window event, which signs the user out in the UI.
- **Current location** is stored in `localStorage['coplaces.location']`. It falls back to the first location.
- Hooks:
  - `useAuth()` → `{ user, org, locations, location, setLocationId, loading, loadError, login, logout, refresh }`
  - `useLocation()` → the current `Location` (throws if none; only use it inside the app shells)
  - `useFeature(key)` → whether the org's package includes the feature
  - `isStaff(user)` → role is owner, manager or staff

### API wrapper (`api.ts`)

- `api.get(path, params)`: params become a query string; empty, null and undefined values are dropped.
- `api.post(path, body)`, `api.patch`, `api.put`, `api.del`.
- 204 returns `undefined`. Errors throw `ApiError(status, message)`, where the message is the server's `{ error }` string.
- `errorMessage(e)` turns any error into a readable string.

### Data fetching conventions

- One `useQuery` per resource. Query keys always start with the resource name (`'members'`, `'bookings'`, `'schedule'`…).
- After a mutation, pages call `useRefresh()('members', 'dashboard', …)`, which invalidates every query whose first key segment matches.
- Polling: dashboard and schedule every 60s; people in the building every 30s; room requests every 30s; device list and commands every 15s; today's device punches every 15s; staff attendance today every 30s; open-issue badge every 60s.

### Code splitting

Lazy-loaded so the main bundle stays small: `FinanceOverview`, `ProfitLoss` (charts), `FloorPlanEditor` (whole 3D editor), the OCR engine, and the PDF reader.

---

## 4. Users, roles, permissions and package features

There are **three independent layers** of access. A page or button appears only when all of the layers that apply to it allow it.

### 4.1 Roles (`Role`)

| Role | Label | Notes |
|---|---|---|
| `superadmin` | Platform admin | Coplaces staff. Sees only the platform app. |
| `owner` | Owner | Has every permission. Only owners manage locations and the team, see the subscription banner, and are told how to upgrade. |
| `manager` | Manager | Team member. Can open **Attendance devices** (owners and managers only). |
| `staff` | Front desk | Team member with whatever permissions were ticked. |
| `member` | Member | Uses the member portal. Has a `memberId`. |

`accessLabel(user)` shows under the name in the sidebar: "Platform admin", "Owner", "Member", "Full access" (team member with all permissions) or "Team member".

### 4.2 Permissions (`PermissionKey`, staff only)

Labels and descriptions come from the server (`GET /staff/permissions`). Server order:

| Key | Unlocks |
|---|---|
| `front_desk` | Front desk page, checking members in, recording amenities, collecting amenity money |
| `bookings` | Bookings page, the "New booking" button, approving room requests |
| `members` | Members list and detail, deleting members, **setting plans and shifts, renewing, recording a member's advance or deposit and settling the deposit** (server rule; see backend §5) |
| `spaces` | Adding and editing spaces, the floor plan editor (everyone on staff can *view* Spaces) |
| `plans` | Plans and shifts page, the amenities setup in Settings (on the server also the hourly price list, `PUT /resources/pricing`, which this frontend does not call yet) |
| `holidays` | Holidays section in Settings |
| `contracts` | Contracts page |
| `announcements` | Announcements page |
| `maintenance` | Maintenance page, open-problem badge, space ops chips |
| `invoices` | Invoices and payments (with the `invoicing` feature), recording payments, collecting amenity money |
| `billing_admin` | Generating monthly invoices, voiding invoices, removing payments (with `invoicing`) |
| `expenses` | Expenses (with the `expenses` feature) |
| `reports` | Finance overview and profit and loss (with the `reports` feature); the server also sends the Today page's month figures only to `reports` holders on a package with `invoicing` |

**Presets** in the team form:
- **Full access**: all 13.
- **Front desk** (`FRONT_DESK_PRESET`): `front_desk`, `bookings`, `members`, `invoices`. This is the default for a new team member.
- **View only**: none.

`can(user, key)` checks `user.permissions` (owners have them all).

### 4.3 Package features (`FeatureKey`, per organization)

| Key | Label | Effect when missing |
|---|---|---|
| `visitors` | Visitor management | Visitors pages, sections and buttons disappear |
| `member_portal` | Member portal | Members cannot sign in at all (server-enforced) |
| `floor_3d` | 3D floor view | Only the list view is shown; spaces are added one by one instead of floors-first |
| `plan_import` | Floor plan import | No "import a plan" in the editor |
| `invoicing` | Invoices and payments | No invoice or payment pages for staff or members, no invoice figures on Today, no Invoices section, New invoice button or account balance on member detail |
| `expenses` | Expense tracking | No expenses page; expenses are left out of the dashboard |
| `reports` | Finance reports (**requires `invoicing`**) | No overview or P&L |
| `team` | Team accounts | No Team section in Settings |

Features can depend on each other (`FeatureDef.requires`; on the server `reports` requires `invoicing`, and `plan_import` requires `floor_3d`). In the package editor, turning a feature on also turns on what it needs, and turning one off drops anything that needs it.

**Money areas need a permission and a feature together.** `lib/access.ts` defines four areas and checks both with `canUse(user, features, area)` (hook: `useCanUse(area)` in `auth.tsx`):
- `invoices`: permission `invoices` and feature `invoicing`
- `billing`: permission `billing_admin` and feature `invoicing`
- `expenses`: permission `expenses` and feature `expenses`
- `reports`: permission `reports` and feature `reports`

An owner has every permission but still cannot use an area their package leaves out. The Finance menu link (`anyFinance`), the first Finance page (`financeHome`), the Today month figures (`dashboardMoney`) and the overview sections (`overviewSections`) all use these helpers. They only hide things on screen; the server enforces the same rules itself.

**Package limits:** `maxLocations`, `maxFloors` (per location), `maxMembers` (everyone except cancelled members counts). `null` means unlimited.

### 4.4 Gate components (`components/FeatureGate.tsx`)

- `<RequireFeature feature>`: if the package lacks the feature, shows "Not part of your current package". Owners are told to contact Coplaces to upgrade; others to ask the owner.
- `<RequirePermission permission>`: "No access… Ask the owner of your coworking space to give you the permission."
- `<RequireRole roles>`: "Only the owner and managers can see this page."

### 4.5 Organization status and subscription

`OrgStatus`: `trial | active | suspended | cancelled`. `org.expired` is true when `periodEnd` has passed.

`SubscriptionBanner` (owners only, staff app):
- Expired: "Your trial/subscription ended on … Everything still works, but please contact Coplaces to renew."
- Trial: "Free trial: N days left (until …)."
- Active and within 7 days of renewal: "Your {package} subscription renews by …"

Suspending an org signs out its owner, staff and members, and blocks sign-in until it is reactivated (server-enforced).

---

## 5. Routing map (every page)

### Public
| Path | Page |
|---|---|
| `/login` | Login (3D showcase + sign-in card) |

### Staff app (`StaffShell`, sidebar)
| Path | Page | Guard |
|---|---|---|
| `/` | **Today** dashboard | — |
| `/front-desk` | Front desk | `front_desk` |
| `/bookings` | Bookings (Day / Calendar / Timeline) | `bookings` |
| `/members` | Members list | `members` |
| `/members/:id` | Member detail | `members` |
| `/spaces` | Spaces (3D board / list, editor, QR, heat map) | — (editing needs `spaces`) |
| `/finance` | Redirects to the first tab allowed | — |
| `/finance/overview` | Finance overview | `reports` + feature `reports` |
| `/finance/profit-loss` | Profit and loss | `reports` + feature `reports` |
| `/finance/invoices` | Invoices (`?new=<memberId>` opens the new-invoice dialog) | `invoices` + feature `invoicing` |
| `/finance/invoices/:id` | Invoice view | `invoices` + feature `invoicing` |
| `/finance/payments` | Payments | `invoices` + feature `invoicing` |
| `/finance/expenses` | Expenses | `expenses` + feature `expenses` |
| `/plans` | Plans and shifts | `plans` |
| `/contracts` | Company contracts | `contracts` |
| `/maintenance` | Maintenance (`?space=<id>` filters to one space) | `maintenance` |
| `/announcements` | Announcements | `announcements` |
| `/devices` | Attendance devices | role owner or manager |
| `/s/:id` | Space scan page (QR target) | — |
| `/settings` | Settings | — |
| `/shifts` | Redirects to `/plans` (legacy) | |
| `/money/*` | Redirects to `/finance` (legacy) | |
| `*` | Page not found | |

Sidebar order: Today, Front desk, Bookings, Members, Spaces, Finance, Plans, Contracts, Maintenance (yellow badge with the open-problem count), Announcements, Attendance devices, Settings. Each link appears only if allowed. If the user has more than one location, a location switcher sits at the top. The footer shows initials, name, access label and **Sign out**. On mobile, the sidebar is a slide-out drawer. An animated marker glides to the active link.

### Member portal (`MemberShell`, top nav)
| Path | Page | Guard |
|---|---|---|
| `/` | Home | — |
| `/book` | Request a room | — |
| `/visitors` | Visitors | feature `visitors` |
| `/invoices`, `/invoices/:id` | Invoices | feature `invoicing` |
| `/s/:id` | Space scan page | — |
| `/account` | Change password | — |

### Platform admin (`PlatformShell`)
| Path | Page |
|---|---|
| `/` | Platform overview |
| `/spaces` | Coworking spaces (tenants) list and registration |
| `/spaces/:id` | Tenant detail |
| `/packages` | Packages |
| `/payments` | Subscription payments |
| `/settings` | Change password |

Page transitions: each top-level section fades and rises in. Moving between tabs of one section does not replay the animation.

---

## 6. Core domain concepts and data model

All types live in `src/types.ts`. **Money is always integer cents** (`…Cents`). Dates are `YYYY-MM-DD` strings; times are `HH:MM`; instants are ISO strings. **All display uses the location's time zone.**

### 6.1 Location
`id, name, code` (short site code shown on the yellow "plate" and used as the invoice number prefix)`, address, timezone, currency, openTime, closeTime, taxRateBps` (basis points, so 1600 = 16%)`, closedWeekdays` ("0,6" where 0 = Sunday)`, active`.

### 6.2 Resources ("spaces")
`ResourceKind`:
| Kind | Label | How it is used |
|---|---|---|
| `room` | Meeting room | Booked by the hour |
| `corporate_room` | Corporate room | Booked by the hour at its own rates; included meeting minutes never apply |
| `hot_desk` | Hot desk (and day offices) | Booked for a whole day or part of one |
| `dedicated_desk` | Dedicated desk | **Assigned** to a member; not booked |
| `office` | Private office | **Assigned** |
| `storage` | Locker, mailbox or parking | **Assigned** |

Helpers: `isRoomKind` (room, corporate_room), `isDeskKind` (hot_desk, dedicated_desk), `isAssignedKind` (dedicated_desk, office, storage).

`ResourceStatus`: `available`, `cleaning`, `maintenance`, `reserved` (none of these three can be booked), `retired` (hidden from booking and the 3D view; still in the management list).

Key fields: `name, floor, capacity, hourlyRateCents, dailyRateCents, amenities` (comma-separated text)`, status, notes, style, description, photoIds`; position in the plan `planX, planZ, planW, planD, planRot` (quarter turns 0–3, metres; `null` until placed); own hours `openTime/closeTime`; extra closed weekdays `closedWeekdays`; pricing extras `offPeakRateCents, peakStart, peakEnd, halfDayRateCents, fullDayRateCents, noPlanRateCents`; live `occupied`, `occupant { assignmentId, memberId, name, company }`.

**Styles** (`lib/catalogue.ts` `STYLES`; the server validates the keys). Default price in cents is shown in brackets:
- room: `meeting` (6 seats, 2,000/h), `phone_booth` (1, 800/h), `huddle` (4, 1,500/h), `training` (12, 3,500/h), `studio` podcast (4, 2,500/h), `interview` (3, 1,000/h), `focus` (1, 900/h), `video_call` (4, 1,800/h)
- corporate_room: `boardroom` (16, 9,000/h), `training_hall` (30, 12,000/h), `event_hall` (80, 20,000/h)
- hot_desk: `standard` (1,500/day), `standing` (1,700), `corner` (1,800), `day_office` (3 seats, 4,500/day)
- dedicated_desk: `standard`, `standing`, `corner`, `team_pod` (4 desks rented as one)
- office: `standard` (4 seats), `executive` (6)
- storage: `locker`, `mailbox`, `parking`

Each style has a name prefix ("Huddle Room"); `nextName()` auto-names new ones ("Huddle Room 3"; "Desk D3" for prefixes ending in D) and a footprint function of seat count.

**Amenity options** a space can tick (`AMENITY_OPTIONS`): Projector, Whiteboard, TV screen, Video-call kit, Speakerphone, Wi-Fi, Power sockets, Air conditioning, Natural light, Soundproof, Standing desk, Monitor, Printer access, Tea and coffee, Wheelchair accessible. Custom entries can be typed too.

### 6.3 Floors and floor objects
- Floors are named strings per location (`GET /floors` → `{ floors, limit }`). The empty string is the ground floor. Names are sorted naturally, with "Ground…" first. A floor can be removed only when it is empty.
- **Floor objects** (`FloorObject`) are drawn on the plan but never booked: `type, label, x, z, w, d, rot, variant, tint, floor`.
- Object types (`OBJECTS` in the catalogue):
  - Amenities: kitchen, pantry, coffee machine, water dispenser, vending machine, lounge, recreation area, library, nap pod, phone corner, print station, reception, plant
  - Facilities: washroom (men / women / accessible), prayer room, server/IT room, storage room, mail room, generator/UPS room, security desk, core (lift and stairs)
  - Safety: fire exit, extinguisher, first aid
  - Outdoors: terrace, bike rack
  - Structure: wall, glass wall, door (variants single / double / sliding), window, column, zone (rectangle or L-shape, tints grey blue / blue / green / yellow / rose / slate), text label
- Structure objects (walls, doors, zones…) may overlap other things. Doors and windows lying inside a wall cut openings in it.

### 6.4 Plans and shifts
- **Plan**: `name, description, interval ('month' | 'day' day pass), active`, plus legacy `priceCents, includedMeetingMinutes, includesHotDesk`. **What a member pays comes from the shifts they pick**, not from a plan price.
- **Shift** (`ShiftTemplate`): a named time slot inside a plan (for example Morning 09:00–14:00) with an optional `priceCents` (`null` means "by the hour"), optional `spaceIds` it is limited to (empty means every bookable space), and `active`. Legacy shifts with no `planId` are "Not in any plan" and open to every member; editing one lets you move it into a plan.

### 6.5 Members
`MemberStatus`: `lead` (not started), `active`, `paused`, `cancelled` (cannot sign in).

`MemberRow` / `MemberDetail` fields: contact info, `planId`, `contractCompany` (set if the member came from a company contract), current plan period `planStart` / `planEnd`, money (`advanceCents`, `advanceUsedCents`, `advanceReceivedAt`, `depositCents`, `depositStatus`, `depositReturnedCents`), `meetingCredits` (credit hours per month; **2 credit hours = 1 hour of free meeting room**), `checkedIn`, `devicePin`. The detail view adds `plan`, `shifts`, `desks`, `moneyEntries`, `amenities` (allowances with today's usage), `amenityOwedCents`, `assignments`, `balanceDueCents`, `overdueCents`.

`DepositStatus`: `pending` (none / not received), `held`, `refunded`, `forfeited` (kept).

### 6.6 Assignments
A dedicated desk, office or storage unit given to a member from `startDate` to an optional `endDate`. "End assignment" sets `endDate` to today.

### 6.7 Bookings
`BookingStatus`: `confirmed`, `completed`, `cancelled`, `no_show`. Fields: `resourceId, memberId, startsAt, endsAt, billableMinutes, priceCents, invoiceId, notes, checkedInAt, allDay` (a hot desk booked from opening to closing).

Display states: "Checked in", "Did not check in" (confirmed but already ended), "Confirmed", "Completed", "No-show", "Cancelled". **A booking that is already on an invoice cannot be cancelled.**

### 6.8 Room requests (members ask, owners decide)
Members **cannot book rooms directly**. They send a `RoomRequest` (`pending | approved | rejected | cancelled | taken`). `ahead` = how many others asked for an overlapping time. Approving one creates the booking, and the overlapping requests become `taken`. Rejecting can include a reason the member sees.

### 6.9 Attendance
`AttendanceRow`: a member's check-in or check-out (`resourceName` = where they sit). Members can check in only with a plan's shift, an assignment, or a booking for now. Where they sit follows from that. Staff attendance (`StaffAttendanceRow`) comes from fingerprint devices.

### 6.10 Visitors
`VisitorStatus`: `expected`, `checked_in` ("Inside" / "Arrived"), `checked_out` ("Left"), `cancelled`. Each visitor has a host member, name, email, phone, company, purpose and `expectedAt`.

### 6.11 Invoices and payments
- `InvoiceStatus`: `open`, `paid`, `void`; `overdue` is a flag on open invoices. `kind`: `subscription` or `manual`. On the server, `subscription` covers monthly invoices, company invoices **and** plan-period (shift) invoices; amenity invoices are `manual` (backend §6).
- Invoice detail: line items (`description, quantity, unitPriceCents, amountCents, bookingId?`), subtotal, tax, total, paid, balance, payments, notes, location name and address. A **negative "Advance paid" line** is how a member's advance is taken off an invoice. Lines carry no plan, space or contract link.
- Invoice totals (server): `subtotal = Σ quantity × unit price`, `tax = round(subtotal × taxRateBps / 10000)` once per invoice, `total = subtotal + tax`. Paid amount and status are always worked out again from the payments (backend §9.2).
- `PaymentMethod`: `cash`, `card`, `bank_transfer`, `jazzcash`, `easypaisa`, `cheque`, `other`.

### 6.12 Expenses
Categories: `rent, utilities, internet, cleaning, supplies, salaries, maintenance, marketing, software, other` (the frontend keeps its own copy of this list in `Expenses.tsx`). Fields: `vendor, description, amountCents, incurredOn`.

### 6.13 Amenities (tea, coffee, food)
- `Amenity`: name and price per location.
- Each member gets a **free amount per day** for each amenity (`AmenityAllowance`). Beyond that they owe the price.
- `AmenityOrder`: what was given, how many were free, the charge, and `collectedAt`. What is owed is cleared **either** by collecting at the front desk (counts as income when marked collected) **or** by putting it on an invoice (the next monthly invoice, or `POST /amenities/invoice` on the server, which this frontend does not call yet). See backend §8.11.

### 6.14 Contracts
`ContractStatus`: `draft`, `active`, `ended`, `cancelled`. There are two shapes:
- **Legacy single-member contract**: one member, an optional resource, rent per month, advance, deposit, dates. Can be printed.
- **Company contract** (`companyName` set): a company with people (`ContractPerson`: name, email, phone, own desk or shared, joinDate, leaveDate), shared `spaces`, and pricing `pricingMode: 'per_member' | 'fixed'` with `pricePerMemberCents`, `extraMemberCents` (for people beyond the shared seats), `fixedPriceCents`; plus `seats` and `extraPeople`.

Money: advance (income) and security deposit (held, not income) with an entry log (`DepositEntry`: received / refunded / kept / advance).

### 6.15 Maintenance
- `Issue` (a problem report): `title, description, priority (low | normal | urgent), status (open | in_progress | resolved), resolution, taskId, reporter`.
- `SpaceTask` (cleaning and upkeep schedule): `kind (cleaning | maintenance | inspection)`, optional space (`null` = whole location), `everyDays` (`null` = once), `nextDue`, `lastDoneAt`, `overdue`; with a log of completions.
- `SpaceAsset` (equipment): `name, category, serialNumber, purchasedOn, warrantyUntil, status (working | needs_repair | retired), notes`, optional space.

### 6.16 Announcements
`title, body, draft, publishAt`; state `draft | scheduled | live`. Members see live ones on their Home page.

### 6.17 Holidays
Per location date plus name. The location is closed that day: nothing can be booked or requested. `closedReason()` mirrors the server's rule (holiday or closed weekday).

### 6.18 Attendance devices (ZKTeco, ADMS protocol)
- `AttendanceDevice`: `serialNumber, name, active, lastSeenAt, info, online, commandsWaiting`.
- `DevicePunch` results: `checked_in`, `checked_out`, `duplicate`, `ignored`, `rejected`, `unknown_pin`.
- `DevicePerson` (who is on the device, with their PIN). `DeviceCommand` (`pending | sent | done | failed`).

### 6.19 Reports
- `Dashboard`: `ops` (active members, checked in now, visitors, bookings today, rooms in use, hot desks booked, dedicated desks / offices / storage assigned) and `finance`. The server sends `finance` only to people with the `reports` permission on a package with `invoicing`; otherwise it is `null`. Its figures (backend §8.13):
  - MRR: for active members on monthly plans, the sum of their shifts' prices (or the plan price without shifts). Contract rent is not included.
  - Collected this month: invoice payments + advances + kept deposits + amenities collected at the desk.
  - Invoiced this month: non-void invoices by issue date, net of advance lines.
  - Expenses this month, outstanding, overdue amount and count.
- `FinanceReport` (backend §9.3). **Cash basis**:
  - Collected = invoice payments (by `paidAt`) + advances (when received) + kept deposits (when kept) + amenities collected at the desk. Received and returned deposits are not income. Collected includes sales tax; there is no tax report.
  - Costs count by `incurredOn`. Months follow the location's time zone.
  - It returns totals (invoiced, collected, expenses, net), `previous` (the period of equal length just before), `incomeByKind`, P&L by month, `monthly` (at most 60 months), `expensesByCategory` and `paymentsByMethod` (**invoice payments only**, so it does not add up to Collected).
  - Also `receivablesAging` (open invoices **as of now**, whatever the period), `amenities` (owed now, collected in the period, who owes) and `deposits` (held **as of now**, plus received, refunded, kept and advances in the period, and the movements).
- `IncomeKind`: `subscription` (memberships and plans), `manual` (rooms, desks and other charges), `kept_deposit`, `advance`, `amenities`. The `advance` kind includes **member** advances as well as contract advances, although the frontend labels it "Advance rent from contracts" (see §16).
- `Occupancy`: utilization 0–1 per space over N days. Rooms are measured in booked hours, desks in booked days, assigned spaces in days held; closed days are left out.

### 6.20 Platform types
`PackageRow` (name, description, interval month or year, price in PKR, features, limits, active, tenant count), `OrgSummary`, `OrgDetail` (owners, locations, payments), `PlatformPayment` (amount, method, period covered), `PlatformOverview`.

---

## 7. Staff app: feature by feature

### 7.1 Today (dashboard, `/`)
- Header: "Today, {long date} at {location}". Buttons: **New booking** (`bookings`), **Open front desk** (`front_desk`).
- **Empty setup state** (no spaces yet): "Set up your space" with links to add rooms and desks, create plans, add members.
- **Rooms, desks and offices** board: 3D view or list (see §10), with "X of Y rooms in use now". Selecting a space opens a detail panel with **Book this room/desk** (prefilled with the next free half hour for rooms), **See bookings**, or **Manage in Spaces** for dedicated desks and offices.
- Right column:
  - **In the building**: up to 8 checked-in members with "since HH:MM", plus a count of visitors inside, and a "Check in" link (only with `front_desk`).
  - **Visitors today** (feature `visitors`): each with expected time, host and status chip; "N still to arrive".
  - **This month** (`dashboardMoney` in `lib/access.ts`):
    - The block shows when the server sent `finance` **and** the person has the invoices or reports area. Because the server only sends it to `reports` holders on a package with `invoicing`, in practice it shows to exactly those people.
    - Rows: Collected and Monthly recurring always. Invoiced, Outstanding and Overdue (red, with the invoice count) need the invoicing feature. Expenses needs the expenses area.
    - The "Finance overview" link needs the reports area.
- The setup links "Create plans" and "Add members" in the empty state show only with the `plans` and `members` permissions.
- Refreshes every 60s. The 3D items rebuild every minute so the live state stays current.

### 7.2 Front desk (`/front-desk`)
- **Check a member in**: pick a member and press Check in. There is no space to choose: they sit where their plan, assignment or booking says. Members with a plan, shifts or a booking for now can be checked in; the server rejects others with a message.
- **Tea, coffee and food** (`AmenityDesk`, only if amenities exist): choose a member, an amenity and a quantity, then **Record**. The toast says at once whether it was free or what to collect ("2 Coffee: Rs 400 to collect, 1 free").
- **In the building**: a table of members with "Sitting at", "Since" and a **Check out** button.
- **Visitors** (feature `visitors`): today's visitors plus anyone still inside from an earlier day. Expected visitors get **Check in** and **Cancel**; inside visitors get **Check out**.
- **Add visitor** dialog: host member, name, company, email, reason. With "They are here now, check them in" ticked (the default) the visitor is a walk-in and is checked in immediately; unticked asks for a date and arrival time.

### 7.3 Bookings (`/bookings`)
- **Room requests panel** at the top (`RoomRequestsPanel`): every pending member request, showing who wants what and when, their notes, and "N others are also asking for this time". **Approve** (books it; overlapping requests become "taken") or **Reject** with an optional reason. Refreshes every 30s.
- Views (segmented control):
  - **Day**: date picker with previous / next / Today.
    - Closed-day banner ("{Holiday name}. Nothing can be booked on this day.") disables New booking.
    - **Floor view** (3D) with a **View at time** picker: rooms and desks show who has them at the chosen time; select one to "Book at HH:MM" or "Manage booking".
    - **Meeting and corporate rooms** `RoomTimeline`: one row per room, hours across, booked time as bars. Click open time to book; click a bar to manage. **Amenity filter chips** ("Rooms with Projector, Whiteboard…") show only rooms that have everything ticked. Rooms with their own hours are shaded outside them.
    - **Hot desks** grid (`DeskTile`): free / taken / out of service / yours, with a tooltip listing that day's bookings. Click a free desk to book, or a booked one to manage it.
    - **All bookings this day** table: time, space, member, status, charge ("Included" when free), Manage.
  - **Calendar**: a month grid (Monday to Sunday) showing bookings per day, with holidays marked; click a day to open it in Day view.
  - **Timeline**: Week or Month; one row per room or desk, one column per day; bars placed by where the booking falls within opening hours. Click an empty cell to book, a bar to manage.
- **Export** dialog: from / to dates and a status filter, downloading a CSV (Date, Start, End, Space, Type, Member, Status, Charge, Invoiced, Notes). Fetches up to 5000 rows.
- **Booking detail** dialog: space, member, when, charge ("Included in plan"), invoice state, notes. Actions: **Mark completed**, **Mark no-show**, **Cancel booking** (only if not invoiced).

**New booking dialog** (`BookingModal`, staff and member variants):
- Fields: Member (staff only), Space (grouped: Meeting rooms / Corporate rooms / Hot desks and day offices; only `available` spaces), Date (today up to +180 days), Note.
- Hot desks: **Whole day** (opening to closing; the default) or **From and until**.
- **Shift chips**: the member's plan shifts that apply to this space. One click fills the times and shows the shift price.
- Rooms: From and Until in 15-minute steps, limited to the space's own hours or else the location's.
- **Live price quote** from `POST /bookings/quote`, calculated by the server exactly as booking would, with a line explaining where the price came from (see §11).
- On success: "Booked. Rs X will be invoiced." or "Booked. Included in the membership plan."

### 7.4 Members (`/members`)
- Header: "N active at {location}", plus the package member limit if there is one.
- **"Plans ending soon"** banner: active members whose plan period ends within 2 days or has ended, with links to renew.
- Search by name, email or company; filter by status (All / Active / Leads / Paused / Cancelled).
- Table columns: avatar and name (with company and email), plan (or a "Contract: {company}" chip) plus a "Plan ends in N days" chip, status chip, Today ("In the building" / "Not in"), member since.
- **Add member** dialog:
  - Full name, Company, Email (their sign-in), Phone, Plan (active plans or "No plan yet"), Status (Active or Lead), Start date.
  - **PlanPicker** (when a plan is chosen and the status is Active): tick one or more of the plan's shifts to get the total per month or day, less any advance. Then it lists **desks and offices free from the start date to the period end** in those shift times, grouped by floor (`GET /members/available-spaces`), to tick. "A member cannot check in without a booking." If the plan has no shifts, it is given as it is.
  - **Money received**: Advance (taken off shift prices on invoices until used up) and Security deposit (held, settled at the end of the plan period; not income), plus payment method and reference.
  - **Free for this member**: tick amenities and set how many are free per day; meeting room credit hours per month.
  - Notes.
  - On success, a **Credentials modal** shows the one-time temporary password with a **Copy password** button.

### 7.5 Member detail (`/members/:id`)
- Header actions: **Edit**, **Reset password** (shows new temporary credentials), **New invoice** (goes to `/finance/invoices?new=<id>`; needs the invoices area, i.e. permission and feature), **Delete** (with an inline "Delete X for good?" confirmation; the server only allows deleting a member with no money history, backend §8.12).
- If the member belongs to another location: "Switch location in the sidebar to see them."
- **Plan banner**: "{Plan}: Morning 09:00–14:00, on Desk D3. This period A to B, and it ends in N days." **Renew plan** appears when the period has ended or ends within 2 days (`POST /members/:id/renew` returns the new start and end).
- **Advance and security deposit** section: how much advance was used and is left; deposit status chip; **Settle at the end of the plan** (enter the amount returned; anything kept counts as income; 0 keeps it all); money movement history.
- **Amenities and credit hours**: free per day, used today, the price after; amount to collect with a **Collected** button (`front_desk` or `invoices`).
- Upcoming bookings, Invoices (latest 10; needs the invoices area, and the request is not even sent without it), Recent bookings (latest 8).
- Aside: Details (email, phone, plan or contract, member since, notes), Account balance (due, overdue; only on packages with `invoicing`), Assigned spaces (current / ended).
- Advance and deposit movement dates are shown on the **location's** calendar day (`localDateOf`), not the UTC date.
- **Edit** dialog: same fields as Add. Changing the plan, shifts or desks re-books from today (or from the plan start if that is later). Days already passed stay as they were, and an unpaid invoice for this period is replaced with the new total. Money already received is locked and cannot be added twice. Saving calls up to three endpoints in order: `PATCH /members/:id`, then `POST /members/:id/money` (only for new money), then `PUT /members/:id/plan` (only if the plan changed and the status is Active).

### 7.6 Spaces (`/spaces`)
- Header buttons: **QR codes**, **Edit floor plan** (`spaces` + 3D), **Add floors** (with 3D) or **Add space** (without 3D).
- **Floors-first workflow** (with `floor_3d`): Add floors names the floors (it suggests "Ground Floor", "Floor 1", "Floor 2"…, respects the package floor limit, and floors can be removed once empty). Spaces are then drawn in the floor plan editor.
- **Without 3D**: spaces are added one at a time with **SpaceForm**.
- **Show how busy** (heat map, 3D only): colours every space by utilization over the last 7 / 30 / 90 days (from pale blue through yellow to brick red), with a panel showing the average, the busiest 4 and the quietest 4.
- **SpaceBoard** with list fallback. Selecting a space shows **Report a problem**, **Assign** / **End assignment** (dedicated desks, offices, storage), **Edit** (`spaces`), and for `maintenance` users an ops line: open problems, next or overdue task, equipment count and items needing repair, and a link to Maintenance.
- **SpaceList** (a building directory): grouped by floor or by type, searchable, filter chips with live counts, a status mark per row; desks shown as a grid of numbered cells; also lists non-bookable floor objects on each floor. Includes retired spaces, and shows "until {date}" for assignments that end.
- **Assign** dialog: member, from date, until date (optional).
- **SpaceForm** groups:
  - *About it*: name, type (locked after creation), style, floor, seats (1–500), description, "What it offers" amenity chips.
  - *Photos* (edit only): upload and remove. Photos are shrunk in the browser before upload (raw body `POST /resources/:id/photos`) and served from `/api/resources/photos/:id/file`.
  - *Pricing* (rooms and hot desks): hourly or daily rate; no-plan rate; optional peak hours with an off-peak rate; half-day and full-day prices (rooms). **The backend no longer uses any of these except the hourly rate** (rate-card pricing was removed, backend §8.2), so this form is out of date; see §16.
  - *Opening hours*: "This space has its own hours" and "Also closed on" weekdays.
  - *Status*: Available / Being cleaned / Under maintenance / Reserved / Retired, and private notes.
- **QR codes** sheet: one QR per non-retired space (filterable by kind) linking to `{origin}/s/{id}`. **Print** opens a print-ready sheet in a new window (3 per row, with name, type and floor, "Scan to check in, see details or report a problem").

### 7.7 Space scan page (`/s/:id`, staff and members)
What a printed QR code opens. If the person is not signed in, they log in first and come back.
- Shows the space name, type, floor, a status chip, kind, seats, what it offers, its own hours, description and photos.
- **Check in here** (members, at an available desk), **Report a problem**, **Maintenance for this space** (`maintenance`), **Open bookings** (team with `bookings`) or **Request a room** (member).
- Lists open problems for maintenance staff, or the member's own open reports.
- If the space is at another location: "Use the location switcher, then scan again."

### 7.8 Plans (`/plans`)
- One card per plan: name, a "Billed monthly" or "Day pass" chip, an "Offered" or "Inactive" chip, description, and actions **Add shift**, **Edit plan**, **Delete plan** (confirms "Delete it and its N shifts? Members on it lose the plan.").
- The shift table under each plan: name, time, spaces ("Every room and hot desk" if none chosen), price or "By the hour", Offered / Hidden, Edit, Delete.
- A plan with no shifts: "Members on this plan pay for bookings by the hour until you add some."
- **Not in any plan** section for legacy shifts.
- **PlanForm**: name, Billed (Every month / Per day), description, "Offer this plan to new members". *Only monthly plans are included when you generate monthly invoices.*
- **ShiftForm**: name, (plan, for legacy shifts), From / Until (15-minute steps; must end after it starts), price (empty = by the hour), spaces (optional; only available, unassigned rooms, desks and offices), "Offer this shift when people book".

### 7.9 Contracts (`/contracts`)
"A contract rents space to a company and its people. Starting it gives the employees their logins and hands over the spaces and desks, and ending it frees them again."

- Table: who (company or member), people count and extras, space(s) or "Desks only" plus the count of own desks, period, advance (Received / Not received), deposit (status and amount returned), status, actions.
- Actions by state:
  - Draft: **Start**, **Edit**, **Cancel**
  - Company contract not finished: **People**
  - Active company contract: **Prices**, **Extend** (only if it has an end date)
  - Active: **End today**
  - **Advance received**, **Security deposit received** (record the method and reference)
  - Finished with a held deposit: **Settle security deposit** (refund an amount, or keep it all with 0)
  - **Money record** (history of advance and deposit entries)
  - **Print** (legacy single-member contracts): a clean page with the deposit history and places to sign
- **Export** CSV of all contracts.
- **New company contract wizard** (7 steps): 1 Company (name, email, phone) → 2 How long (start, optional end) → 3 How many people (1–200) → 4 The people (name, unique email, phone, password of at least 8 characters, "Show passwords"; they have no plan) → 5 Space (shared spaces free for the whole period, by floor, plus per person "shares the company's space" or their own free hot or dedicated desk; it warns how many sharing people exceed the seats and will be charged the extra-person price) → 6 Price (**Per member** with a price per member and an extra-person price, or **One price for the space**; plus advance, deposit, notes) → 7 Review (server quote `POST /contracts/quote` with line items and the monthly total). Finish with **Save as draft** or **Save and start now** (creates, then activates).
- Notes from the UI: part months are charged by the day, and employees' bookings (such as meeting rooms) go on the company's invoice.
- **People** dialog: add a person (with an optional own desk) or let someone leave (removed if the contract is a draft). The last person cannot leave; end the contract instead.
- **Edit company / Prices**: company details and prices; dates change only on a draft (a running contract is extended instead). On the server, a price change applies to the whole month of the next generated invoice.
- Money: the money record and the printed contract date each movement on the location's day. On the server, a **single-member contract's rent is never invoiced** and a **company contract's advance is never taken off its invoices** (backend H2 and H1; see §16).

### 7.10 Finance (`/finance/*`)
Files: `pages/staff/Finance.tsx` (layout, tabs, period, report hook), `FinanceOverview.tsx`, `ProfitLoss.tsx`, `Invoices.tsx`, `Payments.tsx`, `Expenses.tsx`, `components/InvoiceView.tsx`, `components/MoneyChart.tsx`, `components/Bars.tsx`, and the helpers `lib/access.ts`, `lib/financePeriod.ts`, `lib/profitLoss.ts`.

**Layout and period**
- Tabs appear only for the areas the person may use (permission and feature together): Overview and Profit and loss (reports area), Invoices and Payments (invoices area), Expenses (expenses area). `/finance` sends the person to the first one they may use (`financeHome`).
- The period (This month / 3 / 6 / 12 months) lives in the address as `?months=1|3|6|12`. Six is the default and is left out of the address. Anything else falls back to six (`parsePeriod`). The Overview and P&L tabs and the "Full profit and loss" link keep it (`withPeriod`).
- The period runs from the 1st of the earliest month to **today** in the location's time zone, so "This month" is month-to-date (`periodRange`). The request is `GET /reports/finance?locationId&from&to`.
- **While a new period loads, the figures already on screen stay**, dimmed with "Updating…" (`placeholderData: keepWithinLocation(loc.id)`). They are only kept for the same location, so switching location never shows another location's figures. The report remembers which period it is for (`PeriodReport.months`), so the overview's sentence always describes the figures shown.
- Every finance error shows **Try again** (`ErrorNote onRetry`).

**Overview**
- A sentence: "In {period} you took in X and spent Y, leaving a profit of Z", or "a loss of Z", or ", so you broke even" when they are equal and not both zero.
- Figures with animated count-up:
  - Money in (`totals.collectedCents`) and Money out, each with "Up/Down N% on the period before".
  - Profit or Loss (zero is neutral, not green), with a note from `marginNote`: "25% of money in", "The loss is 20% of money in", "Money in and out are equal", "No income yet".
  - Still owed to you (only with `invoicing`).
- **Amenities to collect**: who owes what, with **Mark collected** (needs `front_desk` or `invoices`).
- **Advances and security deposits**: deposits held ("Belongs to members, not income"), received, returned, advances received, deposits kept, a movement table (dates on the location's day), and a CSV export.
- An overdue invoices alert (only with `invoicing`). Its "See the invoices" link shows only to people who may open invoices.
- **Money in and out, month by month** (SVG grouped bar chart from `report.monthly`).
- Bars for: where the money came from (income kinds), where it went (expense categories), how members paid (methods; invoice payments only).
- **Who still owes you**: receivables aging (Not yet due / 1–30 / 31–60 / over 60 days late), as of now, only with `invoicing`.

**Profit and loss** (`lib/profitLoss.ts` → `buildProfitLoss`)
- A month-by-month table: income rows by kind, total income, cost rows by category, total costs, net result, and "Profit as a share of income".
- Every monthly row is fitted to the months (missing months count as zero, extra ones are dropped). Totals are summed from the cells shown, so every row and column adds up.
- If any row did not fit, or a row's server total disagrees with its months, a notice says the totals may be short.
- Net: green for profit, red in brackets for a loss, neutral for zero. The heading reads "Net profit", "Net loss" or "Net result".
- Margin: "25%", a loss in brackets "(20%)" in red, "-" without income (`marginText`). Minus zero is never shown.
- **Export to a spreadsheet** (CSV) includes the margin row.
- Rule (server, cash basis): income counts in the month money arrives and costs in the month they were spent. Unpaid invoices are not income yet.

**Invoices**
- Filter (All / Open / Overdue / Paid / Void), search, **Export** CSV.
- The search is sent to the server 300 ms after typing stops (`useDebounced`). The rows already shown stay until the answer arrives.
- **Generate monthly invoices** (billing area): choose a month and "due in N days". **Running it twice for the same month never double-bills** for individual members. What it bills is described in backend §9.2. In short:
  - Individual members: legacy plan price, unbilled priced bookings and owed amenities. Plan-period shift invoices are created when a period starts, not here.
  - Company contracts: monthly rent lines to the current contact.
  - Cancelled and paused members are skipped.

  The result shows created and skipped counts.
- **New invoice** (manual): member (any status), due date (default +14 days), notes, line items (description, quantity as a whole number above 0, unit price). It shows a live subtotal, tax at the location rate and total. **This preview is worked out in the browser**; the server's totals are what count (see §16).

**Invoice view** (staff and members)
- A printable invoice: number, location, billed to, issued and due dates, items, subtotal, tax, total, paid, balance due (red if overdue, green when paid), payments received.
- Staff: **Record payment** (amount defaults to the balance and cannot exceed it; method defaults to bank transfer; reference; notes). The frontend does not send `paidAt`, so a payment is dated when it is entered.
- Billing area: **Void invoice** (only open with nothing paid; "Its bookings become billable again") and **Remove** a payment (the balance goes back up). Both use the in-place `ConfirmButton`, not the browser's confirm box.
- Members see "To pay, ask at the front desk or send a bank transfer and quote {number} as the reference."
- **Print** uses `window.print()`; `.no-print` hides the app chrome.

**Payments**: a from / to date range (default this month), a method filter, a table with a total row (summed in the browser from the rows returned), and a CSV export. It lists **invoice payments only**, so its total is lower than "Money in" whenever advances, kept deposits or desk amenity collections came in.

**Expenses**: a month filter, a category filter, add / edit / delete (delete uses `ConfirmButton`), a total row (summed in the browser), and a CSV export.

**Keeping figures fresh**: every mutation that moves money refreshes all of `FINANCE_KEYS` (`lib/queries.ts`: reports, dashboard, invoices, invoice, payments, expenses, members, member, contracts, summary, bookings). A test (`lib/financeRefresh.test.ts`) fails if a mutation calling a money endpoint does not.

**CSV exports** (`lib/format.ts`):
- Every string cell that starts with `= + - @`, tab or carriage return gets a leading `'`. Quotes, commas and newlines are escaped, rows end with CRLF, and the file starts with a UTF-8 byte order mark so Excel reads Urdu.
- Amounts are written as real numbers through `csvAmount(cents)`, so they add up in Excel and a negative is never taken for a formula.

### 7.11 Maintenance (`/maintenance`)
Three sections (the segmented control shows counts), with an optional "Only this space" filter that stays in the URL (`?space=`):
- **Problems**: Open / Fixed / All. Change status, **add to the schedule** (creates a task due today, `POST /issues/:id/task`), **Mark as fixed** with an optional "What was done" note (the reporter sees it). Members report problems from Home, a QR scan or the floor view.
- **Schedule** (cleaning and upkeep): tasks with kind, where, how often (once / daily / weekly / every two weeks / monthly / every N days up to 730), next due date, overdue flag, **Mark as done** (moves the next due date forward), the completion log (who and when), edit, delete.
- **Equipment**: an inventory per space with category, serial number, purchase date, warranty date and condition (working / needs repair / retired), filterable by condition.

### 7.12 Announcements (`/announcements`)
Create or edit with a title and message, then Publish as **Keep as a draft**, **Now**, or **Later** at a date and time (scheduled). State chips: draft / scheduled / live. Delete with confirmation. Members see live announcements on Home (the latest 3).

### 7.13 Attendance devices (`/devices`, owners and managers)
Supports **ZKTeco fingerprint machines** using the ADMS push protocol.
- **Setup steps** shown in the UI: on the device open Menu → COMM → Cloud Server Setting; enter the server address and port (example `192.168.1.28:4310`, or the relay's domain name with *Enable Domain Name* on); find the serial number under Menu → System Info → Device Info and register it; within a minute everyone at the location is sent to the device with a PIN, then enrol each finger under that PIN.
- Device card: status (Online / Offline / Waiting for first connection / Switched off), last seen, info. Actions: **Sync people** ("Send everyone at this location to the device again"), **Fetch missed punches** (date range → `upload_punches` command), **Restart** (reboot command, with confirmation), edit name, switch on or off.
- Tabs per device:
  - **Punches**: by day and result; refreshes every 15s for today. An `unknown_pin` punch can be assigned to a person.
  - **People and PINs**: change a PIN (1–9 digits; reuse an enrolled number so the fingerprint keeps working) or remove someone from every device (their fingerprints are deleted too).
  - **Sent to device**: the command queue in plain words ("Add or update X (PIN n)", "Remove PIN n", "Send punches from A to B", "Restart", "Report device details"), with its status.
- **Team attendance** section: staff clock-ins and clock-outs by day, with minutes worked.
- Members punching are checked in and out; team members are clocked in and out.

### 7.14 Settings (`/settings`)
- **Your account**: "Signed in as…" and Change password (current and new; at least 8 characters).
- **Holidays** (`holidays`): add a date and name; remove upcoming ones.
- **Amenities** (`plans`): add, edit or remove tea, coffee, lunch… with a price.
- **Locations** (owners only): table (hours and closed weekdays, time zone, currency, tax); add or edit with name, code (invoice prefix), address, time zone (default `Asia/Karachi`), currency (3 letters, default `PKR`), opening and closing times, sales tax %, closed weekdays. **Add location** is disabled at the package limit.
- **Team** (owners, feature `team`): staff list with access label, locations, last login, status. Add or edit with name, email, phone, the **permission picker** (presets plus grouped checkboxes with server descriptions, "N of 13 allowed"), the locations they can work at, and active. **Reset password** shows a temporary password once.

---

## 8. Member portal: feature by feature

### 8.1 Home (`/`)
Data from `GET /me/summary` (`MemberSummary`).
- "Hello, {first name}", with company and plan.
- **Announcements** (the latest 3 live ones).
- **Balance due** banner (red if any is overdue), with a "See invoices" link only on packages with `invoicing`. The amount is the server's `balanceDueCents`. (The Invoices page header sums open balances in the browser instead; see §16.)
- **Amenity charge** banner: "Rs X to pay at the front desk for tea, coffee or food beyond your free amount."
- **Today at the space**: **Check in** (only for active members; the server decides where they sit) or "You checked in at HH:MM" with **Check out**.
- **Your upcoming bookings**, with **Cancel** for ones not yet invoiced.
- **Visitors you are expecting** (feature `visitors`).
- Aside:
  - **Something not right?** with **Report a problem** and the member's last 4 reports and their status (Reported / Being fixed / Fixed) plus the resolution note.
  - **Meeting room time**: used vs included this month as a progress bar.
  - **Free every day**: per amenity "n of m used today", plus prices after that.
  - **Your plan**: name, billed monthly or as a day pass, hot desks included or pay per day, status.

### 8.2 Request a room (`/book`)
- A date picker (no past dates). A closed-day banner blocks requests.
- **Floor view** (3D) with View at time: select a free room and press "Request at HH:MM"; "Manage my booking" for your own; **Report a problem** on any space.
- **Room timeline** with amenity filter chips; the legend shows your booking (blue) and already booked (hatched); room hourly rates are listed.
- **Request dialog**: room, date (up to +180 days), from and until (15-minute steps, within the room's hours), note. It shows live "**N people have already asked for this room at that time**" (`GET /requests/queue`) and "If approved: Rs X / Included in your plan" (quote). Sends `POST /requests`.
- **Your requests**: status (Waiting for the owner / Approved / Rejected / Cancelled / Slot taken), the reason if rejected or taken, and **Cancel** while pending.
- **Your bookings this day**: plan desks and approved rooms. Manage → Cancel (if not invoiced).

### 8.3 Visitors (`/visitors`)
Add a visitor ahead of time (name, company, email, purpose, date up to +180 days, time); a list sorted newest first with status (Expected / Arrived / Left / Cancelled); **Cancel** while expected.

### 8.4 Invoices (`/invoices`, `/invoices/:id`)
A list with number, issued, due, status, total and balance; the header says "Rs X due" or "You are all paid up". The invoice view is read-only and printable.

### 8.5 Account (`/account`)
Change password.

---

## 9. Platform admin (super admin): feature by feature

### 9.1 Overview (`/`)
"Every coworking space on Coplaces, and what they pay."
- **Needs attention**: subscriptions ending within 14 days or already ended (days left, package, status).
- **Recently registered** tenants.
- **Spaces by package** counts.
- **Revenue**: monthly recurring (yearly plans spread over 12 months) and collected this month.
- **Coworking spaces** counts by status (total, trial, active, suspended, cancelled, expired).
- **On the platform**: members, staff and locations.

### 9.2 Coworking spaces (`/spaces`)
- Filter by All / Active / Trial / Ended / Suspended; search by name, city or owner.
- **Register a coworking space**: business name, city, business email, phone, package, starts as (Trial = 14-day free trial, or Active = one billing period with payment recorded next), owner name, email (their sign-in) and phone, first location name (defaults to the business name), code (invoice prefix), address, internal notes. It returns the owner's temporary password, shown once.

### 9.3 Tenant detail (`/spaces/:id`)
- **Features in this package** (included or not).
- **Locations**, **Subscription payments**.
- **Subscription**: status, valid until; **Suspend** (with confirmation; everyone is signed out) or **Reactivate**.
- **Usage**: locations, members (not cancelled) and staff, against the package limits.
- **Owner**: contact and last login; **Reset owner password**.
- **Notes**.
- Dialogs: **Edit details** (including "Subscription valid until"), **Change package** (features update straight away), **Record a subscription payment** (amount in PKR, method, number of periods, reference; this extends the subscription).

### 9.4 Packages (`/packages`)
Create or edit a package: name, price (PKR), billed monthly or yearly, short description, feature toggles (with automatic dependency handling; some features are "core"), limits (locations, floors per location, members; empty = unlimited), active. Each package shows its tenant count.

### 9.5 Payments (`/payments`)
Every subscription payment from every tenant (tenant, package, amount, method, period covered, date).

---

## 10. 3D floor view, floor plan editor and plan import

### 10.1 The 3D floor view (`SpaceBoard` → `SpaceViewer` → `Scene`)
- Shown only when the package has `floor_3d` **and** the browser supports WebGL (`use3d()`). Otherwise the list view is the only view.
- The 3D / List choice is remembered in `localStorage`.
- Every floor is stacked; units are metres. Spaces with a stored position are drawn there. **Spaces never placed are laid out automatically and deterministically**: a service core and rooms in a band along the back wall with shared partitions, then open-plan desks in pods of four.
- Every room style, desk, office, storage unit and object has its own procedural 3D model (`shapes.tsx`, `shapesExtra.tsx`): tables, chairs, sofas, people at desks, glass panes with doors, walls with door and window openings, washrooms, and more.
- **Status colours** (`TONE_COLOR`): ok/free `#0f7b5f` green, busy `#b8381a` brick red, hold/out of service `#e0ae0f` amber with hazard hatching, mine `#2a55c7` blue, idle/closed `#8a99ab` grey. Colour is never the only signal: an outline means free, solid means taken, blue means yours, hatching means out of service.
- Floating labels (DOM overlay) follow the 3D positions and stagger so they do not cover each other.
- The heat map overlay colours spaces by utilization.
- The scene renders on demand to save battery and respects `prefers-reduced-motion`.
- **Login page showcase**: a slowly turning sample building with a 4.2-second tour of tags (`TOUR`). It stays still for reduced motion.

**Space status logic** (`lib/spaceState.ts`):
- Rooms: not available → hold; before opening → "Opens at HH:MM"; after closing → "Closed for the day"; a current booking → "In use until…" or "Yours until…"; otherwise "Free until HH:MM" or "Free all day".
- Hot desks: a booking (all day or until a time), or a checked-in person sitting there ("You are here" / "In use"), else free.
- Assigned kinds: "Vacant", or "Assigned" / "Let" (offices) with the company or name.

### 10.2 Floor plan editor (`FloorPlanEditor.tsx`, needs `spaces` + `floor_3d`)
A full 3D editor that works on a **draft**. Nothing is saved until **Save**, which sends one `PUT /floor-plan` request with the difference.
- **Palette** grouped by category (every room and desk style, every object), with a search box ("Find something to add"). Arm an item, then click the floor to place it (a ghost follows the pointer).
- **Add many**: one item in a grid (rows × columns), or a pod of four desks, placed at the nearest free spot.
- **Selecting**: click; Shift+click adds or removes; Shift+drag on empty floor draws a box selection. Drag to move, snapped to a **0.5 m grid**. Alignment guides (yellow lines) snap things to their neighbours. The footprint outline is green where it fits and red where it overlaps.
- **Rules**: nothing may overlap (except structure objects); sides from 1 m to 30 m (object-specific limits for walls, doors and so on); at most **250 things** per draft; a save takes up to 200 new spaces and 300 new objects.
- **Single-item inspector**: name, seats, style, size in metres (type or step), turn, variant (door type, zone shape), zone tint, label text.
- **Group panel**: duplicate, turn, remove, align (left, centre, right, top, middle, bottom, spread across, spread down), save as template, clear selection.
- **Templates**: saved arrangements shared across the organization (`GET/POST/DELETE /floor-plan/templates`). Apply one to the current floor.
- **Floors**: a floor switcher; add a floor (respects the package limit).
- **Tools**: Select or **Measure** (click two points to read the distance in metres).
- **Undo / Redo** with full history.
- **Print plan**: the floor drawn flat with names and a scale, to print or save as PDF.
- **Discard changes?** confirmation when leaving with unsaved edits.
- **Plan picture underlay** with an opacity slider and a remove button.
- **Keyboard shortcuts**:

| Keys | Action |
|---|---|
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y | Redo |
| Ctrl/Cmd+A | Select all on the floor |
| Ctrl/Cmd+D | Duplicate |
| Ctrl/Cmd+C / V | Copy / paste |
| Esc | Disarm, clear selection, leave measure |
| R | Turn a quarter |
| M | Toggle the measure tool |
| Delete / Backspace | Remove |
| Arrow keys | Nudge by 0.5 m |

### 10.3 Floor plan import (`PlanImport.tsx`, feature `plan_import`)
Turns an uploaded architectural plan into rooms, desks and amenities on a floor. **It runs entirely in the browser; the file never leaves the page.**
1. **File** (`lib/planFile.ts`): PDF, PNG, JPEG or WebP, up to 25 MB. A PDF is rendered with pdf.js (it picks the page most likely to be the floor plan from its text, and its text layer is kept). The picture is downscaled (PNG, falling back to JPEG under 5 MB).
2. **Detect** (`planVision/detect.ts`): dark pixels are ink; long straight runs are walls; gaps the width of a doorway are bridged; the wall centre lines cut the picture into cells; cells are joined unless a wall separates them; the joined sets are regions; the sheet border and title block are ignored. It does not handle angled walls.
3. **OCR** (`planVision/ocr.ts`, only if the picture has no text layer): Tesseract with the bundled English data reads room names and printed sizes.
4. **Interpret** (`planVision/interpret.ts`): finds the building outline; the scale comes from printed dimensions (such as `10'-0"x12'-0"`, `3.6 x 4.2 m`, `3600x4200`) or is estimated; rooms are named from text, or judged by size and contents; desk blocks and amenities are detected. Every decision has a **reason**, and the owner can override the type of any item (or skip it).
5. **Review screen**: the plan with a box drawn on each found item; adjust the building edges and the real width in metres; choose to keep what is on the floor and add beside it, or replace it; choose whether desks become hot desks or dedicated desks.
6. **Place** (`importLayout.ts`): everything snaps to the grid. Things that collide shrink inward by up to two grid steps; anything that still does not fit is **left out and counted**, never placed wrongly. Names are made unique ("Room 1" becomes "Room 2"). Optionally just trace: put the picture under the floor without adding anything.

The reading is stored as fractions of the picture (`PlanReading` / `Frac`), so changing the scale never needs another read.

---

## 11. Pricing and billing rules

The server calculates every price (`POST /bookings/quote` and on save). **Backend §8.2 is the reference for booking prices and backend §9 for invoices and reports.** The rules below are the same rules, in short.

**Booking prices (server)**
- Rate-card pricing (day rate, half-day, full-day, peak and off-peak, no-plan rate) **was removed on the server**. Only the hourly rate and shift prices remain. `dailyRateCents` is no longer used.
- A hot desk on a plan that includes hot desks: free (basis `plan`).
- Otherwise a matching shift with a price: that price in full (basis `shift`). It never uses free minutes.
- Otherwise hourly: `round(hourly rate × billable minutes / 60)` (basis `hourly`). A whole-day hot desk is the hourly rate times the business-day minutes.
- For meeting rooms (`room`) only, the free monthly allowance is the plan's `includedMeetingMinutes` plus `meetingCredits × 30` (so **2 credit hours = 1 free hour**), less what was already used this month (basis `minutes`). Corporate rooms never use free minutes.
- Only spaces with an hourly rate above zero can be booked or requested.

**How the frontend explains the basis** (`basisNote` in `BookingModal.tsx`)
- `plan`: "Included in the member's/your plan"
- `minutes`: "N min covered by included meeting minutes, the rest charged by the hour" (or fully covered)
- `shift`: "{Name} shift price (set in Shift templates)"
- `hourly`: "Rs X an hour (set on the space)"
- The frontend still has texts for `daily`, `dayshare` and `rates`, left from rate-card pricing. The server no longer returns them (see §16).

**Plans, money and invoices (server)**
- **Plan price** = the sum of the shifts the member picked, per month (monthly plan) or per day (day pass). Starting or renewing a plan period bills one plan invoice at once, with one line per priced shift, minus any unused advance (backend §8.4).
- **Advance**: income when received; then taken off plan invoices as a negative "Advance paid" line until used up. Voiding gives the used part back (backend §8.10).
- **Security deposit**: held, not income. When settled, the amount returned is a refund and the amount kept becomes income (`kept_deposit`).
- **Amenities**: free up to the daily allowance; beyond that the price is owed. It becomes income when collected at the desk, or goes on an invoice.
- **Monthly invoice generation**: see backend §9.2. It is idempotent per member per month. Company contracts are billed to their current contact.
- **Invoices with payments cannot be voided.** Voiding makes their bookings (and amenity orders) billable again.
- **Invoiced bookings cannot be cancelled.**
- **Tax** = `round(subtotal × taxRateBps / 10000)`, once per invoice.
- **Payments** cannot exceed the balance or go on a void or paid invoice. The server checks this; the frontend also checks the balance it loaded.
- **Company contracts**: per member (with an extra-person price for people beyond the shared seats) or a fixed price. Part months are prorated by calendar day, per line. Employee bookings go on the company invoice.
- **Platform subscriptions** are in PKR, monthly or yearly; recording a payment extends `periodEnd` by N periods. Trials last 14 days.

---

## 12. Complete API endpoint reference

Base: `/api`. Most staff endpoints take `locationId` as a query parameter or in the body.

### Auth and session
| Method | Path | Purpose |
|---|---|---|
| GET | `/auth/me` | Session `{ user, org, locations }`; 401 when signed out |
| POST | `/auth/login` | `{ email, password }` → session |
| POST | `/auth/logout` | |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` |
| GET | `/me/summary` | The member's home summary |

### Locations, floors, holidays
| Method | Path | Purpose |
|---|---|---|
| POST | `/locations` | Create a location |
| PATCH | `/locations/:id` | Update a location |
| GET/POST | `/locations/:id/holidays` | List (`from`, `to`) / add `{ date, name }` |
| DELETE | `/locations/:id/holidays/:hid` | Remove |
| GET | `/floors?locationId` | `{ floors, limit }` |
| POST | `/floors` | `{ locationId, names[] }` |
| DELETE | `/floors?locationId&name` | Remove an empty floor |

### Spaces and floor plan
| Method | Path | Purpose |
|---|---|---|
| GET | `/resources?locationId` | All spaces with live occupancy |
| GET | `/resources/:id` | One space (scan page) |
| POST | `/resources` | Create |
| PATCH | `/resources/:id` | Update |
| POST | `/resources/:id/photos` | Upload a photo (raw image body) |
| DELETE | `/resources/:id/photos/:pid` | Remove a photo |
| GET | `/resources/photos/:pid/file` | Photo image |
| GET | `/floor-plan/objects?locationId` | Floor objects |
| PUT | `/floor-plan` | Save the editor draft diff |
| GET/POST | `/floor-plan/templates` | Saved arrangements |
| DELETE | `/floor-plan/templates/:id` | |
| GET/POST | `/assignments` | List / assign `{ resourceId, memberId, startDate, endDate }` |
| PATCH | `/assignments/:id` | e.g. `{ endDate }` |

### Bookings and requests
| Method | Path | Purpose |
|---|---|---|
| GET | `/bookings/schedule?locationId&date` | A day's schedule (resources, bookings, inUse, closed) |
| GET | `/bookings` | `locationId, from, to, memberId, status, limit` |
| POST | `/bookings` | `{ resourceId, memberId?, date, startTime?, endTime?, notes }` |
| POST | `/bookings/quote` | Same shape → `{ priceCents, billableMinutes, basis }` |
| PATCH | `/bookings/:id` | `{ status: 'completed' \| 'no_show' }` |
| POST | `/bookings/:id/cancel` | |
| GET | `/requests` | `locationId, status` (members get their own) |
| GET | `/requests/queue` | `resourceId, date, startTime, endTime` → `{ ahead }` |
| POST | `/requests` | Member asks for a room |
| POST | `/requests/:id/approve` \| `/reject` `{ reason }` \| `/cancel` | |

### Members, plans, shifts, amenities
| Method | Path | Purpose |
|---|---|---|
| GET | `/members?locationId` | List |
| GET | `/members/:id` | Detail |
| POST | `/members` | Create (plan, shiftIds, deskIds, money, amenities, meetingCredits) → includes `tempPassword` |
| PATCH | `/members/:id` | Update details, amenities, credits |
| PUT | `/members/:id/plan` | `{ planId, shiftIds, deskIds }` |
| POST | `/members/:id/money` | `{ advanceCents?, depositCents?, method, reference }` |
| POST | `/members/:id/deposit` | `{ action: 'refund', returnedCents, method, reference }` or `{ action: 'forfeit' }` |
| POST | `/members/:id/renew` | → `{ start, end }` |
| POST | `/members/:id/reset-password` | → `{ tempPassword }` |
| DELETE | `/members/:id` | |
| GET | `/members/available-spaces` | `locationId, planId, shiftIds, startDate, memberId?` → `{ end, spaces }` |
| GET/POST | `/plans` | |
| PATCH/DELETE | `/plans/:id` | |
| GET/POST | `/shifts` | GET takes `locationId`, `memberId?` |
| PATCH/DELETE | `/shifts/:id` | |
| GET/POST | `/amenities` | |
| PATCH/DELETE | `/amenities/:id` | |
| POST | `/amenities/orders` | `{ memberId, amenityId, quantity }` → `{ name, quantity, freeQuantity, chargeCents }` |
| POST | `/amenities/collect` | `{ memberId }` |

### Front desk
| Method | Path | Purpose |
|---|---|---|
| GET | `/attendance?locationId&open=1` | Who is in the building |
| POST | `/attendance/check-in` | Staff `{ memberId }`; member `{}` or `{ resourceId }` (QR) |
| POST | `/attendance/:id/check-out` | |
| GET | `/attendance/staff?locationId&date` | Team clock-ins |
| GET | `/visitors` | `locationId, date, status` |
| POST | `/visitors` | Staff: `{ hostMemberId, …, checkInNow, expectedDate, expectedTime }`; member: `{ name, …, expectedDate, expectedTime }` |
| POST | `/visitors/:id/check-in` \| `/check-out` \| `/cancel` | |

### Contracts
| Method | Path | Purpose |
|---|---|---|
| GET | `/contracts?locationId` | |
| POST | `/contracts` | Legacy single-member contract |
| PATCH | `/contracts/:id` | Legacy edit |
| POST | `/contracts/company` | Company contract with people and spaces |
| PATCH | `/contracts/:id/company` | Company details and prices |
| POST | `/contracts/quote` | Monthly total and lines |
| GET | `/contracts/available-spaces` | `locationId, startDate, endDate` |
| POST | `/contracts/:id/activate` \| `/end` \| `/cancel` \| `/extend` `{ endDate }` | |
| POST | `/contracts/:id/advance` | `{ method, reference }` |
| POST | `/contracts/:id/deposit` | `{ action: 'receive' \| 'refund' \| 'forfeit', … }` |
| GET | `/contracts/:id/deposit-entries` | |
| POST | `/contracts/:id/people` | Add a person |
| POST | `/contracts/:id/people/:pid/leave` | |

### Finance
| Method | Path | Purpose |
|---|---|---|
| GET | `/invoices` | `locationId, status, q, memberId` |
| GET | `/invoices/:id` | Detail |
| POST | `/invoices` | Manual `{ memberId, issueDate, dueDate, notes, items[] }` |
| POST | `/invoices/generate` | `{ locationId, month, dueInDays }` → `{ created, skipped }` |
| POST | `/invoices/:id/void` | |
| POST | `/invoices/:id/payments` | `{ amountCents, method, reference, notes }` (the server also accepts `paidAt`; the frontend does not send it) |
| GET | `/payments` | `locationId, from, to, method` |
| DELETE | `/payments/:id` | |
| GET/POST | `/expenses` | `locationId, from, to, category` |
| PATCH/DELETE | `/expenses/:id` | |
| GET | `/reports/dashboard?locationId` | `finance` only for `reports` permission + `invoicing` feature |
| GET | `/reports/finance?locationId&from&to` | Feature `reports` + permission `reports`; see backend §9.3 |
| GET | `/reports/occupancy?locationId&days` | |

Money-related server endpoints this frontend **does not call yet** (listed in backend §7): `PUT /resources/pricing` (the hourly price list, `plans`), `POST /amenities/invoice` (put owed amenities on an invoice now), `GET /amenities/orders`, the amenity request endpoints (`/amenities/requests…`), and `GET /attendance/overstaying`.

### Maintenance and announcements
| Method | Path | Purpose |
|---|---|---|
| GET | `/issues` | `locationId, resourceId` |
| GET | `/issues/open/by-space?locationId` | Open counts by space (sidebar badge) |
| POST | `/issues` | `{ resourceId, title, description, priority }` |
| PATCH | `/issues/:id` | Status or resolution |
| POST | `/issues/:id/task` | Add to the schedule |
| GET/POST | `/tasks` | |
| PATCH/DELETE | `/tasks/:id` | |
| POST | `/tasks/:id/done` | |
| GET | `/tasks/:id/logs` | |
| GET/POST | `/assets` | `locationId, resourceId, status` |
| PATCH/DELETE | `/assets/:id` | |
| GET/POST | `/announcements` | |
| PATCH/DELETE | `/announcements/:id` | |

### Team and devices
| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/staff` | |
| PATCH | `/staff/:id` | Details, permissions, locations, active, `{ resetPassword: true }` |
| GET | `/staff/permissions` | Permission definitions |
| GET/POST | `/devices` | |
| PATCH | `/devices/:id` | `{ name, active }` |
| POST | `/devices/:id/sync` | → `{ sent, removed }` |
| GET/POST | `/devices/:id/commands` | `{ kind: 'reboot' \| 'upload_punches', from, to }` |
| GET | `/devices/:id/punches` | `date, result` |
| GET | `/devices/:id/people` | |
| PUT | `/devices/pins/:userId` | `{ pin }` (`null` removes them from devices) |

### Platform (super admin)
| Method | Path | Purpose |
|---|---|---|
| GET | `/platform/overview` | |
| GET | `/platform/features` | `{ features, core }` |
| GET/POST | `/platform/packages` | |
| PATCH | `/platform/packages/:id` | |
| GET/POST | `/platform/organizations` | Register → owner `tempPassword` |
| GET/PATCH | `/platform/organizations/:id` | Details, `packageId`, `status` |
| POST | `/platform/organizations/:id/payments` | `{ amountCents, method, periods, reference }` |
| POST | `/platform/organizations/:id/reset-owner-password` | |
| GET | `/platform/payments` | |

---

## 13. Shared UI, formatting and helpers

### UI kit (`components/ui.tsx`)
`Button` (variants primary / secondary / ghost / danger, `small`), `buttonClass()`, `Field` (label and hint), `Input`, `Select`, `Textarea`, `Modal` (`wide`, `xwide`), `PageHeader` (title, sub, action children), `Section` (title, aside), `Empty` (title, hint, action), `Loading`, `ErrorNote` (optional `onRetry` and `retrying` show a **Try again** button), `ConfirmButton` (asks in place: the question, **Keep** and a Yes button; use it instead of `window.confirm`), `Chip` (tones ok / busy / hold / mine / idle), `Ledger` (label–value rows with tone and note), `Segmented`, `Tabs`, `Avatar`, `initials`.

Other shared components: `toast` (`useToast().ok/.error`), `MemberSelect` (+ `useMembers`), `CredentialsModal`, `CountText` (animated count-up), `Bars` / `CountBars`, `MoneyChart` (SVG), `StatusMark` (accessible status shapes), `Plaque` / `DeskTile`, `Plate` (yellow location code sign), `GlassFX` (animated blueprint backdrop that lights up under the pointer).

### Formatting (`lib/format.ts`)
- `money(cents, currency)`: whole amounts show no decimals ("Rs 1,500"); otherwise two. PKR uses the `en-PK` locale (western grouping, "Rs 39,100,812"), everything else `en-US`. An amount that rounds to zero never shows a sign ("Rs 0", never "-Rs 0"; `signDisplay: 'negative'`). Real negatives keep it ("-Rs 1,500").
- `moneyWhole` for big figures (rounded to whole units, same sign rule). Whether summary pages should show whole rupees or paisa is an open decision.
- `toCents(text)`: user-typed money to integer cents, worked out in whole numbers (no floating point). It accepts "12", "12.5", "12.", "1,200.00" and spaces, plus full-width, Arabic-Indic and Urdu digits and separators (`plainDigits`). It returns `null` for anything else, for more than two decimals, for negatives, and above `MAX_MAJOR_UNITS` (100,000,000 whole units).
- `fromCents(cents)`: "1500.50" text, for form fields.
- CSV:
  - `csvCell` prefixes any string starting with `= + - @`, tab or carriage return with `'`, and escapes quotes, commas and newlines.
  - `csvAmount(cents)` gives a number for amount cells.
  - `toCsv(rows)` adds the BOM and CRLF.
  - `downloadCsv(filename, rows)` saves it.
- `KIND_LABEL`, `METHOD_LABEL`, `titleCase`, `plural`.

### Finance helpers
- `lib/access.ts`: `AREAS`, `allowed`, `canUse`, `anyFinance`, `financeHome`, `dashboardMoney`, `overviewSections` (§4.3).
- `lib/financePeriod.ts`: `PERIODS`, `DEFAULT_PERIOD` ('6'), `PERIOD_WORD`, `parsePeriod`, `periodRange`, `withPeriod`, `keepWithinLocation` (§7.10).
- `lib/profitLoss.ts`: `toneOf`, `marginOf`, `marginText`, `marginNote`, `fitToMonths`, `buildProfitLoss` (§7.10).
- `lib/queries.ts`: `FINANCE_KEYS` (§7.10).
- `lib/useDebounced.ts`: `useDebounced(value, ms)`.

### Time (`lib/time.ts`)
Time-zone-aware: `todayIn(tz)`, `addDays`, `addMonths`, `toMinutes` / `fromMinutes`, `fmtTime(iso, tz)`, `localDateOf`, `minutesOfDay`, `fmtDay` ("Wed 21 Oct"), `fmtDate` ("21 Oct 2026"), `fmtLongDay` ("Wednesday 21 October"), `fmtMonth`, `fmtDateTime`, `fmtDuration`, `daysBetween`, `zonedToUtc(date, time, tz)`.

### Plan periods (`lib/planPeriod.ts`)
`planPeriodState(planEnd, today)` → `'ended' | 'soon'` (2 days or less) or `null`; `planPeriodWords` → "has ended / ends today / ends tomorrow / ends in N days".

---

## 14. Design system

- **Brand**: ink navy `#14263F` (theme colour, sidebar) and signal yellow `#F6C324` (the location "plate", active nav marker, badges). The favicon is a navy square with a yellow square inside.
- **Status tones**: ok green `#0f7b5f`, busy brick `#b8381a`, hold amber, mine blue `#2a55c7`, idle grey. Each has a "wash" background.
- **Surfaces**: translucent frosted glass panels (`plaster`, `mist`, `paper`) over an animated steel-blue backdrop with a blueprint grid.
- **Type**: Archivo (display, `.display`, `.display-sm`), Public Sans (body); base size 15px; `.num` for tabular numbers.
- **Utility classes**: `.surface`, `.surface-table`, `.tbl` (tables, `.r` = right aligned), `.no-print`, `.on-ink`, `.page-enter`, `.flip`, `.hatch`.
- **Accessibility**: aria labels throughout, `sr-only` headers, colour is never the only signal, `prefers-reduced-motion` respected, keyboard shortcuts in the editor.
- **Writing style for UI text**: plain, friendly British English full sentences ("Nobody has checked in yet.", "Settle at the end of the plan"). Avoid jargon. **Keep this voice in new UI.**

---

## 15. Conventions and gotchas for agents

1. **Money is integer cents everywhere.** Parse input with `toCents` and display with `money`/`moneyWhole`. Never use floats for money.
2. **Always use the location's time zone** (`loc.timezone`) for dates and times. Use `todayIn(tz)`, never `new Date()` alone for "today".
3. **Gate new pages and buttons with all relevant layers**: role, permission (`can`), feature (`useFeature`). For money, use `canUse` / `useCanUse` from `lib/access.ts`, which checks permission and feature together. Add route guards in `App.tsx`, hide the sidebar link in `Layout.tsx`, and never show a link that leads to a "No access" page.
4. **Invalidate caches after mutations** with `useRefresh()('key1', 'key2')`. Any mutation that moves money or changes what is owed must refresh `...FINANCE_KEYS` (a test enforces it). For others, look at similar mutations (for example bookings → `'schedule', 'bookings', 'dashboard', 'summary'`).
5. **The server is authoritative** for prices, availability, check-in rules, limits and permissions. The frontend shows quotes and server error messages and does not reimplement rules (except `closedReason`, which mirrors the server).
6. **`useLocation` is from `auth.tsx`**, not react-router. The router's hook is imported as `useLocation as useRoute`.
7. **Weekdays**: 0 = Sunday (server convention). The UI shows Monday first.
8. **The 3D view and editor are lazy-loaded and need WebGL plus the `floor_3d` feature.** Always keep the list fallback working.
9. **Members request rooms; staff book them.** Do not give members a direct room booking flow.
10. **Temporary passwords are shown once** (`CredentialsModal`). There is no email flow; staff share them.
11. **Demo accounts** appear on the login page in dev only (`import.meta.env.DEV`), all with password `coplaces123`: `admin@coplaces.test` (platform), `owner@nest.test` (Pro), `manager@nest.test`, `frontdesk@nest.test`, `hamza.sheikh@example.pk` (member), `owner@hive.test` (Growth), `owner@workbay.test` (Starter, trial).
12. **Legacy redirects** exist (`/shifts` → `/plans`, `/money/*` → `/finance`). Do not remove them.
13. **Legacy data shapes**: shifts without `planId`, shifts with `resourceId`/`kind` instead of `spaceIds`, single-member contracts. Handle them when touching those areas.
14. **Tests**: Vitest, 15 files and 206 tests. They cover the editor model, import layout, plan vision, permissions, money formatting and `toCents`, CSV safety, time-zone dates, the money-area access rules, the finance refresh guard, the finance period and placeholder behaviour, profit and loss maths, the debounce hook, and `ConfirmButton` / `ErrorNote`. Component and hook tests start with `// @vitest-environment jsdom` and use Testing Library; plain helpers run in Node. Run `npm test` and `npm run typecheck` before finishing changes. `npm run build` rewrites the committed `dist/` folder; do not commit that unless asked.
15. **Never ship secrets.** `.env` holds only `API_URL`. Production routing is in `vercel.json`.
16. **Printing** uses `window.print()` or a pop-up window (QR sheet, contract print). Mark the app chrome `.no-print`.
17. **Confirmations**: destructive actions use inline "Keep / Yes, …" confirmations (`ConfirmButton`). Finance no longer uses `window.confirm`. Seven non-finance places still do (floor plan templates, suspending a tenant, announcements, two on devices, two in maintenance).
18. **Money dates**: show an instant's date with `localDateOf(iso, loc.timezone)`, never `iso.slice(0, 10)` (that is the UTC date, a day early for anything between midnight and 05:00 in Karachi).

---

## 16. Known finance issues (waiting on backend)

From the Stage 0 audit (2026-11-02), still open after the frontend fixes. Where the backend file lists the same problem, its number (H1–H6 in backend §9.4) is given. Neither file should describe these as correct.

**Server calculations (backend §9.4)**
- H1: a company contract's advance is counted as income but never taken off its invoices.
- H2: a single-member contract's rent is never invoiced.
- H3: members on legacy plans (no plan period) never have their advance used.
- H4: company invoices can be generated twice for one month if the contact changes.
- H5: payments and expenses are hard-deleted and `paidAt` and invoice dates accept any date, so past months can change without a trace.
- H6: changing plan after paying can double-bill, and the billing runs outside the booking transaction.

**Figures that may not agree across screens**
- "Collected" on Today and "Money in" on the overview include advances, kept deposits and desk amenity collections. The Payments page total and "How members paid" include invoice payments only. This is by design, but nothing on screen says so yet.
- The overview chart says "The profit and loss table has the same figures", but the chart reads `monthly` while the table reads `profitLoss`; nothing checks that they match.
- "Still owed", the aging table and deposits held are **as of now**, while the figures around them are for the chosen period.
- The `advance` income kind includes member advances, but the frontend labels it "Advance rent from contracts".
- Collected includes sales tax and there is no tax report.

**Totals worked out in the browser**
- The Payments total, the Expenses total and the member Invoices header ("Rs X due") are summed from the rows the server returned. They need server totals and pagination; the member Home banner already uses the server's `balanceDueCents`.
- The new-invoice tax preview is computed in the browser (the server rounds the same way today, once per invoice, but the server's total is what counts). A `POST /invoices/preview` would remove it.

**Frontend behind the backend**
- The space form still edits rate-card prices (day, half-day, full-day, peak, off-peak, no-plan) that the server no longer uses. The booking dialog still has texts for the `daily`, `dayshare` and `rates` price bases. The server's hourly price list (`PUT /resources/pricing`) has no screen yet.
- No screen for `POST /amenities/invoice`, amenity requests, or overstaying members.
- Payments are dated when they are entered; the server accepts `paidAt`, but there is no field for it (and back-dating is undecided, see H5).
- On Today, the frontend shows the month figures to the invoices *or* reports area, while the server only sends them for reports plus invoicing. The effect is the same, but the frontend rule should match the server's exactly.

**Decisions still pending**
- Whole rupees or paisa on summary pages.
- Currencies with 0 or 3 decimals.
- Compact numbers in lakh/crore or millions.
- Who may see member names with amounts owed and the deposits section.
- How "This month" compares with the previous period.

**Backend requests**
- The endpoint list from the Stage 0 audit is still to be built: summary, time series, invoices by status, aging with drill-down, debtors, revenue breakdowns, deposits, amenities, a cash ledger, paginated lists with totals, and server-side exports.

---

## 17. Glossary

| Term | Meaning |
|---|---|
| **Organization / Tenant / Coworking space** (platform) | One business subscribed to Coplaces |
| **Location** | One physical site of an organization |
| **Plate** | The yellow square sign showing the location code |
| **Space / Resource** | A room, desk, office or storage unit |
| **Floor object** | A non-bookable thing on the plan (kitchen, wall, door…) |
| **Plan** | A membership product (monthly or day pass) |
| **Shift** | A named time slot inside a plan with its own price |
| **Assignment** | A dedicated desk, office or storage unit held by a member for a period |
| **Room request** | A member's ask for a room, approved or rejected by staff |
| **Advance** | Prepaid money taken off future invoices (income) |
| **Security deposit** | Money held and returned or kept at the end (not income until kept) |
| **Meeting credits** | Free meeting room time; 2 credits = 1 hour |
| **Amenity** | Tea, coffee or food with a daily free allowance |
| **MRR** | Monthly recurring revenue (plan fees from active members, or platform subscriptions) |
| **Package** | What a tenant subscribes to: features + limits + price |
| **Feature** | A package capability (visitors, 3D, invoicing…) |
| **Permission** | What a staff member is allowed to do |
| **ADMS** | The push protocol ZKTeco fingerprint devices use to send punches |
| **Punch** | One fingerprint scan on a device |
| **PIN** | A person's number on the attendance devices |
| **Heat map** | The 3D view coloured by utilization |
| **Underlay** | A floor plan picture drawn under the editor floor for tracing |
