'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { generateId, resolvePlantPrice, toLocalDateStr } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { PlusCircle, Trash2, QrCode, X, WifiOff, Receipt, CheckCircle2, ArrowRight } from 'lucide-react';
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

export default function NewBookingPage() {
  const { t } = useLanguage();
  const [bookingNumber, setBookingNumber] = useState('BK-...');
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
    setBookingNumber(`BK-${yy}${mm}${dd}-${hh}${min}${ss}-${random}`);
    const userStr = localStorage.getItem('snms_user');
    if (userStr) setCurrentUser(JSON.parse(userStr));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [city, setCity] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [completedBookingReceipt, setCompletedBookingReceipt] = useState<any>(null);
  
  const { data: activeQrs } = useQuery({
    queryKey: ['payment_qrs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('payment_qrs').select('*').eq('active', true).is('deleted_at', null);
      if (error) throw error;
      return data || [];
    }
  });
  const [showQR, setShowQR] = useState(false);
  
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Current Item State
  const [plantId, setPlantId] = useState('');
  const [quantity, setQuantity] = useState('');
  
  const [assignedTo, setAssignedTo] = useState('');
  
  const [advancePaid, setAdvancePaid] = useState('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Split'>('Cash');
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [splitAmounts, setSplitAmounts] = useState({ cash: '', upi: '' });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const queryClient = useQueryClient();

  const { data: plants } = useQuery({
    queryKey: ['plants'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plants').select('*').is('deleted_at', null).eq('active', true);
      if (error) throw error;
      return data || [];
    }
  });
  const { data: inventory } = useQuery({
    queryKey: ['vw_inventory_status'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vw_inventory_status').select('*');
      if (error) throw error;
      return data || [];
    }
  });
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('*').is('deleted_at', null);
      if (error) throw error;
      return data || [];
    }
  });
  const { data: workers } = useQuery({
    queryKey: ['active_workers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vw_active_workers').select('*').eq('role', 'worker');
      if (error) throw error;
      return data || [];
    }
  });

  const uniqueCities = Array.from(new Set(customers?.map(c => c.city).filter(Boolean) as string[]));

  const selectedPlant = plants?.find(p => p.id === plantId);

  // Auto-complete triggers
  const handlePhoneChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 10);
    setCustomerPhone(digits);
    if (digits.length === 10 && customers) {
      const found = customers.find(c => c.mobile === digits);
      if (found) {
        setCustomerName(found.name);
        if (found.city) setCity(found.city);
      }
    }
  };

  const handleNameChange = (val: string) => {
    setCustomerName(val);
    if (customers) {
      const matches = customers.filter(c => c.name.toLowerCase() === val.toLowerCase());
      if (matches.length === 1) {
        setCustomerPhone(matches[0].mobile);
        if (matches[0].city) setCity(matches[0].city);
      }
    }
  };

  const handleAddToCart = () => {
    if (!selectedPlant || !quantity) return;
    
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) return;

    const price = resolvePlantPrice(selectedPlant, qty);
    
    setCart([...cart, {
      id: generateId(),
      plantId: selectedPlant.id,
      plantName: selectedPlant.variety ? `${selectedPlant.plant_name} - ${selectedPlant.variety}` : selectedPlant.plant_name,
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

  const advanceNum = parseFloat(advancePaid) || 0;
  const cashNum = parseFloat(cashAmount) || 0;
  const upiNum = parseFloat(upiAmount) || 0;
  const splitTotal = cashNum + upiNum;
  const splitRemaining = advanceNum - splitTotal;
  const splitValid = advanceNum === 0 || paymentMode !== 'Split' || Math.abs(splitRemaining) < 0.01;

  const handleCashChange = (val: string) => {
    const c = parseFloat(val) || 0;
    const remaining = c <= advanceNum ? String(Math.round((advanceNum - c) * 100) / 100) : '0';
    setSplitAmounts({ cash: val, upi: remaining });
    setCashAmount(val);
    setUpiAmount(remaining);
  };
  const handleUpiChange = (val: string) => {
    const u = parseFloat(val) || 0;
    const remaining = u <= advanceNum ? String(Math.round((advanceNum - u) * 100) / 100) : '0';
    setSplitAmounts({ cash: remaining, upi: val });
    setCashAmount(remaining);
    setUpiAmount(val);
  };
  const handleModeChange = (mode: 'Cash' | 'UPI' | 'Split') => {
    setPaymentMode(mode);
    if (mode === 'Cash') { 
      setCashAmount(String(advanceNum)); 
      setUpiAmount('0'); 
      setSplitAmounts({ cash: String(advanceNum), upi: '0' });
    } else if (mode === 'UPI') { 
      setUpiAmount(String(advanceNum)); 
      setCashAmount('0'); 
      setSplitAmounts({ cash: '0', upi: String(advanceNum) });
    } else { 
      const half = Math.floor(advanceNum / 2);
      setCashAmount(String(half)); 
      setUpiAmount(String(advanceNum - half)); 
      setSplitAmounts({ cash: String(half), upi: String(advanceNum - half) });
    }
  };
  const handleAdvanceChange = (val: string) => {
    setAdvancePaid(val);
    const adv = parseFloat(val) || 0;
    if (paymentMode === 'Cash') { setCashAmount(String(adv)); setUpiAmount('0'); }
    else if (paymentMode === 'UPI') { setUpiAmount(String(adv)); setCashAmount('0'); }
  };

  const handleSaveBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!navigator.onLine) {
      alert('You are currently offline. Please connect to the internet to save bookings.');
      return;
    }
    if (isSubmittingRef.current || loading) return;
    if (cart.length === 0) return alert(t('addAtLeastOneBookingError'));
    if ((parseFloat(advancePaid) || 0) > totalAmount) {
      alert(t('advanceExceedTotalError'));
      return;
    }
    
    isSubmittingRef.current = true;
    setLoading(true);

    try {
      const user = currentUser || { id: 'unknown' };
      const advance = parseFloat(advancePaid) || 0;
      const createdAt = new Date().toISOString();

      const finalCash = paymentMode === 'Cash' ? advance : paymentMode === 'UPI' ? 0 : parseFloat(splitAmounts.cash) || 0;
      const finalUpi  = paymentMode === 'UPI'  ? advance : paymentMode === 'Cash' ? 0 : parseFloat(splitAmounts.upi) || 0;

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

          if (paymentMode === 'Cash') {
            itemCash = itemAdvance;
          } else if (paymentMode === 'UPI') {
            itemUpi = itemAdvance;
          } else {
            if (cashRemaining >= itemAdvance) {
              itemCash = itemAdvance;
              cashRemaining -= itemAdvance;
            } else {
              itemCash = cashRemaining;
              itemUpi = itemAdvance - cashRemaining;
              cashRemaining = 0;
              upiRemaining -= itemUpi;
            }
          }
        }

        return {
          id: generateId(),
          booking_number: bookingNumber,
          customer_name: customerName,
          customer_phone: customerPhone,
          city: city,
          plant_id: item.plantId,
          quantity: item.quantity,
          advance_paid: itemAdvance,
          advance_payment_mode: paymentMode,
          advance_cash_amount: itemCash,
          advance_upi_amount: itemUpi,
          total_amount: item.amount,
          booking_date: createdAt,
          delivery_date: deliveryDate ? deliveryDate : null,
          status: 'Pending',
          remarks: 'Created from Cart',
          worker_id: user.id,
          assigned_to: assignedTo || null,
          created_at: createdAt
        };
      });

      const auditPayload = {
        user_id: user.id || '00000000-0000-0000-0000-000000000000',
        user_name: user.name || 'Owner',
        action: 'CREATE_BOOKINGS',
        details: { items_count: newBookings.length, advance }
      };

      const customerPayload = {
        name: customerName,
        mobile: customerPhone,
        city: city
      };

      const { error } = await supabase.rpc('process_bookings_batch', {
        p_bookings: newBookings,
        p_customer: customerPayload,
        p_audit: auditPayload
      });

      if (error) {
        console.error(error);
        alert('Failed to save bookings: ' + (error.message || ''));
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['bookings-data'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['vw_booking_status'] });
      queryClient.invalidateQueries({ queryKey: ['vw_daily_cashbook'] });
      queryClient.invalidateQueries({ queryKey: ['vw_profit_summary'] });
      queryClient.invalidateQueries({ queryKey: ['vw_inventory_status'] });

      setCompletedBookingReceipt({
        bookingNumber,
        customerName,
        customerPhone,
        city: city || '—',
        deliveryDate: deliveryDate || '—',
        items: [...cart],
        totalAmount,
        advancePaid: advance,
        balanceDue: totalAmount - advance,
        paymentMode,
        cashAmount: finalCash,
        upiAmount: finalUpi,
        workerName: currentUser?.name || 'Owner',
        createdAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error(err);
      alert('Unexpected error saving booking: ' + (err.message || ''));
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const resetFormForNewBooking = () => {
    const d = new Date();
    const yy = d.getFullYear().toString().slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const random = Math.floor(100 + Math.random() * 900).toString();
    setBookingNumber(`BK-${yy}${mm}${dd}-${hh}${min}${ss}-${random}`);
    setCustomerName('');
    setCustomerPhone('');
    setCity('');
    setDeliveryDate('');
    setCart([]);
    setPlantId('');
    setQuantity('');
    setAdvancePaid('');
    setCashAmount('');
    setUpiAmount('');
    setPaymentMode('Cash');
    setAssignedTo('');
    setCompletedBookingReceipt(null);
  };

  if (completedBookingReceipt) {
    return (
      <div className="p-6 mb-24 max-w-lg mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Success Badge */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">Booking Confirmed!</h1>
          <p className="text-sm font-semibold text-gray-500">Advance recorded & order created</p>
        </div>

        {/* Printable Receipt Paper */}
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-3xl p-6 shadow-sm space-y-5">
          <div className="text-center border-b border-gray-100 pb-4">
            <h2 className="text-lg font-black text-gray-900 tracking-tight">SHIVKUSH NURSERY</h2>
            <p className="text-xs text-gray-400 font-bold">Advance Booking Receipt</p>
            <span className="inline-block mt-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-black">
              #{completedBookingReceipt.bookingNumber}
            </span>
          </div>

          {/* Customer & Delivery Info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-400 font-bold block uppercase">Customer</span>
              <strong className="text-gray-900 font-bold">{completedBookingReceipt.customerName}</strong>
              <p className="text-gray-500">{completedBookingReceipt.customerPhone}</p>
              {completedBookingReceipt.city !== '—' && <p className="text-gray-400">{completedBookingReceipt.city}</p>}
            </div>
            <div className="text-right">
              <span className="text-gray-400 font-bold block uppercase">Delivery Target</span>
              <strong className="text-gray-900 font-bold">
                {completedBookingReceipt.deliveryDate !== '—'
                  ? new Date(completedBookingReceipt.deliveryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  : 'Flexible'}
              </strong>
              <p className="text-gray-400 mt-1">Booked: {new Date(completedBookingReceipt.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
            </div>
          </div>

          {/* Booked Items List */}
          <div className="border-t border-b border-gray-100 py-3 space-y-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Booked Plants</p>
            {completedBookingReceipt.items.map((it: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center text-xs">
                <div>
                  <p className="font-bold text-gray-800">{it.plantName}</p>
                  <p className="text-gray-400 text-[11px]">{it.quantity} saplings @ ₹{it.price}</p>
                </div>
                <span className="font-black text-gray-900">₹{it.amount}</span>
              </div>
            ))}
          </div>

          {/* Financial Breakdown */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 font-bold">Total Order Value:</span>
              <span className="font-black text-gray-900 text-base">₹{completedBookingReceipt.totalAmount.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between items-center text-blue-700 bg-blue-50 p-2.5 rounded-xl font-bold">
              <span>Advance Paid ({completedBookingReceipt.paymentMode}):</span>
              <span className="font-black text-sm">₹{completedBookingReceipt.advancePaid.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between items-center text-red-600 pt-1 font-bold">
              <span>Balance Payable on Delivery:</span>
              <span className="font-black text-base">₹{completedBookingReceipt.balanceDue.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between text-gray-400 pt-2 border-t border-gray-50 text-[11px]">
              <span>Recorded By:</span>
              <span className="font-semibold text-gray-600">{completedBookingReceipt.workerName}</span>
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
              onClick={resetFormForNewBooking}
              className="py-3.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-black rounded-xl text-center active:scale-95 transition-all border border-blue-200"
            >
              + New Booking
            </button>
            <button
              type="button"
              onClick={() => router.push('/bookings')}
              className="py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-black rounded-xl text-center active:scale-95 transition-all"
            >
              View Bookings
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
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">{t('newBooking')}</h1>
          <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg text-sm font-black border border-gray-200">
            {bookingNumber}
          </span>
        </div>
      </header>

      <form onSubmit={handleSaveBooking} className="space-y-6">
        {/* Customer Details */}
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
          <h2 className="font-black text-gray-800 border-b border-gray-100 pb-2">{t('customerDetails')}</h2>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase">{t('customerName')}</label>
            <input 
              required 
              type="text" 
              value={customerName} 
              onChange={e => handleNameChange(e.target.value)} 
              list="customer-names"
              className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" 
              placeholder="e.g. Ramesh Kumar" 
            />
            <datalist id="customer-names">
              {customers?.map(c => (
                <option key={c.id} value={c.name}>{c.mobile}</option>
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase">{t('customerPhone')}</label>
              <input 
                required 
                type="tel" 
                pattern="[0-9]{10}" 
                maxLength={10} 
                title="Phone number must be exactly 10 digits" 
                value={customerPhone} 
                onChange={e => handlePhoneChange(e.target.value)} 
                list="customer-phones"
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" 
                placeholder="9876543210" 
              />
              <datalist id="customer-phones">
                {customers?.map(c => (
                  <option key={c.id} value={c.mobile}>{c.name}</option>
                ))}
              </datalist>
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
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-gray-500 uppercase">
                वितरण दिनांक (Delivery Date - ऐच्छिक)
              </label>
              <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                रोपे तयार झाल्यावर फोन करून कळवणे
              </span>
            </div>
            <input 
              type="date" 
              value={deliveryDate} 
              onChange={e => setDeliveryDate(e.target.value)} 
              className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" 
            />
            <p className="text-[11px] text-gray-400 font-medium">
              तारीख न टाकल्यास बुकिंग 'तयार झाल्यावर (Open)' म्हणून नोंदवले जाईल.
            </p>
          </div>
        </div>

        {/* Worker Assignment (Optional) */}
        {workers && workers.length > 0 && currentUser?.role === 'owner' && (
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-black text-gray-800 border-b border-gray-100 pb-2">Order Fulfillment</h2>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase">Assign to Worker (Optional)</label>
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
              >
                <option value="">-- Owner will handle delivery --</option>
                {workers.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 font-medium">If assigned, the worker will see this booking in their pending fulfillment queue.</p>
            </div>
          </div>
        )}

        {/* Cart Addition */}
        <div className="bg-blue-50 p-5 rounded-3xl border border-blue-100 space-y-4">
          <div className="flex justify-between items-center border-b border-blue-200 pb-2">
            <h2 className="font-black text-blue-900">{t('addPlants')}</h2>
            <Link href="/plants/new" className="text-xs font-bold text-blue-600 bg-white px-3 py-1 rounded-full shadow-sm hover:bg-blue-100">+ New Plant</Link>
          </div>
          
          <div className="space-y-2">
            <PlantPicker
              plants={plants || []}
              selectedPlantId={plantId}
              onSelectPlant={p => {
                setPlantId(p ? p.id : '');
                setQuantity('');
              }}
              accentColor="blue"
            />
          </div>

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
                    <p className="text-xs font-semibold text-gray-500">{item.quantity} saplings @ ₹{item.price}</p>
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

                    {/* Quick Preset Buttons */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const half = Math.floor(advanceNum / 2);
                          setCashAmount(String(half));
                          setUpiAmount(String(advanceNum - half));
                          setSplitAmounts({ cash: String(half), upi: String(advanceNum - half) });
                        }}
                        className="flex-1 py-1.5 px-2 bg-purple-100 hover:bg-purple-200 text-purple-800 text-xs font-bold rounded-xl transition-all active:scale-95"
                      >
                        50% / 50%
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCashAmount(String(advanceNum));
                          setUpiAmount('0');
                          setSplitAmounts({ cash: String(advanceNum), upi: '0' });
                        }}
                        className="flex-1 py-1.5 px-2 bg-green-100 hover:bg-green-200 text-green-800 text-xs font-bold rounded-xl transition-all active:scale-95"
                      >
                        All Cash
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCashAmount('0');
                          setUpiAmount(String(advanceNum));
                          setSplitAmounts({ cash: '0', upi: String(advanceNum) });
                        }}
                        className="flex-1 py-1.5 px-2 bg-blue-100 hover:bg-blue-200 text-blue-800 text-xs font-bold rounded-xl transition-all active:scale-95"
                      >
                        All UPI
                      </button>
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
            )}
          </div>
        )}

        {!isOnline && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-sm font-bold">
            <WifiOff className="w-5 h-5 shrink-0 text-amber-600" />
            <span>You are offline. Connect to internet to save booking.</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!isOnline || loading || cart.length === 0 || !splitValid}
          className={`w-full font-black text-xl p-5 rounded-2xl active:scale-95 transition-transform disabled:opacity-50 shadow-xl text-white ${
            !isOnline ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-900 hover:bg-black'
          }`}
        >
          {!isOnline ? 'Offline - Cannot Save' : loading ? t('processing') : t('confirmEntireBooking')}
        </button>
      </form>

      {/* QR Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-purple-600 p-4 flex justify-between items-center">
              <h3 className="font-black text-white text-lg flex items-center gap-2">
                <QrCode className="w-5 h-5" /> Scan to Pay Advance
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
              <p className="text-center font-black text-purple-700">Advance Amount: ₹{advanceNum}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
