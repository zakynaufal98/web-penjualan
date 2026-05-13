import { supabase } from './supabase';

export const reconcileProductStock = async (productId, { force = false } = {}) => {
  if (!productId) return { reconciled: false, stock: null };

  const [{ data: logs, error: logsError }, { data: sales }, { data: recipes }] = await Promise.all([
    supabase.from('production_logs').select('quantity, konsumsi').eq('product_id', productId),
    supabase.from('sales').select('quantity').eq('product_id', productId),
    supabase.from('recipes').select('id').eq('product_id', productId).limit(1),
  ]);

  if (logsError && !force) return { reconciled: false, stock: null };

  const productionLogs = logs || [];
  const isProductionManaged = force || productionLogs.length > 0 || (recipes || []).length > 0;
  if (!isProductionManaged) return { reconciled: false, stock: null };

  const produced = productionLogs.reduce((sum, log) => {
    const netProduced = (log.quantity || 0) - (log.konsumsi || 0);
    return sum + Math.max(0, netProduced);
  }, 0);
  const sold = (sales || []).reduce((sum, sale) => sum + (sale.quantity || 0), 0);
  const stock = Math.max(0, produced - sold);

  const { error } = await supabase.from('products').update({ stock }).eq('id', productId);
  return { reconciled: !error, stock, error };
};
