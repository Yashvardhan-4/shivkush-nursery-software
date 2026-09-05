'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, User, Plus, Trash2, X, QrCode, WifiOff, Receipt, CheckCircle2, ArrowRight } from 'lucide-react';
import { generateId, logAudit, resolvePlantPrice } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface CartItem {
  id: string;
  plantId: string;
  plantName: string;
  quantity: number;
  price: number;
  amount: number;
}

export default function NewDirectSalePage() {
  const { t } = useLanguage();
  const [saleNumber, setSaleNumber] = useState('SL-...');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(true);
  const isSubmittingRef = useRef(false);
  
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const d = new Date();
    const yy = d.getFullYear().toString().slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const random = Math.floor(100 + Math.random() * 900).toString();
    setSaleNumber(`SL-${yy}${mm}${dd}-${hh}${min}${ss}-${random}`);
    const userStr = localStorage.getItem('snms_user');
    if (userStr) setCurrentUser(JSON.parse(userStr));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [completedReceipt, setCompletedReceipt] = useState<any>(null);
  
  const { data: activeQrs } = useQuery({
    queryKey: ['payment_qrs'],
    queryFn: async () => {
      const { data } = await supabase.from('payment_qrs').select('*').eq('active', true).is('deleted_at', null);
      return data || [];
    }
  });
  const [showQR, setShowQR] = useState(false);
  
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Current Item State
  const [plantId, setPlantId] = useState('');
  const [quantity, setQuantity] = useState('');
  
  const [assignedTo, setAssignedTo] = useState('');
  
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Split'>('Cash');
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const queryClient = useQueryClient();

  const { data: plants } = useQuery({ queryKey: ['plants'], queryFn: async () => { const { data } = await supabase.from('plants').select('*').is('deleted_at', null).eq('active', true); return data || []; } });
  const { data: existingSales } = useQuery({ queryKey: ['direct_sales'], queryFn: async () => { const { data } = await supabase.from('direct_sales').select('*').is('deleted_at', null); return data || []; } });
  const { data: inventory } = useQuery({ queryKey: ['vw_inventory_status'], queryFn: async () => { const { data } = await supabase.from('vw_inventory_status').select('*'); return data || []; } });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: async () => { const { data } = await supabase.from('customers').select('*').is('deleted_at', null); return data || []; } });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: async () => { const { data } = await supabase.from('users').select('*'); return data || []; } });
  const workers = users?.filter(u => u.role === 'worker') || [];

  const selectedPlant = plants?.find(p => p.id === plantId);

  // Auto-complete triggers
  const handlePhoneChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 10);
    setCustomerPhone(digits);
    if (digits.length === 10 && customers) {
      const found = customers.find(c => c.mobile === digits);
      if (found) {
        setCustomerName(found.name);
        setCustomerCity(found.city || '');
      }
    }
  };

  const handleNameChange = (val: string) => {
    setCustomerName(val);
    if (customers) {
      const matches = customers.filter(c => c.name.toLowerCase() === val.toLowerCase());
      if (matches.length === 1) {
        setCustomerPhone(matches[0].mobile);
        setCustomerCity(matches[0].city || '');
      }
    }
  };

  // Free stock directly for a plant (adjusted for items already in current cart)
  const getCartAdjustedFreeStock = (pid: string): number => {
    if (!inventory) return 0;
    const inv = inventory.find((i: any) => i.plant_id === pid);
    if (!inv) return 0;
    const cartQty = cart.filter(i => i.plantId === pid).reduce((s, i) => s + i.quantity, 0);
    return Math.max(0, (inv.free_stock ?? 0) - cartQty);
  };

  const getPhysicalStock = (pid: string): number => {
    if (!inventory) return 0;
    const inv = inventory.find((i: any) => i.plant_id === pid);
    return inv ? (inv.current_physical_stock ?? 0) : 0;
  };

  const handleAddToCart = () => {
    if (!selectedPlant || !quantity) return;
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) return;

    const freeStock = getCartAdjustedFreeStock(selectedPlant.id);
    if (qty > freeStock) {
      alert(`Only ${freeStock} plants free to sell. Some may be reserved for bookings.`);
      return;
    }

    const price = resolvePlantPrice(selectedPlant, qty);

    setCart([...cart, {
      id: generateId(),
      plantId: selectedPlant.id,
      plantName: selectedPlant.variety ? `${selectedPlant.plant_name} - ${selectedPlant.variety}` : selectedPlant.plant_name,
      quantity: qty,
      price,
      amount: price * qty
    }]);
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
    else { 
      const half = Math.floor(totalAmount / 2);
      setCashAmount(String(half)); 
      setUpiAmount(String(totalAmount - half)); 
    }
  };

  const handleSaveSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!navigator.onLine) {
      alert('You are currently offline. Please connect to the internet to complete the sale.');
      return;
    }
    if (isSubmittingRef.current || loading) return;
    if (cart.length === 0) return alert(t('addAtLeastOnePlantError'));
    if (!splitValid) return alert(t('splitAmountsMismatchError').replace('{totalAmount}', String(totalAmount)));

    isSubmittingRef.current = true;
    setLoading(true);

    try {
      const user = currentUser || { id: 'unknown', name: 'Unknown' };
      const createdAt = new Date().toISOString();

    // Determine actual cash/upi amounts saved
    const finalCash = paymentMode === 'Cash' ? totalAmount : paymentMode === 'UPI' ? 0 : cashNum;
    const finalUpi  = paymentMode === 'UPI'  ? totalAmount : paymentMode === 'Cash' ? 0 : upiNum;

    let cashRemaining = finalCash;
    let upiRemaining = finalUpi;

    const newSales = cart.map((item, index) => {
      let itemCash = 0;
      let itemUpi = 0;

      if (cashRemaining >= item.amount) {
        itemCash = item.amount;
        cashRemaining -= item.amount;
      } else {
        itemCash = cashRemaining;
        cashRemaining = 0;
        itemUpi = Math.min(item.amount - itemCash, upiRemaining);
        upiRemaining -= itemUpi;
      }

      if (index === cart.length - 1) {
        itemCash += cashRemaining;
        itemUpi += upiRemaining;
      }

      const itemPayMode: 'Cash' | 'UPI' | 'Split' = (itemCash > 0 && itemUpi > 0) ? 'Split' : (itemUpi > 0 ? 'UPI' : 'Cash');

      return {
        id: generateId(),
        sale_number: saleNumber,
        customer_name: customerName || undefined,
        customer_phone: customerPhone || undefined,
        plant_id: item.plantId,
        quantity: item.quantity,
        amount: item.amount,
        payment_mode: itemPayMode,
        cash_amount: itemCash,
        upi_amount: itemUpi,
        worker_id: user.id,
        assigned_to: assignedTo || null,
        fulfillment_status: assignedTo ? 'Pending Handover' : 'Fulfilled',
        created_at: createdAt
      };
    });

    const auditPayload = {
      user_id: user.id || '00000000-0000-0000-0000-000000000000',
      user_name: user.name || 'Owner',
      action: 'CREATE_SALE',
      details: { totalAmount, plantCount: cart.length }
    };

    const customerPayload = {
      name: customerName,
      mobile: customerPhone,
      city: customerCity || null
    };

    const { error } = await supabase.rpc('process_direct_sales_batch', {
      p_sales: newSales,
      p_customer: customerPayload,
      p_audit: auditPayload
    });

    if (error) {
      console.error(error);
      alert('Failed to save direct sale: ' + (error.message || ''));
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['customers'] });
    queryClient.invalidateQueries({ queryKey: ['direct_sales'] });
    queryClient.invalidateQueries({ queryKey: ['vw_daily_cashbook'] });
    queryClient.invalidateQueries({ queryKey: ['vw_profit_summary'] });
    queryClient.invalidateQueries({ queryKey: ['vw_inventory_status'] });

    setCompletedReceipt({
      saleNumber,
      customerName: customerName || 'Walk-in Customer',
      customerPhone: customerPhone || '—',
      customerCity: customerCity || '—',
      items: [...cart],
      totalAmount,
      paymentMode,
      cashAmount: finalCash,
      upiAmount: finalUpi,
      workerName: currentUser?.name || 'Owner',
      createdAt: new Date().toISOString()
    });
  } catch (err: any) {
    console.error(err);
    alert('Unexpected error saving direct sale: ' + (err.message || ''));
  } finally {
    isSubmittingRef.current = false;
    setLoading(false);
  }
};

  const resetFormForNewSale = () => {
    const d = new Date();
    const yy = d.getFullYear().toString().slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const random = Math.floor(100 + Math.random() * 900).toString();
    setSaleNumber(`SL-${yy}${mm}${dd}-${hh}${min}${ss}-${random}`);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerCity('');
    setCart([]);
    setPlantId('');
    setQuantity('');
    setCashAmount('');
    setUpiAmount('');
    setPaymentMode('Cash');
    setAssignedTo('');
    setCompletedReceipt(null);
  };

  if (completedReceipt) {
    return (
      <div className="p-6 mb-24 max-w-lg mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Success Badge */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">Sale Confirmed!</h1>
          <p className="text-sm font-semibold text-gray-500">Transaction recorded successfully</p>
        </div>

        {/* Printable Receipt Paper */}
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-3xl p-6 shadow-sm space-y-5">
          <div className="text-center border-b border-gray-100 pb-4">
            <h2 className="text-lg font-black text-gray-900 tracking-tight">SHIVKUSH NURSERY</h2>
            <p className="text-xs text-gray-400 font-bold">Official Sales Receipt</p>
            <span className="inline-block mt-2 px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-black">
              #{completedReceipt.saleNumber}
            </span>
          </div>

          {/* Customer & Date Info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-400 font-bold block uppercase">Customer</span>
              <strong className="text-gray-900 font-bold">{completedReceipt.customerName}</strong>
              <p className="text-gray-500">{completedReceipt.customerPhone}</p>
              {completedReceipt.customerCity !== '—' && <p className="text-gray-400">{completedReceipt.customerCity}</p>}
            </div>
            <div className="text-right">
              <span className="text-gray-400 font-bold block uppercase">Date & Time</span>
              <strong className="text-gray-900 font-bold">
                {new Date(completedReceipt.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </strong>
              <p className="text-gray-500">
                {new Date(completedReceipt.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
              </p>
            </div>
          </div>

          {/* Purchased Items List */}
          <div className="border-t border-b border-gray-100 py-3 space-y-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Items Purchased</p>
            {completedReceipt.items.map((it: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center text-xs">
                <div>
                  <p className="font-bold text-gray-800">{it.plantName}</p>
                  <p className="text-gray-400 text-[11px]">{it.quantity} units @ ₹{it.price}</p>
                </div>
                <span className="font-black text-gray-900">₹{it.amount}</span>
              </div>
            ))}
          </div>

          {/* Payment Summary */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center text-base">
              <span className="font-black text-gray-900">Total Paid:</span>
              <span className="font-black text-green-600 text-xl">₹{completedReceipt.totalAmount.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between text-gray-500 font-medium pt-1 border-t border-gray-50">
              <span>Payment Mode:</span>
              <span className="font-bold text-gray-700">{completedReceipt.paymentMode}</span>
            </div>
            {completedReceipt.cashAmount > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Cash Paid:</span>
                <span className="font-bold text-gray-700">₹{completedReceipt.cashAmount}</span>
              </div>
            )}
            {completedReceipt.upiAmount > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>UPI Paid:</span>
                <span className="font-bold text-gray-700">₹{completedReceipt.upiAmount}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-400 pt-2 border-t border-gray-50 text-[11px]">
              <span>Recorded By:</span>
              <span className="font-semibold text-gray-600">{completedReceipt.workerName}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="w-full py-4 bg-gray-900 hover:bg-black text-white font-black rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md"
          >
            <Receipt className="w-5 h-5" /> Print / Share Slip
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={resetFormForNewSale}
              className="py-3.5 bg-green-50 hover:bg-green-100 text-green-700 font-black rounded-xl text-center active:scale-95 transition-all border border-green-200"
            >
              + New Sale
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-black rounded-xl text-center active:scale-95 transition-all"
            >
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 mb-24 space-y-6">
      <header className="mb-4">
        <div className="flex justify-between items-end">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">{t('directSale')}</h1>
          <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg text-sm font-black border border-gray-200">
            {saleNumber}
          </span>
        </div>
      </header>

      <form onSubmit={handleSaveSale} className="space-y-6">
        {/* Optional Customer Details */}
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
          <h2 className="font-black text-gray-800 border-b border-gray-100 pb-2">{t('customerDetails')} ({t('optional')})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase">{t('customerName')}</label>
              <input 
                type="text" 
                value={customerName} 
                onChange={e => handleNameChange(e.target.value)} 
                list="customer-names"
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold" 
                placeholder="Ramesh" 
              />
              <datalist id="customer-names">
                {customers?.map(c => (
                  <option key={c.id} value={c.name}>{c.mobile}</option>
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase">{t('customerPhone')}</label>
              <input 
                type="tel" 
                pattern="[0-9]{10}"
                maxLength={10}
                title="Phone number must be exactly 10 digits"
                value={customerPhone} 
                onChange={e => handlePhoneChange(e.target.value)} 
                list="customer-phones"
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold" 
                placeholder="9876543210" 
              />
              <datalist id="customer-phones">
                {customers?.map(c => (
                  <option key={c.id} value={c.mobile}>{c.name}</option>
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase">City / Village</label>
              <input 
                type="text" 
                value={customerCity} 
                onChange={e => setCustomerCity(e.target.value)} 
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold" 
                placeholder="Pune" 
              />
            </div>
          </div>
        </div>

        {/* Worker Assignment (Optional) */}
        {workers.length > 0 && currentUser?.role === 'owner' && (
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-black text-gray-800 border-b border-gray-100 pb-2">Order Fulfillment</h2>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase">Assign to Worker (Optional)</label>
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold"
              >
                <option value="">-- Owner will handle delivery --</option>
                {workers.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 font-medium">If assigned, the worker will see this order in their pending fulfillment queue.</p>
            </div>
          </div>
        )}

        {/* Cart Addition */}
        <div className="bg-green-50 p-5 rounded-3xl border border-green-200 space-y-4">
          <div className="flex justify-between items-center border-b border-green-200 pb-2">
            <h2 className="font-black text-green-900">{t('addPlants')}</h2>
            <Link href="/plants/new" className="text-xs font-bold text-green-700 bg-white px-3 py-1 rounded-full shadow-sm hover:bg-green-100">+ New Plant</Link>
          </div>
          
          <div className="space-y-2">
            <select value={plantId} onChange={e => { setPlantId(e.target.value); setQuantity(''); }} className="w-full p-4 bg-white border border-green-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-lg text-green-900">
              <option value="">{t('choosePlantPlaceholder')}</option>
              {plants?.filter(p => p.active !== false).map(p => {
                const fs = getCartAdjustedFreeStock(p.id);
                return (
                  <option key={p.id} value={p.id}>
                    {p.variety ? `${p.plant_name} - ${p.variety}` : p.plant_name} — ₹{p.selling_price} ({t('free')}: {fs})
                  </option>
                );
              })}
            </select>
          </div>

          {plantId && (
            <div className="space-y-3">
              {/* Plant stock indicator */}
              <div className="bg-white p-3.5 rounded-xl border border-green-200 flex items-center justify-between text-xs">
                <span className="font-bold text-gray-600">Physical Stock: <strong className="text-gray-900">{getPhysicalStock(plantId)}</strong></span>
                <span className="font-bold text-green-700">Free to Sell: <strong className="text-lg font-black text-green-700">{getCartAdjustedFreeStock(plantId)}</strong></span>
              </div>

              <div className="flex space-x-2">
                <input
                  type="number"
                  min="1"
                  max={getCartAdjustedFreeStock(plantId) || undefined}
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  className="w-2/3 p-4 bg-white border border-green-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-black text-2xl text-green-900"
                  placeholder={t('qtyPlaceholder')}
                />
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!quantity || parseInt(quantity) <= 0 || parseInt(quantity) > getCartAdjustedFreeStock(plantId)}
                  className="w-1/3 bg-green-600 text-white rounded-xl font-black flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform"
                >
                  {t('add')}
                </button>
              </div>

              {getCartAdjustedFreeStock(plantId) <= 0 && (
                <p className="text-xs font-bold text-red-600 text-center">{t('allStockReserved')}</p>
              )}
            </div>
          )}
        </div>

        {/* Cart Display */}
        {cart.length > 0 && (
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-black text-gray-800 border-b border-gray-100 pb-2">{t('billSummary')}</h2>
            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <div>
                    <p className="font-bold text-gray-900">{item.plantName}</p>
                    <p className="text-xs font-semibold text-gray-500">{item.quantity} × ₹{item.price}</p>
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
              <span className="font-black text-3xl text-gray-900">₹{totalAmount}</span>
            </div>

            {/* Payment Mode Selection */}
            <div className="pt-4 space-y-3">
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

              {/* Split input fields */}
              {paymentMode === 'Split' && (
                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-3">
                  <p className="text-xs font-black text-purple-700 uppercase tracking-wider">{t('enterSplitAmounts')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-green-700">{t('cashAmtLabel')}</label>
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
                      <label className="text-xs font-bold text-blue-700">{t('upiAmtLabel')}</label>
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

                  {/* Quick Preset Buttons */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const half = Math.floor(totalAmount / 2);
                        setCashAmount(String(half));
                        setUpiAmount(String(totalAmount - half));
                      }}
                      className="flex-1 py-1.5 px-2 bg-purple-100 hover:bg-purple-200 text-purple-800 text-xs font-bold rounded-xl transition-all active:scale-95"
                    >
                      50% / 50%
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCashAmount(String(totalAmount));
                        setUpiAmount('0');
                      }}
                      className="flex-1 py-1.5 px-2 bg-green-100 hover:bg-green-200 text-green-800 text-xs font-bold rounded-xl transition-all active:scale-95"
                    >
                      All Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCashAmount('0');
                        setUpiAmount(String(totalAmount));
                      }}
                      className="flex-1 py-1.5 px-2 bg-blue-100 hover:bg-blue-200 text-blue-800 text-xs font-bold rounded-xl transition-all active:scale-95"
                    >
                      All UPI
                    </button>
                  </div>

                  {/* Live balance indicator */}
                  <div className={`flex justify-between items-center px-4 py-3 rounded-xl font-black text-sm ${
                    splitValid ? 'bg-green-100 text-green-800 border border-green-200' :
                    splitRemaining > 0 ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                    'bg-red-100 text-red-800 border border-red-200'
                  }`}>
                    <span>{splitValid ? t('splitValidMsg') : splitRemaining > 0 ? t('splitShortMsg').replace('{remaining}', splitRemaining.toFixed(0)) : t('splitOverMsg').replace('{excess}', Math.abs(splitRemaining).toFixed(0))}</span>
                    <span>Total: ₹{totalAmount}</span>
                  </div>
                </div>
              )}

              {/* Summary pill for Cash/UPI */}
              {paymentMode !== 'Split' && (
                <div className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-black ${
                  paymentMode === 'Cash' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
                }`}>
                  {paymentMode === 'Cash' ? t('cashFullMsg') : t('upiFullMsg')}
                </div>
              )}

              {/* Show QR Button */}
              {(paymentMode === 'UPI' || paymentMode === 'Split') && activeQrs && activeQrs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowQR(true)}
                  className="w-full mt-2 py-3 bg-purple-100 text-purple-700 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <QrCode className="w-5 h-5" />
                  Show Payment QR
                </button>
              )}
            </div>
          </div>
        )}

        {!isOnline && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-sm font-bold">
            <WifiOff className="w-5 h-5 shrink-0 text-amber-600" />
            <span>You are offline. Connect to internet to complete sale.</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!isOnline || loading || cart.length === 0 || !splitValid}
          className={`w-full font-black text-xl p-5 rounded-2xl active:scale-95 transition-transform disabled:opacity-50 shadow-xl text-white ${
            !isOnline ? 'bg-gray-400 cursor-not-allowed' :
            paymentMode === 'Cash' ? 'bg-green-700' :
            paymentMode === 'UPI' ? 'bg-blue-700' :
            'bg-purple-700'
          }`}
        >
          {!isOnline ? 'Offline - Cannot Save' : loading ? t('processing') : `${t('collect')} ₹${totalAmount} · ${
            paymentMode === 'Cash' ? t('cash') :
            paymentMode === 'UPI' ? t('upi') :
            `₹${cashNum} ${t('cash')} + ₹${upiNum} ${t('upi')}`
          }`}
        </button>
      </form>

      {/* QR Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-purple-600 p-4 flex justify-between items-center">
              <h3 className="font-black text-white text-lg flex items-center gap-2">
                <QrCode className="w-5 h-5" /> Scan to Pay
              </h3>
              <button onClick={() => setShowQR(false)} className="p-1 rounded-full bg-white/20 text-white active:scale-95">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[70vh] space-y-6">
              {activeQrs?.map(qr => (
                <div key={qr.id} className="flex flex-col items-center justify-center border-b border-gray-100 pb-6 last:border-0 last:pb-0">
                  {qr.image_data ? (
                    <img src={qr.image_data} alt={qr.name} className="w-72 h-72 object-contain rounded-xl border-2 border-purple-100 p-2 shadow-sm mb-3" />
                  ) : (
                    <div className="w-72 h-72 bg-gray-100 flex items-center justify-center rounded-xl mb-3">
                      <QrCode className="w-24 h-24 text-gray-300" />
                    </div>
                  )}
                  <p className="font-black text-gray-900 text-lg">{qr.name}</p>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{qr.upi_id}</p>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <p className="text-center font-black text-purple-700">Total: ₹{totalAmount}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
