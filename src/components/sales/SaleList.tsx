'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { serverFulfillDirectSale, serverCancelDirectSale } from '@/lib/actions/sales';
import {
  Clock,
  CheckCircle2,
  Phone,
  Search,
  Check,
  X,
  Package,
  Calendar,
  Receipt,
  User,
  MapPin,
  RefreshCw,
  Plus
} from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface SaleListProps {
  role?: string;
  userId?: string;
  userName?: string;
}

export default function SaleList({ role, userId, userName }: SaleListProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'queue' | 'completed'>('queue');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<'today' | 'all'>('today');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedSlip, setSelectedSlip] = useState<any | null>(null);

  const queryClient = useQueryClient();

  const { data: sales = [], isLoading: salesLoading } = useQuery({
    queryKey: ['direct_sales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('direct_sales')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  const { data: plants = [], isLoading: plantsLoading } = useQuery({
    queryKey: ['plants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plants')
        .select('*')
        .is('deleted_at', null);
      if (error) throw error;
      return data || [];
    }
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await supabase.from('users').select('id, name');
      return data || [];
    }
  });

  const getPlantName = (id: string) => {
    const p = plants.find((x: any) => x.id === id);
    if (!p) return 'रोप';
    return p.variety ? `${p.plant_name} - ${p.variety}` : p.plant_name;
  };

  const getUserName = (id: string) => {
    const u = users.find((x: any) => x.id === id);
    return u ? u.name : 'Staff';
  };

  // Group individual direct_sales items by sale_number
  const groupedSales = sales.reduce((acc: any, curr: any) => {
    const num = curr.sale_number || curr.id;
    if (!acc[num]) {
      acc[num] = {
        sale_number: num,
        customer_name: curr.customer_name || 'Walk-in Customer',
        customer_phone: curr.customer_phone || '',
        payment_mode: curr.payment_mode || 'Cash',
        cash_amount: 0,
        upi_amount: 0,
        total_amount: 0,
        worker_id: curr.worker_id,
        created_at: curr.created_at,
        fulfillment_status: curr.fulfillment_status || 'Fulfilled',
        items: []
      };
    }
    acc[num].items.push(curr);
    acc[num].total_amount += Number(curr.amount || 0);
    acc[num].cash_amount += Number(curr.cash_amount || 0);
    acc[num].upi_amount += Number(curr.upi_amount || 0);

    // If ANY item in this order is Pending Handover, mark whole order as Pending Handover
    if (curr.fulfillment_status === 'Pending Handover') {
      acc[num].fulfillment_status = 'Pending Handover';
    }

    return acc;
  }, {});

  const groupedList: any[] = Object.values(groupedSales).sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const todayStr = new Date().toISOString().split('T')[0];

  // Pending queue (Orders to Give / द्यायच्या ऑर्डर्स)
  const pendingOrders = groupedList.filter(
    (s: any) => s.fulfillment_status === 'Pending Handover'
  );

  // Completed sales
  const completedOrders = groupedList.filter(
    (s: any) => s.fulfillment_status === 'Fulfilled'
  );

  // Filter completed by date & search
  const filteredCompleted = completedOrders.filter((s: any) => {
    if (dateFilter === 'today') {
      const sDate = new Date(s.created_at).toISOString().split('T')[0];
      if (sDate !== todayStr) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchCust = s.customer_name.toLowerCase().includes(q);
      const matchPhone = s.customer_phone.includes(q);
      const matchNum = s.sale_number.toLowerCase().includes(q);
      const matchItem = s.items.some((it: any) =>
        getPlantName(it.plant_id).toLowerCase().includes(q)
      );
      return matchCust || matchPhone || matchNum || matchItem;
    }
    return true;
  });

  // Filter pending queue by search
  const filteredPending = pendingOrders.filter((s: any) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchCust = s.customer_name.toLowerCase().includes(q);
      const matchPhone = s.customer_phone.includes(q);
      const matchNum = s.sale_number.toLowerCase().includes(q);
      const matchItem = s.items.some((it: any) =>
        getPlantName(it.plant_id).toLowerCase().includes(q)
      );
      return matchCust || matchPhone || matchNum || matchItem;
    }
    return true;
  });

  // Action: Fulfill Sale (Handover to customer)
  const handleFulfill = async (saleNumber: string) => {
    try {
      setActionLoading(`fulfill_${saleNumber}`);
      const res = await serverFulfillDirectSale({
        saleNumber,
        userId: userId || '00000000-0000-0000-0000-000000000000',
        userName: userName || 'Staff'
      });

      if (!res.success) {
        alert('Failed: ' + (res.error || 'Could not fulfill order'));
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['direct_sales'] });
    } catch (err: any) {
      console.error(err);
      alert('Error: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Action: Cancel Sale
  const handleCancel = async (saleNumber: string) => {
    if (!confirm('ही थेट विक्री रद्द करायची आहे का? (Cancel this sale?)')) return;
    try {
      setActionLoading(`cancel_${saleNumber}`);
      const res = await serverCancelDirectSale({
        saleNumber,
        userId: userId || '00000000-0000-0000-0000-000000000000',
        userName: userName || 'Staff',
        reason: 'Customer cancelled at counter'
      });

      if (!res.success) {
        alert('Failed: ' + (res.error || 'Could not cancel order'));
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['direct_sales'] });
      queryClient.invalidateQueries({ queryKey: ['vw_daily_cashbook'] });
      queryClient.invalidateQueries({ queryKey: ['vw_profit_summary'] });
    } catch (err: any) {
      console.error(err);
      alert('Error: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  if (salesLoading || plantsLoading) {
    return (
      <div className="p-12 text-center text-gray-500 font-bold flex flex-col items-center gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-green-600" />
        विक्री माहिती लोड होत आहे...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Primary Tab Selector */}
      <div className="flex bg-gray-100 p-1.5 rounded-2xl gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all ${
            activeTab === 'queue'
              ? 'bg-amber-500 text-white shadow-md'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Clock className="w-4 h-4 stroke-[2.5]" />
          द्यायच्या ऑर्डर्स (Orders to Give)
          {pendingOrders.length > 0 && (
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeTab === 'queue' ? 'bg-white text-amber-600' : 'bg-amber-500 text-white'
              }`}
            >
              {pendingOrders.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all ${
            activeTab === 'completed'
              ? 'bg-green-600 text-white shadow-md'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
          झालेल्या विक्री (Completed Sales)
        </button>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ग्राहक, मोबाईल किंवा रोपाचे नाव शोधा..."
            className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-gray-800 shadow-sm"
          />
        </div>

        {activeTab === 'completed' && (
          <div className="flex bg-white border border-gray-200 rounded-2xl p-1 gap-1">
            <button
              type="button"
              onClick={() => setDateFilter('today')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                dateFilter === 'today'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              आज (Today)
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('all')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                dateFilter === 'all'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              सर्व (All)
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: ORDERS TO GIVE / PENDING HANDOVER QUEUE */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          {filteredPending.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border-2 border-dashed border-gray-200 space-y-3">
              <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>
              <h3 className="text-lg font-black text-gray-900">
                सर्व ऑर्डर्स दिल्या गेल्या आहेत!
              </h3>
              <p className="text-sm font-medium text-gray-400 max-w-sm mx-auto">
                काऊंटरवरून घेतलेल्या सर्व ऑर्डर्स ग्राहकांना दिल्या गेल्या आहेत. नवीन ऑर्डर आल्यावर इथे दिसेल.
              </p>
              <Link
                href="/sales/new"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all mt-2"
              >
                <Plus className="w-4 h-4 stroke-[3]" /> + नवीन विक्री नोंदवा
              </Link>
            </div>
          ) : (
            filteredPending.map(order => {
              const isFulfilling = actionLoading === `fulfill_${order.sale_number}`;
              const isCancelling = actionLoading === `cancel_${order.sale_number}`;
              const totalPlantsCount = order.items.reduce(
                (sum: number, i: any) => sum + Number(i.quantity || 0),
                0
              );

              return (
                <div
                  key={order.sale_number}
                  className="bg-white rounded-3xl shadow-sm border-2 border-amber-200 overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Card Header */}
                  <div className="p-5 bg-amber-50/60 border-b border-amber-100 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-lg text-xs font-black bg-amber-200 text-amber-900">
                          #{order.sale_number}
                        </span>
                        <span className="text-xs font-bold text-amber-700 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(order.created_at).toLocaleTimeString('en-IN', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </span>
                      </div>
                      <h3 className="text-xl font-black text-gray-900 mt-2">
                        {order.customer_name}
                      </h3>
                      {order.customer_phone && (
                        <a
                          href={`tel:${order.customer_phone}`}
                          className="inline-flex items-center gap-1.5 text-xs font-black text-blue-600 hover:underline mt-1"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          {order.customer_phone}
                        </a>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="px-3 py-1 rounded-xl text-xs font-black bg-green-100 text-green-800 border border-green-200 block">
                        जमा ₹{order.total_amount} ({order.payment_mode})
                      </span>
                      <span className="text-[11px] font-bold text-gray-400 mt-1 block">
                        नोंद: {getUserName(order.worker_id)}
                      </span>
                    </div>
                  </div>

                  {/* Plants Packing List (Big high-contrast numbers for workers) */}
                  <div className="p-5 space-y-3 bg-white">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-wider">
                      रोपे द्या (Items to Hand Over • एकूण {totalPlantsCount} रोपे):
                    </p>
                    <div className="space-y-2">
                      {order.items.map((it: any) => (
                        <div
                          key={it.id}
                          className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl border border-gray-100"
                        >
                          <div>
                            <p className="font-black text-gray-900 text-lg">
                              {getPlantName(it.plant_id)}
                            </p>
                            <p className="text-xs font-bold text-gray-400">
                              दर: ₹{it.amount / it.quantity} प्रति रोप
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-2xl font-black text-amber-700 bg-amber-100/80 px-3.5 py-1.5 rounded-xl inline-block border border-amber-200">
                              {it.quantity} रोपे
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Handover Bar */}
                  <div className="p-5 pt-0 flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleFulfill(order.sale_number)}
                      disabled={isFulfilling || isCancelling}
                      className="flex-1 py-4 bg-green-600 hover:bg-green-700 text-white font-black text-lg rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md disabled:opacity-50"
                    >
                      <Check className="w-6 h-6 stroke-[3]" />
                      {isFulfilling ? 'नोंद होत आहे...' : 'रोपे दिली (Order Given)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCancel(order.sale_number)}
                      disabled={isFulfilling || isCancelling}
                      className="px-4 py-4 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-sm rounded-2xl border border-red-200 active:scale-95 transition-all disabled:opacity-50"
                      title="रद्द करा"
                    >
                      {isCancelling ? '...' : <X className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: COMPLETED SALES HISTORY */}
      {activeTab === 'completed' && (
        <div className="space-y-4">
          {filteredCompleted.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200">
              <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400 font-bold">कोणतीही विक्री आढळली नाही.</p>
            </div>
          ) : (
            filteredCompleted.map(sale => (
              <div
                key={sale.sale_number}
                className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between sm:items-center gap-3 hover:shadow-md transition-shadow"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg">
                      #{sale.sale_number}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">
                      {new Date(sale.created_at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <h4 className="font-black text-gray-900 text-base mt-1">
                    {sale.customer_name} {sale.customer_phone && `(${sale.customer_phone})`}
                  </h4>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {sale.items.map((it: any) => (
                      <span
                        key={it.id}
                        className="text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-lg"
                      >
                        {getPlantName(it.plant_id)} × {it.quantity}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0">
                  <div className="text-right">
                    <span className="font-black text-xl text-green-700 block">
                      ₹{sale.total_amount.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      {sale.payment_mode} • {getUserName(sale.worker_id)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSlip(sale)}
                    className="p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl border border-gray-200 transition-all"
                    title="पावती पहा"
                  >
                    <Receipt className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Slip Modal */}
      {selectedSlip && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="font-black text-gray-900 text-lg">विक्री पावती</h3>
              <button
                type="button"
                onClick={() => setSelectedSlip(null)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400 font-bold">पावती क्र:</span>
                <span className="font-mono font-bold text-gray-800">
                  #{selectedSlip.sale_number}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-bold">ग्राहक:</span>
                <span className="font-bold text-gray-800">{selectedSlip.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-bold">दिनांक:</span>
                <span className="font-bold text-gray-800">
                  {new Date(selectedSlip.created_at).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="border-t border-b border-gray-100 py-2 space-y-1.5">
                {selectedSlip.items.map((it: any) => (
                  <div key={it.id} className="flex justify-between font-bold">
                    <span>
                      {getPlantName(it.plant_id)} × {it.quantity}
                    </span>
                    <span>₹{it.amount}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between text-base font-black">
                <span>एकूण जमा:</span>
                <span className="text-green-600">₹{selectedSlip.total_amount}</span>
              </div>
              <div className="flex justify-between text-gray-500 font-bold">
                <span>पद्धत:</span>
                <span>{selectedSlip.payment_mode}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="py-3 bg-gray-900 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 text-xs shadow-md"
              >
                <Receipt className="w-4 h-4" /> प्रिंट
              </button>
              <button
                type="button"
                onClick={() => setSelectedSlip(null)}
                className="py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-xs"
              >
                बंद करा
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
