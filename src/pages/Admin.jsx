import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllRecipes, saveRecipe, deleteRecipe } from '../utils/recipes';
import { loadModel, getEmbedding, cosineSimilarity, classifyFrame, cropToGuide } from '../utils/vision';
import RecipeWizard from '../components/RecipeWizard';
import DateCodeReader from '../components/DateCodeReader';

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
  const [filter, setFilter] = useState('all');

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);

  // AI model state
  const [modelStatus, setModelStatus] = useState('idle');

  // Test match state
  const [testingMatch, setTestingMatch] = useState(false);
  const [matchWorking, setMatchWorking] = useState(false);
  const [matchResult, setMatchResult] = useState(null);

  // 360 verify state
  const [verifyRecipeId, setVerifyRecipeId] = useState(null);
  const [spinState, setSpinState] = useState('idle');
  const [spinProgress, setSpinProgress] = useState(0);
  const [spinResult, setSpinResult] = useState(null);
  const spinFramesRef = useRef([]);
  const busyRef = useRef(false);

  // Date code test state
  const [dateCodeTest, setDateCodeTest] = useState(false);
  const [dateCodeResult, setDateCodeResult] = useState(null);

  // Camera (for test match & 360 verify)
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

  useEffect(() => { return () => stopCamera(); }, []);

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
      alert('Camera not available.');
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  }

  function refresh() { setRecipes(getAllRecipes()); }

  // ── Wizard handlers ─────────────────────────────────────────

  function startNew() {
    setEditingRecipe(null);
    setWizardOpen(true);
  }

  function startEdit(recipe) {
    setEditingRecipe(recipe);
    setWizardOpen(true);
  }

  function handleWizardSave(recipeData) {
    saveRecipe(recipeData);
    setWizardOpen(false);
    setEditingRecipe(null);
    refresh();
  }

  function handleDelete(id) {
    if (!confirm('Delete this recipe?')) return;
    deleteRecipe(id);
    refresh();
  }

  // ── Import / Export ─────────────────────────────────────────

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
        alert('Invalid file format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ── Test Match ──────────────────────────────────────────────

  async function startTestMatch() {
    const ok = await ensureModel();
    if (!ok) return;
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
      const samples = [];
      for (let i = 0; i < 3; i++) {
        const cropped = cropToGuide(v);
        samples.push(await getEmbedding(cropped));
        if (i < 2) await new Promise(r => setTimeout(r, 250));
      }
      const trainedRecipes = recipes.filter(r => r.embeddings && r.embeddings.length > 0);
      if (trainedRecipes.length === 0) {
        alert('No recipes have been visually trained yet.');
        setMatchWorking(false);
        return;
      }
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

  // ── 360 Verify ──────────────────────────────────────────────

  async function startVerify(recipeId) {
    const ok = await ensureModel();
    if (!ok) return;
    setVerifyRecipeId(recipeId);
    setSpinState('idle');
    setSpinResult(null);
    setSpinProgress(0);
    await startCamera();
  }

  async function runSpinCheck() {
    const recipe = recipes.find(r => r.id === verifyRecipeId);
    if (!recipe) return;
    const expected = recipe.type;
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
        if (elapsed >= SPIN_DURATION_MS) { clearInterval(timer); resolve(); return; }
        if (busyRef.current || !v || v.videoWidth === 0) return;
        busyRef.current = true;
        try { const result = await classifyFrame(v); spinFramesRef.current.push(result); } catch {}
        busyRef.current = false;
      }, SPIN_INTERVAL_MS);
    });

    const frames = spinFramesRef.current;
    const total = frames.length;
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

  // ── Render ──────────────────────────────────────────────────

  const filtered = filter === 'all' ? recipes : recipes.filter(r => r.type === filter);
  const verifyRecipe = verifyRecipeId ? recipes.find(r => r.id === verifyRecipeId) : null;
  const trainedRecipeCount = recipes.filter(r => r.embeddings && r.embeddings.length > 0).length;
  const isActiveModal = testingMatch || verifyRecipeId || dateCodeTest;

  return (
    <div className="page admin-page">
      <div className="card">
        <div className="admin-header">
          <h2>Recipe Management</h2>
          <p className="card-desc">
            Add product recipes with barcodes and visual recognition data.
            Operators will verify against these during inspections.
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
              <button key={t.value} className={`btn btn-sm ${filter === t.value ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(t.value)}>
                {t.label} ({count})
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {trainedRecipeCount > 0 && (
            <button className="btn btn-sm btn-outline" onClick={startTestMatch} disabled={!!isActiveModal}>
              Test Match ({trainedRecipeCount} trained)
            </button>
          )}
          <button className="btn btn-sm btn-outline" onClick={() => setDateCodeTest(true)} disabled={!!isActiveModal}
            style={{ borderColor: '#7c3aed', color: '#7c3aed' }}>
            Test Date Code Reader
          </button>
        </div>
      </div>

      {/* Date Code Test */}
      {dateCodeTest && (
        <DateCodeReader
          mode="standalone"
          onResult={(result) => {
            setDateCodeResult(result);
            setDateCodeTest(false);
          }}
          onCancel={() => { setDateCodeTest(false); setDateCodeResult(null); }}
        />
      )}

      {dateCodeResult && !dateCodeTest && (
        <div className="card">
          <h3>Date Code Result</h3>
          <div className="date-code-result date-code-result-good" style={{ marginBottom: 12 }}>
            <span className="date-code-parsed">{dateCodeResult.summary}</span>
          </div>
          <div className="date-code-fields">
            <div className="date-code-field">
              <span className="detail-label">Month</span>
              <span className="detail-value">{dateCodeResult.month || '—'}</span>
            </div>
            <div className="date-code-field">
              <span className="detail-label">Exp Day</span>
              <span className="detail-value">{dateCodeResult.expDay || '—'}</span>
            </div>
            <div className="date-code-field">
              <span className="detail-label">Exp Year</span>
              <span className="detail-value">{dateCodeResult.expYear ? '20' + dateCodeResult.expYear : '—'}</span>
            </div>
            <div className="date-code-field">
              <span className="detail-label">Prod Day</span>
              <span className="detail-value">{dateCodeResult.prodDay ? `${dateCodeResult.prodDay} — ${dateCodeResult.prodDayName}` : '—'}</span>
            </div>
            <div className="date-code-field">
              <span className="detail-label">Time</span>
              <span className="detail-value">{dateCodeResult.time || '—'}</span>
            </div>
            <div className="date-code-field">
              <span className="detail-label">Line</span>
              <span className="detail-value">{dateCodeResult.line || '—'}</span>
            </div>
          </div>
          {dateCodeResult.photo && (
            <div style={{ marginTop: 10 }}>
              <img src={dateCodeResult.photo} alt="Date code" style={{ width: '100%', maxWidth: 200, borderRadius: 8 }} />
            </div>
          )}
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-outline btn-sm" onClick={() => setDateCodeResult(null)}>Dismiss</button>
            <button className="btn btn-outline btn-sm" onClick={() => { setDateCodeResult(null); setDateCodeTest(true); }}
              style={{ borderColor: '#7c3aed', color: '#7c3aed' }}>Test Again</button>
          </div>
        </div>
      )}

      {/* Test Match */}
      {testingMatch && (
        <div className="card">
          <h3>Product Match Test</h3>
          <p className="field-hint">Line up the product inside the can guide and press Identify.</p>
          {cameraOn && (
            <div className="vision-camera" style={{ marginBottom: 12 }}>
              <video ref={videoRef} playsInline muted className="camera-video" />
              <div className="can-guide-overlay">
                <svg className="can-guide-svg" viewBox="0 0 200 300" preserveAspectRatio="xMidYMid meet">
                  <ellipse cx="100" cy="30" rx="55" ry="18" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeDasharray="6,4" />
                  <line x1="45" y1="30" x2="45" y2="270" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeDasharray="6,4" />
                  <line x1="155" y1="30" x2="155" y2="270" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeDasharray="6,4" />
                  <ellipse cx="100" cy="270" rx="55" ry="18" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeDasharray="6,4" />
                </svg>
                <div className="can-guide-label">ALIGN PRODUCT</div>
              </div>
            </div>
          )}
          <button className="btn btn-primary btn-full" onClick={identifyProduct} disabled={matchWorking || !cameraOn}>
            {matchWorking ? 'Analyzing...' : 'Identify This Product'}
          </button>
          {matchResult && matchResult.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {matchResult[0].score >= MATCH_THRESHOLD ? (
                <div className="match-result match-success">
                  MATCH: {matchResult[0].recipe.name} ({Math.round(matchResult[0].score * 100)}%)
                </div>
              ) : (
                <div className="match-result match-fail">
                  NO CONFIDENT MATCH — closest: "{matchResult[0].recipe.name}" at {Math.round(matchResult[0].score * 100)}%
                </div>
              )}
              {matchResult.length > 1 && (
                <div className="vision-runner-up" style={{ marginTop: 4 }}>
                  Next: {matchResult[1].recipe.name} ({Math.round(matchResult[1].score * 100)}%)
                </div>
              )}
            </div>
          )}
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-outline" onClick={closeTestMatch}>Close</button>
          </div>
        </div>
      )}

      {/* 360 Verify */}
      {verifyRecipe && (
        <div className="card">
          <h3>360° Verify: {verifyRecipe.name}</h3>
          {cameraOn && (
            <div className="vision-camera" style={{ marginBottom: 12 }}>
              <video ref={videoRef} playsInline muted className="camera-video" />
              <div className="can-guide-overlay">
                <svg className="can-guide-svg" viewBox="0 0 200 300" preserveAspectRatio="xMidYMid meet">
                  <ellipse cx="100" cy="30" rx="55" ry="18" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeDasharray="6,4" />
                  <line x1="45" y1="30" x2="45" y2="270" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeDasharray="6,4" />
                  <line x1="155" y1="30" x2="155" y2="270" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeDasharray="6,4" />
                  <ellipse cx="100" cy="270" rx="55" ry="18" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeDasharray="6,4" />
                </svg>
                <div className="can-guide-label">ROTATE INSIDE GUIDE</div>
              </div>
              {spinState === 'running' && (
                <div className="vision-spin-overlay">
                  <div className="vision-spin-text">SLOWLY ROTATE THE {verifyRecipe.type.toUpperCase()} 360°</div>
                  <div className="vision-progress"><div className="vision-progress-bar" style={{ width: `${spinProgress}%` }} /></div>
                </div>
              )}
            </div>
          )}
          <button className="btn btn-primary btn-full" onClick={runSpinCheck} disabled={spinState === 'running' || !cameraOn}>
            {spinState === 'running' ? `Scanning... ${spinProgress}%` : 'Start 360° Check'}
          </button>
          {spinResult && (
            <div className={`vision-spin-result ${spinResult.pass ? 'match-success' : 'match-fail'}`} style={{ marginTop: 12 }}>
              {spinResult.pass
                ? `VERIFIED — ${spinResult.expected.toUpperCase()} confirmed on ${spinResult.pct}% of ${spinResult.total} frames`
                : `NOT VERIFIED — only ${spinResult.pct}% of ${spinResult.total} frames looked like a ${spinResult.expected}.`}
            </div>
          )}
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-outline" onClick={closeVerify}>Close</button>
          </div>
        </div>
      )}

      {/* Recipe Cards */}
      {filtered.length === 0 && !wizardOpen && (
        <div className="card">
          <div className="empty-state">
            <p>No recipes yet. Tap "+ Add Recipe" to get started.</p>
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="recipe-list">
          {filtered.map(recipe => {
            const angleCount = (recipe.embeddings?.length || 0);
            const pkgAngleCount = (recipe.pkgEmbeddings?.length || 0);
            const isTrained = angleCount > 0;

            return (
              <div key={recipe.id} className="card recipe-card">
                <div className="recipe-card-header">
                  {recipe.image && (
                    <img src={recipe.image} alt={recipe.name} className="recipe-card-image" />
                  )}
                  <div className="recipe-card-header-info">
                    <strong className="recipe-name">{recipe.name}</strong>
                    <div className="recipe-badges">
                      <span className={`badge badge-type badge-${recipe.type}`}>
                        {TYPES.find(t => t.value === recipe.type)?.label || recipe.type}
                      </span>
                      {isTrained ? (
                        <span className="badge badge-trained">Can: {angleCount} angles</span>
                      ) : (
                        <span className="badge badge-untrained">Not trained</span>
                      )}
                      {pkgAngleCount > 0 && (
                        <span className="badge badge-trained">Pkg: {pkgAngleCount} angles</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="recipe-details">
                  {recipe.flavor && <span>Flavor: {recipe.flavor}</span>}
                  {recipe.packageSize && <span>Size: {recipe.packageSize}</span>}
                  {recipe.barcodes?.length > 0 && <span>Barcodes: {recipe.barcodes.join(', ')}</span>}
                </div>
                <div className="recipe-card-actions">
                  <button className="btn btn-sm btn-outline" onClick={() => startEdit(recipe)}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(recipe.id)}>Delete</button>
                  {isTrained && (
                    <button className="btn btn-sm btn-outline" onClick={startTestMatch} disabled={!!isActiveModal}
                      style={{ borderColor: '#0ea5e9', color: '#0ea5e9' }}>Test Match</button>
                  )}
                  <button className="btn btn-sm btn-outline" onClick={() => startVerify(recipe.id)} disabled={!!isActiveModal}
                    style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>360° Verify</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="page-actions">
        <button className="btn btn-outline" onClick={() => navigate('/')}>← Back to Home</button>
      </div>

      {wizardOpen && (
        <RecipeWizard
          existingRecipe={editingRecipe}
          onSave={handleWizardSave}
          onCancel={() => { setWizardOpen(false); setEditingRecipe(null); }}
        />
      )}
    </div>
  );
}
