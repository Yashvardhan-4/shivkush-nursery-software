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
    label: 'Sale',
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
  return '₹' + n.toLocaleString('en-IN');
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
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

  /* ---- Query: vw_daily_cashbook for selected date ---- */
  const { data: rows, isLoading } = useQuery<CashbookRow[]>({
    queryKey: ['daily_cashbook', selectedDate],
    queryFn: async () => {
      // Build start/end of the selected day in IST
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

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
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
            Daily Cashbook
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
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3 text-sm font-medium focus:ring-2 focus:ring-green-500 focus:outline-none"
          />
        </div>

        {/* ---- Summary card ---- */}
        <div className="bg-gradient-to-br from-green-600 to-emerald-800 rounded-2xl p-5 text-white shadow-md relative overflow-hidden">
          <div className="absolute -right-8 -top-8 bg-white opacity-10 w-32 h-32 rounded-full" />

          <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">
            Day Total
          </p>
          <p className="text-4xl font-black">{fmt(summary.total)}</p>

          <div className="flex gap-6 mt-4">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 opacity-70" />
              <div>
                <p className="text-[10px] uppercase opacity-70 font-bold mb-0.5">
                  Cash
                </p>
                <p className="font-black text-lg">{fmt(summary.cash)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 opacity-70" />
              <div>
                <p className="text-[10px] uppercase opacity-70 font-bold mb-0.5">
                  UPI
                </p>
                <p className="font-black text-lg">{fmt(summary.upi)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ---- Transaction list ---- */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 font-medium text-sm">
            No transactions for {dateLabel.toLowerCase()}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
              <p className="text-xs font-black text-gray-600 uppercase tracking-widest">
                {dateLabel}
              </p>
            </div>

            <div className="divide-y divide-gray-50">
              {rows.map((row, idx) => {
                const config = TYPE_CONFIG[row.transaction_type] ?? TYPE_CONFIG.DIRECT_SALE;
                const Icon = config.icon;

                return (
                  <div
                    key={`${row.datetime}-${idx}`}
                    className="p-4 flex items-start gap-4 hover:bg-gray-50 transition-colors"
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
                        <p className="font-black text-gray-900 whitespace-nowrap flex items-center gap-1">
                          <IndianRupee className="w-3.5 h-3.5" />
                          {Number(row.total).toLocaleString('en-IN')}
                        </p>
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Type badge */}
                          <span
                            className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md ${config.bg} ${config.text}`}
                          >
                            {config.label}
                          </span>

                          {/* Cash / UPI breakdown */}
                          {Number(row.cash) > 0 && (
                            <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-1 rounded-md">
                              Cash {fmt(Number(row.cash))}
                            </span>
                          )}
                          {Number(row.upi) > 0 && (
                            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded-md">
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
          </div>
        )}
      </div>
    </div>
  );
}
