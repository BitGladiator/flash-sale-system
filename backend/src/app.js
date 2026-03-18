require('dotenv').config();
const express = require('express');
const { connect: connectRedis } = require('./config/redis');
const { connect: connectRabbitMQ } = require('./config/rabbitmq');
const { initialize: initMinio } = require('./config/minio');
const { pool } = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const saleScheduler = require('./services/saleScheduler');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      success: true,
      status: 'ok',
      services: { postgres: 'connected', server: 'running' },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ success: false, status: 'error', message: err.message });
  }
});


app.use('/api/auth',     require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/sales',    require('./routes/saleRoutes'));  
// app.use('/api/orders',   require('./routes/orderRoutes'));

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.use(errorHandler);

const start = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✓ Postgres connected');

    await connectRedis();
    await connectRabbitMQ();
    await initMinio();

    
    saleScheduler.start();

    app.listen(process.env.PORT, () => {
      console.log(`Server running on http://localhost:${process.env.PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

start();