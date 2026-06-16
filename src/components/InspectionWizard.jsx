import { useState, useRef, useEffect, useCallback } from 'react';
import { findRecipeByBarcode, findRecipeByBarcodeInList } from '../utils/recipes';
import { cropToGuide } from '../utils/vision';
import BarcodeScanner from './BarcodeScanner';
import DateCodeReader from './DateCodeReader';

// Verify a scanned barcode against the products running this shift.
// Returns { status: 'match'|'wrong'|'unknown', recipe }
function verifyBarcode(code, selectedRecipes) {
  const inRunning = findRecipeByBarcodeInList(code, selectedRecipes);
  if (inRunning) return { status: 'match', recipe: inRunning };
  const known = findRecipeByBarcode(code);
  if (known) return { status: 'wrong', recipe: known };
  return { status: 'unknown', recipe: null };
}

const TOTAL_STEPS = 6;
const ROTATION_PHOTOS_NEEDED = 5;
const ROTATION_INTERVAL_MS = 2500;
const COUNTDOWN_SECONDS = 3;

const ROTATION_POSITIONS = [
  'FRONT LABEL',
  'NUTRITION PANEL',
  'SIZE / OZ LABEL',
  'BACK SIDE',
  'TOP OF CAN',
];

const CONDITION_OPTIONS = ['Good', 'Damaged', 'Misaligned', 'Missing Label', 'Other'];

function formatTime() {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function InspectionWizard({ onComplete, onCancel, selectedRecipes = [] }) {
  const [step, setStep] = useState(0);

  // Step 0 — Can Barcode
  const [canBarcode, setCanBarcode] = useState('');
  const [canRecipeMatch, setCanRecipeMatch] = useState(null);
  const [canVerify, setCanVerify] = useState(null); // { status, recipe }
  const [canScanned, setCanScanned] = useState(false);

  // Step 1 — Can Rotation
  const [rotationPhotos, setRotationPhotos] = useState([]);
  const [rotationCountdown, setRotationCountdown] = useState(null);
  const [rotationCapturing, setRotationCapturing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  // Step 2 — Date Code
  const [dateCode, setDateCode] = useState('');
  const [dateCodePhoto, setDateCodePhoto] = useState(null);
  const [dateCodeData, setDateCodeData] = useState(null);
  const [dateCodeDone, setDateCodeDone] = useState(false);

  // Step 3 — Package Barcode
  const [pkgBarcode, setPkgBarcode] = useState('');
  const [pkgRecipeMatch, setPkgRecipeMatch] = useState(null);
  const [pkgVerify, setPkgVerify] = useState(null); // { status, recipe }
  const [pkgScanned, setPkgScanned] = useState(false);

  // Step 4 — Package Photo
  const [pkgPhoto, setPkgPhoto] = useState(null);

  // Step 5 — Condition
  const [packageCondition, setPackageCondition] = useState('');
  const [notes, setNotes] = useState('');

  // Refs
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const countdownRef = useRef(null);

  // ── Camera helpers ──────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setRotationCapturing(false);
    setRotationCountdown(null);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch {
      alert('Camera access denied or not available.');
    }
  }, []);

  // Attach stream to video element when camera becomes active
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive]);

  // Cleanup camera when step changes or component unmounts
  useEffect(() => {
    return () => stopCamera();
  }, [step, stopCamera]);

  // Auto-open scanner/camera when entering certain steps
  useEffect(() => {
    if (step === 1 && rotationPhotos.length === 0) {
      startCamera();
    }
    if (step === 4 && !pkgPhoto) {
      startCamera();
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rotation capture logic ──────────────────────────────────────

  const captureFrame = useCallback((useCrop = false) => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    if (useCrop) {
      const cropped = cropToGuide(video);
      return cropped.toDataURL('image/jpeg', 0.7);
    }
    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvasRef.current = canvas;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.7);
  }, []);

  const startRotationCapture = useCallback(() => {
    setRotationCountdown(COUNTDOWN_SECONDS);

    let count = COUNTDOWN_SECONDS;
    countdownRef.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        setRotationCountdown(null);
        setRotationCapturing(true);

        const first = captureFrame(true);
        if (first) {
          setRotationPhotos(prev => [...prev, first]);
        }
        let captured = first ? 1 : 0;

        intervalRef.current = setInterval(() => {
          const frame = captureFrame(true);
          if (frame) {
            captured += 1;
            setRotationPhotos(prev => {
              const next = [...prev, frame];
              if (next.length >= ROTATION_PHOTOS_NEEDED) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
                setRotationCapturing(false);
              }
              return next;
            });
          }
          if (captured >= ROTATION_PHOTOS_NEEDED) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }, ROTATION_INTERVAL_MS);
      } else {
        setRotationCountdown(count);
      }
    }, 1000);
  }, [captureFrame]);

  // ── Single-photo capture (steps 2 & 4) ─────────────────────────

  const captureSinglePhoto = useCallback(() => {
    const dataUrl = captureFrame();
    if (!dataUrl) return;
    stopCamera();
    return dataUrl;
  }, [captureFrame, stopCamera]);

  // ── Navigation ──────────────────────────────────────────────────

  function goNext() {
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    }
  }

  function goBack() {
    if (step > 0) {
      setStep(step - 1);
    }
  }

  function handleComplete() {
    onComplete({
      time: formatTime(),
      canBarcode,
      canRecipeMatch: canRecipeMatch ? canRecipeMatch.name : null,
      rotationPhotos,
      dateCode,
      dateCodePhoto,
      dateCodeMonth: dateCodeData?.month || '',
      dateCodeExpDay: dateCodeData?.expDay || '',
      dateCodeExpYear: dateCodeData?.expYear || '',
      dateCodeProdDay: dateCodeData?.prodDay || '',
      dateCodeProdDayName: dateCodeData?.prodDayName || '',
      dateCodeTime: dateCodeData?.time || '',
      dateCodeLine: dateCodeData?.line || '',
      pkgBarcode,
      pkgRecipeMatch: pkgRecipeMatch ? pkgRecipeMatch.name : null,
      pkgPhoto,
      packageCondition,
      notes,
    });
  }

  function rescanCan() {
    setCanScanned(false);
    setCanBarcode('');
    setCanVerify(null);
    setCanRecipeMatch(null);
  }

  function rescanPkg() {
    setPkgScanned(false);
    setPkgBarcode('');
    setPkgVerify(null);
    setPkgRecipeMatch(null);
  }

  function renderVerifyBadge(verify, onRescan) {
    if (!verify) {
      return <div className="wizard-match wizard-match-fail">NO BARCODE SCANNED</div>;
    }
    if (verify.status === 'match') {
      return (
        <div className="wizard-match wizard-match-success">
          ✓ MATCH: {verify.recipe.name}
        </div>
      );
    }
    if (verify.status === 'wrong') {
      return (
        <div className="wizard-match wizard-match-wrong">
          ⚠ WRONG PRODUCT — this is "{verify.recipe.name}", which is NOT in the products you are running this shift.
          <button className="btn btn-sm btn-outline" onClick={onRescan} style={{ marginTop: 8 }}>Re-scan</button>
        </div>
      );
    }
    return (
      <div className="wizard-match wizard-match-fail">
        NO MATCH — barcode not found in any recipe. Verify the product is correct.
        <button className="btn btn-sm btn-outline" onClick={onRescan} style={{ marginTop: 8 }}>Re-scan</button>
      </div>
    );
  }

  // ── Step renderers ──────────────────────────────────────────────

  function renderStepCanBarcode() {
    if (!canScanned) {
      return (
        <div className="wizard-step-content">
          <p className="wizard-instruction">Scan the barcode on the can.</p>
          <BarcodeScanner
            onScan={(code) => {
              setCanBarcode(code);
              const v = verifyBarcode(code, selectedRecipes);
              setCanVerify(v);
              setCanRecipeMatch(v.status === 'match' ? v.recipe : null);
              setCanScanned(true);
            }}
            onClose={() => setCanScanned(true)}
          />
        </div>
      );
    }

    return (
      <div className="wizard-step-content">
        <div className="wizard-result">
          <p className="wizard-scanned-code">Scanned: <strong>{canBarcode || '(none)'}</strong></p>
          {renderVerifyBadge(canVerify, () => rescanCan())}
        </div>
        <button className="btn btn-primary btn-lg wizard-next-btn" onClick={goNext}>Next</button>
      </div>
    );
  }

  function renderStepCanRotation() {
    const done = rotationPhotos.length >= ROTATION_PHOTOS_NEEDED;
    const currentLabel = ROTATION_POSITIONS[rotationPhotos.length] || 'EXTRA';

    return (
      <div className="wizard-step-content">
        <p className="wizard-instruction">Slowly rotate the can inside the guide.</p>
        <p className="wizard-sub-instruction">
          {!done
            ? `Position ${rotationPhotos.length + 1} of ${ROTATION_PHOTOS_NEEDED}: ${currentLabel}`
            : `All ${ROTATION_PHOTOS_NEEDED} positions captured!`}
        </p>

        {cameraActive && (
          <div className="wizard-camera-container">
            <video ref={videoRef} playsInline muted className="wizard-camera-video" />
            <div className="can-guide-overlay">
              <svg className="can-guide-svg" viewBox="0 0 200 300" preserveAspectRatio="xMidYMid meet">
                <ellipse cx="100" cy="30" rx="55" ry="18" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeDasharray="6,4" />
                <line x1="45" y1="30" x2="45" y2="270" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeDasharray="6,4" />
                <line x1="155" y1="30" x2="155" y2="270" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeDasharray="6,4" />
                <ellipse cx="100" cy="270" rx="55" ry="18" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeDasharray="6,4" />
              </svg>
              <div className="can-guide-label">{!done ? currentLabel : 'COMPLETE'}</div>
            </div>

            {rotationCountdown !== null && (
              <div className="wizard-countdown-overlay">
                <span className="wizard-countdown-number">Starting in {rotationCountdown}...</span>
              </div>
            )}

            {!rotationCapturing && rotationCountdown === null && !done && (
              <button
                className="btn btn-primary btn-lg wizard-start-capture-btn"
                onClick={startRotationCapture}
              >
                Start Capture
              </button>
            )}

            {rotationCapturing && (
              <div className="wizard-capturing-indicator">Capturing — {currentLabel}</div>
            )}
          </div>
        )}

        {rotationPhotos.length > 0 && (
          <div className="wizard-thumbnails">
            {rotationPhotos.map((photo, i) => (
              <div key={i} className="wizard-thumb-wrap">
                <img src={photo} alt={`Rotation ${i + 1}`} className="wizard-thumbnail" />
                <span className="wizard-thumb-angle-label">{ROTATION_POSITIONS[i] || `Extra`}</span>
              </div>
            ))}
          </div>
        )}

        {done && (
          <button className="btn btn-primary btn-lg wizard-next-btn" onClick={goNext}>Next</button>
        )}
      </div>
    );
  }

  function renderStepDateCode() {
    if (!dateCodeDone) {
      return (
        <DateCodeReader
          mode="inline"
          onResult={(result) => {
            setDateCode(result.summary);
            setDateCodePhoto(result.photo);
            setDateCodeData(result);
            setDateCodeDone(true);
          }}
          onCancel={() => setDateCodeDone(true)}
        />
      );
    }

    return (
      <div className="wizard-step-content">
        <p className="wizard-instruction">Date code captured</p>
        <div className="wizard-result">
          <p><strong>{dateCode}</strong></p>
          {dateCodeData && (
            <div className="date-code-fields" style={{ marginTop: 8 }}>
              {dateCodeData.month && (
                <div className="date-code-field">
                  <span className="detail-label">Month</span>
                  <span className="detail-value">{dateCodeData.month}</span>
                </div>
              )}
              {dateCodeData.expDay && (
                <div className="date-code-field">
                  <span className="detail-label">Exp Day</span>
                  <span className="detail-value">{dateCodeData.expDay}</span>
                </div>
              )}
              {dateCodeData.expYear && (
                <div className="date-code-field">
                  <span className="detail-label">Exp Year</span>
                  <span className="detail-value">20{dateCodeData.expYear}</span>
                </div>
              )}
              {dateCodeData.prodDay && (
                <div className="date-code-field">
                  <span className="detail-label">Prod Day</span>
                  <span className="detail-value">{dateCodeData.prodDay} — {dateCodeData.prodDayName}</span>
                </div>
              )}
              {dateCodeData.time && (
                <div className="date-code-field">
                  <span className="detail-label">Time</span>
                  <span className="detail-value">{dateCodeData.time}</span>
                </div>
              )}
              {dateCodeData.line && (
                <div className="date-code-field">
                  <span className="detail-label">Line</span>
                  <span className="detail-value">{dateCodeData.line}</span>
                </div>
              )}
            </div>
          )}
          {dateCodePhoto && (
            <div className="wizard-photo-preview" style={{ marginTop: 8 }}>
              <img src={dateCodePhoto} alt="Date code" className="wizard-preview-img" />
            </div>
          )}
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => setDateCodeDone(false)} style={{ alignSelf: 'center' }}>
          Redo Date Code
        </button>
        <button className="btn btn-primary btn-lg wizard-next-btn" onClick={goNext}>Next</button>
      </div>
    );
  }

  function renderStepPkgBarcode() {
    if (!pkgScanned) {
      return (
        <div className="wizard-step-content">
          <p className="wizard-instruction">Scan the barcode on the package (case/cardboard).</p>
          <BarcodeScanner
            onScan={(code) => {
              setPkgBarcode(code);
              const v = verifyBarcode(code, selectedRecipes);
              setPkgVerify(v);
              setPkgRecipeMatch(v.status === 'match' ? v.recipe : null);
              setPkgScanned(true);
            }}
            onClose={() => setPkgScanned(true)}
          />
        </div>
      );
    }

    return (
      <div className="wizard-step-content">
        <div className="wizard-result">
          <p className="wizard-scanned-code">Scanned: <strong>{pkgBarcode || '(none)'}</strong></p>
          {renderVerifyBadge(pkgVerify, () => rescanPkg())}
        </div>
        <button className="btn btn-primary btn-lg wizard-next-btn" onClick={goNext}>Next</button>
      </div>
    );
  }

  function renderStepPkgPhoto() {
    return (
      <div className="wizard-step-content">
        <p className="wizard-instruction">Take a photo of the whole case/cardboard package.</p>

        {cameraActive && !pkgPhoto && (
          <div className="wizard-camera-container">
            <video ref={videoRef} playsInline muted className="wizard-camera-video" />
            <div className="wizard-camera-controls">
              <button
                className="btn btn-primary btn-capture"
                onClick={() => {
                  const photo = captureSinglePhoto();
                  if (photo) setPkgPhoto(photo);
                }}
              >
                Capture
              </button>
              <button className="btn btn-outline btn-sm" onClick={stopCamera}>Cancel</button>
            </div>
          </div>
        )}

        {pkgPhoto && (
          <div className="wizard-result">
            <div className="wizard-photo-preview">
              <img src={pkgPhoto} alt="Package" className="wizard-preview-img" />
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => { setPkgPhoto(null); startCamera(); }}>
              Retake
            </button>
          </div>
        )}

        {!cameraActive && !pkgPhoto && (
          <button className="btn btn-primary btn-lg" onClick={startCamera}>Open Camera</button>
        )}

        {pkgPhoto && (
          <button className="btn btn-primary btn-lg wizard-next-btn" onClick={goNext}>Next</button>
        )}
      </div>
    );
  }

  function renderStepCondition() {
    return (
      <div className="wizard-step-content">
        <p className="wizard-instruction">Select the package condition.</p>

        <div className="wizard-condition-options">
          {CONDITION_OPTIONS.map(opt => (
            <button
              key={opt}
              className={`btn btn-lg wizard-condition-btn ${packageCondition === opt ? 'wizard-condition-selected' : 'btn-outline'}`}
              onClick={() => setPackageCondition(opt)}
            >
              {opt}
            </button>
          ))}
        </div>

        <div className="wizard-notes-section">
          <label className="field-label">Notes (optional)</label>
          <textarea
            className="input wizard-notes-textarea"
            placeholder="Any additional observations..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        <button
          className="btn btn-primary btn-lg wizard-complete-btn"
          disabled={!packageCondition}
          onClick={handleComplete}
        >
          Complete Inspection
        </button>
        <button className="btn btn-outline btn-sm wizard-skip-btn" onClick={() => { if (!packageCondition) setPackageCondition('Good'); handleComplete(); }}>
          Skip
        </button>
      </div>
    );
  }

  // ── Step titles ─────────────────────────────────────────────────

  const stepTitles = [
    'CAN BARCODE',
    'CAN ROTATION',
    'EXPIRATION / DATE CODE',
    'PACKAGE BARCODE',
    'PACKAGE PHOTO',
    'CONDITION & COMPLETE',
  ];

  const renderFns = [
    renderStepCanBarcode,
    renderStepCanRotation,
    renderStepDateCode,
    renderStepPkgBarcode,
    renderStepPkgPhoto,
    renderStepCondition,
  ];

  // ── Main render ─────────────────────────────────────────────────

  return (
    <div className="wizard-overlay">
      <div className="wizard-header">
        <div className="wizard-header-top">
          <button className="btn btn-sm btn-outline wizard-cancel-btn" onClick={onCancel}>
            Cancel
          </button>
          <span className="wizard-progress">Step {step + 1} of {TOTAL_STEPS}</span>
          {step > 0 && (
            <button className="btn btn-sm btn-outline wizard-back-btn" onClick={goBack}>
              Back
            </button>
          )}
        </div>

        <div className="wizard-progress-bar">
          <div
            className="wizard-progress-fill"
            style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        <h2 className="wizard-title">{stepTitles[step]}</h2>
      </div>

      <div className="wizard-body">
        {renderFns[step]()}
      </div>
    </div>
  );
}
