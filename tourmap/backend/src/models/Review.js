const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { SENTIMENT_LABELS } = require('../config/constants');

const Review = sequelize.define(
  'Review',
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
    place_id: {
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
    sentiment: {
      type: DataTypes.ENUM(...SENTIMENT_LABELS),
      allowNull: true,
    },
    sentiment_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Score normalizado 0.0 – 1.0 retornado pela IA',
    },
  },
  {
    tableName: 'reviews',
    indexes: [
      { unique: true, fields: ['user_id', 'place_id'] },
      { fields: ['place_id'] },
    ],
  }
);

module.exports = Review;
