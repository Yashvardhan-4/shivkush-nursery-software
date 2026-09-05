'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import crypto from 'crypto';

export interface BookingEditItem {
  id: string;
  booking_number: string;
  customer_name: string;
  customer_phone: string;
  city?: string | null;
  plant_id: string;
  quantity: number;
  advance_paid: number;
  advance_payment_mode: 'Cash' | 'UPI' | 'Split' | null;
  advance_cash_amount: number | null;
  advance_upi_amount: number | null;
  total_amount: number;
  booking_date: string;
  delivery_date?: string | null;
  status: 'Pending' | 'Allocated' | 'Ready' | 'Delivered' | 'Cancelled';
  worker_id?: string | null;
  remarks?: string | null;
}

export async function serverUpdateBooking(params: {
  bookingNumber: string;
  items: BookingEditItem[];
  deletedItemIds?: string[];
  userId?: string;
  userName?: string;
}) {
  try {
    const now = new Date().toISOString();
    const userId = params.userId || '00000000-0000-0000-0000-000000000000';
    const userName = params.userName || 'Staff';

    // 1. Soft-delete removed items
    if (params.deletedItemIds && params.deletedItemIds.length > 0) {
      await supabaseAdmin
        .from('bookings')
        .update({ deleted_at: now, status: 'Cancelled' })
        .in('id', params.deletedItemIds);
    }

    // 2. Upsert customer in customers table
    if (params.items.length > 0) {
      const first = params.items[0];
      await supabaseAdmin.from('customers').upsert({
        name: first.customer_name,
        mobile: first.customer_phone,
        city: first.city || null,
        updated_at: now
      }, { onConflict: 'mobile' });
    }

    // 3. Upsert booking line items
    for (const item of params.items) {
      const { data: existing } = await supabaseAdmin
        .from('bookings')
        .select('id, plant_id, quantity, status')
        .eq('id', item.id)
        .maybeSingle();

      const isModified = existing ? (existing.plant_id !== item.plant_id || existing.quantity !== item.quantity) : false;

      const bookingPayload = {
        id: item.id,
        booking_number: params.bookingNumber,
        customer_name: item.customer_name,
        customer_phone: item.customer_phone,
        city: item.city || null,
        plant_id: item.plant_id,
        quantity: item.quantity,
        advance_paid: item.advance_paid,
        advance_payment_mode: item.advance_payment_mode,
        advance_cash_amount: item.advance_cash_amount,
        advance_upi_amount: item.advance_upi_amount,
        total_amount: item.total_amount,
        booking_date: item.booking_date,
        delivery_date: item.delivery_date || null,
        status: isModified ? 'Pending' : (existing ? existing.status : item.status || 'Pending'),
        worker_id: item.worker_id || userId,
        remarks: item.remarks || '',
        updated_at: now
      };

      await supabaseAdmin
        .from('bookings')
        .upsert(bookingPayload);

      // 4. Update or insert ADVANCE booking_payments record
      const { data: existingPayment } = await supabaseAdmin
        .from('booking_payments')
        .select('id')
        .eq('booking_id', item.id)
        .eq('payment_type', 'ADVANCE')
        .maybeSingle();

      if (item.advance_paid > 0) {
        const cashAmt = item.advance_cash_amount || (item.advance_payment_mode === 'Cash' ? item.advance_paid : 0);
        const upiAmt = item.advance_upi_amount || (item.advance_payment_mode === 'UPI' ? item.advance_paid : 0);

        if (existingPayment) {
          await supabaseAdmin
            .from('booking_payments')
            .update({
              cash_amount: cashAmt,
              upi_amount: upiAmt,
              created_by: item.worker_id || userId
            })
            .eq('id', existingPayment.id);
        } else {
          await supabaseAdmin
            .from('booking_payments')
            .insert({
              id: crypto.randomUUID(),
              booking_id: item.id,
              payment_type: 'ADVANCE',
              cash_amount: cashAmt,
              upi_amount: upiAmt,
              payment_date: now,
              created_by: item.worker_id || userId
            });
        }
      } else if (existingPayment) {
        // Advance was set to 0
        await supabaseAdmin
          .from('booking_payments')
          .delete()
          .eq('id', existingPayment.id);
      }
    }

    // 5. Audit log
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: userId,
      user_name: userName,
      action: 'UPDATE_BOOKING',
      table_name: 'bookings',
      record_id: params.bookingNumber,
      details: {
        items_count: params.items.length,
        deleted_count: params.deletedItemIds?.length || 0
      },
      created_at: now
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Server error updating booking' };
  }
}
