const { User, Group, GroupMember, Expense, ExpenseSplit, Settlement } = require('../models');

exports.getBalances = async (req, res) => {
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

    const result = users.map(u => ({
      id: u.id,
      name: u.name,
      balance: parseFloat(balances[u.id].toFixed(2))
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const users = await User.findAll();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getGroups = async (req, res) => {
  try {
    const groups = await Group.findAll({
      include: [{
        model: GroupMember,
        include: [User]
      }]
    });
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateGroupMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_name, action, left_at, joined_at } = req.body;

    let user = await User.findOne({ where: { name: user_name } });
    if (!user) user = await User.create({ name: user_name });

    if (action === 'add') {
      const exists = await GroupMember.findOne({ where: { group_id: id, user_id: user.id } });
      if (!exists) {
        await GroupMember.create({
          group_id: id,
          user_id: user.id,
          joined_at: joined_at || new Date().toISOString().split('T')[0]
        });
      }
    } else if (action === 'remove') {
      await GroupMember.update(
        { left_at: left_at || new Date().toISOString().split('T')[0] },
        { where: { group_id: id, user_id: user.id } }
      );
    }

    res.json({ message: 'Member updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createExpense = async (req, res) => {
  try {
    const { description, amount, currency, paid_by, split_type, split_with, split_details, date } = req.body;

    let group = await Group.findOne({ where: { name: 'Flatmates' } });
    if (!group) group = await Group.create({ name: 'Flatmates' });

    let payer = await User.findOne({ where: { name: paid_by } });
    if (!payer) payer = await User.create({ name: paid_by });

    const expense = await Expense.create({
      group_id: group.id,
      description,
      date: date || new Date(),
      amount: parseFloat(amount),
      currency: currency || 'INR',
      paid_by_id: payer.id,
      split_type: split_type || 'equal'
    });

    const names = split_with ? split_with.split(';').map(n => n.trim()) : [];

    if (split_type === 'equal') {
      for (let name of names) {
        let user = await User.findOne({ where: { name } });
        if (!user) user = await User.create({ name });
        await ExpenseSplit.create({
          expense_id: expense.id,
          user_id: user.id,
          allocated_amount: parseFloat(amount) / names.length
        });
      }
    } else if (split_type === 'unequal' || split_type === 'percentage' || split_type === 'share') {
      const parts = split_details ? split_details.split(';') : [];
      let totalShares = 0;

      if (split_type === 'share') {
        parts.forEach(p => {
          const val = p.trim().split(' ')[1];
          if (val) totalShares += parseFloat(val);
        });
      }

      for (let part of parts) {
        const tokens = part.trim().split(' ');
        const name = tokens[0];
        const val = tokens[1];
        if (!name || !val) continue;

        let user = await User.findOne({ where: { name } });
        if (!user) user = await User.create({ name });

        let allocated;
        if (split_type === 'unequal') {
          allocated = parseFloat(val);
        } else if (split_type === 'percentage') {
          const pct = parseFloat(val.replace('%', ''));
          allocated = (pct / 100) * parseFloat(amount);
        } else {
          allocated = (parseFloat(val) / totalShares) * parseFloat(amount);
        }

        await ExpenseSplit.create({
          expense_id: expense.id,
          user_id: user.id,
          allocated_amount: allocated,
          percentage: split_type === 'percentage' ? parseFloat(val.replace('%', '')) : null,
          share: split_type === 'share' ? parseFloat(val) : null
        });
      }
    }

    res.json({ message: 'Expense created', id: expense.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createSettlement = async (req, res) => {
  try {
    const { from_name, to_name, amount } = req.body;

    let group = await Group.findOne({ where: { name: 'Flatmates' } });
    if (!group) group = await Group.create({ name: 'Flatmates' });

    let payer = await User.findOne({ where: { name: from_name } });
    if (!payer) return res.status(400).json({ error: 'Payer not found' });

    let payee = await User.findOne({ where: { name: to_name } });
    if (!payee) return res.status(400).json({ error: 'Payee not found' });

    await Settlement.create({
      group_id: group.id,
      paid_by_id: payer.id,
      paid_to_id: payee.id,
      amount: parseFloat(amount),
      date: new Date()
    });

    res.json({ message: 'Settlement recorded' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
