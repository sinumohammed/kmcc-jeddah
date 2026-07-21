# KMCC Savings & Loan Management

PWA for tracking member savings, loans, profit/interest distribution, and expenses (including zakat). See `plans/i-need-to-create-nifty-island.md` (or your Claude Code plan history) for the full design draft.

## Stack
- `web/` — React + Vite + Ant Design, installable PWA
- `api/` — Node.js + Express (TypeScript), deployed as a Vercel serverless function
- `prisma/schema.prisma` — shared Postgres schema (Neon)

## First-time setup

1. **Create a free Neon Postgres project** at https://neon.tech, and copy the pooled connection string (`DATABASE_URL`) and the direct connection string (`DIRECT_URL`).
2. Copy `.env.example` to `.env` at the repo root, and fill in `DATABASE_URL`, `DIRECT_URL`, and a random `JWT_SECRET`. Also copy it to `api/.env` (the API reads its own `.env`).
3. Install dependencies:
   ```
   npm install
   npm --prefix api install
   npm --prefix web install
   ```
4. Run the initial migration against Neon:
   ```
   npm run prisma:migrate -- --name init
   ```
5. Seed an admin login:
   ```
   npm run seed
   ```
   This creates admin login `mobile: 9999999999`, `memberCode: KMCC0001`, `password: admin123` — change the password after first login (edit member, or re-seed with different values before going live).

## Local development

```
npm run dev
```
Runs the API on `http://localhost:4000` and the web app on `http://localhost:5173` (proxying `/api` to the API). Log in at `http://localhost:5173/login`.

## Deploying to Vercel

1. Push this repo to GitHub and import it into Vercel.
2. In Vercel project settings, add environment variables: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` (same Neon values as local).
3. Vercel will use the root `vercel.json` to build `web/` as the static frontend and `api/index.ts` as a serverless function handling all `/api/*` routes.
4. After the first deploy, run the Prisma migration against the same Neon database from your machine (`npm run prisma:migrate`) and seed the admin user (`npm run seed`) if not already done.

## Notes / open items
See the "Open Assumptions to Confirm" section of the design plan — several product decisions (loan interest handling, profit distribution base, whether every transaction requires a bank, etc.) were assumed for this draft and should be confirmed/adjusted before this is used for real bookkeeping.
