/**
 * Migrações aditivas executadas no boot, antes de o servidor aceitar requisições.
 *
 * Em produção o Sequelize não altera tabelas (sync sem alter), então colunas novas
 * precisam ser criadas aqui. Só adiciona: nunca remove nem altera dados existentes.
 */
const { DataTypes } = require('sequelize');

const ADDED_COLUMNS = [
  { table: 'places', column: 'image_credit', spec: { type: DataTypes.STRING(300), allowNull: true } },
];

async function runMigrations(sequelize) {
  const qi = sequelize.getQueryInterface();
  const tables = (await qi.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName));

  for (const { table, column, spec } of ADDED_COLUMNS) {
    if (!tables.includes(table)) continue; // banco novo: o sync cria a tabela já completa
    const cols = await qi.describeTable(table);
    if (!cols[column]) {
      await qi.addColumn(table, column, spec);
      console.log(`[DB] Coluna ${table}.${column} adicionada.`);
    }
  }
}

module.exports = { runMigrations };
