'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { db, generateId, logAudit, toLocalDateStr } from '@/lib/db';
import type { Booking } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
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

  useEffect(() => {
    const userStr = localStorage.getItem('snms_user');
    if (userStr) setCurrentUser(JSON.parse(userStr));
  }, []);

  const plants = useLiveQuery(() => db.plants.toArray());
  const lots = useLiveQuery(() => db.lots.where('plant_id').equals(plantId).toArray(), [plantId]);
  const bookings = useLiveQuery(() => db.bookings.toArray());
  const allotments = useLiveQuery(() => db.allotments.toArray());
  const direct_sales = useLiveQuery(() => db.direct_sales.toArray());
  const customers = useLiveQuery(() => db.customers.toArray());

  // Load existing booking items
  const originalBookingRows = useLiveQuery(async () => {
    if (!bookingNumber) return [];
    return await db.bookings.where('booking_number').equals(bookingNumber).toArray();
  }, [bookingNumber]);

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
    if (!lots || !allotments || !bookings || !direct_sales) return 0;
    const lot = lots.find(l => l.id === lId);
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

    let price = selectedPlant.selling_price || 0;
    if (selectedPlant.category?.toLowerCase() === 'vegetable' && qty < 100) {
      price = 2;
    }
    
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

  const advanceNum = parseFloat(advancePaid) || 0;
  const cashNum = parseFloat(cashAmount) || 0;
  const upiNum = parseFloat(upiAmount) || 0;
  const splitTotal = cashNum + upiNum;
  const splitRemaining = advanceNum - splitTotal;
  const splitValid = advanceNum === 0 || paymentMode !== 'Split' || Math.abs(splitRemaining) < 0.01;

  const [splitAmounts, setSplitAmounts] = useState({ cash: '', upi: '' });

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
    else { setSplitAmounts({ cash: '', upi: '' }); }
  };
  const handleAdvanceChange = (val: string) => {
    setAdvancePaid(val);
    const adv = parseFloat(val) || 0;
    if (paymentMode === 'Cash') { setCashAmount(String(adv)); setUpiAmount('0'); }
    else if (paymentMode === 'UPI') { setUpiAmount(String(adv)); setCashAmount('0'); }
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

      return {
        id: item.id,
        booking_number: bookingNumber,
        customer_name: customerName,
        customer_phone: customerPhone,
        city: city,
        plant_id: item.plantId,
        lot_id: item.lotId || null,
        quantity: item.quantity,
        advance_paid: itemAdvance,
        advance_payment_mode: finalItemPayMode,
        advance_cash_amount: itemCash > 0 ? itemCash : null,
        advance_upi_amount: itemUpi > 0 ? itemUpi : null,
        total_amount: item.amount,
        booking_date: toLocalDateStr(createdAt),
        delivery_date: deliveryDate || null,
        status: original ? original.status : 'Pending',
        worker_id: original ? original.worker_id : user.id,
        sync_status: 'pending' as const,
        created_at: createdAt,
        remarks: original ? original.remarks : ''
      } as Booking;
    });

    try {
      const originalIds = new Set(originalBookingRows?.map(r => r.id));
      const modifiedIds = new Set(modifiedBookings.map(b => b.id));

      // 1. Identify deleted items
      const deletedIds = Array.from(originalIds).filter(id => !modifiedIds.has(id));
      for (const id of deletedIds) {
        await db.bookings.delete(id);
        await db.sync_queue.add({
          table: 'bookings',
          action: 'DELETE',
          payload: { id },
          created_at: Date.now()
        });
      }

      // 2. Identify inserted & updated items
      for (const b of modifiedBookings) {
        if (originalIds.has(b.id)) {
          // Update
          await db.bookings.put(b);
          await db.sync_queue.add({
            table: 'bookings',
            action: 'UPDATE',
            payload: { ...b, sync_status: undefined },
            created_at: Date.now()
          });
        } else {
          // Insert
          await db.bookings.add(b);
          await db.sync_queue.add({
            table: 'bookings',
            action: 'INSERT',
            payload: b,
            created_at: Date.now()
          });
        }
      }

      // 3. Customer logic
      if (customerPhone && customerName) {
        let cust = await db.customers.where('mobile').equals(customerPhone).first();
        if (!cust) {
          cust = { id: generateId(), name: customerName, mobile: customerPhone, city: city || null };
          await db.customers.add(cust);
        } else {
          cust.name = customerName;
          if (city) cust.city = city;
          await db.customers.put(cust);
        }
        await db.sync_queue.add({ table: 'customers', action: 'INSERT', payload: cust, created_at: Date.now() });
      }

      // 4. Audit Log
      await logAudit(user.id, user.name, 'EDIT_BOOKING', 'bookings', bookingNumber, {
        totalAmount,
        itemCount: modifiedBookings.length,
        deletedCount: deletedIds.length
      });

      window.dispatchEvent(new Event('online'));
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
              {plants?.map(p => (
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
    </div>
  );
}
