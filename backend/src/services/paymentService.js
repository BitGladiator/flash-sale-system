const { query, getClient } = require('../config/db');
const { publish, consume, QUEUES } = require('../config/rabbitmq');
const { releaseInventory } = require('./inventoryService');

// In production this is where you call Razorpay / Stripe / PayU
// We simulate with a 90% success rate and artificial delay

const processPaymentGateway = async ({ orderId, amount, userId }) => {
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 800 + 200));

  // 90% success rate simulation
  const success = Math.random() < 0.9;

  if (success) {
    return {
      success: true,
      transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      gateway: 'simulated',
      amount,
    };
  } else {
    return {
      success: false,
      error: 'Payment declined by gateway.',
      code: 'PAYMENT_DECLINED',
    };
  }
};



const handlePaymentSuccess = async (orderData, paymentResult) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

  
    await client.query(
      `UPDATE orders
       SET status = 'CONFIRMED', updated_at = NOW()
       WHERE id = $1`,
      [orderData.orderId]
    );

  
    await client.query(
      `INSERT INTO outbox (event_type, payload)
       VALUES ($1, $2)`,
      [
        'PAYMENT_SUCCESS',
        JSON.stringify({
          orderId: orderData.orderId,
          userId: orderData.userId,
          transactionId: paymentResult.transactionId,
          amount: orderData.totalAmount,
          productName: orderData.productName,
        }),
      ]
    );

    await client.query('COMMIT');

    console.log(`[Payment] Order ${orderData.orderId} CONFIRMED — txn: ${paymentResult.transactionId}`);

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};



const handlePaymentFailure = async (orderData, failureReason) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

   
    await client.query(
      `UPDATE orders
       SET status = 'FAILED', updated_at = NOW()
       WHERE id = $1`,
      [orderData.orderId]
    );

   
    await client.query(
      `UPDATE sale_products
       SET reserved_qty = GREATEST(0, reserved_qty - $1)
       WHERE id = $2`,
      [orderData.quantity, orderData.saleProductId]
    );

   
    await client.query(
      `INSERT INTO outbox (event_type, payload)
       VALUES ($1, $2)`,
      [
        'PAYMENT_FAILED',
        JSON.stringify({
          orderId: orderData.orderId,
          userId: orderData.userId,
          reason: failureReason,
          productName: orderData.productName,
          amount: orderData.totalAmount,
        }),
      ]
    );

    await client.query('COMMIT');

    
    await releaseInventory(orderData.saleProductId);

    console.log(`[Payment] ✗ Order ${orderData.orderId} FAILED — inventory restored`);

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const startPaymentConsumer = async () => {
  console.log('[Payment] Starting payment consumer — listening on order.created');

  await consume(QUEUES.ORDER_CREATED, async (message) => {
    const orderData = typeof message === 'string'
      ? JSON.parse(message)
      : message;

    console.log(`[Payment] Processing payment for order: ${orderData.orderId}`);

    try {
      const { rows } = await query(
        `SELECT id, status FROM orders WHERE id = $1`,
        [orderData.orderId]
      );

      if (rows.length === 0) {
        console.warn(`[Payment] Order ${orderData.orderId} not found — skipping`);
        return;
      }

      if (rows[0].status !== 'PENDING') {
        console.warn(`[Payment] Order ${orderData.orderId} is ${rows[0].status} — skipping (already processed)`);
        return;
      }

     
      const paymentResult = await processPaymentGateway({
        orderId: orderData.orderId,
        amount: orderData.totalAmount,
        userId: orderData.userId,
      });

      if (paymentResult.success) {
        await handlePaymentSuccess(orderData, paymentResult);
      } else {
        await handlePaymentFailure(orderData, paymentResult.error);
      }

    } catch (err) {
      console.error(`[Payment] Error processing order ${orderData.orderId}:`, err.message);
     
      throw err;
    }
  });
};

module.exports = { startPaymentConsumer };