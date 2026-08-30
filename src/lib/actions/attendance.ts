'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateId, toLocalDateStr } from '@/lib/utils';

export async function serverMarkAttendance(params: {
  worker_id: string;
  status: 'Present' | 'Absent' | 'Half Day';
  date?: string;
}) {
  try {
    const recordDate = params.date || toLocalDateStr();

    // 1. Remove existing entry for worker on that date
    await supabaseAdmin
      .from('attendance')
      .delete()
      .eq('worker_id', params.worker_id)
      .eq('date', recordDate);

    // 2. Insert new record
    const id = generateId();
    const { data, error } = await supabaseAdmin
      .from('attendance')
      .insert({
        id,
        worker_id: params.worker_id,
        date: recordDate,
        status: params.status
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, record: data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Server error marking attendance' };
  }
}
