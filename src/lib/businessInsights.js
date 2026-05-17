export const getDateKey = (value) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const calculateProductionRecommendations = (products = [], sales = [], days = 30) => {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const soldByProduct = {};
  sales.forEach(sale => {
    if (new Date(sale.transaction_date) < since) return;
    if (!soldByProduct[sale.product_id]) soldByProduct[sale.product_id] = 0;
    soldByProduct[sale.product_id] += sale.quantity || 0;
  });

  return products
    .map(product => {
      const totalSold = soldByProduct[product.id] || 0;
      const avgDaily = totalSold / days;
      const stock = product.stock || 0;
      const daysLeft = avgDaily > 0 ? stock / avgDaily : Infinity;
      const targetStock = Math.ceil(avgDaily * 4);
      return {
        id: product.id,
        name: product.name,
        stock,
        avgDaily,
        daysLeft,
        suggestedQty: Math.max(0, targetStock - stock),
      };
    })
    .filter(item => item.avgDaily > 0 && (item.daysLeft <= 3 || item.stock <= 5))
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5);
};

export const calculateSalesInsights = (sales = []) => {
  const customerMap = {};
  const paymentMap = {};
  const weekdayMap = {};

  sales.forEach(sale => {
    const total = sale.total_price || (sale.unit_price || 0) * (sale.quantity || 0);
    const customer = sale.customer_name || 'Tanpa nama';
    const payment = sale.payment_method || 'Lainnya';
    const weekday = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(new Date(sale.transaction_date));

    customerMap[customer] = (customerMap[customer] || 0) + total;
    paymentMap[payment] = (paymentMap[payment] || 0) + total;
    weekdayMap[weekday] = (weekdayMap[weekday] || 0) + total;
  });

  const topEntry = (map) => Object.entries(map).sort((a, b) => b[1] - a[1])[0];
  const [topCustomer, topCustomerValue] = topEntry(customerMap) || ['-', 0];
  const [topPayment, topPaymentValue] = topEntry(paymentMap) || ['-', 0];
  const [bestDay, bestDayValue] = topEntry(weekdayMap) || ['-', 0];

  return { topCustomer, topCustomerValue, topPayment, topPaymentValue, bestDay, bestDayValue };
};
