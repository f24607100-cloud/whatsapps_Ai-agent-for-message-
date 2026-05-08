/**
 * src/dealLogger.js
 *
 * Logs closed deals to:
 * 1. data/customers.xlsx  (Excel file — primary business record)
 * 2. Supabase `deals` table (if configured — optional cloud backup)
 *
 * A "deal" is created when the AI detects purchase confirmation keywords.
 */

require('dotenv').config();
const path = require('path');
const fs   = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

// ── Supabase (optional) ───────────────────────────────────────────────────────
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ── Excel file paths ──────────────────────────────────────────────────────────
const DATA_DIR       = path.join(__dirname, '..', 'data');
const CUSTOMERS_PATH = path.join(DATA_DIR, 'customers.xlsx');

// Ensure /data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * Log a closed deal.
 * @param {Object} dealData
 * @param {string} dealData.phone         - Customer WhatsApp number
 * @param {string} [dealData.name]        - Customer name (if collected)
 * @param {string} [dealData.address]     - Delivery address (if collected)
 * @param {string} dealData.product       - Product(s) ordered
 * @param {number} dealData.amount        - Total deal amount
 * @param {string} [dealData.notes]       - Additional notes from conversation
 */
async function logDeal(dealData) {
  const timestamp = new Date().toISOString();
  const row = {
    Timestamp:   timestamp,
    Phone:       dealData.phone || '',
    Name:        dealData.name || 'Unknown',
    Address:     dealData.address || 'Pending',
    Product:     dealData.product || '',
    Amount:      dealData.amount || 0,
    Status:      'New',
    Notes:       dealData.notes || '',
    FollowUpDate: _getFollowUpDate(),
    FollowUpDone: false,
  };

  // 1. Write to Excel
  _writeToExcel(CUSTOMERS_PATH, row);
  console.log('[dealLogger] Deal logged to Excel:', row);

  // 2. Optional: write to Supabase
  if (supabase) {
    try {
      const { error } = await supabase.from('deals').insert([{
        phone:          row.Phone,
        name:           row.Name,
        address:        row.Address,
        product:        row.Product,
        amount:         row.Amount,
        status:         row.Status,
        notes:          row.Notes,
        follow_up_date: row.FollowUpDate,
        created_at:     timestamp,
      }]);
      if (error) console.error('[dealLogger] Supabase insert error:', error);
      else console.log('[dealLogger] Deal also saved to Supabase');
    } catch (err) {
      console.error('[dealLogger] Supabase error:', err.message);
    }
  }

  return row;
}

/**
 * Get all customers whose follow-up date is today or in the past
 * and who haven't been followed up yet.
 * @returns {Array} List of customer rows due for follow-up
 */
function getCustomersDueForFollowUp() {
  if (!fs.existsSync(CUSTOMERS_PATH)) return [];

  const wb = XLSX.readFile(CUSTOMERS_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return rows.filter(row => {
    if (!row.Phone || row.FollowUpDone === true || row.FollowUpDone === 'TRUE') return false;
    const followUp = new Date(row.FollowUpDate);
    followUp.setHours(0, 0, 0, 0);
    return followUp <= today;
  });
}

/**
 * Mark a customer's follow-up as done in the Excel file.
 * @param {string} phone - Customer phone number
 */
function markFollowUpDone(phone) {
  if (!fs.existsSync(CUSTOMERS_PATH)) return;

  const wb   = XLSX.readFile(CUSTOMERS_PATH);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);

  const updated = rows.map(row =>
    row.Phone === phone ? { ...row, FollowUpDone: true } : row
  );

  const newWs = XLSX.utils.json_to_sheet(updated);
  wb.Sheets[wb.SheetNames[0]] = newWs;
  XLSX.writeFile(wb, CUSTOMERS_PATH);
  console.log(`[dealLogger] Marked follow-up done for ${phone}`);
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

function _writeToExcel(filePath, row) {
  let wb;
  let rows = [];

  if (fs.existsSync(filePath)) {
    wb   = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws);
  } else {
    wb = XLSX.utils.book_new();
  }

  rows.push(row);
  const ws = XLSX.utils.json_to_sheet(rows);

  // Set column widths for readability
  ws['!cols'] = [
    { wch: 22 }, // Timestamp
    { wch: 18 }, // Phone
    { wch: 20 }, // Name
    { wch: 30 }, // Address
    { wch: 30 }, // Product
    { wch: 10 }, // Amount
    { wch: 10 }, // Status
    { wch: 30 }, // Notes
    { wch: 15 }, // FollowUpDate
    { wch: 12 }, // FollowUpDone
  ];

  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');
  } else {
    wb.Sheets[wb.SheetNames[0]] = ws;
  }

  XLSX.writeFile(wb, filePath);
}

function _getFollowUpDate() {
  const days = 10 + Math.floor(Math.random() * 6); // 10–15 days
  const date  = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

module.exports = { logDeal, getCustomersDueForFollowUp, markFollowUpDone };
