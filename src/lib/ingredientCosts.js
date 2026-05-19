const MEASURED_UNITS = {
  kg: { baseUnit: 'gr', factor: 1000 },
  gr: { baseUnit: 'gr', factor: 1 },
  liter: { baseUnit: 'ml', factor: 1000 },
  ml: { baseUnit: 'ml', factor: 1 },
};

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const normalizeIngredientName = (value) => String(value || '').trim().toLowerCase();

export const getIngredientBaseUnit = (ingredient) => {
  if (!ingredient) return 'pcs';
  if (ingredient.items_per_unit && ingredient.base_unit) return ingredient.base_unit;
  return MEASURED_UNITS[ingredient.unit]?.baseUnit || ingredient.unit || 'pcs';
};

export const convertIngredientQuantity = (quantity, fromUnit, toUnit) => {
  const qty = toNumber(quantity);
  if (!fromUnit || !toUnit || fromUnit === toUnit) return qty;

  const from = MEASURED_UNITS[fromUnit];
  const to = MEASURED_UNITS[toUnit];
  if (from && to && from.baseUnit === to.baseUnit) {
    return (qty * from.factor) / to.factor;
  }
  return qty;
};

export const convertQuantityToBase = (quantity, fromUnit, baseUnit) => {
  const qty = toNumber(quantity);
  if (!fromUnit || !baseUnit || fromUnit === baseUnit) return qty;

  const from = MEASURED_UNITS[fromUnit];
  const base = MEASURED_UNITS[baseUnit];
  if (from && from.baseUnit === baseUnit) return qty * from.factor;
  if (from && base && from.baseUnit === base.baseUnit) return (qty * from.factor) / base.factor;
  return qty;
};

export const getIngredientBaseQuantity = (ingredient) => {
  const qty = toNumber(ingredient?.quantity);
  if (!ingredient) return 0;
  if (ingredient.items_per_unit && ingredient.base_unit) {
    return qty * toNumber(ingredient.items_per_unit);
  }
  return convertQuantityToBase(qty, ingredient.unit, getIngredientBaseUnit(ingredient));
};

export const getIngredientPurchaseTotal = (ingredient) => {
  if (!ingredient) return 0;
  const price = toNumber(ingredient.unit_price);
  const qty = toNumber(ingredient.quantity);
  if (ingredient.items_per_unit && ingredient.base_unit) return price * qty;
  if (MEASURED_UNITS[ingredient.unit]) return price;
  return price * qty;
};

export const getIngredientPricePerBase = (ingredient) => {
  const baseQty = getIngredientBaseQuantity(ingredient);
  return baseQty > 0 ? getIngredientPurchaseTotal(ingredient) / baseQty : 0;
};

export const buildIngredientPriceMap = (ingredients = []) => {
  const groups = {};
  ingredients.forEach(ingredient => {
    const key = normalizeIngredientName(ingredient.name);
    if (!key) return;
    if (!groups[key]) groups[key] = [];
    groups[key].push(ingredient);
  });

  return Object.fromEntries(
    Object.entries(groups).map(([key, entries]) => {
      const template = entries[0];
      const baseUnit = getIngredientBaseUnit(template);
      let totalCost = 0;
      let totalQtyBase = 0;

      entries.forEach(ingredient => {
        const rowBaseUnit = getIngredientBaseUnit(ingredient);
        const qtyBase = getIngredientBaseQuantity(ingredient);
        if (rowBaseUnit !== baseUnit || qtyBase <= 0) return;
        totalCost += getIngredientPurchaseTotal(ingredient);
        totalQtyBase += qtyBase;
      });

      return [key, {
        pricePerBase: totalQtyBase > 0 ? totalCost / totalQtyBase : 0,
        baseUnit,
        template,
        purchaseCount: entries.length,
        totalCost,
        totalQtyBase,
      }];
    })
  );
};

export const getIngredientPriceForUnit = (priceDataOrIngredient, unit) => {
  if (!priceDataOrIngredient) return 0;
  const pricePerBase = priceDataOrIngredient.pricePerBase ?? priceDataOrIngredient.__pricePerBase ?? getIngredientPricePerBase(priceDataOrIngredient);
  const baseUnit = priceDataOrIngredient.baseUnit || priceDataOrIngredient.__baseUnit || getIngredientBaseUnit(priceDataOrIngredient);
  return pricePerBase * convertQuantityToBase(1, unit, baseUnit);
};

export const calculateIngredientUsageCost = (priceDataOrIngredient, quantity, unit) => (
  getIngredientPriceForUnit(priceDataOrIngredient, unit) * toNumber(quantity)
);

export const getIngredientDisplayPrice = (ingredient) => {
  const baseUnit = ingredient?.__baseUnit || getIngredientBaseUnit(ingredient);
  return {
    price: ingredient?.__pricePerBase ?? getIngredientPricePerBase(ingredient),
    unit: baseUnit,
  };
};

export const averageIngredientsForSelection = (ingredients = []) => {
  const groups = {};
  ingredients.forEach(ingredient => {
    const key = normalizeIngredientName(ingredient.name);
    if (!key) return;
    if (!groups[key]) groups[key] = [];
    groups[key].push(ingredient);
  });

  const priceMap = buildIngredientPriceMap(ingredients);
  return Object.entries(groups).map(([key, entries]) => {
    const template = entries[0];
    const priceData = priceMap[key];
    const unitPrice = getIngredientPriceForUnit(priceData, template.unit);
    const normalizedQuantity = MEASURED_UNITS[template.unit] ? 1 : template.quantity;
    return {
      ...template,
      quantity: normalizedQuantity,
      unit_price: unitPrice,
      __pricePerBase: priceData.pricePerBase,
      __baseUnit: priceData.baseUnit,
      _purchaseCount: entries.length,
    };
  });
};
