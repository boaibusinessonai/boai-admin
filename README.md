# BOAI Admin

BOAI's own super-admin website: the dashboard, Customer 360, the leads and
support inbox, and the audit log. It is a separate website from the customer
app (`business-growth-portal`) and is never linked from it.

- **Stack:** React, Vite, TypeScript, Bun, supabase-js (same as the customer app).
- **Data:** the same Supabase project. The portal calls the functions in the
  database's `admin` schema (`apps/api/sql/30_admin.sql`; tables in migration
  `065_admin.sql`). Each one checks, in the database, that the caller is an
  active admin (table `admin_users`), signed in with Google, in a session under 12 hours old and used in the last 30 minutes.
  Anyone else gets "not found".
- **Audit log:** every action and every look at a customer's data is written to
  `admin_audit`. It is append-only, and each entry's hash covers the one before
  ("Check the chain" on the Audit log page). The latest hash goes to your phone
  every day.
- **Alerts:** admin sign-ins, sign-in attempts by anyone not on the list, and the
  daily check go to Telegram (Edge Function `admin-alert`).
- **Releases on PROD** (the control tower): three tabs. Control tower (code moves), Sync settings (copy Admin
  settings from any stage to any other: Edge Function `release-settings`, rules in `src/lib/syncSettings.ts`; into PROD
  keeps a backup with one Undo) and History. Lower Admins show their own move and History, no Sync settings.

A stage can get the newest Admin before its App part (an Admin-only move). An admin function that then calls an app
function, table or schema the App move brings answers "… does not exist"; `admin()` (src/lib/supabase.ts, `waitsForApp`)
turns it into the plain line "This part arrives with the next App move to this stage." on every page (the raw text goes to
the browser console).

## Roles

| Can do | owner | finance | support |
|---|---|---|---|
| Dashboard, customers, Customer 360, leads, notes, search | ✓ | ✓ | ✓ |
| Features tab: switch a feature for one store | ✓ | – | ✓ |
| Audit log, check the chain | ✓ | – | – |
| AI free taste: per AI pack on / off, free rows, day (`admin.ml_free`, `admin.ml_free_save`) | ✓ | ✓ | – |
| Admins page: add, change role, remove (finance and support only) | ✓ | – | – |

Owners are added only by SQL (`apps/api/scripts/admin-setup.sql`), so nobody can
lock the owners out. Each change on the Admins page needs a written reason; it goes in the audit log and sends an alert.
Removing someone takes effect on their next click.

Changes (plan, credit, refunds, pause) come in the next phase: owner and finance,
with a written reason.

## Set up (once per Supabase project, UAT first)

1. **Database:** in `apps/api`, `bun run export-sql --from 022`, then paste
   `out/update.sql` into the SQL Editor (it adds migration 065 and the admin functions).
2. **Expose the `admin` schema:** Project Settings → Data API (API settings) →
   Exposed schemas → add `admin` (keep `api`) → Save.
4. **Redirect URL:** Authentication → URL Configuration → Redirect URLs → add the
   admin site's address (`https://boai-dev-admin.web.app/**` for UAT,
   `http://localhost:5174/**` for local use).
5. **You as admin, and alerts:** run `apps/api/scripts/admin-setup.sql` with your
   admin Google email typed in the editor (never saved in the repo).
6. **Telegram alerts:** follow `supabase/functions/admin-alert/README.md`.
7. **Hosting** (Firebase project `boai-dev`), once:
   `firebase hosting:sites:create boai-dev-admin` and
   `firebase hosting:sites:create boai-admin`.
   (If a name is taken, pick another and change it in `.firebaserc`.)

## Run and deploy

```sh
bun install
bun run dev                    # http://localhost:5174, uses .env (copy .env.example)
bun run build:uat && firebase deploy --only hosting:admin-uat
bun run build && firebase deploy --only hosting:admin-prod
```

`firebase.json` sets a strict Content-Security-Policy (only this site and its
Supabase project), `X-Robots-Tag: noindex`, no framing, and no caching of the
page. `public/robots.txt` disallows everything. There are no third-party scripts,
fonts or trackers.

## First sign-in

Open the site → **Sign in with Google** (the account you added).
The sign-in lasts while the tab is open, up to 12 hours, and ends after 30 idle minutes.
