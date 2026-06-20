import { supabase } from './supabaseClient';

export async function getSetting(key, fallback = null) {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .single();
  return data ? data.value : fallback;
}

export async function getDownPaymentPercent() {
  const value = await getSetting('down_payment_percent', '15');
  return parseFloat(value) / 100;
}