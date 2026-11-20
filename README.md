# skinvue-booking

Dermatologist referral and clinic booking app. Visitors search for clinics, view details and hours, and send an appointment request. Staff review requests and edit clinic details in the admin pages.

This app was split out of the skinvue AI skin-screening app and has no connection to it. It is a static React single-page app with no server of its own. All data comes from a [Supabase](https://supabase.com) project.

## Pages

| Route | Page |
|---|---|
| `/` | Dermatologist referral (home): search, clinic details, request an appointment |
| `/contact` | Contact form |
| `/admin` | Admin dashboard |
| `/admin/requests` | Appointment requests |
| `/admin/clinics` | Clinic and hours editor, referral analytics |

`/dermatologist-referral` redirects to `/`. Unknown URLs redirect to `/`.

## Stack

- React 18, React Router 6, Vite 5
- Plain CSS per component, with shared tokens in `src/components/css/theme.css`
- Vitest for unit tests
- Supabase (Postgres functions called over REST)

## Getting started

Requires Node.js 18 or later.

```bash
npm install
cp .env.example .env   # then fill in the two values below
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the unit tests (`clinicHours`, `hoursEditor`) |

## Environment variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | The Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The Supabase publishable (anon) key |

Only the publishable key belongs in this app. It is safe in the browser because the database tables are locked and the key can only run the API functions. Never put a secret or `service_role` key here. `.env` is git-ignored.

## How it talks to Supabase

`src/lib/supabase.js` is a small client that calls Postgres functions as `POST {VITE_SUPABASE_URL}/rest/v1/rpc/<function>`. The functions, tables and migrations live in the separate `wss-clinic-referrals` repo, not here.

- **Public functions:** `search_places`, `nearby_places`, `get_place`, `track_referral_interaction`, `submit_booking_request`, `admin_check`.
- **Admin functions:** every `admin_*` function takes the admin key as `p_admin_key`.

Appointment requests are stored in Supabase. The Microsoft Teams notification is sent by a database trigger there, so nothing for it lives in this app.

## Admin access

The admin pages are protected by a single shared admin key, not by user accounts.

1. Open any `/admin` page and enter the key.
2. The app checks it with `admin_check` and keeps it in `sessionStorage` for the browser session.
3. The key is sent with each admin call and checked against a hash in the database.

The key is set in the Supabase SQL editor with `select private.set_admin_key('<key>')`. It must be at least 12 characters. See the `wss-clinic-referrals` repo for details.

## Project structure

```
src/
  App.jsx, main.jsx, App.css
  pages/
    DermatologistReferral.jsx   home page
    ContactPage.jsx
    AdminDashboard.jsx, AdminRequests.jsx, AdminClinics.jsx
    css/
  components/
    SiteShell.jsx               header, footer and phone bottom nav
    ClinicDetailsModal.jsx, AppointmentRequestModal.jsx, ContactView.jsx
    Icons.jsx
    admin/                      AdminShell (key gate), PlaceEditor
    css/                        theme.css, SiteShell.css, ContactView.css
  hooks/                        useBookingRequests, useMediaQuery
  lib/                          supabase, bookingApi, placeAdminApi
  utils/                        clinicHours, hoursEditor, referralTracking
```

## Known leftovers from the split

- The page title, description and `manifest.json` name still say "AI Skin Screening".
- `src/utils/referralTracking.js` still creates a screening id and sends `source: 'ai_screening_results'` to Supabase. The database column default also uses that value.

## Deploy (Vercel)

The app builds to static files in `dist/` (`npm run build`); Vercel detects Vite on its own.

- **Environment variables** (Project Settings, for Production, Preview and Development): `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. They are read at **build time**, so after changing one, redeploy. Only the publishable key belongs here. Never the secret or `service_role` key, and never the admin key (that is typed in the browser).
- **`vercel.json`** sends every path that is not a real file to `index.html`, so a refresh or a shared link on `/admin`, `/contact` and the other client-side routes works.
- **Test phase only:** `vercel.json` also adds an `X-Robots-Tag: noindex, nofollow` header so the test site stays out of search engines. Remove that header before a real launch.
- Give testers the **Production** URL (from `main`). Preview deployments from other branches are behind Vercel's login by default.
- The clinic data is Texas-only, so visitors elsewhere see "We don't have clinics near … yet" until they search a Texas city or ZIP.
