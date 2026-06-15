# DECISIONS.md — Decision Log

Each entry documents a significant decision made during development, the options considered, and the reasoning.

---

## Decision 1 — Database: MySQL on AWS RDS (with SQLite fallback for local dev)

**Context:** The problem requires a relational database. I needed to pick a specific engine and hosting option.

**Options Considered:**
1. SQLite (local file only) — zero setup, but not a real production database
2. PostgreSQL on Supabase — free tier, easier setup
3. **MySQL on AWS RDS** ← chosen for production

**Why MySQL on AWS RDS:**
- AWS RDS is a real, managed, production-grade database
- MySQL is the most widely used SQL database and Sequelize supports it natively
- Demonstrates real cloud infrastructure skills
- The `DATABASE_URL` environment variable controls which database is used

**SQLite fallback:**  
`db.js` checks if `DATABASE_URL` is set. If not, it falls back to a local SQLite file (`database.sqlite`). This lets the app run in development without needing AWS credentials.

**Problem encountered:** The initial connection string pointed to the system `mysql` database. AWS RDS denies access to that database for non-root users. Fixed by adding a pre-sync step in `db.js` that runs `CREATE DATABASE IF NOT EXISTS shared_expenses` before Sequelize connects, using `mysql2/promise` with no specific database selected.

---

## Decision 2 — ORM: Sequelize

**Context:** Needed to interact with MySQL from Node.js.

**Options Considered:**
1. Raw SQL with `mysql2` — full control, but verbose
2. **Sequelize ORM** ← chosen
3. Prisma ORM — better DX, but heavier setup

**Why Sequelize:**
- Mature, widely used, native MySQL support
- Model definitions (`User.js`, `Expense.js`, etc.) serve as living schema documentation
- `sync({ force: true })` was useful during development — wipes and recreates all tables on every restart, which makes schema iteration fast without needing migration files
- Association API (`belongsTo`, `hasMany`, `belongsToMany`) keeps relationship logic clean

**Trade-off:** `sync({ force: true })` in `server.js` means all data is lost on every server restart. This is intentional for this assignment since re-importing the CSV is part of the demo flow. In production this would be changed to `sync({ alter: true })` or removed in favour of Sequelize migrations.

---

## Decision 3 — Pre-compute Split Amounts (`allocated_amount`) at Import Time

**Context:** There are four split types: equal, unequal, percentage, share. Balances need to be calculable quickly.

**Options Considered:**
1. Store raw `split_details` string and parse it at query time
2. **Pre-compute `allocated_amount` per person at import/save time** ← chosen

**Why Pre-compute:**
- `getBalances` can then sum over `ExpenseSplits.allocated_amount` with a single query — no parsing at read time
- Consistent: if the split logic changes later, old records still hold the right values
- Supports the requirement that Rohan can "see exactly which expenses make up his balance"
- `ExpenseSplit` stores both `allocated_amount` (always computed) and optional `percentage` / `share` for reference

---

## Decision 4 — Currency Conversion: Historical API with Hardcoded Fallback

**Context:** Dev paid for the trip in USD. Treating $1 as ₹1 is wrong — amounts would be ~83× too small.

**Options Considered:**
1. Hardcode one fixed rate (e.g. USD = ₹83 always)
2. **`freecurrencyapi.com/v1/historical` with hardcoded fallback** ← chosen
3. Always ask the user to enter a rate manually

**Why Historical API with Fallback:**
- Historical rates are accurate for the actual expense date — not today's rate
- Free tier of `freecurrencyapi.com` supports historical data with an API key
- API response key structure: `data[date][currency]` — we use `Object.keys(data)[0]` to find the date key robustly (fixed a bug where the original code assumed the exact date string would be the key)
- If the API is unavailable or returns an unexpected shape, fallback rates apply: USD=83, EUR=90, GBP=105
- The conversion checkbox is shown in both the CSV import anomaly cards and the Add Expense form

---

## Decision 5 — CSV Import: Interactive User Resolution (Not Silent Auto-Fix)

**Context:** The problem statement says "a crashed import and a silent guess are both failing answers."

**Options Considered:**
1. Silently auto-fix all anomalies and import
2. Reject CSV and ask user to fix it and re-upload
3. **Show each anomaly to the user and let them fix it in the UI before confirming import** ← chosen

**Why Interactive Resolution:**
- Matches Meera's stated preference: "I want to approve anything the app deletes or changes"
- No silent guesses — every decision is either user-made or clearly documented
- Two-phase flow: `POST /api/import-analyze` (analyze only, no writes) → user edits in UI → `POST /api/import-confirm` (save clean data)
- After confirmation, a `import_report.txt` file is generated on the backend and made available for download

---

## Decision 6 — Duplicate Detection: Post-Pass Grouping Algorithm

**Context:** The original duplicate check was a hardcoded keyword check (`includes('dinner - marina bites')`). This only worked for one specific case and was not general.

**Old approach:** Check description for two hardcoded substrings.  
**New approach:** After reading all rows, bucket them by a combination of normalized description and exact date. Any bucket with 2+ rows is flagged as a conflict group.

**Why Post-Pass:**
- Works for any duplicate, not just one hardcoded case
- Correctly treats similar descriptions on different dates as separate expenses (e.g. weekly shops)
- Can detect both identical duplicates (same amount) and conflicts (same description and date, different amounts)
- Assigns `conflictGroupId` to linked rows so the frontend can group them visually
- Suggests the row with the highest amount as "keep" and marks others as "duplicate"

---

## Decision 7 — Balance Calculation: Net Balance + Greedy Simplification

**Context:** With 5 people and many expenses, naive pairwise tracking produces many small debts.

**`getBalances` algorithm:**
1. For each expense: `balances[paid_by_id] += amount`
2. For each split: `balances[user_id] -= allocated_amount`
3. For each settlement: `balances[paid_by_id] += amount`, `balances[paid_to_id] -= amount`

**`getSimplifiedDebts` (greedy two-pointer):**
1. Separate users into debtors (negative balance) and creditors (positive balance)
2. Sort both by amount descending
3. Match largest debtor with largest creditor, settle as much as possible, advance pointer of whichever is exhausted
4. Repeat until all debts cleared

**Why:**  
- Minimises number of transfers — satisfies Aisha's requirement: "one number per person, who pays whom, done"
- Standard algorithm used by Splitwise and similar apps

---

## Decision 8 — Login: Name Picker Stored in `localStorage`

**Context:** The problem requires a login module but does not require password-based authentication.

**Options Considered:**
1. Full JWT authentication with passwords
2. Google OAuth
3. **Name-picker stored in `localStorage`** ← chosen

**Why Name Picker:**
- The five users are known — there are no strangers
- Full auth (password hashing, JWT, sessions) would take a full day and is out of scope
- `localStorage` key `fairshare_user` persists the selection across page reloads
- The `UserContext` in `App.jsx` makes the logged-in user's name available to all pages (personalises the dashboard balance view)
- Sign-out button clears localStorage and redirects to login

**Trade-off:** Anyone can impersonate any name. Acceptable for this assignment's scope.

---

## Decision 9 — Frontend: React + Vite (not Next.js)

**Context:** Needed a frontend framework.

**Options Considered:**
1. Plain HTML/JS — too hard to manage state and routing
2. **React + Vite** ← chosen
3. Next.js — SSR is unnecessary overhead for a client-only dashboard

**Why Vite:**
- HMR (Hot Module Replacement) is instant — much faster than CRA
- Simple config, zero boilerplate
- `npm run dev` serves on port 5173, backend on 5000 — clean separation

---

## Decision 10 — Display Sign for Balances: Use `Math.abs()` + Label Text

**Context:** The balance calculation returns negative numbers for debtors. Displaying "Rohan ₹-13542.84 owes" is redundant and confusing.

**Decision:** Wrap all balance values in `Math.abs()` before rendering. Use label text ("owes" / "gets back") and color (red / green) to communicate direction.

**Why:** Cleaner, less confusing UI. The sign is already communicated twice (by color and by text) — the raw negative number adds no information and looks wrong.

---

## Decision 11 — Settle Up: Cap Payment at Outstanding Amount

**Context:** In the Settle Up modal, a user could previously type any amount — including more than they owe.

**Decision:** When the from/to pair is selected, auto-fill the amount field with the exact simplified debt amount. Block "Record Payment" if the user enters more than the outstanding amount.

**Why:** Prevents accidental over-payment. The system now shows: "Max: ₹13,542.84" so the user knows the limit.
