import { supabase } from './supabase';

export const calculateProductionStock = (logs = [], sales = []) => {
  const allocations = (logs || [])
    .map(log => ({
      id: log.id,
      date: new Date(log.production_date),
      remaining: Math.max(0, (log.quantity || 0) - (log.konsumsi || 0)),
    }))
    .sort((a, b) => a.date - b.date);

  [...(sales || [])]
    .sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date))
    .forEach(sale => {
      let qtyLeft = sale.quantity || 0;
      const saleDate = new Date(sale.transaction_date);

      for (const allocation of allocations) {
        if (qtyLeft <= 0) break;
        if (allocation.date > saleDate) continue;

        const taken = Math.min(qtyLeft, allocation.remaining);
        allocation.remaining -= taken;
        qtyLeft -= taken;
      }
    });

  return allocations.reduce((sum, allocation) => sum + allocation.remaining, 0);
};

export const resolveProductionStocks = async (products = [], { persist = false } = {}) => {
  const productIds = products.map(product => product.id).filter(Boolean);
  if (productIds.length === 0) return products;

  const [{ data: logs }, { data: sales }] = await Promise.all([
    supabase.from('production_logs').select('id, product_id, quantity, konsumsi, production_date').in('product_id', productIds),
    supabase.from('sales').select('product_id, quantity, transaction_date').in('product_id', productIds),
  ]);

  const logsByProduct = {};
  const salesByProduct = {};
  const managedProductIds = new Set();

  (logs || []).forEach(log => {
    if (!logsByProduct[log.product_id]) logsByProduct[log.product_id] = [];
    logsByProduct[log.product_id].push(log);
    managedProductIds.add(log.product_id);
  });

  (sales || []).forEach(sale => {
    if (!salesByProduct[sale.product_id]) salesByProduct[sale.product_id] = [];
    salesByProduct[sale.product_id].push(sale);
  });

  const resolvedProducts = products.map(product => {
    if (!managedProductIds.has(product.id)) return product;
    return {
      ...product,
      stock: calculateProductionStock(logsByProduct[product.id] || [], salesByProduct[product.id] || []),
    };
  });

  if (persist) {
    await Promise.all(
      resolvedProducts
        .filter(product => managedProductIds.has(product.id))
        .map(product => supabase.from('products').update({ stock: product.stock }).eq('id', product.id))
    );
  }

  return resolvedProducts;
};

export const reconcileProductStock = async (productId, { force = false } = {}) => {
  if (!productId) return { reconciled: false, stock: null };

  const [{ data: logs, error: logsError }, { data: sales }] = await Promise.all([
    supabase.from('production_logs').select('id, quantity, konsumsi, production_date').eq('product_id', productId),
    supabase.from('sales').select('quantity, transaction_date').eq('product_id', productId),
  ]);

  if (logsError && !force) return { reconciled: false, stock: null };

  const productionLogs = logs || [];
  const isProductionManaged = force || productionLogs.length > 0;
  if (!isProductionManaged) return { reconciled: false, stock: null };

  const stock = calculateProductionStock(productionLogs, sales || []);

  const { error } = await supabase.from('products').update({ stock }).eq('id', productId);
  return { reconciled: !error, stock, error };
};
