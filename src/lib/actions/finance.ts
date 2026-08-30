'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { cookies } from 'next/headers';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Helper to get authenticated client for the current user
async function getAuthClient() {
  const cookieStore = await cookies();
  const session = cookieStore.get('snms_session');
  let userMobile = '';
  
  if (session) {
    try {
      const parsed = JSON.parse(session.value);
      // Look up user mobile if needed
      const { data } = await supabaseAdmin.from('users').select('mobile').eq('id', parsed.id).single();
      userMobile = data?.mobile || '';
    } catch (e) {
      // Ignore
    }
  }

  // Determine auth email
  let authEmail = 'pushpa_exact@shivkush.local';
  if (userMobile === '9000000002') {
    authEmail = 'sarika_exact@shivkush.local';
  } else if (userMobile === '9000000001') {
    authEmail = 'pushpa_exact@shivkush.local';
  }

  // Sign in to get JWT
  const signRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: authEmail, password: 'password123' })
  });
  const signData = await signRes.json();
  return signData.access_token;
}

export async function serverCollectFinalPayment(params: {
  p_booking_id: string;
  p_cash_amount: number;
  p_upi_amount: number;
  p_worker_id?: string;
}) {
  try {
    const { data, error } = await supabaseAdmin.rpc('rpc_collect_final_payment', {
      p_booking_id: params.p_booking_id,
      p_cash_amount: params.p_cash_amount,
      p_upi_amount: params.p_upi_amount,
      p_worker_id: params.p_worker_id || null
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Server error' };
  }
}

export async function serverAddExpense(params: {
  p_category: string;
  p_amount: number;
  p_payment_mode: string;
  p_description: string | null;
  p_worker_id?: string;
}) {
  try {
    const { data, error } = await supabaseAdmin.rpc('rpc_add_expense', {
      p_category: params.p_category,
      p_amount: params.p_amount,
      p_payment_mode: params.p_payment_mode,
      p_description: params.p_description || null
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  } catch (error: any) {
    return { success: false, error: error.message || 'Server error' };
  }
}

export async function serverCancelBooking(params: {
  bookingNumber: string;
}) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('snms_session');
    let userId = '00000000-0000-0000-0000-000000000000';
    let userName = 'Staff';

    if (sessionCookie) {
      try {
        const parsed = JSON.parse(sessionCookie.value);
        userId = parsed.id || userId;
        userName = parsed.name || userName;
      } catch (e) {
        // Ignore
      }
    }

    // 1. Fetch booking rows
    const { data: bookings, error: bErr } = await supabaseAdmin
      .from('bookings')
      .select('id, status, advance_paid')
      .eq('booking_number', params.bookingNumber)
      .is('deleted_at', null);

    if (bErr || !bookings || bookings.length === 0) {
      return { success: false, error: bErr?.message || 'Booking not found' };
    }

    // 2. Validate cancellability
    const isDelivered = bookings.some(b => b.status === 'Delivered');
    if (isDelivered) {
      return { success: false, error: 'Cannot cancel a booking that has already been delivered' };
    }

    const isAlreadyCancelled = bookings.every(b => b.status === 'Cancelled');
    if (isAlreadyCancelled) {
      return { success: false, error: 'Booking is already cancelled' };
    }

    const bookingIds = bookings.map(b => b.id);
    const now = new Date().toISOString();

    // 3. Release active allotments (return inventory to free stock)
    const { error: aErr } = await supabaseAdmin
      .from('allotments')
      .update({ deleted_at: now })
      .in('booking_id', bookingIds)
      .is('deleted_at', null);

    if (aErr) {
      return { success: false, error: 'Failed to release allocations: ' + aErr.message };
    }

    // 4. Mark booking as Cancelled (advance retained, NO refund created per BKG-004)
    const { error: uErr } = await supabaseAdmin
      .from('bookings')
      .update({
        status: 'Cancelled',
        refund_amount: 0,
        refund_payment_mode: null,
        refund_status: 'Forfeited',
        updated_at: now
      })
      .eq('booking_number', params.bookingNumber)
      .is('deleted_at', null);

    if (uErr) {
      return { success: false, error: 'Failed to cancel booking: ' + uErr.message };
    }

    // 5. Record audit log
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: userId,
      user_name: userName,
      action: 'CANCEL_BOOKING',
      table_name: 'bookings',
      record_id: params.bookingNumber,
      details: {
        note: 'Booking cancelled (advance retained by nursery per policy BKG-004)',
        items_count: bookings.length
      },
      created_at: now
    });

    return { success: true, booking_number: params.bookingNumber, items_cancelled: bookings.length };
  } catch (error: any) {
    return { success: false, error: error.message || 'Server error during cancellation' };
  }
}
