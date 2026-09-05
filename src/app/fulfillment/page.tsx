'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { serverCollectFinalPayment } from '@/lib/actions/finance';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PackageOpen,
  CheckCircle,
  X,
  Banknote,
  Smartphone,
  AlertCircle,
  Phone,
  User,
  ShieldCheck,
  Layers,
  ArrowRight
} from 'lucide-react';
import Link from 'next/link';

interface DeliveryModalState {
  booking: any;
  statusRow: any;
}

function FulfillmentContent() {
  const searchParams = useSearchParams();
  const targetBookingNumber = searchParams.get('bookingNumber');
  const targetBookingId = searchParams.get('bookingId');

  const [userId, setUserId] = useState('');
  const [userRole, setUserRole] = useState('');
  const [deliveryModal, setDeliveryModal] = useState<DeliveryModalState | null>(null);
  
  // Payment Form States
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Split'>('Cash');
  const [cashInput, setCashInput] = useState('');
  const [upiInput, setUpiInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('snms_user') || '{}');
    setUserId(user.id || '');
    setUserRole(user.role || '');
  }, []);

  const queryClient = useQueryClient();

  const { data: queriesData, isLoading } = useQuery({
    queryKey: ['fulfillment-data', userId, userRole],
    queryFn: async () => {
      if (!userId) return null;

      let bookingsQuery = supabase
        .from('bookings')
        .select('*')
        .in('status', ['Pending', 'Allocated', 'Ready'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      let salesQuery = supabase
        .from('direct_sales')
        .select('*')
        .eq('fulfillment_status', 'Pending Handover')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      // Workers can see unassigned orders, orders assigned to them, and orders created by them
      if (userRole !== 'owner') {
        bookingsQuery = bookingsQuery.or(`assigned_to.eq.${userId},assigned_to.is.null,worker_id.eq.${userId}`);
        salesQuery = salesQuery.or(`assigned_to.eq.${userId},assigned_to.is.null,worker_id.eq.${userId}`);
      }

      const [bRes, sRes, pRes, vwbRes, invRes] = await Promise.all([
        bookingsQuery,
        salesQuery,
        supabase.from('plants').select('*').is('deleted_at', null),
        supabase.from('vw_booking_status').select('*'),
        supabase.from('vw_inventory_status').select('*')
      ]);

      return {
        bookings: bRes.data || [],
        sales: sRes.data || [],
        plants: pRes.data || [],
        vwBookingStatus: vwbRes.data || [],
        inventoryStatus: invRes.data || []
      };
    },
    enabled: !!userId,
  });

  const { bookings, sales, plants, vwBookingStatus, inventoryStatus } = queriesData || {};

  const pendingSales = sales || [];
  const pendingBookings = bookings || [];

  // Auto-open modal if URL has matching booking
  useEffect(() => {
    if (pendingBookings.length > 0 && (targetBookingNumber || targetBookingId) && !deliveryModal) {
      const match = pendingBookings.find(
        (b: any) =>
          (targetBookingNumber && b.booking_number === targetBookingNumber) ||
          (targetBookingId && b.id === targetBookingId)
      );
      if (match) {
        openDeliveryModal(match);
      }
    }
  }, [pendingBookings, targetBookingNumber, targetBookingId]);

  const handleFulfillSale = async (id: string) => {
    try {
      if (!navigator.onLine) {
        alert('You must be online to save.');
        return;
      }
      setActionLoading(true);

      const { error } = await supabase
        .from('direct_sales')
        .update({ fulfillment_status: 'Fulfilled' })
        .eq('id', id);

      if (error) throw error;

      const user = JSON.parse(localStorage.getItem('snms_user') || '{}');
      await supabase.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id || '00000000-0000-0000-0000-000000000000',
        user_name: user.name || 'Staff',
        action: 'FULFILL_SALE',
        entity_type: 'direct_sales',
        entity_id: id,
        details: { note: 'Handed over to customer' },
      });

      queryClient.invalidateQueries({ queryKey: ['fulfillment-data'] });
      queryClient.invalidateQueries({ queryKey: ['vw_inventory_status'] });
    } catch (e: any) {
      console.error(e);
      alert('Failed to fulfill sale: ' + (e.message || ''));
    } finally {
      setActionLoading(false);
    }
  };

  const openDeliveryModal = (booking: any) => {
    const statusRow = vwBookingStatus?.find((v: any) => v.booking_id === booking.id);
    const outstanding = statusRow ? Number(statusRow.outstanding_balance) : (booking.total_amount - (booking.advance_paid || 0));
    
    setDeliveryModal({ booking, statusRow });
    setActionError('');
    
    if (outstanding > 0) {
      setPaymentMode('Cash');
      setCashInput(String(outstanding));
      setUpiInput('');
    } else {
      setPaymentMode('Cash');
      setCashInput('0');
      setUpiInput('0');
    }
  };

  // Balance calculation & validation
  const outstandingBalance = useMemo(() => {
    if (!deliveryModal) return 0;
    if (deliveryModal.statusRow) {
      return Number(deliveryModal.statusRow.outstanding_balance);
    }
    return deliveryModal.booking.total_amount - (deliveryModal.booking.advance_paid || 0);
  }, [deliveryModal]);

  const handleCashChange = (val: string) => {
    setCashInput(val);
    const c = parseFloat(val) || 0;
    if (c <= outstandingBalance) {
      setUpiInput(String(Math.round((outstandingBalance - c) * 100) / 100));
    }
  };

  const handleUpiChange = (val: string) => {
    setUpiInput(val);
    const u = parseFloat(val) || 0;
    if (u <= outstandingBalance) {
      setCashInput(String(Math.round((outstandingBalance - u) * 100) / 100));
    }
  };

  const handleModeSelect = (mode: 'Cash' | 'UPI' | 'Split') => {
    setPaymentMode(mode);
    setActionError('');
    if (!deliveryModal) return;
    
    const outstanding = deliveryModal.statusRow 
      ? Number(deliveryModal.statusRow.outstanding_balance) 
      : (deliveryModal.booking.total_amount - (deliveryModal.booking.advance_paid || 0));

    if (mode === 'Cash') {
      setCashInput(String(outstanding));
      setUpiInput('0');
    } else if (mode === 'UPI') {
      setCashInput('0');
      setUpiInput(String(outstanding));
    } else {
      const half = Math.floor(outstanding / 2);
      setCashInput(String(half));
      setUpiInput(String(outstanding - half));
    }
  };

  const cashVal = parseFloat(cashInput) || 0;
  const upiVal = parseFloat(upiInput) || 0;
  const totalEntered = cashVal + upiVal;
  const isNegative = cashVal < 0 || upiVal < 0;
  const isExactMatch = Math.abs(totalEntered - outstandingBalance) < 0.01;
  const isValidPayment = !isNegative && (outstandingBalance === 0 || isExactMatch);

  const executeFinalDelivery = async () => {
    if (!deliveryModal) return;
    if (!navigator.onLine) {
      alert('You must be online to save.');
      return;
    }

    if (outstandingBalance > 0 && !isExactMatch) {
      setActionError(`Exact payment of ₹${outstandingBalance.toLocaleString('en-IN')} is required.`);
      return;
    }

    setActionLoading(true);
    setActionError('');

    try {
      const pCash = paymentMode === 'Cash' ? outstandingBalance : paymentMode === 'UPI' ? 0 : cashVal;
      const pUpi = paymentMode === 'UPI' ? outstandingBalance : paymentMode === 'Cash' ? 0 : upiVal;

      const result = await serverCollectFinalPayment({
        p_booking_id: deliveryModal.booking.id,
        p_cash_amount: outstandingBalance > 0 ? pCash : 0,
        p_upi_amount: outstandingBalance > 0 ? pUpi : 0,
        p_worker_id: userId || undefined
      });

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to record delivery');
      }

      // Invalidate all related caches
      queryClient.invalidateQueries({ queryKey: ['fulfillment-data'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['bookings-data'] });
      queryClient.invalidateQueries({ queryKey: ['vw_booking_status'] });
      queryClient.invalidateQueries({ queryKey: ['vw_daily_cashbook'] });
      queryClient.invalidateQueries({ queryKey: ['vw_profit_summary'] });
      queryClient.invalidateQueries({ queryKey: ['vw_inventory_status'] });

      setDeliveryModal(null);
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || 'Delivery failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading || !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const hasTasks = pendingSales.length > 0 || pendingBookings.length > 0;

  return (
    <div className="p-6 mb-24 space-y-6 max-w-2xl mx-auto">
      <header>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <PackageOpen className="w-8 h-8 text-blue-600" /> Fulfillment & Handover
        </h1>
        <p className="text-gray-500 font-medium text-sm mt-1">
          {userRole === 'owner' ? 'All active orders ready for handover' : 'Open orders and orders assigned to you'}
        </p>
      </header>

      {!hasTasks && (
        <div className="text-center bg-white p-10 rounded-3xl border border-gray-100 shadow-sm mt-6">
          <CheckCircle className="w-16 h-16 text-green-300 mx-auto mb-4" />
          <h2 className="text-xl font-black text-gray-800">All caught up!</h2>
          <p className="text-gray-500 font-medium text-sm mt-2">No pending handovers right now.</p>
        </div>
      )}

      {/* Direct Sales Section */}
      {pendingSales.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-black text-purple-900 text-lg flex items-center gap-2">
            <span className="bg-purple-200 text-purple-800 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
              {pendingSales.length}
            </span>
            Direct Sales (Cash & Carry)
          </h2>
          <div className="grid gap-3">
            {pendingSales.map((sale: any) => {
              const plant = plants?.find((p: any) => p.id === sale.plant_id);
              return (
                <div
                  key={sale.id}
                  className="bg-white p-5 rounded-2xl border border-purple-100 shadow-sm flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-black text-gray-900 text-base">{sale.sale_number}</p>
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                        Paid: ₹{sale.amount}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-gray-700 mt-1">
                      {plant?.plant_name} × {sale.quantity}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                      <User className="w-3 h-3" /> {sale.customer_name || 'Walk-in'} • <Phone className="w-3 h-3 ml-1" /> {sale.customer_phone || 'No phone'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleFulfillSale(sale.id)}
                    disabled={actionLoading}
                    className="bg-purple-600 hover:bg-purple-700 active:scale-95 transition-all text-white font-bold py-3 px-5 rounded-xl text-sm whitespace-nowrap shadow-sm disabled:opacity-60"
                  >
                    Hand Over
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bookings Section */}
      {pendingBookings.length > 0 && (
        <div className="space-y-4 mt-6">
          <h2 className="font-black text-blue-900 text-lg flex items-center gap-2">
            <span className="bg-blue-200 text-blue-800 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
              {pendingBookings.length}
            </span>
            Bookings for Handover
          </h2>
          <div className="grid gap-3">
            {pendingBookings.map((booking: any) => {
              const plant = plants?.find((p: any) => p.id === booking.plant_id);
              const statusRow = vwBookingStatus?.find((v: any) => v.booking_id === booking.id);
              
              const totalAmt = booking.total_amount;
              const advPaid = statusRow ? Number(statusRow.advance_paid) : (booking.advance_paid || 0);
              const finPaid = statusRow ? Number(statusRow.final_paid) : 0;
              const balance = statusRow ? Number(statusRow.outstanding_balance) : (totalAmt - advPaid);

              const isReady = booking.status === 'Ready';
              const isAllocated = booking.status === 'Allocated';
              const isPending = booking.status === 'Pending';

              return (
                <div
                  key={booking.id}
                  className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-gray-900 text-base">{booking.booking_number}</p>
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                            isReady
                              ? 'bg-green-100 text-green-800 border border-green-200'
                              : isAllocated
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                          }`}
                        >
                          {booking.status}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-gray-800 mt-1">
                        {plant?.plant_name} × {booking.quantity} saplings
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        <User className="w-3 h-3" /> {booking.customer_name} • <Phone className="w-3 h-3 ml-1" /> {booking.customer_phone}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total</span>
                      <strong className="text-base font-black text-gray-900">₹{totalAmt.toLocaleString('en-IN')}</strong>
                    </div>
                  </div>

                  {/* Financial Status Summary from View */}
                  <div className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-xl text-center text-xs">
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase block">Advance</span>
                      <span className="font-black text-blue-700">₹{advPaid.toLocaleString('en-IN')}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase block">Final Paid</span>
                      <span className="font-black text-gray-700">₹{finPaid.toLocaleString('en-IN')}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase block">Balance Due</span>
                      <span className={`font-black ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ₹{balance.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
                    <p className="text-xs text-gray-500 font-medium">
                      {balance === 0 ? (
                        <span className="text-green-600 font-bold flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" /> Fully Paid (₹0 Due)
                        </span>
                      ) : (
                        <span className="text-orange-600 font-bold flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> Collect ₹{balance.toLocaleString('en-IN')}
                        </span>
                      )}
                    </p>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openDeliveryModal(booking)}
                        disabled={actionLoading}
                        className={`font-black py-2.5 px-5 rounded-xl text-sm whitespace-nowrap active:scale-95 transition-all shadow-sm ${
                          balance > 0
                            ? 'bg-orange-600 hover:bg-orange-700 text-white'
                            : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                      >
                        {balance > 0 ? 'Collect & Deliver' : 'Deliver Order'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delivery & Final Payment Modal */}
      {deliveryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md border border-gray-100 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-black text-gray-900">
                  {outstandingBalance > 0 ? 'Collect Payment & Deliver' : 'Confirm Handover'}
                </h3>
                <p className="text-xs font-bold text-gray-400 mt-0.5">
                  Order {deliveryModal.booking.booking_number} • {deliveryModal.booking.customer_name}
                </p>
              </div>
              <button
                onClick={() => setDeliveryModal(null)}
                className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Financial Ledger Breakdown */}
            <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600 font-semibold">
                <span>Total Order Amount:</span>
                <span className="text-gray-900 font-black">₹{deliveryModal.booking.total_amount.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-gray-600 font-semibold">
                <span>Advance Already Paid:</span>
                <span className="text-blue-700 font-black">
                  -₹{(deliveryModal.statusRow ? Number(deliveryModal.statusRow.advance_paid) : (deliveryModal.booking.advance_paid || 0)).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="border-t border-blue-200 pt-2 flex justify-between text-base">
                <span className="font-bold text-gray-900">Outstanding Balance Due:</span>
                <span className={`font-black ${outstandingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ₹{outstandingBalance.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Error Banner */}
            {actionError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {/* Payment Input Section when Balance > 0 */}
            {outstandingBalance > 0 ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Select Payment Mode
                  </label>
                  <div className="grid grid-cols-3 gap-2 mt-1.5">
                    {(['Cash', 'UPI', 'Split'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleModeSelect(mode)}
                        className={`py-3 rounded-xl font-bold text-xs border-2 transition-all flex items-center justify-center gap-1.5 ${
                          paymentMode === mode
                            ? mode === 'Cash'
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : mode === 'UPI'
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-purple-500 bg-purple-50 text-purple-700'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {mode === 'Cash' && <Banknote className="w-3.5 h-3.5" />}
                        {mode === 'UPI' && <Smartphone className="w-3.5 h-3.5" />}
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                {paymentMode === 'Split' ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                          <Banknote className="w-3 h-3 text-green-600" /> Cash (₹)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={outstandingBalance}
                          value={cashInput}
                          onChange={(e) => handleCashChange(e.target.value)}
                          placeholder="0"
                          className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-black text-lg text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                          <Smartphone className="w-3 h-3 text-blue-600" /> UPI (₹)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={outstandingBalance}
                          value={upiInput}
                          onChange={(e) => handleUpiChange(e.target.value)}
                          placeholder="0"
                          className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-black text-lg text-gray-900"
                        />
                      </div>
                    </div>

                    {/* Quick Preset Buttons */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const half = Math.floor(outstandingBalance / 2);
                          setCashInput(String(half));
                          setUpiInput(String(outstandingBalance - half));
                        }}
                        className="flex-1 py-1.5 px-2 bg-purple-50 hover:bg-purple-100 text-purple-700 text-[11px] font-bold rounded-lg border border-purple-200 transition-all active:scale-95"
                      >
                        50% / 50%
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCashInput(String(outstandingBalance));
                          setUpiInput('0');
                        }}
                        className="flex-1 py-1.5 px-2 bg-green-50 hover:bg-green-100 text-green-700 text-[11px] font-bold rounded-lg border border-green-200 transition-all active:scale-95"
                      >
                        All Cash
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCashInput('0');
                          setUpiInput(String(outstandingBalance));
                        }}
                        className="flex-1 py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold rounded-lg border border-blue-200 transition-all active:scale-95"
                      >
                        All UPI
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">
                      Amount Collecting via {paymentMode} (₹)
                    </label>
                    <input
                      type="number"
                      readOnly
                      value={outstandingBalance}
                      className="w-full mt-1 p-3 bg-gray-100 border border-gray-200 rounded-xl outline-none font-black text-2xl text-gray-900 cursor-not-allowed"
                    />
                  </div>
                )}

                {/* Live validation feedback for Split */}
                {paymentMode === 'Split' && (
                  <div className={`p-2.5 rounded-xl text-xs font-bold text-center ${
                    isExactMatch 
                      ? 'bg-green-50 text-green-700 border border-green-200' 
                      : totalEntered < outstandingBalance
                      ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {isExactMatch ? (
                      `✓ Exact match: ₹${totalEntered.toLocaleString('en-IN')}`
                    ) : totalEntered < outstandingBalance ? (
                      `Remaining to allocate: ₹${(outstandingBalance - totalEntered).toLocaleString('en-IN')}`
                    ) : (
                      `Exceeds balance by: ₹${(totalEntered - outstandingBalance).toLocaleString('en-IN')}`
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                <ShieldCheck className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <p className="font-black text-green-900 text-sm">No Payment Required</p>
                <p className="text-xs text-green-700 font-medium mt-0.5">
                  The order is 100% prepaid. Proceed directly with physical handover.
                </p>
              </div>
            )}

            {/* Modal Actions */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeliveryModal(null)}
                disabled={actionLoading}
                className="py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeFinalDelivery}
                disabled={actionLoading || !isValidPayment}
                className="py-3 bg-green-600 hover:bg-green-700 text-white font-black rounded-xl active:scale-95 transition-all shadow-md shadow-green-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? 'Processing...' : outstandingBalance > 0 ? 'Collect & Complete' : 'Confirm Handover'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FulfillmentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    }>
      <FulfillmentContent />
    </Suspense>
  );
}
