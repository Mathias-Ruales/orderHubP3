import amqplib from 'amqplib';
import { v4 as uuidv4 } from 'uuid';

const RABBIT_URL = process.env.RABBIT_URL;
if (!RABBIT_URL) throw new Error('Missing RABBIT_URL');

const EXCHANGE = 'events.topic';
const QUEUE = 'q.notifications';

async function main() {
  const conn = await amqplib.connect(RABBIT_URL);
  const ch = await conn.createChannel();
  await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
  await ch.assertQueue(QUEUE, { durable: true });
  await ch.bindQueue(QUEUE, EXCHANGE, 'payment.confirmed');
  await ch.bindQueue(QUEUE, EXCHANGE, 'invoice.generated');

  console.log('[notification-service] waiting for events...');

  ch.consume(QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const routingKey = msg.fields.routingKey;
      const payload = JSON.parse(msg.content.toString('utf8'));

      // Mock provider: just log. Replace with SendGrid/Twilio later.
      if (routingKey === 'payment.confirmed') {
        console.log(`[notification-service] (mock) Email/SMS: Payment confirmed for order ${payload.orderId} to ${payload.customerEmail} (amount_cents=${payload.amount_cents})`);
      }
      if (routingKey === 'invoice.generated') {
        console.log(`[notification-service] (mock) Email/SMS: Invoice generated for order ${payload.orderId} pdfUrl=${payload.pdfUrl}`);
      }

      ch.ack(msg);
    } catch (e) {
      console.error('[notification-service] error', e);
      // nack with requeue=false to avoid infinite loop in PoC
      ch.nack(msg, false, false);
    }
  });
}

main().catch((e) => {
  console.error('[notification-service] fatal', e);
  process.exit(1);
});
