import express from 'express';
import { Pool } from 'pg';
import axios from 'axios';
import amqplib from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const PORT = process.env.PORT || 3003;
const BILLING_DB_URL = process.env.BILLING_DB_URL;
const ORDER_BASE_URL = process.env.ORDER_BASE_URL || 'http://order-service:3001';
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'minio';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000', 10);
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'invoices';
const RABBIT_URL = process.env.RABBIT_URL;

if (!BILLING_DB_URL) throw new Error('Missing BILLING_DB_URL');
if (!MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) throw new Error('Missing MinIO credentials');

const pool = new Pool({ connectionString: BILLING_DB_URL });

const s3 = new S3Client({
  region: 'us-east-1',
  endpoint: `http://${MINIO_ENDPOINT}:${MINIO_PORT}`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: MINIO_ACCESS_KEY,
    secretAccessKey: MINIO_SECRET_KEY
  }
});

// RabbitMQ (optional publish invoice.generated)
const EXCHANGE = 'events.topic';
let rabbitChannel = null;
async function initRabbit() {
  if (!RABBIT_URL) return;
  const conn = await amqplib.connect(RABBIT_URL);
  const ch = await conn.createChannel();
  await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
  rabbitChannel = ch;
  console.log('[billing-function] rabbit connected');
}

function publishEvent(routingKey, payload) {
  if (!rabbitChannel) return;
  rabbitChannel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), {
    contentType: 'application/json',
    persistent: true
  });
}

const app = express();
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'billing-function' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const genSchema = z.object({
  // optional override
  currency: z.string().min(3).max(3).optional()
});

app.post('/billing/generate/:orderId', async (req, res) => {
  const orderId = req.params.orderId;
  const parsed = genSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Fetch order details from Order Service
  let orderPayload;
  try {
    const r = await axios.get(`${ORDER_BASE_URL}/orders/${orderId}`);
    orderPayload = r.data;
  } catch (e) {
    const msg = e?.response?.data?.error || e.message;
    return res.status(404).json({ error: `Order not found or unreachable: ${msg}` });
  }

  const order = orderPayload.order;
  if (!order) return res.status(500).json({ error: 'Invalid order payload' });

  const invoiceId = uuidv4();
  const objectKey = `${orderId}/${invoiceId}.txt`; // PoC artifact (swap to .pdf later)

  const invoiceText = [
    `INVOICE ${invoiceId}`,
    `Order: ${orderId}`,
    `Customer: ${order.customer_email}`,
    `Amount: ${(order.total_cents / 100).toFixed(2)} ${order.currency}`,
    `Created: ${new Date().toISOString()}`
  ].join('\n');

  try {
    // Upload to MinIO
    await s3.send(new PutObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: objectKey,
      Body: invoiceText,
      ContentType: 'text/plain'
    }));

    // Insert into Billing DB
    await pool.query(
      `INSERT INTO invoices(id, order_id, customer_email, total_cents, currency, pdf_object_key)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [invoiceId, orderId, order.customer_email, order.total_cents, order.currency, objectKey]
    );

    const pdfUrl = `http://localhost:9000/${MINIO_BUCKET}/${objectKey}`;

    publishEvent('invoice.generated', {
      eventId: uuidv4(),
      invoiceId,
      orderId,
      pdfUrl,
      ts: new Date().toISOString()
    });

    res.status(201).json({ invoiceId, orderId, objectKey, pdfUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/billing/invoices/:orderId', async (req, res) => {
  const orderId = req.params.orderId;
  try {
    const r = await pool.query('SELECT * FROM invoices WHERE order_id = $1 ORDER BY created_at DESC', [orderId]);
    res.json({ orderId, invoices: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

await initRabbit();
app.listen(PORT, () => {
  console.log(`[billing-function] listening on ${PORT}`);
});
