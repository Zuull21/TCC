const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const OrganizerReview = sequelize.define(
  'OrganizerReview',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    reviewer_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    organizer_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    event_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    rating: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      validate: { min: 1, max: 5 },
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'organizer_reviews',
    indexes: [
      { unique: true, fields: ['reviewer_id', 'event_id'] },
      { fields: ['organizer_id'] },
    ],
  }
);

module.exports = OrganizerReview;
