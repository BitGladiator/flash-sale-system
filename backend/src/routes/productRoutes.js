const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/db');
const { uploadFile, getFileUrl, deleteFile, client, BUCKET } = require('../config/minio');
const { authenticate } = require('../middleware/auth');
const { userRateLimiter } = require('../middleware/rateLimiter');
const router = express.Router();


const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, 
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG and WebP images are allowed.'));
    }
  },
});



const attachImageUrl = (product) => ({
  ...product,
  image_url: product.image_key ? getFileUrl(product.image_key) : null,
});



router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const { rows: products } = await query(
      `SELECT id, name, description, base_price, image_key, is_active, created_at
       FROM products
       WHERE is_active = true
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM products WHERE is_active = true`
    );

    const total = parseInt(countRows[0].count);

    res.json({
      success: true,
      data: {
        products: products.map(attachImageUrl),
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



router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await query(
      `SELECT id, name, description, base_price, image_key, is_active, created_at
       FROM products WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found.',
      });
    }

    res.json({
      success: true,
      data: { product: attachImageUrl(rows[0]) },
    });
  } catch (err) {
    next(err);
  }
});


router.get('/images/:folder/:filename', async (req, res, next) => {
  try {
    const { folder, filename } = req.params;
    const objectKey = `${folder}/${filename}`;

    const stat = await client.statObject(BUCKET, objectKey);

    res.setHeader('Content-Type', stat.metaData['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const stream = await client.getObject(BUCKET, objectKey);
    stream.pipe(res);
  } catch (err) {
    if (err.code === 'NoSuchKey' || err.code === 'NotFound') {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }
    next(err);
  }
});


// Protected — requires auth
// Accepts multipart/form-data with optional image file
router.post('/', authenticate,userRateLimiter(20, 60000), upload.single('image'), async (req, res, next) => {
  try {
    const { name, description, base_price } = req.body;

    // Validation
    if (!name || !base_price) {
      return res.status(400).json({
        success: false,
        error: 'name and base_price are required.',
      });
    }

    const price = parseFloat(base_price);
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({
        success: false,
        error: 'base_price must be a positive number.',
      });
    }

    let image_key = null;
    if (req.file) {
      const ext = req.file.mimetype.split('/')[1];
      const objectKey = `products/${uuidv4()}.${ext}`;
      image_key = await uploadFile(objectKey, req.file.buffer, req.file.mimetype);
    }

    const { rows } = await query(
      `INSERT INTO products (name, description, base_price, image_key)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, base_price, image_key, is_active, created_at`,
      [name.trim(), description?.trim() || null, price, image_key]
    );

    const product = rows[0];

    res.status(201).json({
      success: true,
      message: 'Product created successfully.',
      data: { product: attachImageUrl(product) },
    });
  } catch (err) {
    next(err);
  }
});



router.put('/:id', authenticate,userRateLimiter(20, 60000), upload.single('image'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, base_price, is_active } = req.body;

    const existing = await query(
      `SELECT id, image_key FROM products WHERE id = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found.',
      });
    }

    const currentProduct = existing.rows[0];

    if (base_price !== undefined) {
      const price = parseFloat(base_price);
      if (isNaN(price) || price <= 0) {
        return res.status(400).json({
          success: false,
          error: 'base_price must be a positive number.',
        });
      }
    }

    let image_key = currentProduct.image_key;
    if (req.file) {
    
      if (currentProduct.image_key) {
        await deleteFile(currentProduct.image_key);
      }
   
      const ext = req.file.mimetype.split('/')[1];
      const objectKey = `products/${uuidv4()}.${ext}`;
      image_key = await uploadFile(objectKey, req.file.buffer, req.file.mimetype);
    }

   
   
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name.trim());
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description.trim());
    }
    if (base_price !== undefined) {
      updates.push(`base_price = $${paramIndex++}`);
      values.push(parseFloat(base_price));
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active === 'true' || is_active === true);
    }
    if (req.file) {
      updates.push(`image_key = $${paramIndex++}`);
      values.push(image_key);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields provided to update.',
      });
    }

    values.push(id);

    const { rows } = await query(
      `UPDATE products
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, name, description, base_price, image_key, is_active, created_at`,
      values
    );

    res.json({
      success: true,
      message: 'Product updated successfully.',
      data: { product: attachImageUrl(rows[0]) },
    });
  } catch (err) {
    next(err);
  }
});




router.delete('/:id', authenticate,userRateLimiter(20, 60000), async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await query(
      `UPDATE products
       SET is_active = false
       WHERE id = $1 AND is_active = true
       RETURNING id`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found or already deactivated.',
      });
    }

    res.json({
      success: true,
      message: 'Product deactivated successfully.',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;