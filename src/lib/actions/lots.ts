'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateId } from '@/lib/utils';

export interface SaveLotParams {
  id?: string;
  lot_number: string;
  lot_name?: string | null;
  plant_id: string;
  total_quantity: number;
  initial_quantity?: number;
  ready_date: string;
  status?: 'Growing' | 'Ready' | 'Completed';
  notes?: string;
}

export async function serverSaveLot(params: SaveLotParams) {
  try {
    const lotId = params.id || generateId();
    const newLot = {
      id: lotId,
      lot_number: params.lot_number,
      lot_name: params.lot_name || null,
      plant_id: params.plant_id,
      total_quantity: params.total_quantity,
      initial_quantity: params.initial_quantity || params.total_quantity,
      ready_date: params.ready_date,
      status: params.status || 'Growing',
      notes: params.notes || '',
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('lots')
      .upsert(newLot)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, lot: data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Server error saving lot' };
  }
}

export async function serverDeleteLot(id: string) {
  try {
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('lots')
      .update({ deleted_at: now, status: 'Completed' })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Server error deleting lot' };
  }
}
