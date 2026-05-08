/**
 * config/businessConfig.js
 *
 * Central configuration for the GentsStyling WhatsApp AI Agent.
 * Edit this file to match your business details — the AI will use
 * everything here when crafting responses to customers.
 */

module.exports = {
  // ── Brand Identity ────────────────────────────────────
  name: process.env.BUSINESS_NAME || 'GentsStyling',
  tagline: 'Premium Menswear — Suits, Blazers, Shirts & Accessories',
  website: process.env.BUSINESS_WEBSITE || 'https://gentsstyling.com',
  whatsappNumber: process.env.BUSINESS_WHATSAPP_NUMBER || '',

  // ── AI Persona ────────────────────────────────────────
  agentName: 'Ali',              // Name the AI introduces itself as
  agentPersona: `You are Ali, a friendly and knowledgeable style consultant at GentsStyling — Pakistan's premium men's fashion brand.

Your job:
1. Welcome customers warmly and understand what they are looking for.
2. Recommend products from the GentsStyling catalogue (blazers, suits, shirts, trousers, shoes, accessories).
3. Share product images when the customer asks or when recommending a product.
4. Pitch relevant offers, flash sales, and bundle deals naturally in conversation.
5. Detect purchase intent and guide the customer towards closing the deal.
6. When a customer confirms an order (says "yes I want it", "confirm", "order karo", "book karo", etc.) — collect their name, address, and phone, then log the deal.
7. After 10–15 days, follow up with customers about new arrivals and special offers.
8. If the customer is very upset or needs human help, say: "Main aapko humari team se connect karta hoon." and flag for escalation.

🌟 LANGUAGE RULE — VERY IMPORTANT:
- ALWAYS reply in ROMAN URDU only — no matter what language the customer uses.
- Roman Urdu means: Urdu words written in English letters. Examples:
  ✅ "Salaam bhai! Yeh blazer bohot acha hai, aapko pasand aayega."
  ✅ "Haan bilkul! Yeh suit abhi sale pe hai, sirf Rs.5000 mein."
  ✅ "Koi baat nahi, main aapki madad karta hoon."
  ❌ Never write actual Urdu script (سلام, آپ, وغیرہ)
  ❌ Never write full English sentences
- Even if customer writes in Urdu script or English — YOU always reply in Roman Urdu.
- Keep responses SHORT (2-4 sentences max unless listing products).
- Be warm, friendly, like a dost (friend) not a robot.
`,

  // ── Deal Detection Keywords ───────────────────────────
  // If the customer says any of these, the agent treats it as a closed deal
  dealKeywords: [
    'confirm', 'confirmed', 'order', 'book', 'booking',
    'buy', 'purchase', 'lena hai', 'le liya', 'order karo',
    'book karo', 'send karo', 'bhejo', 'chahiye', 'done deal',
    'i want it', 'yes i want', 'place order', 'add to cart'
  ],

  // ── Follow-up Scheduler ───────────────────────────────
  followUpDelayDays: {
    min: 10,
    max: 15,
  },

  followUpMessages: [
    `Salam! 👋 {name} bhai, GentsStyling mein naye arrivals aa gaye hain! Check out karo: {website}/new-arrivals — kuch pasand aaya? 😊`,
    `Hey {name}! 🎉 Khuskhbari — Suits & Blazers pe 20% OFF hai sirf aaj! Koi cheez dekhni ho toh batao 🤝`,
    `Assalamualaikum {name} bhai! Aapki last order pasand aai? Naye collection mein kuch acha hai aapke liye 👔 Dekhna chahenge?`,
  ],

  // ── Products (fallback if Supabase is unavailable) ─────
  // These will be used if the Supabase fetch fails
  fallbackProducts: [
    { name: 'Italian Wool Blazer', price: 185, category: 'Blazers', image: 'brown_blazer.jpg', description: 'Premium Italian wool blazer, perfect for formal and semi-formal occasions.' },
    { name: 'Charcoal Classic 3-Piece Suit', price: 295, category: 'Suits', image: 'men_blazergrey.jpg', description: 'A timeless 3-piece suit in charcoal grey. Tailored fit, premium fabric.' },
    { name: 'Signature Oxford Shirt', price: 45, category: 'Shirts', image: 'men fashion.jpg', description: 'Classic Oxford shirt in white. Perfect for office or casual wear.' },
    { name: 'Slim Fit Navy Trousers', price: 65, category: 'Trousers', image: 'men_blazergrey.jpg', description: 'Slim-fit Navy trousers with stretch fabric for all-day comfort.' },
    { name: 'Modern Oxford Shoes', price: 135, category: 'Shoes', image: 'sgents_shoes2.jpg', description: 'Genuine leather Oxford shoes for the modern gentleman.' },
    { name: 'Silk Tie & Pocket Square Set', price: 45, category: 'Accessories', image: 'Silk Tie & Pocket Square.jpg', description: 'Luxury silk tie and matching pocket square. Elevate any outfit.' },
    { name: 'Midnight Tuxedo', price: 450, category: 'Suits', image: 'men_blazergrey.jpg', description: 'Full black-tie tuxedo for galas, weddings, and formal events.' },
    { name: 'Linen Summer Blazer', price: 220, category: 'Blazers', image: 'brown_blazer.jpg', description: 'Lightweight linen blazer — breathable and stylish for summer.' },
  ],
};
