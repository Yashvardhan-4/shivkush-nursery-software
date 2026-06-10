'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db, logAudit } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2 } from 'lucide-react';
import Link from 'next/link';

interface CartItem {
  id: string;
  plantId: string;
  plantName: string;
  quantity: number;
  price: number;
  amount: number;
}

export default function NewDirectSalePage() {
  const [saleNumber, setSaleNumber] = useState('SALE-...');
  
  useEffect(() => {
    async function initNum() {
      const sales = await db.direct_sales.toArray();
      const uniqueSales = new Set(sales.map(s => s.sale_number));
      setSaleNumber(`SALE-${uniqueSales.size + 1001}`);
    }
    initNum();
  }, []);
  
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Current Item State
  const [plantId, setPlantId] = useState('');
  const [quantity, setQuantity] = useState('');
  
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Split'>('Cash');
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Load all needed data for stock calculation
  const plants = useLiveQuery(() => db.plants.toArray());
  const lots = useLiveQuery(() => db.lots.toArray());
  const allotments = useLiveQuery(() => db.allotments.toArray());
  const bookings = useLiveQuery(() => db.bookings.toArray());
  const existingSales = useLiveQuery(() => db.direct_sales.toArray());

  const selectedPlant = plants?.find(p => p.id === plantId);

  // Compute freeStock for a given plantId using all loaded data
  const computeFreeStock = (pid: string): number => {
    if (!lots || !allotments || !bookings || !existingSales) return 0;

    const totalStock = lots
      .filter(l => l.plant_id === pid)
      .reduce((s, l) => s + l.total_quantity, 0);

    const plantBookingIds = new Set(
      bookings.filter(b => b.plant_id === pid).map(b => b.id)
    );
    const allottedQty = allotments
      .filter(a => plantBookingIds.has(a.booking_id))
      .reduce((s, a) => s + a.quantity, 0);

    const soldQty = existingSales
      .filter(s => s.plant_id === pid)
      .reduce((s, sale) => s + sale.quantity, 0);

    // Also subtract already-in-cart qty for this plant
    const cartQty = cart
      .filter(item => item.plantId === pid)
      .reduce((s, item) => s + item.quantity, 0);

    return Math.max(0, totalStock - allottedQty - soldQty - cartQty);
  };

  // Get freeStock for the selected plant (for display in qty section)
  const selectedFreeStock = plantId ? computeFreeStock(plantId) : null;

  const handleAddToCart = () => {
    if (!selectedPlant || !quantity) return;
    
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) return;

    const freeStock = computeFreeStock(selectedPlant.id);
    if (qty > freeStock) {
      const booked = (lots?.filter(l => l.plant_id === selectedPlant.id).reduce((s, l) => s + l.total_quantity, 0) ?? 0)
        - freeStock - (existingSales?.filter(s => s.plant_id === selectedPlant.id).reduce((s, sale) => s + sale.quantity, 0) ?? 0);
      alert(
        `Only ${freeStock} plants are free to sell. ${booked > 0 ? booked + ' are reserved for bookings.' : 'Stock limit reached.'}`
      );
      return;
    }

    const price = selectedPlant.selling_price || 0;
    
    setCart([...cart, {
      id: crypto.randomUUID(),
      plantId: selectedPlant.id,
      plantName: selectedPlant.plant_name,
      quantity: qty,
      price: price,
      amount: price * qty
    }]);

    // Reset current item
    setPlantId('');
    setQuantity('');
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.amount, 0);

  // Split payment computed values
  const cashNum = parseFloat(cashAmount) || 0;
  const upiNum = parseFloat(upiAmount) || 0;
  const splitTotal = cashNum + upiNum;
  const splitRemaining = totalAmount - splitTotal;
  const splitValid = paymentMode !== 'Split' || Math.abs(splitRemaining) < 0.01;

  // Auto-fill the other field when one is entered in Split mode
  const handleCashChange = (val: string) => {
    setCashAmount(val);
    const c = parseFloat(val) || 0;
    if (c <= totalAmount) setUpiAmount(String(Math.round((totalAmount - c) * 100) / 100));
  };
  const handleUpiChange = (val: string) => {
    setUpiAmount(val);
    const u = parseFloat(val) || 0;
    if (u <= totalAmount) setCashAmount(String(Math.round((totalAmount - u) * 100) / 100));
  };

  // When mode changes, reset split fields and pre-fill for convenience
  const handleModeChange = (mode: 'Cash' | 'UPI' | 'Split') => {
    setPaymentMode(mode);
    if (mode === 'Cash') { setCashAmount(String(totalAmount)); setUpiAmount('0'); }
    else if (mode === 'UPI') { setUpiAmount(String(totalAmount)); setCashAmount('0'); }
    else { setCashAmount(''); setUpiAmount(''); }
  };

  const handleSaveSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return alert('Add at least one plant to the sale.');
    if (!splitValid) return alert(`Split amounts must add up to ₹${totalAmount}. You are ₹${Math.abs(splitRemaining)} ${splitRemaining > 0 ? 'short' : 'over'}.`);
    setLoading(true);

    const userStr = localStorage.getItem('snms_user');
    const user = userStr ? JSON.parse(userStr) : { id: 'unknown', name: 'Unknown' };
    const createdAt = new Date().toISOString();

    // Determine actual cash/upi amounts saved
    const finalCash = paymentMode === 'Cash' ? totalAmount : paymentMode === 'UPI' ? 0 : cashNum;
    const finalUpi  = paymentMode === 'UPI'  ? totalAmount : paymentMode === 'Cash' ? 0 : upiNum;

    const newSales = cart.map((item) => ({
      id: crypto.randomUUID(),
      sale_number: saleNumber,
      customer_name: customerName || undefined,
      customer_phone: customerPhone || undefined,
      plant_id: item.plantId,
      quantity: item.quantity,
      amount: item.amount,
      payment_mode: paymentMode,
      cash_amount: finalCash,
      upi_amount: finalUpi,
      worker_id: user.id,
      sync_status: 'pending' as const,
      created_at: createdAt
    }));

    await db.direct_sales.bulkAdd(newSales);
    
    for (const s of newSales) {
      await db.sync_queue.add({
        table: 'direct_sales',
        action: 'INSERT',
        payload: s,
        created_at: Date.now()
      });
    }

    // Audit log for the entire sale
    await logAudit(user.id, user.name, 'CREATE_SALE', 'direct_sales', saleNumber, {
      totalAmount,
      plantCount: cart.length
    });

    window.dispatchEvent(new Event('online'));
    router.push('/dashboard');
  };

  return (
    <div className="p-6 mb-24 space-y-6">
      <header className="mb-4">
        <div className="flex justify-between items-end">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Direct Sale</h1>
          <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg text-sm font-black border border-gray-200">
            {saleNumber}
          </span>
        </div>
      </header>

      <form onSubmit={handleSaveSale} className="space-y-6">
        {/* Optional Customer Details */}
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
          <h2 className="font-black text-gray-800 border-b border-gray-100 pb-2">Customer (Optional)</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase">Name</label>
              <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold" placeholder="Ramesh" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase">Phone</label>
              <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold" placeholder="9876..." />
            </div>
          </div>
        </div>

        {/* Cart Addition */}
        <div className="bg-green-50 p-5 rounded-3xl border border-green-200 space-y-4">
          <div className="flex justify-between items-center border-b border-green-200 pb-2">
            <h2 className="font-black text-green-900">Add Plants</h2>
            <Link href="/plants/new" className="text-xs font-bold text-green-700 bg-white px-3 py-1 rounded-full shadow-sm hover:bg-green-100">+ New Plant</Link>
          </div>
          
          <div className="space-y-2">
            <select value={plantId} onChange={e => { setPlantId(e.target.value); setQuantity(''); }} className="w-full p-4 bg-white border border-green-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-lg text-green-900">
              <option value="">Choose plant...</option>
              {plants?.map(p => {
                const fs = computeFreeStock(p.id);
                return (
                  <option key={p.id} value={p.id}>
                    {p.plant_name} — ₹{p.selling_price} (Free: {fs})
                  </option>
                );
              })}
            </select>
          </div>

          {plantId && (
            <div className="space-y-2">
              {/* Free stock indicator */}
              {selectedFreeStock !== null && (
                <div className={`flex items-center justify-between px-4 py-2 rounded-xl text-sm font-bold ${selectedFreeStock > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  <span>Available to sell</span>
                  <span className="text-lg font-black">{selectedFreeStock}</span>
                </div>
              )}
              <div className="flex space-x-2">
                <input
                  type="number"
                  min="1"
                  max={selectedFreeStock ?? undefined}
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  className="w-2/3 p-4 bg-white border border-green-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-black text-2xl text-green-900"
                  placeholder="Qty"
                />
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!quantity || (selectedFreeStock !== null && selectedFreeStock <= 0)}
                  className="w-1/3 bg-green-600 text-white rounded-xl font-black flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform"
                >
                  ADD
                </button>
              </div>
              {selectedFreeStock !== null && selectedFreeStock <= 0 && (
                <p className="text-xs font-bold text-red-600 text-center">All stock is reserved or sold out.</p>
              )}
            </div>
          )}
        </div>

        {/* Cart Display */}
        {cart.length > 0 && (
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-black text-gray-800 border-b border-gray-100 pb-2">Bill Summary</h2>
            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <div>
                    <p className="font-bold text-gray-900">{item.plantName}</p>
                    <p className="text-xs font-semibold text-gray-500">{item.quantity} x ₹{item.price}</p>
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
              <span className="font-black text-3xl text-gray-900">₹{totalAmount}</span>
            </div>

            {/* Payment Mode Selection */}
            <div className="pt-4 space-y-3">
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Payment Mode</p>
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

              {/* Split input fields */}
              {paymentMode === 'Split' && (
                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-3">
                  <p className="text-xs font-black text-purple-700 uppercase tracking-wider">Enter Split Amounts</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-green-700">💵 Cash (₹)</label>
                      <input
                        type="number"
                        min="0"
                        max={totalAmount}
                        step="0.01"
                        value={cashAmount}
                        onChange={e => handleCashChange(e.target.value)}
                        className="w-full p-3 bg-white border-2 border-green-200 rounded-xl outline-none focus:border-green-500 font-black text-xl text-green-800"
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-blue-700">📱 UPI (₹)</label>
                      <input
                        type="number"
                        min="0"
                        max={totalAmount}
                        step="0.01"
                        value={upiAmount}
                        onChange={e => handleUpiChange(e.target.value)}
                        className="w-full p-3 bg-white border-2 border-blue-200 rounded-xl outline-none focus:border-blue-500 font-black text-xl text-blue-800"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  {/* Live balance indicator */}
                  <div className={`flex justify-between items-center px-4 py-3 rounded-xl font-black text-sm ${
                    splitValid ? 'bg-green-100 text-green-800 border border-green-200' :
                    splitRemaining > 0 ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                    'bg-red-100 text-red-800 border border-red-200'
                  }`}>
                    <span>{splitValid ? '✅ Split is correct!' : splitRemaining > 0 ? `₹${splitRemaining.toFixed(0)} still unaccounted` : `₹${Math.abs(splitRemaining).toFixed(0)} over total`}</span>
                    <span>Total: ₹{totalAmount}</span>
                  </div>
                </div>
              )}

              {/* Summary pill for Cash/UPI */}
              {paymentMode !== 'Split' && (
                <div className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-black ${
                  paymentMode === 'Cash' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
                }`}>
                  {paymentMode === 'Cash' ? '💵 Full payment in Cash' : '📱 Full payment via UPI'}
                </div>
              )}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || cart.length === 0 || !splitValid}
          className={`w-full font-black text-xl p-5 rounded-2xl active:scale-95 transition-transform disabled:opacity-50 shadow-xl text-white ${
            paymentMode === 'Cash' ? 'bg-green-700' :
            paymentMode === 'UPI' ? 'bg-blue-700' :
            'bg-purple-700'
          }`}
        >
          {loading ? 'Processing...' : `Collect ₹${totalAmount} · ${
            paymentMode === 'Cash' ? 'Cash' :
            paymentMode === 'UPI' ? 'UPI' :
            `₹${cashNum} Cash + ₹${upiNum} UPI`
          }`}
        </button>
      </form>
    </div>
  );
}
