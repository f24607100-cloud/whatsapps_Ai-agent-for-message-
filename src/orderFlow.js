/**
 * src/orderFlow.js
 *
 * Order Confirmation + Feedback Flow (Phase 1)
 *
 * STATE MACHINE per customer:
 *   idle → awaiting_availability → awaiting_confirmation → confirmed
 *        → awaiting_feedback → completed
 *
 * All state is kept in-memory (survives restarts via Excel reload).
 */

require('dotenv').config();
const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');
const { sendText } = require('./whatsappSender');

const DATA_FILE = path.join(__dirname, '../data/customers.xlsx');

// ── In-memory state map: phone → state object ─────────────────────────────────
const customerState = {}; // { phone: { state, orderData, timer } }

// ── State Names ────────────────────────────────────────────────────────────────
const STATE = {
  IDLE:                   'idle',
  AWAITING_AVAILABILITY:  'awaiting_availability',
  AWAITING_CONFIRMATION:  'awaiting_confirmation',
  CONFIRMED:              'confirmed',
  SHIPPED:                'shipped',
  AWAITING_FEEDBACK:      'awaiting_feedback',
  COMPLETED:              'completed',
};

// ── Delay after deal close before sending "busy ya free?" ─────────────────────
const AVAILABILITY_DELAY = process.env.NODE_ENV === 'development'
  ? 30 * 1000        // DEV: 30 seconds
  : 10 * 60 * 1000;  // PROD: 10 minutes

// ── Start Order Flow ──────────────────────────────────────────────────────────
/**
 * Called right after a deal is logged.
 * Schedules the "Busy ya free?" availability check.
 */
function startOrderFlow(phone, orderData) {
  console.log(`[orderFlow] Starting flow for ${phone} — order: ${orderData.product}`);

  customerState[phone] = {
    state: STATE.AWAITING_AVAILABILITY,
    orderData,
  };

  const delay = AVAILABILITY_DELAY;
  console.log(`[orderFlow] Will send availability check in ${delay / 1000}s`);

  setTimeout(async () => {
    try {
      const msg =
        `Salaam ${orderData.name?.split(' ')[0] || 'bhai'}! 😊\n\n` +
        `Aapki order ki baat karni thi — kya aap abhi free hain?\n\n` +
        `Haan likhein ✅ ya Baad mein likhein ⏰`;

      await sendText(phone, msg);
      console.log(`[orderFlow] ✅ Availability check sent to ${phone}`);
    } catch (err) {
      console.error('[orderFlow] Failed to send availability check:', err.message);
    }
  }, delay);
}

// ── Handle Customer Reply ─────────────────────────────────────────────────────
/**
 * Called from webhook.js when a message arrives.
 * Returns true if this message was handled by orderFlow (stop normal AI processing).
 * Returns false if orderFlow has no state for this customer.
 */
async function handleOrderFlowReply(phone, text) {
  const session = customerState[phone];
  if (!session) return false; // Not in any order flow

  const lowerText = text.toLowerCase().trim();

  // ── State: AWAITING_AVAILABILITY ──────────────────────────────────────────
  if (session.state === STATE.AWAITING_AVAILABILITY) {
    if (_isYes(lowerText)) {
      // Customer is free — send order confirmation request
      session.state = STATE.AWAITING_CONFIRMATION;
      const { orderData } = session;

      const msg =
        `Shukriya! 🙏\n\n` +
        `Aapne yeh order place kiya tha:\n` +
        `📦 *Product:* ${orderData.product || 'N/A'}\n` +
        `💰 *Amount:* Rs. ${orderData.amount || 'TBD'}\n` +
        `📍 *Address:* ${orderData.address || 'Pending'}\n\n` +
        `Kya aap yeh order *confirm* karna chahte hain?\n\n` +
        `Confirm likhein ✅ ya Cancel likhein ❌`;

      await sendText(phone, msg);
      console.log(`[orderFlow] Order details sent to ${phone}, awaiting confirmation`);

    } else if (_isBusy(lowerText)) {
      // Customer is busy — reschedule for 1 hour later
      session.state = STATE.IDLE;
      await sendText(phone,
        `Koi baat nahi! 😊 Jab free hon to humse zaroor rabta karein. Shukriya!`
      );
      console.log(`[orderFlow] ${phone} is busy — flow paused`);

    } else {
      // Unclear reply — ask again
      await sendText(phone,
        `Maafi chahta hoon! Kya aap abhi free hain?\n\nSirf *Haan* ya *Baad mein* likhein 😊`
      );
    }
    return true;
  }

  // ── State: AWAITING_CONFIRMATION ─────────────────────────────────────────
  if (session.state === STATE.AWAITING_CONFIRMATION) {
    if (_isYes(lowerText) || lowerText.includes('confirm')) {
      // Order confirmed!
      session.state = STATE.CONFIRMED;
      updateExcelStatus(phone, 'Confirmed');

      await sendText(phone,
        `🎉 Zabardast! Aapka order *confirm* ho gaya!\n\n` +
        `Hum jald hi aapka parcel dispatch kar denge.\n` +
        `Tracking update aapko WhatsApp par milta rahega. Shukriya! 🙏`
      );
      console.log(`[orderFlow] ✅ Order CONFIRMED for ${phone}`);

    } else if (_isNo(lowerText) || lowerText.includes('cancel')) {
      // Order cancelled
      session.state = STATE.IDLE;
      updateExcelStatus(phone, 'Cancelled');

      await sendText(phone,
        `Theek hai, aapka order *cancel* kar diya gaya hai.\n` +
        `Agar dobara order karna ho to hum hamesha haazir hain! 😊`
      );
      console.log(`[orderFlow] ❌ Order CANCELLED for ${phone}`);
      delete customerState[phone];

    } else {
      await sendText(phone,
        `Sirf *Confirm* ya *Cancel* likhein please 😊`
      );
    }
    return true;
  }

  // ── State: AWAITING_FEEDBACK ─────────────────────────────────────────────
  if (session.state === STATE.AWAITING_FEEDBACK) {
    session.state = STATE.COMPLETED;
    updateExcelStatus(phone, 'Reviewed', text);

    const isPositive = _isPositive(lowerText);
    const replyMsg = isPositive
      ? `Bohot shukriya aapke pyare feedback ke liye! 🌟\nHumein khushi hai ke aapko pasand aaya.\nAgle order par *special discount* milega! 😊`
      : `Aapka feedback lene ka shukriya! 🙏\nHum apni service improve karte rahenge.\nAgle baar aapko zyada behtar service denge! 💪`;

    await sendText(phone, replyMsg);
    saveFeedback(phone, text, session.orderData);
    console.log(`[orderFlow] Feedback received from ${phone}: "${text}"`);
    delete customerState[phone];
    return true;
  }

  return false; // State exists but not in an interactive state
}

// ── Admin: Mark as Delivered ──────────────────────────────────────────────────
/**
 * Called by admin API endpoint.
 * Marks order as delivered and sends feedback request.
 */
async function markDelivered(phone) {
  updateExcelStatus(phone, 'Delivered');

  if (!customerState[phone]) {
    customerState[phone] = { state: STATE.AWAITING_FEEDBACK, orderData: {} };
  } else {
    customerState[phone].state = STATE.AWAITING_FEEDBACK;
  }

  const msg =
    `Salaam! 👋 Umeed hai aapka parcel safely mil gaya hoga.\n\n` +
    `Kya aap humein apna *feedback* de sakte hain?\n\n` +
    `Product kaisi lagi? Achi lagi ya kuch improvement chahiye?\n` +
    `Jo dil mein aaye likh dein — hum zaroor sunenge! 😊`;

  await sendText(phone, msg);
  console.log(`[orderFlow] Delivered & feedback request sent to ${phone}`);
  return { success: true, message: `Delivery marked & feedback sent to ${phone}` };
}

// ── Get current state of a customer ──────────────────────────────────────────
function getCustomerState(phone) {
  return customerState[phone] || null;
}

// ── Get all active orders ─────────────────────────────────────────────────────
function getAllOrders() {
  return Object.entries(customerState).map(([phone, session]) => ({
    phone,
    state: session.state,
    product: session.orderData?.product,
    name: session.orderData?.name,
  }));
}

// ── Excel Helpers ─────────────────────────────────────────────────────────────
function updateExcelStatus(phone, status, feedback = '') {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const wb = XLSX.readFile(DATA_FILE);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);

    const idx = rows.findIndex(r => String(r.Phone) === String(phone));
    if (idx !== -1) {
      rows[idx].Status = status;
      if (feedback) rows[idx].Feedback = feedback;
      const newWs = XLSX.utils.json_to_sheet(rows);
      wb.Sheets[wb.SheetNames[0]] = newWs;
      XLSX.writeFile(wb, DATA_FILE);
      console.log(`[orderFlow] Excel updated: ${phone} → ${status}`);
    }
  } catch (err) {
    console.error('[orderFlow] Excel update error:', err.message);
  }
}

function saveFeedback(phone, feedback, orderData) {
  try {
    const feedbackFile = path.join(__dirname, '../data/feedback.xlsx');
    let wb, rows = [];
    if (fs.existsSync(feedbackFile)) {
      wb = XLSX.readFile(feedbackFile);
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    } else {
      wb = XLSX.utils.book_new();
    }
    rows.push({
      Timestamp: new Date().toISOString(),
      Phone: phone,
      Name: orderData?.name || '',
      Product: orderData?.product || '',
      Feedback: feedback,
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, ws, 'Feedback');
    else wb.Sheets[wb.SheetNames[0]] = ws;
    XLSX.writeFile(wb, feedbackFile);
  } catch (err) {
    console.error('[orderFlow] Feedback save error:', err.message);
  }
}

// ── Text Intent Helpers ───────────────────────────────────────────────────────
function _isYes(t) {
  return /\b(haan|ha|yes|ji|free|theek|okay|ok|bilkul|zaroor)\b/.test(t);
}
function _isBusy(t) {
  return /\b(busy|baad|later|nahi|na|no|abhi nahi)\b/.test(t);
}
function _isNo(t) {
  return /\b(nahi|na|no|cancel|nhi|mat)\b/.test(t);
}
function _isPositive(t) {
  return /\b(acha|acchi|achi|achi|badhiya|zabardast|mast|perfect|good|great|loved|pasand|best|awesome)\b/.test(t);
}

module.exports = { startOrderFlow, handleOrderFlowReply, markDelivered, getCustomerState, getAllOrders, STATE };
