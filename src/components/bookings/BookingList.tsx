'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logAudit, generateId, toLocalDateStr } from '@/lib/utils';
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

  const [deliveryModal, setDeliveryModal] = useState<{
    bookingNumber: string;
    customerName: string;
    balance: number;
    advance_paid: number;
    items: any[];
  } | null>(null);
  const [deliveryQtys, setDeliveryQtys] = useState<Record<string, number>>({});
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Split'>('Cash');
  const [splitAmounts, setSplitAmounts] = useState({ cash: '', upi: '' });
  const [deliveryRemarks, setDeliveryRemarks] = useState('');


  const queryClient = useQueryClient();

  const { data: bookings } = useQuery({ queryKey: ['bookings'], queryFn: async () => { const { data } = await supabase.from('bookings').select('*').is('deleted_at', null).order('created_at', { ascending: false }); return data || []; } });
  const { data: plants } = useQuery({ queryKey: ['plants'], queryFn: async () => { const { data } = await supabase.from('plants').select('*').is('deleted_at', null); return data || []; } });
  const { data: lots } = useQuery({ queryKey: ['lots'], queryFn: async () => { const { data } = await supabase.from('lots').select('*').is('deleted_at', null); return data || []; } });
  const { data: allotments } = useQuery({ queryKey: ['allotments'], queryFn: async () => { const { data } = await supabase.from('allotments').select('*').is('deleted_at', null); return data || []; } });
  const { data: direct_sales } = useQuery({ queryKey: ['direct_sales'], queryFn: async () => { const { data } = await supabase.from('direct_sales').select('*').is('deleted_at', null); return data || []; } });

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
    acc[curr.booking_number].total_amount += curr.total_amount;
    acc[curr.booking_number].advance_paid += curr.advance_paid;
    acc[curr.booking_number].balance =
      acc[curr.booking_number].total_amount - acc[curr.booking_number].advance_paid;
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
      const { data: row } = await supabase.from('bookings').select('*').eq('id', id).maybeSingle();
      if (!row) return;

      await supabase.from('bookings').update({ status: 'Cancelled' }).eq('id', row.id);

      const { data: rowAllotments } = await supabase.from('allotments').select('*').eq('booking_id', id).is('deleted_at', null);
      if (rowAllotments && rowAllotments.length > 0) {
        const deletedAt = new Date().toISOString();
        const allotIds = rowAllotments.map(a => a.id);
        await supabase.from('allotments').update({ deleted_at: deletedAt }).in('id', allotIds);
      }

      await logAudit(userId, userName, 'CANCEL_BOOKING', 'bookings', row.id, {
        booking_number: row.booking_number,
        customer_name: row.customer_name,
      });

      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['allotments'] });
    } finally {
      setActionLoading(null);
    }
  }


  function openDeliveryModal(grp: any) {
    const pendingItems = grp.items.filter((i: any) => i.status !== 'Delivered' && i.status !== 'Cancelled');
    const availableAdvance = pendingItems.reduce((sum: number, i: any) => sum + (i.advance_paid || 0), 0);
    setDeliveryModal({
      bookingNumber: grp.booking_number,
      customerName: grp.customer_name,
      balance: grp.balance,
      advance_paid: availableAdvance,
      items: pendingItems,
    });
    
    const initialQtys: Record<string, number> = {};
    pendingItems.forEach((item: any) => {
      initialQtys[item.id] = item.quantity;
    });
    setDeliveryQtys(initialQtys);

    setPaymentMode('Cash');
    setSplitAmounts({ cash: '', upi: '' });
    setDeliveryRemarks('');
  }

  async function confirmDelivery() {
    if (!navigator.onLine) { alert('You must be online to save.'); return; }
    if (!deliveryModal) return;
    const { bookingNumber, items } = deliveryModal;
    setActionLoading(`deliver_${bookingNumber}`);
    setDeliveryModal(null);

    try {
      const dbPendingItems = items.filter((i: any) => i.status !== 'Delivered' && i.status !== 'Cancelled');
      const availableAdvance = dbPendingItems.reduce((sum: number, i: any) => sum + (i.advance_paid || 0), 0);
      const availableCashAdvance = dbPendingItems.reduce((sum: number, i: any) => sum + (i.advance_cash_amount || 0), 0);
      const availableUpiAdvance = dbPendingItems.reduce((sum: number, i: any) => sum + (i.advance_upi_amount || 0), 0);

      // 1. Determine total delivery value
      let deliveryValue = 0;
      items.forEach((item: any) => {
        const deliverQty = deliveryQtys[item.id] || 0;
        const unitPrice = item.total_amount / item.quantity;
        deliveryValue += deliverQty * unitPrice;
      });

      const advanceToUse = Math.min(availableAdvance, deliveryValue);
      const targetCollection = deliveryValue - advanceToUse;

      // 2. Compute final payment
      let finalPaymentMode = paymentMode as string;
      const splitTotal = (parseFloat(splitAmounts.cash) || 0) + (parseFloat(splitAmounts.upi) || 0);
      if (paymentMode === 'Split') {
        finalPaymentMode = `Split (Cash: ₹${splitAmounts.cash || 0}, UPI: ₹${splitAmounts.upi || 0})`;
      }
      const amountCollectedNow = paymentMode === 'Split' ? splitTotal : targetCollection;

      const todayStr = toLocalDateStr();
      const { data: rows } = await supabase.from('bookings').select('*').eq('booking_number', bookingNumber).is('deleted_at', null);

      const newlyProcessedRows: any[] = [];
      const remarksToAppend = deliveryRemarks.trim();

      for (const row of (rows || [])) {
        if (row.status === 'Delivered' || row.status === 'Cancelled') {
           continue; 
        }
        
        const deliverQty = deliveryQtys[row.id] || 0;
        const totalQty = row.quantity;

        if (deliverQty === 0) {
           newlyProcessedRows.push(row);
           continue;
        }

        const unitPrice = row.total_amount / totalQty;
        
        const updatedRemarks = remarksToAppend 
          ? (row.remarks ? row.remarks + '\\nDelivery Note: ' + remarksToAppend : 'Delivery Note: ' + remarksToAppend)
          : (row.remarks || null);

        if (deliverQty === totalQty) {
           const updated = { ...row, status: 'Delivered', delivery_date: todayStr, remarks: updatedRemarks, worker_id: userId };
           newlyProcessedRows.push(updated);
           
           await supabase.from('bookings').update({ status: 'Delivered', delivery_date: todayStr, remarks: updatedRemarks, worker_id: userId }).eq('id', row.id);
           

           await logAudit(userId, userName, 'DELIVER_BOOKING', 'bookings', row.id, { booking_number: row.booking_number, quantity: totalQty });
        } else {
           const deliveredAmount = deliverQty * unitPrice;
           const remainingQty = totalQty - deliverQty;
           const remainingAmount = row.total_amount - deliveredAmount;

           const updatedDelivered = { ...row, quantity: deliverQty, total_amount: deliveredAmount, status: 'Delivered', delivery_date: todayStr, remarks: updatedRemarks, worker_id: userId };
           newlyProcessedRows.push(updatedDelivered);
           
           const newPendingId = generateId();
           const newPending = { ...row, id: newPendingId, quantity: remainingQty, total_amount: remainingAmount, status: (row.status === 'Ready' || row.status === 'Allocated') ? row.status : 'Pending' };
           newlyProcessedRows.push(newPending);

           await supabase.from('bookings').update({ quantity: deliverQty, total_amount: deliveredAmount, status: 'Delivered', delivery_date: todayStr, remarks: updatedRemarks, worker_id: userId }).eq('id', row.id);
           

           await logAudit(userId, userName, 'DELIVER_BOOKING', 'bookings', row.id, { booking_number: row.booking_number, quantity: deliverQty });
           
           await supabase.from('bookings').insert(newPending);

           const { data: rowAllotments } = await supabase.from('allotments').select('*').eq('booking_id', row.id).is('deleted_at', null);
           let qtyToMove = remainingQty;
           
           for (const a of (rowAllotments || [])) {
             if (qtyToMove <= 0) break;
             if (a.quantity <= qtyToMove) {
               qtyToMove -= a.quantity;
               await supabase.from('allotments').update({ booking_id: newPendingId }).eq('id', a.id);
             } else {
               const leftoverDeliveredQty = a.quantity - qtyToMove;
               const movedQty = qtyToMove;
               qtyToMove = 0;
               await supabase.from('allotments').update({ quantity: leftoverDeliveredQty }).eq('id', a.id);
               const newAId = generateId();
               const newA = { ...a, id: newAId, booking_id: newPendingId, quantity: movedQty };
               await supabase.from('allotments').insert(newA);
             }
           }
        }
      }

      newlyProcessedRows.sort((a, b) => (a.status === 'Delivered' ? -1 : 1));
      let remainingAdvance = availableAdvance;
      let remainingCashAdvance = availableCashAdvance;
      let remainingUpiAdvance = availableUpiAdvance;
      
      for (const fRow of newlyProcessedRows) {
         let rowAdvance = 0;
         if (remainingAdvance >= fRow.total_amount) {
            rowAdvance = fRow.total_amount;
            remainingAdvance -= fRow.total_amount;
         } else {
            rowAdvance = remainingAdvance;
            remainingAdvance = 0;
         }

         let rowCashAdvance = 0;
         let rowUpiAdvance = 0;
         if (rowAdvance > 0) {
             if (remainingCashAdvance >= rowAdvance) {
                 rowCashAdvance = rowAdvance;
                 remainingCashAdvance -= rowAdvance;
             } else {
                 rowCashAdvance = remainingCashAdvance;
                 remainingCashAdvance = 0;
                 rowUpiAdvance = Math.min(rowAdvance - rowCashAdvance, remainingUpiAdvance);
                 remainingUpiAdvance -= rowUpiAdvance;
             }
         }

         if (fRow.advance_paid !== rowAdvance || fRow.advance_cash_amount !== rowCashAdvance || fRow.advance_upi_amount !== rowUpiAdvance) {
            fRow.advance_paid = rowAdvance;
            fRow.advance_cash_amount = rowCashAdvance > 0 ? rowCashAdvance : null;
            fRow.advance_upi_amount = rowUpiAdvance > 0 ? rowUpiAdvance : null;
            if (rowAdvance > 0) {
                fRow.advance_payment_mode = (rowCashAdvance > 0 && rowUpiAdvance > 0) ? 'Split' : (rowUpiAdvance > 0 ? 'UPI' : 'Cash');
            } else {
                fRow.advance_payment_mode = null;
            }

            await supabase.from('bookings').update({ 
               advance_paid: fRow.advance_paid,
               advance_cash_amount: fRow.advance_cash_amount,
               advance_upi_amount: fRow.advance_upi_amount,
               advance_payment_mode: fRow.advance_payment_mode
            }).eq('id', fRow.id);
         }
      }

      const cashPool = paymentMode === 'Cash' ? targetCollection : paymentMode === 'UPI' ? 0 : parseFloat(splitAmounts.cash) || 0;
      const upiPool = paymentMode === 'UPI' ? targetCollection : paymentMode === 'Cash' ? 0 : parseFloat(splitAmounts.upi) || 0;
      let remainingCash = cashPool;
      let remainingUpi = upiPool;

      for (const fRow of newlyProcessedRows) {
         if (fRow.status === 'Delivered' && fRow.delivery_date === todayStr && !fRow.payment_mode) {
            const rowBalance = Math.max(0, fRow.total_amount - fRow.advance_paid);
            let rCash = 0;
            let rUpi = 0;
            if (rowBalance > 0) {
               if (remainingCash >= rowBalance) {
                  rCash = rowBalance;
                  remainingCash -= rowBalance;
               } else {
                  rCash = remainingCash;
                  remainingCash = 0;
                  rUpi = Math.min(rowBalance - rCash, remainingUpi);
                  remainingUpi -= rUpi;
               }
            }
            const rowPayMode = (rCash > 0 && rUpi > 0) ? 'Split' : (rUpi > 0 ? 'UPI' : 'Cash');
            
            fRow.payment_mode = rowPayMode;
            fRow.cash_amount = rCash;
            fRow.upi_amount = rUpi;
            await supabase.from('bookings').update({ payment_mode: rowPayMode, cash_amount: rCash, upi_amount: rUpi }).eq('id', fRow.id);
         }
      }

      if (targetCollection > 0 && newlyProcessedRows.length > 0) {
        await supabase.from('transactions').insert({
          reference_type: 'BOOKING_DELIVERY',
          reference_id: newlyProcessedRows[0].id,
          booking_number: bookingNumber,
          customer_name: deliveryModal.customerName,
          plant_names: 'Multiple Plants',
          amount: targetCollection,
          payment_mode: paymentMode === 'Split' ? 'Split' : paymentMode,
          cash_amount: paymentMode === 'Split' ? (parseFloat(splitAmounts.cash) || 0) : (paymentMode === 'Cash' ? targetCollection : 0),
          upi_amount: paymentMode === 'Split' ? (parseFloat(splitAmounts.upi) || 0) : (paymentMode === 'UPI' ? targetCollection : 0),
          worker_id: userId,
          created_at: new Date().toISOString()
        });
      }

      if (direct_sales && allotments && lots && bookings) {
         const deliveredLots = new Set(newlyProcessedRows.filter(r => r.status === 'Delivered' && r.lot_id).map(r => r.lot_id));
         for (const lId of deliveredLots) {
             const lot = lots.find((l: any) => l.id === lId);
             if (lot && lot.status !== 'Completed') {
                const activeBookingIds = new Set(
                  bookings.filter((b: any) => b.plant_id === lot.plant_id && b.status !== 'Delivered' && b.status !== 'Cancelled').map((b: any) => b.id)
                );
                const allottedQty = allotments.filter((a: any) => a.lot_id === lId && activeBookingIds.has(a.booking_id)).reduce((s: number,a: any) => s + a.quantity, 0);
                const deliveredQty = bookings.filter((b: any) => b.lot_id === lId && b.status === 'Delivered').reduce((s: number,b: any) => s + b.quantity, 0);
                const salesQty = direct_sales.filter((s: any) => s.lot_id === lId).reduce((s: number, sale: any) => s + sale.quantity, 0);
                const freeStock = (lot.available_stock ?? lot.total_quantity) - allottedQty - deliveredQty - salesQty;
                
                if (freeStock <= 0) {
                   await supabase.from('lots').update({ status: 'Completed' }).eq('id', lId);
                }
             }
         }
      }

      await logAudit(userId, userName, 'DELIVER_BOOKING', 'bookings', bookingNumber, {
         customer_name: deliveryModal.customerName,
         payment_mode: finalPaymentMode,
         amount_collected: amountCollectedNow
      });

      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['lots'] });
      queryClient.invalidateQueries({ queryKey: ['allotments'] });

    } finally {
      setActionLoading(null);
    }
  }

  // Calculate dynamic modal values
  const currentDeliveryValue = deliveryModal ? deliveryModal.items.reduce((sum, item) => {
    const qty = deliveryQtys[item.id] || 0;
    return sum + (qty * (item.total_amount / item.quantity));
  }, 0) : 0;
  
  const uiAvailableAdvance = deliveryModal ? deliveryModal.items.filter((i: any) => i.status !== 'Delivered' && i.status !== 'Cancelled').reduce((sum: number, i: any) => sum + (i.advance_paid || 0), 0) : 0;
  const advanceToUse = deliveryModal ? Math.min(uiAvailableAdvance, currentDeliveryValue) : 0;
  const targetCollection = currentDeliveryValue - advanceToUse;

  const splitTotal = (parseFloat(splitAmounts.cash) || 0) + (parseFloat(splitAmounts.upi) || 0);
  const isValidSplit = !deliveryModal || paymentMode !== 'Split' || (paymentMode === 'Split' && Math.abs(splitTotal - targetCollection) < 0.01);

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
                  <button
                    onClick={() => openDeliveryModal(grp)}
                    disabled={isDelivering}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-600 text-white font-black text-sm shadow-md active:scale-95 transition-all disabled:opacity-60"
                  >
                    <Truck className="w-4 h-4" />
                    {isDelivering ? t('marking') : t('deliverOrder')}
                  </button>
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

      {/* Delivery Modal */}
      {deliveryModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-gray-900">{t('confirmDelivery')}</h3>
              <button onClick={() => setDeliveryModal(null)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:text-gray-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-6 space-y-4">
              <div className="bg-blue-50 text-blue-900 p-4 rounded-2xl border border-blue-100 mb-4">
                <p className="text-sm font-semibold mb-1">{t('customerName')}: {deliveryModal.customerName}</p>
                <div className="flex justify-between items-end mt-2">
                  <div>
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">{t('bookingAdvance')}</p>
                    <p className="text-xl font-black">₹{deliveryModal.advance_paid.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">{t('totalBookingBalance')}</p>
                    <p className="text-xl font-black">₹{deliveryModal.balance.toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-2">
                {deliveryModal.items.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 border border-gray-100 rounded-xl">
                    <div className="flex-1">
                      <p className="font-bold text-gray-800 text-sm">{getPlantName(item.plant_id)}</p>
                      <p className="text-xs font-semibold text-gray-500">{t('totalOrdered')} {item.quantity}</p>
                    </div>
                    <div className="w-24">
                      <input
                        type="number"
                        min="0"
                        max={item.quantity}
                        value={deliveryQtys[item.id] ?? ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setDeliveryQtys(prev => ({ ...prev, [item.id]: Math.min(item.quantity, Math.max(0, val)) }));
                        }}
                        className="w-full p-2 bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-bold text-center"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <label className="text-xs font-bold text-gray-500 uppercase">{t('deliveryRemarks')}</label>
                <textarea
                  value={deliveryRemarks}
                  onChange={(e) => setDeliveryRemarks(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm mt-1"
                  rows={2}
                  placeholder={t('deliveryRemarksPlaceholder')}
                />
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mt-4 space-y-2">
                <div className="flex justify-between text-sm font-bold text-gray-600">
                  <span>{t('deliveryValue')}</span>
                  <span>₹{currentDeliveryValue.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-green-600">
                  <span>{t('advanceUsed')}</span>
                  <span>- ₹{advanceToUse.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-lg font-black text-gray-900 pt-2 border-t border-gray-200">
                  <span>{t('collectNow')}</span>
                  <span>₹{targetCollection.toLocaleString('en-IN')}</span>
                </div>
              </div>

              {targetCollection > 0 && (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-bold text-gray-700 mb-3">{t('selectPaymentMode')}</p>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        onClick={() => setPaymentMode('Cash')}
                        className={`py-3 rounded-2xl font-bold border-2 transition-all ${
                          paymentMode === 'Cash'
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {t('cash')}
                      </button>
                      <button
                        onClick={() => setPaymentMode('UPI')}
                        className={`py-3 rounded-2xl font-bold border-2 transition-all ${
                          paymentMode === 'UPI'
                            ? 'border-purple-500 bg-purple-50 text-purple-700'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {t('upi')}
                      </button>
                      <button
                        onClick={() => setPaymentMode('Split')}
                        className={`py-3 rounded-2xl font-bold border-2 transition-all ${
                          paymentMode === 'Split'
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {t('split')}
                      </button>
                    </div>
                  </div>

                  {paymentMode === 'Split' && (
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3">
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="text-xs font-bold text-gray-500 uppercase">{t('cashAmount')}</label>
                          <input
                            type="number"
                            min="0"
                            value={splitAmounts.cash}
                            onChange={(e) => {
                              const val = e.target.value;
                              const numVal = parseFloat(val) || 0;
                              setSplitAmounts({
                                cash: val,
                                upi: Math.max(0, targetCollection - numVal).toString()
                              });
                            }}
                            className="w-full p-3 bg-white border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold mt-1"
                            placeholder="0"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs font-bold text-gray-500 uppercase">{t('upiAmount')}</label>
                          <input
                            type="number"
                            min="0"
                            value={splitAmounts.upi}
                            onChange={(e) => {
                              const val = e.target.value;
                              const numVal = parseFloat(val) || 0;
                              setSplitAmounts({
                                upi: val,
                                cash: Math.max(0, targetCollection - numVal).toString()
                              });
                            }}
                            className="w-full p-3 bg-white border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold mt-1"
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-sm font-bold pt-2 border-t border-gray-200">
                        <span className="text-gray-500">{t('totalAmount')}:</span>
                        <span className={Math.abs(splitTotal - targetCollection) < 0.01 ? 'text-green-600' : 'text-red-500'}>
                          ₹{splitTotal.toLocaleString('en-IN')} / ₹{targetCollection.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setDeliveryModal(null)}
                className="flex-1 py-4 font-bold text-gray-500 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={confirmDelivery}
                disabled={!isValidSplit}
                className="flex-[2] py-4 font-black text-white bg-green-600 rounded-2xl shadow-md active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
              >
                {t('markPaidDelivered')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
