import { NextResponse } from 'next/server';
import { getSession } from '@/lib/actions/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { queue } = await request.json();
    
    if (!queue || !Array.isArray(queue) || queue.length === 0) {
      return NextResponse.json({ success: true, message: 'Empty queue' });
    }

    // Enforce worker role security policies
    if (session.role === 'worker') {
      for (const item of queue) {
        const tbl = item.table;
        const act = item.action;
        const payload = item.payload || {};

        // Workers cannot mutate plants, users, and payment QRs
        if (['plants', 'users', 'payment_qrs'].includes(tbl)) {
          return NextResponse.json({ error: `Forbidden: workers cannot modify ${tbl}` }, { status: 403 });
        }

        // Workers cannot insert or delete lots (only updating available_stock or status is allowed)
        if (tbl === 'lots' && (act === 'INSERT' || act === 'DELETE')) {
          return NextResponse.json({ error: 'Forbidden: workers cannot create or delete lots' }, { status: 403 });
        }

        // Workers can only insert/update their own attendance and cannot delete it
        if (tbl === 'attendance') {
          if (payload.worker_id !== session.id) {
            return NextResponse.json({ error: 'Forbidden: workers cannot modify attendance of other staff' }, { status: 403 });
          }
          if (act === 'DELETE') {
            return NextResponse.json({ error: 'Forbidden: workers cannot delete attendance records' }, { status: 403 });
          }
        }

        // Workers can only insert their own audit logs
        if (tbl === 'audit_logs') {
          if (payload.user_id !== session.id) {
            return NextResponse.json({ error: 'Forbidden: worker audit log user mismatch' }, { status: 403 });
          }
        }
      }
    }

    // Process the entire batch in a single ACID transaction via the RPC
    const { error } = await supabaseAdmin.rpc('process_sync_batch', { payload: queue });

    if (error) {
      console.error('Supabase RPC Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Push Sync Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
