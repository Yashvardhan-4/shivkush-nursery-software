import { getSession } from '@/lib/actions/auth';
import AttendanceManager from '@/components/attendance/AttendanceManager';

export default async function AttendancePage() {
  const session = await getSession();

  if (!session) return null;

  if (session.role !== 'owner') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
        <div className="bg-white rounded-3xl shadow-sm border border-red-100 p-10 text-center max-w-sm w-full">
          <div className="text-5xl mb-4">🚫</div>
          <h2 className="text-2xl font-black text-red-600 mb-2">Access Denied</h2>
          <p className="text-gray-500 font-medium">Only the owner can manage attendance records.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 mb-20 space-y-6">
      <header className="mb-2">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Attendance</h1>
        <p className="text-sm font-medium text-gray-500 mt-1">Mark & track worker attendance</p>
      </header>
      <AttendanceManager ownerId={session.id} ownerName={session.name} />
    </div>
  );
}
