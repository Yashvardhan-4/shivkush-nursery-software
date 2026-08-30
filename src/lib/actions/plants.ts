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
  pricing_tiers?: PricingTier[];
  active?: boolean;
}

export async function serverSavePlant(params: SavePlantParams) {
  try {
    const plantId = params.id || generateId();
    const newPlant = {
      id: plantId,
      plant_name: params.plant_name.trim(),
      variety: params.variety?.trim() || null,
      category: params.category.trim(),
      selling_price: params.selling_price,
      pricing_tiers: params.pricing_tiers || [],
      active: params.active ?? true,
      updated_at: new Date().toISOString()
    };

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
