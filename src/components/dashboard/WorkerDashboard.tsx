'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toLocalDateStr } from '@/lib/utils';
import {
  Banknote,
  PlusCircle,
  BookOpen,
  Leaf,
  Package,
  Clock,
  ListOrdered,
  Truck,
  ArrowRight
} from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function WorkerDashboard() {
  const [workerId, setWorkerId] = useState<string | undefined>();
  const todayStr = toLocalDateStr();
  const { t } = useLanguage();

  useEffect(() => {
    const userStr = localStorage.getItem('snms_user');
    if (userStr) setWorkerId(JSON.parse(userStr).id);
  }, []);

  const { data: allSales = [] } = useQuery({
    queryKey: ['direct_sales'],
    queryFn: async () => {
      const { data } = await supabase
        .from('direct_sales')
        .select('*')
        .is('deleted_at', null);
      return data || [];
    }
  });

  const { data: allBookings = [] } = useQuery({
    queryKey: ['bookings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('bookings')
        .select('*')
        .is('deleted_at', null);
      return data || [];
    }
  });

  const { data: cashbook = [] } = useQuery({
    queryKey: ['vw_daily_cashbook', todayStr],
    queryFn: async () => {
      const { data } = await supabase.from('vw_daily_cashbook').select('*');
      return data || [];
    }
  });

  const { data: inventory } = useQuery({
    queryKey: ['vw_inventory_status'],
    queryFn: async () => {
      const { data } = await supabase.from('vw_inventory_status').select('*');
      return data || [];
    }
  });

  // Calculate worker's total collections today from authoritative daily cashbook:
  // Direct sales created today + Booking advances collected today + Booking final payments collected today
  const todaySalesTotal = cashbook
    .filter((entry: any) => {
      if (!entry.datetime) return false;
      const d = entry.datetime.split('T')[0];
      const matchDate = d === todayStr;
      const matchWorker = !workerId || entry.worker_id === workerId;
      return matchDate && matchWorker && entry.total > 0;
    })
    .reduce((sum: number, entry: any) => sum + Number(entry.total || 0), 0);

  // Pending orders in nursery that need to be given to customers
  const pendingOrdersCount = allSales.filter(
    (s: any) => s.fulfillment_status === 'Pending Handover'
  ).length;

  // Active bookings pending delivery
  const pendingBookingsCount = allBookings.filter(
    (b: any) => b.status !== 'Delivered' && b.status !== 'Cancelled'
  ).length;

  const freeStockData = (() => {
    if (!inventory) return null;

    return inventory
      .filter((item: any) => (item.current_physical_stock ?? 0) > 0 || (item.allocated_quantity ?? 0) > 0)
      .map((item: any) => ({
        plant: {
          id: item.plant_id,
          plant_name: item.plant_name,
          variety: item.variety,
        },
        totalStock: item.current_physical_stock ?? 0,
        bookedQty: item.allocated_quantity ?? 0,
        freeStock: item.free_stock ?? 0,
      }));
  })();

  return (
    <div className="space-y-6 pb-20">
      <header className="flex justify-between items-center mb-2">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">
          {t('Worker Dashboard')} (कामगार डॅशबोर्ड)
        </h1>
      </header>

      {/* Today's Sales Hero Card */}
      <div className="bg-gradient-to-br from-green-600 to-emerald-800 p-7 rounded-3xl shadow-xl text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Banknote className="w-32 h-32 transform rotate-12" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center space-x-2.5 opacity-90 mb-2">
            <Banknote className="w-5 h-5" />
            <span className="text-xs font-black uppercase tracking-wider">
              {t('todaysSales')} (आजची माझी जमा)
            </span>
          </div>
          <p className="text-4xl sm:text-5xl font-black tracking-tighter">
            ₹{todaySalesTotal.toLocaleString('en-IN')}
          </p>
          <p className="text-[11px] font-medium text-green-100 mt-2">
            थेट विक्री + बुकिंग अॅडव्हान्स + डिलिव्हरी बाकी जमा
          </p>
        </div>
      </div>

      {/* Orders to Give (द्यायच्या ऑर्डर्स) Urgent Banner */}
      {pendingOrdersCount > 0 && (
        <Link
          href="/sales"
          className="bg-amber-500 hover:bg-amber-600 text-white p-5 rounded-3xl shadow-lg flex items-center justify-between active:scale-98 transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white text-amber-600 flex items-center justify-center font-black text-2xl shadow-inner">
              {pendingOrdersCount}
            </div>
            <div>
              <p className="font-black text-lg">द्यायच्या ऑर्डर्स (Orders to Give)</p>
              <p className="text-xs text-amber-100 font-medium">
                काऊंटरवर घेतलेल्या {pendingOrdersCount} ऑर्डर्स ग्राहकांना द्यायच्या आहेत
              </p>
            </div>
          </div>
          <span className="px-3.5 py-2 rounded-xl bg-white/20 text-white text-xs font-black">
            देण्यासाठी टॅप करा →
          </span>
        </Link>
      )}

      {/* Primary Action Buttons */}
      <div className="grid grid-cols-1 gap-3.5">
        <Link
          href="/sales/new"
          className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-4 active:scale-98 transition-all hover:border-green-300"
        >
          <div className="bg-green-100 p-3.5 rounded-2xl text-green-700 shadow-inner">
            <PlusCircle className="w-7 h-7 stroke-[2.5]" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-black text-gray-900">नवीन थेट विक्री (Direct Sale)</h3>
            <p className="text-xs font-medium text-gray-500 mt-0.5">
              काऊंटर विक्री नोंदवा • रोपे द्या
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-400" />
        </Link>

        <Link
          href="/sales"
          className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-4 active:scale-98 transition-all hover:border-amber-300"
        >
          <div className="bg-amber-100 p-3.5 rounded-2xl text-amber-700 shadow-inner relative">
            <ListOrdered className="w-7 h-7 stroke-[2.5]" />
            {pendingOrdersCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-600 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                {pendingOrdersCount}
              </span>
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-black text-gray-900">
              द्यायच्या ऑर्डर्स (Orders Queue)
            </h3>
            <p className="text-xs font-medium text-gray-500 mt-0.5">
              ग्राहकांना रोपे द्या आणि 'दिले' मार्क करा
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-400" />
        </Link>

        <Link
          href="/bookings"
          className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-4 active:scale-98 transition-all hover:border-blue-300"
        >
          <div className="bg-blue-100 p-3.5 rounded-2xl text-blue-700 shadow-inner relative">
            <BookOpen className="w-7 h-7 stroke-[2.5]" />
            {pendingBookingsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                {pendingBookingsCount}
              </span>
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-black text-gray-900">
              बुकिंग नोंदवही (Bookings Register)
            </h3>
            <p className="text-xs font-medium text-gray-500 mt-0.5">
              मालक नसतानाही बुकिंग शोधा, रोपे द्या व बाकी जमा करा
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-400" />
        </Link>

        <Link
          href="/plants"
          className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-4 active:scale-98 transition-all hover:border-green-300"
        >
          <div className="bg-emerald-100 p-3.5 rounded-2xl text-emerald-700 shadow-inner">
            <Leaf className="w-7 h-7 stroke-[2.5]" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-black text-gray-900">रोपे आणि दर (Plants & Price)</h3>
            <p className="text-xs font-medium text-gray-500 mt-0.5">
              नर्सरीतील रोपांची यादी व दर पहा
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-400" />
        </Link>
      </div>

      {/* Free Stock by Plant Section */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center space-x-2 px-1">
          <Leaf className="w-5 h-5 text-green-600" />
          <h2 className="font-black text-gray-800 text-lg">{t('freeStockByPlant')}</h2>
        </div>

        {!freeStockData && (
          <p className="text-sm text-gray-400 text-center py-4">{t('loadingStock')}</p>
        )}

        {freeStockData && freeStockData.length === 0 && (
          <div className="bg-white p-6 rounded-2xl border border-gray-100 text-center">
            <p className="text-sm text-gray-400 font-medium">कोणताही स्टॉक उपलब्ध नाही</p>
          </div>
        )}

        {freeStockData && (
          <div className="space-y-2">
            {freeStockData.map(item => (
              <div
                key={item.plant.id}
                className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center"
              >
                <div>
                  <p className="font-bold text-gray-900">
                    {item.plant.plant_name}
                    {item.plant.variety ? ` - ${item.plant.variety}` : ''}
                  </p>
                  <p className="text-xs text-gray-400 font-medium">
                    स्टॉक: {item.totalStock} • बुकिंग: {item.bookedQty}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`font-black text-lg ${
                      item.freeStock <= 0 ? 'text-red-600' : 'text-green-700'
                    }`}
                  >
                    {item.freeStock}
                  </span>
                  <p className="text-[10px] uppercase font-bold text-gray-400">उपलब्ध</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
