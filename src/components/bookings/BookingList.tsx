'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { serverCancelBooking } from '@/lib/actions/finance';
import { logAudit } from '@/lib/utils';
import { Search, Phone, MapPin, Package, Truck, XCircle, CheckCircle2, FileSpreadsheet, FileText, Pencil } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { exportToExcel, exportToPDF } from '@/lib/exportUtils';

type TabStatus = 'All' | 'Pending' | 'Allocated' | 'Ready' | 'Delivered' | 'Cancelled';

const TABS: TabStatus[] = ['All', 'Pending', 'Allocated', 'Ready', 'Delivered', 'Cancelled'];

const STATUS_COLORS: Record<string, string> = {
  Pending:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  Allocated: 'bg-blue-100 text-blue-700 border-blue-200',
  Ready:     'bg-indigo-100 text-indigo-700 border-indigo-200',
  Delivered: 'bg-green-100 text-green-700 border-green-200',
  Cancelled: 'bg-red-100 text-red-700 border-red-200',
};

const TAB_ACTIVE: Record<TabStatus, string> = {
  All:       'bg-gray-800 text-white',
  Pending:   'bg-yellow-500 text-white',
  Allocated: 'bg-blue-600 text-white',
  Ready:     'bg-indigo-600 text-white',
  Delivered: 'bg-green-600 text-white',
  Cancelled: 'bg-red-500 text-white',
};

interface BookingListProps {
  role: string;
  userId: string;
  userName: string;
}

export default function BookingList({ role, userId, userName }: BookingListProps) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<TabStatus>('Pending');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: bookings } = useQuery({ queryKey: ['bookings'], queryFn: async () => { const { data } = await supabase.from('bookings').select('*').is('deleted_at', null).order('created_at', { ascending: false }); return data || []; } });
  const { data: plants } = useQuery({ queryKey: ['plants'], queryFn: async () => { const { data } = await supabase.from('plants').select('*').is('deleted_at', null); return data || []; } });
  const { data: lots } = useQuery({ queryKey: ['lots'], queryFn: async () => { const { data } = await supabase.from('lots').select('*').is('deleted_at', null); return data || []; } });
  const { data: allotments } = useQuery({ queryKey: ['allotments'], queryFn: async () => { const { data } = await supabase.from('allotments').select('*').is('deleted_at', null); return data || []; } });
  const { data: direct_sales } = useQuery({ queryKey: ['direct_sales'], queryFn: async () => { const { data } = await supabase.from('direct_sales').select('*').is('deleted_at', null); return data || []; } });
  const { data: vwBookingStatus } = useQuery({ queryKey: ['vw_booking_status'], queryFn: async () => { const { data } = await supabase.from('vw_booking_status').select('*'); return data || []; } });

  const handleExportExcel = () => {
    if (!filtered || filtered.length === 0) return;
    const data = filtered.map(g => ({
      'Booking No': g.booking_number,
      'Customer': g.customer_name,
      'Phone': g.customer_phone,
      'City': g.city || '',
      'Status': g.status,
      'Items': g.items.map((i: any) => `${i.quantity} x ${getPlantName(i.plant_id)}`).join(', '),
      'Total Amount': g.total_amount,
      'Advance Paid': g.advance_paid,
      'Balance': g.balance,
      'Date': new Date(g.booking_date).toLocaleDateString()
    }));
    exportToExcel(data, 'Bookings_Export');
  };

  const handleExportPDF = () => {
    if (!filtered || filtered.length === 0) return;
    const data = filtered.map(g => ({
      bookingNo: g.booking_number,
      customer: g.customer_name,
      phone: g.customer_phone,
      status: g.status,
      items: g.items.map((i: any) => `${i.quantity} x ${getPlantName(i.plant_id)}`).join(', '),
      amount: g.total_amount,
      balance: g.balance
    }));
    const columns = [
      { header: 'Booking No', dataKey: 'bookingNo' },
      { header: 'Customer', dataKey: 'customer' },
      { header: 'Phone', dataKey: 'phone' },
      { header: 'Items', dataKey: 'items' },
      { header: 'Status', dataKey: 'status' },
      { header: 'Amount', dataKey: 'amount' },
      { header: 'Balance', dataKey: 'balance' }
    ];
    exportToPDF(data, 'Bookings_Export', 'Bookings Report', columns);
  };

  if (!bookings || !plants || !lots) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 font-semibold">{t('loadingStock')}</p>
      </div>
    );
  }

  const getPlantName = (id: string) => {
    const p = plants.find(p => p.id === id);
    return p ? (p.variety ? `${p.plant_name} - ${p.variety}` : p.plant_name) : t('unknown');
  };

  const getLotNumber = (lotId: string | null) => {
    if (!lotId) return t('noLotAssigned');
    const lot = lots?.find(l => l.id === lotId);
    return lot ? (lot.lot_name || lot.lot_number) : t('noLotAssigned');
  };

  // Group bookings by booking_number
  const grouped = bookings.reduce((acc, curr) => {
    if (!acc[curr.booking_number]) {
      acc[curr.booking_number] = {
        booking_number: curr.booking_number,
        customer_name: curr.customer_name,
        customer_phone: curr.customer_phone,
        city: curr.city,
        booking_date: curr.booking_date,
        status: curr.status,
        total_amount: 0,
        advance_paid: 0,
        balance: 0,
        items: [] as typeof bookings,
        created_at: curr.created_at || curr.booking_date,
      };
    }
    acc[curr.booking_number].items.push(curr);
    
    const statusRow = vwBookingStatus?.find((v: any) => v.booking_id === curr.id);
    
    acc[curr.booking_number].total_amount += curr.total_amount;
    acc[curr.booking_number].advance_paid += statusRow ? Number(statusRow.advance_paid) : curr.advance_paid;
    acc[curr.booking_number].balance += statusRow ? Number(statusRow.outstanding_balance) : (curr.total_amount - curr.advance_paid);
    
    return acc;
  }, {} as any);

  const groupedList: any[] = Object.values(grouped).map((g: any) => {
    const hasAllocated = g.items.some((i: any) => i.status === 'Allocated');
    const hasReady = g.items.some((i: any) => i.status === 'Ready');
    const allDelivered = g.items.every((i: any) => i.status === 'Delivered');
    const allCancelled = g.items.every((i: any) => i.status === 'Cancelled');
    const allFinalized = g.items.every((i: any) => i.status === 'Delivered' || i.status === 'Cancelled');

    if (allDelivered) g.status = 'Delivered';
    else if (allCancelled) g.status = 'Cancelled';
    else if (allFinalized) g.status = 'Delivered';
    else if (hasAllocated) g.status = 'Allocated';
    else if (hasReady) g.status = 'Ready';
    else g.status = 'Pending';

    return g;
  }).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Filter by tab
  const tabFiltered = tab === 'All'
    ? groupedList
    : groupedList.filter(g => g.status === tab);

  // Filter by search
  const filtered = tabFiltered.filter(g =>
    g.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    g.customer_phone.includes(search) ||
    g.booking_number.toLowerCase().includes(search.toLowerCase()) ||
    g.items.some((i: any) => getPlantName(i.plant_id).toLowerCase().includes(search.toLowerCase()))
  );

  // Count per tab
  const counts: Record<TabStatus, number> = {
    All: groupedList.length,
    Pending: groupedList.filter(g => g.status === 'Pending').length,
    Allocated: groupedList.filter(g => g.status === 'Allocated').length,
    Ready: groupedList.filter(g => g.status === 'Ready').length,
    Delivered: groupedList.filter(g => g.status === 'Delivered').length,
    Cancelled: groupedList.filter(g => g.status === 'Cancelled').length,
  };

  async function cancelBookingRow(id: string) {
    if (!navigator.onLine) { alert('You must be online to save.'); return; }
    if (!confirm(t('cancelItemConfirm'))) return;
    setActionLoading(`cancel_${id}`);
    try {
      const { data: row } = await supabase.from('bookings').select('booking_number').eq('id', id).maybeSingle();
      if (!row) return;

      const res = await serverCancelBooking({ bookingNumber: row.booking_number });
      if (!res?.success) {
        alert(res?.error || 'Failed to cancel booking');
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['allotments'] });
      queryClient.invalidateQueries({ queryKey: ['vw_inventory_status'] });
      queryClient.invalidateQueries({ queryKey: ['vw_booking_status'] });
      queryClient.invalidateQueries({ queryKey: ['vw_daily_cashbook'] });
      queryClient.invalidateQueries({ queryKey: ['vw_profit_summary'] });
    } catch (err: any) {
      console.error(err);
      alert('Failed to cancel booking: ' + (err.message || ''));
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-2 pb-1 w-max">
          {TABS.map(tabStatus => (
            <button
              key={tabStatus}
              onClick={() => setTab(tabStatus)}
              className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all active:scale-95 border
                ${tab === tabStatus
                  ? `${TAB_ACTIVE[tabStatus]} border-transparent shadow-md`
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }
              `}
            >
              {t(tabStatus.toLowerCase() as any)}
              {counts[tabStatus] > 0 && (
                <span className={`ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded-full
                  ${tab === tabStatus ? 'bg-white/30 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {counts[tabStatus]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Search & Export */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('search')}
            className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-800 shadow-sm"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-4 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-2xl font-bold transition-all"
            title={t('exportExcel')}
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span className="hidden sm:inline">{t('exportExcel')}</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-4 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded-2xl font-bold transition-all"
            title={t('exportPDF')}
          >
            <FileText className="w-5 h-5" />
            <span className="hidden sm:inline">{t('exportPDF')}</span>
          </button>
        </div>
      </div>

      {/* Booking cards */}
      <div className="space-y-4">
        {filtered.length === 0 && (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200">
            <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold">{t('noBookingsFound')}</p>
          </div>
        )}

        {filtered.map(grp => {
          const isDelivering = actionLoading === `deliver_${grp.booking_number}`;
          const statusCfg = STATUS_COLORS[grp.status] || 'bg-gray-100 text-gray-600 border-gray-200';

          return (
            <div key={grp.booking_number} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Header */}
              <div className="p-5 border-b border-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-xl text-gray-900 truncate">{grp.customer_name}</h3>
                    <div className="flex items-center flex-wrap gap-2 mt-1.5">
                      <span className="flex items-center gap-1 text-xs font-bold text-gray-500">
                        <Phone className="w-3 h-3" /> {grp.customer_phone}
                      </span>
                      {grp.city && (
                        <span className="flex items-center gap-1 text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          <MapPin className="w-3 h-3" /> {grp.city}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-3 flex flex-col items-end gap-1.5">
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl border ${statusCfg}`}>
                      {t(grp.status.toLowerCase() as any)}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
                      {grp.booking_number}
                    </span>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="px-5 py-4 space-y-2">
                {grp.items.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-center text-sm">
                    <span className="font-semibold text-gray-700 flex flex-wrap items-center gap-2">
                      <span>{item.quantity} × {getPlantName(item.plant_id)}</span>
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {getLotNumber(item.lot_id)}
                      </span>
                      {item.status === 'Delivered' && (
                        <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wide">{t('delivered')}</span>
                      )}
                      {item.status === 'Cancelled' && (
                        <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wide">{t('cancelled')}</span>
                      )}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-900">₹{item.total_amount}</span>
                      {role === 'owner' && !['Delivered', 'Cancelled'].includes(item.status) && (
                        <button
                          onClick={() => cancelBookingRow(item.id)}
                          disabled={actionLoading === `cancel_${item.id}`}
                          className="text-red-400 hover:text-red-600 p-1"
                          title={t('cancelItem')}
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Financial summary */}
              <div className="mx-5 mb-4 bg-blue-50 rounded-2xl p-4 border border-blue-100">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">{t('stock')}</p>
                    <p className="font-black text-blue-900">₹{grp.total_amount.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">{t('advancePaid')}</p>
                    <p className="font-black text-blue-700">₹{grp.advance_paid.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">{t('balance')}</p>
                    <p className={`font-black ${grp.balance > 0 ? 'text-red-600' : grp.balance < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                      ₹{grp.balance.toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              {!['Delivered', 'Cancelled'].includes(grp.status) && (
                <div className="px-5 pb-5 flex gap-2">
                  <a
                    href={`/bookings/${grp.booking_number}/edit`}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200 font-black text-sm active:scale-95 transition-all"
                  >
                    <Pencil className="w-4 h-4 text-gray-600" />
                    {t('editOrder')}
                  </a>
                  <a href="/fulfillment" className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-black text-sm shadow-md active:scale-95 transition-all"> <Truck className="w-4 h-4" /> {t('deliverOrder')} </a>
                </div>
              )}

              {grp.status === 'Delivered' && (
                <div className="mx-5 mb-5 flex items-center gap-2 text-green-700 bg-green-50 border border-green-100 rounded-2xl px-4 py-3">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-bold">
                    {t('deliveredOn')} {grp.items[0]?.delivery_date
                      ? new Date(grp.items[0].delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
