const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const GroupMember = sequelize.define('GroupMember', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  group_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  joined_at: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  left_at: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  }
}, {
  timestamps: false
});

module.exports = GroupMember;
