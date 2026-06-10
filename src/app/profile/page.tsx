import { getSession, logout } from '@/lib/actions/auth';
import { redirect } from 'next/navigation';
import LanguageToggle from '@/components/profile/LanguageToggle';

async function handleLogout() {
  'use server';
  await logout();
  redirect('/login');
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner: { label: 'Owner', color: 'bg-amber-100 text-amber-800' },
  worker: { label: 'Worker', color: 'bg-blue-100 text-blue-800' },
};

export default async function ProfilePage() {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  const initial = session.name.trim().charAt(0).toUpperCase();
  const roleInfo = ROLE_LABELS[session.role] ?? { label: session.role, color: 'bg-gray-100 text-gray-700' };

  return (
    <div className="min-h-screen bg-gray-50 mb-20">
      {/* Dark gradient hero */}
      <div
        className="relative flex flex-col items-center justify-center pt-16 pb-12 px-6"
        style={{
          background: 'linear-gradient(135deg, #14532d 0%, #166534 40%, #15803d 100%)',
        }}
      >
        {/* Decorative circles */}
        <div
          className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)', transform: 'translate(30%, -30%)' }}
        />
        <div
          className="absolute bottom-0 left-0 w-32 h-32 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)', transform: 'translate(-30%, 30%)' }}
        />

        {/* Avatar */}
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-black text-green-900 shadow-2xl mb-5"
          style={{ background: 'linear-gradient(135deg, #bbf7d0, #86efac)' }}
        >
          {initial}
        </div>

        {/* Name */}
        <h1 className="text-3xl font-extrabold text-white tracking-tight text-center">
          {session.name}
        </h1>

        {/* Role badge */}
        <span
          className={`mt-3 inline-block px-4 py-1 rounded-full text-sm font-bold tracking-wide ${roleInfo.color}`}
        >
          {roleInfo.label}
        </span>
      </div>

      {/* Content card */}
      <div className="px-6 py-8 space-y-4">
        {/* Info row */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100">
          <LanguageToggle />
          <div className="flex justify-between items-center px-5 py-4">
            <span className="text-sm font-semibold text-gray-500">Full Name</span>
            <span className="text-sm font-bold text-gray-900">{session.name}</span>
          </div>
          <div className="flex justify-between items-center px-5 py-4">
            <span className="text-sm font-semibold text-gray-500">Role</span>
            <span className="text-sm font-bold text-gray-900 capitalize">{session.role}</span>
          </div>
          <div className="flex justify-between items-center px-5 py-4">
            <span className="text-sm font-semibold text-gray-500">System</span>
            <div className="flex items-center space-x-2">
              <img
                src="/Shivkush-Nursery-Logo.png"
                alt="Shivkush Nursery Logo"
                className="w-6 h-6 object-contain"
              />
              <span className="text-sm font-bold text-gray-900">Shivkush Nursery</span>
            </div>
          </div>
        </div>

        {/* Logout */}
        <form action={handleLogout} className="pt-4">
          <button
            type="submit"
            className="w-full bg-red-600 hover:bg-red-700 text-white font-black text-base p-4 rounded-2xl active:scale-95 transition-transform shadow-md"
          >
            Log Out
          </button>
        </form>

        {/* Powered by branding */}
        <div className="flex flex-col items-center justify-center pt-8 opacity-45">
          <img
            src="/Shivkush-Nursery-Logo.png"
            alt="Shivkush Nursery Logo"
            className="w-12 h-12 object-contain mb-2"
          />
          <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
            Shivkush Nursery Daily Software
          </span>
          <span className="text-[10px] text-gray-400 mt-1">v1.2.0 (Offline-First)</span>
        </div>
      </div>
    </div>
  );
}
