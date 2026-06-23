'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, User, Plus, Trash2, X, QrCode } from 'lucide-react';
import { generateId, logAudit, resolvePlantPrice } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface CartItem {
  id: string;
  plantId: string;
  plantName: string;
  lotId: string;
  lotNumber: string;
  quantity: number;
  price: number;
  amount: number;
}

export default function NewDirectSalePage() {
  const { t } = useLanguage();
  const [saleNumber, setSaleNumber] = useState('SL-...');
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
    setSaleNumber(`SL-${yy}${mm}${dd}-${hh}${min}${ss}-${random}`);
    const userStr = localStorage.getItem('snms_user');
    if (userStr) setCurrentUser(JSON.parse(userStr));
  }, []);
  
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  
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
  const [selectedLotId, setSelectedLotId] = useState('');
  const [quantity, setQuantity] = useState('');
  
  const [assignedTo, setAssignedTo] = useState('');
  const [autoAllocate, setAutoAllocate] = useState(true);
  
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Split'>('Cash');
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const queryClient = useQueryClient();

  const { data: plants } = useQuery({ queryKey: ['plants'], queryFn: async () => { const { data } = await supabase.from('plants').select('*').is('deleted_at', null).eq('active', true); return data || []; } });
  const { data: lots } = useQuery({ queryKey: ['lots'], queryFn: async () => { const { data } = await supabase.from('lots').select('*').is('deleted_at', null); return data || []; } });
  const { data: allotments } = useQuery({ queryKey: ['allotments'], queryFn: async () => { const { data } = await supabase.from('allotments').select('*').is('deleted_at', null); return data || []; } });
  const { data: bookings } = useQuery({ queryKey: ['bookings'], queryFn: async () => { const { data } = await supabase.from('bookings').select('*').is('deleted_at', null); return data || []; } });
  const { data: existingSales } = useQuery({ queryKey: ['direct_sales'], queryFn: async () => { const { data } = await supabase.from('direct_sales').select('*').is('deleted_at', null); return data || []; } });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: async () => { const { data } = await supabase.from('customers').select('*').is('deleted_at', null); return data || []; } });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: async () => { const { data } = await supabase.from('users').select('*').is('deleted_at', null); return data || []; } });
  const workers = users?.filter(u => u.role === 'worker') || [];

  // Auto-select first READY lot (FIFO) when plant changes, sorted by ready_date
  useEffect(() => {
    if (!plantId) { setSelectedLotId(''); return; }
    if (!autoAllocate) return;
    const lotsData = lots || [];
    const first = lotsData
      .filter(l => l.plant_id === plantId && l.status === 'Ready')
      .sort((a, b) => new Date(a.ready_date).getTime() - new Date(b.ready_date).getTime())[0];
    setSelectedLotId(first?.id || '');
  }, [plantId, lots, autoAllocate]);

  const selectedPlant = plants?.find(p => p.id === plantId);

  // Auto-complete triggers
  const handlePhoneChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 10);
    setCustomerPhone(digits);
    if (digits.length === 10 && customers) {
      const found = customers.find(c => c.mobile === digits);
      if (found) {
        setCustomerName(found.name);
      }
    }
  };

  const handleNameChange = (val: string) => {
    setCustomerName(val);
    if (customers) {
      const matches = customers.filter(c => c.name.toLowerCase() === val.toLowerCase());
      if (matches.length === 1) {
        setCustomerPhone(matches[0].mobile);
      }
    }
  };

  // Per-lot free stock: available_stock already reflects deducted allotments (set by DB RPC)
  // We only subtract what's in the current cart (not yet committed to DB)
  const computeFreeStockForLot = (lotId: string, pid: string): number => {
    if (!lots || !allotments || !bookings || !existingSales) return 0;
    const lot = lots.find(l => l.id === lotId);
    if (!lot) return 0;
    const cartQty = cart.filter(i => i.lotId === lotId).reduce((s, i) => s + i.quantity, 0);
    return Math.max(0, (lot.available_stock ?? lot.total_quantity) - cartQty);
  };

  // Total free stock across all READY lots for a plant
  const computeFreeStock = (pid: string): number => {
    if (!lots) return 0;
    return lots
      .filter(l => l.plant_id === pid && l.status === 'Ready')
      .reduce((sum, l) => sum + computeFreeStockForLot(l.id, pid), 0);
  };

  const selectedFreeStock = (plantId && selectedLotId) ? computeFreeStockForLot(selectedLotId, plantId) : null;

  const handleAddToCart = () => {
    if (!selectedPlant || !quantity) return;
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) return;

    if (selectedLotId) {
      const freeStock = computeFreeStockForLot(selectedLotId, selectedPlant.id);
      if (qty > freeStock) {
        const lot = lots?.find(l => l.id === selectedLotId);
        alert(`Only ${freeStock} plants free in lot ${lot?.lot_name || lot?.lot_number || ''}. Some are reserved for bookings.`);
        return;
      }
    }

    const lot = selectedLotId ? lots?.find(l => l.id === selectedLotId) : null;
    let price = resolvePlantPrice(selectedPlant, qty);

    setCart([...cart, {
      id: generateId(),
      plantId: selectedPlant.id,
      plantName: selectedPlant.variety ? `${selectedPlant.plant_name} - ${selectedPlant.variety}` : selectedPlant.plant_name,
      lotId: selectedLotId || '',
      lotNumber: lot ? (lot.lot_name || lot.lot_number || '') : 'No Lot Assigned',
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
    else { setCashAmount(''); setUpiAmount(''); }
  };

  const handleSaveSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!navigator.onLine) { alert('You must be online to save.'); return; }
    if (cart.length === 0) return alert(t('addAtLeastOnePlantError'));
    if (!splitValid) return alert(t('splitAmountsMismatchError').replace('{totalAmount}', String(totalAmount)));
    setLoading(true);

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
        lot_id: item.lotId || null,
        quantity: item.quantity,
        amount: item.amount,
        payment_mode: itemPayMode,
        cash_amount: itemCash,
        upi_amount: itemUpi,
        worker_id: user.id,
        assigned_to: assignedTo || null,
        fulfillment_status: assignedTo ? ('Pending Handover') : undefined,
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
      city: null
    };

    const { error } = await supabase.rpc('process_direct_sales_batch', {
      p_sales: newSales,
      p_customer: customerPayload,
      p_audit: auditPayload
    });

    if (error) {
      console.error(error);
      alert('Failed to save direct sale');
      setLoading(false);
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['customers'] });
    queryClient.invalidateQueries({ queryKey: ['direct_sales'] });
    queryClient.invalidateQueries({ queryKey: ['lots'] });

    router.push('/dashboard');
  };

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
          <div className="grid grid-cols-2 gap-4">
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
                const fs = computeFreeStock(p.id);
                return (
                  <option key={p.id} value={p.id}>
                    {p.variety ? `${p.plant_name} - ${p.variety}` : p.plant_name} — ₹{p.selling_price} ({t('free')}: {fs})
                  </option>
                );
              })}
            </select>
          </div>

          {plantId && (
            <div className="space-y-2">
              {/* Auto-allocate FIFO Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-white border border-green-150 rounded-xl">
                <div>
                  <span className="text-xs font-black text-green-800 block">Auto-Allocate Lots (FIFO)</span>
                  <span className="text-[10px] text-gray-400 font-semibold mt-0.5">Picks the oldest ready batch automatically</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !autoAllocate;
                    setAutoAllocate(nextVal);
                    if (nextVal) {
                      const first = (lots || [])
                        .filter(l => l.plant_id === plantId && l.status !== 'Completed')
                        .sort((a, b) => new Date(a.ready_date).getTime() - new Date(b.ready_date).getTime())[0];
                      setSelectedLotId(first?.id || '');
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${autoAllocate ? 'bg-green-600' : 'bg-gray-200'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${autoAllocate ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Lot selector */}
              {lots && lots.filter(l => l.plant_id === plantId && l.status === 'Ready').length > 0 ? (
                <>
                  {!autoAllocate && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-green-700 uppercase">Source Lot</label>
                      <select
                        value={selectedLotId}
                        onChange={e => setSelectedLotId(e.target.value)}
                        className="w-full p-3 bg-white border border-green-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-green-900 text-sm"
                      >
                        <option value="">-- No Lot Assigned --</option>
                        {lots
                          .filter(l => l.plant_id === plantId && l.status === 'Ready')
                          .sort((a, b) => new Date(a.ready_date).getTime() - new Date(b.ready_date).getTime())
                          .map(l => {
                            const free = computeFreeStockForLot(l.id, plantId);
                            return (
                              <option key={l.id} value={l.id}>
                                {l.lot_name || l.lot_number} — {free} free{free <= 0 ? ' (fully reserved)' : ''}
                              </option>
                            );
                          })}
                      </select>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm font-bold text-red-600 text-center py-2">No active lots for this plant</p>
              )}
              {/* Per-lot free stock indicator */}
              {selectedLotId && selectedFreeStock !== null && (
                <div className={`flex items-center justify-between px-4 py-2 rounded-xl text-sm font-bold ${selectedFreeStock > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  <span>{t('availableToSell')}</span>
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
                  placeholder={t('qtyPlaceholder')}
                />
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!quantity || (!!selectedLotId && selectedFreeStock !== null && selectedFreeStock <= 0)}
                  className="w-1/3 bg-green-600 text-white rounded-xl font-black flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform"
                >
                  {t('add')}
                </button>
              </div>
              {selectedFreeStock !== null && selectedFreeStock <= 0 && (
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
                    <p className="text-xs font-semibold text-gray-500">{item.quantity} × ₹{item.price} · {item.lotNumber}</p>
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

        <button
          type="submit"
          disabled={loading || cart.length === 0 || !splitValid}
          className={`w-full font-black text-xl p-5 rounded-2xl active:scale-95 transition-transform disabled:opacity-50 shadow-xl text-white ${
            paymentMode === 'Cash' ? 'bg-green-700' :
            paymentMode === 'UPI' ? 'bg-blue-700' :
            'bg-purple-700'
          }`}
        >
          {loading ? t('processing') : `${t('collect')} ₹${totalAmount} · ${
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
