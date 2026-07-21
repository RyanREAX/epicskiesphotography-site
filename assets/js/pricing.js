/* Packages & pricing CRUD — senior uses flexible à la carte tiers
   (admin defines however many tiers, each with a photo-count threshold and
   a price); wedding uses fixed named packages with a bullet-point
   description and an optional single add-on. Fully separate tables, per
   the "senior and wedding are separate businesses" requirement. */

import { supabase } from './auth.js?v=1';

export async function listSeniorTiers() {
  const { data, error } = await supabase
    .from('senior_pricing_tiers')
    .select('*')
    .order('sort_order', { ascending: true });
  return { tiers: data || [], error };
}

export async function upsertSeniorTier(tier) {
  const { data, error } = await supabase
    .from('senior_pricing_tiers')
    .upsert(tier)
    .select()
    .single();
  return { tier: data, error };
}

export async function deleteSeniorTier(id) {
  const { error } = await supabase.from('senior_pricing_tiers').delete().eq('id', id);
  return { error };
}

export async function listWeddingTiers() {
  const { data, error } = await supabase
    .from('wedding_pricing_tiers')
    .select('*')
    .order('sort_order', { ascending: true });
  return { tiers: data || [], error };
}

export async function upsertWeddingTier(tier) {
  const { data, error } = await supabase
    .from('wedding_pricing_tiers')
    .upsert(tier)
    .select()
    .single();
  return { tier: data, error };
}

export async function deleteWeddingTier(id) {
  const { error } = await supabase.from('wedding_pricing_tiers').delete().eq('id', id);
  return { error };
}

export async function listWeddingPackages() {
  const { data, error } = await supabase
    .from('wedding_packages')
    .select('*')
    .order('sort_order', { ascending: true });
  return { packages: data || [], error };
}

export async function upsertWeddingPackage(pkg) {
  const { data, error } = await supabase
    .from('wedding_packages')
    .upsert(pkg)
    .select()
    .single();
  return { package: data, error };
}

export async function deleteWeddingPackage(id) {
  const { error } = await supabase.from('wedding_packages').delete().eq('id', id);
  return { error };
}
