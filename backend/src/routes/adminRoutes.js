const express = require("express");
const { query } = require("../config/db");
const { client: redis } = require("../config/redis");
const { authenticate, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate, requireAdmin);

const inventoryKey = (saleProductId) => `inventory:${saleProductId}`;

router.get("/stats", async (req, res, next) => {
  try {
    const [usersResult, ordersResult, salesResult, revenueResult] =
      await Promise.all([
        query(`SELECT COUNT(*) FROM users WHERE role = 'user'`),
        query(`SELECT COUNT(*), status FROM orders GROUP BY status`),
        query(`SELECT COUNT(*), status FROM sales GROUP BY status`),
        query(`SELECT COALESCE(SUM(total_amount), 0) AS total
             FROM orders WHERE status = 'CONFIRMED'`),
      ]);

    const orderCounts = { PENDING: 0, CONFIRMED: 0, FAILED: 0 };
    ordersResult.rows.forEach((r) => {
      orderCounts[r.status] = parseInt(r.count);
    });

    const saleCounts = { SCHEDULED: 0, ACTIVE: 0, ENDED: 0 };
    salesResult.rows.forEach((r) => {
      saleCounts[r.status] = parseInt(r.count);
    });

    res.json({
      success: true,
      data: {
        stats: {
          total_users: parseInt(usersResult.rows[0].count),
          total_revenue: parseFloat(revenueResult.rows[0].total),
          orders: orderCounts,
          sales: saleCounts,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/orders", async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`o.status = $${paramIndex++}`);
      values.push(status.toUpperCase());
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    values.push(parseInt(limit), offset);

    const { rows: orders } = await query(
      `SELECT
         o.id, o.status, o.total_amount, o.created_at, o.updated_at,
         u.email AS user_email, u.full_name AS user_name,
         s.name AS sale_name,
         json_agg(json_build_object(
           'product_name', p.name,
           'quantity', oi.quantity,
           'unit_price', oi.unit_price
         )) AS items
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN sales s ON s.id = o.sale_id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       ${whereClause}
       GROUP BY o.id, u.email, u.full_name, s.name
       ORDER BY o.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      values
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(DISTINCT o.id)
       FROM orders o
       JOIN users u ON u.id = o.user_id
       ${whereClause}`,
      values.slice(0, -2)
    );

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          total: parseInt(countRows[0].count),
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(
            parseInt(countRows[0].count) / parseInt(limit)
          ),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/sales/:id/monitor", async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: saleRows } = await query(
      `SELECT id, name, status, start_time, end_time FROM sales WHERE id = $1`,
      [id]
    );

    if (saleRows.length === 0) {
      return res.status(404).json({ success: false, error: "Sale not found." });
    }

    const sale = saleRows[0];

    const { rows: products } = await query(
      `SELECT
         sp.id AS sale_product_id,
         sp.total_qty, sp.reserved_qty, sp.sale_price,
         p.name AS product_name,
         COUNT(o.id) FILTER (WHERE o.status = 'CONFIRMED') AS confirmed_orders,
         COUNT(o.id) FILTER (WHERE o.status = 'PENDING')   AS pending_orders,
         COUNT(o.id) FILTER (WHERE o.status = 'FAILED')    AS failed_orders,
         COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'CONFIRMED'), 0)
           AS revenue
       FROM sale_products sp
       JOIN products p ON p.id = sp.product_id
       LEFT JOIN order_items oi ON oi.product_id = sp.product_id
       LEFT JOIN orders o ON o.id = oi.order_id AND o.sale_id = $1
       WHERE sp.sale_id = $1
       GROUP BY sp.id, p.name`,
      [id]
    );
    const enriched = await Promise.all(
      products.map(async (p) => {
        const redisQty = await redis.get(inventoryKey(p.sale_product_id));
        return {
          ...p,
          live_inventory: redisQty !== null ? parseInt(redisQty) : null,
          sold_pct: Math.round(
            ((p.total_qty -
              (redisQty !== null ? parseInt(redisQty) : p.total_qty)) /
              p.total_qty) *
              100
          ),
        };
      })
    );

    res.json({
      success: true,
      data: { sale, products: enriched },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/users", async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows: users } = await query(
      `SELECT
         u.id, u.email, u.full_name, u.role,
         u.is_active, u.created_at,
         COUNT(o.id) AS order_count,
         COALESCE(SUM(o.total_amount) FILTER (
           WHERE o.status = 'CONFIRMED'), 0) AS total_spent
       FROM users u
       LEFT JOIN orders o ON o.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit), offset]
    );

    const { rows: countRows } = await query(`SELECT COUNT(*) FROM users`);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          total: parseInt(countRows[0].count),
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(
            parseInt(countRows[0].count) / parseInt(limit)
          ),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
