/**
 * src/mediaHandler.js
 *
 * Maps product names/categories to their image URLs.
 * The AI agent calls this to get a public image URL when recommending a product.
 *
 * HOW IT WORKS:
 * 1. First looks in Supabase products table for a `image_url` column.
 * 2. Falls back to local /media folder images served via Express static middleware.
 * 3. Falls back to the GentsStyling website images hosted at BUSINESS_WEBSITE.
 */

require('dotenv').config();
const path = require('path');
const businessConfig = require('../config/businessConfig');

// ── Local media folder (relative to project root) ─────────────────────────────
const MEDIA_DIR = path.join(__dirname, '..', 'media');

// ── Base URL where your server is publicly accessible ────────────────────────
// In production on Railway / VPS you'll set PUBLIC_URL in .env
// In development with ngrok you'll get this from `ngrok http 3001`
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`;

/**
 * Given a product object (from Supabase or fallback catalogue),
 * return a publicly accessible image URL.
 *
 * Priority:
 * 1. product.image_url (Supabase hosted)
 * 2. /media/<product.image> served locally
 * 3. GentsStyling website folder (GentsStyling/<product.image>)
 */
function getProductImageUrl(product) {
  if (!product) return null;

  // 1. Supabase has a full URL
  if (product.image_url && product.image_url.startsWith('http')) {
    return product.image_url;
  }

  // 2. Local media folder
  const filename = product.image || product.image_url || '';
  if (filename) {
    return `${PUBLIC_URL}/media/${encodeURIComponent(filename)}`;
  }

  // 3. No image available
  return null;
}

/**
 * Find a product from the catalogue by partial name or category match.
 * @param {string} query - search term (e.g. "blazer", "shoes", "suit")
 * @param {Array}  catalogue - array of product objects
 * @returns {Object|null}
 */
function findProduct(query, catalogue) {
  if (!query || !catalogue?.length) return null;
  const q = query.toLowerCase();
  return catalogue.find(p =>
    p.name?.toLowerCase().includes(q) ||
    p.category?.toLowerCase().includes(q)
  ) || null;
}

/**
 * Return a list of product image URLs for a given category.
 * Used when the agent wants to showcase multiple items.
 * @param {string} category  - e.g. "Blazers", "Suits"
 * @param {Array}  catalogue - array of product objects
 * @param {number} limit     - max images to return (default 3)
 */
function getCategoryImages(category, catalogue, limit = 3) {
  if (!category || !catalogue?.length) return [];
  const cat = category.toLowerCase();
  return catalogue
    .filter(p => p.category?.toLowerCase() === cat)
    .slice(0, limit)
    .map(p => ({ url: getProductImageUrl(p), caption: `${p.name} — $${p.price}` }));
}

module.exports = { getProductImageUrl, findProduct, getCategoryImages };
