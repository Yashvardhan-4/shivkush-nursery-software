import { getSession } from '@/lib/actions/auth';
import OwnerDashboard from '@/components/dashboard/OwnerDashboard';
import WorkerDashboard from '@/components/dashboard/WorkerDashboard';
import DashboardHeader from '@/components/dashboard/DashboardHeader';

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) return null;

  return (
    <div className="p-6 mb-20 space-y-6">
      <DashboardHeader name={session.name} role={session.role} />

      {session.role === 'owner' ? <OwnerDashboard /> : <WorkerDashboard />}
    </div>
  );
}

