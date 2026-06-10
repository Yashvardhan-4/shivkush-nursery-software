import { getSession } from '@/lib/actions/auth';
import LotList from '@/components/lots/LotList';

export default async function LotsPage() {
  const session = await getSession();
  
  if (!session) return null;

  return (
    <div className="p-6 mb-20">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Lots</h1>
          <p className="text-sm font-medium text-gray-500 mt-1">Manage growing batches</p>
        </div>
        {session.role === 'owner' && (
          <a href="/lots/new" className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl text-sm font-bold shadow-md active:scale-95 transition-all">
            + Create Lot
          </a>
        )}
      </header>
      
      <LotList />
    </div>
  );
}
