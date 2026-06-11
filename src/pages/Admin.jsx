import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllRecipes, saveRecipe, deleteRecipe, createNewRecipe } from '../utils/recipes';
import { loadModel, getEmbedding, cosineSimilarity, classifyFrame } from '../utils/vision';
import BarcodeScanner from '../components/BarcodeScanner';

const TYPES = [
  { value: 'can', label: 'Can' },
  { value: 'wrap', label: 'Wrap / Shrink Film' },
  { value: 'case', label: 'Case / Cardboard' },
  { value: 'tray', label: 'Tray' },
];

const MATCH_THRESHOLD = 0.62;
const SPIN_DURATION_MS = 9000;
const SPIN_INTERVAL_MS = 700;

export default function Admin() {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState(getAllRecipes);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('all');
  const [scanning, setScanning] = useState(false);
  const [scanBarcodeIdx, setScanBarcodeIdx] = useState(null);
  const editRef = useRef(null);

  // AI model state
  const [modelStatus, setModelStatus] = useState('idle'); // idle | loading | ready | error

  // Training state
  const [trainingRecipeId, setTrainingRecipeId] = useState(null);
  const [trainingEmbeddings, setTrainingEmbeddings] = useState([]);
  const [trainingWorking, setTrainingWorking] = useState(false);

  // Test match state
  const [testingMatch, setTestingMatch] = useState(false);
  const [matchWorking, setMatchWorking] = useState(false);
  const [matchResult, setMatchResult] = useState(null);

  // 360 verify state
  const [verifyRecipeId, setVerifyRecipeId] = useState(null);
  const [spinState, setSpinState] = useState('idle'); // idle | running | done
  const [spinProgress, setSpinProgress] = useState(0);
  const [spinResult, setSpinResult] = useState(null);
  const spinFramesRef = useRef([]);
  const busyRef = useRef(false);

  // Camera state (shared across training, testing, verify)
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);

  // Sync video element when camera turns on
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => stopCamera();
  }, []);

  async function ensureModel() {
    if (modelStatus === 'ready') return true;
    setModelStatus('loading');
    try {
      await loadModel();
      setModelStatus('ready');
      return true;
    } catch {
      setModelStatus('error');
      return false;
    }
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      alert('Camera not available. Please check permissions.');
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  }

  function closeAllModals() {
    setTrainingRecipeId(null);
    setTrainingEmbeddings([]);
    setTestingMatch(false);
    setMatchResult(null);
    setVerifyRecipeId(null);
    setSpinState('idle');
    setSpinResult(null);
    stopCamera();
  }

  // ---- Recipe CRUD ----

  function refresh() {
    setRecipes(getAllRecipes());
  }

  function startNew() {
    const recipe = createNewRecipe();
    recipe.embeddings = [];
    setEditing(recipe);
    editRef.current = recipe;
  }

  function startEdit(recipe) {
    const copy = { ...recipe, barcodes: [...recipe.barcodes], embeddings: recipe.embeddings ? [...recipe.embeddings] : [] };
    setEditing(copy);
    editRef.current = copy;
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
      embeddings: editing.embeddings || [],
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
        imported.forEach(r => {
          if (!r.embeddings) r.embeddings = [];
          saveRecipe(r);
        });
        refresh();
        alert(`Imported ${imported.length} recipe(s)`);
      } catch {
        alert('Invalid file format. Please use a JSON file exported from this system.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ---- Visual Training ----

  async function startTraining(recipeId) {
    const ok = await ensureModel();
    if (!ok) {
      alert('Failed to load AI model. Check your connection and try again.');
      return;
    }
    setTrainingRecipeId(recipeId);
    const recipe = recipes.find(r => r.id === recipeId);
    setTrainingEmbeddings(recipe?.embeddings ? [...recipe.embeddings] : []);
    await startCamera();
  }

  async function captureTrainingAngle() {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return;
    setTrainingWorking(true);
    try {
      const emb = await getEmbedding(v);
      setTrainingEmbeddings(prev => [...prev, emb]);
    } catch (err) {
      alert('Capture failed: ' + err.message);
    }
    setTrainingWorking(false);
  }

  function saveTraining() {
    if (trainingEmbeddings.length < 3) {
      alert('Capture at least 3 angles before saving.');
      return;
    }
    const recipe = recipes.find(r => r.id === trainingRecipeId);
    if (!recipe) return;
    const updated = { ...recipe, embeddings: trainingEmbeddings };
    saveRecipe(updated);
    refresh();
    closeAllModals();
  }

  function cancelTraining() {
    setTrainingRecipeId(null);
    setTrainingEmbeddings([]);
    stopCamera();
  }

  // ---- Test Match ----

  async function startTestMatch() {
    const ok = await ensureModel();
    if (!ok) {
      alert('Failed to load AI model. Check your connection and try again.');
      return;
    }
    setTestingMatch(true);
    setMatchResult(null);
    await startCamera();
  }

  async function identifyProduct() {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return;
    setMatchWorking(true);
    setMatchResult(null);
    try {
      // Average over 3 quick samples for stability
      const samples = [];
      for (let i = 0; i < 3; i++) {
        samples.push(await getEmbedding(v));
        if (i < 2) await new Promise(r => setTimeout(r, 250));
      }

      const trainedRecipes = recipes.filter(r => r.embeddings && r.embeddings.length > 0);
      if (trainedRecipes.length === 0) {
        alert('No recipes have been visually trained yet. Train at least one recipe first.');
        setMatchWorking(false);
        return;
      }

      // For each trained recipe, compute best cosine similarity across all its embeddings and all samples
      const scoreMap = {};
      for (const sample of samples) {
        for (const recipe of trainedRecipes) {
          let best = -1;
          for (const emb of recipe.embeddings) {
            const s = cosineSimilarity(sample, emb);
            if (s > best) best = s;
          }
          if (!scoreMap[recipe.id]) scoreMap[recipe.id] = { recipe, sum: 0, n: 0 };
          scoreMap[recipe.id].sum += best;
          scoreMap[recipe.id].n += 1;
        }
      }

      const ranked = Object.values(scoreMap)
        .map(({ recipe, sum, n }) => ({ recipe, score: sum / n }))
        .sort((a, b) => b.score - a.score);

      setMatchResult(ranked);
    } catch (err) {
      alert('Identify failed: ' + err.message);
    }
    setMatchWorking(false);
  }

  function closeTestMatch() {
    setTestingMatch(false);
    setMatchResult(null);
    stopCamera();
  }

  // ---- 360 Verify ----

  async function startVerify(recipeId) {
    const ok = await ensureModel();
    if (!ok) {
      alert('Failed to load AI model. Check your connection and try again.');
      return;
    }
    setVerifyRecipeId(recipeId);
    setSpinState('idle');
    setSpinResult(null);
    setSpinProgress(0);
    await startCamera();
  }

  async function runSpinCheck() {
    const recipe = recipes.find(r => r.id === verifyRecipeId);
    if (!recipe) return;

    const expected = recipe.type; // 'can', 'wrap', etc.
    setSpinState('running');
    setSpinResult(null);
    setSpinProgress(0);
    spinFramesRef.current = [];
    busyRef.current = false;

    const start = Date.now();
    const v = videoRef.current;

    await new Promise(resolve => {
      const timer = setInterval(async () => {
        const elapsed = Date.now() - start;
        setSpinProgress(Math.min(100, Math.round((elapsed / SPIN_DURATION_MS) * 100)));
        if (elapsed >= SPIN_DURATION_MS) {
          clearInterval(timer);
          resolve();
          return;
        }
        if (busyRef.current || !v || v.videoWidth === 0) return;
        busyRef.current = true;
        try {
          const result = await classifyFrame(v);
          spinFramesRef.current.push(result);
        } catch { /* skip */ }
        busyRef.current = false;
      }, SPIN_INTERVAL_MS);
    });

    const frames = spinFramesRef.current;
    const total = frames.length;
    // Map recipe types to vision types: 'can' stays 'can', 'wrap'/'case'/'tray' are not directly detectable
    // so we check for 'can' or 'bottle' based on the recipe type
    const visionType = expected === 'can' ? 'can' : expected === 'bottle' ? 'bottle' : expected;
    const hits = frames.filter(f => f.type === visionType).length;
    const other = frames.filter(f => f.type !== 'unknown' && f.type !== visionType).length;
    const pct = total ? Math.round((hits / total) * 100) : 0;
    const pass = total >= 5 && pct >= 60 && other / Math.max(total, 1) < 0.3;

    setSpinResult({ total, hits, other, pct, pass, expected });
    setSpinState('done');
  }

  function closeVerify() {
    setVerifyRecipeId(null);
    setSpinState('idle');
    setSpinResult(null);
    stopCamera();
  }

  // ---- Rendering ----

  const filtered = filter === 'all' ? recipes : recipes.filter(r => r.type === filter);
  const trainingRecipe = trainingRecipeId ? recipes.find(r => r.id === trainingRecipeId) : null;
  const verifyRecipe = verifyRecipeId ? recipes.find(r => r.id === verifyRecipeId) : null;
  const trainedRecipeCount = recipes.filter(r => r.embeddings && r.embeddings.length > 0).length;

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
          <button
            className="btn btn-outline btn-sm"
            onClick={async () => {
              const ok = await ensureModel();
              if (ok) alert('AI model loaded and ready.');
            }}
            disabled={modelStatus === 'loading'}
          >
            {modelStatus === 'loading' ? 'Loading AI...'
              : modelStatus === 'ready' ? 'AI Model Ready'
              : modelStatus === 'error' ? 'AI Load Failed (Retry)'
              : 'Load AI Model'}
          </button>
        </div>

        {modelStatus === 'loading' && (
          <div className="alert alert-info" style={{ marginTop: 8 }}>
            Loading AI model... this can take 10-30 seconds the first time.
          </div>
        )}
        {modelStatus === 'error' && (
          <div className="alert alert-warning" style={{ marginTop: 8 }}>
            Could not load the AI model. Check your internet connection and try again.
          </div>
        )}

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

        {trainedRecipeCount > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              className="btn btn-sm btn-outline"
              onClick={startTestMatch}
              disabled={testingMatch || trainingRecipeId || verifyRecipeId}
            >
              Test Match ({trainedRecipeCount} trained)
            </button>
          </div>
        )}
      </div>

      {/* ---- Test Match Modal ---- */}
      {testingMatch && (
        <div className="card">
          <h3>Product Match Test</h3>
          <p className="field-hint">
            Point the camera at a product and press "Identify" to find the best matching recipe
            from all visually trained recipes.
          </p>

          {cameraOn && (
            <div className="vision-camera" style={{ marginBottom: 12 }}>
              <video ref={videoRef} playsInline muted className="camera-video" />
            </div>
          )}

          <button
            className="btn btn-primary btn-full"
            onClick={identifyProduct}
            disabled={matchWorking || !cameraOn}
          >
            {matchWorking ? 'Analyzing...' : 'Identify This Product'}
          </button>

          {matchResult && matchResult.length > 0 && (
            <div className="vision-match-results" style={{ marginTop: 12 }}>
              {matchResult[0].score >= MATCH_THRESHOLD ? (
                <div className="match-result match-success">
                  MATCH: {matchResult[0].recipe.name} ({Math.round(matchResult[0].score * 100)}% similar)
                </div>
              ) : (
                <div className="match-result match-fail">
                  NO CONFIDENT MATCH -- closest is "{matchResult[0].recipe.name}" at {Math.round(matchResult[0].score * 100)}%.
                  This may be the wrong product or an untrained variant.
                </div>
              )}
              {matchResult.length > 1 && (
                <div className="vision-runner-up" style={{ marginTop: 4 }}>
                  Next closest: {matchResult[1].recipe.name} ({Math.round(matchResult[1].score * 100)}%)
                </div>
              )}
            </div>
          )}

          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-outline" onClick={closeTestMatch}>Close</button>
          </div>
        </div>
      )}

      {/* ---- Training Modal ---- */}
      {trainingRecipe && (
        <div className="card">
          <h3>Visual Training: {trainingRecipe.name}</h3>
          <div className="alert alert-info">
            Hold the product in view and capture it from different angles --
            front, back, both sides, top. More angles = better recognition.
            You need at least 3 angles.
          </div>

          {cameraOn && (
            <div className="vision-camera" style={{ marginBottom: 12 }}>
              <video ref={videoRef} playsInline muted className="camera-video" />
            </div>
          )}

          <div className="vision-angle-count" style={{ fontSize: '1.2em', fontWeight: 600, margin: '8px 0' }}>
            {trainingEmbeddings.length} angle(s) captured
          </div>

          <button
            className="btn btn-primary btn-full"
            onClick={captureTrainingAngle}
            disabled={trainingWorking || !cameraOn}
          >
            {trainingWorking ? 'Capturing...' : 'Capture This Angle'}
          </button>

          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-outline" onClick={cancelTraining}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={saveTraining}
              disabled={trainingEmbeddings.length < 3}
            >
              Save Training ({trainingEmbeddings.length}/3 min)
            </button>
          </div>
        </div>
      )}

      {/* ---- 360 Verify Modal ---- */}
      {verifyRecipe && (
        <div className="card">
          <h3>360 Verify: {verifyRecipe.name}</h3>
          <p className="field-hint">
            Press Start, then slowly rotate the product a full turn so the camera sees all sides.
            The AI samples frames and verifies the product matches the expected type ({verifyRecipe.type}).
          </p>

          {cameraOn && (
            <div className="vision-camera" style={{ marginBottom: 12 }}>
              <video ref={videoRef} playsInline muted className="camera-video" />
              {spinState === 'running' && (
                <div className="vision-spin-overlay">
                  <div className="vision-spin-text">SLOWLY ROTATE THE {verifyRecipe.type.toUpperCase()} 360</div>
                  <div className="vision-progress">
                    <div className="vision-progress-bar" style={{ width: `${spinProgress}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            className="btn btn-primary btn-full"
            onClick={runSpinCheck}
            disabled={spinState === 'running' || !cameraOn}
          >
            {spinState === 'running' ? `Scanning... ${spinProgress}%` : 'Start 360 Check'}
          </button>

          {spinResult && (
            <div className={`vision-spin-result ${spinResult.pass ? 'match-success' : 'match-fail'}`} style={{ marginTop: 12 }}>
              {spinResult.pass
                ? `VERIFIED -- ${spinResult.expected.toUpperCase()} confirmed on ${spinResult.pct}% of ${spinResult.total} frames`
                : `NOT VERIFIED -- only ${spinResult.pct}% of ${spinResult.total} frames looked like a ${spinResult.expected}.`}
              {!spinResult.pass && spinResult.other > 0 && (
                <div className="vision-spin-warning">A different object type was detected. Check you are scanning the right product.</div>
              )}
            </div>
          )}

          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-outline" onClick={closeVerify}>Close</button>
          </div>
        </div>
      )}

      {/* ---- Recipe Edit Form ---- */}
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
                  <button className="btn btn-sm btn-danger" onClick={() => removeBarcode(idx)}>X</button>
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

          {editing.embeddings && editing.embeddings.length > 0 && (
            <div className="form-group">
              <label className="field-label">Visual Training</label>
              <p className="field-hint">
                This recipe has {editing.embeddings.length} trained angle(s).
                To retrain, use the "Train Visual" button on the recipe card after saving.
              </p>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => updateField('embeddings', [])}
                style={{ marginTop: 4 }}
              >
                Clear Visual Training Data
              </button>
            </div>
          )}

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
          {filtered.map(recipe => {
            const angleCount = recipe.embeddings ? recipe.embeddings.length : 0;
            const isTrained = angleCount > 0;
            const isActiveModal = trainingRecipeId || testingMatch || verifyRecipeId;

            return (
              <div key={recipe.id} className="card recipe-card">
                <div className="recipe-card-header">
                  <div>
                    <strong className="recipe-name">{recipe.name}</strong>
                    <span className={`badge badge-type badge-${recipe.type}`}>
                      {TYPES.find(t => t.value === recipe.type)?.label || recipe.type}
                    </span>
                    {isTrained ? (
                      <span className="badge badge-type" style={{ background: '#16a34a', color: '#fff', marginLeft: 4 }}>
                        Visual: {angleCount} angles
                      </span>
                    ) : (
                      <span className="badge badge-type" style={{ background: '#94a3b8', color: '#fff', marginLeft: 4 }}>
                        Not trained
                      </span>
                    )}
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
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => startTraining(recipe.id)}
                    disabled={!!isActiveModal}
                    style={{ borderColor: '#8b5cf6', color: '#8b5cf6' }}
                  >
                    Train Visual
                  </button>
                  {isTrained && (
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={startTestMatch}
                      disabled={!!isActiveModal}
                      style={{ borderColor: '#0ea5e9', color: '#0ea5e9' }}
                    >
                      Test Match
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => startVerify(recipe.id)}
                    disabled={!!isActiveModal}
                    style={{ borderColor: '#f59e0b', color: '#f59e0b' }}
                  >
                    360 Verify
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="page-actions">
        <button className="btn btn-outline" onClick={() => navigate('/')}>
          &larr; Back to Home
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
