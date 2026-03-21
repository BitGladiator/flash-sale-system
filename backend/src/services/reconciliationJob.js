const { query, getClient } = require('../config/db');
const { client: redis } = require('../config/redis');

const inventoryKey = (saleProductId) => `inventory:${saleProductId}`;


// Scenario: Redis was decremented but order write to DB failed/crashed
// Detection: Redis count < (total_qty - confirmed/pending orders)
const fixOrphanedDecrements = async (saleId) => {
  const { rows: saleProducts } = await query(
    `SELECT
       sp.id,
       sp.total_qty,
       sp.sale_price,
       p.name AS product_name,
       COUNT(o.id) FILTER (
         WHERE o.status IN ('PENDING', 'CONFIRMED')
       ) AS active_order_count
     FROM sale_products sp
     JOIN products p ON p.id = sp.product_id
     LEFT JOIN order_items oi ON oi.product_id = sp.product_id
     LEFT JOIN orders o ON o.id = oi.order_id AND o.sale_id = $1
     WHERE sp.sale_id = $1
     GROUP BY sp.id, sp.total_qty, sp.sale_price, p.name`,
    [saleId]
  );

  const issues = [];

  for (const sp of saleProducts) {
    const redisQty = await redis.get(inventoryKey(sp.id));

    if (redisQty === null) continue;

    const redisCount = parseInt(redisQty);
    const activeOrders = parseInt(sp.active_order_count);
    const expectedAvailable = sp.total_qty - activeOrders;

    if (redisCount < expectedAvailable) {
      const delta = expectedAvailable - redisCount;

      console.log(`[Reconciliation] Orphaned decrement detected`);
      console.log(`  Product:   ${sp.product_name}`);
      console.log(`  Redis:     ${redisCount}`);
      console.log(`  Expected:  ${expectedAvailable}`);
      console.log(`  Restoring: +${delta} units`);

      await redis.incrBy(inventoryKey(sp.id), delta);

      issues.push({
        type: 'ORPHANED_DECREMENT',
        saleProductId: sp.id,
        productName: sp.product_name,
        redisCount,
        expectedAvailable,
        delta,
        fixedAt: new Date().toISOString(),
      });
    }

    // If is Redis HIGHER than expected — units returned too many times
    if (redisCount > expectedAvailable) {
      const delta = redisCount - expectedAvailable;

      console.log(`[Reconciliation] Over-release detected`);
      console.log(`  Product:   ${sp.product_name}`);
      console.log(`  Redis:     ${redisCount}`);
      console.log(`  Expected:  ${expectedAvailable}`);
      console.log(`  Removing:  -${delta} units`);

      await redis.decrBy(inventoryKey(sp.id), delta);

      issues.push({
        type: 'OVER_RELEASE',
        saleProductId: sp.id,
        productName: sp.product_name,
        redisCount,
        expectedAvailable,
        delta,
        fixedAt: new Date().toISOString(),
      });
    }
  }

  return issues;
};

// This can happen if RabbitMQ message was lost before outbox poller ran,
// or if the payment consumer crashed mid-processing
// Detection: PENDING orders older than 15 minutes

const fixStuckPendingOrders = async () => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

   
    const { rows: stuckOrders } = await client.query(
      `SELECT
         o.id, o.sale_id, o.total_amount, o.created_at,
         oi.product_id, oi.quantity,
         sp.id AS sale_product_id
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN sale_products sp ON sp.product_id = oi.product_id
                             AND sp.sale_id = o.sale_id
       WHERE o.status = 'PENDING'
         AND o.created_at < NOW() - INTERVAL '15 minutes'
       FOR UPDATE SKIP LOCKED`
    );

    if (stuckOrders.length === 0) {
      await client.query('COMMIT');
      return [];
    }

    console.log(`[Reconciliation] Found ${stuckOrders.length} stuck PENDING order(s)`);

    const fixed = [];

    for (const order of stuckOrders) {
     
      await client.query(
        `UPDATE orders
         SET status = 'FAILED', updated_at = NOW()
         WHERE id = $1`,
        [order.id]
      );

  
      await client.query(
        `UPDATE sale_products
         SET reserved_qty = GREATEST(0, reserved_qty - $1)
         WHERE id = $2`,
        [order.quantity, order.sale_product_id]
      );

      await client.query(
        `INSERT INTO outbox (event_type, payload)
         VALUES ($1, $2)`,
        [
          'PAYMENT_FAILED',
          JSON.stringify({
            orderId: order.id,
            userId: order.user_id,
            reason: 'Payment processing timed out. Please try again.',
            amount: order.total_amount,
            productName: 'Your order',
          }),
        ]
      );

      console.log(`[Reconciliation] Stuck order ${order.id} marked as FAILED`);
      fixed.push(order.id);
    }

    await client.query('COMMIT');

    for (const order of stuckOrders) {
      const saleActive = await redis.exists(inventoryKey(order.sale_product_id));
      if (saleActive) {
        await redis.incrBy(inventoryKey(order.sale_product_id), order.quantity);
        console.log(`[Reconciliation] Restored ${order.quantity} unit(s) to Redis for sale product ${order.sale_product_id}`);
      }
    }

    return fixed;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Keeps the inventory table in Postgres up to date with Redis
// Not critical for correctness (Redis is source of truth during sale)
// but useful for reporting, admin dashboards, and post-sale analysis

const syncInventoryToDb = async () => {
  // Find all active sales
  const { rows: activeSales } = await query(
    `SELECT id FROM sales WHERE status = 'ACTIVE'`
  );

  for (const sale of activeSales) {
    const { rows: saleProducts } = await query(
      `SELECT id FROM sale_products WHERE sale_id = $1`,
      [sale.id]
    );

    for (const sp of saleProducts) {
      const redisQty = await redis.get(inventoryKey(sp.id));
      if (redisQty === null) continue;

      await query(
        `UPDATE inventory
         SET available_qty = $1, last_synced_at = NOW()
         WHERE sale_product_id = $2`,
        [parseInt(redisQty), sp.id]
      );
    }
  }
};

// If outbox poller somehow missed events, alert loudly
// The poller should handle these but this is a canary check

const checkStaleOutboxEvents = async () => {
  const { rows } = await query(
    `SELECT COUNT(*) AS count
     FROM outbox
     WHERE published = false
       AND created_at < NOW() - INTERVAL '10 minutes'`
  );

  const staleCount = parseInt(rows[0].count);

  if (staleCount > 0) {
    console.warn(`[Reconciliation] ${staleCount} unpublished outbox event(s) older than 10 minutes`);
    console.warn(`[Reconciliation] Check outbox poller — it may not be running`);
  }

  return staleCount;
};



const tick = async () => {
  console.log(`[Reconciliation] Starting reconciliation run — ${new Date().toISOString()}`);

  try {
    // Run stuck orders fix first — most urgent
    const fixedOrders = await fixStuckPendingOrders();

    // Check each active sale for inventory discrepancies
    const { rows: activeSales } = await query(
      `SELECT id, name FROM sales WHERE status = 'ACTIVE'`
    );

    let totalIssues = [];

    for (const sale of activeSales) {
      const issues = await fixOrphanedDecrements(sale.id);
      totalIssues = [...totalIssues, ...issues];
    }

    await syncInventoryToDb();

    // Check for stale outbox events
    const staleEvents = await checkStaleOutboxEvents();

    // Summary
    const hasIssues =
      fixedOrders.length > 0 ||
      totalIssues.length > 0 ||
      staleEvents > 0;

    if (hasIssues) {
      console.log(`[Reconciliation] Run complete — issues found and fixed:`);
      if (fixedOrders.length > 0)
        console.log(`  Stuck orders fixed:        ${fixedOrders.length}`);
      if (totalIssues.length > 0)
        console.log(`  Inventory discrepancies:   ${totalIssues.length}`);
      if (staleEvents > 0)
        console.log(`  Stale outbox events:       ${staleEvents}`);
    } else {
      console.log(`[Reconciliation] Run complete — everything consistent ✓`);
    }

  } catch (err) {
    // Never crash — log and wait for next tick
    console.error('[Reconciliation] Error during run:', err.message);
  }
};


// First run happens 2 minutes after startup

const start = () => {
  console.log('[Reconciliation] Scheduling reconciliation job — every 5 minutes');

  
  setTimeout(() => {
    tick();
    setInterval(tick, 5 * 60 * 1000);
  }, 2 * 60 * 1000);
};

module.exports = { start, tick };