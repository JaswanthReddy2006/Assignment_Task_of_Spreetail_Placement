const { User, Group, Expense, ExpenseSplit, Settlement } = require('../models');

exports.getBalances = async (req, res) => {
  try {
    const users = await User.findAll();
    const expenses = await Expense.findAll({ include: [ExpenseSplit] });
    const settlements = await Settlement.findAll();

    const balances = {}; // { userId: balance }
    users.forEach(u => balances[u.id] = 0);

    // Add what they paid
    expenses.forEach(exp => {
      balances[exp.paid_by_id] += exp.amount;
      // Subtract what they owe
      exp.ExpenseSplits.forEach(split => {
        balances[split.user_id] -= split.allocated_amount;
      });
    });

    // Add settlements
    settlements.forEach(settle => {
      balances[settle.paid_by_id] += settle.amount;
      balances[settle.paid_to_id] -= settle.amount;
    });

    // Map names
    const result = users.map(u => ({
      id: u.id,
      name: u.name,
      balance: balances[u.id]
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSimplifiedDebts = async (req, res) => {
  try {
    const users = await User.findAll();
    const expenses = await Expense.findAll({ include: [ExpenseSplit] });
    const settlements = await Settlement.findAll();

    const balances = {}; 
    users.forEach(u => balances[u.id] = 0);

    expenses.forEach(exp => {
      balances[exp.paid_by_id] += exp.amount;
      exp.ExpenseSplits.forEach(split => {
        balances[split.user_id] -= split.allocated_amount;
      });
    });

    settlements.forEach(settle => {
      balances[settle.paid_by_id] += settle.amount;
      balances[settle.paid_to_id] -= settle.amount;
    });

    // Separate into debtors (balance < 0) and creditors (balance > 0)
    let debtors = [];
    let creditors = [];

    for (let [userId, bal] of Object.entries(balances)) {
      if (bal < -0.01) debtors.push({ id: parseInt(userId), amount: -bal });
      if (bal > 0.01) creditors.push({ id: parseInt(userId), amount: bal });
    }

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const transactions = [];

    let d = 0, c = 0;
    while (d < debtors.length && c < creditors.length) {
      let debtor = debtors[d];
      let creditor = creditors[c];

      let amount = Math.min(debtor.amount, creditor.amount);
      
      const debtorUser = users.find(u => u.id === debtor.id);
      const creditorUser = users.find(u => u.id === creditor.id);

      transactions.push({
        from: debtorUser.name,
        to: creditorUser.name,
        amount: parseFloat(amount.toFixed(2))
      });

      debtor.amount -= amount;
      creditor.amount -= amount;

      if (debtor.amount < 0.01) d++;
      if (creditor.amount < 0.01) c++;
    }

    res.json(transactions);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllExpenses = async (req, res) => {
  try {
    const expenses = await Expense.findAll({
      include: [
        { model: User, as: 'Payer' },
        { model: ExpenseSplit, include: [User] }
      ],
      order: [['date', 'DESC']]
    });
    res.json(expenses);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
};
