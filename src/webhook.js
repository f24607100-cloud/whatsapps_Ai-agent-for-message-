/**
 * src/webhook.js
 *
 * Express router that handles the Meta WhatsApp Cloud API webhook.
 *
 * GET  /webhook  — Verification handshake (Meta calls this once when you register your webhook)
 * POST /webhook  — Incoming messages, status updates, etc.
 *
 * Flow for each incoming message:
 * 1. Extract sender phone + message text
 * 2. Send "typing..." indicator (mark as read)
 * 3. Call agent.processMessage() to get AI reply + any image commands + deal info
 * 4. If dealClosed → log the deal to Excel/Supabase
 * 5. Send images (if any) then send text reply
 */

require('dotenv').config();
const express = require('express');
const router  = express.Router();

const agent         = require('./agent');
const { logDeal }   = require('./dealLogger');
const { sendText, sendImage, markAsRead } = require('./whatsappSender');
const { getProductImageUrl, findProduct } = require('./mediaHandler');
const { transcribeVoiceMessage } = require('./voiceHandler');

// ── GET /webhook — Verification ───────────────────────────────────────────────
router.get('/', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[webhook] ✅ Webhook verified successfully');
    return res.status(200).send(challenge);
  }
  console.warn('[webhook] ❌ Webhook verification failed');
  res.sendStatus(403);
});

// ── POST /webhook — Incoming Events ───────────────────────────────────────────
router.post('/', async (req, res) => {
  // Meta expects a 200 response IMMEDIATELY — we'll process async
  res.sendStatus(200);

  try {
    const body = req.body;

    // Validate this is a WhatsApp message event
    if (body.object !== 'whatsapp_business_account') return;

    const entry   = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    if (!value) return;

    // ── Handle incoming messages ───────────────────────────────────────────
    const messages = value.messages;
    if (!messages?.length) return;

    for (const msg of messages) {
      await handleIncomingMessage(msg, value);
    }

  } catch (err) {
    console.error('[webhook] Error processing event:', err);
  }
});

// ── Message Handler ───────────────────────────────────────────────────────────
async function handleIncomingMessage(msg, value) {
  const phone     = msg.from;   // e.g. "923001234567"
  const messageId = msg.id;
  const timestamp = msg.timestamp;

  // Extract text content
  let userText = '';
  let isVoice  = false;

  if (msg.type === 'text') {
    userText = msg.text?.body || '';

  } else if (msg.type === 'audio') {
    // 🎤 Voice message — transcribe with Whisper
    isVoice = true;
    const mediaId  = msg.audio?.id;
    const mimeType = msg.audio?.mime_type || 'audio/ogg';
    console.log(`[webhook] 🎤 Voice message from ${phone} — transcribing...`);
    userText = await transcribeVoiceMessage(mediaId, mimeType);
    console.log(`[webhook] 📝 Transcribed: "${userText}"`);

  } else if (msg.type === 'image') {
    userText = '[Customer ne ek image bheji hai]';
  } else if (msg.type === 'document') {
    userText = '[Customer ne ek document bheja hai]';
  } else {
    userText = `[Customer ne ${msg.type} message bheja]`;
  }

  console.log(`[webhook] Incoming from ${phone}: "${userText}"`);

  // Mark as read
  await markAsRead(messageId).catch(() => {});

  // Get sender's display name if available
  const contacts = value.contacts;
  const contact  = contacts?.find(c => c.wa_id === phone);
  const name     = contact?.profile?.name || null;
  if (name) agent.updateCustomerInfo(phone, { name });

  // ── Process with AI ────────────────────────────────────────────────────────
  const { reply, imagesToSend, dealClosed, dealData } = await agent.processMessage(phone, userText);

  // ── Log deal + Schedule instant follow-up (DEV) ───────────────────────────
  if (dealClosed && dealData) {
    console.log('[webhook] 🎉 Deal closed for', phone, dealData);
    await logDeal(dealData).catch(err => console.error('[webhook] Deal log error:', err));

    // DEV MODE: Send follow-up after 1 minute (for testing/demo)
    // PRODUCTION: node-cron runs every day at 10am PKT (10-15 days delay)
    if (process.env.NODE_ENV === 'development') {
      const FOLLOW_UP_DELAY = 60 * 1000; // 1 minute
      console.log(`[webhook] ⏱️ DEV MODE — Follow-up scheduled in 1 minute for ${phone}`);

      setTimeout(async () => {
        try {
          const kb = await agent.getKnowledge();
          const customerName = dealData.name?.split(' ')[0] || 'bhai';

          // Pick a different product than what was ordered (new offer)
          const newProduct = kb.products.find(p =>
            !dealData.product?.toLowerCase().includes(p.name?.toLowerCase().split(' ')[0])
          ) || kb.products[0];

          const imageUrl = newProduct ? getProductImageUrl(newProduct) : null;
          const offerMsg =
            `Salaam ${customerName} bhai! 🎉 Aapki order ke liye shukriya!\n\n` +
            `Aaj hamare paas ek special offer bhi hai — yeh dekhein! ` +
            `Sirf limited time ke liye available hai. Interested hain?`;

          console.log(`[webhook] 📲 Sending follow-up to ${phone}...`);

          // Send new product image
          if (imageUrl) {
            await sendImage(phone, imageUrl, `${newProduct.name} — Special Offer $${newProduct.price}`);
            await _sleep(1000);
          }

          // Send offer text
          await sendText(phone, offerMsg);
          console.log(`[webhook] ✅ Follow-up sent to ${phone}`);

        } catch (err) {
          console.error('[webhook] Follow-up error:', err.message);
        }
      }, FOLLOW_UP_DELAY);
    }
  }

  // ── Send product images (before text reply) ─────────────────────────────
  const kb = await agent.getKnowledge();
  for (const { productName } of imagesToSend) {
    const product  = findProduct(productName, kb.products);
    const imageUrl = product ? getProductImageUrl(product) : null;

    if (imageUrl) {
      try {
        await sendImage(phone, imageUrl, `${product.name} — $${product.price}`);
        await _sleep(800); // small gap between messages
      } catch (err) {
        console.error(`[webhook] Failed to send image for "${productName}":`, err.message);
      }
    } else {
      console.warn(`[webhook] No image URL found for product: "${productName}"`);
    }
  }

  // ── Send text reply ────────────────────────────────────────────────────────
  if (reply) {
    await sendText(phone, reply);
  }
}


function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = router;
