const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { query } = require("../config/db");
const { authenticate } = require("../middleware/auth");
const {
  reserveInventory,
  isSaleActive,
  acquireProcessingLock,
  releaseProcessingLock,
} = require("../services/inventoryService");
const {
  createOrder,
  getOrderByIdempotencyKey,
} = require("../services/orderService");
const {
  userRateLimiter,
  buyRateLimiter,
  globalRateLimiter,
} = require("../middleware/rateLimiter");
const router = express.Router();

//   1. Validate idempotency key (duplicate request check)
//   2. Verify sale is active
//   3. Verify product is part of sale
//   4. Acquire per-user processing lock
//   5. Atomic inventory decrement in Redis
//   6. Write order + outbox event in single DB transaction
//   7. Release processing lock

router.post(
  "/",
  globalRateLimiter(1000, 1000), 
  authenticate, 
  userRateLimiter(10, 10000), 
  buyRateLimiter(3, 30000),
  async (req, res, next) => {
    const { sale_id, sale_product_id, quantity = 1 } = req.body;
    const userId = req.user.id;

    const idempotencyKey = req.headers["x-idempotency-key"] || uuidv4();

    if (!sale_id || !sale_product_id) {
      return res.status(400).json({
        success: false,
        error: "sale_id and sale_product_id are required.",
      });
    }

    if (quantity < 1 || quantity > 5) {
      return res.status(400).json({
        success: false,
        error: "quantity must be between 1 and 5.",
      });
    }

    const existingOrder = await getOrderByIdempotencyKey(idempotencyKey);
    if (existingOrder) {
      return res.status(200).json({
        success: true,
        message: "Order already placed.",
        data: { order: existingOrder },
      });
    }

    const saleActive = await isSaleActive(sale_id);
    if (!saleActive) {
      const { rows } = await query(`SELECT status FROM sales WHERE id = $1`, [
        sale_id,
      ]);

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Sale not found.",
        });
      }

      if (rows[0].status !== "ACTIVE") {
        return res.status(400).json({
          success: false,
          error: `Sale is not active. Current status: ${rows[0].status}.`,
        });
      }
    }

    const { rows: spRows } = await query(
      `SELECT sp.id, sp.sale_price, sp.total_qty, sp.reserved_qty,
            p.id AS product_id, p.name AS product_name
     FROM sale_products sp
     JOIN products p ON p.id = sp.product_id
     WHERE sp.id = $1 AND sp.sale_id = $2`,
      [sale_product_id, sale_id]
    );

    if (spRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Product not found in this sale.",
      });
    }

    const saleProduct = spRows[0];

    const { rows: existingOrderRows } = await query(
      `SELECT o.id FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1
       AND o.sale_id = $2
       AND oi.product_id = $3
       AND o.status IN ('PENDING', 'CONFIRMED')`,
      [userId, sale_id, saleProduct.product_id]
    );

    if (existingOrderRows.length > 0) {
      return res.status(409).json({
        success: false,
        error: "You have already purchased this product in this sale.",
      });
    }

    const lockAcquired = await acquireProcessingLock(sale_id, userId);
    if (!lockAcquired) {
      return res.status(429).json({
        success: false,
        error: "Your previous request is still being processed. Please wait.",
      });
    }

    try {
      const inventory = await reserveInventory(sale_product_id, sale_id);

      if (!inventory.success) {
        if (inventory.reason === "OUT_OF_STOCK") {
          return res.status(409).json({
            success: false,
            error: "Sorry, this item is sold out.",
          });
        }
        if (inventory.reason === "SALE_NOT_FOUND") {
          return res.status(400).json({
            success: false,
            error: "Sale has ended.",
          });
        }
      }

      const { order } = await createOrder({
        userId,
        saleId: sale_id,
        saleProductId: sale_product_id,
        product: saleProduct,
        quantity,
        unitPrice: parseFloat(saleProduct.sale_price),
        idempotencyKey,
      });

      res.status(201).json({
        success: true,
        message: "Order placed successfully. Payment is being processed.",
        data: {
          order: {
            id: order.id,
            status: order.status,
            total_amount: order.total_amount,
            created_at: order.created_at,
            items_remaining: inventory.remaining,
          },
        },
      });
    } finally {
      await releaseProcessingLock(sale_id, userId);
    }
  }
);

// Protected — returns the logged-in user's order history

router.get("/", authenticate,userRateLimiter(30, 10000), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const { rows: orders } = await query(
      `SELECT
         o.id, o.sale_id, o.status, o.total_amount, o.created_at, o.updated_at,
         s.name AS sale_name,
         json_agg(json_build_object(
           'product_id',   oi.product_id,
           'product_name', p.name,
           'quantity',     oi.quantity,
           'unit_price',   oi.unit_price
         )) AS items
       FROM orders o
       JOIN sales s ON s.id = o.sale_id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       WHERE o.user_id = $1
       GROUP BY o.id, s.name
       ORDER BY o.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM orders WHERE user_id = $1`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          total: parseInt(countRows[0].count),
          page,
          limit,
          total_pages: Math.ceil(parseInt(countRows[0].count) / limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// Protected — returns a single order (must belong to the requesting user)

router.get("/:id", authenticate,userRateLimiter(30, 10000), async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { rows } = await query(
      `SELECT
         o.id, o.sale_id, o.status, o.total_amount,
         o.created_at, o.updated_at, o.idempotency_key,
         s.name AS sale_name,
         json_agg(json_build_object(
           'product_id',   oi.product_id,
           'product_name', p.name,
           'quantity',     oi.quantity,
           'unit_price',   oi.unit_price
         )) AS items
       FROM orders o
       JOIN sales s ON s.id = o.sale_id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       WHERE o.id = $1 AND o.user_id = $2
       GROUP BY o.id, s.name`,
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Order not found.",
      });
    }

    res.json({
      success: true,
      data: { order: rows[0] },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
