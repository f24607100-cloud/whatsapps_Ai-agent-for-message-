/**
 * src/whatsappSender.js
 *
 * Wrapper around the Meta WhatsApp Cloud API.
 * Handles: text messages, image messages, template messages.
 */

require('dotenv').config();
const axios = require('axios');

const GRAPH_URL = 'https://graph.facebook.com/v19.0';
const PHONE_ID  = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN     = process.env.WHATSAPP_TOKEN;

/**
 * Send a plain text message to a WhatsApp number.
 * @param {string} to   - Recipient phone number in international format (e.g. "923001234567")
 * @param {string} text - Message body text
 */
async function sendText(to, text) {
  return _send(to, {
    type: 'text',
    text: { body: text, preview_url: false },
  });
}

/**
 * Send an image by URL with an optional caption.
 * @param {string} to      - Recipient phone number
 * @param {string} url     - Publicly accessible image URL
 * @param {string} caption - Optional caption shown below the image
 */
async function sendImage(to, url, caption = '') {
  return _send(to, {
    type: 'image',
    image: { link: url, caption },
  });
}

/**
 * Send an image using a pre-uploaded Media ID.
 * @param {string} to      - Recipient phone number
 * @param {string} mediaId - Media ID returned by the Media API
 * @param {string} caption - Optional caption
 */
async function sendImageById(to, mediaId, caption = '') {
  return _send(to, {
    type: 'image',
    image: { id: mediaId, caption },
  });
}

/**
 * Mark a message as read (sends a read receipt).
 * @param {string} messageId - wamid of the message to mark as read
 */
async function markAsRead(messageId) {
  try {
    await axios.post(
      `${GRAPH_URL}/${PHONE_ID}/messages`,
      { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      { headers: _headers() }
    );
  } catch (err) {
    console.error('[whatsappSender] markAsRead error:', err?.response?.data || err.message);
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _send(to, payload) {
  try {
    const response = await axios.post(
      `${GRAPH_URL}/${PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        ...payload,
      },
      { headers: _headers() }
    );
    console.log(`[whatsappSender] ✅ Sent to ${to}:`, response.data);
    return response.data;
  } catch (err) {
    const errData = err?.response?.data;
    // Log the FULL error details clearly
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('[whatsappSender] ❌ SEND FAILED to:', to);
    console.error('[whatsappSender] HTTP Status:', err?.response?.status);
    console.error('[whatsappSender] Meta Error:', JSON.stringify(errData, null, 2));
    console.error('[whatsappSender] Token used (first 20 chars):', process.env.WHATSAPP_TOKEN?.substring(0, 20));
    console.error('[whatsappSender] Phone ID:', process.env.WHATSAPP_PHONE_NUMBER_ID);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    throw err;
  }
}

function _headers() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  };
}

module.exports = { sendText, sendImage, sendImageById, markAsRead };
