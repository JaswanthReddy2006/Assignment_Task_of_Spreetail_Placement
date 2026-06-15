const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { sequelize } = require('./models');

const importController = require('./controllers/importController');
const expenseController = require('./controllers/expenseController');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Import Routes
app.post('/api/import-analyze', upload.single('file'), importController.analyzeCsv);
app.post('/api/import-confirm', importController.confirmCsv);
app.get('/api/import-report/download', (req, res) => {
  const path = require('path');
  const reportPath = path.join(__dirname, 'import_report.txt');
  if (require('fs').existsSync(reportPath)) {
    res.download(reportPath, 'import_report.txt');
  } else {
    res.status(404).json({ error: 'No import report found. Please import a CSV first.' });
  }
});

// Dashboard Data
app.get('/api/balances', expenseController.getBalances);
app.get('/api/debts', expenseController.getSimplifiedDebts);
app.get('/api/expenses', expenseController.getAllExpenses);

// Users & Groups
app.get('/api/users', expenseController.getUsers);
app.get('/api/groups', expenseController.getGroups);
app.put('/api/groups/:id/members', expenseController.updateGroupMember);

// Manual Expense & Settlement
app.get('/api/convert-currency', async (req, res) => {
  try {
    const { from, to, amount, date } = req.query;
    if (!from || !to || !amount) {
      return res.status(400).json({ error: 'Missing required parameters: from, to, amount' });
    }
    const parsedAmount = parseFloat(amount);
    const parsedDate = date || new Date().toISOString().split('T')[0];
    const converted = await importController.currency_converter(from, parsedAmount, to, parsedDate);
    if (converted !== null) {
      return res.json({ amount: parseFloat(converted.toFixed(2)) });
    } else {
      // Fallback conversion rates if API fails
      let rate = 1;
      if (from === 'USD' && to === 'INR') rate = 83.0;
      else if (from === 'EUR' && to === 'INR') rate = 90.0;
      else if (from === 'GBP' && to === 'INR') rate = 105.0;
      else if (from === 'INR' && to === 'USD') rate = 1 / 83.0;
      return res.json({ amount: parseFloat((parsedAmount * rate).toFixed(2)), fallback: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', expenseController.createExpense);
app.post('/api/settlements', expenseController.createSettlement);

const PORT = process.env.PORT || 5000;

sequelize.sync({ force: true }).then(() => {
  console.log('Database synced');
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
