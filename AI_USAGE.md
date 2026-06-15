# AI_USAGE.md — AI Tool Usage Log

## AI Tools Used

**Primary Tool:** Antigravity (Google DeepMind AI coding assistant)  
**Usage:** Pair programming. I described requirements in detail, the AI generated code, and I reviewed every file — catching bugs, directing corrections, and making all key product decisions.

---

## Key Prompts Used

1. *"Build a full-stack shared flat expenses app. Backend: Node.js + Express + Sequelize ORM + MySQL on AWS RDS. Frontend: React + Vite. Features: login module (name picker), group management with joined/left dates, expense CRUD with equal/unequal/percentage/share splits, CSV import with interactive anomaly resolution, balance summary, greedy debt simplification, and settle-up modal."*

2. *"Implement a CSV importer that detects these anomalies: missing payer, amount with commas, zero amount, missing currency, foreign currency, ambiguous date 04-05-2026, invalid date Mar-14, conflicting split type (equal + share details), missing split type, inactive member Meera after March 2026, unregistered guest Kabir, percentage not summing to 100%, and potential duplicate rows."*

3. *"Make duplicate detection a post-pass algorithm. After reading all rows, group them by normalized description. Any group with 2+ rows is a conflict group. Assign a conflictGroupId and mark the row with the highest amount as 'suggested-keep', others as 'duplicate'. Show them together in a red CONFLICT GROUP box in the UI."*

4. *"In db.js, fix the AWS RDS connection. The DATABASE_URL points to the default 'mysql' system database which AWS denies access to. Use mysql2/promise to run CREATE DATABASE IF NOT EXISTS shared_expenses before Sequelize connects."*

5. *"After import confirm, generate an import_report.txt on the backend. Log every row action: DROPPED, IMPORTED, CONVERTED, SETTLEMENT, SKIPPED. Write to backend/import_report.txt and add a GET /api/import-report/download endpoint. Show a Download Report (.txt) button in the import report screen."*

6. *"In the dashboard, show the user's personal balance breakdown: who I owe and exactly which expenses caused it, and who owes me and how much. Use Math.abs() on all balance amounts — direction is communicated by label text and color, not by sign."*

---

## Cases Where the AI Produced Something Wrong

### Case 1 — Negative Sign Leaking into Balance Display

**What the AI did:**  
The balance cards showed `₹-13542.84 owes`. The raw negative balance number from the database was rendered directly, even though the label "owes" already communicated the direction.

**How I caught it:**  
I looked at the dashboard and saw `Rohan ₹-13542.84 owes`. The negative sign is redundant and looks wrong — the word "owes" already means the number is a debt.

**What I changed:**  
I told the AI to wrap all balance values in `Math.abs()`. The AI initially applied it only to the personal balance card. I noticed the group balance cards still showed negative signs. I directed the AI to apply `Math.abs()` consistently to all balance displays across the dashboard.

---

### Case 2 — Currency API Crash: `Cannot read properties of undefined (reading 'INR')`

**What the AI did:**  
The original `currency_converter` function accessed `api_data.data[date][target_currency]` directly — hardcoding the exact date string as the key into the API response.

```js
// AI-generated (wrong):
const exchange_rate = api_data.data[date][target_currency];
```

**How I caught it:**  
The server console showed `TypeError: Cannot read properties of undefined (reading 'INR')`. The API was returning data correctly, but the date key in the response was formatted slightly differently (or the API returned an error shape with no `data` property at all).

**What I changed:**  
I directed the AI to add defensive checks:
```js
// Fixed version:
if (!api_data || !api_data.data) return null;
const dateKeys = Object.keys(api_data.data);
if (dateKeys.length === 0) return null;
const rateData = api_data.data[dateKeys[0]];  // use first available key, not hardcoded date
if (!rateData || rateData[target_currency] === undefined) return null;
const exchange_rate = rateData[target_currency];
```
This makes the function robust to API response shape variations and always falls back to hardcoded rates if anything goes wrong.

---

### Case 3 — Syntax Error from Mismatched Braces After Edit

**What the AI did:**  
After adding the import report generation code to `confirmCsv`, the AI introduced a mismatched closing brace. The `else if (split_type === 'share')` block had one `}` instead of two, leaving the `for (let row of cleanData)` loop unclosed before the `catch` block.

**How I caught it:**  
Running `node server.js` failed immediately with:  
```
SyntaxError: Unexpected token 'catch'
```
The error pointed to line 406.

**What I changed:**  
I identified the exact location using the file viewer, counted the brace depth manually, and directed the AI to add the missing closing brace for the `else if (share)` block. After the fix:
```
} // closes else if (share)
} // closes for (let row of cleanData)
```
Then I verified by running `node -e "require('./controllers/importController')"` which passed cleanly.

---

### Case 4 — `force: true` Wiped All Data on Server Restart

**What the AI did:**  
The initial `server.js` used `sequelize.sync({ force: true })`. This drops and recreates all tables every time the server starts.

**How I caught it:**  
I imported the CSV, verified all data was saved to the database, then restarted the server to fix an unrelated bug. On page reload, the dashboard showed zero balances — all data was gone.

**What I changed:**  
I understood the problem (the AI explained it when I asked). For this assignment `force: true` is kept intentionally because the demo flow involves re-importing the CSV each time. In a real production app this would be replaced with `sync({ alter: true })` or Sequelize migration files. I documented this trade-off in DECISIONS.md.

---

### Case 5 — AWS RDS `ER_DBACCESS_DENIED_ERROR` on First Connection

**What the AI did:**  
The initial `DATABASE_URL` in `.env` pointed to the system `mysql` database (the URL path was `/mysql`). AWS RDS restricts access to the system `mysql` database for non-root IAM users.

**How I caught it:**  
`node server.js` failed at startup with:
```
ER_DBACCESS_DENIED_ERROR: Access denied for user 'admin'@... to database 'mysql'
```
I identified that the URL path segment was being used as the database name.

**What I changed:**  
I directed the AI to fix `db.js` to detect when the database name from the URL is empty or `mysql`, and default to `shared_expenses`:
```js
let database = connectionUrl.pathname.substring(1);
if (!database || database === 'mysql') {
  database = 'shared_expenses';
}
```
Then added a pre-sync step that uses `mysql2/promise` (without specifying a database) to run `CREATE DATABASE IF NOT EXISTS shared_expenses` before Sequelize takes over. This makes the database auto-create on first run without requiring any manual setup.

---

### Case 6 — Warning Tags Not Clearing After User Fixed the Issue

**What the AI did:**  
After a user changed the currency of a row from USD to INR, the "Foreign Currency (USD)" issue tag was still displayed. The AI's initial implementation checked issues against the original `rowAnomaly` object from the server, not against the current edited state of the row.

**How I caught it:**  
I converted a USD row using the checkbox, saw the amount update, but the red "Foreign Currency (USD)" tag was still there. Same issue happened with "Missing Payer" after I entered a name.

**What I changed:**  
I directed the AI to implement a `getActiveIssues(row, rowAnomaly)` function that re-evaluates each issue in real-time against the current `row` values in state:
```js
const getActiveIssues = (row, rowAnomaly) => {
  return rowAnomaly.issues.filter(issue => {
    if (issue.startsWith('Foreign Currency') && row.currency === 'INR') return false;
    if (issue === 'Missing Payer' && row.paid_by && row.paid_by.trim()) return false;
    // ... etc for each anomaly type
    return true;
  });
};
```
This function is called on every render, so issue tags disappear the moment the user corrects the field — no need to click a "check" button.

---

## My Role as Engineer

- Reviewed every generated file before it entered the codebase
- Tested every feature in the browser; caught all 6 bugs documented above
- Made all key product decisions (see DECISIONS.md) — the AI implemented what I specified
- Directed the AI with precise, technical prompts; never used vague instructions like "fix this"
- Understood the balance calculation and debt simplification algorithm well enough to trace it by hand
