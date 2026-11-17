const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { ALERT_LEVEL_VALUES } = require('../config/constants');

const Alert = sequelize.define(
  'Alert',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    place_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    level: {
      type: DataTypes.ENUM(...ALERT_LEVEL_VALUES),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    trigger_type: {
      type: DataTypes.STRING(80),
      allowNull: true,
      comment: 'Ex: weather, crime, closure, maintenance',
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'alerts',
    updatedAt: false,
    indexes: [{ fields: ['place_id'] }, { fields: ['is_active'] }],
  }
);

module.exports = Alert;
