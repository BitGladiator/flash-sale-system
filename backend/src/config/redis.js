const { createClient } = require('redis');
require('dotenv').config();

const client = createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT),
    reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
  },
});

client.on('error', (err) => console.error('Redis error:', err));
client.on('connect', () => console.log('✓ Redis connected'));
client.on('reconnecting', () => console.log('Redis reconnecting...'));

const connect = async () => {
  await client.connect();
};

module.exports = { client, connect };