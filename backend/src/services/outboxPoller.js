const { query, getClient } = require('../config/db');
const { publish, QUEUES } = require('../config/rabbitmq');



const EVENT_QUEUE_MAP = {
  ORDER_CREATED:    QUEUES.ORDER_CREATED,
  PAYMENT_SUCCESS:  QUEUES.PAYMENT_SUCCESS,
  PAYMENT_FAILED:   QUEUES.PAYMENT_FAILED,
};



const processBatch = async () => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Lock rows so multiple poller instances don't double-publish
    const { rows: events } = await client.query(
      `SELECT id, event_type, payload
       FROM outbox
       WHERE published = false
       ORDER BY created_at ASC
       LIMIT 50
       FOR UPDATE SKIP LOCKED`
    );

    if (events.length === 0) {
      await client.query('ROLLBACK');
      return;
    }

    for (const event of events) {
      const queue = EVENT_QUEUE_MAP[event.event_type];

      if (!queue) {
        console.warn(`[Outbox] Unknown event type: ${event.event_type} — skipping`);
        continue;
      }

      try {
        publish(queue, event.payload);

        // Mark as published
        await client.query(
          `UPDATE outbox SET published = true WHERE id = $1`,
          [event.id]
        );

        console.log(`[Outbox] Published ${event.event_type} → ${queue}`);
      } catch (publishErr) {
        console.error(`[Outbox] Failed to publish event ${event.id}:`, publishErr.message);
      }
    }

    await client.query('COMMIT');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Outbox] Batch processing error:', err.message);
  } finally {
    client.release();
  }
};



const start = () => {
  console.log('[Outbox] Starting outbox poller — tick every 5 seconds');
  processBatch(); 
  setInterval(processBatch, 5000);
};

module.exports = { start, processBatch };