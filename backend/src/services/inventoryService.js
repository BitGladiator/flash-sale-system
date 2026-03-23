const { client: redis } = require('../config/redis');
const { emitInventoryUpdate } = require('../config/socket');  

const inventoryKey = (saleProductId) => `inventory:${saleProductId}`;
const saleKey = (saleId) => `sale:${saleId}`;
const processingKey = (saleId, userId) => `processing:${saleId}:${userId}`;

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


const reserveInventory = async (saleProductId, saleId) => {
  const result = await redis.eval(
    DECR_SCRIPT,
    { keys: [inventoryKey(saleProductId)], arguments: [] }
  );

  const remaining = parseInt(result);

  if (remaining === -2) return { success: false, reason: 'SALE_NOT_FOUND' };
  if (remaining === -1) return { success: false, reason: 'OUT_OF_STOCK' };


  if (saleId) {
    emitInventoryUpdate(saleId, saleProductId, remaining);
  }

  return { success: true, remaining };
};


const releaseInventory = async (saleProductId, saleId) => {
  const key = inventoryKey(saleProductId);
  const result = await redis.incr(key);

  
  if (saleId) {
    emitInventoryUpdate(saleId, saleProductId, result);
  }

  return result;
};

const isSaleActive = async (saleId) => {
  const data = await redis.hGetAll(saleKey(saleId));
  if (!data || !data.status) return false;
  return data.status === 'ACTIVE';
};

const acquireProcessingLock = async (saleId, userId) => {
  const key = processingKey(saleId, userId);
  const result = await redis.set(key, '1', { NX: true, EX: 30 });
  return result === 'OK';
};

const releaseProcessingLock = async (saleId, userId) => {
  await redis.del(processingKey(saleId, userId));
};

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