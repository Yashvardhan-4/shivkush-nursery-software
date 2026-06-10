import { NextResponse } from 'next/server';
import { getSession } from '@/lib/actions/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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
      { data: audit_logs }
    ] = await Promise.all([
      supabaseAdmin.from('plants').select('*'),
      supabaseAdmin.from('lots').select('*'),
      supabaseAdmin.from('bookings').select('*'),
      supabaseAdmin.from('allotments').select('*'),
      supabaseAdmin.from('direct_sales').select('*'),
      supabaseAdmin.from('attendance').select('*'),
      supabaseAdmin.from('audit_logs').select('*')
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
        audit_logs: audit_logs || []
      }
    });
  } catch (err: any) {
    console.error('Pull Sync Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
