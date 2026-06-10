import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllRecipes, saveRecipe, deleteRecipe, createNewRecipe } from '../utils/recipes';
import BarcodeScanner from '../components/BarcodeScanner';

const TYPES = [
  { value: 'can', label: 'Can' },
  { value: 'wrap', label: 'Wrap / Shrink Film' },
  { value: 'case', label: 'Case / Cardboard' },
  { value: 'tray', label: 'Tray' },
];

export default function Admin() {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState(getAllRecipes);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('all');
  const [scanning, setScanning] = useState(false);
  const [scanBarcodeIdx, setScanBarcodeIdx] = useState(null);
  const editRef = useRef(null);

  function refresh() {
    setRecipes(getAllRecipes());
  }

  function startNew() {
    const recipe = createNewRecipe();
    setEditing(recipe);
    editRef.current = recipe;
  }

  function startEdit(recipe) {
    setEditing({ ...recipe, barcodes: [...recipe.barcodes] });
    editRef.current = { ...recipe, barcodes: [...recipe.barcodes] };
  }

  function updateField(field, value) {
    const updated = { ...editing, [field]: value };
    setEditing(updated);
    editRef.current = updated;
  }

  function updateBarcode(idx, value) {
    const barcodes = [...editing.barcodes];
    barcodes[idx] = value;
    const updated = { ...editing, barcodes };
    setEditing(updated);
    editRef.current = updated;
  }

  function addBarcode() {
    const updated = { ...editing, barcodes: [...editing.barcodes, ''] };
    setEditing(updated);
    editRef.current = updated;
  }

  function removeBarcode(idx) {
    if (editing.barcodes.length <= 1) return;
    const barcodes = editing.barcodes.filter((_, i) => i !== idx);
    const updated = { ...editing, barcodes };
    setEditing(updated);
    editRef.current = updated;
  }

  function save() {
    if (!editing.name.trim()) {
      alert('Recipe name is required');
      return;
    }
    if (!editing.barcodes.some(b => b.trim())) {
      alert('At least one barcode is required');
      return;
    }
    const cleaned = {
      ...editing,
      barcodes: editing.barcodes.filter(b => b.trim()),
    };
    saveRecipe(cleaned);
    setEditing(null);
    editRef.current = null;
    refresh();
  }

  function handleDelete(id) {
    if (!confirm('Delete this recipe?')) return;
    deleteRecipe(id);
    refresh();
  }

  function handleScan(code) {
    if (scanBarcodeIdx !== null && editRef.current) {
      updateBarcode(scanBarcodeIdx, code);
    }
    setScanning(false);
    setScanBarcodeIdx(null);
  }

  function startScanBarcode(idx) {
    setScanBarcodeIdx(idx);
    setScanning(true);
  }

  function handleExport() {
    const data = JSON.stringify(getAllRecipes(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'swire_recipes.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported)) throw new Error('Invalid format');
        imported.forEach(r => saveRecipe(r));
        refresh();
        alert(`Imported ${imported.length} recipe(s)`);
      } catch {
        alert('Invalid file format. Please use a JSON file exported from this system.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const filtered = filter === 'all' ? recipes : recipes.filter(r => r.type === filter);

  return (
    <div className="page admin-page">
      <div className="card">
        <div className="admin-header">
          <h2>Recipe Management</h2>
          <p className="card-desc">
            Preload product recipes here. When operators scan barcodes during inspections,
            the system will match against these recipes to verify the correct product.
          </p>
        </div>

        <div className="admin-toolbar">
          <button className="btn btn-primary" onClick={startNew}>+ Add Recipe</button>
          <button className="btn btn-outline btn-sm" onClick={handleExport}>Export All</button>
          <label className="btn btn-outline btn-sm">
            Import
            <input type="file" accept=".json" onChange={handleImport} hidden />
          </label>
        </div>

        <div className="filter-bar">
          <button className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('all')}>
            All ({recipes.length})
          </button>
          {TYPES.map(t => {
            const count = recipes.filter(r => r.type === t.value).length;
            return (
              <button
                key={t.value}
                className={`btn btn-sm ${filter === t.value ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setFilter(t.value)}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {editing && (
        <div className="card recipe-form">
          <h3>{editing.id && recipes.find(r => r.id === editing.id) ? 'Edit Recipe' : 'New Recipe'}</h3>

          <div className="form-group">
            <label className="field-label required">Recipe Name</label>
            <input
              className="input"
              placeholder="e.g. Coca-Cola Classic 12oz Can"
              value={editing.name}
              onChange={e => updateField('name', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="field-label required">Product Type</label>
            <div className="type-buttons">
              {TYPES.map(t => (
                <button
                  key={t.value}
                  className={`btn btn-condition ${editing.type === t.value ? 'selected' : ''}`}
                  onClick={() => updateField('type', t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="field-label">Flavor</label>
            <input
              className="input"
              placeholder="e.g. Coca-Cola, Dr Pepper, Sprite"
              value={editing.flavor}
              onChange={e => updateField('flavor', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="field-label">Package Size</label>
            <input
              className="input"
              placeholder="e.g. 12oz, 24-pack, 35-pack"
              value={editing.packageSize}
              onChange={e => updateField('packageSize', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="field-label required">Barcodes (UPC)</label>
            <p className="field-hint">Add all barcode variations for this product</p>
            {editing.barcodes.map((bc, idx) => (
              <div key={idx} className="barcode-row">
                <div className="input-with-scan">
                  <input
                    className="input"
                    placeholder="Scan or type barcode"
                    value={bc}
                    onChange={e => updateBarcode(idx, e.target.value)}
                  />
                  <button className="btn btn-scan" onClick={() => startScanBarcode(idx)}>
                    Scan
                  </button>
                </div>
                {editing.barcodes.length > 1 && (
                  <button className="btn btn-sm btn-danger" onClick={() => removeBarcode(idx)}>✕</button>
                )}
              </div>
            ))}
            <button className="btn btn-sm btn-outline" onClick={addBarcode}>+ Add Another Barcode</button>
          </div>

          <div className="form-group">
            <label className="field-label">Description / Notes</label>
            <textarea
              className="input textarea"
              placeholder="Optional notes about this recipe..."
              value={editing.description}
              onChange={e => updateField('description', e.target.value)}
            />
          </div>

          <div className="form-actions">
            <button className="btn btn-outline" onClick={() => { setEditing(null); editRef.current = null; }}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save Recipe</button>
          </div>
        </div>
      )}

      {filtered.length === 0 && !editing && (
        <div className="card">
          <div className="empty-state">
            <p>No recipes yet. Add your first product recipe to enable barcode matching during inspections.</p>
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="recipe-list">
          {filtered.map(recipe => (
            <div key={recipe.id} className="card recipe-card">
              <div className="recipe-card-header">
                <div>
                  <strong className="recipe-name">{recipe.name}</strong>
                  <span className={`badge badge-type badge-${recipe.type}`}>
                    {TYPES.find(t => t.value === recipe.type)?.label || recipe.type}
                  </span>
                </div>
              </div>
              <div className="recipe-details">
                {recipe.flavor && <span>Flavor: {recipe.flavor}</span>}
                {recipe.packageSize && <span>Size: {recipe.packageSize}</span>}
                <span>Barcodes: {recipe.barcodes.join(', ')}</span>
              </div>
              <div className="recipe-card-actions">
                <button className="btn btn-sm btn-outline" onClick={() => startEdit(recipe)}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(recipe.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="page-actions">
        <button className="btn btn-outline" onClick={() => navigate('/')}>
          ← Back to Home
        </button>
      </div>

      {scanning && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => { setScanning(false); setScanBarcodeIdx(null); }}
        />
      )}
    </div>
  );
}
