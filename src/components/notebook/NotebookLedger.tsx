'use client';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Search, Filter, Phone } from 'lucide-react';

export default function NotebookLedger() {
  const [tab, setTab] = useState<'Bookings' | 'Sales'>('Bookings');
  const [search, setSearch] = useState('');

  const bookings = useLiveQuery(() => db.bookings.toArray());
  const sales = useLiveQuery(() => db.direct_sales.toArray());
  const plants = useLiveQuery(() => db.plants.toArray());

  // Group bookings by booking_number to show cart items together
  const groupedBookings = bookings?.reduce((acc, curr) => {
    if (!acc[curr.booking_number]) {
      acc[curr.booking_number] = {
        booking_number: curr.booking_number,
        customer_name: curr.customer_name,
        customer_phone: curr.customer_phone,
        city: curr.city,
        total_advance: 0,
        total_amount: 0,
        items: [],
        created_at: curr.created_at || curr.booking_date
      };
    }
    acc[curr.booking_number].items.push(curr);
    acc[curr.booking_number].total_advance += curr.advance_paid;
    acc[curr.booking_number].total_amount += curr.total_amount;
    return acc;
  }, {} as Record<string, any>);

  const bookingsList = groupedBookings ? Object.values(groupedBookings).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) : [];

  // Group sales similarly
  const groupedSales = sales?.reduce((acc, curr) => {
    if (!acc[curr.sale_number]) {
      acc[curr.sale_number] = {
        sale_number: curr.sale_number,
        customer_name: curr.customer_name || 'Walk-in',
        customer_phone: curr.customer_phone || '',
        payment_mode: curr.payment_mode,
        total_amount: 0,
        items: [],
        created_at: curr.created_at
      };
    }
    acc[curr.sale_number].items.push(curr);
    acc[curr.sale_number].total_amount += curr.amount;
    return acc;
  }, {} as Record<string, any>);

  const salesList = groupedSales ? Object.values(groupedSales).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) : [];

  const getPlantName = (id: string) => plants?.find(p => p.id === id)?.plant_name || 'Unknown';

  // Filtering
  const filteredBookings = bookingsList.filter(b => 
    b.customer_name.toLowerCase().includes(search.toLowerCase()) || 
    b.customer_phone.includes(search) || 
    b.booking_number.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSales = salesList.filter(s => 
    s.customer_name.toLowerCase().includes(search.toLowerCase()) || 
    s.customer_phone.includes(search) || 
    s.sale_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="bg-white p-2 rounded-2xl flex border border-gray-100 shadow-sm">
        <button onClick={() => setTab('Bookings')} className={`flex-1 py-3 font-bold rounded-xl transition-all ${tab === 'Bookings' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>Bookings</button>
        <button onClick={() => setTab('Sales')} className={`flex-1 py-3 font-bold rounded-xl transition-all ${tab === 'Sales' ? 'bg-green-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>Direct Sales</button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input 
          type="text" 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
          placeholder="Search name, phone, or ID..." 
          className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-800 shadow-sm"
        />
      </div>

      <div className="space-y-4">
        {tab === 'Bookings' && filteredBookings.map((b, i) => (
          <div key={i} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col">
            <div className="flex justify-between items-start border-b border-gray-100 pb-3 mb-3">
              <div>
                <h3 className="font-black text-lg text-gray-900">{b.customer_name}</h3>
                <div className="flex items-center text-gray-500 text-xs font-bold mt-1 space-x-2">
                  <Phone className="w-3 h-3" /> <span>{b.customer_phone}</span>
                  {b.city && <span className="bg-gray-100 px-2 py-0.5 rounded-full">{b.city}</span>}
                </div>
              </div>
              <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">{b.booking_number}</span>
            </div>
            
            <div className="space-y-2 mb-4">
              {b.items.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="font-semibold text-gray-700">{item.quantity} x {getPlantName(item.plant_id)}</span>
                  <span className="font-bold text-gray-900">₹{item.total_amount}</span>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 p-3 rounded-xl flex justify-between items-center border border-blue-100">
              <div className="text-xs font-bold text-blue-800 uppercase">Advance: ₹{b.total_advance}</div>
              <div className="text-sm font-black text-blue-900">Total: ₹{b.total_amount}</div>
            </div>
          </div>
        ))}

        {tab === 'Sales' && filteredSales.map((s, i) => (
          <div key={i} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col">
            <div className="flex justify-between items-start border-b border-gray-100 pb-3 mb-3">
              <div>
                <h3 className="font-black text-lg text-gray-900">{s.customer_name}</h3>
                {s.customer_phone && (
                  <div className="flex items-center text-gray-500 text-xs font-bold mt-1 space-x-2">
                    <Phone className="w-3 h-3" /> <span>{s.customer_phone}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end space-y-1">
                <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">{s.sale_number}</span>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${s.payment_mode === 'UPI' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>{s.payment_mode}</span>
              </div>
            </div>
            
            <div className="space-y-2 mb-4">
              {s.items.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="font-semibold text-gray-700">{item.quantity} x {getPlantName(item.plant_id)}</span>
                  <span className="font-bold text-gray-900">₹{item.amount}</span>
                </div>
              ))}
            </div>

            <div className="bg-green-50 p-3 rounded-xl flex justify-between items-center border border-green-100">
              <div className="text-xs font-bold text-green-800 uppercase tracking-wider">Total Bill</div>
              <div className="text-xl font-black text-green-900">₹{s.total_amount}</div>
            </div>
          </div>
        ))}

        {(tab === 'Bookings' ? filteredBookings : filteredSales).length === 0 && (
          <div className="text-center py-12 text-gray-400 font-bold">
            No records found.
          </div>
        )}
      </div>
    </div>
  );
}
