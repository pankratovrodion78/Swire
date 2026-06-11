import { useState, useRef, useEffect, useCallback } from 'react';
import { loadModel, getEmbedding } from '../utils/vision';
import BarcodeScanner from './BarcodeScanner';

const DEFAULT_TYPE = 'can';

const TOTAL_STEPS = 7;
const MIN_ANGLES = 5;

const GUIDED_POSITIONS = [
  { label: 'FRONT LABEL', hint: 'Show the front label inside the guide' },
  { label: 'NUTRITION PANEL', hint: 'Rotate to show nutrition facts' },
  { label: 'SIZE / OZ LABEL', hint: 'Show the FL OZ / volume text' },
  { label: 'BACK SIDE', hint: 'Rotate to show the back of the can' },
  { label: 'TOP OF CAN', hint: 'Show the top/lid of the can' },
];

function makeThumbnail(video, maxW = 300) {
  const canvas = document.createElement('canvas');
  const scale = maxW / video.videoWidth;
  canvas.width = maxW;
  canvas.height = video.videoHeight * scale;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.7);
}

function cropToGuide(video) {
  const canvas = document.createElement('canvas');
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const guideW = Math.round(vw * 0.55);
  const guideH = Math.round(vh * 0.75);
  const sx = Math.round((vw - guideW) / 2);
  const sy = Math.round((vh - guideH) / 2);
  canvas.width = guideW;
  canvas.height = guideH;
  canvas.getContext('2d').drawImage(video, sx, sy, guideW, guideH, 0, 0, guideW, guideH);
  return canvas;
}

export default function RecipeWizard({ existingRecipe, onSave, onCancel }) {
  const isEdit = !!existingRecipe;

  const [step, setStep] = useState(0);

  // Step 0 — Basic info
  const [name, setName] = useState(existingRecipe?.name || '');
  const [type] = useState(existingRecipe?.type || DEFAULT_TYPE);
  const [flavor, setFlavor] = useState(existingRecipe?.flavor || '');
  const [packageSize, setPackageSize] = useState(existingRecipe?.packageSize || '');
  const [description, setDescription] = useState(existingRecipe?.description || '');

  // Step 1 — Can barcode
  const [canBarcodes, setCanBarcodes] = useState(
    existingRecipe?.barcodes?.length ? [...existingRecipe.barcodes] : []
  );
  const [scanningCan, setScanningCan] = useState(false);

  // Step 2 — Can visual scan
  const [canEmbeddings, setCanEmbeddings] = useState(existingRecipe?.embeddings || []);
  const [canPhotos, setCanPhotos] = useState([]);
  const [canImage, setCanImage] = useState(existingRecipe?.image || null);
  const [working, setWorking] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);

  // Step 3 — Package barcode
  const [pkgBarcodes, setPkgBarcodes] = useState(
    existingRecipe?.pkgBarcodes?.length ? [...existingRecipe.pkgBarcodes] : []
  );
  const [scanningPkg, setScanningPkg] = useState(false);

  // Step 4 — Package visual scan
  const [pkgEmbeddings, setPkgEmbeddings] = useState(existingRecipe?.pkgEmbeddings || []);
  const [pkgPhotos, setPkgPhotos] = useState([]);
  const [pkgWorking, setPkgWorking] = useState(false);

  // Camera
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

  useEffect(() => {
    return () => stopCamera();
  }, [step]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      alert('Camera not available. Check permissions.');
    }
  }

  async function ensureModel() {
    if (modelReady) return true;
    setModelLoading(true);
    try {
      await loadModel();
      setModelReady(true);
      setModelLoading(false);
      return true;
    } catch {
      setModelLoading(false);
      alert('Failed to load AI model. Check your connection.');
      return false;
    }
  }

  // Can visual capture — crops to guide area for better size differentiation
  async function captureCanAngle() {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return;
    setWorking(true);
    try {
      const cropped = cropToGuide(v);
      const emb = await getEmbedding(cropped);
      setCanEmbeddings(prev => [...prev, emb]);
      const thumb = makeThumbnail(v);
      setCanPhotos(prev => [...prev, thumb]);
      if (!canImage) setCanImage(thumb);
    } catch (err) {
      alert('Capture failed: ' + err.message);
    }
    setWorking(false);
  }

  // Package visual capture
  async function capturePkgAngle() {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return;
    setPkgWorking(true);
    try {
      const emb = await getEmbedding(v);
      setPkgEmbeddings(prev => [...prev, emb]);
      const thumb = makeThumbnail(v);
      setPkgPhotos(prev => [...prev, thumb]);
    } catch (err) {
      alert('Capture failed: ' + err.message);
    }
    setPkgWorking(false);
  }

  function goNext() { if (step < TOTAL_STEPS - 1) setStep(step + 1); }
  function goBack() { if (step > 0) setStep(step - 1); }

  function handleSave() {
    if (!name.trim()) { alert('Recipe name is required'); return; }
    const allBarcodes = [...new Set([...canBarcodes, ...pkgBarcodes].filter(b => b.trim()))];
    onSave({
      id: existingRecipe?.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      name: name.trim(),
      type,
      flavor: flavor.trim(),
      packageSize: packageSize.trim(),
      barcodes: allBarcodes,
      canBarcodes: canBarcodes.filter(b => b.trim()),
      pkgBarcodes: pkgBarcodes.filter(b => b.trim()),
      embeddings: canEmbeddings,
      pkgEmbeddings,
      image: canImage,
      description: description.trim(),
      createdAt: existingRecipe?.createdAt || new Date().toISOString(),
    });
  }

  // ── Step renderers ──────────────────────────────────────────

  function renderBasicInfo() {
    return (
      <div className="wizard-step-content">
        <p className="wizard-instruction">What product is this?</p>
        <div className="form-group">
          <label className="field-label required">Recipe Name</label>
          <input className="input" placeholder="e.g. Coca-Cola Classic 12oz" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="field-label">Flavor</label>
          <input className="input" placeholder="e.g. Coca-Cola, Dr Pepper, Sprite" value={flavor} onChange={e => setFlavor(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="field-label">Package Size</label>
          <input className="input" placeholder="e.g. 12oz, 24-pack" value={packageSize} onChange={e => setPackageSize(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-lg wizard-next-btn" disabled={!name.trim()} onClick={goNext}>Next</button>
      </div>
    );
  }

  function renderCanBarcode() {
    return (
      <div className="wizard-step-content">
        <p className="wizard-instruction">Scan the barcode on the can</p>
        {canBarcodes.length > 0 && (
          <div className="wizard-result">
            {canBarcodes.map((bc, i) => (
              <div key={i} className="wizard-barcode-item">
                <span className="code-cell">{bc}</span>
                <button className="btn btn-sm btn-danger" onClick={() => setCanBarcodes(prev => prev.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
        )}
        {!scanningCan ? (
          <div className="wizard-choice-buttons">
            <button className="btn btn-primary btn-lg" onClick={() => setScanningCan(true)}>
              {canBarcodes.length > 0 ? 'Scan Another' : 'Scan Barcode'}
            </button>
          </div>
        ) : (
          <BarcodeScanner
            onScan={(code) => { setCanBarcodes(prev => [...prev, code]); setScanningCan(false); }}
            onClose={() => setScanningCan(false)}
          />
        )}
        <div className="wizard-nav-row">
          <button className="btn btn-primary btn-lg wizard-next-btn" disabled={canBarcodes.length === 0} onClick={goNext}>Next</button>
          <button className="btn btn-outline btn-sm wizard-skip-btn" onClick={goNext}>Skip</button>
        </div>
      </div>
    );
  }

  function renderCanVisual() {
    const currentPos = GUIDED_POSITIONS[canEmbeddings.length] || null;
    const allDone = canEmbeddings.length >= MIN_ANGLES;

    return (
      <div className="wizard-step-content">
        <p className="wizard-instruction">Visual scan of the can</p>
        {!allDone && currentPos ? (
          <p className="wizard-sub-instruction">
            Step {canEmbeddings.length + 1} of {MIN_ANGLES}: <strong>{currentPos.label}</strong> — {currentPos.hint}
          </p>
        ) : (
          <p className="wizard-sub-instruction">
            All {MIN_ANGLES} angles captured! You can capture more or continue.
          </p>
        )}

        {modelLoading && <div className="alert alert-info">Loading AI model...</div>}

        {cameraOn ? (
          <div className="wizard-camera-container">
            <video ref={videoRef} playsInline muted className="wizard-camera-video" />
            <div className="can-guide-overlay">
              <svg className="can-guide-svg" viewBox="0 0 200 300" preserveAspectRatio="xMidYMid meet">
                <ellipse cx="100" cy="30" rx="55" ry="18" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeDasharray="6,4" />
                <line x1="45" y1="30" x2="45" y2="270" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeDasharray="6,4" />
                <line x1="155" y1="30" x2="155" y2="270" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeDasharray="6,4" />
                <ellipse cx="100" cy="270" rx="55" ry="18" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeDasharray="6,4" />
              </svg>
              <div className="can-guide-label">
                {!allDone && currentPos ? currentPos.label : 'EXTRA ANGLE'}
              </div>
            </div>
            <div className="wizard-camera-controls">
              <button className="btn btn-primary btn-capture" onClick={captureCanAngle} disabled={working}>
                {working ? 'Capturing...' : `Capture ${!allDone && currentPos ? currentPos.label : 'Angle'}`}
              </button>
              <button className="btn btn-outline btn-sm" onClick={stopCamera}>Stop Camera</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary btn-lg" onClick={async () => { await ensureModel(); await startCamera(); }}>
            Open Camera
          </button>
        )}

        <div className="wizard-sub-instruction" style={{ fontWeight: 700 }}>
          {canEmbeddings.length} / {MIN_ANGLES} angles captured
        </div>

        {canPhotos.length > 0 && (
          <div className="wizard-thumbnails">
            {canPhotos.map((p, i) => (
              <div key={i} className={`wizard-thumb-wrap ${canImage === p ? 'wizard-thumb-selected' : ''}`}>
                <img src={p} alt={`Angle ${i + 1}`} className="wizard-thumbnail" onClick={() => setCanImage(p)} />
                <span className="wizard-thumb-angle-label">{GUIDED_POSITIONS[i]?.label || `Extra ${i + 1}`}</span>
                {canImage === p && <span className="wizard-thumb-label">Recipe Image</span>}
              </div>
            ))}
          </div>
        )}

        <div className="wizard-nav-row">
          <button className="btn btn-primary btn-lg wizard-next-btn" disabled={canEmbeddings.length < MIN_ANGLES} onClick={goNext}>
            Next ({canEmbeddings.length}/{MIN_ANGLES} min)
          </button>
          <button className="btn btn-outline btn-sm wizard-skip-btn" onClick={goNext}>Skip</button>
        </div>
      </div>
    );
  }

  function renderPkgBarcode() {
    return (
      <div className="wizard-step-content">
        <p className="wizard-instruction">Scan the barcode on the package</p>
        <p className="wizard-sub-instruction">Case, cardboard, wrap, or tray barcode</p>
        {pkgBarcodes.length > 0 && (
          <div className="wizard-result">
            {pkgBarcodes.map((bc, i) => (
              <div key={i} className="wizard-barcode-item">
                <span className="code-cell">{bc}</span>
                <button className="btn btn-sm btn-danger" onClick={() => setPkgBarcodes(prev => prev.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
        )}
        {!scanningPkg ? (
          <div className="wizard-choice-buttons">
            <button className="btn btn-primary btn-lg" onClick={() => setScanningPkg(true)}>
              {pkgBarcodes.length > 0 ? 'Scan Another' : 'Scan Barcode'}
            </button>
          </div>
        ) : (
          <BarcodeScanner
            onScan={(code) => { setPkgBarcodes(prev => [...prev, code]); setScanningPkg(false); }}
            onClose={() => setScanningPkg(false)}
          />
        )}
        <div className="wizard-nav-row">
          <button className="btn btn-primary btn-lg wizard-next-btn" disabled={pkgBarcodes.length === 0} onClick={goNext}>Next</button>
          <button className="btn btn-outline btn-sm wizard-skip-btn" onClick={goNext}>Skip</button>
        </div>
      </div>
    );
  }

  function renderPkgVisual() {
    return (
      <div className="wizard-step-content">
        <p className="wizard-instruction">Visual scan of the package</p>
        <p className="wizard-sub-instruction">
          Capture the case/cardboard from a few angles for visual reference.
        </p>

        {cameraOn ? (
          <div className="wizard-camera-container">
            <video ref={videoRef} playsInline muted className="wizard-camera-video" />
            <div className="wizard-camera-controls">
              <button className="btn btn-primary btn-capture" onClick={capturePkgAngle} disabled={pkgWorking}>
                {pkgWorking ? 'Capturing...' : 'Capture Angle'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={stopCamera}>Stop Camera</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary btn-lg" onClick={async () => { await ensureModel(); await startCamera(); }}>
            Open Camera
          </button>
        )}

        <div className="wizard-sub-instruction" style={{ fontWeight: 700 }}>
          {pkgEmbeddings.length} angles captured
        </div>

        {pkgPhotos.length > 0 && (
          <div className="wizard-thumbnails">
            {pkgPhotos.map((p, i) => (
              <img key={i} src={p} alt={`Pkg ${i + 1}`} className="wizard-thumbnail" />
            ))}
          </div>
        )}

        <div className="wizard-nav-row">
          <button className="btn btn-primary btn-lg wizard-next-btn" onClick={goNext}>Next</button>
          <button className="btn btn-outline btn-sm wizard-skip-btn" onClick={goNext}>Skip</button>
        </div>
      </div>
    );
  }

  function renderDescription() {
    return (
      <div className="wizard-step-content">
        <p className="wizard-instruction">Any notes about this recipe? (Optional)</p>
        <textarea
          className="input textarea"
          placeholder="e.g. Promotional holiday can, limited run..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
        />
        <button className="btn btn-primary btn-lg wizard-next-btn" onClick={goNext}>Next</button>
      </div>
    );
  }

  function renderReview() {
    return (
      <div className="wizard-step-content">
        <p className="wizard-instruction">Review & Save</p>
        <div className="wizard-review-card">
          {canImage && <img src={canImage} alt={name} className="wizard-review-image" />}
          <div className="wizard-review-details">
            <h3>{name}</h3>
            <span className="badge badge-type badge-can">Can / Wrap</span>
            {flavor && <p>Flavor: {flavor}</p>}
            {packageSize && <p>Size: {packageSize}</p>}
            {canBarcodes.length > 0 && <p>Can barcodes: {canBarcodes.join(', ')}</p>}
            {pkgBarcodes.length > 0 && <p>Pkg barcodes: {pkgBarcodes.join(', ')}</p>}
            <p>Can visual: {canEmbeddings.length} angles</p>
            <p>Pkg visual: {pkgEmbeddings.length} angles</p>
            {description && <p>Notes: {description}</p>}
          </div>
        </div>
        <button className="btn btn-primary btn-lg wizard-complete-btn" onClick={handleSave}>
          {isEdit ? 'Update Recipe' : 'Save Recipe'}
        </button>
      </div>
    );
  }

  const stepTitles = [
    'PRODUCT INFO',
    'CAN BARCODE',
    'CAN VISUAL SCAN',
    'PACKAGE BARCODE',
    'PACKAGE VISUAL SCAN',
    'NOTES',
    'REVIEW & SAVE',
  ];

  const renderFns = [
    renderBasicInfo,
    renderCanBarcode,
    renderCanVisual,
    renderPkgBarcode,
    renderPkgVisual,
    renderDescription,
    renderReview,
  ];

  return (
    <div className="wizard-overlay">
      <div className="wizard-header">
        <div className="wizard-header-top">
          <button className="btn btn-sm btn-outline wizard-cancel-btn" onClick={onCancel}>Cancel</button>
          <span className="wizard-progress">Step {step + 1} of {TOTAL_STEPS}</span>
          {step > 0 && <button className="btn btn-sm btn-outline wizard-back-btn" onClick={goBack}>Back</button>}
        </div>
        <div className="wizard-progress-bar">
          <div className="wizard-progress-fill" style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }} />
        </div>
        <h2 className="wizard-title">{stepTitles[step]}</h2>
      </div>
      <div className="wizard-body">
        {renderFns[step]()}
      </div>
    </div>
  );
}
