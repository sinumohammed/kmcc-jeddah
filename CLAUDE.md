# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

KMCC Savings & Loan Management — a PWA for tracking member savings, loans, profit/interest distribution, and expenses (including zakat). Monorepo with three parts sharing one Postgres (Neon) database.

## Commands

Run from repo root unless noted.

- `npm install && npm --prefix server install && npm --prefix web install` — install all three package.json's (root, server, web are separate npm packages, not an npm workspace)
- `npm run dev` — runs the API (port 4000, from `server/`) and web (port 5173, proxies `/api` to the API) concurrently
- `npm run dev:api` / `npm run dev:web` — run just one side
- `npm run prisma:migrate -- --name <name>` — create/apply a migration against `DATABASE_URL` (delegates to `server/`, schema lives at `prisma/schema.prisma`)
- `npm run prisma:generate` — regenerate the Prisma client into `server/node_modules/.prisma/client`
- `npm run seed` — seeds one admin login (`mobile: 9999999999`, `memberCode: KMCC0001`, `password: admin123`) and one default Bank row
- `npm run seed:members` — bulk-seeds member records (mobile `123456`, password `123456`) from the name list in `server/src/seedMembers.ts`
- `npm --prefix server run build` — `tsc` build of the API (used for typechecking; `npx tsc --noEmit` in `server/` also works)
- `npm --prefix web run build` — `tsc -b && vite build`; also generates the PWA service worker/manifest

There are no automated tests yet.

### Environment

Copy `.env.example` to `.env` at repo root AND to `server/.env` (the API loads its own `.env` via `dotenv/config`, it does not read the root one). Needs `DATABASE_URL`, `DIRECT_URL` (Neon pooled + direct connection strings), `JWT_SECRET`, `PORT`. The web app has no required env var in dev — it hits `/api` via the Vite proxy (`web/vite.config.ts`) and falls back to `/api` in production via the Vercel rewrite in `vercel.json`.

### Before pushing

Run this checklist before every `git push` (not just when asked — do it automatically as part of finishing any change):
1. `npx tsc --noEmit` in `server/` and `npx tsc -b --noEmit` in `web/` — both must be clean.
2. `npm run build` in `web/` — production build must succeed.
3. If any `.tsx` files changed, run the `vercel:react-best-practices` skill against them (component structure, hooks, accessibility, re-renders, TS patterns) and fix anything it flags before committing.
4. Only then `git add` the reviewed files, commit, and push.

`git push` itself is blocked by this environment's auto-mode safety classifier for Claude — after committing, tell the user to run `! git push -u origin main` themselves.

## Architecture

**Three packages, not an npm workspace** — `server/`, `web/`, and root each have their own `package.json` and `node_modules`. `prisma/schema.prisma` lives at the repo root but its generated client is output into `server/node_modules/.prisma/client` (see the `generator client { output = ... }` line) — that's why `server/src/lib/prisma.ts` and every route import from `.prisma/client`, not `@prisma/client`.

**API source lives in `server/`, but the deployed function is `api/index.ts`.** `server/src/app.ts` builds the Express app and mounts every router under an `/api/*` prefix internally. `server/src/server.ts` is the local dev entry (`app.listen`). The top-level `api/index.ts` is the *only* file inside `/api` — it imports the Express app from `../server/src/app` and is Vercel's serverless entry (`vercel.json` routes all `/api/(.*)` traffic to it). This split exists because Vercel's zero-config detector turns every file placed directly under `/api` into its own serverless function — Hobby plan caps that at 12, so the actual route/lib/middleware files must live outside `/api` in `server/`. When adding a new route file, put it in `server/src/routes/` and mount it in `server/src/app.ts` — never add files directly under `/api`.

**Auth model**: login is a single `username` field (mobile number OR `memberCode`) + password — not two separate fields. `server/src/routes/auth.ts` tries an exact `memberCode` match first (case/whitespace-normalized), then falls back to `mobile`; if multiple members share a mobile number (common right after bulk-seeding placeholder numbers) it returns an error asking for the Member ID instead of guessing. `memberCode` is an auto-incrementing `KMCC0001`-style code (`server/src/lib/memberCode.ts`). JWT payload is `{ memberId, memberCode, role }`; `requireAuth`/`requireAdmin` middleware (`server/src/middleware/auth.ts`) attach `req.user`. There is one `Member` model for both admin and regular users — `role: ADMIN | MEMBER` gates access, and `isSavingMember` / `isLoanMember` booleans (mutually exclusive, enforced in the API) drive what a member's profile page shows.

**Monthly savings contributions are auto-generated, not manually entered per month.** `server/src/lib/contributions.ts` has three key functions:
- `ensureContributionsUpTo(memberId, year, month)` — lazily backfills `MonthlyContribution` rows from a saving member's join month through the target month, using whatever `MonthlyAmountHistory` amount is set for each year. Called on-demand (e.g. when viewing a profile or recording a deposit), not via a cron.
- `allocateDepositToContributions(memberId, amount, date)` — applies a single deposit transaction across the member's oldest pending/partial months **within that deposit's own calendar year only** (a 2025-dated deposit can never fill 2026's months, and vice versa — each year is a separate obligation), so one lump payment can clear several back-months. Invoked automatically from `POST /api/transactions` whenever a `SAVING_DEPOSIT` transaction is created with a `memberId`.
- `recalculateAllContributions(memberId)` — resets a member's entire paid/pending history and replays their remaining `SAVING_DEPOSIT` transactions in date order. Called whenever a saving-deposit transaction is edited or deleted, so the schedule never has stale "paid" rows left over from a transaction that no longer exists.

Changing a member's monthly amount (`POST /members/:id/monthly-amount`) is keyed by `(memberId, year)` and also refreshes `amountDue` on that year's still-`PENDING` months (paid/partial months keep their historical amount — only untouched months follow the new rate).

**Profit distribution is a fan-out operation, not a single transaction.** `POST /api/transactions/profit-distribution` takes one lump sum + bank, computes each active saving member's share proportional to their cumulative `SAVING_DEPOSIT` total, and creates one `PROFIT` transaction per member, all tagged with the same generated `profitBatchId` so the batch can be deleted/audited as a unit (`DELETE /transactions/profit-distribution/:batchId`).

**Every `Transaction` requires a `Bank`** (`bankId` is non-nullable) but `memberId` is nullable for org-level entries (general expense, zakat) not attributable to one member; it's required for `SAVING_DEPOSIT`/`LOAN_DISBURSEMENT`/`LOAN_REPAYMENT` (enforced server-side). `Transaction.category` drives side effects in `server/src/routes/transactions.ts` and `server/src/routes/loans.ts`: `SAVING_DEPOSIT` triggers contribution allocation; `LOAN_DISBURSEMENT`/loan creation and `LOAN_REPAYMENT` both adjust `Loan.balance` and flip `Loan.status` to `CLOSED` when balance hits zero. The frontend labels these flows "Deposit"/"Withdrawal" (`web/src/pages/Transactions.tsx`) even though the DB enum is still `INCOME`/`EXPENSE`.

**Dashboard summary** (`GET /api/dashboard/summary` and `/api/dashboard/banks-summary`, admin-only) is computed live via Prisma aggregates in `server/src/routes/dashboard.ts` — there's no materialized/cached summary table. The 7 tiles map directly to `Transaction.category` sums plus `Bank.openingBalance + sum(INCOME) - sum(EXPENSE)` for bank balance, and `sum(active Loan.balance)` for outstanding loans. `Bank.openingBalance` matters here — it's how a real-world existing account balance (entered from a bank statement) gets reflected from day one instead of starting at zero.

**Frontend role-based routing**: `web/src/App.tsx` nests two `ProtectedRoute` layers — the outer requires any authenticated member, the inner (`allow={['ADMIN']}`) gates `/dashboard`, `/members`, `/banks`, `/transactions`. `/profile` (`web/src/pages/Profile.tsx`) is shared by both roles but behaves differently: a regular member always views their own data; an admin gets a member-picker dropdown (defaults to the first member) and can view anyone's profile. The page conditionally renders a savings contribution schedule and/or a loan section based on the viewed member's `isSavingMember`/`isLoanMember` flags, plus a lifetime balance stat (sum of all-time `SAVING_DEPOSIT` transactions for saving members, outstanding loan balance for loan members — not scoped to the current year). Auth state (`web/src/store/auth.ts`, zustand) persists the JWT and member object to `localStorage`; `web/src/api/client.ts` is the one axios instance everything should import — it auto-attaches the bearer token and logs out on a 401.

## Known open decisions

Several product behaviors were assumed rather than confirmed with the client and are flagged in the design plan (loan interest calculation stays fully manual, profit distribution is based on cumulative-not-yearly savings, every transaction requires a bank, member soft-delete). Before changing behavior in `contributions.ts` or `transactions.ts`'s profit-distribution logic, check whether the assumption has since been confirmed/changed.
