'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { cookies } from 'next/headers';
import crypto from 'crypto';



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
  p_expense_date?: string | null;
  p_worker_id?: string;
}) {
  try {
    const expenseDate = params.p_expense_date ? new Date(params.p_expense_date).toISOString() : new Date().toISOString();

    const { data, error } = await supabaseAdmin.from('expenses').insert({
      category: params.p_category,
      amount: params.p_amount,
      payment_mode: params.p_payment_mode,
      description: params.p_description || null,
      expense_date: expenseDate,
      created_by: params.p_worker_id || null
    }).select('id').single();

    if (error) {
      return { success: false, error: error.message };
    }

    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: params.p_worker_id || '00000000-0000-0000-0000-000000000000',
      action: 'INSERT',
      table_name: 'expenses',
      record_id: data.id,
      details: {
        category: params.p_category,
        amount: params.p_amount,
        payment_mode: params.p_payment_mode,
        expense_date: expenseDate
      },
      created_at: new Date().toISOString()
    });

    return { success: true, id: data.id };
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
