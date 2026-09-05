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
    const sessionCookie = cookieStore.get('snms_session') || cookieStore.get('session');
    let userId: string | null = null;

    if (sessionCookie?.value) {
      try {
        const parsed = JSON.parse(sessionCookie.value);
        userId = parsed.id || null;
      } catch (e) {
        // Ignore
      }
    }

    const { data, error } = await supabaseAdmin.rpc('rpc_cancel_booking', {
      p_booking_number: params.bookingNumber,
      p_user_id: userId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data && !data.success) {
      return { success: false, error: data.error || 'Failed to cancel booking' };
    }

    return { success: true, booking_number: params.bookingNumber };
  } catch (error: any) {
    return { success: false, error: error.message || 'Server error during cancellation' };
  }
}
