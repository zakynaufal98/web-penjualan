import { supabase } from './supabase';

const PRODUCTION_TOPPINGS_KEY = 'kukis_production_toppings_v2';
const PRODUCT_BASE_HPP_KEY = 'kukis_product_base_hpp_v1';
const TOPPING_RECIPES_KEY = 'kukis_topping_recipes_v1';

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const readJson = (key, fallback) => {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeNameKey = (value) => String(value || '').trim().toLowerCase();

export const normalizeToppingRecipe = (recipe = {}) => {
  const batchSize = Math.max(1, toNumber(recipe.batch_size || recipe.batchSize || 1));
  const items = (recipe.items || [])
    .map(item => ({
      id: item.id || item.ingredient_key || `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ingredient_master_id: item.ingredient_master_id || '',
      ingredient_name: String(item.ingredient_name || item.name || '').trim(),
      ingredient_key: normalizeNameKey(item.ingredient_key || item.ingredient_name || item.name),
      quantity_per_unit: Math.max(0, toNumber(item.quantity_per_unit)),
      unit: item.unit || 'gr',
      cost_per_unit: Math.max(0, toNumber(item.cost_per_unit)),
    }))
    .filter(item => item.ingredient_name && item.quantity_per_unit > 0);

  return {
    id: recipe.id || `topping-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(recipe.name || '').trim(),
    batch_size: batchSize,
    overhead_pct: Math.max(0, toNumber(recipe.overhead_pct)),
    margin_pct: Math.max(0, toNumber(recipe.margin_pct)),
    hpp_per_unit: Math.max(0, toNumber(recipe.hpp_per_unit)),
    suggested_price: Math.max(0, toNumber(recipe.suggested_price)),
    items,
    updated_at: recipe.updated_at || new Date().toISOString(),
  };
};

export const loadToppingRecipes = () => (
  readJson(TOPPING_RECIPES_KEY, [])
    .map(normalizeToppingRecipe)
    .filter(recipe => recipe.name && recipe.items.length > 0)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
);

export const saveToppingRecipe = (recipe) => {
  const normalized = normalizeToppingRecipe({ ...recipe, updated_at: new Date().toISOString() });
  if (!normalized.name || normalized.items.length === 0) return loadToppingRecipes();

  const recipes = loadToppingRecipes();
  const existingByName = recipes.find(item => normalizeNameKey(item.name) === normalizeNameKey(normalized.name));
  const recipeToSave = {
    ...normalized,
    id: normalized.id || existingByName?.id || `topping-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  const nextRecipes = [
    recipeToSave,
    ...recipes.filter(item => item.id !== recipeToSave.id && normalizeNameKey(item.name) !== normalizeNameKey(recipeToSave.name)),
  ];
  writeJson(TOPPING_RECIPES_KEY, nextRecipes);
  return nextRecipes;
};

const normalizeToppingRecipeFromDb = (recipe = {}) => normalizeToppingRecipe({
  id: recipe.id,
  name: recipe.name,
  batch_size: recipe.batch_size,
  overhead_pct: recipe.overhead_pct,
  margin_pct: recipe.margin_pct,
  hpp_per_unit: recipe.hpp_per_unit,
  suggested_price: recipe.suggested_price,
  updated_at: recipe.updated_at,
  items: (recipe.topping_recipe_items || [])
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(item => ({
      id: item.id,
      ingredient_master_id: item.ingredient_master_id,
      ingredient_name: item.ingredient_masters?.name || item.ingredient_name,
      ingredient_key: item.ingredient_masters?.name || item.ingredient_name,
      quantity_per_unit: item.quantity_per_unit,
      unit: item.unit,
      cost_per_unit: item.cost_per_unit,
    })),
});

export const fetchToppingRecipes = async () => {
  const { data, error } = await supabase
    .from('topping_recipes')
    .select(`
      id,
      name,
      batch_size,
      overhead_pct,
      margin_pct,
      hpp_per_unit,
      suggested_price,
      updated_at,
      topping_recipe_items(
        id,
        ingredient_master_id,
        ingredient_name,
        quantity_per_unit,
        unit,
        cost_per_unit,
        sort_order,
        ingredient_masters(id, name)
      )
    `)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizeToppingRecipeFromDb);
};

export const saveToppingRecipeToSupabase = async (recipe) => {
  const normalized = normalizeToppingRecipe(recipe);
  if (!normalized.name || normalized.items.length === 0) {
    throw new Error('Nama dan bahan topping wajib diisi.');
  }
  if (normalized.items.some(item => !item.ingredient_master_id)) {
    throw new Error('Sebagian bahan topping belum punya master bahan baku.');
  }

  const { data: authData } = await supabase.auth.getUser();
  const payload = {
    name: normalized.name,
    batch_size: normalized.batch_size,
    overhead_pct: normalized.overhead_pct,
    margin_pct: normalized.margin_pct,
    hpp_per_unit: normalized.hpp_per_unit,
    suggested_price: normalized.suggested_price,
    created_by: authData?.user?.id || null,
  };

  let savedRecipe;
  if (recipe.id) {
    const { data, error } = await supabase
      .from('topping_recipes')
      .update(payload)
      .eq('id', recipe.id)
      .select('id, name, batch_size, overhead_pct, margin_pct, hpp_per_unit, suggested_price, updated_at')
      .single();
    if (error) throw error;
    savedRecipe = data;
  } else {
    const { data, error } = await supabase
      .from('topping_recipes')
      .insert(payload)
      .select('id, name, batch_size, overhead_pct, margin_pct, hpp_per_unit, suggested_price, updated_at')
      .single();
    if (error) throw error;
    savedRecipe = data;
  }

  const { error: deleteError } = await supabase
    .from('topping_recipe_items')
    .delete()
    .eq('topping_recipe_id', savedRecipe.id);
  if (deleteError) throw deleteError;

  const itemsPayload = normalized.items.map((item, index) => ({
    topping_recipe_id: savedRecipe.id,
    ingredient_master_id: item.ingredient_master_id,
    ingredient_name: item.ingredient_name,
    quantity_per_unit: item.quantity_per_unit,
    unit: item.unit,
    cost_per_unit: item.cost_per_unit,
    sort_order: index,
  }));

  const { error: insertItemsError } = await supabase
    .from('topping_recipe_items')
    .insert(itemsPayload);
  if (insertItemsError) throw insertItemsError;

  return { ...normalizeToppingRecipeFromDb(savedRecipe), items: normalized.items };
};

export const deleteToppingRecipeFromSupabase = async (recipeId) => {
  if (!recipeId) return;
  const { error } = await supabase
    .from('topping_recipes')
    .delete()
    .eq('id', recipeId);
  if (error) throw error;
};

export const normalizeProductionToppings = (rows = []) => (
  rows
    .map(row => ({
      id: row.id || row.ingredient_master_id || `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ingredient_master_id: row.ingredient_master_id || '',
      name: String(row.name || '').trim(),
      quantity_per_unit: Math.max(0, toNumber(row.quantity_per_unit)),
      unit: row.unit || 'gr',
      cost_per_unit: Math.max(0, toNumber(row.cost_per_unit)),
    }))
    .filter(row => row.ingredient_master_id && row.name && row.quantity_per_unit > 0)
);

export const buildProductionToppings = (rows = [], masters = [], getCostPerUnit = () => 0) => normalizeProductionToppings(
  rows.map(row => {
    const master = masters.find(item => item.id === row.ingredient_master_id);
    if (!master) return null;
    return {
      id: row.id,
      ingredient_master_id: master.id,
      name: master.name,
      quantity_per_unit: row.quantity_per_unit,
      unit: row.unit || master.base_unit || master.unit || 'gr',
      cost_per_unit: getCostPerUnit(master, row.unit || master.base_unit || master.unit || 'gr', row.quantity_per_unit),
    };
  }).filter(Boolean)
);

export const getProductionToppingCostPerUnit = (rows = []) => (
  normalizeProductionToppings(rows).reduce((sum, row) => sum + row.cost_per_unit, 0)
);

export const getProductionToppingTotalCost = (rows = [], producedQty = 0) => (
  getProductionToppingCostPerUnit(rows) * Math.max(0, toNumber(producedQty))
);

export const loadProductionToppingMap = () => readJson(PRODUCTION_TOPPINGS_KEY, {});

export const getProductionToppings = (productionId) => {
  if (!productionId) return [];
  return normalizeProductionToppings(loadProductionToppingMap()[productionId] || []);
};

export const getProductionToppingsFromMap = (map, productionId) => {
  if (!productionId) return [];
  return normalizeProductionToppings(map?.[productionId] || []);
};

export const fetchProductionToppingMap = async () => {
  const { data, error } = await supabase
    .from('production_log_toppings')
    .select('production_log_id, ingredient_master_id, name, quantity_per_unit, unit, cost_per_unit')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).reduce((map, row) => {
    if (!map[row.production_log_id]) map[row.production_log_id] = [];
    map[row.production_log_id].push({
      ingredient_master_id: row.ingredient_master_id,
      name: row.name,
      quantity_per_unit: row.quantity_per_unit,
      unit: row.unit,
      cost_per_unit: row.cost_per_unit,
    });
    return map;
  }, {});
};

export const saveProductionToppings = (productionId, toppings) => {
  if (!productionId) return;
  const map = loadProductionToppingMap();
  const validToppings = normalizeProductionToppings(toppings);
  if (validToppings.length > 0) {
    map[productionId] = validToppings;
  } else {
    delete map[productionId];
  }
  writeJson(PRODUCTION_TOPPINGS_KEY, map);
};

export const saveProductionToppingsToSupabase = async (productionId, toppings) => {
  if (!productionId) return;
  const validToppings = normalizeProductionToppings(toppings);

  const { error: deleteError } = await supabase
    .from('production_log_toppings')
    .delete()
    .eq('production_log_id', productionId);
  if (deleteError) throw deleteError;

  if (validToppings.length === 0) return;
  const { error: insertError } = await supabase
    .from('production_log_toppings')
    .insert(validToppings.map(item => ({
      production_log_id: productionId,
      ingredient_master_id: item.ingredient_master_id,
      name: item.name,
      quantity_per_unit: item.quantity_per_unit,
      unit: item.unit,
      cost_per_unit: item.cost_per_unit,
    })));
  if (insertError) throw insertError;
};

export const deleteProductionToppings = (productionId) => {
  if (!productionId) return;
  const map = loadProductionToppingMap();
  delete map[productionId];
  writeJson(PRODUCTION_TOPPINGS_KEY, map);
};

export const deleteProductionToppingsFromSupabase = async (productionId) => {
  if (!productionId) return;
  const { error } = await supabase
    .from('production_log_toppings')
    .delete()
    .eq('production_log_id', productionId);
  if (error) throw error;
};

export const loadProductBaseHppMap = () => readJson(PRODUCT_BASE_HPP_KEY, {});

export const getProductBaseHpp = (product) => {
  const map = loadProductBaseHppMap();
  return map[product?.id] ?? Math.max(0, toNumber(product?.cost_price));
};

export const rememberProductBaseHpp = (product) => {
  if (!product?.id) return 0;
  const map = loadProductBaseHppMap();
  if (map[product.id] === undefined) {
    map[product.id] = Math.max(0, toNumber(product.cost_price));
    writeJson(PRODUCT_BASE_HPP_KEY, map);
  }
  return map[product.id];
};
