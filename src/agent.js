/**
 * src/agent.js
 *
 * Core AI brain for the GentsStyling WhatsApp Agent.
 *
 * Responsibilities:
 * - Maintains per-customer conversation history (in-memory, keyed by phone)
 * - Fetches live product/FAQ knowledge from Supabase (same DB as the website)
 * - Calls OpenAI GPT-4o to generate responses
 * - Detects "SEND_IMAGE:<product_name>" commands in AI output and strips them
 * - Detects deal closure and returns { reply, dealClosed, dealData, imagesToSend }
 */

require('dotenv').config();
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
const businessConfig = require('../config/businessConfig');

// ── OpenAI ────────────────────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Supabase (shared with GentsStyling website) ───────────────────────────────
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
}

// ── In-memory conversation store ─────────────────────────────────────────────
// { phone: { history: [], customerInfo: {}, dealPending: false } }
const sessions = {};

// ── Knowledge base cache (refreshed every 10 minutes) ────────────────────────
let knowledgeCache = null;
let lastFetch = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getKnowledge() {
  if (knowledgeCache && (Date.now() - lastFetch < CACHE_TTL)) {
    return knowledgeCache;
  }

  let kb = {
    products: businessConfig.fallbackProducts,
    faqs:     [],
    storeInfo: { name: businessConfig.name, website: businessConfig.website },
  };

  if (supabase) {
    try {
      const [productsRes, faqsRes, storeInfoRes] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('faqs').select('*'),
        supabase.from('store_info').select('*').limit(1),
      ]);
      if (productsRes.data?.length) kb.products  = productsRes.data;
      if (faqsRes.data?.length)    kb.faqs       = faqsRes.data;
      if (storeInfoRes.data?.[0])  kb.storeInfo  = storeInfoRes.data[0];
      console.log('[agent] Knowledge fetched from Supabase:', kb.products.length, 'products');
    } catch (err) {
      console.warn('[agent] Supabase fetch failed, using fallback:', err.message);
    }
  }

  knowledgeCache = kb;
  lastFetch = Date.now();
  return kb;
}

/**
 * Build the system prompt with live knowledge base injected.
 */
function buildSystemPrompt(kb) {
  const productList = kb.products
    .map(p => `- ${p.name} (${p.category || 'General'}) — $${p.price}${p.description ? ': ' + p.description : ''}`)
    .join('\n');

  const faqList = kb.faqs
    .map(f => `Q: ${f.question}\nA: ${f.answer}`)
    .join('\n\n');

  return `${businessConfig.agentPersona}

══════════════════════════════════════
GENTS STYLING — LIVE CATALOGUE
══════════════════════════════════════
${productList}

══════════════════════════════════════
FREQUENTLY ASKED QUESTIONS
══════════════════════════════════════
${faqList || 'No FAQs configured yet.'}

══════════════════════════════════════
SPECIAL INSTRUCTIONS
══════════════════════════════════════
When you want to send a product image, include this EXACTLY in your response (the system will handle it):
  [SEND_IMAGE: <exact product name from catalogue>]

Example: "Yeh dekho! [SEND_IMAGE: Italian Wool Blazer] Kya lagta hai?"

When the customer confirms an order, respond with:
  [DEAL_CLOSED]
  NAME: <customer name or "Not provided">
  ADDRESS: <delivery address or "Pending">
  PRODUCT: <product name(s)>
  AMOUNT: <total amount>
  [/DEAL_CLOSED]

PHONE NUMBER VALIDATION (VERY IMPORTANT):
- When collecting customer's phone number for delivery, ALWAYS validate:
  ✅ Must be 11 digits starting with 03 (Pakistani mobile format)
  ✅ Valid examples: 03001234567, 03211234567, 03451234567
  ❌ Invalid: 3001234567 (10 digits), 923001234567 (12 digits with country code)
- If number is wrong, politely ask again:
  "Bhai, Pakistani mobile number 11 digits ka hota hai — 03XX se shuru hota hai. Dobara likhein please 😊"

ADDRESS CONFIRMATION (VERY IMPORTANT):
- When customer gives delivery address, ALWAYS include this marker in your reply:
  [ADDRESS_CONFIRMED: <full address as customer gave it>]
- Example: "Theek hai! [ADDRESS_CONFIRMED: House 5, Block B, DHA Lahore] Main map check karta hoon, kya yeh sahi address hai?"

Then continue the conversation naturally.
`;
}

/**
 * Process an incoming WhatsApp message and return the agent's response.
 *
 * @param {string} phone   - Sender's phone number (e.g. "923001234567")
 * @param {string} message - Incoming message text
 * @returns {Promise<{
 *   reply: string,
 *   imagesToSend: Array<{productName: string}>,
 *   dealClosed: boolean,
 *   dealData: Object|null
 * }>}
 */
async function processMessage(phone, message) {
  // Init session
  if (!sessions[phone]) {
    sessions[phone] = { history: [], customerInfo: {}, dealPending: false };
  }
  const session = sessions[phone];

  // Fetch knowledge
  const kb = await getKnowledge();
  const systemPrompt = buildSystemPrompt(kb);

  // Build messages array for OpenAI
  const messages = [
    { role: 'system', content: systemPrompt },
    ...session.history,
    { role: 'user', content: message },
  ];

  // Call GPT-4o
  let rawReply = '';
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 600,
      temperature: 0.7,
    });
    rawReply = completion.choices[0].message.content || '';
  } catch (err) {
    console.error('[agent] OpenAI error:', err.message);
    rawReply = 'Maafi chahta hoon, abhi technical masla aa raha hai. Thodi der baad dobara try karein. 🙏';
  }

  // Save to history (keep last 20 turns to avoid token overflow)
  session.history.push({ role: 'user', content: message });
  session.history.push({ role: 'assistant', content: rawReply });
  if (session.history.length > 40) session.history = session.history.slice(-40);

  // ── Parse SEND_IMAGE commands ────────────────────────────────────────────
  const imageMatches = [...rawReply.matchAll(/\[SEND_IMAGE:\s*([^\]]+)\]/gi)];
  const imagesToSend = imageMatches.map(m => ({ productName: m[1].trim() }));

  // ── Parse DEAL_CLOSED block ──────────────────────────────────────────────
  let dealClosed = false;
  let dealData   = null;

  const dealMatch = rawReply.match(/\[DEAL_CLOSED\]([\s\S]*?)\[\/DEAL_CLOSED\]/i);
  if (dealMatch) {
    dealClosed = true;
    const block = dealMatch[1];
    dealData = {
      phone,
      name:    _extract(block, 'NAME'),
      address: _extract(block, 'ADDRESS'),
      product: _extract(block, 'PRODUCT'),
      amount:  parseFloat(_extract(block, 'AMOUNT')) || 0,
      notes:   message,
    };
  }

  // Also check customer message for deal keywords (fallback detection)
  if (!dealClosed) {
    const lowerMsg = message.toLowerCase();
    const isDealMsg = businessConfig.dealKeywords.some(kw => lowerMsg.includes(kw));
    if (isDealMsg && session.dealPending) {
      dealClosed = true;
      dealData = {
        phone,
        name:    session.customerInfo.name || 'Unknown',
        address: session.customerInfo.address || 'Pending',
        product: session.customerInfo.lastProduct || 'Unknown',
        amount:  session.customerInfo.lastAmount || 0,
        notes:   message,
      };
    }
    if (isDealMsg) session.dealPending = true;
  }

  // ── Parse ADDRESS_CONFIRMED marker ──────────────────────────────────────────
  let confirmedAddress = null;
  const addrMatch = rawReply.match(/\[ADDRESS_CONFIRMED:\s*([^\]]+)\]/i);
  if (addrMatch) {
    confirmedAddress = addrMatch[1].trim();
    if (sessions[phone]) sessions[phone].customerInfo.address = confirmedAddress;
    console.log(`[agent] 📍 Address confirmed for ${phone}: "${confirmedAddress}"`);
  }

  // Strip internal markers from the reply before sending to customer
  let cleanReply = rawReply
    .replace(/\[SEND_IMAGE:[^\]]*\]/gi, '')
    .replace(/\[DEAL_CLOSED\][\s\S]*?\[\/DEAL_CLOSED\]/gi, '')
    .replace(/\[ADDRESS_CONFIRMED:[^\]]*\]/gi, '')
    .trim();

  return { reply: cleanReply, imagesToSend, dealClosed, dealData, confirmedAddress };
}

/**
 * Update customer info collected during conversation (name, address).
 * Called from webhook when collecting delivery details.
 */
function updateCustomerInfo(phone, info) {
  if (!sessions[phone]) sessions[phone] = { history: [], customerInfo: {}, dealPending: false };
  Object.assign(sessions[phone].customerInfo, info);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _extract(block, key) {
  const match = block.match(new RegExp(`${key}:\\s*(.+)`, 'i'));
  return match ? match[1].trim() : '';
}

module.exports = { processMessage, updateCustomerInfo, getKnowledge };
