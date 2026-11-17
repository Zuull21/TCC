#!/usr/bin/env node
// Remove os usuários descartáveis criados por scripts/smoke-test.js (smoke.<n>@teste.dev).
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Op } = require('sequelize');
const { User } = require('../src/models/index');
(async () => {
  const n = await User.destroy({ where: { email: { [Op.like]: 'smoke.%@teste.dev' } } });
  console.log(`${n} usuário(s) de teste removido(s)`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
