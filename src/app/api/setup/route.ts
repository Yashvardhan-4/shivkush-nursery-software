import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import crypto from 'crypto';

export async function GET() {
  const ownerHash = crypto.createHash('sha256').update('admin123').digest('hex');
  const workerHash = crypto.createHash('sha256').update('worker123').digest('hex');

  const { data, error } = await supabaseAdmin.from('users').upsert([
    {
      name: 'Owner',
      mobile: '9999999999',
      role: 'owner',
      password_hash: ownerHash
    },
    {
      name: 'Worker One',
      mobile: '8888888888',
      role: 'worker',
      password_hash: workerHash
    }
  ], { onConflict: 'mobile' }).select();

  if (error) return NextResponse.json({ error });
  return NextResponse.json({ success: true, message: 'Logins created/updated successfully', data });
}
