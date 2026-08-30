'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateId } from '@/lib/utils';

export interface SaveQrParams {
  id?: string;
  name: string;
  upi_id: string;
  image_data: string;
  active?: boolean;
}

export async function serverSaveQr(params: SaveQrParams) {
  try {
    const qrId = params.id || generateId();
    const qrData = {
      id: qrId,
      name: params.name.trim(),
      upi_id: params.upi_id.trim(),
      image_data: params.image_data,
      active: params.active ?? true,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('payment_qrs')
      .upsert(qrData)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, qr: data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Server error saving QR' };
  }
}

export async function serverDeleteQr(id: string) {
  try {
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('payment_qrs')
      .update({ deleted_at: now, active: false })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Server error deleting QR' };
  }
}

export async function serverToggleQr(id: string, active: boolean) {
  try {
    const { error } = await supabaseAdmin
      .from('payment_qrs')
      .update({ active, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Server error updating QR status' };
  }
}
