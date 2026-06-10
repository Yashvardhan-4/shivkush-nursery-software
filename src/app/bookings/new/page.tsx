'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { PlusCircle, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface CartItem {
  id: string;
  plantId: string;
  plantName: string;
  lotId: string;
  lotName: string;
  quantity: number;
  price: number;
  amount: number;
}

export default function NewBookingPage() {
  const [bookingNumber, setBookingNumber] = useState('BKG-...');
  
  useEffect(() => {
    async function initNum() {
      const bookings = await db.bookings.toArray();
      const uniqueBookings = new Set(bookings.map(b => b.booking_number));
      setBookingNumber(`BKG-${uniqueBookings.size + 1001}`);
    }
    initNum();
  }, []);
  
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [city, setCity] = useState('');
  
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
  const router = useRouter();

  const plants = useLiveQuery(() => db.plants.toArray());
  const lots = useLiveQuery(() => db.lots.where('plant_id').equals(plantId).toArray(), [plantId]);
  const bookings = useLiveQuery(() => db.bookings.toArray());

  const selectedPlant = plants?.find(p => p.id === plantId);
  const selectedLot = lots?.find(l => l.id === lotId);

  const bookedQty = bookings?.filter(b => b.lot_id === lotId && b.status !== 'Cancelled' && b.status !== 'Delivered').reduce((sum, b) => sum + b.quantity, 0) || 0;
  const availableQty = selectedLot ? selectedLot.total_quantity - bookedQty : 0;

  const handleAddToCart = () => {
    if (!selectedPlant || !quantity) return;
    
    const qty = parseInt(quantity);
    const price = selectedPlant.selling_price || 0;
    
    setCart([...cart, {
      id: crypto.randomUUID(),
      plantId: selectedPlant.id,
      plantName: selectedPlant.variety ? `${selectedPlant.plant_name} - ${selectedPlant.variety}` : selectedPlant.plant_name,
      lotId: selectedLot?.id || '',
      lotName: selectedLot?.lot_number || 'Any Lot',
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

  const handleCashChange = (val: string) => {
    setCashAmount(val);
    const c = parseFloat(val) || 0;
    if (c <= advanceNum) setUpiAmount(String(Math.round((advanceNum - c) * 100) / 100));
  };
  const handleUpiChange = (val: string) => {
    setUpiAmount(val);
    const u = parseFloat(val) || 0;
    if (u <= advanceNum) setCashAmount(String(Math.round((advanceNum - u) * 100) / 100));
  };
  const handleModeChange = (mode: 'Cash' | 'UPI' | 'Split') => {
    setPaymentMode(mode);
    if (mode === 'Cash') { setCashAmount(String(advanceNum)); setUpiAmount('0'); }
    else if (mode === 'UPI') { setUpiAmount(String(advanceNum)); setCashAmount('0'); }
    else { setCashAmount(''); setUpiAmount(''); }
  };
  const handleAdvanceChange = (val: string) => {
    setAdvancePaid(val);
    const adv = parseFloat(val) || 0;
    if (paymentMode === 'Cash') { setCashAmount(String(adv)); setUpiAmount('0'); }
    else if (paymentMode === 'UPI') { setUpiAmount(String(adv)); setCashAmount('0'); }
  };

  const handleSaveBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return alert('Add at least one plant to the booking.');
    
    setLoading(true);

    const userStr = localStorage.getItem('snms_user');
    const user = userStr ? JSON.parse(userStr) : { id: 'unknown' };
    const advance = parseFloat(advancePaid) || 0;
    const createdAt = new Date().toISOString();

    const finalCash = paymentMode === 'Cash' ? advance : paymentMode === 'UPI' ? 0 : cashNum;
    const finalUpi  = paymentMode === 'UPI'  ? advance : paymentMode === 'Cash' ? 0 : upiNum;

    // Apportion advance across items (or just attach full advance to the first item for accounting simplicity)
    let advanceRemaining = advance;
    let cashRemaining = finalCash;
    let upiRemaining = finalUpi;

    const newBookings = cart.map((item, index) => {
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
      
      // If it's the last item and we still have advance (overpayment), attach it all.
      if (index === cart.length - 1 && advanceRemaining > 0) {
        itemAdvance += advanceRemaining;
        itemCash += cashRemaining;
        itemUpi += upiRemaining;
      }

      const itemPayMode: 'Cash' | 'UPI' | 'Split' = (itemCash > 0 && itemUpi > 0) ? 'Split' : (itemUpi > 0 ? 'UPI' : 'Cash');
      const finalItemPayMode = itemAdvance > 0 ? itemPayMode : null;

      return {
        id: crypto.randomUUID(),
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
        booking_date: createdAt,
        delivery_date: null,
        status: 'Pending' as const,
        worker_id: user.id,
        sync_status: 'pending' as const,
        created_at: createdAt,
        remarks: ''
      };
    });

    if (customerPhone && customerName) {
      let cust = await db.customers.where('mobile').equals(customerPhone).first();
      if (!cust) {
        cust = { id: crypto.randomUUID(), name: customerName, mobile: customerPhone, city: city || null };
        await db.customers.add(cust);
      } else {
        cust.name = customerName;
        if (city) cust.city = city;
        await db.customers.put(cust);
      }
      await db.sync_queue.add({ table: 'customers', action: 'INSERT', payload: cust, created_at: Date.now() });
    }

    await db.bookings.bulkAdd(newBookings);
    
    for (const b of newBookings) {
      await db.sync_queue.add({
        table: 'bookings',
        action: 'INSERT',
        payload: b,
        created_at: Date.now()
      });
    }

    window.dispatchEvent(new Event('online'));
    router.push('/bookings');
  };

  return (
    <div className="p-6 mb-24 space-y-6">
      <header className="mb-4">
        <div className="flex justify-between items-end">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">New Booking</h1>
          <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg text-sm font-black border border-gray-200">
            {bookingNumber}
          </span>
        </div>
      </header>

      <form onSubmit={handleSaveBooking} className="space-y-6">
        {/* Customer Details */}
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
          <h2 className="font-black text-gray-800 border-b border-gray-100 pb-2">Customer Details</h2>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase">Customer Name</label>
            <input required type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" placeholder="e.g. Ramesh Kumar" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase">Phone</label>
              <input required type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" placeholder="9876543210" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase">City</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" placeholder="Pune" />
            </div>
          </div>
        </div>

        {/* Cart Addition */}
        <div className="bg-blue-50 p-5 rounded-3xl border border-blue-100 space-y-4">
          <div className="flex justify-between items-center border-b border-blue-200 pb-2">
            <h2 className="font-black text-blue-900">Add Plants</h2>
            <Link href="/plants/new" className="text-xs font-bold text-blue-600 bg-white px-3 py-1 rounded-full shadow-sm hover:bg-blue-100">+ New Plant</Link>
          </div>
          
          <div className="space-y-2">
            <select value={plantId} onChange={e => { setPlantId(e.target.value); setLotId(''); }} className="w-full p-4 bg-white border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-lg text-blue-900">
              <option value="">Choose plant...</option>
              {plants?.map(p => (
                <option key={p.id} value={p.id}>{p.variety ? `${p.plant_name} - ${p.variety}` : p.plant_name} (₹{p.selling_price})</option>
              ))}
            </select>
          </div>

          {plantId && lots && lots.length > 0 && (
            <div className="space-y-2">
              <select value={lotId} onChange={e => setLotId(e.target.value)} className="w-full p-4 bg-white border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-blue-900">
                <option value="">Any Lot</option>
                {lots.map(l => {
                  const lotBookedQty = bookings?.filter(b => b.lot_id === l.id && b.status !== 'Cancelled').reduce((sum, b) => sum + b.quantity, 0) || 0;
                  return (
                    <option key={l.id} value={l.id}>{l.lot_number} (Available: {l.total_quantity - lotBookedQty})</option>
                  );
                })}
              </select>
            </div>
          )}

          {plantId && (
            <div className="flex space-x-2">
              <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-2/3 p-4 bg-white border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-black text-2xl text-blue-900" placeholder="Qty" />
              <button type="button" onClick={handleAddToCart} disabled={!quantity} className="w-1/3 bg-blue-600 text-white rounded-xl font-black flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform">
                ADD
              </button>
            </div>
          )}
        </div>

        {/* Cart Display */}
        {cart.length > 0 && (
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-black text-gray-800 border-b border-gray-100 pb-2">Order Summary</h2>
            <div className="space-y-3">
              {cart.map((item, idx) => (
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
              <span className="font-bold text-gray-500 uppercase tracking-widest text-xs">Total Amount</span>
              <span className="font-black text-2xl text-gray-900">₹{totalAmount}</span>
            </div>

            <div className="space-y-2 pt-4">
              <label className="text-xs font-bold text-gray-500 uppercase">Advance Paid (₹)</label>
              <input type="number" min="0" max={totalAmount} value={advancePaid} onChange={e => handleAdvanceChange(e.target.value)} className="w-full p-4 bg-green-50 border border-green-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-black text-2xl text-green-700" placeholder="0" />
            </div>

            {/* Advance Payment Mode */}
            {parseFloat(advancePaid) > 0 && (
              <div className="pt-4 space-y-3 border-t border-gray-100 mt-4">
                <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Advance Payment Mode</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleModeChange('Cash')}
                    className={`py-4 rounded-2xl font-black text-sm transition-all active:scale-95 ${
                      paymentMode === 'Cash' ? 'bg-green-600 text-white shadow-lg shadow-green-200 scale-105' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    💵 CASH
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange('UPI')}
                    className={`py-4 rounded-2xl font-black text-sm transition-all active:scale-95 ${
                      paymentMode === 'UPI' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-105' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    📱 UPI
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange('Split')}
                    className={`py-4 rounded-2xl font-black text-sm transition-all active:scale-95 ${
                      paymentMode === 'Split' ? 'bg-purple-600 text-white shadow-lg shadow-purple-200 scale-105' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    ✂️ SPLIT
                  </button>
                </div>

                {paymentMode === 'Split' && (
                  <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-3">
                    <p className="text-xs font-black text-purple-700 uppercase tracking-wider">Enter Split Amounts</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-green-700">💵 Cash (₹)</label>
                        <input
                          type="number" min="0" max={advanceNum} step="0.01"
                          value={cashAmount} onChange={e => handleCashChange(e.target.value)}
                          className="w-full p-3 bg-white border-2 border-green-200 rounded-xl outline-none focus:border-green-500 font-black text-xl text-green-800"
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-blue-700">📱 UPI (₹)</label>
                        <input
                          type="number" min="0" max={advanceNum} step="0.01"
                          value={upiAmount} onChange={e => handleUpiChange(e.target.value)}
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
                      <span>{splitValid ? '✅ Split is correct!' : splitRemaining > 0 ? `₹${splitRemaining.toFixed(0)} short` : `₹${Math.abs(splitRemaining).toFixed(0)} over`}</span>
                      <span>Total: ₹{advanceNum}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <button type="submit" disabled={loading || cart.length === 0 || !splitValid} className="w-full bg-gray-900 text-white font-black text-xl p-5 rounded-2xl active:scale-95 transition-transform disabled:opacity-50 shadow-xl">
          {loading ? 'Processing...' : 'Confirm Entire Booking'}
        </button>
      </form>
    </div>
  );
}
