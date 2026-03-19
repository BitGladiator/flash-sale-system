const { client: redis } = require('../config/redis');

// Sliding window rate limiter (Lua) 
// Uses a Redis sorted set where:
// each member is a unique request ID
// each score is the request timestamp in milliseconds
//
// On every request:
// Remove all entries older than the window
// Count remaining entries
// If count >= limit = reject
// Otherwise add current request = allow


const SLIDING_WINDOW_SCRIPT = `
  local key        = KEYS[1]
  local now        = tonumber(ARGV[1])
  local window_ms  = tonumber(ARGV[2])
  local limit      = tonumber(ARGV[3])
  local request_id = ARGV[4]

  local window_start = now - window_ms

  -- Remove requests outside the window
  redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

  -- Count requests in the current window
  local count = redis.call('ZCARD', key)

  if count >= limit then
    -- Get the oldest request timestamp to calculate retry-after
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry_after = 0
    if oldest and oldest[2] then
      retry_after = math.ceil((tonumber(oldest[2]) + window_ms - now) / 1000)
    end
    return {0, count, retry_after}
  end

  -- Add current request with timestamp as score
  redis.call('ZADD', key, now, request_id)

  -- Set TTL so keys self-clean (window duration in seconds + buffer)
  redis.call('EXPIRE', key, math.ceil(window_ms / 1000) + 10)

  return {1, count + 1, 0}
`;



const checkRateLimit = async (key, limit, windowMs) => {
  const now = Date.now();
  const requestId = `${now}-${Math.random().toString(36).substr(2, 9)}`;

  const result = await redis.eval(SLIDING_WINDOW_SCRIPT, {
    keys: [key],
    arguments: [
      now.toString(),
      windowMs.toString(),
      limit.toString(),
      requestId,
    ],
  });

  const [allowed, currentCount, retryAfter] = result;

  return {
    allowed: allowed === 1,
    currentCount,
    retryAfter,
    limit,
    remaining: Math.max(0, limit - currentCount),
  };
};



// Default: 10 requests per 10 seconds per user

const userRateLimiter = (limit = 10, windowMs = 10 * 1000) => {
  return async (req, res, next) => {
    try {
      const identifier = req.user?.id || req.ip;
      const key = `rate:user:${identifier}`;

      const result = await checkRateLimit(key, limit, windowMs);

     
      res.set({
        'X-RateLimit-Limit':     limit,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Window':    `${windowMs / 1000}s`,
      });

      if (!result.allowed) {
        res.set('Retry-After', result.retryAfter);
        return res.status(429).json({
          success: false,
          error: 'Too many requests. Please slow down.',
          retry_after_seconds: result.retryAfter,
        });
      }

      next();
    } catch (err) {
      console.error('[RateLimiter] Redis error — failing open:', err.message);
      next();
    }
  };
};


// Stricter limit specifically for the order/buy endpoint
// Default: 3 attempts per 30 seconds per user
// Prevents a single user from trying to buy repeatedly after selling out

const buyRateLimiter = (limit = 3, windowMs = 30 * 1000) => {
  return async (req, res, next) => {
    try {
      const identifier = req.user?.id || req.ip;
      const key = `rate:buy:${identifier}`;

      const result = await checkRateLimit(key, limit, windowMs);

      res.set({
        'X-RateLimit-Limit':     limit,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Window':    `${windowMs / 1000}s`,
      });

      if (!result.allowed) {
        res.set('Retry-After', result.retryAfter);
        return res.status(429).json({
          success: false,
          error: 'Too many purchase attempts. Please wait before trying again.',
          retry_after_seconds: result.retryAfter,
        });
      }

      next();
    } catch (err) {
      console.error('[RateLimiter] Redis error — failing open:', err.message);
      next();
    }
  };
};


// Caps total requests into a route across ALL users
// Protects downstream services (DB, Redis) at sale start spike
// Default: 1000 requests per second globally on the buy endpoint

const globalRateLimiter = (limit = 1000, windowMs = 1000) => {
  return async (req, res, next) => {
    try {
      const key = `rate:global:orders`;

      const result = await checkRateLimit(key, limit, windowMs);

      if (!result.allowed) {
        return res.status(429).json({
          success: false,
          error: 'System is under high load. Please try again in a moment.',
          retry_after_seconds: result.retryAfter,
        });
      }

      next();
    } catch (err) {
      console.error('[RateLimiter] Redis error — failing open:', err.message);
      next();
    }
  };
};


// Protects login/register from brute force
// 5 attempts per minute per IP

const authRateLimiter = (limit = 5, windowMs = 60 * 1000) => {
  return async (req, res, next) => {
    try {
      const key = `rate:auth:${req.ip}`;

      const result = await checkRateLimit(key, limit, windowMs);

      res.set({
        'X-RateLimit-Limit':     limit,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Window':    `${windowMs / 1000}s`,
      });

      if (!result.allowed) {
        res.set('Retry-After', result.retryAfter);
        return res.status(429).json({
          success: false,
          error: 'Too many attempts. Please try again later.',
          retry_after_seconds: result.retryAfter,
        });
      }

      next();
    } catch (err) {
      console.error('[RateLimiter] Redis error — failing open:', err.message);
      next();
    }
  };
};

module.exports = {
  userRateLimiter,
  buyRateLimiter,
  globalRateLimiter,
  authRateLimiter,
  checkRateLimit,
};