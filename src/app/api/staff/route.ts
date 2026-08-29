import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSession } from '@/lib/actions/auth';
import bcrypt from 'bcryptjs';

async function checkOwnerAuth() {
  const session = await getSession();
  if (!session) {
    return { authorized: false, status: 401, error: 'Unauthorized: Authentication required' };
  }
  if (session.role !== 'owner') {
    return { authorized: false, status: 403, error: 'Forbidden: Owner role required' };
  }
  return { authorized: true, user: session };
}

export async function GET() {
  const auth = await checkOwnerAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, mobile, role, created_at')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const auth = await checkOwnerAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { name, mobile, role, password } = await req.json();
    if (!name || !mobile || !role || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (role !== 'owner' && role !== 'worker') {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data, error } = await supabaseAdmin
      .from('users')
      .insert({
        name,
        mobile,
        role,
        password_hash: passwordHash
      })
      .select('id, name, mobile, role, created_at')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const auth = await checkOwnerAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', id)
      .eq('role', 'worker'); // Never allow deleting owner accounts

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
