const { Server } = require('socket.io');

let io = null;

const initialize = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    socket.on('join:sale', (saleId) => {
      socket.join(`sale:${saleId}`);
      console.log(`[Socket] ${socket.id} joined sale room: ${saleId}`);
    });

    socket.on('leave:sale', (saleId) => {
      socket.leave(`sale:${saleId}`);
      console.log(`[Socket] ${socket.id} left sale room: ${saleId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  console.log('Socket.io initialized');
  return io;
};


const emitInventoryUpdate = (saleId, saleProductId, availableQty) => {
  if (!io) return;
  io.to(`sale:${saleId}`).emit('inventory:update', {
    saleProductId,
    availableQty,
  });
};


const emitSaleStatusUpdate = (saleId, status) => {
  if (!io) return;
  io.emit('sale:status', { saleId, status });
};

const getIO = () => io;

module.exports = { initialize, emitInventoryUpdate, emitSaleStatusUpdate, getIO };