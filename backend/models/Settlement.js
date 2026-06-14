const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Settlement = sequelize.define('Settlement', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  group_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  paid_by_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  paid_to_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  amount: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  }
}, {
  timestamps: false
});

module.exports = Settlement;
