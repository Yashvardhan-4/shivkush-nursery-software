import { getSession } from '@/lib/actions/auth';
import Link from 'next/link';
import { ShoppingCart, BookOpen } from 'lucide-react';

export default async function SellHubPage() {
  const session = await getSession();
  if (!session) return null;

  return (
    <div className="p-6 mb-20 space-y-6">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Sell</h1>
        <p className="text-sm font-medium text-gray-500 mt-1">Choose how you want to process the sale</p>
      </header>

      <div className="grid grid-cols-1 gap-4">
        <Link 
          href="/sales/new" 
          className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center space-x-5 active:scale-95 transition-all"
        >
          <div className="bg-purple-100 p-4 rounded-2xl text-purple-600 shadow-inner">
            <ShoppingCart className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-900">Direct Sell</h3>
            <p className="text-sm font-medium text-gray-500 mt-1">Walk-in customer cash/UPI sale</p>
          </div>
        </Link>

        <Link 
          href="/bookings" 
          className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center space-x-5 active:scale-95 transition-all"
        >
          <div className="bg-blue-100 p-4 rounded-2xl text-blue-600 shadow-inner">
            <BookOpen className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-900">Booked Order</h3>
            <p className="text-sm font-medium text-gray-500 mt-1">Deliver an existing booking</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
