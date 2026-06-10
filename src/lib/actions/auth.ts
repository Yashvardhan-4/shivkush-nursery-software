'use server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

import crypto from 'crypto';

export async function login(mobile: string, passwordPlain: string) {
  const passwordHash = crypto.createHash('sha256').update(passwordPlain).digest('hex');

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, role')
    .eq('mobile', mobile)
    .eq('password_hash', passwordHash)
    .single();

  if (error || !data) {
    return { success: false, error: 'Invalid credentials' };
  }



  // Set cookie for 30 days
  const cookieStore = await cookies();
  cookieStore.set('snms_session', JSON.stringify(data), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });

  return { success: true, user: data };
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('snms_session');
}

export async function getSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get('snms_session');
  if (!session) return null;
  try {
    return JSON.parse(session.value) as { id: string, name: string, role: string };
  } catch (e) {
    return null;
  }
}
