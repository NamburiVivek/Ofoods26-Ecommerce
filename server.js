// ═══════════════════════════════════════════════════════════════
//  O FOODS — Backend Server (server.js)
//  Place this file in your project root folder alongside your HTML files
// ═══════════════════════════════════════════════════════════════

const express    = require('express');
const mysql      = require('mysql2/promise');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors       = require('cors');
const path       = require('path');
const crypto     = require('crypto'); // ← built-in Node module, no install needed
const Razorpay   = require('razorpay');  // ← npm install razorpay
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Razorpay Instance ─────────────────────────────────────────
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Serve all your HTML files as static files from the same folder
app.use(express.static(path.join(__dirname)));

// ── DB Pool ──────────────────────────────────────────────────
const db = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port:     parseInt(process.env.DB_PORT) || 24711,
  ssl:      { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 75,
});

// ── Auto-migration: add dob & address columns if missing ────
(async () => {
  try {
    const [cols] = await db.query('SHOW COLUMNS FROM users');
    const colNames = cols.map(c => c.Field);
    if (!colNames.includes('dob')) {
      await db.query('ALTER TABLE users ADD COLUMN dob DATE DEFAULT NULL');
      console.log('✅  Added dob column to users table');
    }
    if (!colNames.includes('address')) {
      await db.query('ALTER TABLE users ADD COLUMN address TEXT DEFAULT NULL');
      console.log('✅  Added address column to users table');
    }

    // ── Create user_addresses table for multi-address support ────
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_addresses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        label VARCHAR(50) DEFAULT 'Home',
        house VARCHAR(255),
        street VARCHAR(255),
        city VARCHAR(100),
        state VARCHAR(100),
        pincode VARCHAR(10),
        landmark VARCHAR(255),
        is_default TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✅  user_addresses table ready');

    // ── Add delivery_address column to orders table if missing ────
    try {
      const [orderCols] = await db.query('SHOW COLUMNS FROM orders');
      const orderColNames = orderCols.map(c => c.Field);
      if (!orderColNames.includes('delivery_address')) {
        await db.query('ALTER TABLE orders ADD COLUMN delivery_address TEXT DEFAULT NULL');
        console.log('✅  Added delivery_address column to orders table');
      }
      // ── Razorpay payment columns ────────────────────────────────
      if (!orderColNames.includes('razorpay_order_id')) {
        await db.query('ALTER TABLE orders ADD COLUMN razorpay_order_id VARCHAR(100) DEFAULT NULL');
        console.log('✅  Added razorpay_order_id column to orders table');
      }
      if (!orderColNames.includes('razorpay_payment_id')) {
        await db.query('ALTER TABLE orders ADD COLUMN razorpay_payment_id VARCHAR(100) DEFAULT NULL');
        console.log('✅  Added razorpay_payment_id column to orders table');
      }
      if (!orderColNames.includes('tracking_id')) {
        await db.query('ALTER TABLE orders ADD COLUMN tracking_id VARCHAR(100) DEFAULT NULL');
        console.log('✅  Added tracking_id column to orders table');
      }
    } catch (e) {
      console.warn('Orders migration skipped:', e.message);
    }

    // ── Migrate existing users.address data into user_addresses ────
    try {
      const [users] = await db.query('SELECT id, address FROM users WHERE address IS NOT NULL AND address != "" AND address != "null"');
      for (const u of users) {
        // Check if already migrated
        const [existing] = await db.query('SELECT id FROM user_addresses WHERE user_id = ? LIMIT 1', [u.id]);
        if (existing.length > 0) continue;
        try {
          const addr = JSON.parse(u.address);
          if (addr && (addr.house || addr.street || addr.city || addr.state || addr.pincode)) {
            await db.query(
              'INSERT INTO user_addresses (user_id, label, house, street, city, state, pincode, landmark, is_default) VALUES (?,?,?,?,?,?,?,?,1)',
              [u.id, 'Home', addr.house || '', addr.street || '', addr.city || '', addr.state || '', addr.pincode || '', addr.landmark || '']
            );
            console.log(`✅  Migrated address for user ${u.id}`);
          }
        } catch (pe) { /* skip invalid JSON */ }
      }
    } catch (e) {
      console.warn('Address migration skipped:', e.message);
    }

    // ── Add delivery_mode and default_store_id columns to users ────
    if (!colNames.includes('delivery_mode')) {
      await db.query('ALTER TABLE users ADD COLUMN delivery_mode VARCHAR(20) DEFAULT NULL');
      console.log('✅  Added delivery_mode column to users table');
    }
    if (!colNames.includes('default_store_id')) {
      await db.query('ALTER TABLE users ADD COLUMN default_store_id VARCHAR(10) DEFAULT NULL');
      console.log('✅  Added default_store_id column to users table');
    }
    if (!colNames.includes('default_address_id')) {
      await db.query('ALTER TABLE users ADD COLUMN default_address_id INT DEFAULT NULL');
      console.log('✅  Added default_address_id column to users table');
    }

    // ── Create promo_codes table ────
    await db.query(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        discount_type ENUM('percent','flat') DEFAULT 'flat',
        discount_value DECIMAL(10,2) NOT NULL,
        max_discount DECIMAL(10,2) DEFAULT NULL,
        min_order DECIMAL(10,2) DEFAULT 0,
        first_order_only TINYINT(1) DEFAULT 0,
        usage_limit INT DEFAULT NULL,
        used_count INT DEFAULT 0,
        expires_at DATETIME DEFAULT NULL,
        active TINYINT(1) DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅  promo_codes table ready');

    // ── Create promo_usage table ────
    await db.query(`
      CREATE TABLE IF NOT EXISTS promo_usage (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        promo_code VARCHAR(50) NOT NULL,
        order_id VARCHAR(50),
        used_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅  promo_usage table ready');

    // ── Seed default promo codes if empty ────
    const [existingPromos] = await db.query('SELECT COUNT(*) as cnt FROM promo_codes');
    if (existingPromos[0].cnt === 0) {
      await db.query(`INSERT INTO promo_codes (code, discount_type, discount_value, max_discount, min_order, first_order_only, active) VALUES
        ('OFOOD26', 'percent', 20, 200, 0, 1, 1),
        ('WELCOME50', 'flat', 50, NULL, 0, 1, 1),
        ('OFRESH20', 'percent', 20, 200, 0, 1, 1)
      `);
      console.log('✅  Seeded default promo codes');
    }

    // ── Add status column to orders if missing ────
    try {
      const [orderCols2] = await db.query('SHOW COLUMNS FROM orders');
      const orderColNames2 = orderCols2.map(c => c.Field);
      if (!orderColNames2.includes('status')) {
        await db.query("ALTER TABLE orders ADD COLUMN status VARCHAR(30) DEFAULT 'preparing'");
        console.log('✅  Added status column to orders table');
      }
    } catch (e) { /* orders table may not exist yet */ }

  } catch (e) {
    console.warn('Migration check skipped:', e.message);
  }
})();

// ── Email transporter ────────────────────────────────────────
// REPLACE WITH:
const mailer = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  pool: true,           // reuse connections
  maxConnections: 5,
  rateLimit: 10,        // max 10 emails/second
});

// ── Twilio client ────────────────────────────────────────────

// ── In-memory OTP store (key = email, value = {otp, expires, userData}) ──
const otpStore = new Map();

// ── In-memory password reset token store ─────────────────────
// key = token (hex string), value = { email, expiresAt }
// Tokens expire in 30 minutes and are deleted after single use
const resetTokenStore = new Map();

// ── Helpers ──────────────────────────────────────────────────
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function maskEmail(email) {
  const [user, domain] = email.split('@');
  return user.slice(0, 2) + '***@' + domain;
}

// REPLACE WITH:
async function sendEmailOTP(email, otp, name = '') {
  await mailer.sendMail({
    from: `"OFoods" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `${otp} — your OFoods login code`,
    text: `Hi ${name || 'there'},\n\nYour OFoods OTP is: ${otp}\n\nThis code expires in 10 minutes.\nDo not share this with anyone.\n\nIf you did not request this, ignore this email.\n\n— O Foods Team`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0D0D0D;color:#F5F0E8;padding:32px;border-radius:12px;">
        <h2 style="color:#d40d0d;font-size:28px;margin-bottom:4px;">O Foods</h2>
        <p style="color:#7A7068;font-size:13px;margin-bottom:24px;">Pickles · Spices · Snacks</p>
        <p style="font-size:15px;">Hi ${name || 'there'},</p>
        <p style="font-size:14px;color:#aaa;">Your one-time password is:</p>
        <div style="font-size:40px;font-weight:700;letter-spacing:12px;color:#d40d0d;margin:16px 0;text-align:center;">${otp}</div>
        <p style="font-size:12px;color:#7A7068;">This OTP expires in <strong>10 minutes</strong>. Do not share it.</p>
        <hr style="border:1px solid #333;margin:24px 0;">
        <p style="font-size:11px;color:#555;">© ${new Date().getFullYear()} O Foods. All rights reserved.</p>
      </div>
    `,
  });
}



// ════════════════════════════════════════════════════════════════
//  REGISTER — Step 1: Validate & Send OTP
// ════════════════════════════════════════════════════════════════
app.post('/api/register/send-otp', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password)
      return res.json({ success: false, error: 'All fields are required.' });

    if (password.length < 6)
      return res.json({ success: false, error: 'Password must be at least 6 characters.' });

    // Check if email already registered
    const [rows] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (rows.length > 0)
      return res.json({ success: false, error: 'This email is already registered. Please sign in.' });

    const otp = generateOTP();
    const expires = Date.now() + 10 * 60 * 1000; // 10 min
    const hashedPassword = await bcrypt.hash(password, 10);

    // Store pending registration data
    otpStore.set(email, { otp, expires, userData: { name, email, phone, password: hashedPassword } });

    
    try {   await sendEmailOTP(email, otp, name);   console.log('✅ OTP email sent to:', email); } catch (emailErr) {   console.error('❌ Email sending failed:', emailErr.message); }

    res.json({ success: true, maskedEmail: maskEmail(email) });
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: 'Server error. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════
//  REGISTER — Step 2: Verify OTP & Create Account
// ════════════════════════════════════════════════════════════════
app.post('/api/register/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    const record = otpStore.get(email);
    if (!record)
      return res.json({ success: false, error: 'OTP expired or not found. Please request a new one.' });

    if (Date.now() > record.expires)
      return res.json({ success: false, error: 'OTP expired. Please request a new one.' });

    if (record.otp !== otp)
      return res.json({ success: false, error: 'Invalid OTP. Please try again.' });

    const { name, phone, password } = record.userData;

    // Insert user into DB
    const [result] = await db.query(
      'INSERT INTO users (name, email, phone, password, created_at) VALUES (?, ?, ?, ?, NOW())',
      [name, email, phone, password]
    );

    otpStore.delete(email);

    const user = { id: result.insertId, name, email, phone };
    const token = jwt.sign({ id: user.id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ success: true, token, user, message: `Welcome to O Foods, ${name}! 🎉` });
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: 'Server error. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════
//  LOGIN — Step 1: Verify credentials & Send OTP
// ════════════════════════════════════════════════════════════════
app.post('/api/login/send-otp', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.json({ success: false, error: 'Email and password are required.' });

    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0)
      return res.json({ success: false, error: 'No account found with this email. Please create one.' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.json({ success: false, error: 'Incorrect password. Please try again.' });

    const otp = generateOTP();
    const expires = Date.now() + 10 * 60 * 1000;

    otpStore.set(email, { otp, expires, userData: { id: user.id, name: user.name, email, phone: user.phone } });

    
    await sendEmailOTP(email, otp, user.name);

   res.json({
  success: true,
  maskedEmail: maskEmail(email),
});
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: 'Server error. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════
//  LOGIN — Step 2: Verify OTP
// ════════════════════════════════════════════════════════════════
app.post('/api/login/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    const record = otpStore.get(email);
    if (!record)
      return res.json({ success: false, error: 'OTP expired. Please request a new one.' });

    if (Date.now() > record.expires)
      return res.json({ success: false, error: 'OTP expired. Please request a new one.' });

    if (record.otp !== otp)
      return res.json({ success: false, error: 'Invalid OTP. Please try again.' });

    const user = record.userData;
    otpStore.delete(email);

    const token = jwt.sign({ id: user.id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ success: true, token, user });
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: 'Server error. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════
//  AUTH MIDDLEWARE
// ════════════════════════════════════════════════════════════════
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  try {
    req.user = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Token invalid or expired.' });
  }
}

// ════════════════════════════════════════════════════════════════
//  PROFILE — Get & Update
// ════════════════════════════════════════════════════════════════
app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, phone, dob, address, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.json({ success: false, error: 'User not found.' });
    res.json({ success: true, user: rows[0] });
  } catch (e) {
    res.json({ success: false, error: 'Server error.' });
  }
});

app.put('/api/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone, dob, address } = req.body;
    await db.query(
      'UPDATE users SET name = ?, phone = ?, dob = ?, address = ? WHERE id = ?',
      [name, phone, dob || null, address || null, req.user.id]
    );
    res.json({ success: true, message: 'Profile updated.' });
  } catch (e) {
    res.json({ success: false, error: 'Server error.' });
  }
});

// ════════════════════════════════════════════════════════════════
//  ADDRESSES — Multi-address CRUD
// ════════════════════════════════════════════════════════════════

// List all addresses
app.get('/api/addresses', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
      [req.user.id]
    );
    res.json({ success: true, addresses: rows });
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: 'Could not fetch addresses.' });
  }
});

// Add new address (max 10)
app.post('/api/addresses', authMiddleware, async (req, res) => {
  try {
    const { label, house, street, city, state, pincode, landmark, is_default } = req.body;
    if (!city && !state && !pincode) {
      return res.json({ success: false, error: 'City, state, or pincode is required.' });
    }
    // Check limit
    const [countRows] = await db.query('SELECT COUNT(*) as cnt FROM user_addresses WHERE user_id = ?', [req.user.id]);
    if (countRows[0].cnt >= 10) {
      return res.json({ success: false, error: 'Maximum 10 addresses allowed. Please delete one first.' });
    }
    // If setting as default, unset others
    if (is_default) {
      await db.query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    }
    // If this is the first address, make it default
    const makeDefault = is_default || countRows[0].cnt === 0 ? 1 : 0;
    const [result] = await db.query(
      'INSERT INTO user_addresses (user_id, label, house, street, city, state, pincode, landmark, is_default) VALUES (?,?,?,?,?,?,?,?,?)',
      [req.user.id, label || 'Home', house || '', street || '', city || '', state || '', pincode || '', landmark || '', makeDefault]
    );
    res.json({ success: true, addressId: result.insertId, message: 'Address added.' });
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: 'Could not add address.' });
  }
});

// Update address
app.put('/api/addresses/:id', authMiddleware, async (req, res) => {
  try {
    const { label, house, street, city, state, pincode, landmark, is_default } = req.body;
    // Verify ownership
    const [check] = await db.query('SELECT id FROM user_addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!check.length) return res.json({ success: false, error: 'Address not found.' });
    if (is_default) {
      await db.query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    }
    await db.query(
      'UPDATE user_addresses SET label=?, house=?, street=?, city=?, state=?, pincode=?, landmark=?, is_default=? WHERE id=? AND user_id=?',
      [label || 'Home', house || '', street || '', city || '', state || '', pincode || '', landmark || '', is_default ? 1 : 0, req.params.id, req.user.id]
    );
    res.json({ success: true, message: 'Address updated.' });
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: 'Could not update address.' });
  }
});

// Delete address
app.delete('/api/addresses/:id', authMiddleware, async (req, res) => {
  try {
    const [check] = await db.query('SELECT id, is_default FROM user_addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!check.length) return res.json({ success: false, error: 'Address not found.' });
    await db.query('DELETE FROM user_addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    // If deleted address was default, set the next one as default
    if (check[0].is_default) {
      const [remaining] = await db.query('SELECT id FROM user_addresses WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [req.user.id]);
      if (remaining.length) {
        await db.query('UPDATE user_addresses SET is_default = 1 WHERE id = ?', [remaining[0].id]);
      }
    }
    res.json({ success: true, message: 'Address deleted.' });
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: 'Could not delete address.' });
  }
});

// Set default address
app.put('/api/addresses/:id/default', authMiddleware, async (req, res) => {
  try {
    const [check] = await db.query('SELECT id FROM user_addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!check.length) return res.json({ success: false, error: 'Address not found.' });
    await db.query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    await db.query('UPDATE user_addresses SET is_default = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true, message: 'Default address updated.' });
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: 'Could not set default.' });
  }
});

// ════════════════════════════════════════════════════════════════
//  ORDERS — Save & Retrieve
// ════════════════════════════════════════════════════════════════
app.post('/api/orders', authMiddleware, async (req, res) => {
  try {
    const { items, total, store, slot, pickup_date, payment, delivery_address, delivery_method, upi_id } = req.body;
    const orderId = 'OF' + Date.now().toString().slice(-6);
    await db.query(
      'INSERT INTO orders (order_id, user_id, items_json, total, store, slot, pickup_date, payment, delivery_address, delivery_method, upi_id, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW())',
      [orderId, req.user.id, JSON.stringify(items), total, delivery_address || store || '', slot || null, pickup_date || null, payment, delivery_address || '', delivery_method || null, upi_id || null, 'preparing']
    );
    res.json({ success: true, orderId });
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: 'Could not save order.' });
  }
});

app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ success: true, orders: rows });
  } catch (e) {
    res.json({ success: false, error: 'Could not fetch orders.' });
  }
});
// ════════════════════════════════════════════════════════════════
//  PRODUCTS — Public read, Admin write (single source of truth)
// ════════════════════════════════════════════════════════════════

// PUBLIC — every page calls this to get live prices
app.get('/api/products', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, name, price, mrp, sizes_json, updated_at FROM products');
    const products = {};
    rows.forEach(r => {
      products[r.id] = {
        name: r.name,
        price: parseFloat(r.price),
        mrp: r.mrp ? parseFloat(r.mrp) : null,
        sizes: r.sizes_json ? JSON.parse(r.sizes_json) : [],
        updated_at: r.updated_at
      };
    });
    res.json({ success: true, products });
  } catch (e) {
    console.error('Get products error:', e);
    res.json({ success: false, error: 'Could not load products.' });
  }
});

// Admin-only guard (reuses your JWT auth, checks isAdmin flag from /api/admin/login)
function adminOnly(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ success: false, error: 'Admin access required.' });
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Token invalid or expired.' });
  }
}

// ADMIN — list all products (for the Admin.html table)
app.get('/api/admin/products', adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, name, price, mrp, sizes_json, updated_at FROM products ORDER BY id');
    const products = rows.map(r => ({
      id: r.id,
      name: r.name,
      price: parseFloat(r.price),
      mrp: r.mrp ? parseFloat(r.mrp) : null,
      sizes: r.sizes_json ? JSON.parse(r.sizes_json) : [],
      updated_at: r.updated_at
    }));
    res.json({ success: true, products });
  } catch (e) {
    res.json({ success: false, error: 'Could not load products.' });
  }
});

// ADMIN — update a single product's price(s)
app.put('/api/admin/products/:id', adminOnly, async (req, res) => {
  try {
    const { price, mrp, sizes } = req.body;
    if (price == null || isNaN(price)) return res.json({ success: false, error: 'Valid price is required.' });

    const [check] = await db.query('SELECT id FROM products WHERE id = ?', [req.params.id]);
    if (!check.length) return res.json({ success: false, error: 'Product not found.' });

    await db.query(
      'UPDATE products SET price = ?, mrp = ?, sizes_json = ? WHERE id = ?',
      [price, mrp || null, JSON.stringify(sizes || []), req.params.id]
    );
    res.json({ success: true, message: 'Price updated.' });
  } catch (e) {
    console.error('Update product error:', e);
    res.json({ success: false, error: 'Could not update product.' });
  }
});
// ════════════════════════════════════════════════════════════════
//  NOTIFY ORDER — Send Email + SMS after order confirmation
// ════════════════════════════════════════════════════════════════
app.post('/api/notify-order', authMiddleware, async (req, res) => {
  try {
    const { orderId, items, total, slot, payment, upiId, deliveryAddress } = req.body;

    const [rows] = await db.query(
      'SELECT name, email, phone FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.json({ success: false, error: 'User not found.' });

    const { name, email, phone } = rows[0];

    const itemsHtml = (items || []).map(item =>
      `<tr>
        <td style="padding:8px 0;color:#F5F0E8;font-size:13px;">${item.name}</td>
        <td style="padding:8px 0;color:#F5F0E8;font-size:13px;text-align:center;">×${item.qty}</td>
        <td style="padding:8px 0;color:#d40d0d;font-size:13px;text-align:right;">₹${item.price * item.qty}</td>
      </tr>`
    ).join('');

    const addrText = deliveryAddress || 'Address not provided';

    await mailer.sendMail({
      from: `"O Foods" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Order Confirmed — ${orderId} | O Foods`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0D0D0D;color:#F5F0E8;padding:32px;border-radius:12px;">
          <h2 style="color:#d40d0d;margin-bottom:4px;">O Foods</h2>
          <p style="color:#7A7068;font-size:13px;margin-bottom:24px;">Pickles · Spices · Snacks</p>
          <p style="font-size:16px;font-weight:700;">Hi ${name}, your order is confirmed! 🎉</p>
          <div style="background:#1C1C1C;border-radius:8px;padding:16px;margin:16px 0;">
            <p style="font-size:12px;color:#7A7068;margin-bottom:4px;">ORDER ID</p>
            <p style="font-size:20px;font-weight:700;letter-spacing:2px;">${orderId}</p>
          </div>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">${itemsHtml}</table>
          <hr style="border:1px solid #333;margin:16px 0;">
          <p style="font-size:14px;">Total: <strong style="color:#d40d0d;">₹${total}</strong></p>
          <p style="font-size:13px;color:#aaa;">Payment: ${payment.toUpperCase()}${upiId ? ' (' + upiId + ')' : ''}</p>
          <p style="font-size:13px;color:#aaa;">📦 Delivery to: ${addrText}</p>
          <p style="font-size:13px;color:#aaa;">📅 Delivery slot: ${slot}</p>
          <hr style="border:1px solid #333;margin:24px 0;">
          <p style="font-size:11px;color:#555;">© ${new Date().getFullYear()} O Foods. All rights reserved.</p>
        </div>
      `,
    });

   

    res.json({ success: true });
  } catch (e) {
    console.error('Notify error:', e);
    res.json({ success: false, error: 'Notification failed.' });
  }
});

// ════════════════════════════════════════════════════════════════
//  FORGOT PASSWORD — Step 1: Generate token & send reset email
//
//  POST /api/password/forgot
//  Body: { email }
// ════════════════════════════════════════════════════════════════
app.post('/api/password/forgot', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !/\S+@\S+\.\S+/.test(email))
      return res.json({ success: false, error: 'Please provide a valid email address.' });

    // Look up user — always return success to prevent email enumeration
    const [rows] = await db.query('SELECT id, name FROM users WHERE email = ?', [email]);
    if (!rows.length) {
      // Return success so attackers cannot tell if email exists
      return res.json({ success: true });
    }

    const user = rows[0];

    // Generate a cryptographically secure 64-char hex token
    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes

    // Remove any existing token for this email (one active token at a time)
    for (const [k, v] of resetTokenStore.entries()) {
      if (v.email === email) resetTokenStore.delete(k);
    }

    // Store in memory (survives until server restart; for production use a DB table)
    resetTokenStore.set(token, { email, expiresAt });

    // Build the reset URL — points back to login.html with the token as a query param
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:24711';
    const resetUrl    = `${frontendUrl}/login.html?reset_token=${token}`;

    // Send branded reset email
    await mailer.sendMail({
      from: `"O Foods" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Reset your O Foods password',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#0D0D0D;color:#F5F0E8;padding:0;border-radius:14px;overflow:hidden;">
          <!-- Header -->
          <div style="background:linear-gradient(135deg,#c41a1a,#6b0a0a);padding:32px 36px 28px;text-align:center;">
            <h1 style="color:#fff;font-size:30px;margin:0;letter-spacing:-.5px;">O Foods</h1>
            <p style="color:rgba(255,255,255,.65);font-size:12px;margin:6px 0 0;letter-spacing:1px;text-transform:uppercase;">Authentic · Handcrafted</p>
          </div>
          <!-- Body -->
          <div style="padding:36px;">
            <p style="font-size:16px;font-weight:700;margin:0 0 8px;">Hi ${user.name},</p>
            <p style="font-size:14px;color:#aaa;line-height:1.7;margin:0 0 28px;">
              We received a request to reset the password for your O Foods account.
              Click the button below to choose a new password.
            </p>
            <!-- CTA Button -->
            <div style="text-align:center;margin-bottom:28px;">
              <a href="${resetUrl}"
                style="display:inline-block;background:#d40d0d;color:#fff;text-decoration:none;
                       padding:16px 36px;border-radius:8px;font-weight:700;font-size:14px;
                       letter-spacing:.5px;text-transform:uppercase;
                       box-shadow:0 4px 20px rgba(212,13,13,.4);">
                Reset My Password
              </a>
            </div>
            <p style="font-size:12px;color:#7A7068;line-height:1.7;margin:0 0 20px;">
              This link expires in <strong style="color:#F5F0E8;">30 minutes</strong>.
              If you did not request a password reset, you can safely ignore this email —
              your account remains secure.
            </p>
            <hr style="border:none;border-top:1px solid #2a2a2a;margin:20px 0;">
            <p style="font-size:11px;color:#555;line-height:1.6;margin:0;">
              If the button above doesn't work, paste this URL into your browser:<br>
              <a href="${resetUrl}" style="color:#d40d0d;word-break:break-all;">${resetUrl}</a>
            </p>
          </div>
          <!-- Footer -->
          <div style="padding:16px 36px;border-top:1px solid #1e1e1e;text-align:center;">
            <p style="font-size:11px;color:#555;margin:0;">© ${new Date().getFullYear()} O Foods. All rights reserved.</p>
          </div>
        </div>
      `,
    });

    res.json({ success: true });

  } catch (e) {
    console.error('Forgot password error:', e);
    res.json({ success: false, error: 'Server error. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════
//  RESET PASSWORD — Step 2: Validate token & update password in DB
//
//  POST /api/password/reset
//  Body: { token, newPassword }
// ════════════════════════════════════════════════════════════════
app.post('/api/password/reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword)
      return res.json({ success: false, error: 'Token and new password are required.' });

    if (newPassword.length < 6)
      return res.json({ success: false, error: 'Password must be at least 6 characters.' });

    // ── 1. Validate token ──────────────────────────────────────────
    const record = resetTokenStore.get(token);

    if (!record)
      return res.json({ success: false, error: 'Invalid or already-used reset link. Please request a new one.' });

    if (Date.now() > record.expiresAt) {
      resetTokenStore.delete(token); // clean up expired token
      return res.json({ success: false, error: 'Reset link has expired. Please request a new one.' });
    }

    const { email } = record;

    // ── 2. Hash new password ───────────────────────────────────────
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // ── 3. Update password in database ────────────────────────────
    const [result] = await db.query(
      'UPDATE users SET password = ? WHERE email = ?',
      [hashedPassword, email]
    );

    if (result.affectedRows === 0)
      return res.json({ success: false, error: 'User not found.' });

    // ── 4. Invalidate the token — one-time use only ────────────────
    resetTokenStore.delete(token);

    res.json({ success: true, message: 'Your password has been successfully updated.' });

  } catch (e) {
    console.error('Reset password error:', e);
    res.json({ success: false, error: 'Server error. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════
//  PROMO VALIDATION — Server-side
// ════════════════════════════════════════════════════════════════
app.post('/api/promo/validate', authMiddleware, async (req, res) => {
  try {
    const { code, subtotal } = req.body;
    if (!code) return res.json({ valid: false, error: 'Please enter a promo code.' });

    const [rows] = await db.query('SELECT * FROM promo_codes WHERE code = ? AND active = 1', [code.toUpperCase()]);
    if (!rows.length) return res.json({ valid: false, error: 'Invalid or expired promo code.' });

    const promo = rows[0];

    // Check expiry
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return res.json({ valid: false, error: 'This promo code has expired.' });
    }

    // Check usage limit
    if (promo.usage_limit && promo.used_count >= promo.usage_limit) {
      return res.json({ valid: false, error: 'This promo code has reached its usage limit.' });
    }

    // Check if user already used this code
    const [usageRows] = await db.query('SELECT id FROM promo_usage WHERE user_id = ? AND promo_code = ?', [req.user.id, code.toUpperCase()]);
    if (usageRows.length > 0) {
      return res.json({ valid: false, error: 'You have already used this promo code.' });
    }

    // Check first-order-only restriction
    if (promo.first_order_only) {
      const [orderRows] = await db.query('SELECT id FROM orders WHERE user_id = ? LIMIT 1', [req.user.id]);
      if (orderRows.length > 0) {
        return res.json({ valid: false, error: 'This promo is valid only for your first order.' });
      }
    }

    // Check minimum order
    if (promo.min_order && subtotal < promo.min_order) {
      return res.json({ valid: false, error: `Minimum order of ₹${promo.min_order} required.` });
    }

    // Calculate discount
    let discount = 0;
    if (promo.discount_type === 'percent') {
      discount = Math.round((subtotal * promo.discount_value) / 100);
      if (promo.max_discount) discount = Math.min(discount, promo.max_discount);
    } else {
      discount = promo.discount_value;
    }

    const label = promo.discount_type === 'percent'
      ? `${code.toUpperCase()} — ${promo.discount_value}% off${promo.max_discount ? ' (max ₹'+promo.max_discount+')' : ''}`
      : `${code.toUpperCase()} — ₹${promo.discount_value} off`;

    res.json({
      valid: true,
      discount: Math.round(discount),
      discountType: promo.discount_type,
      label,
      code: code.toUpperCase()
    });
  } catch (e) {
    console.error('Promo validation error:', e);
    res.json({ valid: false, error: 'Server error validating promo.' });
  }
});

// ════════════════════════════════════════════════════════════════
//  USER PREFERENCES — Delivery Mode
// ════════════════════════════════════════════════════════════════
app.get('/api/profile/preferences', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT delivery_mode, default_store_id, default_address_id FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.json({ success: false, error: 'User not found.' });
    res.json({ success: true, preferences: rows[0] });
  } catch (e) {
    res.json({ success: false, error: 'Server error.' });
  }
});

app.put('/api/profile/preferences', authMiddleware, async (req, res) => {
  try {
    const { deliveryMode, defaultStoreId, defaultAddressId } = req.body;
    await db.query(
      'UPDATE users SET delivery_mode = ?, default_store_id = ?, default_address_id = ? WHERE id = ?',
      [deliveryMode || null, defaultStoreId || null, defaultAddressId || null, req.user.id]
    );
    res.json({ success: true, message: 'Preferences updated.' });
  } catch (e) {
    res.json({ success: false, error: 'Server error.' });
  }
});

// ════════════════════════════════════════════════════════════════
//  USER HAS ORDERS — Check for first-order eligibility
// ════════════════════════════════════════════════════════════════
app.get('/api/user/has-orders', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id FROM orders WHERE user_id = ? LIMIT 1', [req.user.id]);
    res.json({ success: true, hasOrders: rows.length > 0 });
  } catch (e) {
    res.json({ success: true, hasOrders: false });
  }
});

// ════════════════════════════════════════════════════════════════
//  ORDER STATUS — Get & Update
// ════════════════════════════════════════════════════════════════
app.get('/api/orders/:orderId/status', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT order_id, status, created_at FROM orders WHERE order_id = ? AND user_id = ?',
      [req.params.orderId, req.user.id]
    );
    if (!rows.length) return res.json({ success: false, error: 'Order not found.' });
    res.json({ success: true, orderId: rows[0].order_id, status: rows[0].status, createdAt: rows[0].created_at });
  } catch (e) {
    res.json({ success: false, error: 'Server error.' });
  }
});

app.post('/api/orders/:orderId/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['preparing', 'dispatched', 'delivered', 'ready', 'picked_up', 'cancelled'];
    if (!validStatuses.includes(status)) return res.json({ success: false, error: 'Invalid status.' });

    await db.query('UPDATE orders SET status = ? WHERE order_id = ?', [status, req.params.orderId]);

    // Send SMS notification on status change
   

    res.json({ success: true, message: 'Order status updated.' });
  } catch (e) {
    res.json({ success: false, error: 'Server error.' });
  }
});

// ════════════════════════════════════════════════════════════════
//  MARK PROMO USED — Called after order placement
// ════════════════════════════════════════════════════════════════
app.post('/api/promo/use', authMiddleware, async (req, res) => {
  try {
    const { code, orderId } = req.body;
    if (!code) return res.json({ success: true });
    await db.query('INSERT INTO promo_usage (user_id, promo_code, order_id) VALUES (?,?,?)', [req.user.id, code.toUpperCase(), orderId || '']);
    await db.query('UPDATE promo_codes SET used_count = used_count + 1 WHERE code = ?', [code.toUpperCase()]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: 'Could not record promo usage.' });
  }
});
// ════════════════════════════════════════════════════════════════
//  SEND CONFIRMATION — COD/Pickup orders
//  POST /api/orders/send-confirmation
// ════════════════════════════════════════════════════════════════
app.post('/api/orders/send-confirmation', authMiddleware, async (req, res) => {
  try {
    const { orderId, items, total, delivery_address, slot, payment, pickupDateDisplay, promoCode } = req.body;

    const [rows] = await db.query('SELECT name, email, phone FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) return res.json({ success: false, error: 'User not found.' });

    const { name, email, phone } = rows[0];

    const itemsHtml = (items || []).map(item =>
      `<tr>
        <td style="padding:8px 0;color:#F5F0E8;font-size:13px;">${item.name}</td>
        <td style="padding:8px 0;color:#F5F0E8;font-size:13px;text-align:center;">×${item.qty}</td>
        <td style="padding:8px 0;color:#d40d0d;font-size:13px;text-align:right;">₹${item.price * item.qty}</td>
      </tr>`
    ).join('');

    const customerMail = {
      from: `"O Foods" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Order Confirmed — ${orderId} | O Foods`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0D0D0D;color:#F5F0E8;padding:32px;border-radius:12px;">
          <h2 style="color:#d40d0d;margin-bottom:4px;">O Foods</h2>
          <p style="color:#7A7068;font-size:13px;margin-bottom:24px;">Pickles · Spices · Snacks</p>
          <p style="font-size:16px;font-weight:700;">Hi ${name}, your order is confirmed! 🎉</p>
          <div style="background:#1C1C1C;border-radius:8px;padding:16px;margin:16px 0;">
            <p style="font-size:12px;color:#7A7068;margin-bottom:4px;">ORDER ID</p>
            <p style="font-size:20px;font-weight:700;letter-spacing:2px;">${orderId}</p>
          </div>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">${itemsHtml}</table>
          <hr style="border:1px solid #333;margin:16px 0;">
          <p style="font-size:14px;">Total: <strong style="color:#d40d0d;">₹${total}</strong></p>
          <p style="font-size:13px;color:#aaa;">💵 Payment: Cash on Pickup</p>
          <p style="font-size:13px;color:#aaa;">🏪 Pickup at: ${delivery_address || 'Store'}</p>
          <p style="font-size:13px;color:#aaa;">📅 Ready by: ${pickupDateDisplay || 'Next working day by 4:00 PM'}</p>
          ${promoCode ? `<p style="font-size:13px;color:#6BCF7F;">🎉 Promo applied: ${promoCode}</p>` : ''}
          <hr style="border:1px solid #333;margin:24px 0;">
          <p style="font-size:11px;color:#555;">© ${new Date().getFullYear()} O Foods. All rights reserved.</p>
        </div>
      `,
    };

    const adminMail = {
      from: `"O Foods" <${process.env.GMAIL_USER}>`,
      to: 'ofoods26@gmail.com',
      subject: `NEW PICKUP ORDER — ${orderId} | O Foods`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0D0D0D;color:#F5F0E8;padding:32px;border-radius:12px;">
          <h2 style="color:#d40d0d;">NEW PICKUP ORDER</h2>
          <p><strong>Order ID:</strong> ${orderId}</p>
          <p><strong>Customer:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
          <p><strong>Payment:</strong> Cash on Pickup</p>
          <p><strong>Total:</strong> ₹${total}</p>
          <p><strong>Pickup Location:</strong> ${delivery_address || 'N/A'}</p>
          <p><strong>Ready by:</strong> ${pickupDateDisplay || 'Next working day by 4:00 PM'}</p>
          <hr style="border:1px solid #333;margin:16px 0;">
          <table style="width:100%;border-collapse:collapse;">${itemsHtml}</table>
          <p style="color:#aaa;font-size:12px;margin-top:16px;">Please prepare this order for pickup.</p>
        </div>
      `,
    };

    await mailer.sendMail(customerMail);
    await mailer.sendMail(adminMail);

    res.json({ success: true });
  } catch (e) {
    console.error('COD confirmation email error:', e);
    res.json({ success: false, error: 'Email sending failed.' });
  }
});
// ════════════════════════════════════════════════════════════════
//  RAZORPAY — Expose public key_id to frontend (safe, not secret)
//  GET /api/razorpay/key
// ════════════════════════════════════════════════════════════════
app.get('/api/razorpay/key', authMiddleware, (req, res) => {
  res.json({ key_id: process.env.RAZORPAY_KEY_ID });
});

// ════════════════════════════════════════════════════════════════
//  RAZORPAY — Create Order
//  POST /api/razorpay/create-order
//  Body: { amount }   (amount in ₹, e.g. 250)
// ════════════════════════════════════════════════════════════════
app.post('/api/razorpay/create-order', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.json({ success: false, error: 'Invalid amount.' });

    const options = {
      amount: Math.round(amount * 100), // Razorpay expects paise (₹1 = 100 paise)
      currency: 'INR',
      receipt: 'of_rcpt_' + Date.now(),
    };

    const order = await razorpay.orders.create(options);
    res.json({ success: true, order, key_id: process.env.RAZORPAY_KEY_ID });
  } catch (e) {
    console.error('Razorpay create-order error:', e);
    res.json({ success: false, error: 'Could not create payment order.' });
  }
});

// ════════════════════════════════════════════════════════════════
//  RAZORPAY — Verify Payment Signature
//  POST /api/razorpay/verify
//  Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature,
//          items, total, delivery_address, slot, promoCode }
// ════════════════════════════════════════════════════════════════
app.post('/api/razorpay/verify', authMiddleware, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      items,
      total,
      delivery_address,
      slot,
      promoCode,
      deliveryMethod,
    } = req.body;

    // ── 1. Verify signature (HMAC-SHA256) ─────────────────────────
    const body       = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      return res.json({ success: false, error: 'Payment verification failed. Signature mismatch.' });
    }

    // ── 2. Save confirmed order to DB ──────────────────────────────
    const orderId = 'OF' + Date.now().toString().slice(-6);
    await db.query(
      `INSERT INTO orders
        (order_id, user_id, items_json, total, store, slot, payment, delivery_address,
         razorpay_order_id, razorpay_payment_id, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [
        orderId,
        req.user.id,
        JSON.stringify(items),
        total,
        delivery_address || '',
        slot || '4-5 business days',
        'razorpay',
        delivery_address || '',
        razorpay_order_id,
        razorpay_payment_id,
        'preparing',
      ]
    );

    // ── 3. Mark promo used if any ──────────────────────────────────
    if (promoCode) {
      try {
        await db.query(
          'INSERT INTO promo_usage (user_id, promo_code, order_id) VALUES (?,?,?)',
          [req.user.id, promoCode.toUpperCase(), orderId]
        );
        await db.query(
          'UPDATE promo_codes SET used_count = used_count + 1 WHERE code = ?',
          [promoCode.toUpperCase()]
        );
      } catch (pe) { console.warn('Promo mark-used error (non-fatal):', pe.message); }
    }
    // ── Inline product seed data (avoids file-bundling issues on serverless) ──
const PRODUCT_SEED = require('./products-seed.json');

let _productsTableReady = false;
async function ensureProductsTable() {
  if (_productsTableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT PRIMARY KEY,
      name VARCHAR(255),
      price DECIMAL(10,2) NOT NULL,
      mrp DECIMAL(10,2) DEFAULT NULL,
      sizes_json TEXT DEFAULT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  const [existing] = await db.query('SELECT COUNT(*) as cnt FROM products');
  if (existing[0].cnt === 0) {
    for (const p of PRODUCT_SEED) {
      await db.query(
        'INSERT INTO products (id, name, price, mrp, sizes_json) VALUES (?,?,?,?,?)',
        [p.id, p.name, p.price, p.mrp || null, JSON.stringify(p.sizes || [])]
      );
    }
    console.log(`✅  Seeded ${PRODUCT_SEED.length} products`);
  }
  _productsTableReady = true;
}
    // ── 4. Send confirmation email + SMS ──────────────────────────
    try {
      const [userRows] = await db.query(
        'SELECT name, email, phone FROM users WHERE id = ?',
        [req.user.id]
      );
      if (userRows.length) {
        const { name, email, phone } = userRows[0];
        const itemsHtml = (items || []).map(item =>
          `<tr>
             <td style="padding:8px 0;color:#F5F0E8;font-size:13px;">${item.name}</td>
             <td style="padding:8px 0;color:#F5F0E8;font-size:13px;text-align:center;">×${item.qty}</td>
             <td style="padding:8px 0;color:#d40d0d;font-size:13px;text-align:right;">₹${item.price * item.qty}</td>
           </tr>`
        ).join('');

        await mailer.sendMail({
          from: `"O Foods" <${process.env.GMAIL_USER}>`,
          to: email,
          subject: `Payment Confirmed — ${orderId} | O Foods`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0D0D0D;color:#F5F0E8;padding:32px;border-radius:12px;">
              <h2 style="color:#d40d0d;margin-bottom:4px;">O Foods</h2>
              <p style="color:#7A7068;font-size:13px;margin-bottom:24px;">Pickles · Spices · Snacks</p>
              <p style="font-size:16px;font-weight:700;">Hi ${name}, your payment is confirmed! 🎉</p>
              <div style="background:#1C1C1C;border-radius:8px;padding:16px;margin:16px 0;">
                <p style="font-size:12px;color:#7A7068;margin-bottom:4px;">ORDER ID</p>
                <p style="font-size:20px;font-weight:700;letter-spacing:2px;">${orderId}</p>
                <p style="font-size:12px;color:#7A7068;margin-top:8px;">RAZORPAY PAYMENT ID</p>
                <p style="font-size:13px;color:#aaa;">${razorpay_payment_id}</p>
              </div>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">${itemsHtml}</table>
              <hr style="border:1px solid #333;margin:16px 0;">
              <p style="font-size:14px;">Total Paid: <strong style="color:#d40d0d;">₹${total}</strong></p>
              <p style="font-size:13px;color:#aaa;">💳 Payment via Razorpay (Online)</p>
              <p style="font-size:13px;color:#aaa;">📦 Delivery to: ${delivery_address || 'Address on file'}</p>
              <p style="font-size:13px;color:#aaa;">📅 Delivery slot: ${slot || '4–5 business days'}</p>
              <hr style="border:1px solid #333;margin:24px 0;">
              <p style="font-size:11px;color:#555;">© ${new Date().getFullYear()} O Foods. All rights reserved.</p>
            </div>
          `,
        });
        // Send copy to admin
await mailer.sendMail({
  from: `"O Foods" <${process.env.GMAIL_USER}>`,
  to: 'ofoods26@gmail.com',
  subject: `NEW ORDER — ${orderId} | O Foods`,
  html: `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0D0D0D;color:#F5F0E8;padding:32px;border-radius:12px;">
      <h2 style="color:#d40d0d;">NEW ORDER RECEIVED</h2>
      <p><strong>Order ID:</strong> ${orderId}</p>
      <p><strong>Customer:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
      <p><strong>Payment ID:</strong> ${razorpay_payment_id}</p>
      <p><strong>Total:</strong> ₹${total}</p>
      <p><strong>Delivery Address:</strong> ${delivery_address || 'N/A'}</p>
      <hr style="border:1px solid #333;margin:16px 0;">
      <table style="width:100%;border-collapse:collapse;">${itemsHtml}</table>
      <p style="color:#aaa;font-size:12px;">Please pack and dispatch this order.</p>
    </div>
  `,
});
        // Admin notification


       
      }
    } catch (notifyErr) {
      console.warn('Razorpay notification failed (non-fatal):', notifyErr.message);
    }

    res.json({ success: true, orderId, paymentId: razorpay_payment_id });
  } catch (e) {
    console.error('Razorpay verify error:', e);
    res.json({ success: false, error: 'Server error during payment verification.' });
  }
});
// ════════════════════════════════════════════════════════════════
//  CHANGE PASSWORD (logged-in user) — Step 1: Send OTP
//  POST /api/change-password/send-otp
// ════════════════════════════════════════════════════════════════
app.post('/api/change-password/send-otp', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT email, name FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) return res.json({ success: false, error: 'User not found.' });

    const { email, name } = rows[0];
    const otp = generateOTP();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP keyed by user id
    otpStore.set('changepw_' + req.user.id, { otp, expires });

    try {   await sendEmailOTP(email, otp, name);   console.log('✅ OTP email sent to:', email); } catch (emailErr) {   console.error('❌ Email sending failed:', emailErr.message); }

    res.json({ success: true, maskedEmail: maskEmail(email) });
  } catch (e) {
    console.error('Change password send-otp error:', e);
    res.json({ success: false, error: 'Server error. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════
//  CHANGE PASSWORD (logged-in user) — Step 2: Verify OTP & Update
//  POST /api/change-password/verify-otp
//  Body: { otp, newPassword }
// ════════════════════════════════════════════════════════════════
app.post('/api/change-password/verify-otp', authMiddleware, async (req, res) => {
  try {
    const { otp, newPassword } = req.body;

    if (!otp || !newPassword)
      return res.json({ success: false, error: 'OTP and new password are required.' });

    if (newPassword.length < 6)
      return res.json({ success: false, error: 'Password must be at least 6 characters.' });

    const record = otpStore.get('changepw_' + req.user.id);
    if (!record)
      return res.json({ success: false, error: 'OTP expired or not found. Please request a new one.' });

    if (Date.now() > record.expires) {
      otpStore.delete('changepw_' + req.user.id);
      return res.json({ success: false, error: 'OTP expired. Please request a new one.' });
    }

    if (record.otp !== otp)
      return res.json({ success: false, error: 'Invalid OTP. Please try again.' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);

    otpStore.delete('changepw_' + req.user.id);

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (e) {
    console.error('Change password verify-otp error:', e);
    res.json({ success: false, error: 'Server error. Please try again.' });
  }
});
// ── ADMIN TOKEN — No OTP, credential check via env vars ──────
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      return res.json({ success: false, error: 'Admin not configured.' });
    }

    if (email !== adminEmail || password !== adminPassword) {
      return res.json({ success: false, error: 'Invalid credentials.' });
    }

    // Issue a JWT with admin flag
    const token = jwt.sign(
      { id: 0, email, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ success: true, token });
  } catch (e) {
    console.error('Admin login error:', e);
    res.json({ success: false, error: 'Server error.' });
  }
});
// ════════════════════════════════════════════════════════════════
//  ADMIN — Ship Order
// ════════════════════════════════════════════════════════════════
app.post('/api/admin/orders/ship', authMiddleware, async (req, res) => {
  try {
    const { orderId, trackingId } = req.body;

    if (!orderId || !trackingId) {
      return res.json({ success: false, error: 'Order ID and Tracking ID are required.' });
    }

    const [orderRows] = await db.query(
      'SELECT order_id, user_id, status, tracking_id FROM orders WHERE order_id = ?',
      [orderId.trim()]
    );

    if (!orderRows.length) {
      return res.json({ success: false, error: 'No Order ID Found.' });
    }

    const order = orderRows[0];

    await db.query(
      'UPDATE orders SET tracking_id = ?, status = ? WHERE order_id = ?',
      [trackingId.trim(), 'dispatched', order.order_id]
    );

    const [userRows] = await db.query(
      'SELECT id, name, email, phone, address FROM users WHERE id = ?',
      [order.user_id]
    );

    if (!userRows.length) {
      return res.json({
        success: true,
        order: { orderId: order.order_id },
        customer: { name: 'Unknown', email: '', phone: '', address: '' },
        emailSent: false,
        emailError: 'Customer record not found.'
      });
    }

    const user = userRows[0];

    let shippingAddress = '';
    try {
      const [orderAddrRows] = await db.query(
        'SELECT delivery_address FROM orders WHERE order_id = ?',
        [order.order_id]
      );
      if (orderAddrRows.length && orderAddrRows[0].delivery_address) {
        shippingAddress = orderAddrRows[0].delivery_address;
      }
    } catch (e) { /* ignore */ }

    if (!shippingAddress) {
      try {
        const [addrRows] = await db.query(
          'SELECT house, street, city, state, pincode, landmark FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC LIMIT 1',
          [user.id]
        );
        if (addrRows.length) {
          const a = addrRows[0];
          shippingAddress = [a.house, a.street, a.landmark, a.city, a.state, a.pincode]
            .filter(Boolean).join(', ');
        }
      } catch (e) { /* ignore */ }
    }

    if (!shippingAddress && user.address) {
      try {
        const parsed = JSON.parse(user.address);
        shippingAddress = [parsed.house, parsed.street, parsed.landmark, parsed.city, parsed.state, parsed.pincode]
          .filter(Boolean).join(', ');
      } catch (e) {
        shippingAddress = user.address;
      }
    }

    const customer = {
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      address: shippingAddress || 'N/A'
    };

    let emailSent = false;
    let emailError = null;

    try {
      await mailer.sendMail({
        from: `"O Foods" <${process.env.GMAIL_USER}>`,
        to: customer.email,
        subject: 'Your Order Has Been Shipped',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0D0D0D;color:#F5F0E8;padding:32px;border-radius:12px;">
            <h2 style="color:#d40d0d;margin-bottom:4px;">O Foods</h2>
            <p style="color:#7A7068;font-size:13px;margin-bottom:24px;">Pickles · Spices · Snacks</p>
            <p style="font-size:16px;font-weight:700;">Dear ${customer.name},</p>
            <p style="font-size:14px;color:#ddd;line-height:1.7;margin:12px 0;">Greetings!</p>
            <p style="font-size:14px;color:#ddd;line-height:1.7;margin-bottom:20px;">
              We are happy to inform you that your shipment process has started and your package
              has been successfully dispatched.
            </p>
            <p style="font-size:14px;color:#ddd;line-height:1.7;margin-bottom:8px;">
              You can find your tracking and delivery details below:
            </p>
            <div style="background:#1C1C1C;border-radius:8px;padding:16px;margin:16px 0;">
              <p style="font-size:13px;color:#7A7068;margin-bottom:6px;">📦 SHIPMENT INFORMATION</p>
              <p style="font-size:14px;margin-bottom:4px;">Tracking ID: <strong style="color:#d40d0d;">${trackingId.trim()}</strong></p>
              <p style="font-size:14px;">Courier Partner: <strong>DTDC</strong></p>
            </div>
            <div style="background:#1C1C1C;border-radius:8px;padding:16px;margin:16px 0;">
              <p style="font-size:13px;color:#7A7068;margin-bottom:6px;">👤 CUSTOMER DETAILS</p>
              <p style="font-size:14px;margin-bottom:4px;">Name: <strong>${customer.name}</strong></p>
              <p style="font-size:14px;margin-bottom:4px;">Email: <strong>${customer.email}</strong></p>
              <p style="font-size:14px;margin-bottom:4px;">Contact Number: <strong>${customer.phone || 'N/A'}</strong></p>
              <p style="font-size:14px;">Shipping Address: <strong>${customer.address}</strong></p>
            </div>
            <p style="font-size:13px;color:#aaa;line-height:1.7;margin:16px 0;">
              You can use the Tracking ID provided above to monitor the journey of your package
              on the DTDC online tracking portal.
            </p>
            <p style="font-size:13px;color:#aaa;line-height:1.7;margin-bottom:24px;">
              If you need any assistance or have any questions, feel free to contact us.
            </p>
            <p style="font-size:14px;">Best Regards,<br>Ofoods Team</p>
            <hr style="border:1px solid #333;margin:24px 0;">
            <p style="font-size:11px;color:#555;">© ${new Date().getFullYear()} O Foods. All rights reserved.</p>
          </div>
        `,
      });
      emailSent = true;
      console.log(`✅ Shipment email sent to ${customer.email} for order ${order.order_id}`);
    } catch (mailErr) {
      emailError = mailErr.message;
      console.error(`❌ Shipment email failed for order ${order.order_id}:`, mailErr.message);
    }

    res.json({
      success: true,
      order: { orderId: order.order_id },
      customer,
      emailSent,
      emailError
    });

  } catch (e) {
    console.error('Admin ship order error:', e);
    res.json({ success: false, error: 'Server error. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════
//  START
// ════════════════════════════════════════════════════════════════

// ✅ Replace with this
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ O Foods server running on port ${PORT}`);
});

module.exports = app;
