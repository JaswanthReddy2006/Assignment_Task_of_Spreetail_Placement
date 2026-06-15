# Shared Expenses App

A full-stack (React + Node.js/Express + SQLite) application designed to manage group expenses, calculate complex splits, and automatically parse and clean messy CSV data.

## Features
- **CSV Importer Engine**: Automatically parses, cleanses, and flags anomalies (duplicates, missing payers, USD conversion, invalid percentages) from an input CSV, providing a rich Import Report.
- **Dynamic Group Memberships**: Members can join and leave at specific dates. Expenses automatically exclude members who were not active during the expense date.
- **Complex Split Types**: Supports equal, unequal, percentage, and explicit share splits.
- **Debt Simplification**: Calculates "Who owes whom" with minimal transactions.

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- npm or yarn

### 1. Backend Setup
1. Open a terminal and navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server (this will automatically initialize the SQLite DB):
   ```bash
   npm start
   ```
   The backend will run on `http://localhost:5000`.

### 2. Frontend Setup
1. Open a new terminal and navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Open the application in your browser (usually `http://localhost:5173`).

### 3. Usage & Testing
1. On the frontend, navigate to the **Import Data** section.
2. Upload the provided `expenses_export.csv`.
3. View the **Import Report** to see all anomalies that were handled.
4. Navigate to the **Dashboard** to view the resulting balances and simplified debts.
