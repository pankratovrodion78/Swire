const RECIPES_KEY = 'swire_recipes';

export function getAllRecipes() {
  try {
    return JSON.parse(localStorage.getItem(RECIPES_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveRecipe(recipe) {
  const recipes = getAllRecipes();
  const idx = recipes.findIndex(r => r.id === recipe.id);
  if (idx >= 0) {
    recipes[idx] = recipe;
  } else {
    recipes.push(recipe);
  }
  localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes));
}

export function deleteRecipe(id) {
  const recipes = getAllRecipes().filter(r => r.id !== id);
  localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes));
}

export function findRecipeByBarcode(barcode) {
  if (!barcode || !barcode.trim()) return null;
  const cleaned = barcode.trim();
  return getAllRecipes().find(r =>
    r.barcodes.some(b => b === cleaned)
  ) || null;
}

export function findRecipeByBarcodeInList(barcode, recipeList) {
  if (!barcode || !barcode.trim() || !recipeList) return null;
  const cleaned = barcode.trim();
  return recipeList.find(r =>
    r.barcodes.some(b => b === cleaned)
  ) || null;
}

export function getRecipesByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const all = getAllRecipes();
  return ids.map(id => all.find(r => r.id === id)).filter(Boolean);
}

export function createNewRecipe() {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: '',
    type: 'can',
    flavor: '',
    packageSize: '',
    barcodes: [''],
    description: '',
    createdAt: new Date().toISOString(),
  };
}
