import { getSession } from '@/lib/actions/auth';
import ReportsDashboard from '@/components/reports/ReportsDashboard';

export default async function ReportsPage() {
  const session = await getSession();

  if (!session || session.role !== 'owner') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <div className="bg-red-50 border-2 border-red-200 rounded-3xl p-10 max-w-sm w-full shadow-sm">
          <p className="text-5xl mb-4">🔒</p>
          <h1 className="text-2xl font-black text-red-800 mb-2">Access Denied</h1>
          <p className="text-sm font-medium text-red-600">
            This section is restricted to owners only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24">
      <header className="mb-6 pt-2">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Reports</h1>
        <p className="text-sm font-medium text-gray-500 mt-1">
          Reconciliation · Production Demand · Lots
        </p>
      </header>

      <ReportsDashboard />
    </div>
  );
}
