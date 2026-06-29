// @ts-nocheck
'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

function generateId() {
  return crypto.randomUUID();
}

function toLocalDateStr(dateStr: string) {
  const d = new Date(dateStr);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
}

function resolvePlantPrice(plant: any, quantity: number): number {
  if (plant.pricing_tiers && plant.pricing_tiers.length > 0) {
    const sortedTiers = [...plant.pricing_tiers].sort((a: any, b: any) => b.min_quantity - a.min_quantity);
    for (const tier of sortedTiers) {
      if (quantity >= tier.min_quantity) {
        return tier.price;
      }
    }
  }
  return plant.selling_price;
}

async function logAudit(user_id: string, user_name: string, action: string, entity: string, entity_id: string, details?: any) {
  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    user_id,
    user_name,
    action,
    entity,
    entity_id,
    details,
    created_at: new Date().toISOString()
  });
}

interface Booking { id: string; booking_number: string; customer_name: string; customer_phone: string; city: string | null; plant_id: string; lot_id: string | null; quantity: number; advance_paid: number; advance_payment_mode: 'Cash' | 'UPI' | 'Split' | null; advance_cash_amount: number | null; advance_upi_amount: number | null; total_amount: number; booking_date: string; delivery_date: string | null; status: 'Pending' | 'Delivered' | 'Cancelled'; worker_id: string; created_at: string; remarks: string; refund_amount?: number; refund_payment_mode?: 'Cash' | 'UPI' | null; refund_status?: 'Refunded' | 'Forfeited' | 'Not Refunded'; refund_date?: string | null; }

import { PlusCircle, Trash2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface CartItem {
  id: string; // original row id or newly generated uuid
  plantId: string;
  plantName: string;
  lotId: string;
  lotName: string;
  quantity: number;
  price: number;
  amount: number;
}

export default function EditBookingPage() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const params = useParams();
  const bookingNumber = params.bookingNumber as string;
  const router = useRouter();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [city, setCity] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Current Item State
  const [plantId, setPlantId] = useState('');
  const [lotId, setLotId] = useState('');
  const [quantity, setQuantity] = useState('');
  
  const [advancePaid, setAdvancePaid] = useState('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Split'>('Cash');
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Refund States
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundOption, setRefundOption] = useState<'Refund' | 'Forfeit'>('Refund');
  const [refundPaymentMode, setRefundPaymentMode] = useState<'Cash' | 'UPI'>('Cash');
  const [refundAmountInput, setRefundAmountInput] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('snms_user');
    if (userStr) setCurrentUser(JSON.parse(userStr));
  }, []);

  const { data: plants } = useQuery({ queryKey: ['plants'], queryFn: async () => { const { data } = await supabase.from('plants').select('*').is('deleted_at', null).eq('active', true); return data || []; } });
  const { data: lotsData } = useQuery({ queryKey: ['lots'], queryFn: async () => { const { data } = await supabase.from('lots').select('*').is('deleted_at', null); return data || []; } });
  const lots = lotsData?.filter(l => l.plant_id === plantId) || [];
  const { data: bookings } = useQuery({ queryKey: ['bookings'], queryFn: async () => { const { data } = await supabase.from('bookings').select('*').is('deleted_at', null); return data || []; } });
  const { data: allotments } = useQuery({ queryKey: ['allotments'], queryFn: async () => { const { data } = await supabase.from('allotments').select('*').is('deleted_at', null); return data || []; } });
  const { data: direct_sales } = useQuery({ queryKey: ['direct_sales'], queryFn: async () => { const { data } = await supabase.from('direct_sales').select('*').is('deleted_at', null); return data || []; } });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: async () => { const { data } = await supabase.from('customers').select('*').is('deleted_at', null); return data || []; } });

  const { data: originalBookingRows } = useQuery({ 
    queryKey: ['bookings', bookingNumber], 
    queryFn: async () => { 
      const { data } = await supabase.from('bookings').select('*').is('deleted_at', null).eq('booking_number', bookingNumber); 
      return data || []; 
    }, 
    enabled: !!bookingNumber 
  });

  useEffect(() => {
    if (originalBookingRows && originalBookingRows.length > 0 && plants && lots && !initialLoaded) {
      const first = originalBookingRows[0];
      setCustomerName(first.customer_name);
      setCustomerPhone(first.customer_phone);
      setCity(first.city || '');
      setDeliveryDate(first.delivery_date || '');

      const loadedCart = originalBookingRows.map(r => {
        const p = plants.find(plant => plant.id === r.plant_id);
        const l = lots.find(lot => lot.id === r.lot_id);
        const price = p ? p.selling_price : (r.total_amount / r.quantity);
        return {
          id: r.id,
          plantId: r.plant_id,
          plantName: p ? (p.variety ? `${p.plant_name} - ${p.variety}` : p.plant_name) : 'Unknown Plant',
          lotId: r.lot_id || '',
          lotName: l ? (l.lot_name || l.lot_number) : t('noLotAssigned'),
          quantity: r.quantity,
          price: price,
          amount: r.total_amount
        };
      });
      setCart(loadedCart);

      const totalAdvance = originalBookingRows.reduce((sum, r) => sum + r.advance_paid, 0);
      setAdvancePaid(String(totalAdvance));

      // Resolve payment mode from first item containing advance payment mode
      const hasSplit = originalBookingRows.some(r => r.advance_payment_mode === 'Split');
      const hasUpi = originalBookingRows.some(r => r.advance_payment_mode === 'UPI');
      if (hasSplit) {
        setPaymentMode('Split');
        const totalCash = originalBookingRows.reduce((sum, r) => sum + (r.advance_cash_amount || 0), 0);
        const totalUpi = originalBookingRows.reduce((sum, r) => sum + (r.advance_upi_amount || 0), 0);
        setSplitAmounts({ cash: String(totalCash), upi: String(totalUpi) });
      } else if (hasUpi) {
        setPaymentMode('UPI');
        setUpiAmount(String(totalAdvance));
        setCashAmount('0');
      } else {
        setPaymentMode('Cash');
        setCashAmount(String(totalAdvance));
        setUpiAmount('0');
      }

      setInitialLoaded(true);
    }
  }, [originalBookingRows, plants, lots, initialLoaded]);

  const uniqueCities = Array.from(new Set(customers?.map(c => c.city).filter(Boolean) as string[]));

  const selectedPlant = plants?.find(p => p.id === plantId);
  const selectedLot = lots?.find(l => l.id === lotId);

  const computeFreeStockForLot = (lId: string, pid: string): number => {
    if (!lotsData || !allotments || !bookings || !direct_sales) return 0;
    const lot = lotsData.find(l => l.id === lId);
    if (!lot) return 0;
    const activeBookingIds = new Set(
      bookings.filter(b => b.plant_id === pid && b.status !== 'Delivered' && b.status !== 'Cancelled' && b.booking_number !== bookingNumber).map(b => b.id)
    );
    const allottedInLot = allotments
      .filter(a => a.lot_id === lId && activeBookingIds.has(a.booking_id))
      .reduce((s, a) => s + a.quantity, 0);
      
    const deliveredBookingsQty = bookings
      .filter(b => b.lot_id === lId && b.status === 'Delivered' && b.booking_number !== bookingNumber)
      .reduce((s, b) => s + b.quantity, 0);
      
    const directSalesQty = direct_sales
      .filter(s => s.lot_id === lId)
      .reduce((s, sale) => s + sale.quantity, 0);

    const cartQty = cart.filter(i => i.lotId === lId).reduce((s, i) => s + i.quantity, 0);
    return Math.max(0, (lot.available_stock ?? lot.total_quantity) - allottedInLot - deliveredBookingsQty - directSalesQty - cartQty);
  };

  const availableQty = (lotId && plantId) ? computeFreeStockForLot(lotId, plantId) : 0;

  const handleAddToCart = () => {
    if (!selectedPlant || !quantity) return;
    
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) return;

    if (lotId && selectedLot) {
      if (qty > availableQty) {
        alert(`Cannot add more than available quantity (${availableQty}) for this lot.`);
        return;
      }
    }

    let price = resolvePlantPrice(selectedPlant, qty);
    
    setCart([...cart, {
      id: generateId(),
      plantId: selectedPlant.id,
      plantName: selectedPlant.variety ? `${selectedPlant.plant_name} - ${selectedPlant.variety}` : selectedPlant.plant_name,
      lotId: selectedLot ? selectedLot.id : '',
      lotName: selectedLot ? (selectedLot.lot_name || selectedLot.lot_number) : t('noLotAssigned'),
      quantity: qty,
      price: price,
      amount: price * qty
    }]);

    // Reset current item
    setPlantId('');
    setLotId('');
    setQuantity('');
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.amount, 0);

  const [splitAmounts, setSplitAmounts] = useState({ cash: '', upi: '' });

  const advanceNum = parseFloat(advancePaid) || 0;
  const cashNum = paymentMode === 'Split' ? (parseFloat(splitAmounts.cash) || 0) : (parseFloat(cashAmount) || 0);
  const upiNum = paymentMode === 'Split' ? (parseFloat(splitAmounts.upi) || 0) : (parseFloat(upiAmount) || 0);
  const splitTotal = cashNum + upiNum;
  const splitRemaining = advanceNum - splitTotal;
  const splitValid = advanceNum === 0 || paymentMode !== 'Split' || Math.abs(splitRemaining) < 0.01;

  const handleCancelBooking = () => {
    if (advanceNum > 0) {
      setRefundAmountInput(String(advanceNum));
      setRefundOption('Refund');
      setRefundPaymentMode('Cash');
      setShowRefundModal(true);
    } else {
      if (!confirm("Are you sure you want to CANCEL this booking? The allotted stock will be released. This cannot be undone.")) return;
      executeCancel(0, null, 'Not Refunded');
    }
  };

  const executeCancel = async (refundAmount: number, paymentMode: 'Cash' | 'UPI' | null, refundStatus: 'Refunded' | 'Forfeited' | 'Not Refunded') => {
    setLoading(true);
    try {
      if (!navigator.onLine) { alert('You must be online to save.'); setLoading(false); return; }
      const rows = originalBookingRows || [];
      const rowIds = rows.map(r => r.id);

      // 1. Release allotments
      for (const id of rowIds) {
        await supabase.from('allotments').update({ deleted_at: new Date().toISOString() }).eq('booking_id', id);
      }

      // 2. Cancel and update bookings with refund columns
      let refundRemaining = refundAmount;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        let itemRefund = 0;
        if (refundRemaining > 0) {
          if (refundRemaining >= row.advance_paid) {
            itemRefund = row.advance_paid;
            refundRemaining -= row.advance_paid;
          } else {
            itemRefund = refundRemaining;
            refundRemaining = 0;
          }
        }
        if (i === rows.length - 1 && refundRemaining > 0) {
          itemRefund += refundRemaining;
        }

        const updates = {
          status: 'Cancelled' as const,
          refund_amount: itemRefund,
          refund_payment_mode: paymentMode,
          refund_status: refundStatus,
          refund_date: refundStatus === 'Refunded' ? toLocalDateStr(new Date().toISOString()) : null
        };

        await supabase.from('bookings').update(updates).eq('id', row.id);
      }

      const user = currentUser || { id: 'unknown', name: 'Unknown' };

      // 3. Update transactions ledger for refund
      if (refundStatus === 'Refunded' && refundAmount > 0) {
        await supabase.from('transactions').insert({
          reference_type: 'BOOKING_REFUND',
          reference_id: rows[0]?.id || generateId(),
          booking_number: bookingNumber,
          customer_name: rows[0]?.customer_name || 'Unknown',
          plant_names: 'Multiple Plants',
          amount: -refundAmount,
          payment_mode: paymentMode,
          cash_amount: paymentMode === 'Cash' ? -refundAmount : 0,
          upi_amount: paymentMode === 'UPI' ? -refundAmount : 0,
          worker_id: user.id,
          created_at: new Date().toISOString()
        });
      }

      await logAudit(user.id, user.name, 'CANCEL_BOOKING', 'bookings', bookingNumber, {
        refundAmount,
        paymentMode,
        refundStatus,
        note: refundStatus === 'Refunded' ? `Refunded ₹${refundAmount}` : refundStatus === 'Forfeited' ? 'Forfeited advance' : 'Cancelled'
      });

      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['allotments'] });
      router.push('/bookings');
    } catch (e) {
      console.error(e);
      alert('Failed to cancel booking');
    } finally {
      setLoading(false);
      setShowRefundModal(false);
    }
  };

  const handleDeleteBooking = async () => {
    if (!confirm("CRITICAL WARNING: Are you sure you want to completely DELETE this booking? This will erase it from the system entirely and remove all financial records/advances (use ONLY for accidental entries). This cannot be undone.")) return;
    setLoading(true);
    try {
      if (!navigator.onLine) { alert('You must be online to save.'); setLoading(false); return; }
      for (const row of originalBookingRows || []) {
        const deletedAt = new Date().toISOString();
        await supabase.from('bookings').update({ deleted_at: deletedAt }).eq('id', row.id);
      }
      const user = currentUser || { id: 'unknown', name: 'Unknown' };
      await logAudit(user.id, user.name, 'DELETE_BOOKING', 'bookings', bookingNumber, { note: 'Accidental entry purged' });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      router.push('/bookings');
    } catch (e) {
      console.error(e);
      alert('Failed to delete booking');
    } finally {
      setLoading(false);
    }
  };

  const handleCashChange = (val: string) => {
    setSplitAmounts(prev => {
      const c = parseFloat(val) || 0;
      return {
        cash: val,
        upi: c <= advanceNum ? String(Math.round((advanceNum - c) * 100) / 100) : prev.upi
      };
    });
  };
  const handleUpiChange = (val: string) => {
    setSplitAmounts(prev => {
      const u = parseFloat(val) || 0;
      return {
        upi: val,
        cash: u <= advanceNum ? String(Math.round((advanceNum - u) * 100) / 100) : prev.cash
      };
    });
  };
  const handleModeChange = (mode: 'Cash' | 'UPI' | 'Split') => {
    setPaymentMode(mode);
    if (mode === 'Cash') { setCashAmount(String(advanceNum)); setUpiAmount('0'); }
    else if (mode === 'UPI') { setUpiAmount(String(advanceNum)); setCashAmount('0'); }
    else { setSplitAmounts({ cash: String(advanceNum), upi: '0' }); }
  };
  const handleAdvanceChange = (val: string) => {
    setAdvancePaid(val);
    const adv = parseFloat(val) || 0;
    if (paymentMode === 'Cash') { setCashAmount(String(adv)); setUpiAmount('0'); }
    else if (paymentMode === 'UPI') { setUpiAmount(String(adv)); setCashAmount('0'); }
    else { setSplitAmounts({ cash: String(adv), upi: '0' }); }
  };

  const handleSaveBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return alert(t('addAtLeastOneBookingError'));
    if (advanceNum > totalAmount) {
      alert(t('advanceExceedTotalError'));
      return;
    }
    
    setLoading(true);

    const userStr = localStorage.getItem('snms_user');
    const user = userStr ? JSON.parse(userStr) : { id: 'unknown', name: 'Unknown' };
    const createdAt = originalBookingRows?.[0]?.created_at || new Date().toISOString();

    const finalCash = paymentMode === 'Cash' ? advanceNum : paymentMode === 'UPI' ? 0 : parseFloat(splitAmounts.cash) || 0;
    const finalUpi  = paymentMode === 'UPI'  ? advanceNum : paymentMode === 'Cash' ? 0 : parseFloat(splitAmounts.upi) || 0;

    let advanceRemaining = advanceNum;
    let cashRemaining = finalCash;
    let upiRemaining = finalUpi;

    const modifiedBookings = cart.map((item, index) => {
      let itemAdvance = 0;
      let itemCash = 0;
      let itemUpi = 0;

      if (advanceRemaining > 0) {
        if (advanceRemaining >= item.amount) {
          itemAdvance = item.amount;
          advanceRemaining -= item.amount;
        } else {
          itemAdvance = advanceRemaining;
          advanceRemaining = 0;
        }

        if (cashRemaining >= itemAdvance) {
          itemCash = itemAdvance;
          cashRemaining -= itemAdvance;
        } else {
          itemCash = cashRemaining;
          cashRemaining = 0;
          itemUpi = Math.min(itemAdvance - itemCash, upiRemaining);
          upiRemaining -= itemUpi;
        }
      }
      
      if (index === cart.length - 1 && advanceRemaining > 0) {
        itemAdvance += advanceRemaining;
        itemCash += cashRemaining;
        itemUpi += upiRemaining;
      }

      const itemPayMode: 'Cash' | 'UPI' | 'Split' = (itemCash > 0 && itemUpi > 0) ? 'Split' : (itemUpi > 0 ? 'UPI' : 'Cash');
      const finalItemPayMode = itemAdvance > 0 ? itemPayMode : null;

      // Find if this item already existed originally
      const original = originalBookingRows?.find(r => r.id === item.id);
      const isModified = original ? (original.plant_id !== item.plantId || original.quantity !== item.quantity) : false;

      return {
        id: item.id,
        booking_number: bookingNumber,
        customer_name: customerName,
        customer_phone: customerPhone,
        city: city,
        plant_id: item.plantId,
        lot_id: isModified ? null : (item.lotId || null),
        quantity: item.quantity,
        advance_paid: itemAdvance,
        advance_payment_mode: finalItemPayMode,
        advance_cash_amount: itemCash > 0 ? itemCash : null,
        advance_upi_amount: itemUpi > 0 ? itemUpi : null,
        total_amount: item.amount,
        booking_date: toLocalDateStr(createdAt),
        delivery_date: deliveryDate || null,
        status: isModified ? 'Pending' : (original ? original.status : 'Pending'),
        worker_id: original ? original.worker_id : user.id,
        sync_status: 'pending' as const,
        created_at: createdAt,
        remarks: original ? original.remarks : ''
      } as Booking;
    });

    if (!navigator.onLine) { alert('You must be online to save.'); setLoading(false); return; }
    try {
      const originalIds = new Set(originalBookingRows?.map(r => r.id));
      const modifiedIds = new Set(modifiedBookings.map(b => b.id));

      // 1. Identify deleted items
      const deletedIds = Array.from(originalIds).filter((id) => !modifiedIds.has(id as string));
      for (const id of deletedIds) {
        const deletedAt = new Date().toISOString();
        await supabase.from('bookings').update({ deleted_at: deletedAt }).eq('id', id);
        await supabase.from('allotments').update({ deleted_at: deletedAt }).eq('booking_id', id);
      }

      // 2. Identify inserted & updated items
      for (const b of modifiedBookings) {
        const payload = { ...b };
        // @ts-ignore
        delete payload.sync_status;

        if (originalIds.has(b.id)) {
          const original = originalBookingRows?.find(r => r.id === b.id);
          const isModified = original ? (original.plant_id !== b.plant_id || original.quantity !== b.quantity) : false;

          if (isModified) {
            await supabase.from('allotments').update({ deleted_at: new Date().toISOString() }).eq('booking_id', b.id);
          }

          await supabase.from('bookings').update(payload).eq('id', b.id);
        } else {
          await supabase.from('bookings').insert(payload);
        }
      }

      // 3. Update transactions ledger if advance changed
      const oldTotalAdvance = originalBookingRows?.reduce((sum, r) => sum + (r.advance_paid || 0), 0) || 0;
      if (advanceNum !== oldTotalAdvance) {
        const diff = advanceNum - oldTotalAdvance;
        await supabase.from('transactions').insert({
          reference_type: 'BOOKING_ADVANCE_ADJUSTMENT',
          reference_id: modifiedBookings[0]?.id || generateId(),
          booking_number: bookingNumber,
          customer_name: customerName,
          plant_names: 'Multiple Plants',
          amount: diff,
          payment_mode: paymentMode === 'Split' ? 'Split' : paymentMode,
          cash_amount: paymentMode === 'Split' ? (diff > 0 ? (parseFloat(splitAmounts.cash) || 0) : diff) : (paymentMode === 'Cash' ? diff : 0),
          upi_amount: paymentMode === 'Split' ? (diff > 0 ? (parseFloat(splitAmounts.upi) || 0) : diff) : (paymentMode === 'UPI' ? diff : 0),
          worker_id: user.id,
          created_at: new Date().toISOString()
        });
      }

      // 4. Customer logic
      if (customerPhone && customerName) {
        const { data: custData } = await supabase.from('customers').select('*').eq('mobile', customerPhone).is('deleted_at', null).maybeSingle();
        if (!custData) {
          const cust = { id: generateId(), name: customerName, mobile: customerPhone, city: city || null };
          await supabase.from('customers').insert(cust);
        } else {
          await supabase.from('customers').update({ name: customerName, city: city || custData.city }).eq('id', custData.id);
        }
      }

      // 4. Audit Log
      await logAudit(user.id, user.name, 'EDIT_BOOKING', 'bookings', bookingNumber, {
        totalAmount,
        itemCount: modifiedBookings.length,
        deletedCount: deletedIds.length
      });

      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['allotments'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      router.push('/bookings');
    } catch (err) {
      console.error(err);
      alert('Failed to save booking details');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 mb-24 space-y-6">
      <header className="mb-4">
        <div className="flex items-center gap-3">
          <Link href="/bookings" className="p-2 bg-white rounded-xl shadow-sm border border-gray-100 active:scale-95 transition-all text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 flex justify-between items-end">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{t('editOrderTitle')}</h1>
            <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg text-sm font-black border border-gray-200">
              {bookingNumber}
            </span>
          </div>
        </div>
      </header>

      <form onSubmit={handleSaveBooking} className="space-y-6">
        {/* Customer Details */}
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
          <h2 className="font-black text-gray-800 border-b border-gray-100 pb-2">{t('customerDetails')}</h2>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase">{t('customerName')}</label>
            <input required type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" placeholder="e.g. Ramesh Kumar" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase">{t('customerPhone')}</label>
              <input required type="tel" pattern="[0-9]{10}" maxLength={10} title="Phone number must be exactly 10 digits" value={customerPhone} onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" placeholder="9876543210" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase">{t('role')} / City</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" placeholder="Pune" list="cities" />
              <datalist id="cities">
                {uniqueCities.map(c => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-gray-100">
            <label className="text-xs font-bold text-gray-500 uppercase">{t('requestedDeliveryDate')}</label>
            <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" />
          </div>
        </div>

        {/* Cart Addition */}
        <div className="bg-blue-50 p-5 rounded-3xl border border-blue-100 space-y-4">
          <div className="flex justify-between items-center border-b border-blue-200 pb-2">
            <h2 className="font-black text-blue-900">{t('addPlants')}</h2>
          </div>
          
          <div className="space-y-2">
            <select value={plantId} onChange={e => { setPlantId(e.target.value); setLotId(''); }} className="w-full p-4 bg-white border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-lg text-blue-900">
              <option value="">{t('choosePlantPlaceholder')}</option>
              {plants?.filter(p => p.active !== false).map(p => (
                <option key={p.id} value={p.id}>{p.variety ? `${p.plant_name} - ${p.variety}` : p.plant_name} (₹{p.selling_price})</option>
              ))}
            </select>
          </div>

          {plantId && currentUser?.role === 'owner' && (
            <div className="space-y-2">
              <select value={lotId} onChange={e => setLotId(e.target.value)} className="w-full p-4 bg-white border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-blue-900">
                <option value="">{t('noLotAllotLater')}</option>
                {lots?.map(l => {
                  const free = computeFreeStockForLot(l.id, plantId);
                  return (
                    <option key={l.id} value={l.id}>{l.lot_name || l.lot_number} ({t('availableLabel')} {free})</option>
                  );
                })}
              </select>
            </div>
          )}

          {plantId && (
            <div className="flex space-x-2">
              <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-2/3 p-4 bg-white border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-black text-2xl text-blue-900" placeholder={t('qtyPlaceholder')} />
              <button type="button" onClick={handleAddToCart} disabled={!quantity} className="w-1/3 bg-blue-600 text-white rounded-xl font-black flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform">
                {t('add')}
              </button>
            </div>
          )}
        </div>

        {/* Cart Display */}
        {cart.length > 0 && (
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-black text-gray-800 border-b border-gray-100 pb-2">{t('orderSummary')}</h2>
            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <div>
                    <p className="font-bold text-gray-900">{item.plantName}</p>
                    <p className="text-xs font-semibold text-gray-500">{item.quantity} x ₹{item.price} • {item.lotName}</p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="font-black text-gray-900">₹{item.amount}</span>
                    <button type="button" onClick={() => removeFromCart(item.id)} className="p-2 text-red-500 bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="border-t border-gray-100 pt-4 flex justify-between items-center">
              <span className="font-bold text-gray-500 uppercase tracking-widest text-xs">{t('totalAmount')}</span>
              <span className="font-black text-2xl text-gray-900">₹{totalAmount}</span>
            </div>

            <div className="space-y-2 pt-4">
              <label className="text-xs font-bold text-gray-500 uppercase">{t('advancePaid')} (₹)</label>
              <input type="number" min="0" max={totalAmount} value={advancePaid} onChange={e => handleAdvanceChange(e.target.value)} className="w-full p-4 bg-green-50 border border-green-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-black text-2xl text-green-700" placeholder="0" />
            </div>

            {/* Advance Payment Mode */}
            {parseFloat(advancePaid) > 0 && (
              <div className="pt-4 space-y-3 border-t border-gray-100 mt-4">
                <p className="text-xs font-black text-gray-500 uppercase tracking-wider">{t('paymentMode')}</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleModeChange('Cash')}
                    className={`py-4 rounded-2xl font-black text-sm transition-all active:scale-95 ${
                      paymentMode === 'Cash' ? 'bg-green-600 text-white shadow-lg shadow-green-200 scale-105' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {t('cashPill')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange('UPI')}
                    className={`py-4 rounded-2xl font-black text-sm transition-all active:scale-95 ${
                      paymentMode === 'UPI' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-105' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {t('upiPill')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange('Split')}
                    className={`py-4 rounded-2xl font-black text-sm transition-all active:scale-95 ${
                      paymentMode === 'Split' ? 'bg-purple-600 text-white shadow-lg shadow-purple-200 scale-105' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {t('splitPill')}
                  </button>
                </div>

                {paymentMode === 'Split' && (
                  <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-3">
                    <p className="text-xs font-black text-purple-700 uppercase tracking-wider">{t('enterSplitAmounts')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-green-700">{t('cashAmtLabel')}</label>
                        <input
                          type="number" min="0" max={advanceNum} step="0.01"
                          value={splitAmounts.cash} onChange={e => handleCashChange(e.target.value)}
                          className="w-full p-3 bg-white border-2 border-green-200 rounded-xl outline-none focus:border-green-500 font-black text-xl text-green-800"
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-blue-700">{t('upiAmtLabel')}</label>
                        <input
                          type="number" min="0" max={advanceNum} step="0.01"
                          value={splitAmounts.upi} onChange={e => handleUpiChange(e.target.value)}
                          className="w-full p-3 bg-white border-2 border-blue-200 rounded-xl outline-none focus:border-blue-500 font-black text-xl text-blue-800"
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div className={`flex justify-between items-center px-4 py-3 rounded-xl font-black text-sm ${
                      splitValid ? 'bg-green-100 text-green-800 border border-green-200' :
                      splitRemaining > 0 ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                      'bg-red-100 text-red-800 border border-red-200'
                    }`}>
                      <span>{splitValid ? t('splitValidMsg') : splitRemaining > 0 ? t('splitShortMsg').replace('{remaining}', splitRemaining.toFixed(0)) : t('splitOverMsg').replace('{excess}', Math.abs(splitRemaining).toFixed(0))}</span>
                      <span>Total: ₹{advanceNum}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <button type="submit" disabled={loading || cart.length === 0 || !splitValid} className="w-full bg-gray-900 text-white font-black text-xl p-5 rounded-2xl active:scale-95 transition-transform disabled:opacity-50 shadow-xl">
          {loading ? t('processing') : t('saveChanges')}
        </button>
      </form>

      {/* Danger Zone */}
      {originalBookingRows && originalBookingRows.length > 0 && (
        <div className="bg-red-50 border border-red-200 p-5 rounded-3xl space-y-4 mt-6">
          <h3 className="font-black text-red-950 text-lg flex items-center gap-2">
            ⚠️ Danger Zone
          </h3>
          <p className="text-xs text-red-700 font-medium">
            Perform administrative tasks for this booking. Actions here are immediate.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={handleCancelBooking}
              disabled={loading}
              className="py-4 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-2xl active:scale-95 transition-transform text-sm disabled:opacity-50 shadow-md shadow-orange-200"
            >
              Cancel Booking
            </button>
            <button
              type="button"
              onClick={handleDeleteBooking}
              disabled={loading}
              className="py-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-2xl active:scale-95 transition-transform text-sm disabled:opacity-50 shadow-md shadow-red-200"
            >
              Delete Booking
            </button>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-100 space-y-6 animate-in zoom-in-95 duration-200">
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-gray-900">Cancel & Refund Options</h3>
              <p className="text-sm text-gray-500 font-medium">
                This booking has an advance payment of <span className="font-bold text-gray-800">₹{advanceNum}</span>. Choose how to handle it.
              </p>
            </div>

            <div className="space-y-4">
              {/* Option Selector */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRefundOption('Refund')}
                  className={`py-3 rounded-xl font-bold text-sm transition-all border ${
                    refundOption === 'Refund'
                      ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                      : 'bg-gray-50 border-gray-200 text-gray-500'
                  }`}
                >
                  Refund Payment
                </button>
                <button
                  type="button"
                  onClick={() => setRefundOption('Forfeit')}
                  className={`py-3 rounded-xl font-bold text-sm transition-all border ${
                    refundOption === 'Forfeit'
                      ? 'bg-orange-50 border-orange-200 text-orange-700 shadow-sm'
                      : 'bg-gray-50 border-gray-200 text-gray-500'
                  }`}
                >
                  Forfeit Advance
                </button>
              </div>

              {refundOption === 'Refund' && (
                <div className="space-y-4 animate-in slide-in-from-top-4 duration-200">
                  {/* Amount Input */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Refund Amount (₹)</label>
                    <input
                      type="number"
                      min="0.01"
                      max={advanceNum}
                      step="0.01"
                      value={refundAmountInput}
                      onChange={e => setRefundAmountInput(e.target.value)}
                      className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-lg"
                    />
                  </div>

                  {/* Payment Mode */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Refund Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRefundPaymentMode('Cash')}
                        className={`py-3 rounded-xl font-bold text-sm transition-all border ${
                          refundPaymentMode === 'Cash'
                            ? 'bg-green-50 border-green-200 text-green-700 shadow-sm'
                            : 'bg-gray-50 border-gray-200 text-gray-500'
                        }`}
                      >
                        Cash
                      </button>
                      <button
                        type="button"
                        onClick={() => setRefundPaymentMode('UPI')}
                        className={`py-3 rounded-xl font-bold text-sm transition-all border ${
                          refundPaymentMode === 'UPI'
                            ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                            : 'bg-gray-50 border-gray-200 text-gray-500'
                        }`}
                      >
                        UPI
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRefundModal(false)}
                className="w-1/2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl active:scale-95 transition-transform"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const amt = refundOption === 'Refund' ? parseFloat(refundAmountInput) || 0 : 0;
                  if (refundOption === 'Refund' && (amt <= 0 || amt > advanceNum)) {
                    alert(`Refund amount must be between 0.01 and ₹${advanceNum}`);
                    return;
                  }
                  executeCancel(
                    amt,
                    refundOption === 'Refund' ? refundPaymentMode : null,
                    refundOption === 'Refund' ? 'Refunded' : 'Forfeited'
                  );
                }}
                className="w-1/2 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl active:scale-95 transition-transform shadow-md shadow-red-200"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
