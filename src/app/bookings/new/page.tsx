'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { generateId, resolvePlantPrice, toLocalDateStr } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { PlusCircle, Trash2, QrCode, X } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageContext';

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
  const { t } = useLanguage();
  const [bookingNumber, setBookingNumber] = useState('BK-...');
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  useEffect(() => {
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
  }, []);
  
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [city, setCity] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  
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
  const { data: lots } = useQuery({
    queryKey: ['lots', plantId],
    queryFn: async () => {
      if (!plantId) return [];
      const { data, error } = await supabase.from('lots').select('*').eq('plant_id', plantId).is('deleted_at', null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!plantId
  });
  const { data: bookings } = useQuery({
    queryKey: ['bookings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('bookings').select('*').is('deleted_at', null);
      if (error) throw error;
      return data || [];
    }
  });
  const { data: allotments } = useQuery({
    queryKey: ['allotments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('allotments').select('*').is('deleted_at', null);
      if (error) throw error;
      return data || [];
    }
  });
  const { data: direct_sales } = useQuery({
    queryKey: ['direct_sales'],
    queryFn: async () => {
      const { data, error } = await supabase.from('direct_sales').select('*').is('deleted_at', null);
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
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('*');
      if (error) throw error;
      return data || [];
    }
  });
  const workers = users?.filter(u => u.role === 'worker') || [];

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

    let price = resolvePlantPrice(selectedPlant, qty);
    
    setCart([...cart, {
      id: generateId(),
      plantId: selectedPlant.id,
      plantName: selectedPlant.variety ? `${selectedPlant.plant_name} - ${selectedPlant.variety}` : selectedPlant.plant_name,
      lotId: '',
      lotName: t('noLotAssigned'),
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
    if (!navigator.onLine) { alert('You must be online to save.'); return; }
    if (cart.length === 0) return alert(t('addAtLeastOneBookingError'));
    if ((parseFloat(advancePaid) || 0) > totalAmount) {
      alert(t('advanceExceedTotalError'));
      return;
    }
    
    setLoading(true);

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

      return {
        id: generateId(),
        booking_number: `${Math.floor(Date.now() / 1000).toString(36).toUpperCase()}-${index + 1}`,
        customer_name: customerName,
        customer_phone: customerPhone,
        city: city,
        plant_id: item.plantId,
        lot_id: item.lotId || null,
        quantity: item.quantity,
        advance_paid: itemAdvance,
        advance_payment_mode: paymentMode,
        advance_cash_amount: itemCash,
        advance_upi_amount: itemUpi,
        total_amount: item.amount,
        booking_date: createdAt,
        delivery_date: deliveryDate,
        status: item.lotId ? 'Allocated' : 'Pending',
        remarks: 'Created from Cart',
        worker_id: user.id,
        assigned_to: assignedTo || null,
        created_at: createdAt,
        remarks: ''
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
      alert('Failed to save bookings');
      setLoading(false);
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['bookings-data'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    router.push('/bookings');
  };

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
            <label className="text-xs font-bold text-gray-500 uppercase">{t('requestedDeliveryDate')}</label>
            <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" />
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
            <select value={plantId} onChange={e => setPlantId(e.target.value)} className="w-full p-4 bg-white border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-lg text-blue-900">
              <option value="">{t('choosePlantPlaceholder')}</option>
              {plants?.filter(p => p.active !== false).map(p => (
                <option key={p.id} value={p.id}>{p.variety ? `${p.plant_name} - ${p.variety}` : p.plant_name} (₹{p.selling_price})</option>
              ))}
            </select>
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

        <button type="submit" disabled={loading || cart.length === 0 || !splitValid} className="w-full bg-gray-900 text-white font-black text-xl p-5 rounded-2xl active:scale-95 transition-transform disabled:opacity-50 shadow-xl">
          {loading ? t('processing') : t('confirmEntireBooking')}
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
