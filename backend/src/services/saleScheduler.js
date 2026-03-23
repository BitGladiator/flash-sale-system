const { query } = require('../config/db');
const { client: redis } = require('../config/redis');
const { emitSaleStatusUpdate } = require('../config/socket');


const inventoryKey = (saleProductId) => `inventory:${saleProductId}`;
const saleKey = (saleId) => `sale:${saleId}`;


// Called when current time passes a sale's start_time
// Loads all product inventory into Redis atomically
const activateSale = async (sale) => {
  console.log(`[Scheduler] Activating sale: ${sale.name} (${sale.id})`);

  
  const { rows: saleProducts } = await query(
    `SELECT sp.id, sp.total_qty, sp.sale_price, p.name
     FROM sale_products sp
     JOIN products p ON p.id = sp.product_id
     WHERE sp.sale_id = $1`,
    [sale.id]
  );

  if (saleProducts.length === 0) {
    console.warn(`[Scheduler] Sale ${sale.id} has no products — skipping activation`);
    return;
  }

  
  const pipeline = redis.multi();

  for (const sp of saleProducts) {
    
    pipeline.set(inventoryKey(sp.id), sp.total_qty);
    console.log(`[Scheduler]   → ${sp.name}: ${sp.total_qty} units loaded into Redis`);
  }

  const saleDurationSeconds = Math.floor(
    (new Date(sale.end_time) - new Date()) / 1000
  ) + 3600;

  pipeline.hSet(saleKey(sale.id), {
    id: sale.id,
    name: sale.name,
    status: 'ACTIVE',
    end_time: sale.end_time.toISOString(),
  });
  pipeline.expire(saleKey(sale.id), saleDurationSeconds);

 
  await pipeline.exec();

 
  await query(
    `UPDATE sales SET status = 'ACTIVE' WHERE id = $1`,
    [sale.id]
  );
  emitSaleStatusUpdate(sale.id, 'ACTIVE');
  console.log(`[Scheduler] Sale ${sale.name} is now ACTIVE — inventory live in Redis`);
};



const endSale = async (sale) => {
  console.log(`[Scheduler] Ending sale: ${sale.name} (${sale.id})`);

 
  const { rows: saleProducts } = await query(
    `SELECT id FROM sale_products WHERE sale_id = $1`,
    [sale.id]
  );


  for (const sp of saleProducts) {
    const remaining = await redis.get(inventoryKey(sp.id));
    if (remaining !== null) {
      const sold = await query(
        `SELECT total_qty FROM sale_products WHERE id = $1`,
        [sp.id]
      );
      const totalQty = sold.rows[0]?.total_qty || 0;
      const availableQty = parseInt(remaining);
      const reservedQty = totalQty - availableQty;

  
      await query(
        `UPDATE sale_products
         SET reserved_qty = $1
         WHERE id = $2`,
        [Math.max(0, reservedQty), sp.id]
      );

      await query(
        `UPDATE inventory
         SET available_qty = $1, last_synced_at = NOW()
         WHERE sale_product_id = $2`,
        [Math.max(0, availableQty), sp.id]
      );

     
      await redis.del(inventoryKey(sp.id));
    }
  }

 
  await redis.del(saleKey(sale.id));

  
  await query(
    `UPDATE sales SET status = 'ENDED' WHERE id = $1`,
    [sale.id]
  );
  emitSaleStatusUpdate(sale.id, 'ENDED');

  console.log(`[Scheduler] Sale ${sale.name} has ENDED — Redis cleaned up, DB synced`);
};



const tick = async () => {
  try {
    const now = new Date().toISOString();


    const { rows: salesToActivate } = await query(
      `SELECT id, name, start_time, end_time
       FROM sales
       WHERE status = 'SCHEDULED' AND start_time <= $1`,
      [now]
    );

    
    const { rows: salesToEnd } = await query(
      `SELECT id, name, start_time, end_time
       FROM sales
       WHERE status = 'ACTIVE' AND end_time <= $1`,
      [now]
    );

    
    for (const sale of salesToActivate) {
      await activateSale(sale);
    }

   
    for (const sale of salesToEnd) {
      await endSale(sale);
    }

  } catch (err) {

    console.error('[Scheduler] Error during tick:', err.message);
  }
};



const start = () => {
  console.log('[Scheduler] Starting sale scheduler — tick every 30 seconds');


  tick();


  setInterval(tick, 30 * 1000);
};

module.exports = { start, tick, activateSale, endSale };