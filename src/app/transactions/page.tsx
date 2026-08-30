'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { todayIST } from '@/lib/utils';
import {
  BookOpen,
  ShoppingCart,
  Receipt,
  ChevronLeft,
  CalendarDays,
  Banknote,
  Smartphone,
  IndianRupee,
  User,
  X,
  Printer,
  FileText
} from 'lucide-react';
import Link from 'next/link';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CashbookRow {
  datetime: string;
  transaction_type: 'BOOKING_PAYMENT' | 'DIRECT_SALE' | 'EXPENSE';
  cash: number;
  upi: number;
  total: number;
  description: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TYPE_CONFIG: Record<
  CashbookRow['transaction_type'],
  { label: string; bg: string; text: string; icon: typeof BookOpen }
> = {
  BOOKING_PAYMENT: {
    label: 'Booking',
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    icon: BookOpen,
  },
  DIRECT_SALE: {
    label: 'Direct Sale',
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    icon: ShoppingCart,
  },
  EXPENSE: {
    label: 'Expense',
    bg: 'bg-red-100',
    text: 'text-red-700',
    icon: Receipt,
  },
};

function fmt(n: number): string {
  return '₹' + (n || 0).toLocaleString('en-IN');
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DailyCashbookPage() {
  const [selectedDate, setSelectedDate] = useState<string>(todayIST());
  const [activeTxDetail, setActiveTxDetail] = useState<CashbookRow | null>(null);

  /* ---- Query: vw_daily_cashbook for selected date ---- */
  const { data: rows, isLoading } = useQuery<CashbookRow[]>({
    queryKey: ['daily_cashbook', selectedDate],
    queryFn: async () => {
      const dayStart = `${selectedDate}T00:00:00+05:30`;
      const dayEnd = `${selectedDate}T23:59:59.999+05:30`;

      const { data, error } = await supabase
        .from('vw_daily_cashbook')
        .select('datetime, transaction_type, cash, upi, total, description')
        .gte('datetime', dayStart)
        .lte('datetime', dayEnd)
        .order('datetime', { ascending: false });

      if (error) throw error;
      return (data as CashbookRow[]) || [];
    },
  });

  /* ---- Query: Users and Sales for Worker Collections ---- */
  const { data: workerData } = useQuery({
    queryKey: ['worker_collections', selectedDate],
    queryFn: async () => {
      const dayStart = `${selectedDate}T00:00:00+05:30`;
      const dayEnd = `${selectedDate}T23:59:59.999+05:30`;

      const [usersRes, salesRes, paymentsRes] = await Promise.all([
        supabase.from('users').select('*').is('deleted_at', null),
        supabase.from('direct_sales').select('*').is('deleted_at', null).gte('created_at', dayStart).lte('created_at', dayEnd),
        supabase.from('booking_payments').select('*').gte('payment_date', dayStart).lte('payment_date', dayEnd)
      ]);

      const users = usersRes.data || [];
      const sales = salesRes.data || [];
      const payments = paymentsRes.data || [];

      const collectionMap: Record<string, { name: string; role: string; total: number; cash: number; upi: number; count: number }> = {};

      users.forEach(u => {
        collectionMap[u.id] = { name: u.name, role: u.role, total: 0, cash: 0, upi: 0, count: 0 };
      });

      sales.forEach(s => {
        const wId = s.worker_id;
        if (wId && collectionMap[wId]) {
          const amt = Number(s.amount) || 0;
          collectionMap[wId].total += amt;
          collectionMap[wId].count += 1;
          if (s.payment_mode === 'Cash') collectionMap[wId].cash += amt;
          else if (s.payment_mode === 'UPI') collectionMap[wId].upi += amt;
          else {
            collectionMap[wId].cash += Number(s.cash_amount) || 0;
            collectionMap[wId].upi += Number(s.upi_amount) || 0;
          }
        }
      });

      payments.forEach(p => {
        const wId = p.created_by;
        if (wId && collectionMap[wId]) {
          const c = Number(p.cash_amount) || 0;
          const u = Number(p.upi_amount) || 0;
          collectionMap[wId].cash += c;
          collectionMap[wId].upi += u;
          collectionMap[wId].total += (c + u);
          collectionMap[wId].count += 1;
        }
      });

      return Object.values(collectionMap).filter(w => w.total > 0);
    }
  });

  /* ---- Display-only summation of returned rows ---- */
  const summary = useMemo(() => {
    if (!rows || rows.length === 0) return { cash: 0, upi: 0, total: 0 };

    let cash = 0;
    let upi = 0;
    let total = 0;
    for (const r of rows) {
      cash += Number(r.cash) || 0;
      upi += Number(r.upi) || 0;
      total += Number(r.total) || 0;
    }
    return { cash, upi, total };
  }, [rows]);

  /* ---- Date label ---- */
  const dateLabel = useMemo(() => {
    const today = todayIST();
    if (selectedDate === today) return 'Today';

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split('T')[0];
    if (selectedDate === yStr) return 'Yesterday';

    return new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [selectedDate]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* ---- Sticky header ---- */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10 flex items-center gap-3 shadow-sm">
        <Link
          href="/"
          className="p-2 -ml-2 rounded-xl text-gray-500 bg-gray-100 active:scale-95 transition-transform"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-black tracking-tight text-gray-900">
            Daily Cashbook & Transactions
          </h1>
          <p className="text-xs font-semibold text-gray-500">
            {dateLabel} &middot; {rows?.length ?? 0} entries
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* ---- Date picker ---- */}
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
          <CalendarDays className="w-5 h-5 text-gray-400 shrink-0" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-green-500 focus:outline-none"
          />
        </div>

        {/* ---- Summary card ---- */}
        <div className="bg-gradient-to-br from-green-600 to-emerald-800 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="absolute -right-8 -top-8 bg-white opacity-10 w-32 h-32 rounded-full" />

          <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">
            Day Total Collection
          </p>
          <p className="text-4xl font-black">{fmt(summary.total)}</p>

          <div className="flex gap-6 mt-4">
            <div className="flex items-center gap-2">
              <Banknote className="w-5 h-5 opacity-80" />
              <div>
                <p className="text-[10px] uppercase opacity-75 font-bold mb-0.5">
                  Cash
                </p>
                <p className="font-black text-xl">{fmt(summary.cash)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 opacity-80" />
              <div>
                <p className="text-[10px] uppercase opacity-75 font-bold mb-0.5">
                  UPI
                </p>
                <p className="font-black text-xl">{fmt(summary.upi)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ---- Worker Collections Breakdown ---- */}
        {workerData && workerData.length > 0 && (
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-purple-600" />
              <h2 className="text-sm font-black text-gray-900">Worker Collections ({dateLabel})</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {workerData.map((w, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="font-black text-gray-900 text-xs">{w.name}</p>
                    <p className="text-[10px] font-semibold text-gray-400">
                      {w.count} txns &middot; 💵 {fmt(w.cash)} &middot; 📱 {fmt(w.upi)}
                    </p>
                  </div>
                  <strong className="text-sm font-black text-green-700">{fmt(w.total)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- Transaction list ---- */}
        <div className="space-y-2">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-sm font-black text-gray-900">Transactions List</h2>
            <span className="text-xs text-gray-400 font-bold">{rows?.length ?? 0} entries &middot; Tap to view slip</span>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
            </div>
          ) : !rows || rows.length === 0 ? (
            <div className="bg-white rounded-3xl border border-gray-100 p-10 text-center text-gray-400 font-medium text-sm shadow-sm">
              No transactions recorded for {dateLabel.toLowerCase()}
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
              {rows.map((row, idx) => {
                const config = TYPE_CONFIG[row.transaction_type] ?? TYPE_CONFIG.DIRECT_SALE;
                const Icon = config.icon;

                return (
                  <div
                    key={`${row.datetime}-${idx}`}
                    onClick={() => setActiveTxDetail(row)}
                    className="p-4 flex items-start gap-3.5 hover:bg-gray-50 active:bg-gray-100 transition-all cursor-pointer"
                  >
                    {/* Icon */}
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${config.bg} ${config.text}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <p className="font-black text-gray-900 text-sm truncate pr-2">
                          {row.description}
                        </p>
                        <p className="font-black text-gray-900 whitespace-nowrap flex items-center gap-0.5">
                          <IndianRupee className="w-3.5 h-3.5" />
                          {Number(row.total).toLocaleString('en-IN')}
                        </p>
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Type badge */}
                          <span
                            className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${config.bg} ${config.text}`}
                          >
                            {config.label}
                          </span>

                          {/* Cash / UPI breakdown */}
                          {Number(row.cash) > 0 && (
                            <span className="text-[10px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-md">
                              Cash {fmt(Number(row.cash))}
                            </span>
                          )}
                          {Number(row.upi) > 0 && (
                            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-md">
                              UPI {fmt(Number(row.upi))}
                            </span>
                          )}
                        </div>

                        {/* Time */}
                        <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap">
                          {formatTime(row.datetime)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Transaction Details Slip Modal */}
      {activeTxDetail && (
        <div 
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setActiveTxDetail(null)}
        >
          <div 
            className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl space-y-4 p-6 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start border-b border-gray-100 pb-3">
              <div>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${TYPE_CONFIG[activeTxDetail.transaction_type].bg} ${TYPE_CONFIG[activeTxDetail.transaction_type].text}`}>
                  {TYPE_CONFIG[activeTxDetail.transaction_type].label}
                </span>
                <h3 className="text-base font-black text-gray-900 mt-1">Transaction Details</h3>
              </div>
              <button 
                onClick={() => setActiveTxDetail(null)}
                className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Receipt Slip Box */}
            <div className="bg-gray-50 border border-gray-200/80 rounded-2xl p-4 space-y-3 text-xs">
              <div>
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Description</span>
                <p className="font-bold text-gray-800 text-sm">{activeTxDetail.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-200/60">
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase block">Date & Time</span>
                  <p className="font-semibold text-gray-700">{formatDateTime(activeTxDetail.datetime)}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 font-bold uppercase block">Total Amount</span>
                  <p className="font-black text-green-700 text-base">{fmt(activeTxDetail.total)}</p>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-200/60 space-y-1.5">
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Payment Split</span>
                <div className="flex justify-between font-semibold text-gray-700">
                  <span>💵 Cash:</span>
                  <span className="font-bold">{fmt(activeTxDetail.cash)}</span>
                </div>
                <div className="flex justify-between font-semibold text-gray-700">
                  <span>📱 UPI:</span>
                  <span className="font-bold">{fmt(activeTxDetail.upi)}</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.print()}
                className="py-3 bg-gray-900 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 text-xs active:scale-95 transition-all shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" /> Print Slip
              </button>
              <button
                type="button"
                onClick={() => setActiveTxDetail(null)}
                className="py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs active:scale-95 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
