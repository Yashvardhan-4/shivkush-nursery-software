import { NextResponse } from 'next/server';
import { getSession } from '@/lib/actions/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch full snapshot of all relevant tables concurrently
    const [
      { data: plants },
      { data: lots },
      { data: bookings },
      { data: allotments },
      { data: direct_sales },
      { data: attendance },
      { data: audit_logs },
      { data: customers },
      { data: users },
      { data: payment_qrs }
    ] = await Promise.all([
      supabaseAdmin.from('plants').select('*').limit(5000),
      supabaseAdmin.from('lots').select('*').limit(5000),
      supabaseAdmin.from('bookings').select('*').limit(5000),
      supabaseAdmin.from('allotments').select('*').limit(5000),
      supabaseAdmin.from('direct_sales').select('*').limit(5000),
      supabaseAdmin.from('attendance').select('*').limit(5000),
      supabaseAdmin.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(5000),
      supabaseAdmin.from('customers').select('*').limit(5000),
      supabaseAdmin.from('users').select('id, name, role').limit(100),
      supabaseAdmin.from('payment_qrs').select('*').limit(50)
    ]);

    return NextResponse.json({
      success: true,
      data: {
        plants: plants || [],
        lots: lots || [],
        bookings: bookings || [],
        allotments: allotments || [],
        direct_sales: direct_sales || [],
        attendance: attendance || [],
        audit_logs: audit_logs || [],
        customers: customers || [],
        users: users || [],
        payment_qrs: payment_qrs || []
      }
    });
  } catch (err: any) {
    console.error('Pull Sync Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
