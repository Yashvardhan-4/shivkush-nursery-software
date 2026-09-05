'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import crypto from 'crypto';

export interface DirectSaleItem {
  id?: string;
  plantId: string;
  quantity: number;
  price: number;
  amount: number;
  cashAmount?: number;
  upiAmount?: number;
}

export interface DirectSaleOrderPayload {
  saleNumber: string;
  customerName?: string;
  customerPhone?: string;
  customerCity?: string;
  items: DirectSaleItem[];
  paymentMode: 'Cash' | 'UPI' | 'Split';
  cashAmount?: number;
  upiAmount?: number;
  workerId?: string;
  assignedTo?: string;
  fulfillmentStatus?: 'Pending Handover' | 'Fulfilled';
  userId?: string;
  userName?: string;
}

/**
 * Process Direct Sale Order atomically without physical stock gating.
 * Direct sales are created for rush-hour queue and sales accounting.
 */
export async function serverProcessDirectSale(payload: DirectSaleOrderPayload) {
  try {
    const now = new Date().toISOString();
    const userId = payload.userId || '00000000-0000-0000-0000-000000000000';
    const userName = payload.userName || 'Staff';
    const workerId = payload.workerId || userId || '00000000-0000-0000-0000-000000000000';
    const fulfillmentStatus = payload.fulfillmentStatus || 'Pending Handover';

    // 1. Upsert Customer if mobile provided
    if (payload.customerPhone && payload.customerPhone.trim() !== '') {
      const mobile = payload.customerPhone.trim().replace(/\D/g, '').slice(0, 10);
      if (mobile.length === 10) {
        await supabaseAdmin.from('customers').upsert({
          name: payload.customerName || 'Customer',
          mobile,
          city: payload.customerCity || null,
          updated_at: now
        }, { onConflict: 'mobile' });
      }
    }

    // 2. Prepare Direct Sale Line Items
    const rowsToInsert = payload.items.map(item => ({
      id: item.id || crypto.randomUUID(),
      sale_number: payload.saleNumber,
      customer_name: payload.customerName || null,
      customer_phone: payload.customerPhone || null,
      plant_id: item.plantId,
      quantity: item.quantity,
      amount: item.amount,
      payment_mode: payload.paymentMode,
      cash_amount: item.cashAmount !== undefined ? item.cashAmount : (payload.paymentMode === 'Cash' ? item.amount : 0),
      upi_amount: item.upiAmount !== undefined ? item.upiAmount : (payload.paymentMode === 'UPI' ? item.amount : 0),
      worker_id: workerId,
      assigned_to: payload.assignedTo || null,
      fulfillment_status: fulfillmentStatus,
      created_at: now,
      updated_at: now
    }));

    const { error: insertError } = await supabaseAdmin
      .from('direct_sales')
      .insert(rowsToInsert);

    if (insertError) {
      console.error('[serverProcessDirectSale] Insert error:', insertError);
      return { success: false, error: insertError.message };
    }

    // 3. Audit Log
    const totalQty = payload.items.reduce((sum, i) => sum + i.quantity, 0);
    const totalAmt = payload.items.reduce((sum, i) => sum + i.amount, 0);

    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: userId,
      user_name: userName,
      action: 'CREATE_SALE',
      table_name: 'direct_sales',
      record_id: payload.saleNumber,
      details: {
        sale_number: payload.saleNumber,
        items_count: payload.items.length,
        total_quantity: totalQty,
        total_amount: totalAmt,
        payment_mode: payload.paymentMode,
        fulfillment_status: fulfillmentStatus
      },
      created_at: now
    });

    return { success: true, saleNumber: payload.saleNumber };
  } catch (err: any) {
    console.error('[serverProcessDirectSale] Fatal error:', err);
    return { success: false, error: err.message || 'Failed to process direct sale' };
  }
}

/**
 * Hand over direct sale order to customer (Mark Fulfilled)
 * Can be performed by owner or worker.
 */
export async function serverFulfillDirectSale(params: {
  saleNumber: string;
  userId?: string;
  userName?: string;
}) {
  try {
    const now = new Date().toISOString();
    const userId = params.userId || '00000000-0000-0000-0000-000000000000';
    const userName = params.userName || 'Staff';

    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from('direct_sales')
      .update({
        fulfillment_status: 'Fulfilled',
        updated_at: now
      })
      .eq('sale_number', params.saleNumber)
      .is('deleted_at', null)
      .select('id, sale_number, plant_id, quantity');

    if (updateError) {
      console.error('[serverFulfillDirectSale] Error:', updateError);
      return { success: false, error: updateError.message };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return { success: false, error: 'Order not found or already completed.' };
    }

    // Audit log
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: userId,
      user_name: userName,
      action: 'FULFILL_SALE',
      table_name: 'direct_sales',
      record_id: params.saleNumber,
      details: {
        sale_number: params.saleNumber,
        items_count: updatedRows.length,
        note: 'Order given to customer (Handover complete)'
      },
      created_at: now
    });

    return { success: true, itemsFulfilled: updatedRows.length };
  } catch (err: any) {
    console.error('[serverFulfillDirectSale] Fatal error:', err);
    return { success: false, error: err.message || 'Failed to fulfill sale' };
  }
}

/**
 * Cancel direct sale before handover
 */
export async function serverCancelDirectSale(params: {
  saleNumber: string;
  userId?: string;
  userName?: string;
  reason?: string;
}) {
  try {
    const now = new Date().toISOString();
    const userId = params.userId || '00000000-0000-0000-0000-000000000000';
    const userName = params.userName || 'Staff';
    const reason = params.reason || 'Order cancelled at counter';

    const { data: cancelledRows, error: cancelError } = await supabaseAdmin
      .from('direct_sales')
      .update({
        deleted_at: now,
        updated_at: now
      })
      .eq('sale_number', params.saleNumber)
      .is('deleted_at', null)
      .select('id, sale_number');

    if (cancelError) {
      console.error('[serverCancelDirectSale] Error:', cancelError);
      return { success: false, error: cancelError.message };
    }

    if (!cancelledRows || cancelledRows.length === 0) {
      return { success: false, error: 'Order not found or already cancelled.' };
    }

    // Audit log
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: userId,
      user_name: userName,
      action: 'CANCEL_SALE',
      table_name: 'direct_sales',
      record_id: params.saleNumber,
      details: {
        sale_number: params.saleNumber,
        items_cancelled: cancelledRows.length,
        reason
      },
      created_at: now
    });

    return { success: true, itemsCancelled: cancelledRows.length };
  } catch (err: any) {
    console.error('[serverCancelDirectSale] Fatal error:', err);
    return { success: false, error: err.message || 'Failed to cancel sale' };
  }
}
