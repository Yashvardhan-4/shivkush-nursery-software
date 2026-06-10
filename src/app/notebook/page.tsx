import { getSession } from '@/lib/actions/auth';
import NotebookLedger from '@/components/notebook/NotebookLedger';

export default async function NotebookPage() {
  const session = await getSession();

  if (!session || session.role !== 'owner') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-10 text-center">
        <p className="text-5xl mb-4">🔒</p>
        <h2 className="text-2xl font-bold text-gray-800">Access Denied</h2>
        <p className="text-sm text-gray-500 mt-2">
          This page is restricted to owners only.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 mb-24">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900">Digital Ledger</h1>
        <p className="text-sm font-medium text-gray-500 mt-1">
          All bookings and sales history
        </p>
      </header>
      <NotebookLedger />
    </div>
  );
}
