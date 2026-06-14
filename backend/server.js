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

// Dashboard Data
app.get('/api/balances', expenseController.getBalances);
app.get('/api/debts', expenseController.getSimplifiedDebts);
app.get('/api/expenses', expenseController.getAllExpenses);

// Users & Groups
app.get('/api/users', expenseController.getUsers);
app.get('/api/groups', expenseController.getGroups);
app.put('/api/groups/:id/members', expenseController.updateGroupMember);

// Manual Expense & Settlement
app.post('/api/expenses', expenseController.createExpense);
app.post('/api/settlements', expenseController.createSettlement);

const PORT = process.env.PORT || 5000;

sequelize.sync({ force: true }).then(() => {
  console.log('Database synced');
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
