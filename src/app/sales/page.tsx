import { getSession } from '@/lib/actions/auth';
import SaleList from '@/components/sales/SaleList';

export default async function SalesPage() {
  const session = await getSession();
  
  if (!session) return null;

  return (
    <div className="p-6 mb-20">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Sales</h1>
          <p className="text-sm font-medium text-gray-500 mt-1">Direct Sales History</p>
        </div>
        <a href="/sell" className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl text-sm font-bold shadow-md active:scale-95 transition-all">
          + New Sale
        </a>
      </header>
      
      <SaleList />
    </div>
  );
}
