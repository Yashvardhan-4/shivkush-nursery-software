import { getSession } from '@/lib/actions/auth';
import SaleList from '@/components/sales/SaleList';
import Link from 'next/link';
import { ShoppingCart, Plus } from 'lucide-react';

export default async function SalesPage() {
  const session = await getSession();
  
  if (!session) return null;

  return (
    <div className="p-6 mb-20">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">थेट विक्री (Direct Sales)</h1>
          <p className="text-sm font-semibold text-gray-500 mt-1">द्यायच्या ऑर्डर्स व विक्री इतिहास</p>
        </div>
        <Link 
          href="/sales/new" 
          className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-2xl text-sm font-black shadow-md active:scale-95 transition-all flex items-center gap-2"
        >
          <Plus className="w-5 h-5 stroke-[3]" /> + नवीन विक्री
        </Link>
      </header>
      
      <SaleList role={session.role} userId={session.id} userName={session.name} />
    </div>
  );
}
