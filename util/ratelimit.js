const MAX_BUCKETS = 2000

const buckets = new Map()

/**
 * Fixed-window rate limit, in memory, with no dependency.
 *
 * Requests are counted per token, because the token identifies a person.
 * `req.ip` is only the fallback: behind a tunnel it is the proxy address, and
 * `trust proxy` lets a caller forge it, so it cannot be the primary key.
 *
 * @param {{ windowMs?: number, limit?: number }} [options]
 */
module.exports = function ratelimit(options = {}) {
  const windowMs = Number(options.windowMs || 60000)
  const limit = Number(options.limit || 300)

  return function (req, res, next) {
    if (req.method === 'OPTIONS') return next()

    const key = req.get('x-api-token') || req.ip || 'unknown'
    const now = Date.now()
    let bucket = buckets.get(key)

    if (!bucket || now >= bucket.resetAt) {
      // Drop the oldest entry, not the whole map: a flood from one caller must
      // not reset the counters of everybody else.
      if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
        buckets.delete(buckets.keys().next().value)
      }
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
    }

    bucket.count += 1

    if (bucket.count > limit) {
      res.set('retry-after', String(Math.ceil((bucket.resetAt - now) / 1000)))
      return res.status(429).json({ code: 429, msg: 'too many requests' })
    }

    next()
  }
}
