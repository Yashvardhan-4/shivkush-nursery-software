'use server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

import crypto from 'crypto';

import bcrypt from 'bcryptjs';

export async function login(mobile: string, passwordPlain: string) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, role, password_hash')
    .eq('mobile', mobile)
    .single();

  if (error || !data) {
    return { success: false, error: 'Invalid credentials' };
  }

  let isValid = false;

  // Try bcrypt comparison
  try {
    isValid = await bcrypt.compare(passwordPlain, data.password_hash);
  } catch (e) {
    // If compare fails (e.g. hash format is invalid for bcrypt), it might be SHA-256
  }

  // Fallback to SHA-256 for backward compatibility, then migrate to bcrypt
  if (!isValid) {
    const sha256Hash = crypto.createHash('sha256').update(passwordPlain).digest('hex');
    if (data.password_hash === sha256Hash) {
      isValid = true;
      try {
        const bcryptHash = await bcrypt.hash(passwordPlain, 10);
        await supabaseAdmin
          .from('users')
          .update({ password_hash: bcryptHash })
          .eq('id', data.id);
      } catch (err) {
        console.error('Failed to auto-migrate password hash:', err);
      }
    }
  }

  if (!isValid) {
    return { success: false, error: 'Invalid credentials' };
  }

  const sessionData = { id: data.id, name: data.name, role: data.role };

  // Set cookie for 30 days
  const cookieStore = await cookies();
  cookieStore.set('snms_session', JSON.stringify(sessionData), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });

  return { success: true, user: sessionData };
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
