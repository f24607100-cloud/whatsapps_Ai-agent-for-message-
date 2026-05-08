/**
 * src/voiceHandler.js
 *
 * Handles incoming WhatsApp voice messages (audio type).
 *
 * Flow:
 * 1. Download the audio file from Meta's servers using the Media ID
 * 2. Save temporarily to /tmp
 * 3. Send to OpenAI Whisper for transcription
 * 4. Return transcribed text to the main webhook handler
 * 5. Delete temp file
 */

require('dotenv').config();
const fs      = require('fs');
const path    = require('path');
const axios   = require('axios');
const OpenAI  = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TOKEN   = process.env.WHATSAPP_TOKEN;
const GRAPH   = 'https://graph.facebook.com/v19.0';

/**
 * Download and transcribe a WhatsApp voice message.
 * @param {string} mediaId - The media ID from the incoming message
 * @param {string} mimeType - e.g. "audio/ogg; codecs=opus"
 * @returns {Promise<string>} - Transcribed text
 */
async function transcribeVoiceMessage(mediaId, mimeType = 'audio/ogg') {
  const tmpPath = path.join('/tmp', `wa_voice_${mediaId}.ogg`);

  try {
    // Step 1 — Get the download URL from Meta
    console.log(`[voiceHandler] Getting URL for media ID: ${mediaId}`);
    const metaRes = await axios.get(`${GRAPH}/${mediaId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const downloadUrl = metaRes.data?.url;
    if (!downloadUrl) throw new Error('No download URL from Meta');

    // Step 2 — Download the audio file
    console.log(`[voiceHandler] Downloading audio from Meta...`);
    const audioRes = await axios.get(downloadUrl, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      responseType: 'arraybuffer',
    });
    fs.writeFileSync(tmpPath, audioRes.data);
    console.log(`[voiceHandler] Audio saved to ${tmpPath}`);

    // Step 3 — Transcribe with Whisper
    console.log(`[voiceHandler] Transcribing with Whisper...`);
    const transcription = await openai.audio.transcriptions.create({
      file:  fs.createReadStream(tmpPath),
      model: 'whisper-1',
      language: 'ur',           // Urdu — also auto-detects Roman Urdu & English
      response_format: 'text',
    });

    const text = typeof transcription === 'string' ? transcription : transcription.text;
    console.log(`[voiceHandler] ✅ Transcribed: "${text}"`);
    return text || '[Voice message could not be transcribed]';

  } catch (err) {
    console.error('[voiceHandler] ❌ Transcription failed:', err.message);
    return '[Customer sent a voice message — could not transcribe]';
  } finally {
    // Step 4 — Delete temp file
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
}

module.exports = { transcribeVoiceMessage };
