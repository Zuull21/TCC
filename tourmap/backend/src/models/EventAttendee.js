const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const EventAttendee = sequelize.define(
  'EventAttendee',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    event_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('going', 'maybe'),
      allowNull: false,
      defaultValue: 'going',
    },
  },
  {
    tableName: 'event_attendees',
    indexes: [
      { unique: true, fields: ['event_id', 'user_id'] },
      { fields: ['user_id'] },
    ],
  }
);

module.exports = EventAttendee;
