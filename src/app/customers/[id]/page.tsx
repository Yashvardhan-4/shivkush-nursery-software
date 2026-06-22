'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
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

  const customer = useLiveQuery(() => db.customers.get(id), [id]);
  const plants = useLiveQuery(() => db.plants.toArray());

  // Retrieve transactions using customer phone number
  const bookings = useLiveQuery(async () => {
    if (!customer) return [];
    return await db.bookings.where('customer_phone').equals(customer.mobile).toArray();
  }, [customer]);

  const sales = useLiveQuery(async () => {
    if (!customer) return [];
    // IndexDB doesn't have custom compound index on customer_phone yet, so we pull and filter
    const all = await db.direct_sales.toArray();
    return all.filter(s => s.customer_phone === customer.mobile);
  }, [customer]);

  if (!customer || !plants || !bookings || !sales) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Financial aggregates
  const totalSalesSpend = sales.reduce((sum, s) => sum + s.amount, 0);
  const totalBookingsSpend = bookings
    .filter(b => b.status !== 'Cancelled')
    .reduce((sum, b) => sum + b.total_amount, 0);
  
  const lifetimeSpend = totalSalesSpend + totalBookingsSpend;

  const activeBookings = bookings.filter(b => ['Pending', 'Allocated', 'Ready'].includes(b.status));
  const completedBookings = bookings.filter(b => b.status === 'Delivered');
  const cancelledBookings = bookings.filter(b => b.status === 'Cancelled');

  return (
    <div className="p-6 mb-24 max-w-2xl mx-auto space-y-6">
      <header className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-xl bg-white border border-gray-100 shadow-sm active:scale-95 transition-transform text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-gray-900">Customer Ledger</h1>
          <p className="text-sm font-semibold text-gray-400">Detailed transactions and profile history</p>
        </div>
      </header>

      {/* Profile Card */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-900 rounded-3xl p-6 text-white shadow-xl space-y-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 bg-white/5 w-44 h-44 rounded-full" />
        <div className="flex items-start gap-4">
          <div className="bg-white/10 p-4 rounded-2xl">
            <User className="w-8 h-8 text-indigo-250" />
          </div>
          <div>
            <h2 className="text-2xl font-black">{customer.name}</h2>
            <div className="flex items-center gap-4 text-xs font-semibold text-indigo-200 mt-2">
              <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {customer.mobile}</span>
              {customer.city && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {customer.city}</span>}
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 flex justify-between items-center">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-indigo-200 font-bold">Lifetime Value</p>
            <p className="text-3xl font-black mt-1">₹{lifetimeSpend.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-white/10 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-white/5">
            <TrendingUp className="w-4 h-4 text-emerald-300" /> VIP Status
          </div>
        </div>
      </div>

      {/* Direct Sales history */}
      <div className="space-y-3">
        <h3 className="font-black text-gray-800 text-lg flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-purple-600" /> Direct Sales ({sales.length})
        </h3>
        {sales.length === 0 ? (
          <p className="text-sm font-semibold text-gray-400 bg-white p-4 rounded-2xl border border-gray-100 text-center">
            No direct purchases recorded.
          </p>
        ) : (
          <div className="grid gap-3">
            {sales.map(sale => {
              const plant = plants.find(p => p.id === sale.plant_id);
              return (
                <div key={sale.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-center text-sm">
                  <div>
                    <p className="font-black text-gray-900">{sale.sale_number}</p>
                    <p className="text-xs font-bold text-gray-500 mt-1">
                      {plant?.plant_name} × {sale.quantity}
                    </p>
                    <span className="text-[10px] text-gray-400 mt-0.5 block">
                      {new Date(sale.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <strong className="text-gray-900 font-black text-base">₹{sale.amount}</strong>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Booking history */}
      <div className="space-y-4 pt-2">
        <h3 className="font-black text-gray-800 text-lg flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-blue-600" /> Bookings & Deposits ({bookings.length})
        </h3>

        {/* Active Bookings */}
        {activeBookings.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-black text-blue-700 uppercase tracking-wider">Active Bookings</h4>
            <div className="grid gap-3">
              {activeBookings.map(booking => {
                const plant = plants.find(p => p.id === booking.plant_id);
                return (
                  <div key={booking.id} className="bg-white p-4 rounded-2xl border border-blue-100 shadow-sm space-y-3 text-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-black text-gray-900">{booking.booking_number}</p>
                        <p className="text-xs font-bold text-gray-500 mt-1">
                          {plant?.plant_name} × {booking.quantity}
                        </p>
                      </div>
                      <span className="bg-blue-100 text-blue-800 text-[10px] font-black uppercase px-2.5 py-1 rounded-full">
                        {booking.status}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs pt-2 border-t border-gray-50 font-semibold text-gray-500">
                      <span>Total: ₹{booking.total_amount}</span>
                      <span className="text-green-600 font-bold">Advance paid: ₹{booking.advance_paid}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Completed Bookings */}
        {completedBookings.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-black text-green-700 uppercase tracking-wider">Delivered Orders</h4>
            <div className="grid gap-3">
              {completedBookings.map(booking => {
                const plant = plants.find(p => p.id === booking.plant_id);
                return (
                  <div key={booking.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-center text-sm">
                    <div>
                      <p className="font-black text-gray-900">{booking.booking_number}</p>
                      <p className="text-xs font-bold text-gray-500 mt-1">{plant?.plant_name} × {booking.quantity}</p>
                    </div>
                    <div className="text-right">
                      <strong className="text-gray-900 block font-black text-base">₹{booking.total_amount}</strong>
                      <span className="text-[10px] text-green-600 font-bold flex items-center gap-1 justify-end mt-0.5">
                        <FileCheck className="w-3 h-3" /> Fully Delivered
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cancelled Bookings (Revenue Forfeited) */}
        {cancelledBookings.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-black text-orange-700 uppercase tracking-wider">Forfeited Deposits (Cancelled)</h4>
            <div className="grid gap-3">
              {cancelledBookings.map(booking => {
                const plant = plants.find(p => p.id === booking.plant_id);
                return (
                  <div key={booking.id} className="bg-white p-4 rounded-2xl border border-orange-100 shadow-sm flex justify-between items-center text-sm">
                    <div>
                      <p className="font-black text-gray-950">{booking.booking_number}</p>
                      <p className="text-xs font-bold text-gray-400 mt-1">{plant?.plant_name} (Cancelled)</p>
                    </div>
                    <div className="text-right">
                      <strong className="text-orange-700 block font-black text-base">₹{booking.advance_paid}</strong>
                      <span className="text-[10px] text-orange-600 font-bold flex items-center gap-1 justify-end mt-0.5">
                        <AlertCircle className="w-3 h-3" /> Deposit Forfeited
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {bookings.length === 0 && (
          <p className="text-sm font-semibold text-gray-400 bg-white p-4 rounded-2xl border border-gray-100 text-center">
            No booking deposits recorded.
          </p>
        )}
      </div>
    </div>
  );
}
