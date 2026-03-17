const errorHandler = (err, req, res, next) => {
    console.error(`[${new Date().toISOString()}] ${err.stack}`);
  
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal server error';
  
    res.status(status).json({
      success: false,
      error: message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  };
  
  module.exports = errorHandler;