import { getSession } from '@/lib/actions/auth';
import AllotmentManager from '@/components/allotments/AllotmentManager';
import { ShieldX } from 'lucide-react';

export default async function AllotmentsPage() {
  const session = await getSession();

  if (!session || session.role !== 'owner') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-red-900/40 border border-red-700/50 flex items-center justify-center mb-6">
          <ShieldX className="w-10 h-10 text-red-400" />
        </div>
        <h1 className="text-2xl font-black text-white mb-2">Access Denied</h1>
        <p className="text-gray-400 font-medium">
          Only the Owner can access the Allotment System.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 pb-24">
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl font-black text-white tracking-tight">Allotment System</h1>
        <p className="text-sm font-medium text-gray-400 mt-1">
          Reserve lots for pending bookings
        </p>
      </div>
      <AllotmentManager />
    </div>
  );
}
