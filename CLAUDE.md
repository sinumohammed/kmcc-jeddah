# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

KMCC Savings & Loan Management — a PWA for tracking member savings, loans, profit/interest distribution, and expenses (including zakat). Monorepo with three parts sharing one Postgres (Neon) database.

## Commands

Run from repo root unless noted.

- `npm install && npm --prefix api install && npm --prefix web install` — install all three package.json's (root, api, web are separate npm packages, not an npm workspace)
- `npm run dev` — runs API (port 4000) and web (port 5173, proxies `/api` to the API) concurrently
- `npm run dev:api` / `npm run dev:web` — run just one side
- `npm run prisma:migrate -- --name <name>` — create/apply a migration against `DATABASE_URL` (delegates to `api/`, schema lives at `prisma/schema.prisma`)
- `npm run prisma:generate` — regenerate the Prisma client into `api/node_modules/.prisma/client`
- `npm run seed` — seeds one admin login (`mobile: 9999999999`, `memberCode: KMCC0001`, `password: admin123`) and one default Bank row
- `npm --prefix api run build` — `tsc` build of the API (used for typechecking; `npx tsc --noEmit` in `api/` also works)
- `npm --prefix web run build` — `tsc -b && vite build`; also generates the PWA service worker/manifest

There are no automated tests yet.

### Environment

Copy `.env.example` to `.env` at repo root AND to `api/.env` (the API loads its own `.env` via `dotenv/config`, it does not read the root one). Needs `DATABASE_URL`, `DIRECT_URL` (Neon pooled + direct connection strings), `JWT_SECRET`, `PORT`. The web app has no required env var in dev — it hits `/api` via the Vite proxy (`web/vite.config.ts`) and falls back to `/api` in production via the Vercel rewrite in `vercel.json`.

## Architecture

**Three packages, not an npm workspace** — `api/`, `web/`, and root each have their own `package.json` and `node_modules`. `prisma/schema.prisma` lives at the repo root but its generated client is output into `api/node_modules/.prisma/client` (see the `generator client { output = ... }` line) — that's why `api/src/lib/prisma.ts` and every route import from `.prisma/client`, not `@prisma/client`.

**API is a single Express app, not per-route serverless functions.** `api/src/app.ts` builds the Express app and mounts every router under an `/api/*` prefix internally. `api/src/server.ts` is the local dev entry (`app.listen`). `api/index.ts` (at the api package root, outside `src/`) is the Vercel serverless entry — Vercel routes all `/api/(.*)` traffic to this one function (see root `vercel.json`), and Express does the internal routing from there. When adding a new route file, mount it in `app.ts`, not as a new file under `/api`.

**Auth model**: login is `mobile + memberCode + password` (not email). `memberCode` is an auto-incrementing `KMCC0001`-style code (`api/src/lib/memberCode.ts`). JWT payload is `{ memberId, memberCode, role }`; `requireAuth`/`requireAdmin` middleware (`api/src/middleware/auth.ts`) attach `req.user`. There is one `Member` model for both admin and regular users — `role: ADMIN | MEMBER` gates access, and `isSavingMember` / `isLoanMember` booleans (independently settable, not mutually exclusive) drive what a member's own profile page shows.

**Monthly savings contributions are auto-generated, not manually entered per month.** `api/src/lib/contributions.ts` has two key functions:
- `ensureContributionsUpTo(memberId, year, month)` — lazily backfills `MonthlyContribution` rows from a saving member's join month through the target month, using whatever `MonthlyAmountHistory` amount is set for each year. Called on-demand (e.g. when viewing a profile or recording a deposit), not via a cron.
- `allocateDepositToContributions(memberId, amount, date)` — applies a single deposit transaction across the member's oldest pending/partial months first, so one lump payment can clear several back-months. This is invoked automatically from `POST /api/transactions` whenever a `SAVING_DEPOSIT` transaction is created with a `memberId`.

Changing a member's monthly amount only affects future years — `MonthlyAmountHistory` is keyed by `(memberId, year)`, and `POST /members/:id/monthly-amount` upserts one year at a time.

**Profit distribution is a fan-out operation, not a single transaction.** `POST /api/transactions/profit-distribution` takes one lump sum + bank, computes each active saving member's share proportional to their cumulative `SAVING_DEPOSIT` total, and creates one `PROFIT` transaction per member, all tagged with the same generated `profitBatchId` so the batch can be deleted/audited as a unit (`DELETE /transactions/profit-distribution/:batchId`).

**Every `Transaction` requires a `Bank`** (`bankId` is non-nullable) but `memberId` is nullable for org-level entries (general expense, zakat) not attributable to one member. `Transaction.category` drives side effects in `api/src/routes/transactions.ts` and `api/src/routes/loans.ts`: `SAVING_DEPOSIT` triggers contribution allocation; `LOAN_DISBURSEMENT`/loan creation and `LOAN_REPAYMENT` both adjust `Loan.balance` and flip `Loan.status` to `CLOSED` when balance hits zero.

**Dashboard summary** (`GET /api/dashboard/summary`, admin-only) is computed live via Prisma aggregates in `api/src/routes/dashboard.ts` — there's no materialized/cached summary table. The 7 tiles map directly to `Transaction.category` sums plus `sum(INCOME) - sum(EXPENSE)` for bank balance and `sum(active Loan.balance)` for outstanding loans.

**Frontend role-based routing**: `web/src/App.tsx` nests two `ProtectedRoute` layers — the outer requires any authenticated member, the inner (`allow={['ADMIN']}`) gates `/dashboard`, `/members`, `/banks`, `/transactions`. Non-admin members only ever see `/profile` (`web/src/pages/Profile.tsx`), which conditionally renders a savings contribution schedule and/or a loan section based on the logged-in member's own `isSavingMember`/`isLoanMember` flags. Auth state (`web/src/store/auth.ts`, zustand) persists the JWT and member object to `localStorage`; `web/src/api/client.ts` is the one axios instance everything should import — it auto-attaches the bearer token and logs out on a 401.

## Known open decisions

Several product behaviors were assumed rather than confirmed with the client and are flagged in the design plan (loan interest calculation stays fully manual, profit distribution is based on cumulative-not-yearly savings, every transaction requires a bank, member soft-delete). Before changing behavior in `contributions.ts` or `transactions.ts`'s profit-distribution logic, check whether the assumption has since been confirmed/changed.
