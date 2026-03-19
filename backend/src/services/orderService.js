const { getClient } = require('../config/db');
const { releaseInventory } = require('./inventoryService');


// Everything in a single DB transaction:
//   1. Write order record
//   2. Write order items
//   3. Write outbox event
// If anything fails, the whole transaction rolls back —
// inventory is released and no partial state is left behind

const createOrder = async ({ userId, saleId, saleProductId, product, quantity, unitPrice, idempotencyKey }) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const totalAmount = (unitPrice * quantity).toFixed(2);

    // Insert order
    const { rows: orderRows } = await client.query(
      `INSERT INTO orders
         (user_id, sale_id, idempotency_key, status, total_amount)
       VALUES ($1, $2, $3, 'PENDING', $4)
       RETURNING id, user_id, sale_id, status, total_amount, created_at`,
      [userId, saleId, idempotencyKey, totalAmount]
    );

    const order = orderRows[0];

    // Insert order item
    await client.query(
      `INSERT INTO order_items
         (order_id, product_id, quantity, unit_price)
       VALUES ($1, $2, $3, $4)`,
      [order.id, product.product_id, quantity, unitPrice]
    );

    // Update reserved_qty on sale_products
    await client.query(
      `UPDATE sale_products
       SET reserved_qty = reserved_qty + $1
       WHERE id = $2`,
      [quantity, saleProductId]
    );

    // This guarantees the event is never lost even if RabbitMQ is down
    const outboxPayload = {
      orderId: order.id,
      userId,
      saleId,
      saleProductId,
      productId: product.product_id,
      productName: product.product_name,
      quantity,
      unitPrice,
      totalAmount,
      idempotencyKey,
    };

    await client.query(
      `INSERT INTO outbox (event_type, payload)
       VALUES ($1, $2)`,
      ['ORDER_CREATED', JSON.stringify(outboxPayload)]
    );

    await client.query('COMMIT');

    return { success: true, order };

  } catch (err) {
    await client.query('ROLLBACK');

    // Release the inventory unit we decremented in Redis
    // since the order write failed
    await releaseInventory(saleProductId);

    throw err;
  } finally {
    client.release();
  }
};



const updateOrderStatus = async (orderId, status, client = null) => {
  const db = client || require('../config/db');
  await db.query(
    `UPDATE orders
     SET status = $1, updated_at = NOW()
     WHERE id = $2`,
    [status, orderId]
  );
};


// Used to return cached response for duplicate requests

const getOrderByIdempotencyKey = async (idempotencyKey) => {
  const { query } = require('../config/db');
  const { rows } = await query(
    `SELECT o.id, o.user_id, o.sale_id, o.status, o.total_amount, o.created_at,
            json_agg(json_build_object(
              'product_id', oi.product_id,
              'quantity',   oi.quantity,
              'unit_price', oi.unit_price
            )) AS items
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.idempotency_key = $1
     GROUP BY o.id`,
    [idempotencyKey]
  );
  return rows[0] || null;
};

module.exports = {
  createOrder,
  updateOrderStatus,
  getOrderByIdempotencyKey,
};