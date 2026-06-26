import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Setup Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runAdversarialTest() {
  console.log("🚀 Starting Adversarial Concurrency Test...");

  // 1. Create a dummy plant and a lot with limited stock
  const plantId = crypto.randomUUID();
  const lotId = crypto.randomUUID();
  const INITIAL_STOCK = 10;

  const { error: plantError } = await supabase.from('plants').insert({ id: plantId, plant_name: 'Test Adversarial Plant', variety: 'Test Variety', selling_price: 100 });
  if (plantError) console.error("Plant Error:", plantError);

  const { error: lotError } = await supabase.from('lots').insert({
    id: lotId,
    plant_id: plantId,
    lot_number: 'TEST-ADV-01',
    total_quantity: INITIAL_STOCK,
    available_stock: INITIAL_STOCK,
    ready_date: new Date().toISOString(),
    status: 'Ready'
  });
  if (lotError) console.error("Lot Error:", lotError);
  console.log(`✅ Lot TEST-ADV-01 created with ${INITIAL_STOCK} stock.`);

  // 2. Simulate 5 concurrent workers trying to sell 3 items EACH at the EXACT SAME TIME
  // 5 * 3 = 15 total items requested, but only 10 available.
  // We expect 3 sales to succeed (9 items), and 2 sales to FAIL entirely (because they would over-allocate).
  console.log("\n[Test 1] Concurrent Direct Sales...");
  
  const workerPromises = [];
  for (let i = 0; i < 5; i++) {
    const saleId = crypto.randomUUID();
    const newSales = [{
      id: saleId,
      sale_number: `SALE-TEST-${i}`,
      plant_id: plantId,
      lot_id: lotId,
      quantity: 3,
      amount: 300,
      payment_mode: 'Cash',
      cash_amount: 300,
      upi_amount: 0,
      worker_id: '00000000-0000-0000-0000-000000000000',
    }];
    
    workerPromises.push(
      supabase.rpc('process_direct_sales_batch', {
        p_sales: newSales,
        p_customer: null,
        p_audit: { user_id: '00000000-0000-0000-0000-000000000000', user_name: 'Test', action: 'CREATE_SALE', details: {} }
      }).then(({ error }) => {
        if (error) {
          return { worker: i, success: false, error: error.message };
        }
        return { worker: i, success: true };
      })
    );
  }

  const results = await Promise.all(workerPromises);
  const successes = results.filter(r => r.success).length;
  const failures = results.filter(r => !r.success).length;

  console.log(`Results: ${successes} successful sales, ${failures} failed sales.`);
  results.forEach(r => {
    if (!r.success) {
      console.log(`Worker ${r.worker} failed with error: ${r.error}`);
    } else {
      console.log(`Worker ${r.worker} succeeded.`);
    }
  });

  // Verify DB state
  const { data: finalLot } = await supabase.from('lots').select('*').eq('id', lotId).single();
  console.log(`\n[Verification] Final Lot Stock: ${finalLot.available_stock} (Expected: ${INITIAL_STOCK - (successes * 3)})`);
  console.log(`[Verification] Lot Status: ${finalLot.status}`);

  if (finalLot.available_stock < 0) {
    console.error("❌ CRITICAL FAILURE: INVENTORY WENT NEGATIVE!");
  } else {
    console.log("✅ INVENTORY INTEGRITY MAINTAINED.");
  }

  // Cleanup
  console.log("\n[Cleanup] Removing test data...");
  await supabase.from('direct_sales').delete().eq('lot_id', lotId);
  await supabase.from('lots').delete().eq('id', lotId);
  await supabase.from('plants').delete().eq('id', plantId);
  console.log("Test finished.");
}

runAdversarialTest();
