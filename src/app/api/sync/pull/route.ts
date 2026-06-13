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
      supabaseAdmin.from('plants').select('*'),
      supabaseAdmin.from('lots').select('*'),
      supabaseAdmin.from('bookings').select('*'),
      supabaseAdmin.from('allotments').select('*'),
      supabaseAdmin.from('direct_sales').select('*'),
      supabaseAdmin.from('attendance').select('*'),
      supabaseAdmin.from('audit_logs').select('*'),
      supabaseAdmin.from('customers').select('*'),
      supabaseAdmin.from('users').select('id, name, role'),
      supabaseAdmin.from('payment_qrs').select('*')
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
