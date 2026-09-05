'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateId } from '@/lib/utils';
import type { PricingTier } from '@/lib/utils';
import crypto from 'crypto';

export interface SavePlantParams {
  id?: string;
  plant_name: string;
  variety?: string;
  category: string;
  selling_price: number;
  total_stock?: number;
  pricing_tiers?: PricingTier[];
  active?: boolean;
}

export async function serverSavePlant(params: SavePlantParams) {
  try {
    const plantId = params.id || generateId();
    const newPlant: any = {
      id: plantId,
      plant_name: params.plant_name.trim(),
      variety: params.variety?.trim() || null,
      category: params.category.trim(),
      selling_price: params.selling_price,
      pricing_tiers: params.pricing_tiers || [],
      active: params.active ?? true,
      updated_at: new Date().toISOString()
    };

    if (params.total_stock !== undefined) {
      newPlant.total_stock = Math.max(0, params.total_stock);
    }

    const { data, error } = await supabaseAdmin
      .from('plants')
      .upsert(newPlant)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, plant: data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Server error saving plant' };
  }
}

export interface AdjustPlantStockParams {
  plantId: string;
  adjustmentType: 'MORTALITY' | 'RECOUNT_SHORTAGE' | 'RECOUNT_SURPLUS' | 'DAMAGE' | 'OTHER' | 'MANUAL_ADJUSTMENT';
  quantityDelta: number;
  reason: string;
  userId?: string;
  userName?: string;
}

export async function serverAdjustPlantStock(params: AdjustPlantStockParams) {
  try {
    const { data, error } = await supabaseAdmin.rpc('rpc_adjust_plant_stock', {
      p_plant_id: params.plantId,
      p_adjustment_type: params.adjustmentType,
      p_quantity_delta: params.quantityDelta,
      p_reason: params.reason,
      p_user_id: params.userId || '00000000-0000-0000-0000-000000000000',
      p_user_name: params.userName || 'Owner'
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, result: data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Server error adjusting plant stock' };
  }
}

export async function serverDeletePlant(id: string) {
  try {
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('plants')
      .update({ deleted_at: now, active: false })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Server error deleting plant' };
  }
}
