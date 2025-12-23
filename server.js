// Simple Node/Express server for Small Burger Mania
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const bodyParser = require('body-parser');
const Database = require('better-sqlite3');

const app = express();
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(bodyParser.json());

// Config
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-me-admin-token';

// Database (file: database.sqlite)
const db = new Database(path.join(__dirname, 'database.sqlite'));
db.pragma('journal_mode = WAL');

// Initialize tables
db.prepare(`CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  items_json TEXT,
  total REAL,
  status TEXT DEFAULT 'received',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// Serve static site
app.use(express.static(path.join(__dirname, 'public')));

// API: menu (served from file)
app.get('/api/menu', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'menu.json'));
});

// API: place order
app.post('/api/orders', (req, res) => {
  try {
    const { customer_name, customer_phone, customer_address, items, total } = req.body;
    if (!customer_name || !customer_phone || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields or empty cart.' });
    }
    const stmt = db.prepare('INSERT INTO orders (customer_name, customer_phone, customer_address, items_json, total) VALUES (?, ?, ?, ?, ?)');
    const info = stmt.run(
      customer_name,
      customer_phone,
      customer_address || '',
      JSON.stringify(items),
      total || 0
    );
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ message: 'Order received', order_id: order.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: admin - list orders (protected by ADMIN_TOKEN query header or query param)
app.get('/api/orders', (req, res) => {
  const token = req.headers['x-admin-token'] || req.query.admin_token;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized. Provide valid admin token in x-admin-token header or admin_token query param.' });
  }
  const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  // parse items
  const parsed = rows.map(r => ({
    ...r,
    items: JSON.parse(r.items_json)
  }));
  res.json(parsed);
});

// API: mark order status (admin)
app.post('/api/orders/:id/status', (req, res) => {
  const token = req.headers['x-admin-token'] || req.query.admin_token;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  if (!id || !status) return res.status(400).json({ error: 'Missing id or status' });
  const stmt = db.prepare('UPDATE orders SET status = ? WHERE id = ?');
  stmt.run(status, id);
  res.json({ message: 'Updated' });
});

// Fallback to index
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Small Burger Mania server running on http://localhost:${PORT}`);
  console.log('Set ADMIN_TOKEN env var to secure admin API access.');
});