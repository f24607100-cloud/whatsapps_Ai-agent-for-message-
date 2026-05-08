/**
 * src/followUpScheduler.js
 *
 * Runs a daily cron job that:
 * 1. Reads customers.xlsx for rows with FollowUpDate <= today and FollowUpDone = false
 * 2. Sends a personalized follow-up WhatsApp message to each customer
 * 3. Marks the row as FollowUpDone = true
 *
 * Schedule: runs every day at 10:00 AM (Pakistan Standard Time = UTC+5)
 * Cron expression: '0 5 * * *' (05:00 UTC = 10:00 PKT)
 */

require('dotenv').config();
const cron = require('node-cron');
const { getCustomersDueForFollowUp, markFollowUpDone } = require('./dealLogger');
const { sendText } = require('./whatsappSender');
const businessConfig = require('../config/businessConfig');

/**
 * Pick a random follow-up message template and fill in placeholders.
 */
function buildFollowUpMessage(customer) {
  const templates = businessConfig.followUpMessages;
  const template  = templates[Math.floor(Math.random() * templates.length)];
  return template
    .replace('{name}',    customer.Name    || 'bhai')
    .replace('{website}', businessConfig.website || '');
}

/**
 * Process all customers due for follow-up today.
 */
async function runFollowUps() {
  console.log('[followUp] Checking for customers due for follow-up...');

  const customers = getCustomersDueForFollowUp();
  console.log(`[followUp] Found ${customers.length} customer(s) to follow up.`);

  for (const customer of customers) {
    const phone = customer.Phone;
    if (!phone) continue;

    const message = buildFollowUpMessage(customer);

    try {
      await sendText(phone, message);
      console.log(`[followUp] Sent follow-up to ${phone}: ${message}`);
      markFollowUpDone(phone);

      // Small delay to avoid rate limiting
      await _sleep(1500);
    } catch (err) {
      console.error(`[followUp] Failed to send to ${phone}:`, err.message);
    }
  }

  console.log('[followUp] Done processing follow-ups.');
}

/**
 * Start the scheduler.
 * Cron: every day at 05:00 UTC (10:00 AM Pakistan time).
 */
function startScheduler() {
  console.log('[followUp] Scheduler started — will run daily at 10:00 AM PKT.');

  // Run daily at 10:00 PKT (05:00 UTC)
  cron.schedule('0 5 * * *', async () => {
    console.log('[followUp] Cron triggered at', new Date().toISOString());
    await runFollowUps();
  }, {
    timezone: 'UTC',
  });

  // Also run immediately on startup so you can test without waiting
  if (process.env.NODE_ENV === 'development') {
    console.log('[followUp] DEV MODE — running follow-up check on startup...');
    runFollowUps().catch(console.error);
  }
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { startScheduler, runFollowUps };
