const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Quem curtiu cada post: no máximo uma curtida por usuário.
const PostLike = sequelize.define(
  'PostLike',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    post_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
  },
  {
    tableName: 'post_likes',
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['post_id', 'user_id'] },
      { fields: ['user_id'] },
    ],
  }
);

module.exports = PostLike;
