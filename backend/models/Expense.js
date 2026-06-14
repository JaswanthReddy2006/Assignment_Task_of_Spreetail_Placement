const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Expense = sequelize.define('Expense', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  group_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  description: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  amount: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'INR',
  },
  paid_by_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  split_type: {
    type: DataTypes.STRING, // equal, unequal, percentage, share
    allowNull: false,
  }
}, {
  timestamps: false
});

module.exports = Expense;
