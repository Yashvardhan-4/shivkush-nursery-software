export function generateId() {
  return crypto.randomUUID();
}

export function toLocalDateStr(date: Date | string | number = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayIST() {
  const d = new Date();
  const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' } as const;
  const formatter = new Intl.DateTimeFormat('en-CA', options); // 'en-CA' outputs YYYY-MM-DD
  const formatted = formatter.format(d);
  return formatted;
}

export function resolvePlantPrice(plant: any, quantity: number): number {
  if (plant.pricing_tiers && plant.pricing_tiers.length > 0) {
    const sortedTiers = [...plant.pricing_tiers].sort((a: any, b: any) => b.min_quantity - a.min_quantity);
    for (const tier of sortedTiers) {
      if (quantity >= tier.min_quantity) {
        return tier.price;
      }
    }
  }
  return plant.selling_price;
}

export interface PricingTier {
  min_quantity: number;
  price: number;
}

import { supabase } from '@/lib/supabaseClient';

export async function logAudit(user_id: string, user_name: string, action: string, entity: string, entity_id: string, details?: any) {
  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    user_id,
    user_name,
    action,
    entity,
    entity_id,
    details,
    created_at: new Date().toISOString()
  });
}