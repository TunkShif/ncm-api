const crypto = require('crypto')
const logger = require('../util/logger.js')

const tokens = (process.env.API_TOKENS || '')
  .split(',')
  .map((token) => token.trim())
  .filter(Boolean)

if (tokens.length === 0) {
  logger.warn(
    'API_TOKENS is empty: the API answers anyone who knows the URL. Set API_TOKENS in production.',
  )
}

// Constant-time compare, so a wrong token cannot be guessed byte by byte.
function sameToken(given, expected) {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * Rejects every request that does not carry a known token.
 * The token travels in the `X-Api-Token` header. Never in the URL: URLs are logged.
 */
module.exports = function auth(req, res, next) {
  if (req.method === 'OPTIONS') return next()
  if (tokens.length === 0) return next()

  const given = req.get('x-api-token') || ''
  if (tokens.some((token) => sameToken(given, token))) return next()

  logger.debug(`Rejected without token: ${req.method} ${req.path}`)
  res.status(401).json({ code: 401, msg: 'unauthorized' })
}
