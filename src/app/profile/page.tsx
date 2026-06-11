import { getSession, logout } from '@/lib/actions/auth';
import { redirect } from 'next/navigation';
import ProfileClient from '@/components/profile/ProfileClient';

async function handleLogout() {
  'use server';
  await logout();
  redirect('/login');
}

export default async function ProfilePage() {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  return <ProfileClient session={session} logoutAction={handleLogout} />;
}
