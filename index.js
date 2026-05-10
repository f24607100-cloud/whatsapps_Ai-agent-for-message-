/**
 * index.js — WhatsApp AI Agent Entry Point
 *
 * GentsStyling WhatsApp AI Agent
 * ───────────────────────────────
 * Starts an Express server that:
 * - Handles Meta WhatsApp Cloud API webhooks (GET + POST /webhook)
 * - Serves the /media folder as static files (product images)
 * - Starts the daily follow-up cron scheduler
 * - Provides a simple health check at GET /
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const webhookRouter      = require('./src/webhook');
const { startScheduler } = require('./src/followUpScheduler');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve product images from /media folder
// Access via: http://localhost:3001/media/brown_blazer.jpg
app.use('/media', express.static(path.join(__dirname, 'media')));

// Serve GentsStyling product images (from the website folder)
// Access via: https://your-ngrok.app/products/brown_blazer.jpg
app.use('/products', express.static(path.join(__dirname, 'GentsStyling')));

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/webhook', webhookRouter);

// Health check
app.get('/', (req, res) => {
  res.json({
    status:  'online',
    service: 'GentsStyling WhatsApp AI Agent',
    time:    new Date().toISOString(),
  });
});

// Manual follow-up trigger (for testing)
app.post('/trigger-followups', async (req, res) => {
  try {
    const { runFollowUps } = require('./src/followUpScheduler');
    await runFollowUps();
    res.json({ success: true, message: 'Follow-ups processed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   GentsStyling WhatsApp AI Agent                 ║');
  console.log(`║   Running on http://localhost:${PORT}               ║`);
  console.log('║   Webhook: POST /webhook                         ║');
  console.log('║   Health:  GET  /                                ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // Start daily follow-up scheduler
  startScheduler();
});
