import { useState } from 'react';
import { getAllRecipes } from '../utils/recipes';

const TYPE_LABELS = {
  can: 'Can',
  wrap: 'Wrap / Shrink Film',
  case: 'Case / Cardboard',
  tray: 'Tray',
};

// Reusable picker for choosing which recipes (products) are running.
// `selectedIds` is an array of recipe ids; `onChange` receives the new array.
export default function RecipeSelector({ selectedIds = [], onChange, compact = false }) {
  const [recipes] = useState(getAllRecipes);
  const [search, setSearch] = useState('');

  function toggle(id) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(x => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  const filtered = recipes.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.flavor || '').toLowerCase().includes(q) ||
      (r.packageSize || '').toLowerCase().includes(q)
    );
  });

  if (recipes.length === 0) {
    return (
      <div className="empty-state">
        <p>No recipes have been added yet. Add product recipes in Recipe Management (Admin) first.</p>
      </div>
    );
  }

  return (
    <div className="recipe-selector">
      {!compact && (
        <input
          className="input"
          placeholder="Search products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: 8 }}
        />
      )}
      <div className="recipe-selector-list">
        {filtered.map(r => {
          const selected = selectedIds.includes(r.id);
          return (
            <button
              key={r.id}
              className={`recipe-select-item ${selected ? 'selected' : ''}`}
              onClick={() => toggle(r.id)}
            >
              <span className="recipe-select-check">{selected ? '✓' : ''}</span>
              <span className="recipe-select-info">
                <strong>{r.name}</strong>
                <span className="recipe-select-meta">
                  {TYPE_LABELS[r.type] || r.type}
                  {r.flavor ? ` · ${r.flavor}` : ''}
                  {r.packageSize ? ` · ${r.packageSize}` : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
