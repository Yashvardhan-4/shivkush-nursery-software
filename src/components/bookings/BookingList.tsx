'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, logAudit } from '@/lib/db';
import { Search, Phone, MapPin, Package, Truck, XCircle, CheckCircle2, FileSpreadsheet, FileText } from 'lucide-react';
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
  const [tab, setTab] = useState<TabStatus>('All');
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

  const bookings = useLiveQuery(() => db.bookings.orderBy('created_at').reverse().toArray());
  const plants = useLiveQuery(() => db.plants.toArray());

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

  if (!bookings || !plants) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 font-semibold">Loading bookings...</p>
      </div>
    );
  }

  const getPlantName = (id: string) => {
    const p = plants.find(p => p.id === id);
    return p ? (p.variety ? `${p.plant_name} - ${p.variety}` : p.plant_name) : 'Unknown Plant';
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

    if (allDelivered) g.status = 'Delivered';
    else if (allCancelled) g.status = 'Cancelled';
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

  async function cancelBooking(bookingNumber: string) {
    if (!confirm('Cancel this booking? This cannot be undone.')) return;
    setActionLoading(`cancel_${bookingNumber}`);
    try {
      const rows = await db.bookings.where('booking_number').equals(bookingNumber).toArray();
      for (const row of rows) {
        await db.bookings.update(row.id, { status: 'Cancelled', sync_status: 'pending' });
        await logAudit(userId, userName, 'CANCEL_BOOKING', 'bookings', row.id, {
          booking_number: bookingNumber,
          customer_name: row.customer_name,
        });
        // Send FULL row so COALESCE-based UPDATE doesn't null out any fields
        await db.sync_queue.add({
          table: 'bookings',
          action: 'UPDATE',
          payload: { ...row, status: 'Cancelled', sync_status: undefined },
          created_at: Date.now(),
        });
      }
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
  }

  async function confirmDelivery() {
    if (!deliveryModal) return;
    const { bookingNumber, items, advance_paid } = deliveryModal;
    setActionLoading(`deliver_${bookingNumber}`);
    setDeliveryModal(null);

    try {
      // 1. Determine total delivery value
      let deliveryValue = 0;
      items.forEach((item: any) => {
        const deliverQty = deliveryQtys[item.id] || 0;
        const unitPrice = item.total_amount / item.quantity;
        deliveryValue += deliverQty * unitPrice;
      });

      const advanceToUse = Math.min(advance_paid, deliveryValue);
      const targetCollection = deliveryValue - advanceToUse;

      // 2. Compute final payment
      let finalPaymentMode = paymentMode as string;
      const splitTotal = (parseFloat(splitAmounts.cash) || 0) + (parseFloat(splitAmounts.upi) || 0);
      if (paymentMode === 'Split') {
        finalPaymentMode = `Split (Cash: ₹${splitAmounts.cash || 0}, UPI: ₹${splitAmounts.upi || 0})`;
      }
      const amountCollectedNow = paymentMode === 'Split' ? splitTotal : targetCollection;

      const todayStr = new Date().toISOString().split('T')[0];
      const rows = await db.bookings.where('booking_number').equals(bookingNumber).toArray();

      const newlyProcessedRows: any[] = [];
      const ops = [];

      for (const row of rows) {
        if (row.status === 'Delivered' || row.status === 'Cancelled') {
           continue; // NEVER touch previously delivered/cancelled rows
        }
        
        const deliverQty = deliveryQtys[row.id] || 0;
        const totalQty = row.quantity;

        if (deliverQty === 0) {
           newlyProcessedRows.push(row);
           continue;
        }

        const unitPrice = row.total_amount / totalQty;
        
        if (deliverQty === totalQty) {
           const updated = { ...row, status: 'Delivered', delivery_date: todayStr, sync_status: 'pending' };
           newlyProcessedRows.push(updated);
           ops.push(async () => {
             await db.bookings.update(row.id, { status: 'Delivered', delivery_date: todayStr, sync_status: 'pending' });
             await db.sync_queue.add({ table: 'bookings', action: 'UPDATE', payload: { id: row.id, status: 'Delivered', delivery_date: todayStr }, created_at: Date.now() });
             
             if (row.lot_id) {
               const lot = await db.lots.get(row.lot_id);
               if (lot) {
                 const newQty = Math.max(0, lot.total_quantity - deliverQty);
                 const newStatus = newQty === 0 ? 'Completed' : lot.status;
                 await db.lots.update(row.lot_id, { total_quantity: newQty, status: newStatus });
                 await db.sync_queue.add({ table: 'lots', action: 'UPDATE', payload: { id: row.lot_id, total_quantity: newQty, status: newStatus }, created_at: Date.now() });
               }
             }
           });
        } else {
           const deliveredAmount = deliverQty * unitPrice;
           const remainingQty = totalQty - deliverQty;
           const remainingAmount = row.total_amount - deliveredAmount;

           const updatedDelivered = { ...row, quantity: deliverQty, total_amount: deliveredAmount, status: 'Delivered', delivery_date: todayStr, sync_status: 'pending' };
           newlyProcessedRows.push(updatedDelivered);
           
           const newPendingId = crypto.randomUUID();
           const newPending = { ...row, id: newPendingId, quantity: remainingQty, total_amount: remainingAmount, status: 'Pending' as const, sync_status: 'pending' as const, created_at: new Date().toISOString() };
           newlyProcessedRows.push(newPending);

           ops.push(async () => {
             await db.bookings.update(row.id, { quantity: deliverQty, total_amount: deliveredAmount, status: 'Delivered', delivery_date: todayStr, sync_status: 'pending' });
             await db.sync_queue.add({ table: 'bookings', action: 'UPDATE', payload: { id: row.id, quantity: deliverQty, total_amount: deliveredAmount, status: 'Delivered', delivery_date: todayStr }, created_at: Date.now() });
             
             await db.bookings.add(newPending);
             await db.sync_queue.add({ table: 'bookings', action: 'INSERT', payload: newPending, created_at: Date.now() });
             
             if (row.lot_id) {
               const lot = await db.lots.get(row.lot_id);
               if (lot) {
                 const newQty = Math.max(0, lot.total_quantity - deliverQty);
                 const newStatus = newQty === 0 ? 'Completed' : lot.status;
                 await db.lots.update(row.lot_id, { total_quantity: newQty, status: newStatus });
                 await db.sync_queue.add({ table: 'lots', action: 'UPDATE', payload: { id: row.lot_id, total_quantity: newQty, status: newStatus }, created_at: Date.now() });
               }
             }
           });
        }
      }

      // Re-distribute advance_paid across newly processed rows (Delivered first)
      newlyProcessedRows.sort((a, b) => (a.status === 'Delivered' ? -1 : 1));
      let remainingAdvance = advance_paid; // advance_paid from the modal is exactly the usable advance
      
      for (const fRow of newlyProcessedRows) {
         let rowAdvance = 0;
         if (remainingAdvance >= fRow.total_amount) {
            rowAdvance = fRow.total_amount;
            remainingAdvance -= fRow.total_amount;
         } else {
            rowAdvance = remainingAdvance;
            remainingAdvance = 0;
         }
         if (fRow.advance_paid !== rowAdvance) {
            fRow.advance_paid = rowAdvance;
            ops.push(async () => {
              await db.bookings.update(fRow.id, { advance_paid: rowAdvance, sync_status: 'pending' });
              await db.sync_queue.add({ table: 'bookings', action: 'UPDATE', payload: { id: fRow.id, advance_paid: rowAdvance }, created_at: Date.now() });
            });
         }
      }

      // Distribute cash/upi collections ONLY among the newly delivered rows
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
            const rowPayMode: 'Cash' | 'UPI' | 'Split' = (rCash > 0 && rUpi > 0) ? 'Split' : (rUpi > 0 ? 'UPI' : 'Cash');
            
            const capturedId = fRow.id;
            const capturedCash = rCash;
            const capturedUpi = rUpi;
            const capturedMode = rowPayMode;
            fRow.payment_mode = capturedMode;
            fRow.cash_amount = capturedCash;
            fRow.upi_amount = capturedUpi;
            ops.push(async () => {
               await db.bookings.update(capturedId, { payment_mode: capturedMode, cash_amount: capturedCash, upi_amount: capturedUpi, sync_status: 'pending' });
               await db.sync_queue.add({ table: 'bookings', action: 'UPDATE', payload: { id: capturedId, payment_mode: capturedMode, cash_amount: capturedCash, upi_amount: capturedUpi }, created_at: Date.now() });
            });
         }
      }

      for (const op of ops) {
         await op();
      }

      await logAudit(userId, userName, 'DELIVER_BOOKING', 'bookings', bookingNumber, {
         customer_name: deliveryModal.customerName,
         payment_mode: finalPaymentMode,
         amount_collected: amountCollectedNow
      });

    } finally {
      setActionLoading(null);
    }
  }

  // Calculate dynamic modal values
  const currentDeliveryValue = deliveryModal ? deliveryModal.items.reduce((sum, item) => {
    const qty = deliveryQtys[item.id] || 0;
    return sum + (qty * (item.total_amount / item.quantity));
  }, 0) : 0;
  
  const advanceToUse = deliveryModal ? Math.min(deliveryModal.advance_paid, currentDeliveryValue) : 0;
  const targetCollection = currentDeliveryValue - advanceToUse;

  const splitTotal = (parseFloat(splitAmounts.cash) || 0) + (parseFloat(splitAmounts.upi) || 0);
  const isValidSplit = !deliveryModal || paymentMode !== 'Split' || (paymentMode === 'Split' && Math.abs(splitTotal - targetCollection) < 0.01);

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-2 pb-1 w-max">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all active:scale-95 border
                ${tab === t
                  ? `${TAB_ACTIVE[t]} border-transparent shadow-md`
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }
              `}
            >
              {t}
              {counts[t] > 0 && (
                <span className={`ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded-full
                  ${tab === t ? 'bg-white/30 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {counts[t]}
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
            <p className="text-gray-400 font-semibold">No bookings found.</p>
          </div>
        )}

        {filtered.map(grp => {
          const isCancelling = actionLoading === `cancel_${grp.booking_number}`;
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
                      {grp.status}
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
                    <span className="font-semibold text-gray-700 flex items-center gap-2">
                      {item.quantity} × {getPlantName(item.plant_id)}
                      {item.status === 'Delivered' && (
                        <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wide">Delivered</span>
                      )}
                    </span>
                    <span className="font-bold text-gray-900">₹{item.total_amount}</span>
                  </div>
                ))}
              </div>

              {/* Financial summary */}
              <div className="mx-5 mb-4 bg-blue-50 rounded-2xl p-4 border border-blue-100">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">Total</p>
                    <p className="font-black text-blue-900">₹{grp.total_amount.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">Advance</p>
                    <p className="font-black text-blue-700">₹{grp.advance_paid.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">Balance</p>
                    <p className={`font-black ${grp.balance > 0 ? 'text-red-600' : grp.balance < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                      ₹{grp.balance.toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              {!['Delivered', 'Cancelled'].includes(grp.status) && (
                <div className="px-5 pb-5 flex gap-2">
                  <button
                    onClick={() => openDeliveryModal(grp)}
                    disabled={isDelivering}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-600 text-white font-black text-sm shadow-md active:scale-95 transition-all disabled:opacity-60"
                  >
                    <Truck className="w-4 h-4" />
                    {isDelivering ? 'Marking...' : 'Deliver Order'}
                  </button>

                  {role === 'owner' && (
                    <button
                      onClick={() => cancelBooking(grp.booking_number)}
                      disabled={isCancelling}
                      className="px-4 flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-50 text-red-600 border border-red-200 font-black text-sm active:scale-95 transition-all disabled:opacity-60"
                    >
                      <XCircle className="w-4 h-4" />
                      {isCancelling ? 'Cancelling...' : 'Cancel'}
                    </button>
                  )}
                </div>
              )}

              {grp.status === 'Delivered' && (
                <div className="mx-5 mb-5 flex items-center gap-2 text-green-700 bg-green-50 border border-green-100 rounded-2xl px-4 py-3">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-bold">
                    Delivered on {grp.items[0]?.delivery_date
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
              <h3 className="text-xl font-black text-gray-900">Confirm Delivery</h3>
              <button onClick={() => setDeliveryModal(null)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:text-gray-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-6 space-y-4">
              <div className="bg-blue-50 text-blue-900 p-4 rounded-2xl border border-blue-100 mb-4">
                <p className="text-sm font-semibold mb-1">Customer: {deliveryModal.customerName}</p>
                <div className="flex justify-between items-end mt-2">
                  <div>
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Booking Advance</p>
                    <p className="text-xl font-black">₹{deliveryModal.advance_paid.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Total Booking Balance</p>
                    <p className="text-xl font-black">₹{deliveryModal.balance.toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-2">
                {deliveryModal.items.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 border border-gray-100 rounded-xl">
                    <div className="flex-1">
                      <p className="font-bold text-gray-800 text-sm">{getPlantName(item.plant_id)}</p>
                      <p className="text-xs font-semibold text-gray-500">Total ordered: {item.quantity}</p>
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

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mt-4 space-y-2">
                <div className="flex justify-between text-sm font-bold text-gray-600">
                  <span>Delivery Value:</span>
                  <span>₹{currentDeliveryValue.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-green-600">
                  <span>Advance Used:</span>
                  <span>- ₹{advanceToUse.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-lg font-black text-gray-900 pt-2 border-t border-gray-200">
                  <span>Collect Now:</span>
                  <span>₹{targetCollection.toLocaleString('en-IN')}</span>
                </div>
              </div>

              {targetCollection > 0 && (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-bold text-gray-700 mb-3">Select Payment Mode</p>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        onClick={() => setPaymentMode('Cash')}
                        className={`py-3 rounded-2xl font-bold border-2 transition-all ${
                          paymentMode === 'Cash'
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        Cash
                      </button>
                      <button
                        onClick={() => setPaymentMode('UPI')}
                        className={`py-3 rounded-2xl font-bold border-2 transition-all ${
                          paymentMode === 'UPI'
                            ? 'border-purple-500 bg-purple-50 text-purple-700'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        UPI
                      </button>
                      <button
                        onClick={() => setPaymentMode('Split')}
                        className={`py-3 rounded-2xl font-bold border-2 transition-all ${
                          paymentMode === 'Split'
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        Split
                      </button>
                    </div>
                  </div>

                  {paymentMode === 'Split' && (
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3">
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="text-xs font-bold text-gray-500 uppercase">Cash Amount</label>
                          <input
                            type="number"
                            min="0"
                            value={splitAmounts.cash}
                            onChange={(e) => setSplitAmounts(s => ({ ...s, cash: e.target.value }))}
                            className="w-full p-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold mt-1"
                            placeholder="0"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs font-bold text-gray-500 uppercase">UPI Amount</label>
                          <input
                            type="number"
                            min="0"
                            value={splitAmounts.upi}
                            onChange={(e) => setSplitAmounts(s => ({ ...s, upi: e.target.value }))}
                            className="w-full p-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold mt-1"
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-sm font-bold pt-2 border-t border-gray-200">
                        <span className="text-gray-500">Total Entered:</span>
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
                Cancel
              </button>
              <button
                onClick={confirmDelivery}
                disabled={!isValidSplit}
                className="flex-[2] py-4 font-black text-white bg-green-600 rounded-2xl shadow-md active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
              >
                Mark Paid & Delivered
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
