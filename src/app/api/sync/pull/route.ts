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

    const { searchParams } = new URL(request.url);
    const lastPulledAt = searchParams.get('last_pulled_at');
    const serverTime = new Date().toISOString();

    let plantsQuery = supabaseAdmin.from('plants').select('*');
    let lotsQuery = supabaseAdmin.from('lots').select('*');
    let bookingsQuery = supabaseAdmin.from('bookings').select('*');
    let allotmentsQuery = supabaseAdmin.from('allotments').select('*');
    let directSalesQuery = supabaseAdmin.from('direct_sales').select('*');
    let attendanceQuery = supabaseAdmin.from('attendance').select('*');
    let auditLogsQuery = supabaseAdmin.from('audit_logs').select('*');
    let customersQuery = supabaseAdmin.from('customers').select('*');
    let usersQuery = supabaseAdmin.from('users').select('id, name, role, updated_at');
    let paymentQrsQuery = supabaseAdmin.from('payment_qrs').select('*');

    if (lastPulledAt) {
      plantsQuery = plantsQuery.gt('updated_at', lastPulledAt);
      lotsQuery = lotsQuery.gt('updated_at', lastPulledAt);
      bookingsQuery = bookingsQuery.gt('updated_at', lastPulledAt);
      allotmentsQuery = allotmentsQuery.gt('updated_at', lastPulledAt);
      directSalesQuery = directSalesQuery.gt('updated_at', lastPulledAt);
      attendanceQuery = attendanceQuery.gt('updated_at', lastPulledAt);
      auditLogsQuery = auditLogsQuery.gt('updated_at', lastPulledAt);
      customersQuery = customersQuery.gt('updated_at', lastPulledAt);
      usersQuery = usersQuery.gt('updated_at', lastPulledAt);
      paymentQrsQuery = paymentQrsQuery.gt('updated_at', lastPulledAt);
    }

    // Fetch snapshot of tables concurrently
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
      plantsQuery.limit(5000),
      lotsQuery.limit(5000),
      bookingsQuery.limit(5000),
      allotmentsQuery.limit(5000),
      directSalesQuery.limit(5000),
      attendanceQuery.limit(5000),
      auditLogsQuery.order('created_at', { ascending: false }).limit(5000),
      customersQuery.limit(5000),
      usersQuery.limit(100),
      paymentQrsQuery.limit(50)
    ]);

    return NextResponse.json({
      success: true,
      server_time: serverTime,
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
