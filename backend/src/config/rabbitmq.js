const amqp = require('amqplib');
require('dotenv').config();

let connection = null;
let channel = null;

const QUEUES = {
  ORDER_CREATED: 'order.created',
  PAYMENT_PROCESS: 'payment.process',
  PAYMENT_SUCCESS: 'payment.success',
  PAYMENT_FAILED: 'payment.failed',
  NOTIFICATION: 'notification.send',
};

const connect = async () => {
  connection = await amqp.connect(process.env.RABBITMQ_URL);
  channel = await connection.createChannel();

  for (const queue of Object.values(QUEUES)) {
    await channel.assertQueue(queue, { durable: true });
  }

  console.log('RabbitMQ connected, queues asserted');

  connection.on('error', (err) => {
    console.error('RabbitMQ connection error:', err);
  });

  connection.on('close', () => {
    console.error('RabbitMQ connection closed, reconnecting in 5s...');
    connection = null;
    channel = null;
    setTimeout(connect, 5000);
  });
};

const publish = (queue, message) => {
  if (!channel) throw new Error('RabbitMQ channel not initialized');
  channel.sendToQueue(
    queue,
    Buffer.from(JSON.stringify(message)),
    { persistent: true }
  );
};

const consume = async (queue, handler) => {
  if (!channel) throw new Error('RabbitMQ channel not initialized');
  await channel.prefetch(1);
  await channel.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      const content = JSON.parse(msg.content.toString());
      await handler(content);
      channel.ack(msg);
    } catch (err) {
      console.error(`Error processing message from ${queue}:`, err);
      channel.nack(msg, false, false);
    }
  });
};

const getChannel = () => channel;

module.exports = { connect, publish, consume, getChannel, QUEUES };