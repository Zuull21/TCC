/**
 * sanitize.js
 * Utilitários para sanitização de strings contra XSS.
 */

/**
 * Remove tags HTML perigosas de uma string.
 * Para sanitização profunda utilize a biblioteca xss-clean no middleware global.
 */
function stripTags(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').trim();
}

/**
 * Sanitiza um objeto de forma recursiva, aplicando stripTags em strings.
 */
function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      typeof v === 'string' ? stripTags(v) : sanitizeObject(v),
    ])
  );
}

module.exports = { stripTags };
