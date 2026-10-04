# bd-food-ordering

Blocks starter app: React 18 + Vite + TypeScript, with a real hosted Blocks IAM login and a project-scoped profile page as the landing page.

Every Blocks API call in this app goes through [`@seliseblocks/client`](https://www.npmjs.com/package/@seliseblocks/client) via a single `createBlocksClient()` instance in `src/lib/blocks/client.ts` — there is no hand-written `fetch()` wrapper for Blocks endpoints anywhere in this app. Each SDK module is exercised in context rather than in one dedicated demo panel: `auth` in the hosted login flow, `iam` on the Profile page and user menu, and `localization` in `LocalizationProvider`. Add more pages under `src/features/` as your app needs them.

## Setup

```bash
npm install
npm run dev
```

`.env` already has working defaults for this project — you only need to fill in `VITE_BLOCKS_OIDC_CLIENT_ID` (see below) before login will work.

## Login setup (required)

This app signs users in directly against this project's tenant (no CLI-style account impersonation) through Blocks IAM's hosted IdP controller. Before login will work, register a **public** OIDC client for this app in Blocks IAM with:

- `redirect_uris`: EVERY origin the app is served from, each with `/login/callback` -- your dev origin, and each deployed URL. `blocks release setup` assigns a random-suffixed domain (find it via `blocks release repos list --json`, the `url` field), and until that origin's callback is registered the first login there fails with `redirect_uri_not_registered`; `blocks release deploy --register-callback` registers it for you.
- `client_type`: `public` (no client secret — this is a browser app and cannot keep one; this scaffold never asks for or ships a client secret).
- `tenant_id` used for login: this project's tenant (`VITE_BLOCKS_X_BLOCKS_KEY`).

Then set `VITE_BLOCKS_OIDC_CLIENT_ID` in `.env` to the new client's id. Until then, the login page shows a setup notice instead of failing silently.

## Testing login locally over HTTPS on the real project domain

Blocks SSO sets a **Secure, domain-scoped** session-related cookie as part of the OIDC exchange; browsers refuse to store or send that on plain `http://localhost`. To test the real login flow locally, run the dev server on the project's actual domain over HTTPS instead of `localhost`:

1. Find the app's registered Blocks domain in the Blocks OS project settings, or ask whoever created the project. It must match the OIDC redirect URI's host.
2. Point it at your machine — add to your hosts file (`/etc/hosts`, or `C:\Windows\System32\drivers\etc\hosts` as Administrator): `127.0.0.1  <domain>`.
3. Confirm `.env` has `VITE_BLOCKS_DEV_HOST=<domain>` (generated from `--app-domain`) and `VITE_BLOCKS_DEV_PORT=5173`.
4. Generate a local HTTPS cert for that exact domain: `npm run cert`. Trust it in your OS store to remove the browser warning (command printed by the script), then restart the browser.
5. `npm run dev` -> open `https://<domain>:<port>` (not `localhost`).
6. Register that exact origin's `/login/callback` as a redirect URI on the OIDC client — byte-for-byte, including the port.

`.cert/` is gitignored — each developer generates and trusts their own cert.

## Blocks Release deployment

The scaffold includes `Dockerfile` and `nginx.conf` for Blocks Release. The Release service must pass Docker build arg `ci_build=<environment>` plus the public `VITE_BLOCKS_*` build args documented in the Dockerfile. The generated `package.json` also provides `build:dev`, `build:test`, `build:stg`, `build:iat`, `build:uat`, `build:preprod`, `build:prodshadow`, and `build:prod` scripts for local checks.

During each environment build, `scripts/write-release-env.mjs` writes `dist/env.<environment>` from client-safe Docker build args or local `.env` files. Root `.env` remains gitignored and must not be committed.

## BD Food Ordering

Customer app plus a restaurant operations portal, on Blocks Data.

**Customers** (`/`): browse restaurants, pick a branch, build a cart, check out (cash on delivery, bKash or Nagad selection -- online payment is not connected), and see order history.

**Operations portal** (`/admin`, staff only):

| Tab | What it does |
|---|---|
| Dashboard | Orders, revenue, average order, active orders; orders by branch; channel split; popular items; orders in progress |
| Kitchen | Live board (New / Preparing / Ready / Out for delivery), stage timers with overdue flags, advance and cancel actions, kitchen health |
| Inventory | Stock per branch, low and out alerts, adjust stock, recipes, movement ledger; accepting an order deducts stock |
| Devices | Kiosk fleet health derived from heartbeats (online under 90s, delayed under 5 min, offline after), per-device issues, simulator |
| Channels | Active customers, carts and orders per channel (kiosk, web app, website), live trend, simulator |

Data model (`blocks/data/schemas`): Restaurant, Branch, MenuItem, Order, OrderItem, StaffAssignment, InventoryItem, MenuItemIngredient, StockMovement, Device, PresenceSession. Access levels live in `blocks/data/rules.json` (catalogue reads are public; everything else needs sign-in).

### Demo data (dev only)

The empty states have dev buttons that only ever add records: sample restaurants, demo orders, demo inventory, demo kiosks. The Devices and Channels pages also have simulators that stand in for kiosks and the website, which have no apps yet. Remove all of these before real use.

### Tests

```bash
npm test      # vitest: metrics, kitchen, stock, devices, presence and gateway helpers
npm run lint  # tsc --noEmit
```

The logic files under `src/features/admin/` import only types from the data layer, so they run without the SDK.

### Signed-in walkthrough (e2e)

Scripts in `e2e/` drive a real headless Chrome through the hosted login and exercise the customer flow and every operations tab, reporting console errors, failed API calls and GraphQL errors hidden inside HTTP 200s.

```bash
# test users: one customer, one staff member who will claim restaurant admin
export E2E_CREDS=/path/outside/repo/creds.json   # {"mgr":{"email":"..","password":".."},"cust":{...}}
node e2e/customer-order.mjs
node e2e/ops-dashboard-kitchen-inventory.mjs
node e2e/ops-devices-channels.mjs
```

They need the dev server running and the demo data present. Screenshots go to `e2e/.out/`.

### Known gaps -- read before real use

1. **No server-side branch enforcement.** Branch scoping is done in the portal from the user's `StaffAssignment`. Any signed-in user can still read or change any record through the API. Row-level policies were tried on a scratch schema with two real users and were **not safe to deploy**: with a policy on a Custom-level schema, identical requests returned the correct rows, an empty list or `Unexpected Execution Error` at random (roughly 30/20/45%) and did not settle over six quiet minutes; the policy also never showed as attached to the schema (`readPolicies` stayed empty). A static-value rule (`rightSource` 2 with `staticValue`) did filter correctly when it evaluated. Revisit with the Blocks team before relying on policies; until then treat branch scoping as a UI convenience, not a security boundary.
2. **Anyone can make themselves admin.** The "Continue as restaurant admin" card on `/admin` is a dev bootstrap. Replace it with an admin-granted `StaffAssignment` and the `restaurant-admin` role.
3. **Stock writes are not atomic.** The browser reads, adjusts and writes on-hand quantity; simultaneous edits to one item can overwrite each other. The ledger records both. A server workflow should own these writes.
4. **Device heartbeats are stamped by the sender's clock**, and only the in-page simulator sends them. Real kiosks need an ingest endpoint that stamps time server-side.
5. **Session records accumulate** (one `PresenceSession` per browser session). Add retention before real traffic.
6. **Popular items read every order line in the project** and filter in the browser. Fine for a demo; replace with server-side rollups at volume.

### Server-side workflows still to build

None exist yet; each needs a cloud change that should be reviewed first (`blocks logic workflow import --dry-run`, then `--yes`, then publish).

| Workflow | Trigger | Does | Needs first |
|---|---|---|---|
| Atomic stock | Order updated to accepted or cancelled | Applies recipe deductions and writes `StockMovement` rows server-side | Decide whether the client deduction is then removed |
| Low-stock alert | `InventoryItem` updated | If `onHand <= reorderLevel`, mail the branch manager | A mail template; recipients from `StaffAssignment` |
| Offline-kiosk alert | Schedule, every minute | Find devices silent for over 5 minutes, mail the branch manager | Same as above; a way to avoid re-alerting every minute |
| Kiosk ingest | Webhook | Validate a device key, update the `Device` row with a server timestamp | A device identity (service user or key) and role |
| Presence retention | Schedule, daily | Remove `PresenceSession` rows older than the retention window | A decision on retention; this is a bulk delete, so review it carefully |

## What's included

- `/login` — login page (redirects to Blocks IAM).
- `/login/callback` — completes the hosted IAM callback via `blocksClient.auth.idp.callback()`, then returns to the page you started from.
- `/` and `/profile` — protected; redirect to `/login` when signed out.
- Sidebar + topbar shell matching the `@seliseblocks/blocks-kit` look (icon-only rail on narrow screens, avatar dropdown, notifications menu, active-item accent bar).
- `blocks/localization/*.en.json` local i18n seed files for AI or human edits. Sync them through `blocks localization validate` and `blocks localization push`; the runtime app reads Localization service data through `blocksClient.localization`.

IAM's hosted login sets the session as a **Secure, httpOnly** cookie by default -- this app never reads, stores, or refreshes a token itself. "Signed in" is determined by calling `blocksClient.auth.userInfo()` (`GET /iam/v4/auth/me`), which the browser's cookie authenticates automatically; this is different from `blocksClient.iam.me()`, the full IAM profile call used on the Profile page. Logging out calls `blocksClient.auth.logout()` so IAM ends the session server-side. A cached bearer token (and `blocksClient.auth.oidc.refreshToken()` to refresh it) is only used if a tenant's OIDC config explicitly returns tokens in the response body instead of a cookie.
