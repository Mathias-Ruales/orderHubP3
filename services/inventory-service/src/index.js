import express from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { z } from 'zod';

const PORT = process.env.PORT || 3002;
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

if (!DATABASE_URL) throw new Error('Missing DATABASE_URL');

const pool = new Pool({ connectionString: DATABASE_URL });
const redis = REDIS_URL ? new Redis(REDIS_URL) : null;

const app = express();
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'inventory-service' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const createProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  price_cents: z.number().int().nonnegative(),
  initial_qty: z.number().int().nonnegative().default(0)
});

app.post('/inventory/products', async (req, res) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { sku, name, price_cents, initial_qty } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r1 = await client.query(
      'INSERT INTO products(sku, name, price_cents) VALUES($1,$2,$3) RETURNING id, sku, name, price_cents',
      [sku, name, price_cents]
    );
    const product = r1.rows[0];
    await client.query(
      'INSERT INTO stock(product_id, available_qty) VALUES($1,$2) ON CONFLICT(product_id) DO UPDATE SET available_qty = EXCLUDED.available_qty, updated_at = now()',
      [product.id, initial_qty]
    );
    await client.query('COMMIT');

    if (redis) await redis.del('cache:products:list');

    res.status(201).json({ ...product, available_qty: initial_qty });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.get('/inventory/products', async (req, res) => {
  const cacheKey = 'cache:products:list';
  try {
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) return res.json({ source: 'cache', items: JSON.parse(cached) });
    }

    const r = await pool.query(
      `SELECT p.id, p.sku, p.name, p.price_cents, COALESCE(s.available_qty,0) AS available_qty
       FROM products p
       LEFT JOIN stock s ON s.product_id = p.id
       ORDER BY p.created_at DESC`
    );

    if (redis) await redis.set(cacheKey, JSON.stringify(r.rows), 'EX', 60);
    res.json({ source: 'db', items: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/inventory/products/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM stock WHERE product_id = $1', [id]);
    await client.query('DELETE FROM products WHERE id = $1', [id]);
    await client.query('COMMIT');

    if (redis) await redis.del('cache:products:list');

    res.status(204).send();
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

const reserveSchema = z.object({
  items: z.array(z.object({
    product_id: z.number().int().positive(),
    quantity: z.number().int().positive()
  })).min(1)
});

app.post('/inventory/stock/reserve', async (req, res) => {
  const parsed = reserveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of parsed.data.items) {
      const { product_id, quantity } = item;
      const r = await client.query(
        'SELECT available_qty FROM stock WHERE product_id = $1 FOR UPDATE',
        [product_id]
      );
      if (r.rowCount === 0) throw new Error(`No stock row for product_id=${product_id}`);
      const available = r.rows[0].available_qty;
      if (available < quantity) throw new Error(`Insufficient stock for product_id=${product_id}. available=${available}, requested=${quantity}`);
      await client.query(
        'UPDATE stock SET available_qty = available_qty - $2, updated_at = now() WHERE product_id = $1',
        [product_id, quantity]
      );
    }

    await client.query('COMMIT');
    if (redis) await redis.del('cache:products:list');

    res.json({ reserved: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(409).json({ reserved: false, error: e.message });
  } finally {
    client.release();
  }
});

app.listen(PORT, () => {
  console.log(`[inventory-service] listening on ${PORT}`);
});
