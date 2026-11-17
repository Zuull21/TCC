const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { PLACE_CATEGORIES, ALERT_LEVELS, PLACE_TYPES } = require('../config/constants');

const Place = sequelize.define(
  'Place',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    address: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: false,
      validate: { min: -90, max: 90 },
    },
    longitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: false,
      validate: { min: -180, max: 180 },
    },
    category: {
      type: DataTypes.ENUM(...PLACE_CATEGORIES),
      allowNull: false,
    },
    is_free: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    image_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    // Autor e licença da foto (exigido por licenças Creative Commons)
    image_credit: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    created_by: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    avg_rating: {
      type: DataTypes.DECIMAL(2, 1),
      allowNull: false,
      defaultValue: 0.0,
    },
    review_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    alert_level: {
      type: DataTypes.ENUM(...ALERT_LEVELS),
      allowNull: false,
      defaultValue: 'none',
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    state: {
      type: DataTypes.CHAR(2),
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM(...PLACE_TYPES),
      allowNull: false,
      defaultValue: 'tourist',
    },
    event_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    event_start_time: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    event_end_time: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    max_attendees: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    attendee_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'places',
    indexes: [
      { fields: ['category'] },
      { fields: ['alert_level'] },
      { fields: ['latitude', 'longitude'] },
      { fields: ['created_by'] },
    ],
  }
);

module.exports = Place;
