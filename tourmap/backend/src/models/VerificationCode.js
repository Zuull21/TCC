const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const VerificationCode = sequelize.define(
  'VerificationCode',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    code: {
      type: DataTypes.CHAR(6),
      allowNull: false,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    used: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: 'verification_codes',
    updatedAt: false,
    indexes: [{ fields: ['user_id'] }, { fields: ['code'] }],
  }
);

module.exports = VerificationCode;
