const { client: redis } = require('../config/redis');

const inventoryKey = (saleProductId) => `inventory:${saleProductId}`;
const saleKey = (saleId) => `sale:${saleId}`;
const processingKey = (saleId, userId) => `processing:${saleId}:${userId}`;


// Redis executes Lua scripts atomically — nothing runs between the GET and DECR
// Returns:
//  -2 = sale not found or ended
//  -1 = out of stock
//   N = new inventory count after decrement (success)

const DECR_SCRIPT = `
  local qty = redis.call('GET', KEYS[1])
  if qty == false then
    return -2
  end
  if tonumber(qty) <= 0 then
    return -1
  end
  return redis.call('DECR', KEYS[1])
`;


// Returns { success, remaining, reason }

const reserveInventory = async (saleProductId) => {
  const result = await redis.eval(
    DECR_SCRIPT,
    { keys: [inventoryKey(saleProductId)], arguments: [] }
  );

  const remaining = parseInt(result);

  if (remaining === -2) {
    return { success: false, reason: 'SALE_NOT_FOUND' };
  }

  if (remaining === -1) {
    return { success: false, reason: 'OUT_OF_STOCK' };
  }

  return { success: true, remaining };
};


// Called when payment fails — returns the unit back to Redis

const releaseInventory = async (saleProductId) => {
  const key = inventoryKey(saleProductId);
  const result = await redis.incr(key);
  return result;
};



const isSaleActive = async (saleId) => {
  const data = await redis.hGetAll(saleKey(saleId));
  if (!data || !data.status) return false;
  return data.status === 'ACTIVE';
};


// Returns true if the lock was acquired, false if already processing

const acquireProcessingLock = async (saleId, userId) => {
  const key = processingKey(saleId, userId);
  // SET NX = only set if key does not exist
  // EX 30 = expire after 30 seconds (safety net if request crashes mid-flight)
  const result = await redis.set(key, '1', { NX: true, EX: 30 });
  return result === 'OK';
};

const releaseProcessingLock = async (saleId, userId) => {
  await redis.del(processingKey(saleId, userId));
};

// ─── Get current inventory from Redis ─────────────────────────────────────────

const getInventory = async (saleProductId) => {
  const qty = await redis.get(inventoryKey(saleProductId));
  return qty !== null ? parseInt(qty) : null;
};

module.exports = {
  reserveInventory,
  releaseInventory,
  isSaleActive,
  acquireProcessingLock,
  releaseProcessingLock,
  getInventory,
};