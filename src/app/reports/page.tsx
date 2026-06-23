import { getSession } from '@/lib/actions/auth';
import ReportsDashboard from '@/components/reports/ReportsDashboard';
import Link from 'next/link';

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
      <header className="mb-6 pt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Reports</h1>
          <p className="text-sm font-medium text-gray-500 mt-1">
            Reconciliation · Production Demand · Lots
          </p>
        </div>
        <Link 
          href="/reports/wastage"
          className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-3 py-2 rounded-xl text-xs font-black transition-all shadow-sm flex flex-col items-center gap-0.5"
        >
          <span className="text-lg leading-none">🥀</span>
          Loss & Wastage
        </Link>
      </header>

      <ReportsDashboard />
    </div>
  );
}
