const { consume, QUEUES } = require('../config/rabbitmq');


const sendOrderConfirmation = async (data) => {
 
  // await sendgrid.send({
  //   to: userEmail,
  //   subject: `Order Confirmed — ${data.productName}`,
  //   html: confirmationTemplate(data),
  // });
  console.log(`[Notification] Order confirmation sent`);
  console.log(`  → Order ID:   ${data.orderId}`);
  console.log(`  → Product:    ${data.productName}`);
  console.log(`  → Amount:     ₹${data.amount}`);
  console.log(`  → Txn ID:     ${data.transactionId}`);
};

const sendPaymentFailureNotification = async (data) => {
  console.log(`[Notification] ✗ Payment failure notification sent`);
  console.log(`  → Order ID:   ${data.orderId}`);
  console.log(`  → Product:    ${data.productName}`);
  console.log(`  → Reason:     ${data.reason}`);
  console.log(`  → Amount:     ₹${data.amount}`);
};



const startNotificationConsumer = async () => {
  console.log('[Notification] Starting notification consumers');

  
  await consume(QUEUES.PAYMENT_SUCCESS, async (message) => {
    const data = typeof message === 'string' ? JSON.parse(message) : message;
    try {
      await sendOrderConfirmation(data);
    } catch (err) {
      console.error('[Notification] Failed to send confirmation:', err.message);
      throw err;
    }
  });

 
  await consume(QUEUES.PAYMENT_FAILED, async (message) => {
    const data = typeof message === 'string' ? JSON.parse(message) : message;
    try {
      await sendPaymentFailureNotification(data);
    } catch (err) {
      console.error('[Notification] Failed to send failure notification:', err.message);
      throw err;
    }
  });
};

module.exports = { startNotificationConsumer };