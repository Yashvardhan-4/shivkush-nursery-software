'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { serverCancelBooking } from '@/lib/actions/finance';
import {
  Search,
  Phone,
  MapPin,
  Package,
  Truck,
  XCircle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Pencil,
  BookOpen,
  Calendar,
  Clock,
  Plus,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { exportToExcel, exportToPDF } from '@/lib/exportUtils';
import Link from 'next/link';

type TabStatus = 'Active' | 'Delivered' | 'Cancelled' | 'All';

interface BookingListProps {
  role: string;
  userId: string;
  userName: string;
}

export default function BookingList({ role, userId, userName }: BookingListProps) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<TabStatus>('Active');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ['bookings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
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

  const { data: vwBookingStatus = [] } = useQuery({
    queryKey: ['vw_booking_status'],
    queryFn: async () => {
      const { data } = await supabase.from('vw_booking_status').select('*');
      return data || [];
    }
  });

  const getPlantName = (id: string) => {
    const p = plants.find((x: any) => x.id === id);
    if (!p) return 'रोप';
    return p.variety ? `${p.plant_name} - ${p.variety}` : p.plant_name;
  };

  // Group individual booking items by booking_number (Paawati / Slip)
  const grouped = bookings.reduce((acc: any, curr: any) => {
    const num = curr.booking_number;
    if (!acc[num]) {
      acc[num] = {
        booking_number: num,
        customer_name: curr.customer_name,
        customer_phone: curr.customer_phone,
        city: curr.city,
        booking_date: curr.booking_date,
        delivery_date: curr.delivery_date,
        status: curr.status,
        total_amount: 0,
        advance_paid: 0,
        balance: 0,
        items: [] as any[],
        created_at: curr.created_at || curr.booking_date
      };
    }
    acc[num].items.push(curr);

    const statusRow = vwBookingStatus?.find((v: any) => v.booking_id === curr.id);

    acc[num].total_amount += Number(curr.total_amount || 0);
    acc[num].advance_paid += statusRow
      ? Number(statusRow.advance_paid)
      : Number(curr.advance_paid || 0);
    acc[num].balance += statusRow
      ? Number(statusRow.outstanding_balance)
      : (Number(curr.total_amount || 0) - Number(curr.advance_paid || 0));

    // If any item has a delivery date, keep track
    if (curr.delivery_date && !acc[num].delivery_date) {
      acc[num].delivery_date = curr.delivery_date;
    }

    return acc;
  }, {});

  const groupedList: any[] = Object.values(grouped).map((g: any) => {
    const allDelivered = g.items.every((i: any) => i.status === 'Delivered');
    const allCancelled = g.items.every((i: any) => i.status === 'Cancelled');
    const allFinalized = g.items.every((i: any) => i.status === 'Delivered' || i.status === 'Cancelled');

    if (allDelivered) g.status = 'Delivered';
    else if (allCancelled) g.status = 'Cancelled';
    else if (allFinalized) g.status = 'Delivered';
    else g.status = 'Pending';

    return g;
  }).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Filter by Tab
  const tabFiltered = groupedList.filter((g: any) => {
    if (tab === 'Active') return g.status !== 'Delivered' && g.status !== 'Cancelled';
    if (tab === 'Delivered') return g.status === 'Delivered';
    if (tab === 'Cancelled') return g.status === 'Cancelled';
    return true; // All
  });

  // Filter by Search
  const filtered = tabFiltered.filter((g: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const matchName = g.customer_name?.toLowerCase().includes(q);
    const matchPhone = g.customer_phone?.includes(q);
    const matchCity = g.city?.toLowerCase().includes(q);
    const matchNum = g.booking_number?.toLowerCase().includes(q);
    const matchPlant = g.items.some((i: any) =>
      getPlantName(i.plant_id).toLowerCase().includes(q)
    );
    return matchName || matchPhone || matchCity || matchNum || matchPlant;
  });

  // Ledger Summary Totals
  const totalActiveBookings = groupedList.filter(
    (g: any) => g.status !== 'Delivered' && g.status !== 'Cancelled'
  ).length;

  const totalPendingPlants = groupedList
    .filter((g: any) => g.status !== 'Delivered' && g.status !== 'Cancelled')
    .reduce((sum: number, g: any) => {
      return (
        sum +
        g.items
          .filter((i: any) => i.status !== 'Delivered' && i.status !== 'Cancelled')
          .reduce((s: number, i: any) => s + Number(i.quantity || 0), 0)
      );
    }, 0);

  const totalOutstandingBalance = groupedList
    .filter((g: any) => g.status !== 'Delivered' && g.status !== 'Cancelled')
    .reduce((sum: number, g: any) => sum + Math.max(0, g.balance), 0);

  // Tab Counts
  const counts = {
    Active: groupedList.filter((g: any) => g.status !== 'Delivered' && g.status !== 'Cancelled').length,
    Delivered: groupedList.filter((g: any) => g.status === 'Delivered').length,
    Cancelled: groupedList.filter((g: any) => g.status === 'Cancelled').length,
    All: groupedList.length
  };

  const cancelBookingRow = async (id: string) => {
    if (!navigator.onLine) {
      alert('You must be online to save.');
      return;
    }
    if (!confirm('ही बुकिंग नोंद रद्द करायची आहे का? (Cancel booking?)')) return;
    setActionLoading(`cancel_${id}`);
    try {
      const { data: row } = await supabase
        .from('bookings')
        .select('booking_number')
        .eq('id', id)
        .maybeSingle();
      if (!row) return;

      const res = await serverCancelBooking({ bookingNumber: row.booking_number });
      if (!res?.success) {
        alert(res?.error || 'Failed to cancel booking');
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['vw_inventory_status'] });
      queryClient.invalidateQueries({ queryKey: ['vw_booking_status'] });
      queryClient.invalidateQueries({ queryKey: ['vw_daily_cashbook'] });
      queryClient.invalidateQueries({ queryKey: ['vw_profit_summary'] });
    } catch (err: any) {
      console.error(err);
      alert('Failed to cancel: ' + (err.message || ''));
    } finally {
      setActionLoading(null);
    }
  };

  const handleExportExcel = () => {
    if (!filtered || filtered.length === 0) return;
    const data = filtered.map(g => ({
      'पावती क्र. (Slip No)': g.booking_number,
      'ग्राहक नाव (Customer)': g.customer_name,
      'फोन (Phone)': g.customer_phone,
      'गाव / शहर (City)': g.city || '',
      'स्थिती (Status)': g.status,
      'रोपे (Items)': g.items.map((i: any) => `${i.quantity} x ${getPlantName(i.plant_id)}`).join(', '),
      'एकूण बिल (Total)': g.total_amount,
      'जमा अॅडव्हान्स (Advance)': g.advance_paid,
      'बाकी येणे (Balance)': g.balance,
      'नोंद दिनांक (Date)': new Date(g.created_at).toLocaleDateString()
    }));
    exportToExcel(data, 'Shivkush_Nursery_Bookings_Register');
  };

  const handleExportPDF = () => {
    if (!filtered || filtered.length === 0) return;
    const data = filtered.map(g => ({
      bookingNo: g.booking_number,
      customer: `${g.customer_name} (${g.customer_phone})`,
      city: g.city || '',
      items: g.items.map((i: any) => `${i.quantity} x ${getPlantName(i.plant_id)}`).join(', '),
      total: `₹${g.total_amount}`,
      advance: `₹${g.advance_paid}`,
      balance: `₹${g.balance}`
    }));
    const columns = [
      { header: 'Slip No', dataKey: 'bookingNo' },
      { header: 'Customer', dataKey: 'customer' },
      { header: 'Village', dataKey: 'city' },
      { header: 'Items', dataKey: 'items' },
      { header: 'Total', dataKey: 'total' },
      { header: 'Advance', dataKey: 'advance' },
      { header: 'Balance Due', dataKey: 'balance' }
    ];
    exportToPDF(data, 'Shivkush_Bookings_Register', 'Shivkush Nursery - Bookings Register', columns);
  };

  if (bookingsLoading || plantsLoading) {
    return (
      <div className="p-16 text-center text-gray-500 font-bold flex flex-col items-center gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
        नोंदवही लोड होत आहे (Loading Register)...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Physical Register Summary Bar (नोंदवही हिशोब पट्टी) */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-amber-50/80 border-2 border-amber-200 rounded-2xl p-4 shadow-sm text-center">
          <p className="text-[11px] font-black uppercase text-amber-800 tracking-wider">
            द्यायची बाकी ऑर्डर्स
          </p>
          <p className="text-2xl sm:text-3xl font-black text-amber-900 mt-1">
            {totalActiveBookings}
          </p>
          <p className="text-[10px] font-bold text-amber-700">बुकिंग पावती</p>
        </div>

        <div className="bg-blue-50/80 border-2 border-blue-200 rounded-2xl p-4 shadow-sm text-center">
          <p className="text-[11px] font-black uppercase text-blue-800 tracking-wider">
            द्यायची बाकी रोपे
          </p>
          <p className="text-2xl sm:text-3xl font-black text-blue-900 mt-1">
            {totalPendingPlants.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] font-bold text-blue-700">एकूण झाडे</p>
        </div>

        <div className="bg-red-50/80 border-2 border-red-200 rounded-2xl p-4 shadow-sm text-center">
          <p className="text-[11px] font-black uppercase text-red-800 tracking-wider">
            एकूण बाकी येणे
          </p>
          <p className="text-2xl sm:text-3xl font-black text-red-700 mt-1">
            ₹{totalOutstandingBalance.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] font-bold text-red-600">शिल्लक रक्कम</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 p-1.5 rounded-2xl gap-1 overflow-x-auto">
        {(['Active', 'Delivered', 'Cancelled', 'All'] as TabStatus[]).map(tStatus => {
          const isActive = tab === tStatus;
          return (
            <button
              key={tStatus}
              type="button"
              onClick={() => setTab(tStatus)}
              className={`flex-1 min-w-[100px] py-3 px-3 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tStatus === 'Active' && 'द्यायचे बाकी (Active)'}
              {tStatus === 'Delivered' && 'दिलेले (Delivered)'}
              {tStatus === 'Cancelled' && 'रद्द (Cancelled)'}
              {tStatus === 'All' && 'सर्व (All)'}
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  isActive ? 'bg-white/30 text-white' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {counts[tStatus]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search & Export Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ग्राहकाचे नाव, मोबाईल किंवा रोपाचे नाव शोधा..."
            className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-800 shadow-sm"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-3.5 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-2xl font-bold transition-all text-xs"
            title="Excel डाउनलोड करा"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden sm:inline">Excel</span>
          </button>
          <button
            type="button"
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-3.5 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded-2xl font-bold transition-all text-xs"
            title="PDF डाउनलोड करा"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">PDF</span>
          </button>
        </div>
      </div>

      {/* Physical Notebook Register Ledger (नोंदवही पावती यादी) */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border-2 border-dashed border-gray-200 space-y-2">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto" />
            <h4 className="font-black text-gray-700 text-lg">कोणतीही बुकिंग नोंद सापडली नाही</h4>
            <p className="text-xs text-gray-400">नवीन बुकिंग करण्यासाठी वरील + Book बटण दाबा</p>
          </div>
        ) : (
          filtered.map(slip => {
            const isDelivered = slip.status === 'Delivered';
            const isCancelled = slip.status === 'Cancelled';
            const isPending = !isDelivered && !isCancelled;
            const hasDeliveryDate = Boolean(slip.delivery_date);

            return (
              <div
                key={slip.booking_number}
                className={`bg-white rounded-3xl shadow-sm border-2 transition-shadow overflow-hidden ${
                  isDelivered
                    ? 'border-gray-200 bg-gray-50/40 opacity-90'
                    : isCancelled
                    ? 'border-red-200 bg-red-50/20'
                    : 'border-blue-200 hover:shadow-md'
                }`}
              >
                {/* Ledger Header Slip Line */}
                <div
                  className={`p-4 sm:p-5 border-b flex flex-wrap items-start justify-between gap-3 ${
                    isDelivered
                      ? 'bg-gray-100/70 border-gray-200'
                      : isCancelled
                      ? 'bg-red-50 border-red-100'
                      : 'bg-blue-50/70 border-blue-100'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-black bg-white border border-gray-200 text-gray-900 shadow-2xs">
                        #{slip.booking_number}
                      </span>
                      <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(slip.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </span>

                      {/* Delivery Status Tag */}
                      {isDelivered && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-green-100 text-green-800 border border-green-200">
                          ✅ रोपे दिली (Delivered)
                        </span>
                      )}
                      {isCancelled && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-red-100 text-red-800 border border-red-200">
                          ❌ रद्द (Cancelled)
                        </span>
                      )}
                      {isPending && hasDeliveryDate && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-200">
                          📅 तारीख: {new Date(slip.delivery_date).toLocaleDateString('en-IN')}
                        </span>
                      )}
                      {isPending && !hasDeliveryDate && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                          📞 तयार झाल्यावर कळवणे (Open Delivery)
                        </span>
                      )}
                    </div>

                    {/* Customer Info (Big high-contrast text) */}
                    <div className="mt-2.5">
                      <h3 className="text-xl font-black text-gray-900 tracking-tight">
                        {slip.customer_name}
                      </h3>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {slip.customer_phone && (
                          <a
                            href={`tel:${slip.customer_phone}`}
                            className="inline-flex items-center gap-1 text-sm font-black text-blue-700 bg-white px-2.5 py-0.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            {slip.customer_phone}
                          </a>
                        )}
                        {slip.city && (
                          <span className="text-xs font-bold text-gray-600 flex items-center gap-1 bg-white px-2.5 py-0.5 rounded-lg border border-gray-200">
                            <MapPin className="w-3 h-3 text-gray-400" />
                            गाव: {slip.city}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Financial Balance Due Strip */}
                  <div className="text-right">
                    <span className="text-[11px] font-black uppercase text-gray-400 tracking-wider block">
                      बाकी येणे (Balance Due)
                    </span>
                    <span
                      className={`text-2xl font-black block tracking-tight ${
                        slip.balance > 0
                          ? 'text-red-600'
                          : slip.balance < 0
                          ? 'text-blue-600'
                          : 'text-green-600'
                      }`}
                    >
                      ₹{slip.balance.toLocaleString('en-IN')}
                    </span>
                    <span className="text-xs font-bold text-gray-500 block">
                      एकूण ₹{slip.total_amount} • अॅडव्हान्स ₹{slip.advance_paid}
                    </span>
                  </div>
                </div>

                {/* Ordered Plants Ruled Ledger Section */}
                <div className="p-4 sm:p-5 bg-white space-y-3">
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider">
                    नोंदवलेली रोपे (Booked Plants):
                  </p>
                  <div className="space-y-2">
                    {slip.items.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex justify-between items-center p-3 rounded-2xl bg-gray-50/80 border border-gray-100"
                      >
                        <div>
                          <p className="font-black text-gray-900 text-base">
                            {getPlantName(item.plant_id)}
                          </p>
                          <p className="text-xs font-bold text-gray-400">
                            दर: ₹{(item.total_amount / (item.quantity || 1)).toFixed(2)} प्रति रोप
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-black text-blue-900 bg-blue-50 px-3 py-1 rounded-xl border border-blue-100">
                            {item.quantity} रोपे
                          </span>
                          <span className="text-sm font-black text-gray-800">
                            ₹{item.total_amount}
                          </span>
                          {role === 'owner' && isPending && (
                            <button
                              type="button"
                              onClick={() => cancelBookingRow(item.id)}
                              disabled={actionLoading === `cancel_${item.id}`}
                              className="text-red-400 hover:text-red-600 p-1"
                              title="नोंद रद्द करा"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tactile Action Strip (Available for both Owner and Workers) */}
                <div className="p-4 sm:p-5 pt-0 flex flex-wrap gap-2.5">
                  {isPending && (
                    <a
                      href={`/fulfillment?bookingNumber=${slip.booking_number}`}
                      className="flex-1 py-3.5 bg-green-600 hover:bg-green-700 text-white font-black text-base rounded-2xl flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all text-center"
                    >
                      <Truck className="w-5 h-5 stroke-[2.5]" />
                      रोपे देणे व बाकी जमा (Deliver & Collect Balance)
                    </a>
                  )}

                  <a
                    href={`/bookings/${slip.booking_number}/edit`}
                    className="px-4 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-1.5 border border-gray-200 active:scale-95 transition-all"
                  >
                    <Pencil className="w-4 h-4" />
                    बदल (Edit)
                  </a>

                  {isDelivered && (
                    <div className="flex items-center gap-1.5 text-xs font-black text-green-800 bg-green-50 border border-green-200 px-4 py-3 rounded-2xl flex-1">
                      <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                      वितरण पूर्ण झाले आहे
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
