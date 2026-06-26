import os

filename = r'src/app/bookings/[bookingNumber]/edit/page.tsx'
with open(filename, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if line.startswith('import { db, generateId, logAudit, toLocalDateStr, resolvePlantPrice } from'):
        new_lines.append('import { generateId, logAudit, toLocalDateStr, resolvePlantPrice } from \'@/lib/db\';\n')
    elif line.startswith('import { useLiveQuery } from'):
        new_lines.append('import { useQuery, useQueryClient } from \'@tanstack/react-query\';\nimport { supabase } from \'@/lib/supabaseClient\';\n')
    elif line.startswith('  const plants = useLiveQuery'):
        new_lines.append('''  const queryClient = useQueryClient();

  const { data: plants } = useQuery({ queryKey: ['plants'], queryFn: async () => { const { data } = await supabase.from('plants').select('*').is('deleted_at', null).eq('active', true); return data || []; } });
  const { data: lots } = useQuery({ queryKey: ['lots', plantId], queryFn: async () => { if (!plantId) return []; const { data } = await supabase.from('lots').select('*').eq('plant_id', plantId).is('deleted_at', null); return data || []; }, enabled: !!plantId });
  const { data: bookings } = useQuery({ queryKey: ['bookings'], queryFn: async () => { const { data } = await supabase.from('bookings').select('*').is('deleted_at', null); return data || []; } });
  const { data: allotments } = useQuery({ queryKey: ['allotments'], queryFn: async () => { const { data } = await supabase.from('allotments').select('*').is('deleted_at', null); return data || []; } });
  const { data: direct_sales } = useQuery({ queryKey: ['direct_sales'], queryFn: async () => { const { data } = await supabase.from('direct_sales').select('*').is('deleted_at', null); return data || []; } });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: async () => { const { data } = await supabase.from('customers').select('*').is('deleted_at', null); return data || []; } });

  const { data: originalBookingRows } = useQuery({
    queryKey: ['bookings', bookingNumber],
    queryFn: async () => {
      if (!bookingNumber) return [];
      const { data } = await supabase.from('bookings').select('*').eq('booking_number', bookingNumber).is('deleted_at', null);
      return data || [];
    },
    enabled: !!bookingNumber
  });
''')
        skip = True
    elif skip and line.strip() == '}, [bookingNumber]);':
        skip = False
    elif skip:
        continue
    elif line.strip() == 'const executeCancel = async (refundAmount: number, paymentMode: \'Cash\' | \'UPI\' | null, refundStatus: \'Refunded\' | \'Forfeited\' | \'Not Refunded\') => {':
        new_lines.append('''  const executeCancel = async (refundAmount: number, paymentMode: 'Cash' | 'UPI' | null, refundStatus: 'Refunded' | 'Forfeited' | 'Not Refunded') => {
    setLoading(true);
    if (!navigator.onLine) { alert('You must be online to save.'); setLoading(false); return; }
    try {
      const rows = originalBookingRows || [];
      const rowIds = rows.map(r => r.id);

      // 1. Release allotments
      const { data: relatedAllotments } = await supabase.from('allotments').select('*').in('booking_id', rowIds).is('deleted_at', null);
      if (relatedAllotments && relatedAllotments.length > 0) {
        const deletedAt = new Date().toISOString();
        const allotIds = relatedAllotments.map(a => a.id);
        await supabase.from('allotments').update({ deleted_at: deletedAt }).in('id', allotIds);
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
          status: 'Cancelled',
          refund_amount: itemRefund,
          refund_payment_mode: paymentMode,
          refund_status: refundStatus,
          refund_date: refundStatus === 'Refunded' ? toLocalDateStr(new Date().toISOString()) : null
        };

        await supabase.from('bookings').update(updates).eq('id', row.id);
      }

      const user = currentUser || { id: 'unknown', name: 'Unknown' };
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
''')
        skip = True
    elif skip and line.strip() == 'const handleDeleteBooking = async () => {':
        skip = False
        new_lines.append('''  const handleDeleteBooking = async () => {
    if (!confirm("CRITICAL WARNING: Are you sure you want to completely DELETE this booking? This will erase it from the system entirely and remove all financial records/advances (use ONLY for accidental entries). This cannot be undone.")) return;
    setLoading(true);
    if (!navigator.onLine) { alert('You must be online to save.'); setLoading(false); return; }
    try {
      const deletedAt = new Date().toISOString();
      const rowIds = (originalBookingRows || []).map(r => r.id);
      if (rowIds.length > 0) {
         await supabase.from('bookings').update({ deleted_at: deletedAt }).in('id', rowIds);
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
''')
        skip = True
    elif skip and line.strip() == 'const handleCashChange = (val: string) => {':
        skip = False
        new_lines.append(line)
    elif line.strip() == 'try {':
        if i + 1 < len(lines) and 'await db.transaction(\'rw\'' in ''.join(lines[i:i+3]):
            new_lines.append('''    try {
      if (!navigator.onLine) { alert('You must be online to save.'); setLoading(false); return; }
      const originalIds = new Set(originalBookingRows?.map(r => r.id) || []);
      const modifiedIds = new Set(modifiedBookings.map(b => b.id));

      // 1. Identify deleted items
      const deletedIds = Array.from(originalIds).filter(id => !modifiedIds.has(id));
      if (deletedIds.length > 0) {
        const deletedAt = new Date().toISOString();
        await supabase.from('bookings').update({ deleted_at: deletedAt }).in('id', deletedIds);
        
        // Delete allotments for deleted row
        const { data: rowAllotments } = await supabase.from('allotments').select('id').in('booking_id', deletedIds);
        if (rowAllotments && rowAllotments.length > 0) {
            await supabase.from('allotments').update({ deleted_at: deletedAt }).in('id', rowAllotments.map(a => a.id));
        }
      }

      // 2. Identify inserted & updated items
      for (const b of modifiedBookings) {
        if (originalIds.has(b.id)) {
          const original = originalBookingRows?.find(r => r.id === b.id);
          const isModified = original ? (original.plant_id !== b.plant_id || original.quantity !== b.quantity) : false;

          if (isModified) {
            // Delete allotments for modified row
            const { data: rowAllotments } = await supabase.from('allotments').select('id').eq('booking_id', b.id);
            if (rowAllotments && rowAllotments.length > 0) {
                const deletedAt = new Date().toISOString();
                await supabase.from('allotments').update({ deleted_at: deletedAt }).in('id', rowAllotments.map(a => a.id));
            }
          }
          await supabase.from('bookings').update(b).eq('id', b.id);
        } else {
          await supabase.from('bookings').insert(b);
        }
      }

      // 3. Customer logic
      if (customerPhone && customerName) {
        const { data: existingCust } = await supabase.from('customers').select('*').eq('mobile', customerPhone).is('deleted_at', null).maybeSingle();
        if (!existingCust) {
          const newCust = { id: generateId(), name: customerName, mobile: customerPhone, city: city || null };
          await supabase.from('customers').insert(newCust);
        } else {
          await supabase.from('customers').update({ name: customerName, city: city || existingCust.city }).eq('id', existingCust.id);
        }
      }

      // 4. Audit Log
      await logAudit(user.id, user.name, 'EDIT_BOOKING', 'bookings', bookingNumber, {
        totalAmount: totalAmount,
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
''')
            skip = True
        else:
            new_lines.append(line)
    elif skip and line.strip() == 'return (':
        skip = False
        new_lines.append(line)
    elif line.strip() == 'sync_status: \'pending\' as const,':
        continue
    else:
        if not skip:
            new_lines.append(line)

with open(filename, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
