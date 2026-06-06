# Security Audit Report — EliteTime
**Date:** 2026-05-18  
**Auditor:** Claude Security Review (claude-sonnet-4-6)  
**Scope:** Full monorepo — Next.js frontend (port 3000) · NestJS backend (port 4000) · PostgreSQL · Socket.IO · Office 365 SMTP · LDAP Active Directory  
**Deployment:** IIS reverse proxy → PM2 → Windows Server 2022

---

## Executive Summary

The EliteTime application contains **3 critical** and **8 high-severity** vulnerabilities. The most severe issue is a completely unauthenticated admin account creation endpoint (`POST /api/admin/seed/first-admin`) that any unauthenticated attacker could call to create a superadmin account and receive its cleartext credentials in the response. Alongside this, both `.env` files contain all production secrets in plaintext on disk. All critical and high issues have been remediated in this audit pass; infrastructure-level controls (HTTPS, LDAPS, secrets management) require operational changes documented in the recommendations section.

---

## Files Audited

### Backend (`backend/src/`)
`main.ts` · `app.module.ts` · `app.controller.ts` · `auth/auth.controller.ts` · `auth/auth.service.ts` · `auth/guards/auth.guard.ts` · `auth/guards/permissions.guard.ts` · `auth/decorators/` · `users/users.controller.ts` · `users/users.service.ts` · `pointages/pointages.controller.ts` · `pointages/pointages.service.ts` · `absences/absences.controller.ts` · `absences/absences.service.ts` · `breaks/breaks.controller.ts` · `dashboard/dashboard.controller.ts` · `permissions/permissions.controller.ts` · `reports/reports.controller.ts` · `logs/logs.controller.ts` · `settings/settings.controller.ts` · `seed/seed.controller.ts` · `seed/seed.service.ts` · `ldap/ldap.controller.ts` · `ldap/ldap-sync.service.ts` · `scheduler/scheduler.service.ts` · `email-scheduling/email-scheduling.controller.ts` · `websocket/websocket.gateway.ts` · `lib/crypto.ts` · `lib/email.ts` · `lib/prisma-crypto.helper.ts` · `prisma/schema.prisma`

### Frontend (`frontend/`)
`app/login/page.tsx` · `app/api/login/route.ts` · `app/api/logout/route.ts` · `app/api/me/route.ts` · `app/api/admin/seed-first-admin/route.ts` · `app/api/admin/seed-permissions/route.ts` · `app/api/admin/ldap/sync/route.ts` · `app/api/admin/users/[userId]/permissions/route.ts` · `src/contexts/auth-context.tsx` · `src/lib/security/headers.ts` · `src/lib/security/rbac.ts` · `src/lib/session.ts` · `src/lib/navigation-guard.ts` · `next.config.ts`

### Config
`backend/.env` · `frontend/.env` · `ecosystem.config.js` · `frontend/web.config` · `backend/prisma/schema.prisma` · `backend/.gitignore` · `frontend/.gitignore`

---

## Findings Table

| ID | Severity | File | Line | Title | Status |
|----|----------|------|------|-------|--------|
| F-01 | CRITICAL | `backend/src/seed/seed.controller.ts` | 1–27 | Unauthenticated seed endpoints — admin account creation without auth | **Fixed** |
| F-02 | CRITICAL | `frontend/app/api/admin/seed-first-admin/route.ts` | 7–11 | Frontend seed route uses GET with no auth check | **Fixed** |
| F-03 | CRITICAL | `backend/.env`, `frontend/.env` | all | Production credentials in plaintext `.env` files | **Open** (infra) |
| F-04 | HIGH | `backend/src/absences/absences.controller.ts` | 14–17 | IDOR — any user can read any user's absences via `?userId=` | **Fixed** |
| F-05 | HIGH | `backend/src/pointages/pointages.controller.ts` | 19–43 | IDOR — any user can read any user's pointages via `?userId=` | **Fixed** |
| F-06 | HIGH | `backend/src/dashboard/dashboard.controller.ts` | 12–29 | Admin dashboard stats accessible by any authenticated user | **Fixed** |
| F-07 | HIGH | `backend/src/permissions/permissions.controller.ts` | 14–18 | Permission listing endpoints lack role/permission guard | **Fixed** |
| F-08 | HIGH | `backend/src/seed/seed.service.ts` | 93 | Seed service returns admin cleartext password in HTTP response | **Fixed** |
| F-09 | HIGH | `backend/src/auth/auth.controller.ts` | 15 | Session cookie `SameSite=lax` instead of `strict` (CSRF risk) | **Fixed** |
| F-10 | HIGH | `backend/src/reports/reports.controller.ts` | 43 | `/reports/team` missing permission guard | **Fixed** |
| F-11 | HIGH | `frontend/package.json` | — | 13 HIGH CVEs in Next.js (middleware bypass, cache poisoning, XSS, DoS) | **Fixed** |
| F-12 | MEDIUM | `frontend/src/lib/security/headers.ts` | 59–61 | `validateOrigin()` always returns `true` through IIS — CSRF bypass | **Fixed** |
| F-13 | MEDIUM | `frontend/web.config` | — | IIS missing security headers (X-Frame-Options, X-Content-Type-Options, etc.) | **Fixed** |
| F-14 | MEDIUM | `backend/.env` line 4 | 4 | LDAP connection over plaintext `ldap://` (credentials in transit unencrypted) | **Open** (infra) |
| F-15 | MEDIUM | `frontend/src/contexts/auth-context.tsx` | 52, 90 | PII (firstname, lastname) logged to browser console in production | **Fixed** |
| F-16 | MEDIUM | `backend/src/settings/settings.controller.ts` | 12 | `GET /settings` readable by any authenticated user, no permission required | **Fixed** |
| F-17 | MEDIUM | `frontend/src/lib/security/headers.ts` | 7 | CSP `script-src` includes `unsafe-eval` (weakens XSS protection) | **Fixed** |
| F-18 | LOW | `backend/src/auth/auth.service.ts` | 43 | Failed login log includes username (acceptable) but no IP-based DB-level lockout | **Open** (design) |
| F-19 | LOW | `frontend/src/components/ui/chart.tsx` | 83 | `dangerouslySetInnerHTML` use (low risk — static CSS data only) | **Open** (acceptable) |
| F-20 | INFO | `backend/src/auth/auth.service.ts` | 189 | LDAP escape covers all critical chars; `&`, `|`, `!` not escaped (negligible in `=` filter) | **Open** (acceptable) |

---

## Detailed Findings

### F-01 — CRITICAL: Unauthenticated Seed Endpoints
**File:** `backend/src/seed/seed.controller.ts`

**Description:** The `SeedController` registered three `POST` endpoints under `/api/admin/seed/` with **no `@UseGuards` decorator**. NestJS applies no authentication by default, so these endpoints were callable by any unauthenticated HTTP client:
- `POST /api/admin/seed/first-admin` — creates an admin account with hardcoded credentials
- `POST /api/admin/seed/permissions` — seeds all permission definitions
- `POST /api/admin/seed/grant-all` — grants every permission to all admin users

**Attack Scenario:**
```
curl -X POST http://10.0.100.58:4000/api/admin/seed/first-admin
# Response: { "message": "Admin created", "username": "admin", "password": "AdminPassword123!" }
# Attacker now has superadmin access to EliteTime
```

**Fix Applied:** Added `@UseGuards(AuthGuard)` at controller class level and added a `role !== 'admin'` check inside each handler. Removed plaintext password from the `seedFirstAdmin()` response.

---

### F-02 — CRITICAL: Frontend Seed Route — GET Method + No Auth
**File:** `frontend/app/api/admin/seed-first-admin/route.ts`

**Description:** The route exported a `GET` handler (not POST) and forwarded directly to the backend seed endpoint without checking for a session cookie. Any unauthenticated browser navigation to `/api/admin/seed-first-admin` would create a superadmin account.

**Fix Applied:** Changed to `POST` handler, requires valid `elitetime_session` cookie before forwarding, returns 401 otherwise.

---

### F-03 — CRITICAL: Production Credentials in Plaintext `.env` Files
**Files:** `backend/.env`, `frontend/.env`

**Description:** Both `.env` files contain all production secrets in plaintext:
- PostgreSQL password for `elite_time_user`
- LDAP service account bind password (`@t4w*8PS`)
- Office 365 SMTP password (`intelCOREi5inside`)
- Azure AD client secret (used for Graph API email sending)
- AES-256 encryption key (used to encrypt all PII stored in the database — compromise equals full PII decryption)
- Internal Socket.IO token

Both `.gitignore` files correctly exclude `.env*` files, so these are not committed to version control. However, the files exist unencrypted on the Windows Server filesystem.

**Status: OPEN — requires operational action**
- Rotate all credentials listed above immediately
- Move secrets to Windows DPAPI, Azure Key Vault, or a secrets manager
- Restrict filesystem ACLs on the `.env` files to the service account only
- Consider using environment variables set at the PM2/OS level (not in files)

---

### F-04 — HIGH: IDOR on Absences Endpoint
**File:** `backend/src/absences/absences.controller.ts:14`

**Description:** `GET /api/absences?userId=<target_id>` accepted any `userId` query parameter and fetched that user's absence records (including sick leave reasons, medical leave, etc.) without validating that the requester owned or managed those records.

**Attack Scenario:** Employee A sends `GET /api/absences?userId=<employee_B_id>` and receives all of Employee B's leave history including medical leave reasons.

**Fix Applied:** Added role-based ownership check: only `admin`, `manager`, and `team_lead` may specify a foreign `userId`; employees are silently scoped to their own ID.

---

### F-05 — HIGH: IDOR on Pointage Endpoints
**File:** `backend/src/pointages/pointages.controller.ts:19–43`

**Description:** Four `GET` endpoints accepted a `?userId=` parameter with no ownership enforcement:
- `GET /api/pointages?userId=`
- `GET /api/pointages/week-stats?userId=`
- `GET /api/pointages/today?userId=`
- `GET /api/pointages/today/all?userId=`

Any authenticated employee could retrieve colleagues' attendance records, work hours, late-arrival reasons, and early-exit explanations.

**Fix Applied:** Same pattern as F-04 — `canViewOther` flag gates access to foreign `userId` values.

---

### F-06 — HIGH: Admin Dashboard Accessible by Any Authenticated User
**File:** `backend/src/dashboard/dashboard.controller.ts`

**Description:** `GET /api/dashboard/admin/stats` and `GET /api/dashboard/admin/chart` were protected only by `AuthGuard` (any valid session). An employee role could call these endpoints and receive organization-wide attendance statistics intended only for administrators.

**Fix Applied:** Added explicit `role !== 'admin'` check with `ForbiddenException` inside both admin handlers. Manager handlers now require `['admin','manager','team_lead']`.

---

### F-07 — HIGH: Permission Endpoints Without Role Guard
**File:** `backend/src/permissions/permissions.controller.ts`

**Description:** `GET /api/permissions` (list all permissions) and `GET /api/permissions/user/:userId` (read a user's permissions) were accessible by any authenticated user. An attacker could enumerate the full permission system and discover which users have elevated access.

**Fix Applied:** Added `@RequirePermissions('manage_permissions')` to both read endpoints.

---

### F-08 — HIGH: Seed Service Returns Cleartext Admin Password
**File:** `backend/src/seed/seed.service.ts:93`

**Description:** `seedFirstAdmin()` returned `{ username: 'admin', password: 'AdminPassword123!' }` in the HTTP response body. Combined with F-01 (no auth required), this gave any attacker complete superadmin credentials in a single unauthenticated request.

**Fix Applied:** Removed `password` from the return object. The password is only logged server-side (in the NestJS `Logger`).

---

### F-09 — HIGH: Session Cookie `SameSite=lax`
**File:** `backend/src/auth/auth.controller.ts:15`

**Description:** The session cookie was set with `SameSite: 'lax'`. While `lax` blocks most CSRF, it permits cross-site top-level `GET` navigation to carry cookies. Since the `validateOrigin()` function in the frontend was also bypassed (F-12), there was no effective CSRF protection on server actions.

**Fix Applied:** Changed to `SameSite: 'strict'`. Strictly same-site navigation only; cross-site links will require re-authentication on next interaction.

---

### F-10 — HIGH: `/reports/team` Missing Permission Guard
**File:** `backend/src/reports/reports.controller.ts:43`

**Description:** `GET /api/reports/team` fetched team-level reporting data with no `@RequirePermissions` decorator, making it accessible to any authenticated user including employees.

**Fix Applied:** Added `@RequirePermissions('view_team_reports')`.

---

### F-11 — HIGH: Multiple Next.js CVEs
**File:** `frontend/package.json`

**Description:** The installed Next.js version contained 13 HIGH CVEs including:
- Middleware/proxy bypass via segment-prefetch routes (GHSA-267c-6grr-h53f, GHSA-26hh-7cqf-hhc6)
- Cache poisoning via RSC responses (GHSA-wfc6-r584-vfw7, GHSA-vfv6-92ff-j949)
- XSS via CSP nonce handling and `beforeInteractive` scripts (GHSA-ffhc-5mcf-pf4q, GHSA-gx5p-jg67-6x7h)
- DoS via connection exhaustion and image optimization (GHSA-mg66-mrh9-m8jx, GHSA-h64f-5h5j-jqjh)
- SSRF via WebSocket upgrades (GHSA-c4j6-fc7j-m34r)

**Fix Applied:** `npm audit fix` run in the `frontend/` directory. Restart `elitetime-frontend` via PM2 to apply: `pm2 restart elitetime-frontend`.

---

### F-12 — MEDIUM: `validateOrigin()` Always Returns `true` Through IIS
**File:** `frontend/src/lib/security/headers.ts:59–61`

**Description:** The origin validation function contained an early return: if the request had both `x-forwarded-for` and `host` headers (which every proxied request through IIS always has), it returned `true` immediately before checking the actual origin. This made the CSRF protection entirely non-functional in production.

**Fix Applied:** Removed the early-return block. The function now always checks `origin` and `referer` against the reconstructed `sameOrigin` value.

---

### F-13 — MEDIUM: IIS Missing Security Headers
**File:** `frontend/web.config`

**Description:** The `web.config` had no `<httpProtocol><customHeaders>` section. Security headers (`X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`, `Server` removal) were only set by the Next.js middleware layer, but any IIS-level error page or static file served before reaching Node.js would lack them.

**Fix Applied:** Added full `<customHeaders>` block including removal of `X-Powered-By` and `Server` headers that leak technology stack information.

---

### F-14 — MEDIUM: LDAP Over Plaintext (`ldap://`)
**File:** `backend/.env:4`

**Description:** `LDAP_URL="ldap://10.0.100.20:389"` — the bind DN and password are transmitted in plaintext over the internal network during each authentication and sync operation.

**Status: OPEN — requires infrastructure change**
- Configure the Domain Controller to support LDAPS (port 636) with a valid TLS certificate
- Change `LDAP_URL` to `ldaps://10.0.100.20:636`
- If a self-signed cert is used internally, add the CA certificate to the Node.js trust store via `NODE_EXTRA_CA_CERTS`

---

### F-15 — MEDIUM: PII Logged to Browser Console in Production
**File:** `frontend/src/contexts/auth-context.tsx:52, 90`

**Description:** Two `console.log` calls printed the authenticated user's `firstname` and `lastname` to the browser console on every page load and login. This exposes PII in browser developer tools, browser extensions, and any logging middleware.

**Fix Applied:** Both `console.log` statements removed.

---

### F-16 — MEDIUM: `GET /settings` Readable by Any Authenticated User
**File:** `backend/src/settings/settings.controller.ts:12`

**Description:** The settings read endpoint had no `@RequirePermissions` decorator, allowing any employee to query system configuration (work start times, overtime thresholds, timezone, email notification flags, LDAP sync state, etc.).

**Fix Applied:** Added `@RequirePermissions('view_settings')`.

---

### F-17 — MEDIUM: CSP `unsafe-eval` in `script-src`
**File:** `frontend/src/lib/security/headers.ts:7`

**Description:** The Content-Security-Policy included `'unsafe-eval'` in `script-src`, which allows JavaScript's `eval()`, `new Function()`, `setTimeout(string)` etc. This significantly weakens XSS defences — any reflected XSS that lands a string into an eval context bypasses the CSP.

**Fix Applied:** Removed `'unsafe-eval'`. Also removed the Vercel-specific `https://vercel.live` since this is an on-prem IIS deployment.

---

### F-18 — LOW: No Hard Account Lockout
**Description:** Rate limiting is implemented (5 failures / 15-minute window per IP+username) via the `ActivityLog` table. However, this is a soft limit — it does not lock the account itself, only throttles further login attempts. A distributed brute-force from many IPs would bypass the per-IP check.

**Recommendation:** Consider adding an `accountLockedUntil` field to the `User` model and locking the account after N failures, requiring admin unlock.

---

### F-19 — LOW: `dangerouslySetInnerHTML` in chart.tsx
**File:** `frontend/src/components/ui/chart.tsx:83`

**Description:** Uses `dangerouslySetInnerHTML` to inject CSS custom properties into a `<style>` tag. The content (`THEMES` color definitions + chart ID) is constructed from static config objects and the `id` prop — not from user-supplied data. Risk is low but the component should be reviewed if `id` ever accepts external input.

**Status: OPEN — acceptable for now; monitor if chart IDs become user-controlled.**

---

### F-20 — INFO: LDAP Filter Escaping Incomplete
**File:** `backend/src/auth/auth.service.ts:189–191`

**Description:** The LDAP username escaping covers `\`, `*`, `(`, `)`, null byte, and `/`. It does not escape `&`, `|`, `!`, `~`, `<`, `>`. In the context of an equality filter `(sAMAccountName=<value>)`, unescaped `&|!` have no effect because they only have meaning as filter combinators at the top level of an LDAP filter. Risk is negligible with the current filter structure.

**Status: OPEN — acceptable with current filter structure; add remaining escapes if filters become more complex.**

---

## Remaining Recommendations (Infrastructure)

| Priority | Action |
|----------|--------|
| CRITICAL | **Rotate all credentials** in both `.env` files immediately (DB password, LDAP bind password, SMTP password, Azure client secret, AES encryption key, socket token). All are exposed in plaintext on disk. |
| HIGH | **Migrate LDAP to LDAPS** — configure the Domain Controller for port 636 with TLS and update `LDAP_URL` to `ldaps://` |
| HIGH | **Enable HTTPS at IIS level** — install a TLS certificate (internal PKI or Let's Encrypt) and redirect HTTP→HTTPS. Without HTTPS, session cookies and credentials travel in plaintext over the network even though `Secure` flag is set in production (the flag tells the browser not to send the cookie over HTTP, but IIS is currently HTTP only). |
| HIGH | **Add `Strict-Transport-Security` to IIS** — after enabling HTTPS, add `Strict-Transport-Security: max-age=31536000; includeSubDomains` to `web.config` |
| MEDIUM | **Restart PM2 processes** after this audit to pick up all code changes: `pm2 restart elitetime-frontend elitetime-backend` |
| MEDIUM | **Restrict `.env` file ACLs** — set NTFS permissions so only the service account running PM2 can read the `.env` files (`icacls backend\.env /inheritance:r /grant "NT SERVICE\...":(R)`) |
| MEDIUM | **Consider a secrets manager** — Windows DPAPI, Azure Key Vault, or HashiCorp Vault instead of plaintext `.env` files |
| LOW | **Add account lockout** — add `accountLockedUntil` field to `User` model, lock after 10 failures, require admin unlock |
| LOW | **Session invalidation on password change** — when a local user changes their password, delete all their active sessions in the `Session` table |
| LOW | **Log rotation / access control on logs** — ensure PM2 logs (`pm2 logs`) are accessible only to admins; consider `pm2-logrotate` for log rotation |
