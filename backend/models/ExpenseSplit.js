const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const ExpenseSplit = sequelize.define('ExpenseSplit', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  expense_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  allocated_amount: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  percentage: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  share: {
    type: DataTypes.FLOAT,
    allowNull: true,
  }
}, {
  timestamps: false
});

module.exports = ExpenseSplit;
