/**
 * src/mapHandler.js
 *
 * Given a Pakistani address:
 * 1. Geocodes using Nominatim (free, no API key)
 * 2. Downloads a static map image using Geoapify (free tier)
 * 3. Returns the local URL + Google Maps link
 */

require('dotenv').config();
const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3001';
const MAPS_DIR   = path.join(__dirname, '../media/maps');

if (!fs.existsSync(MAPS_DIR)) fs.mkdirSync(MAPS_DIR, { recursive: true });

/**
 * Geocode an address using Nominatim (free).
 */
async function geocodeAddress(address) {
  try {
    const query = address.toLowerCase().includes('pakistan')
      ? address : `${address}, Pakistan`;

    const res = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: query, format: 'json', limit: 1 },
      headers: { 'User-Agent': 'GentsStyling-Agent/1.0' },
      timeout: 8000,
    });

    if (!res.data?.length) return null;

    const r = res.data[0];
    return { lat: parseFloat(r.lat), lon: parseFloat(r.lon), displayName: r.display_name };
  } catch (err) {
    console.error('[mapHandler] Geocoding error:', err.message);
    return null;
  }
}

/**
 * Get map image URL for an address.
 * Returns { url, googleMapsLink, displayName } or null.
 */
async function getMapImageUrl(address) {
  try {
    console.log(`[mapHandler] Geocoding: "${address}"`);
    const geo = await geocodeAddress(address);
    if (!geo) {
      console.warn('[mapHandler] Could not geocode address');
      return null;
    }
    console.log(`[mapHandler] ✅ Found: ${geo.lat}, ${geo.lon}`);

    // Try Geoapify static map (3000 free req/day)
    const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY || '';
    let imageUrl = null;

    if (GEOAPIFY_KEY) {
      // With API key
      const mapUrl = `https://maps.geoapify.com/v1/staticmap?style=osm-carto&width=600&height=400&center=lonlat:${geo.lon},${geo.lat}&zoom=15&marker=lonlat:${geo.lon},${geo.lat};color:%23e74c3c;size:large&apiKey=${GEOAPIFY_KEY}`;
      try {
        const imgRes = await axios.get(mapUrl, { responseType: 'arraybuffer', timeout: 10000 });
        const filename = `map_${Date.now()}.png`;
        fs.writeFileSync(path.join(MAPS_DIR, filename), imgRes.data);
        imageUrl = `${PUBLIC_URL}/media/maps/${filename}`;
        console.log(`[mapHandler] ✅ Map image saved: ${imageUrl}`);
      } catch (e) {
        console.warn('[mapHandler] Geoapify failed:', e.message);
      }
    }

    const googleMapsLink = `https://www.google.com/maps?q=${geo.lat},${geo.lon}`;
    const shortDisplay = geo.displayName.split(',').slice(0, 3).join(',');

    return { url: imageUrl, googleMapsLink, displayName: shortDisplay, lat: geo.lat, lon: geo.lon };

  } catch (err) {
    console.error('[mapHandler] Error:', err.message);
    return null;
  }
}

module.exports = { getMapImageUrl };
