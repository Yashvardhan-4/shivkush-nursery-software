'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Search, Phone, MapPin, ChevronDown, ChevronUp, ShoppingBag, TrendingUp } from 'lucide-react';

export default function CustomerLedger() {
  const [search, setSearch] = useState('');
  const [expandedPhone, setExpandedPhone] = useState<string | null>(null);

  const bookings = useLiveQuery(() => db.bookings.toArray());
  const directSales = useLiveQuery(() => db.direct_sales.toArray());
  const plants = useLiveQuery(() => db.plants.toArray());

  if (!bookings || !directSales || !plants) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 font-semibold">Loading customer data...</p>
      </div>
    );
  }

  // Build unique customer map keyed by customer_phone
  const customerMap: Record<string, {
    name: string;
    phone: string;
    city: string;
    bookingCount: number;
    totalBookingValue: number;
    totalSalesValue: number;
    bookingNumbers: string[];
  }> = {};

  for (const booking of bookings) {
    const phone = booking.customer_phone;
    if (!customerMap[phone]) {
      customerMap[phone] = {
        name: booking.customer_name,
        phone,
        city: booking.city || '—',
        bookingCount: 0,
        totalBookingValue: 0,
        totalSalesValue: 0,
        bookingNumbers: [],
      };
    }
    customerMap[phone].totalBookingValue += booking.total_amount;
    if (!customerMap[phone].bookingNumbers.includes(booking.booking_number)) {
      customerMap[phone].bookingNumbers.push(booking.booking_number);
      customerMap[phone].bookingCount += 1;
    }
  }

  // Add direct sales value matched by phone
  for (const sale of directSales) {
    const phone = sale.customer_phone || '';
    if (phone && customerMap[phone]) {
      customerMap[phone].totalSalesValue += sale.amount;
    }
  }

  const getPlantName = (id: string) => plants.find(p => p.id === id)?.plant_name || 'Unknown';

  const allCustomers = Object.values(customerMap).sort((a, b) =>
    (b.totalBookingValue + b.totalSalesValue) - (a.totalBookingValue + a.totalSalesValue)
  );

  const filtered = allCustomers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  // Group bookings by booking_number for history view
  const getGroupedBookings = (phone: string) => {
    const phoneBookings = bookings.filter(b => b.customer_phone === phone);
    const grouped = phoneBookings.reduce((acc, curr) => {
      if (!acc[curr.booking_number]) {
        acc[curr.booking_number] = {
          booking_number: curr.booking_number,
          booking_date: curr.booking_date,
          status: curr.status,
          total_amount: 0,
          advance_paid: 0,
          items: [] as typeof bookings,
        };
      }
      acc[curr.booking_number].items.push(curr);
      acc[curr.booking_number].total_amount += curr.total_amount;
      acc[curr.booking_number].advance_paid += curr.advance_paid;
      return acc;
    }, {} as Record<string, any>);
    return Object.values(grouped).sort((a, b) => new Date(b.booking_date).getTime() - new Date(a.booking_date).getTime());
  };

  const statusColors: Record<string, string> = {
    Pending: 'bg-yellow-100 text-yellow-700',
    Allocated: 'bg-blue-100 text-blue-700',
    Ready: 'bg-indigo-100 text-indigo-700',
    Delivered: 'bg-green-100 text-green-700',
    Cancelled: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or phone..."
          className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-gray-800 shadow-sm"
        />
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-2xl font-black text-gray-900">{allCustomers.length}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">Customers</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-2xl font-black text-green-700">₹{allCustomers.reduce((s, c) => s + c.totalBookingValue, 0).toLocaleString('en-IN')}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">Bookings</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-2xl font-black text-blue-700">₹{allCustomers.reduce((s, c) => s + c.totalSalesValue, 0).toLocaleString('en-IN')}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">Direct Sales</p>
        </div>
      </div>

      {/* Customer cards */}
      <div className="space-y-4">
        {filtered.length === 0 && (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200">
            <p className="text-gray-400 font-semibold">No customers found.</p>
          </div>
        )}

        {filtered.map(customer => {
          const isExpanded = expandedPhone === customer.phone;
          const groupedBookings = isExpanded ? getGroupedBookings(customer.phone) : [];
          const totalValue = customer.totalBookingValue + customer.totalSalesValue;

          return (
            <div key={customer.phone} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Customer Header */}
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-xl text-gray-900 truncate">{customer.name}</h3>
                    <div className="flex items-center flex-wrap gap-2 mt-1.5">
                      <span className="flex items-center gap-1 text-xs font-bold text-gray-500">
                        <Phone className="w-3 h-3" /> {customer.phone}
                      </span>
                      {customer.city !== '—' && (
                        <span className="flex items-center gap-1 text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          <MapPin className="w-3 h-3" /> {customer.city}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-3 text-right">
                    <p className="text-xl font-black text-gray-900">₹{totalValue.toLocaleString('en-IN')}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Value</p>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                    <p className="font-black text-gray-900 text-lg">{customer.bookingCount}</p>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Bookings</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
                    <p className="font-black text-green-800 text-lg">₹{customer.totalBookingValue.toLocaleString('en-IN')}</p>
                    <p className="text-[9px] font-bold text-green-500 uppercase tracking-wider">Booking Val</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
                    <p className="font-black text-blue-800 text-lg">₹{customer.totalSalesValue.toLocaleString('en-IN')}</p>
                    <p className="text-[9px] font-bold text-blue-500 uppercase tracking-wider">Direct Sales</p>
                  </div>
                </div>

                {/* View History toggle */}
                <button
                  onClick={() => setExpandedPhone(isExpanded ? null : customer.phone)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all active:scale-95"
                >
                  <ShoppingBag className="w-4 h-4" />
                  {isExpanded ? 'Hide History' : 'View Booking History'}
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {/* Booking History */}
              {isExpanded && (
                <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-3">
                  {groupedBookings.length === 0 && (
                    <p className="text-center text-gray-400 font-semibold py-4">No bookings found.</p>
                  )}
                  {groupedBookings.map((grp: any) => (
                    <div key={grp.booking_number} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">
                          {grp.booking_number}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-400">
                            {new Date(grp.booking_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </span>
                          <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${statusColors[grp.status] || 'bg-gray-100 text-gray-600'}`}>
                            {grp.status}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1.5 mb-3">
                        {grp.items.map((item: any) => (
                          <div key={item.id} className="flex justify-between text-sm">
                            <span className="font-semibold text-gray-700">{item.quantity} × {getPlantName(item.plant_id)}</span>
                            <span className="font-bold text-gray-900">₹{item.total_amount}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                        <span className="text-xs font-bold text-gray-400">Advance: ₹{grp.advance_paid}</span>
                        <span className="text-sm font-black text-gray-900">Total: ₹{grp.total_amount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
