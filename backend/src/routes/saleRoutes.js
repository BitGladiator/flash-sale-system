const express = require('express');
const { query, getClient } = require('../config/db');
const { client: redis } = require('../config/redis');
const { authenticate } = require('../middleware/auth');

const router = express.Router();


const inventoryKey = (saleProductId) => `inventory:${saleProductId}`;
const saleKey = (saleId) => `sale:${saleId}`;


// Public — returns all sales with their products

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status; 
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`s.status = $${paramIndex++}`);
      values.push(status.toUpperCase());
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    values.push(limit, offset);

    const { rows: sales } = await query(
      `SELECT
         s.id, s.name, s.start_time, s.end_time, s.status, s.created_at,
         JSON_AGG(
           JSON_BUILD_OBJECT(
             'sale_product_id', sp.id,
             'product_id',      p.id,
             'product_name',    p.name,
             'description',     p.description,
             'image_key',       p.image_key,
             'sale_price',      sp.sale_price,
             'total_qty',       sp.total_qty,
             'reserved_qty',    sp.reserved_qty
           )
         ) FILTER (WHERE sp.id IS NOT NULL) AS products
       FROM sales s
       LEFT JOIN sale_products sp ON sp.sale_id = s.id
       LEFT JOIN products p ON p.id = sp.product_id
       ${whereClause}
       GROUP BY s.id
       ORDER BY s.start_time DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      values
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM sales s ${whereClause}`,
      values.slice(0, -2) 
    );

    const total = parseInt(countRows[0].count);

    res.json({
      success: true,
      data: {
        sales,
        pagination: {
          total,
          page,
          limit,
          total_pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});


// Public — returns a single sale with products
// If sale is ACTIVE, also returns live inventory counts from Redis
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await query(
      `SELECT
         s.id, s.name, s.start_time, s.end_time, s.status, s.created_at,
         JSON_AGG(
           JSON_BUILD_OBJECT(
             'sale_product_id', sp.id,
             'product_id',      p.id,
             'product_name',    p.name,
             'description',     p.description,
             'image_key',       p.image_key,
             'sale_price',      sp.sale_price,
             'total_qty',       sp.total_qty,
             'reserved_qty',    sp.reserved_qty
           )
         ) FILTER (WHERE sp.id IS NOT NULL) AS products
       FROM sales s
       LEFT JOIN sale_products sp ON sp.sale_id = s.id
       LEFT JOIN products p ON p.id = sp.product_id
       WHERE s.id = $1
       GROUP BY s.id`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Sale not found.',
      });
    }

    const sale = rows[0];

    // If sale is active, enrich each product with live Redis inventory
    if (sale.status === 'ACTIVE' && sale.products) {
      const enriched = await Promise.all(
        sale.products.map(async (product) => {
          const qty = await redis.get(inventoryKey(product.sale_product_id));
          return {
            ...product,
            available_qty: qty !== null ? parseInt(qty) : 0,
          };
        })
      );
      sale.products = enriched;
    }

    res.json({
      success: true,
      data: { sale },
    });
  } catch (err) {
    next(err);
  }
});


// Protected — creates a new flash sale
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { name, start_time, end_time } = req.body;

    if (!name || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        error: 'name, start_time and end_time are required.',
      });
    }

    const start = new Date(start_time);
    const end = new Date(end_time);
    const now = new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use ISO 8601 (e.g. 2026-03-20T14:00:00Z).',
      });
    }

    if (start <= now) {
      return res.status(400).json({
        success: false,
        error: 'start_time must be in the future.',
      });
    }

    if (end <= start) {
      return res.status(400).json({
        success: false,
        error: 'end_time must be after start_time.',
      });
    }

    const { rows } = await query(
      `INSERT INTO sales (name, start_time, end_time)
       VALUES ($1, $2, $3)
       RETURNING id, name, start_time, end_time, status, created_at`,
      [name.trim(), start.toISOString(), end.toISOString()]
    );

    res.status(201).json({
      success: true,
      message: 'Sale created successfully.',
      data: { sale: rows[0] },
    });
  } catch (err) {
    next(err);
  }
});


// Protected — adds a product to a sale with qty and price
// Can only add products to a SCHEDULED sale, not one that's already active
router.post('/:id/products', authenticate, async (req, res, next) => {
  const client = await getClient();
  try {
    const { id: sale_id } = req.params;
    const { product_id, sale_price, total_qty } = req.body;

   
    if (!product_id || !sale_price || !total_qty) {
      return res.status(400).json({
        success: false,
        error: 'product_id, sale_price and total_qty are required.',
      });
    }

    const price = parseFloat(sale_price);
    const qty = parseInt(total_qty);

    if (isNaN(price) || price <= 0) {
      return res.status(400).json({
        success: false,
        error: 'sale_price must be a positive number.',
      });
    }

    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({
        success: false,
        error: 'total_qty must be a positive integer.',
      });
    }

    await client.query('BEGIN');

    // Verify sale exists and is still SCHEDULED
    const { rows: saleRows } = await client.query(
      `SELECT id, status FROM sales WHERE id = $1 FOR UPDATE`,
      [sale_id]
    );

    if (saleRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Sale not found.',
      });
    }

    if (saleRows[0].status !== 'SCHEDULED') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `Cannot add products to a sale with status: ${saleRows[0].status}.`,
      });
    }

    // Verify product exists and is active
    const { rows: productRows } = await client.query(
      `SELECT id FROM products WHERE id = $1 AND is_active = true`,
      [product_id]
    );

    if (productRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Product not found or inactive.',
      });
    }


    const { rows: spRows } = await client.query(
      `INSERT INTO sale_products (sale_id, product_id, sale_price, total_qty)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (sale_id, product_id)
       DO UPDATE SET sale_price = EXCLUDED.sale_price,
                     total_qty  = EXCLUDED.total_qty
       RETURNING id, sale_id, product_id, sale_price, total_qty, reserved_qty`,
      [sale_id, product_id, price, qty]
    );

    const saleProduct = spRows[0];

   
    await client.query(
      `INSERT INTO inventory (sale_product_id, available_qty)
       VALUES ($1, $2)
       ON CONFLICT (sale_product_id)
       DO UPDATE SET available_qty = EXCLUDED.available_qty,
                     last_synced_at = NOW()`,
      [saleProduct.id, qty]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Product added to sale successfully.',
      data: { sale_product: saleProduct },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});


// Protected — removes a product from a SCHEDULED sale

router.delete('/:id/products/:saleProductId', authenticate, async (req, res, next) => {
  const client = await getClient();
  try {
    const { id: sale_id, saleProductId } = req.params;

    await client.query('BEGIN');

    // Verify sale is still SCHEDULED
    const { rows: saleRows } = await client.query(
      `SELECT status FROM sales WHERE id = $1 FOR UPDATE`,
      [sale_id]
    );

    if (saleRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Sale not found.',
      });
    }

    if (saleRows[0].status !== 'SCHEDULED') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Cannot remove products from a sale that is not SCHEDULED.',
      });
    }

 
    await client.query(
      `DELETE FROM inventory WHERE sale_product_id = $1`,
      [saleProductId]
    );

    const { rows } = await client.query(
      `DELETE FROM sale_products
       WHERE id = $1 AND sale_id = $2
       RETURNING id`,
      [saleProductId, sale_id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Sale product not found.',
      });
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Product removed from sale successfully.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// Protected — cancels a SCHEDULED sale before it starts

router.patch('/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await query(
      `UPDATE sales
       SET status = 'ENDED'
       WHERE id = $1 AND status = 'SCHEDULED'
       RETURNING id, name, status`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Sale not found or cannot be cancelled (only SCHEDULED sales can be cancelled).',
      });
    }

    res.json({
      success: true,
      message: 'Sale cancelled successfully.',
      data: { sale: rows[0] },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;