import express from 'express';
import { Pool } from 'pg';
import axios from 'axios';
import Redis from 'ioredis';
import amqplib from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const PORT = process.env.PORT || 3001;
const DATABASE_URL = process.env.DATABASE_URL;
const INVENTORY_BASE_URL = process.env.INVENTORY_BASE_URL || 'http://inventory-service:3002';
const RABBIT_URL = process.env.RABBIT_URL;
const PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'dev_secret';
const REDIS_URL = process.env.REDIS_URL;

if (!DATABASE_URL) throw new Error('Missing DATABASE_URL');
if (!RABBIT_URL) throw new Error('Missing RABBIT_URL');

const pool = new Pool({ connectionString: DATABASE_URL });
const redis = REDIS_URL ? new Redis(REDIS_URL) : null;

// RabbitMQ (topic exchange)
const EXCHANGE = 'events.topic';
let rabbitChannel;
async function initRabbit() {
  const conn = await amqplib.connect(RABBIT_URL);
  const ch = await conn.createChannel();
  await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
  rabbitChannel = ch;
  console.log('[order-service] rabbit connected');
}

function publishEvent(routingKey, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  rabbitChannel.publish(EXCHANGE, routingKey, body, {
    contentType: 'application/json',
    persistent: true
  });
}

const app = express();
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'order-service' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const createOrderSchema = z.object({
  customer_email: z.string().email(),
  currency: z.string().min(3).max(3).default('USD'),
  items: z.array(z.object({
    product_id: z.number().int().positive(),
    sku: z.string().min(1),
    name: z.string().min(1),
    unit_price_cents: z.number().int().nonnegative(),
    quantity: z.number().int().positive()
  })).min(1)
});

app.post('/orders', async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { customer_email, currency, items } = parsed.data;

  // Reserve stock via Inventory Service
  try {
    await axios.post(`${INVENTORY_BASE_URL}/inventory/stock/reserve`, {
      items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity }))
    });
  } catch (e) {
    const msg = e?.response?.data?.error || e.message;
    return res.status(409).json({ error: `Stock reservation failed: ${msg}` });
  }

  const orderId = uuidv4();
  const total_cents = items.reduce((sum, i) => sum + i.unit_price_cents * i.quantity, 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO orders(id, customer_email, total_cents, currency, status) VALUES($1,$2,$3,$4,$5)',
      [orderId, customer_email, total_cents, currency, 'CREATED']
    );

    for (const it of items) {
      const line_total = it.unit_price_cents * it.quantity;
      await client.query(
        `INSERT INTO order_items(order_id, product_id, sku, name, unit_price_cents, quantity, line_total_cents)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [orderId, it.product_id, it.sku, it.name, it.unit_price_cents, it.quantity, line_total]
      );
    }

    await client.query('COMMIT');

    if (redis) await redis.del(`cache:order:${orderId}`);

    // Optional: publish order.created
    publishEvent('order.created', {
      eventId: uuidv4(),
      orderId,
      customer_email,
      total_cents,
      currency,
      ts: new Date().toISOString()
    });

    res.status(201).json({ orderId, status: 'CREATED', total_cents, currency });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.get('/orders', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/orders/:id', async (req, res) => {
  const orderId = req.params.id;
  const cacheKey = `cache:order:${orderId}`;

  try {
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) return res.json({ source: 'cache', ...JSON.parse(cached) });
    }

    const o = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (o.rowCount === 0) return res.status(404).json({ error: 'Order not found' });

    const items = await pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC', [orderId]);

    const payload = { order: o.rows[0], items: items.rows };
    if (redis) await redis.set(cacheKey, JSON.stringify(payload), 'EX', 60);

    res.json({ source: 'db', ...payload });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const webhookSchema = z.object({
  orderId: z.string().uuid(),
  paymentStatus: z.enum(['CONFIRMED', 'FAILED']).default('CONFIRMED'),
  signature: z.string().optional()
});

app.post('/payments/webhook', async (req, res) => {
  const parsed = webhookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { orderId, paymentStatus, signature } = parsed.data;

  // Signature check (simple PoC)
  if (signature && signature !== PAYMENT_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (r.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    if (paymentStatus === 'CONFIRMED') {
      await client.query('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [orderId, 'PAID']);
    } else {
      await client.query('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [orderId, 'CANCELLED']);
    }

    await client.query('COMMIT');
    if (redis) await redis.del(`cache:order:${orderId}`);

    const order = r.rows[0];

    if (paymentStatus === 'CONFIRMED') {
      publishEvent('payment.confirmed', {
        eventId: uuidv4(),
        orderId,
        amount_cents: order.total_cents,
        currency: order.currency,
        customerEmail: order.customer_email,
        ts: new Date().toISOString()
      });
    }

    res.json({ ok: true, orderId, paymentStatus });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

await initRabbit();
app.listen(PORT, () => {
  console.log(`[order-service] listening on ${PORT}`);
});
