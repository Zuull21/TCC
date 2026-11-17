module.exports = {
  PLACE_TYPES: ['tourist', 'event'],
  // Paginação padrão
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,

  // Categorias de lugares
  PLACE_CATEGORIES: ['cultura', 'esporte', 'gastronomia', 'natureza', 'arte', 'musica'],

  // Nível de alerta do lugar
  ALERT_LEVELS: ['none', 'low', 'medium', 'high'],

  // Nível do alerta emitido
  ALERT_LEVEL_VALUES: ['low', 'medium', 'high'],

  // Código de verificação
  VERIFICATION_CODE_EXPIRES_MIN: 15,

  // Roles de usuário
  USER_ROLES: {
    TOURIST: 'tourist',
    GUIDE: 'guide',
    ADMIN: 'admin',
  },

  // Sentimento de review
  SENTIMENT_LABELS: ['positive', 'neutral', 'negative'],
};
