/**
 * Prepara o banco: cria/ajusta as tabelas, garante o usuário admin e carrega os
 * pontos turísticos do catálogo curado (src/config/pontos-turisticos.json).
 *
 * Os pontos turísticos vêm de um de-para mantido à mão
 * (pontos-turisticos.lista.js), resolvido na Wikidata por
 * scripts/build-tourist-catalog.js. Até nov/2026 eram importados do
 * OpenStreetMap por categoria, o que trazia academias, supermercados e praças
 * de bairro misturados aos pontos turísticos.
 *
 * Idempotente. Uso: node src/config/syncDb.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { sequelize } = require('./db');
const { runMigrations } = require('./migrations');
const { User, Place } = require('../models/index');
const { syncCatalog } = require('../../scripts/sync-tourist-catalog');

const BCRYPT_ROUNDS = 12;

async function main() {
  try {
    await sequelize.authenticate();
    console.log('[DB] Conexão estabelecida.');

    // alter: adiciona colunas novas sem destruir dados existentes
    await sequelize.sync({ alter: true });
    await runMigrations(sequelize);
    console.log('[DB] Tabelas sincronizadas.');

    const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
    const [admin, adminCreated] = await User.findOrCreate({
      where: { email: 'admin@tourmap.com.br' },
      defaults: {
        name:           'Admin TourMap',
        password_hash:  await bcrypt.hash(adminPassword, BCRYPT_ROUNDS),
        age:            30,
        email_verified: true,
        role:           'admin',
        city:           'São Paulo',
        bio:            'Administrador da plataforma TourMap.',
      },
    });
    if (adminCreated && !process.env.ADMIN_PASSWORD) {
      console.log(`[Seed] Admin criado com senha gerada: ${adminPassword} (guarde-a ou defina ADMIN_PASSWORD)`);
    }
    console.log('[Seed] Admin pronto.');

    // Corrige tipos: lugares criados por não-admins são eventos
    const admins = await User.findAll({ where: { role: 'admin' }, attributes: ['id'] });
    const adminIds = admins.map((u) => u.id);
    await Place.update({ type: 'tourist' }, { where: { created_by: { [Op.in]: adminIds } } });
    await Place.update({ type: 'event' },   { where: { created_by: { [Op.notIn]: adminIds } } });

    await syncCatalog({ apply: true, log: (m) => console.log(`[Catálogo] ${m.trim()}`) });
    console.log('[Sync] Concluído com sucesso.');
  } catch (err) {
    console.error('[Sync] Erro:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
