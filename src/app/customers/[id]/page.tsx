'use client';

import { use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { 
  ArrowLeft, 
  User, 
  Phone, 
  MapPin, 
  TrendingUp, 
  ShoppingBag, 
  CalendarDays,
  FileCheck,
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';

interface Props {
  params: Promise<{ id: string }>;
}

export default function CustomerDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  const { data: customer, isLoading: loadingCustomer } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    }
  });

  const { data: plants = [] } = useQuery({
    queryKey: ['plants'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plants').select('*');
      if (error) throw error;
      return data || [];
    }
  });

  const plantMap = useMemo(() => {
    const map = new Map<string, any>();
    plants.forEach((p: any) => map.set(p.id, p));
    return map;
  }, [plants]);

  // Retrieve transactions using customer phone number
  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings', customer?.mobile],
    enabled: !!customer?.mobile,
    queryFn: async () => {
      const { data, error } = await supabase.from('bookings').select('*').eq('customer_phone', customer.mobile).is('deleted_at', null);
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch centralized booking financial status from the view
  const { data: vwBookingStatus = [] } = useQuery({
    queryKey: ['vw_booking_status', customer?.mobile],
    enabled: bookings.length > 0,
    queryFn: async () => {
      const bookingIds = bookings.map(b => b.id);
      const { data, error } = await supabase
        .from('vw_booking_status')
        .select('booking_id, booking_status, advance_paid, final_paid, total_paid, outstanding_balance')
        .in('booking_id', bookingIds);
      if (error) throw error;
      return data || [];
    }
  });

  const { data: rawSales = [] } = useQuery({
    queryKey: ['direct_sales', customer?.mobile],
    enabled: !!customer?.mobile,
    queryFn: async () => {
      const { data, error } = await supabase.from('direct_sales').select('*').eq('customer_phone', customer.mobile).is('deleted_at', null);
      if (error) throw error;
      return data || [];
    }
  });

  // Group direct sales by sale_number
  const groupedSales = useMemo(() => {
    const map = new Map<string, { sale_number: string; created_at: string; total_amount: number; payment_mode: string; items: any[] }>();
    rawSales.forEach((s: any) => {
      if (!map.has(s.sale_number)) {
        map.set(s.sale_number, {
          sale_number: s.sale_number,
          created_at: s.created_at,
          total_amount: 0,
          payment_mode: s.payment_mode,
          items: []
        });
      }
      const group = map.get(s.sale_number)!;
      group.total_amount += Number(s.amount) || 0;
      group.items.push(s);
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [rawSales]);

  // Group bookings by booking_number
  const groupedBookings = useMemo(() => {
    const map = new Map<string, { booking_number: string; booking_date: string; status: string; total_amount: number; total_paid: number; outstanding_balance: number; items: any[] }>();
    bookings.forEach((b: any) => {
      if (!map.has(b.booking_number)) {
        map.set(b.booking_number, {
          booking_number: b.booking_number,
          booking_date: b.booking_date,
          status: b.status,
          total_amount: 0,
          total_paid: 0,
          outstanding_balance: 0,
          items: []
        });
      }
      const group = map.get(b.booking_number)!;
      const statusRow = vwBookingStatus.find((v: any) => v.booking_id === b.id);
      group.total_amount += Number(b.total_amount) || 0;
      group.total_paid += statusRow ? Number(statusRow.total_paid) : (Number(b.advance_paid) || 0);
      group.outstanding_balance += statusRow ? Number(statusRow.outstanding_balance) : Math.max(0, b.total_amount - (b.advance_paid || 0));
      group.items.push(b);
      // Status rollup
      if (b.status === 'Cancelled') group.status = 'Cancelled';
      else if (group.status !== 'Cancelled' && b.status === 'Delivered') group.status = 'Delivered';
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.booking_date).getTime() - new Date(a.booking_date).getTime());
  }, [bookings, vwBookingStatus]);

  if (loadingCustomer || !customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Financial aggregates
  const totalSalesSpend = rawSales.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
  const totalBookingsSpend = bookings
    .filter((b: any) => b.status !== 'Cancelled')
    .reduce((sum: number, b: any) => sum + Number(b.total_amount || 0), 0);
  
  const lifetimeSpend = totalSalesSpend + totalBookingsSpend;

  const activeBookings = groupedBookings.filter(b => ['Pending', 'Allocated', 'Ready'].includes(b.status));
  const completedBookings = groupedBookings.filter(b => b.status === 'Delivered');
  const cancelledBookings = groupedBookings.filter(b => b.status === 'Cancelled');

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto pb-24">
      {/* Header */}
      <header className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-xl text-gray-500 bg-gray-100 active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">{customer.name}</h1>
          <p className="text-xs font-semibold text-gray-400">Customer Profile & Purchase Ledger</p>
        </div>
      </header>

      {/* Customer Snapshot Card */}
      <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-gray-700 text-sm font-black">
              <Phone className="w-4 h-4 text-green-600" />
              <span>{customer.mobile}</span>
            </div>
            {customer.city && (
              <div className="flex items-center gap-2 text-gray-500 text-xs font-semibold">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                <span>{customer.city}</span>
              </div>
            )}
          </div>
          <span className="text-[10px] font-black uppercase tracking-wider bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
            Active Buyer
          </span>
        </div>

        {/* Financial Highlights */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
          <div className="bg-emerald-50 rounded-2xl p-3.5 border border-emerald-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Lifetime Spend</p>
            <p className="text-xl font-black text-emerald-950 mt-1">₹{lifetimeSpend.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-blue-50 rounded-2xl p-3.5 border border-blue-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-blue-800">Total Orders</p>
            <p className="text-xl font-black text-blue-950 mt-1">{groupedSales.length + groupedBookings.length}</p>
          </div>
        </div>
      </div>

      {/* Direct Sales history */}
      <div className="space-y-3">
        <h3 className="font-black text-gray-800 text-base flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-purple-600" /> Direct Sales ({groupedSales.length})
        </h3>
        {groupedSales.length === 0 ? (
          <p className="text-xs font-semibold text-gray-400 bg-white p-4 rounded-2xl border border-gray-100 text-center">
            No direct purchases recorded.
          </p>
        ) : (
          <div className="grid gap-2.5">
            {groupedSales.map(sale => (
              <div key={sale.sale_number} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-2 text-xs">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-black text-gray-900 text-sm">#{sale.sale_number}</p>
                    <span className="text-[10px] text-gray-400 font-semibold mt-0.5 block">
                      {new Date(sale.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <strong className="text-gray-900 font-black text-base">₹{sale.total_amount.toLocaleString('en-IN')}</strong>
                </div>
                <div className="space-y-1 pt-1.5 border-t border-gray-50">
                  {sale.items.map((item: any, i: number) => {
                    const plant = plantMap.get(item.plant_id);
                    return (
                      <div key={item.id || i} className="flex justify-between text-gray-600 text-[11px]">
                        <span>{plant ? `${plant.plant_name}${plant.variety ? ` (${plant.variety})` : ''}` : 'Plant'} × {item.quantity}</span>
                        <span className="font-bold text-gray-800">₹{item.amount}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Booking history */}
      <div className="space-y-4 pt-2">
        <h3 className="font-black text-gray-800 text-base flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-blue-600" /> Bookings & Deposits ({groupedBookings.length})
        </h3>

        {/* Active Bookings */}
        {activeBookings.length > 0 && (
          <div className="space-y-2.5">
            <h4 className="text-xs font-black text-blue-700 uppercase tracking-wider">Active Bookings</h4>
            <div className="grid gap-2.5">
              {activeBookings.map(b => (
                <div key={b.booking_number} className="bg-white p-4 rounded-2xl border border-blue-100 shadow-sm space-y-2.5 text-xs">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-black text-gray-900 text-sm">#{b.booking_number}</p>
                      <span className="text-[10px] text-gray-400 font-semibold mt-0.5 block">
                        {new Date(b.booking_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    <span className="bg-blue-100 text-blue-800 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full">
                      {b.status}
                    </span>
                  </div>

                  <div className="space-y-1 pt-1.5 border-t border-gray-50">
                    {b.items.map((item: any, i: number) => {
                      const plant = plantMap.get(item.plant_id);
                      return (
                        <div key={item.id || i} className="flex justify-between text-gray-600 text-[11px]">
                          <span>{plant ? `${plant.plant_name}${plant.variety ? ` (${plant.variety})` : ''}` : 'Plant'} × {item.quantity}</span>
                          <span className="font-bold text-gray-800">₹{item.total_amount}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-between text-xs pt-2 border-t border-gray-100 font-semibold">
                    <span className="text-gray-500">Total: ₹{b.total_amount}</span>
                    <span className="text-green-700 font-bold">Paid: ₹{b.total_paid}</span>
                    <span className="text-blue-900 font-black">Balance: ₹{b.outstanding_balance}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completed Bookings */}
        {completedBookings.length > 0 && (
          <div className="space-y-2.5">
            <h4 className="text-xs font-black text-green-700 uppercase tracking-wider">Delivered Orders</h4>
            <div className="grid gap-2.5">
              {completedBookings.map(b => (
                <div key={b.booking_number} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-2 text-xs">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-black text-gray-900 text-sm">#{b.booking_number}</p>
                      <span className="text-[10px] text-green-600 font-bold flex items-center gap-1 mt-0.5">
                        <FileCheck className="w-3 h-3" /> Fully Delivered
                      </span>
                    </div>
                    <strong className="text-gray-900 font-black text-base">₹{b.total_amount}</strong>
                  </div>
                  <div className="space-y-1 pt-1.5 border-t border-gray-50">
                    {b.items.map((item: any, i: number) => {
                      const plant = plantMap.get(item.plant_id);
                      return (
                        <div key={item.id || i} className="flex justify-between text-gray-600 text-[11px]">
                          <span>{plant ? `${plant.plant_name}${plant.variety ? ` (${plant.variety})` : ''}` : 'Plant'} × {item.quantity}</span>
                          <span className="font-bold text-gray-800">₹{item.total_amount}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cancelled Bookings */}
        {cancelledBookings.length > 0 && (
          <div className="space-y-2.5">
            <h4 className="text-xs font-black text-orange-700 uppercase tracking-wider">Forfeited Deposits (Cancelled)</h4>
            <div className="grid gap-2.5">
              {cancelledBookings.map(b => (
                <div key={b.booking_number} className="bg-white p-4 rounded-2xl border border-orange-100 shadow-sm space-y-2 text-xs">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-black text-gray-950 text-sm">#{b.booking_number}</p>
                      <span className="text-[10px] text-orange-600 font-bold flex items-center gap-1 mt-0.5">
                        <AlertCircle className="w-3 h-3" /> Booking Cancelled
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 uppercase font-bold block">Forfeited Advance</span>
                      <strong className="text-orange-700 font-black text-sm">₹{b.total_paid}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {groupedBookings.length === 0 && (
          <p className="text-xs font-semibold text-gray-400 bg-white p-4 rounded-2xl border border-gray-100 text-center">
            No booking deposits recorded.
          </p>
        )}
      </div>
    </div>
  );
}
