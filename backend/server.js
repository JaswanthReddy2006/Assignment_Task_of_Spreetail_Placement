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

// Routes
app.post('/api/import-analyze', upload.single('file'), importController.analyzeCsv);
app.post('/api/import-confirm', importController.confirmCsv);
app.get('/api/balances', expenseController.getBalances);
app.get('/api/debts', expenseController.getSimplifiedDebts);
app.get('/api/expenses', expenseController.getAllExpenses);

const PORT = process.env.PORT || 5000;

sequelize.sync({ force: true }).then(() => {
  console.log('Database synced');
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
