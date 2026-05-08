/**
 * src/adminRouter.js
 *
 * Simple admin API endpoints (no auth — local use only).
 *
 * POST /admin/mark-delivered   { phone }  → mark order delivered + send feedback request
 * GET  /admin/orders            → list all active orders and their states
 * POST /admin/send-availability { phone } → manually trigger "busy ya free?" for a phone
 */

const express = require('express');
const router  = express.Router();
const XLSX    = require('xlsx');
const fs      = require('fs');
const path    = require('path');

const { markDelivered, getAllOrders, startOrderFlow } = require('./orderFlow');

const DATA_FILE = path.join(__dirname, '../data/customers.xlsx');

// ── GET /admin/orders — List all orders ──────────────────────────────────────
router.get('/orders', (req, res) => {
  const activeOrders = getAllOrders();

  // Also read Excel for full list
  let excelOrders = [];
  if (fs.existsSync(DATA_FILE)) {
    const wb = XLSX.readFile(DATA_FILE);
    const ws = wb.Sheets[wb.SheetNames[0]];
    excelOrders = XLSX.utils.sheet_to_json(ws);
  }

  res.json({
    active_flow: activeOrders,
    all_orders: excelOrders,
    total: excelOrders.length,
  });
});

// ── POST /admin/mark-delivered — Mark order as delivered ─────────────────────
router.post('/mark-delivered', async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'phone is required. Example: { "phone": "923001234567" }' });
  }

  try {
    const result = await markDelivered(phone);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /admin/send-availability — Manually trigger availability check ───────
router.post('/send-availability', async (req, res) => {
  const { phone, name, product, amount, address } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'phone is required' });
  }

  const orderData = { phone, name: name || 'Customer', product, amount, address };

  try {
    startOrderFlow(phone, orderData);
    res.json({ success: true, message: `Availability check scheduled for ${phone} in 30s (DEV) / 10min (PROD)` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
