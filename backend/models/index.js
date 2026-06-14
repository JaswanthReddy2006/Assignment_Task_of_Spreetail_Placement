const sequelize = require('../db');
const User = require('./User');
const Group = require('./Group');
const GroupMember = require('./GroupMember');
const Expense = require('./Expense');
const ExpenseSplit = require('./ExpenseSplit');
const Settlement = require('./Settlement');

// User and Group (Many to Many through GroupMember)
User.belongsToMany(Group, { through: GroupMember, foreignKey: 'user_id' });
Group.belongsToMany(User, { through: GroupMember, foreignKey: 'group_id' });
GroupMember.belongsTo(User, { foreignKey: 'user_id' });
GroupMember.belongsTo(Group, { foreignKey: 'group_id' });
User.hasMany(GroupMember, { foreignKey: 'user_id' });
Group.hasMany(GroupMember, { foreignKey: 'group_id' });

// Expense Associations
Expense.belongsTo(Group, { foreignKey: 'group_id' });
Group.hasMany(Expense, { foreignKey: 'group_id' });

Expense.belongsTo(User, { as: 'Payer', foreignKey: 'paid_by_id' });
User.hasMany(Expense, { foreignKey: 'paid_by_id' });

// ExpenseSplit Associations
ExpenseSplit.belongsTo(Expense, { foreignKey: 'expense_id' });
Expense.hasMany(ExpenseSplit, { foreignKey: 'expense_id' });

ExpenseSplit.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(ExpenseSplit, { foreignKey: 'user_id' });

// Settlement Associations
Settlement.belongsTo(Group, { foreignKey: 'group_id' });
Group.hasMany(Settlement, { foreignKey: 'group_id' });

Settlement.belongsTo(User, { as: 'Payer', foreignKey: 'paid_by_id' });
Settlement.belongsTo(User, { as: 'Payee', foreignKey: 'paid_to_id' });

module.exports = {
  sequelize,
  User,
  Group,
  GroupMember,
  Expense,
  ExpenseSplit,
  Settlement
};
