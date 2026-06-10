'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useState } from 'react';
import { Calendar } from 'lucide-react';

export default function DailyReport() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const sales = useLiveQuery(() => db.direct_sales.toArray());
  const bookings = useLiveQuery(() => db.bookings.toArray());

  if (!sales || !bookings) {
    return <div className="p-4 text-center text-gray-500 font-medium">Calculating reports...</div>;
  }

  // Direct sales for selected date
  const todaysSales = sales.filter(s => s.created_at.startsWith(selectedDate));

  // New bookings created today (advance paid at booking time)
  const todaysNewBookings = bookings.filter(b => b.created_at?.startsWith(selectedDate));

  // Bookings delivered today
  const todaysDeliveredBookings = bookings.filter(b =>
    b.delivery_date === selectedDate && b.status === 'Delivered'
  );

  // ── Direct Sales Breakdown ──────────────────────────────────────────────
  const directSalesCash = todaysSales.reduce((sum, s) =>
    sum + (s.payment_mode === 'Cash' ? s.amount : s.payment_mode === 'Split' ? (s.cash_amount || 0) : 0), 0);
  const directSalesUpi = todaysSales.reduce((sum, s) =>
    sum + (s.payment_mode === 'UPI' ? s.amount : s.payment_mode === 'Split' ? (s.upi_amount || 0) : 0), 0);

  // ── Booking Delivery Collections (balance collected today) ────────────
  const deliveryCash = todaysDeliveredBookings.reduce((sum, b) => {
    if (b.payment_mode === 'Cash') return sum + Math.max(0, b.total_amount - b.advance_paid);
    if (b.payment_mode === 'Split') return sum + (b.cash_amount || 0);
    return sum;
  }, 0);
  const deliveryUpi = todaysDeliveredBookings.reduce((sum, b) => {
    if (b.payment_mode === 'UPI') return sum + Math.max(0, b.total_amount - b.advance_paid);
    if (b.payment_mode === 'Split') return sum + (b.upi_amount || 0);
    return sum;
  }, 0);

  // ── Advance paid today (on newly created bookings) ─────────────────────
  // Sum the advance_paid from bookings created today
  // Each booking row holds its apportioned advance_paid (set at booking creation time)
  const advanceCashToday = todaysNewBookings.reduce((sum, b) => sum + (b.advance_paid || 0), 0);

  // ── Totals ──────────────────────────────────────────────────────────────
  const totalCashIn = directSalesCash + deliveryCash + advanceCashToday;
  const totalUpiIn  = directSalesUpi  + deliveryUpi;
  const totalRevenue = totalCashIn + totalUpiIn;

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-4 active:scale-[0.99] transition-transform">
        <Calendar className="text-indigo-500 w-7 h-7" />
        <input 
          type="date" 
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full bg-transparent font-black text-xl text-gray-900 outline-none"
        />
      </div>

      <div className="bg-gradient-to-br from-indigo-500 to-indigo-800 p-8 rounded-3xl shadow-xl text-white relative overflow-hidden">
        <div className="absolute -right-10 -top-10 bg-white opacity-10 w-40 h-40 rounded-full"></div>
        <p className="text-sm font-bold uppercase tracking-widest opacity-90 mb-3">Total Collection</p>
        <p className="text-6xl font-black tracking-tighter">₹{totalRevenue.toLocaleString('en-IN')}</p>
      </div>

      {/* Breakdown grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 text-center space-y-1">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Direct Sales Cash</p>
          <p className="text-2xl font-black text-green-600">₹{directSalesCash.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 text-center space-y-1">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Direct Sales UPI</p>
          <p className="text-2xl font-black text-blue-600">₹{directSalesUpi.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 text-center space-y-1">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Delivery Balance Cash</p>
          <p className="text-2xl font-black text-emerald-600">₹{deliveryCash.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 text-center space-y-1">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Delivery Balance UPI</p>
          <p className="text-2xl font-black text-cyan-600">₹{deliveryUpi.toLocaleString('en-IN')}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Booking Advances Collected Today</p>
        <p className="text-4xl font-black text-purple-600">₹{advanceCashToday.toLocaleString('en-IN')}</p>
        <p className="text-xs text-gray-400 mt-1 font-medium">From {todaysNewBookings.length} new booking(s) created today</p>
      </div>

      {/* Reconciliation */}
      <div className="bg-orange-50 border-2 border-orange-200 p-6 rounded-2xl shadow-sm">
        <h3 className="font-black text-orange-900 mb-4 text-lg">Daily Reconciliation</h3>
        <ul className="space-y-4 text-sm font-semibold text-orange-800">
          <li className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm">
            <div>
              <span className="block font-black">Physical Cash Box</span>
              <span className="text-xs text-gray-400 font-normal">Direct Cash + Delivery Cash + Advances</span>
            </div>
            <strong className="text-2xl text-orange-900">₹{totalCashIn.toLocaleString('en-IN')}</strong>
          </li>
          <li className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm">
            <div>
              <span className="block font-black">Bank App (UPI)</span>
              <span className="text-xs text-gray-400 font-normal">Direct UPI + Delivery UPI</span>
            </div>
            <strong className="text-2xl text-orange-900">₹{totalUpiIn.toLocaleString('en-IN')}</strong>
          </li>
        </ul>
      </div>
    </div>
  );
}
