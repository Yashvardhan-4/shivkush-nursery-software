import { getSession } from '@/lib/actions/auth';
import AnalyticsClient from '@/components/analytics/AnalyticsClient';
import { redirect } from 'next/navigation';

export default async function AnalyticsPage() {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  if (session.role !== 'owner') {
    redirect('/dashboard');
  }

  return (
    <div className="p-6 mb-20 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Analytics</h1>
        <p className="text-sm font-medium text-gray-500 mt-1">Nursery performance and metrics</p>
      </header>

      <AnalyticsClient />
    </div>
  );
}
