require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

// In-memory session storage (simple approach for prototype)
const sessions = {};

const getSystemPrompt = (kb) => `You are a professional, friendly, and emotionally intelligent customer support assistant for an online fashion store called "GentsStyling".

Your responsibilities:
- Help customers with product-related questions, orders, and store policies
- Provide accurate and helpful information
- Never make up product details—only use provided data
- Detect the user’s emotional tone and respond appropriately:
  - If the user is frustrated, respond with empathy and offer solutions
  - If the user is happy, match their enthusiasm
  - If neutral, be clear and helpful

Keep responses concise but helpful.
Be polite, human-like, and supportive.
If you don’t know something, say so honestly and suggest next steps.
If the user requests human support or is extremely frustrated, offer escalation by outputting [ESCALATE] somewhere in your response.

Here is the store's knowledge base (Products, FAQs, Store Info):
${JSON.stringify(kb, null, 2)}
`;

app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const sid = sessionId || 'default-session';
    
    if (!sessions[sid]) {
      sessions[sid] = [];
    }

    // Fetch latest knowledge from Supabase
    let currentKnowledge = { products: [], faqs: [], storeInfo: {} };
    if (supabase) {
      try {
        const [productsRes, faqsRes, storeInfoRes] = await Promise.all([
          supabase.from('products').select('*'),
          supabase.from('faqs').select('*'),
          supabase.from('store_info').select('*').limit(1)
        ]);
        currentKnowledge.products = productsRes.data || [];
        currentKnowledge.faqs = faqsRes.data || [];
        currentKnowledge.storeInfo = storeInfoRes.data?.[0] || {};
      } catch (err) {
        console.error("Error fetching from Supabase:", err);
      }
    }

    // Prepare chat history for context
    const messages = [
      { role: "system", content: getSystemPrompt(currentKnowledge) },
      ...sessions[sid],
      { role: "user", content: message }
    ];

    // Generate response using Cloudflare
    const cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/539323cdd8c9d446d04cd5c1f804c1e5/ai/run/@cf/meta/llama-3-8b-instruct`,
      {
        headers: { Authorization: `Bearer ${process.env.CF_API_TOKEN}` },
        method: "POST",
        body: JSON.stringify({ messages }),
      }
    );

    if (!cfResponse.ok) {
        throw new Error(`Cloudflare API error: ${cfResponse.statusText}`);
    }

    const result = await cfResponse.json();
    const botResponse = result.result.response;

    // Save to history
    sessions[sid].push({ role: 'user', content: message });
    sessions[sid].push({ role: 'assistant', content: botResponse });

    res.json({ reply: botResponse });

  } catch (error) {
    console.error('Error generating chat response:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
