import { getSession } from '@/lib/actions/auth';
import BookingList from '@/components/bookings/BookingList';

export default async function BookingsPage() {
  const session = await getSession();

  if (!session) return null;

  return (
    <div className="p-6 mb-20">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Bookings</h1>
          <p className="text-sm font-medium text-gray-500 mt-1">Manage reserved plants</p>
        </div>
        <a
          href="/bookings/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl text-sm font-bold shadow-md active:scale-95 transition-all"
        >
          + Book
        </a>
      </header>

      <BookingList role={session.role} userId={session.id} userName={session.name} />
    </div>
  );
}
