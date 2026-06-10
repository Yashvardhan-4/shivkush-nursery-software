import { getSession } from '@/lib/actions/auth';
import OwnerDashboard from '@/components/dashboard/OwnerDashboard';
import WorkerDashboard from '@/components/dashboard/WorkerDashboard';

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) return null;

  return (
    <div className="p-6 mb-20 space-y-6">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-green-900 tracking-tight">
            Welcome, {session.name}
          </h1>
          <p className="text-sm font-medium text-gray-500 capitalize mt-1">{session.role} Dashboard</p>
        </div>
        <div className="h-16 w-16 flex-shrink-0 relative flex items-center justify-center bg-white rounded-xl shadow-sm border border-gray-100 p-1">
          <img
            src="/Shivkush-Nursery-Logo.png"
            alt="Shivkush Nursery Logo"
            className="max-h-full max-w-full object-contain"
          />
        </div>
      </header>

      {session.role === 'owner' ? <OwnerDashboard /> : <WorkerDashboard />}
    </div>
  );
}
