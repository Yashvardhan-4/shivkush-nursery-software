import { NextResponse } from 'next/server';
import { getSession } from '@/lib/actions/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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
