#!/usr/bin/env node
/**
 * Remove todos os usuários comuns do banco (mantém o admin).
 * Uso: node scripts/clearUsers.js
 */

require('dotenv').config();
const readline = require('readline');
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host:    process.env.DB_HOST || 'localhost',
    port:    Number(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    logging: false,
  }
);

async function run() {
  await sequelize.authenticate();

  const [rows] = await sequelize.query(
    "SELECT COUNT(*) AS total FROM users WHERE role != 'admin'",
    { type: Sequelize.QueryTypes.SELECT }
  );
  const total = rows.total;

  if (total === 0) {
    console.log('Nenhum usuário comum para remover.');
    await sequelize.close();
    return;
  }

  console.log(`Usuários comuns encontrados: ${total}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Confirmar remoção? (s/N): ', async (answer) => {
    rl.close();

    if (answer.trim().toLowerCase() !== 's') {
      console.log('Cancelado.');
      await sequelize.close();
      return;
    }

    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    await sequelize.query("DELETE FROM users WHERE role != 'admin'");
    // Limpa dados órfãos
    await sequelize.query('DELETE vc FROM verification_codes vc LEFT JOIN users u ON vc.user_id = u.id WHERE u.id IS NULL');
    await sequelize.query('DELETE r  FROM reviews r  LEFT JOIN users u ON r.user_id  = u.id WHERE u.id IS NULL');
    await sequelize.query('DELETE p  FROM posts   p  LEFT JOIN users u ON p.user_id  = u.id WHERE u.id IS NULL');
    await sequelize.query('DELETE ea FROM event_attendees ea LEFT JOIN users u ON ea.user_id = u.id WHERE u.id IS NULL');
    await sequelize.query('DELETE ov FROM organizer_reviews ov LEFT JOIN users u ON ov.reviewer_id = u.id WHERE u.id IS NULL');
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log(`${total} usuário(s) removido(s). Admin mantido.`);
    await sequelize.close();
  });
}

run().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
