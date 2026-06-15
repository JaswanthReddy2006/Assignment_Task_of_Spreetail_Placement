# SCOPE.md — Anomaly Log & Database Schema

## Project Scope

FairShare manages shared flat expenses for Aisha, Rohan, Priya, Meera, and Sam (a later joiner). It imports a CSV of past expenses, detects data problems, and lets the user fix them interactively before saving anything to the database.

---

## Anomaly Log — Every Problem Found in `expenses_export.csv`

The importer uses two passes:
1. **Per-row pass** — checks each row as it is read from the CSV stream
2. **Post-pass** — groups rows by description to detect duplicates/conflicts after all rows are loaded

### Anomaly 1 — Missing Payer

- **Problem:** One or more rows had a blank `paid_by` field.
- **How Detected:** The system checks if the payer field is empty or contains only whitespace.
- **Policy:** Surfaced to the user. The row's payer field is highlighted in red, and the import is blocked until a valid name is provided.
- **Action:** The user manually inputs the correct payer name in the UI.

---

### Anomaly 2 — Amount Has Commas (e.g. `1,500.00`)

- **Problem:** Some amount values contained comma separators (e.g. `1,500.00`) which break standard number parsing.
- **How Detected:** The system scans the amount values for commas.
- **Policy:** Auto-corrected: commas are automatically stripped from the value upon ingestion. The user is shown the cleaned value for confirmation.
- **Action:** Commas are auto-removed, and the user confirms the updated value.

---

### Anomaly 3 — Zero Amount

- **Problem:** A row had `amount = 0`, which means no money was actually spent — it is useless data.
- **How Detected:** The system checks if the parsed numeric value of the amount is exactly zero.
- **Policy:** Flagged as an issue. The user must explicitly decide whether to keep the row or drop it.
- **Action:** The user dropped the row from the import.

---

### Anomaly 4 — Missing Currency

- **Problem:** Some rows had no value in the `currency` column.
- **How Detected:** The system checks if the currency field is blank or missing.
- **Policy:** Auto-suggested to default to `INR`. The user can edit the value if it should be different.
- **Action:** The user accepts the default `INR` selection.

---

### Anomaly 5 — Foreign Currency (USD, EUR, GBP, etc.)

- **Problem:** Dev's trip expenses were recorded in foreign currencies (like USD, EUR, or GBP). Treating these values as INR directly would cause significant under-calculations.
- **How Detected:** The system checks if the currency field is not equal to `INR`.
- **Policy:** Flagged for conversion. The user is provided an option to automatically convert the amount. If selected, the application calls the currency converter using historical exchange rates for the expense date. If the external exchange API fails, predefined historical fallback rates are applied.
- **Action:** The user initiates conversion, and the system automatically converts the foreign amount to INR.

---

### Anomaly 6 — Ambiguous Date: `04-05-2026`

- **Problem:** The date `04-05-2026` is ambiguous — it could mean April 5 (DD-MM) or May 4 (MM-DD) depending on locale.
- **How Detected:** The system checks for the specific ambiguous date string.
- **Policy:** Flagged in the UI with a prompt asking the user to clarify whether the date represents April 5 or May 4.
- **Action:** The user clicks a button to select the correct date, which updates the field accordingly.

---

### Anomaly 7 — Invalid Date Format: `Mar-14`

- **Problem:** Date was entered as `Mar-14`, which is not a valid parseable date format.
- **How Detected:** The system flags any date string that does not conform to the standard DD-MM-YYYY date format.
- **Policy:** Flagged with an auto-suggested correction to a valid format (e.g., `14-03-2026`).
- **Action:** The user accepts the suggested format or edits it manually to correct the date.

---

### Anomaly 8 — Conflicting Split Type (equal + share details)

- **Problem:** A row had `split_type = equal` but `split_details` contained share ratios (e.g. `Aisha 2;Rohan 1`). These contradict each other — equal split ignores details.
- **How Detected:** The system checks if the split type is `equal` while the split details contain specific ratio or share values.
- **Policy:** Flagged as a conflict. The user must resolve the contradiction by either changing the split type or clearing the split details.
- **Action:** The user changes the split type to `share` to match the details.

---

### Anomaly 9 — Missing Split Type

- **Problem:** Some rows had no `split_type` at all, making it impossible to calculate how much each person owes.
- **How Detected:** The system checks if the split type field is blank (excluding rows identified as repayments or settlements).
- **Policy:** Flagged. The user must select from: equal, unequal, percentage, share.
- **Action:** The user selects the appropriate split type for each flagged row in the UI.

---

### Anomaly 10 — Inactive Member (Meera) Included After Move-Out

- **Problem:** Meera moved out at end of March 2026. Some April/May expenses still list her in `split_with`, which would incorrectly charge her for things she wasn't part of.
- **How Detected:** The system checks if the expense date is after March 31, 2026, and Meera is listed in the split members.
- **Policy:** Flagged with a warning. The user must remove Meera from the split since she was no longer a resident.
- **Action:** The user removes Meera's name from the split details.

---

### Anomaly 11 — Unregistered Guest (Kabir) in Split

- **Problem:** The name `Kabir` appeared in `split_with` but was never a flatmate — he was a one-time guest.
- **How Detected:** The system checks if any name in the split list does not match the registered flatmates list.
- **Policy:** Flagged. The user must remove Kabir or map the cost to an existing member.
- **Action:** The user removes Kabir from the split list.

---

### Anomaly 12 — Percentages Do Not Sum to 100%

- **Problem:** Percentage-split rows where the `split_details` values did not add up to 100%, making the distribution mathematically invalid.
- **How Detected:** The system parses the percentages from the split details and verifies if their sum is exactly 100%.
- **Policy:** Flagged in the UI showing the incorrect sum. The user must adjust the percentages. If not resolved by the user, the backend automatically normalizes the percentages proportionally upon final submission.
- **Action:** The user edits the percentages to sum to 100%.

---

### Anomaly 13 — Duplicate / Conflicting Rows (Post-Pass Detection)

- **Problem:** The same expense description appears in multiple rows — either logged twice by the same person (duplicate), or logged by two different people with different amounts (conflict). Importing both would double-count the expense.
- **How Detected:** After scanning all rows, a post-pass grouping algorithm groups records by description and date. Groups with two or more entries are flagged.
- **Policy:** Flagged as a conflict group. The system marks the entry with the highest amount as the recommended keep and flags the others as duplicates.
- **Action:** The user reviews the conflict group, keeps the valid entry, and drops the duplicates.

---

### Anomaly 14 — Settlement Logged as an Expense (Auto-Routed)

- **Problem:** Some rows describe a repayment (e.g. "Rohan paid back Aisha", "deposit return") — these are settlements, not expenses.
- **How Detected:** The system checks the description for terms indicating repayment or deposit.
- **Policy:** Auto-routed. These rows are automatically saved to the settlements table rather than the expenses table.
- **Action:** The system saves the row directly to the settlements table.

---

## Database Schema

**Database:** MySQL — hosted on **AWS RDS**  
**ORM:** Sequelize  
**Database name:** `shared_expenses` (auto-created on first run via `CREATE DATABASE IF NOT EXISTS`)  
**Fallback:** If no `DATABASE_URL` env var is set, the app falls back to a local **SQLite** file (`database.sqlite`) — used for local development without AWS credentials.

---

### Table: `Users`

| Column | Type    | Constraints        | Notes                   |
|--------|---------|--------------------|-------------------------|
| id     | INTEGER | PK, autoIncrement  |                         |
| name   | STRING  | NOT NULL, UNIQUE   | Flatmate's display name |
| email  | STRING  | nullable           | Not used in current UI  |

---

### Table: `Groups`

| Column | Type   | Constraints       | Notes              |
|--------|--------|-------------------|--------------------|
| id     | INTEGER | PK, autoIncrement |                    |
| name   | STRING  | NOT NULL          | e.g. "Flatmates"  |

---

### Table: `GroupMembers`

| Column    | Type     | Constraints           | Notes                              |
|-----------|----------|-----------------------|------------------------------------|
| id        | INTEGER  | PK, autoIncrement     |                                    |
| group_id  | INTEGER  | NOT NULL, FK → Groups |                                    |
| user_id   | INTEGER  | NOT NULL, FK → Users  |                                    |
| joined_at | DATEONLY | NOT NULL              | When this person joined the flat   |
| left_at   | DATEONLY | nullable              | When they left (null = still there)|

---

### Table: `Expenses`

| Column      | Type     | Constraints           | Notes                                        |
|-------------|----------|-----------------------|----------------------------------------------|
| id          | INTEGER  | PK, autoIncrement     |                                              |
| group_id    | INTEGER  | NOT NULL, FK → Groups |                                              |
| description | STRING   | NOT NULL              |                                              |
| date        | DATEONLY | NOT NULL              |                                              |
| amount      | FLOAT    | NOT NULL              | Always stored in INR after import conversion |
| currency    | STRING   | default: 'INR'        | Post-conversion, always INR                  |
| paid_by_id  | INTEGER  | NOT NULL, FK → Users  | Who paid upfront                             |
| split_type  | STRING   | NOT NULL              | equal / unequal / percentage / share         |

---

### Table: `ExpenseSplits`

| Column           | Type    | Constraints             | Notes                                      |
|------------------|---------|-------------------------|--------------------------------------------|
| id               | INTEGER | PK, autoIncrement       |                                            |
| expense_id       | INTEGER | NOT NULL, FK → Expenses |                                            |
| user_id          | INTEGER | NOT NULL, FK → Users    | The person who owes this share             |
| allocated_amount | FLOAT   | NOT NULL                | Pre-computed amount this person owes       |
| percentage       | FLOAT   | nullable                | Stored for percentage-type splits          |
| share            | FLOAT   | nullable                | Stored for share-type splits (ratio value) |

---

### Table: `Settlements`

| Column      | Type     | Constraints           | Notes                        |
|-------------|----------|-----------------------|------------------------------|
| id          | INTEGER  | PK, autoIncrement     |                              |
| group_id    | INTEGER  | NOT NULL, FK → Groups |                              |
| paid_by_id  | INTEGER  | NOT NULL, FK → Users  | Who paid (the debtor paying) |
| paid_to_id  | INTEGER  | NOT NULL, FK → Users  | Who received (the creditor)  |
| amount      | FLOAT    | NOT NULL              |                              |
| date        | DATEONLY | NOT NULL              |                              |

---

### Relationships (from `models/index.js`)

```
User ↔ Group          via GroupMember (many-to-many, with join/leave dates)
Expense → Group        (many-to-one)
Expense → User         as "Payer" via paid_by_id
Expense → ExpenseSplit (one-to-many)
ExpenseSplit → User    (many-to-one, the person who owes)
Settlement → Group     (many-to-one)
Settlement → User      as "Payer" (paid_by_id)
Settlement → User      as "Payee" (paid_to_id)
```
