'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingCart,
  User,
  Plus,
  Trash2,
  X,
  QrCode,
  WifiOff,
  Receipt,
  CheckCircle2,
  ArrowRight,
  Clock,
  Check,
  ListOrdered
} from 'lucide-react';
import { generateId } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { serverProcessDirectSale, serverFulfillDirectSale } from '@/lib/actions/sales';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import PlantPicker from '@/components/plants/PlantPicker';

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
  const [isHandedOverNow, setIsHandedOverNow] = useState(false);
  const [handoverLoading, setHandoverLoading] = useState(false);

  const { data: activeQrs } = useQuery({
    queryKey: ['payment_qrs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('payment_qrs')
        .select('*')
        .eq('active', true)
        .is('deleted_at', null);
      return data || [];
    }
  });
  const [showQR, setShowQR] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);

  // Current Item State (No stock limit, direct sale entry)
  const [plantId, setPlantId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');

  const [assignedTo, setAssignedTo] = useState('');

  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Split'>('Cash');
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const queryClient = useQueryClient();

  const { data: plants } = useQuery({
    queryKey: ['plants'],
    queryFn: async () => {
      const { data } = await supabase
        .from('plants')
        .select('*')
        .is('deleted_at', null)
        .eq('active', true);
      return data || [];
    }
  });

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .is('deleted_at', null);
      return data || [];
    }
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await supabase.from('users').select('*');
      return data || [];
    }
  });
  const workers = users?.filter(u => u.role === 'worker') || [];

  const selectedPlant = plants?.find(p => p.id === plantId);

  // Auto-fill price when plant selected
  useEffect(() => {
    if (selectedPlant) {
      setUnitPrice(String(selectedPlant.selling_price || ''));
    } else {
      setUnitPrice('');
    }
  }, [selectedPlant]);

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

  const handleAddToCart = () => {
    if (!selectedPlant || !quantity) return;
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) return;

    const rate = parseFloat(unitPrice) || selectedPlant.selling_price || 0;

    setCart([
      ...cart,
      {
        id: generateId(),
        plantId: selectedPlant.id,
        plantName: selectedPlant.variety
          ? `${selectedPlant.plant_name} - ${selectedPlant.variety}`
          : selectedPlant.plant_name,
        quantity: qty,
        price: rate,
        amount: Math.round(rate * qty * 100) / 100
      }
    ]);
    setPlantId('');
    setQuantity('');
    setUnitPrice('');
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

  // When mode changes, pre-fill for convenience
  const handleModeChange = (mode: 'Cash' | 'UPI' | 'Split') => {
    setPaymentMode(mode);
    if (mode === 'Cash') {
      setCashAmount(String(totalAmount));
      setUpiAmount('0');
    } else if (mode === 'UPI') {
      setUpiAmount(String(totalAmount));
      setCashAmount('0');
    } else {
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
    if (cart.length === 0) return alert(t('addAtLeastOnePlantError') || 'Please add at least one plant.');
    if (!splitValid) {
      return alert((t('splitAmountsMismatchError') || 'Split amounts must match total.').replace('{totalAmount}', String(totalAmount)));
    }

    isSubmittingRef.current = true;
    setLoading(true);

    try {
      const user = currentUser || { id: '00000000-0000-0000-0000-000000000000', name: 'Staff' };

      const finalCash = paymentMode === 'Cash' ? totalAmount : paymentMode === 'UPI' ? 0 : cashNum;
      const finalUpi = paymentMode === 'UPI' ? totalAmount : paymentMode === 'Cash' ? 0 : upiNum;

      let cashRemaining = finalCash;
      let upiRemaining = finalUpi;

      const itemsPayload = cart.map(item => {
        let itemCash = 0;
        let itemUpi = 0;

        if (cashRemaining >= item.amount) {
          itemCash = item.amount;
          cashRemaining -= item.amount;
        } else {
          itemCash = cashRemaining;
          itemUpi = item.amount - cashRemaining;
          cashRemaining = 0;
          upiRemaining -= itemUpi;
        }

        return {
          plantId: item.plantId,
          quantity: item.quantity,
          price: item.price,
          amount: item.amount,
          cashAmount: itemCash,
          upiAmount: itemUpi
        };
      });

      // Save sale with fulfillment_status: 'Pending Handover'
      const res = await serverProcessDirectSale({
        saleNumber,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        customerCity: customerCity.trim() || undefined,
        items: itemsPayload,
        paymentMode,
        cashAmount: finalCash,
        upiAmount: finalUpi,
        workerId: user.id,
        assignedTo: assignedTo || undefined,
        fulfillmentStatus: 'Pending Handover',
        userId: user.id,
        userName: user.name
      });

      if (!res.success) {
        alert('Failed to save direct sale: ' + (res.error || ''));
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['direct_sales'] });
      queryClient.invalidateQueries({ queryKey: ['vw_daily_cashbook'] });
      queryClient.invalidateQueries({ queryKey: ['vw_profit_summary'] });

      setIsHandedOverNow(false);
      setCompletedReceipt({
        saleNumber,
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone.trim() || '—',
        customerCity: customerCity.trim() || '—',
        items: [...cart],
        totalAmount,
        paymentMode,
        cashAmount: finalCash,
        upiAmount: finalUpi,
        workerName: currentUser?.name || 'Staff',
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

  const handleInstantHandover = async () => {
    if (!completedReceipt?.saleNumber) return;
    try {
      setHandoverLoading(true);
      const user = currentUser || { id: '00000000-0000-0000-0000-000000000000', name: 'Staff' };
      const res = await serverFulfillDirectSale({
        saleNumber: completedReceipt.saleNumber,
        userId: user.id,
        userName: user.name
      });

      if (!res.success) {
        alert(res.error || 'Failed to update order status');
        return;
      }

      setIsHandedOverNow(true);
      queryClient.invalidateQueries({ queryKey: ['direct_sales'] });
    } catch (e: any) {
      console.error(e);
      alert('Failed: ' + e.message);
    } finally {
      setHandoverLoading(false);
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
    setUnitPrice('');
    setCashAmount('');
    setUpiAmount('');
    setPaymentMode('Cash');
    setAssignedTo('');
    setIsHandedOverNow(false);
    setCompletedReceipt(null);
  };

  // POST-SALE RECEIPT / HANDOVER MODAL
  if (completedReceipt) {
    return (
      <div className="p-6 mb-24 max-w-lg mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Status Badge */}
        <div className="text-center space-y-2">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-inner ${
              isHandedOverNow
                ? 'bg-green-100 text-green-600'
                : 'bg-amber-100 text-amber-600'
            }`}
          >
            {isHandedOverNow ? (
              <CheckCircle2 className="w-10 h-10" />
            ) : (
              <Clock className="w-10 h-10 animate-pulse" />
            )}
          </div>
          <h1 className="text-2xl font-black text-gray-900">
            {isHandedOverNow ? 'Order Given to Customer!' : 'Order Saved in Queue!'}
          </h1>
          <p className="text-sm font-semibold text-gray-500">
            {isHandedOverNow
              ? 'रोप दिले • पावती पूर्ण झाली (Handover complete)'
              : 'ऑर्डर द्यायची बाकी आहे • कामगारांना दिसेल (In queue for workers to pack)'}
          </p>
        </div>

        {/* Handover Action Card (If not yet handed over) */}
        {!isHandedOverNow && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-amber-800 tracking-wider">
                द्यायची बाकी ऑर्डर (Pending Handover)
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-200 text-amber-900">
                Payment Collected ✅
              </span>
            </div>
            <p className="text-sm font-medium text-amber-900">
              जर ग्राहकाने लगेच रोपे घेतली असतील, तर खालील बटण दाबा:
            </p>
            <button
              type="button"
              onClick={handleInstantHandover}
              disabled={handoverLoading}
              className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-black text-lg rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md"
            >
              <Check className="w-6 h-6 stroke-[3]" />
              {handoverLoading ? 'नोंद होत आहे...' : 'लगेच रोपे दिली (Order Given Now)'}
            </button>
          </div>
        )}

        {/* Printable Receipt Paper */}
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-3xl p-6 shadow-sm space-y-5">
          <div className="text-center border-b border-gray-100 pb-4">
            <h2 className="text-lg font-black text-gray-900 tracking-tight">SHIVKUSH NURSERY</h2>
            <p className="text-xs text-gray-400 font-bold">Sales Slip / विक्री पावती</p>
            <span className="inline-block mt-2 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-black">
              #{completedReceipt.saleNumber}
            </span>
          </div>

          {/* Customer & Date Info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-400 font-bold block uppercase">ग्राहक (Customer)</span>
              <strong className="text-gray-900 font-bold text-sm block">
                {completedReceipt.customerName}
              </strong>
              <p className="text-gray-500">{completedReceipt.customerPhone}</p>
              {completedReceipt.customerCity !== '—' && (
                <p className="text-gray-400">{completedReceipt.customerCity}</p>
              )}
            </div>
            <div className="text-right">
              <span className="text-gray-400 font-bold block uppercase">दिनांक (Date)</span>
              <strong className="text-gray-900 font-bold">
                {new Date(completedReceipt.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                })}
              </strong>
              <p className="text-gray-500">
                {new Date(completedReceipt.createdAt).toLocaleTimeString('en-IN', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                })}
              </p>
            </div>
          </div>

          {/* Purchased Items List */}
          <div className="border-t border-b border-gray-100 py-3 space-y-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              रोपे आणि प्रमाण (Plants & Quantity)
            </p>
            {completedReceipt.items.map((it: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center text-xs">
                <div>
                  <p className="font-bold text-gray-900 text-sm">{it.plantName}</p>
                  <p className="text-gray-400 text-[11px]">
                    {it.quantity} रोपे × ₹{it.price}
                  </p>
                </div>
                <span className="font-black text-gray-900 text-sm">₹{it.amount}</span>
              </div>
            ))}
          </div>

          {/* Payment Summary */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center text-base">
              <span className="font-black text-gray-900">एकूण जमा (Total Paid):</span>
              <span className="font-black text-green-600 text-xl">
                ₹{completedReceipt.totalAmount.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex justify-between text-gray-500 font-medium pt-1 border-t border-gray-50">
              <span>पेमेंट पद्धत (Mode):</span>
              <span className="font-bold text-gray-800">{completedReceipt.paymentMode}</span>
            </div>
            {completedReceipt.cashAmount > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>रोख (Cash):</span>
                <span className="font-bold text-gray-800">₹{completedReceipt.cashAmount}</span>
              </div>
            )}
            {completedReceipt.upiAmount > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>UPI:</span>
                <span className="font-bold text-gray-800">₹{completedReceipt.upiAmount}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-400 pt-2 border-t border-gray-50 text-[11px]">
              <span>नोंद करणारे (Staff):</span>
              <span className="font-semibold text-gray-700">{completedReceipt.workerName}</span>
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
            <Receipt className="w-5 h-5" /> पावती प्रिंट करा (Print Slip)
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={resetFormForNewSale}
              className="py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl text-center active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 text-sm"
            >
              <Plus className="w-5 h-5 stroke-[3]" /> पुढची ऑर्डर (+ Next)
            </button>
            <button
              type="button"
              onClick={() => router.push('/sales')}
              className="py-4 bg-gray-100 hover:bg-gray-200 text-gray-900 font-black rounded-2xl text-center active:scale-95 transition-all border border-gray-200 flex items-center justify-center gap-2 text-sm"
            >
              <ListOrdered className="w-5 h-5" /> द्यायच्या ऑर्डर्स (Queue)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // MAIN DIRECT SALE FORM
  return (
    <div className="p-6 mb-24 space-y-6">
      <header className="mb-4">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">
              {t('directSale')} (थेट विक्री)
            </h1>
            <p className="text-sm font-semibold text-gray-500 mt-1">
              काऊंटर विक्री नोंद • रोपे दिल्यावर देणे मार्क करा
            </p>
          </div>
          <Link
            href="/sales"
            className="px-4 py-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
          >
            <ListOrdered className="w-4 h-4" />
            द्यायच्या ऑर्डर्स पहा
          </Link>
        </div>
        <div className="flex items-center space-x-2 mt-2">
          <span className="text-xs font-mono font-bold bg-gray-100 text-gray-600 px-3 py-1 rounded-full border border-gray-200">
            {saleNumber}
          </span>
          {!isOnline && (
            <span className="text-xs font-bold text-red-600 flex items-center gap-1 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200">
              <WifiOff className="w-3.5 h-3.5" /> ऑफलाइन
            </span>
          )}
        </div>
      </header>

      <form onSubmit={handleSaveSale} className="space-y-6">
        {/* Customer Details */}
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
          <h2 className="font-black text-gray-800 border-b border-gray-100 pb-2">
            ग्राहक तपशील (Customer Details - ऐच्छिक)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase">
                {t('customerPhone')}
              </label>
              <input
                type="tel"
                pattern="[0-9]{10}"
                maxLength={10}
                title="Phone number must be exactly 10 digits"
                value={customerPhone}
                onChange={e => handlePhoneChange(e.target.value)}
                list="customer-phones"
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold"
                placeholder="९८७६५४३२१०"
              />
              <datalist id="customer-phones">
                {customers?.map(c => (
                  <option key={c.id} value={c.mobile}>
                    {c.name}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase">
                {t('customerName')}
              </label>
              <input
                type="text"
                value={customerName}
                onChange={e => handleNameChange(e.target.value)}
                list="customer-names"
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold"
                placeholder="उदा. रमेश पाटील"
              />
              <datalist id="customer-names">
                {customers?.map(c => (
                  <option key={c.id} value={c.name}>
                    {c.mobile}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase">
                गाव / शहर (Village / City)
              </label>
              <input
                type="text"
                value={customerCity}
                onChange={e => setCustomerCity(e.target.value)}
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold"
                placeholder="उदा. पुणे"
              />
            </div>
          </div>
        </div>

        {/* Worker Assignment (Optional) */}
        {workers.length > 0 && currentUser?.role === 'owner' && (
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-3">
            <h2 className="font-black text-gray-800 border-b border-gray-100 pb-2">
              कामगारास सोपवा (Assign to Worker - Optional)
            </h2>
            <select
              value={assignedTo}
              onChange={e => setAssignedTo(e.target.value)}
              className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold"
            >
              <option value="">-- कोणीही कामगार रोपे देऊ शकतो (Any Worker) --</option>
              {workers.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Plant Addition (Pure Sale Entry - No Stock Gating) */}
        <div className="bg-green-50 p-5 rounded-3xl border border-green-200 space-y-4">
          <div className="flex justify-between items-center border-b border-green-200 pb-2">
            <div>
              <h2 className="font-black text-green-900 text-lg">
                रोप निवडा (Select Plant & Quantity)
              </h2>
              <p className="text-xs text-green-700 font-medium">
                थेट विक्रीसाठी प्रमाण टाका आणि कार्टमध्ये जोडा
              </p>
            </div>
            <Link
              href="/plants/new"
              className="text-xs font-bold text-green-700 bg-white px-3 py-1.5 rounded-full shadow-sm hover:bg-green-100"
            >
              + नवीन रोप
            </Link>
          </div>

          <div className="space-y-3">
            {/* Plant Picker with Categories, Instant Search & Quick Picks */}
            <PlantPicker
              plants={plants || []}
              selectedPlantId={plantId}
              onSelectPlant={p => {
                setPlantId(p ? p.id : '');
                setQuantity('');
              }}
              accentColor="green"
            />

            {plantId && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-green-800 uppercase">
                    प्रमाण (Qty)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    className="w-full p-4 bg-white border border-green-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-black text-2xl text-green-900"
                    placeholder="उदा. ५०"
                    autoFocus
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-green-800 uppercase">
                    दर प्रति रोप (Rate ₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={unitPrice}
                    onChange={e => setUnitPrice(e.target.value)}
                    className="w-full p-4 bg-white border border-green-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-black text-2xl text-green-900"
                    placeholder="उदा. २.५०"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={!quantity || parseInt(quantity) <= 0}
                    className="w-full p-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black text-lg flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all shadow-md"
                  >
                    <Plus className="w-5 h-5 stroke-[3]" /> जोडा (Add)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cart Display */}
        {cart.length > 0 && (
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <h2 className="font-black text-gray-800">{t('billSummary')} (ऑर्डर तपशील)</h2>
              <span className="text-xs font-bold bg-green-100 text-green-800 px-2.5 py-1 rounded-full">
                {cart.length} {cart.length === 1 ? 'आयटम' : 'आयटम्स'}
              </span>
            </div>
            <div className="space-y-3">
              {cart.map(item => (
                <div
                  key={item.id}
                  className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl border border-gray-100"
                >
                  <div>
                    <p className="font-bold text-gray-900 text-base">{item.plantName}</p>
                    <p className="text-xs font-semibold text-gray-500">
                      {item.quantity} रोपे × ₹{item.price}
                    </p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="font-black text-gray-900 text-lg">₹{item.amount}</span>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.id)}
                      className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-xl transition-all"
                      title="हटवा"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-gray-100">
              <span className="text-base font-bold text-gray-500">एकूण बिल (Total Amount):</span>
              <span className="text-3xl font-black text-green-700">
                ₹{totalAmount.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        )}

        {/* Payment Collection */}
        {cart.length > 0 && (
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-black text-gray-800 border-b border-gray-100 pb-2">
              {t('paymentDetails')} (पेमेंट पद्धत)
            </h2>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleModeChange('Cash')}
                className={`py-4 rounded-xl font-bold text-sm border active:scale-95 transition-all ${
                  paymentMode === 'Cash'
                    ? 'bg-green-600 text-white border-green-600 shadow-md'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                💵 {t('cash')}
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('UPI')}
                className={`py-4 rounded-xl font-bold text-sm border active:scale-95 transition-all ${
                  paymentMode === 'UPI'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                📱 {t('upi')}
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('Split')}
                className={`py-4 rounded-xl font-bold text-sm border active:scale-95 transition-all ${
                  paymentMode === 'Split'
                    ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                ⚖️ {t('split')}
              </button>
            </div>

            {/* Split Breakdown */}
            {paymentMode === 'Split' && (
              <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-purple-900 uppercase">
                      💵 {t('cashAmount')}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={cashAmount}
                      onChange={e => handleCashChange(e.target.value)}
                      className="w-full p-3.5 bg-white border border-purple-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-purple-900 uppercase">
                      📱 {t('upiAmount')}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={upiAmount}
                      onChange={e => handleUpiChange(e.target.value)}
                      className="w-full p-3.5 bg-white border border-purple-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs font-bold pt-1">
                  <span className="text-gray-500">
                    जमा: ₹{splitTotal} / ₹{totalAmount}
                  </span>
                  {Math.abs(splitRemaining) > 0.01 && (
                    <span className="text-red-600">
                      फरक: ₹{Math.abs(splitRemaining).toFixed(2)}{' '}
                      {splitRemaining > 0 ? 'कमी' : 'जास्त'}
                    </span>
                  )}
                  {Math.abs(splitRemaining) <= 0.01 && (
                    <span className="text-green-600">रक्कम जुळली ✅</span>
                  )}
                </div>
              </div>
            )}

            {/* UPI QR Code Trigger */}
            {(paymentMode === 'UPI' || (paymentMode === 'Split' && upiNum > 0)) && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowQR(true)}
                  className="w-full py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-100 transition-all"
                >
                  <QrCode className="w-4 h-4" /> नर्सरीचा QR कोड दाखवा (Show UPI QR)
                </button>
              </div>
            )}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={cart.length === 0 || loading || (paymentMode === 'Split' && !splitValid)}
          className="w-full py-5 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-black text-xl shadow-lg disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            'नोंद होत आहे...'
          ) : (
            <>
              <ShoppingCart className="w-6 h-6 stroke-[2.5]" />
              ऑर्डर नोंदवा (Save Order - ₹{totalAmount.toLocaleString('en-IN')})
            </>
          )}
        </button>
      </form>

      {/* QR Code Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="font-black text-gray-900 text-lg">UPI पेमेंट QR कोड</h3>
              <button
                type="button"
                onClick={() => setShowQR(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            {activeQrs && activeQrs.length > 0 ? (
              <div className="space-y-3 text-center">
                {activeQrs.map((qr: any) => (
                  <div key={qr.id} className="p-3 bg-gray-50 rounded-2xl border border-gray-200">
                    <p className="font-bold text-gray-800 text-sm mb-2">{qr.account_name}</p>
                    <img
                      src={qr.qr_image_url}
                      alt={qr.account_name}
                      className="w-56 h-56 mx-auto object-contain rounded-xl bg-white p-2 shadow-inner"
                    />
                    {qr.upi_id && (
                      <p className="text-xs font-mono text-gray-500 mt-2 font-bold">{qr.upi_id}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-400 font-bold">
                कोणताही सक्रिय QR कोड सापडला नाही.
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowQR(false)}
              className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold active:scale-95 transition-transform"
            >
              बंद करा
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
