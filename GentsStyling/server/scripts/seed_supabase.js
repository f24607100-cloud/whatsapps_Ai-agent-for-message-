const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

// Verify environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Please set them in your .env file.");
  process.exit(1);
}

// Initialize Supabase client with the SECRET key to bypass RLS for table creation/seeding
const supabase = createClient(supabaseUrl, supabaseSecretKey);

async function seed() {
  console.log("Starting Supabase Migration...");

  // Load the knowledge.json data
  const knowledgeBasePath = path.join(__dirname, '..', 'data', 'knowledge.json');
  let data;
  try {
    data = JSON.parse(fs.readFileSync(knowledgeBasePath, 'utf8'));
  } catch (err) {
    console.error("Could not read knowledge.json:", err);
    process.exit(1);
  }

  // 1. Create tables (we do this by calling the REST API or we can just assume they exist if created via SQL editor).
  // Note: `@supabase/supabase-js` does not have DDL (table creation) functions directly. 
  // You normally create tables in the Supabase Dashboard SQL Editor.
  // We will assume the tables exist OR we will print instructions to create them.

  console.log("--------------------------------------------------------------------------------");
  console.log("IMPORTANT: Before running this script, run the following SQL in your Supabase Dashboard SQL Editor:");
  console.log(`
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price NUMERIC,
    sizes JSONB,
    materials JSONB,
    availability TEXT,
    description TEXT
);

CREATE TABLE IF NOT EXISTS faqs (
    id SERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS store_info (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    contactEmail TEXT,
    whatsapp TEXT
);
  `);
  console.log("--------------------------------------------------------------------------------\n");

  console.log("Seeding products...");
  if (data.products && data.products.length > 0) {
      const { error } = await supabase.from('products').upsert(data.products);
      if (error) console.error("Error inserting products:", error);
      else console.log(`Successfully inserted ${data.products.length} products.`);
  }

  console.log("Seeding FAQs...");
  if (data.faqs && data.faqs.length > 0) {
      const { error } = await supabase.from('faqs').upsert(data.faqs);
      if (error) console.error("Error inserting faqs:", error);
      else console.log(`Successfully inserted ${data.faqs.length} FAQs.`);
  }

  console.log("Seeding Store Info...");
  if (data.storeInfo) {
      const storeInfoLower = {
          name: data.storeInfo.name,
          contactemail: data.storeInfo.contactEmail,
          whatsapp: data.storeInfo.whatsapp
      };
      const { error } = await supabase.from('store_info').upsert([storeInfoLower]);
      if (error) console.error("Error inserting store info:", error);
      else console.log("Successfully inserted Store Info.");
  }

  console.log("\nMigration Complete!");
}

seed();
