import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  loadModel, classifyFrame, getEmbedding, cropToGuide,
  getReferences, saveReference, deleteReference, createReference,
  matchAgainstReferences,
} from '../utils/vision';

const MATCH_THRESHOLD = 0.62;
const SPIN_DURATION_MS = 9000;
const SPIN_INTERVAL_MS = 700;

export default function VisionTest() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(null);
  const busyRef = useRef(false);

  const [modelStatus, setModelStatus] = useState('loading'); // loading | ready | error
  const [cameraOn, setCameraOn] = useState(false);
  const [mode, setMode] = useState('live'); // live | spin | match
  const [live, setLive] = useState(null);

  // 360 verify state
  const [expected, setExpected] = useState('can');
  const [spinState, setSpinState] = useState('idle'); // idle | running | done
  const [spinProgress, setSpinProgress] = useState(0);
  const [spinResult, setSpinResult] = useState(null);
  const spinFramesRef = useRef([]);

  // product match state
  const [refs, setRefs] = useState(getReferences);
  const [teachName, setTeachName] = useState('');
  const [teachType, setTeachType] = useState('can');
  const [teaching, setTeaching] = useState(null); // ref being taught
  const [matchResult, setMatchResult] = useState(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    loadModel()
      .then(() => setModelStatus('ready'))
      .catch(() => setModelStatus('error'));
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

  // live classification loop
  useEffect(() => {
    if (mode === 'live' && cameraOn && modelStatus === 'ready') {
      loopRef.current = setInterval(async () => {
        if (busyRef.current) return;
        const v = videoRef.current;
        if (!v || v.videoWidth === 0) return;
        busyRef.current = true;
        try {
          const result = await classifyFrame(v);
          setLive(result);
        } catch { /* skip frame */ }
        busyRef.current = false;
      }, 600);
    }
    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
      loopRef.current = null;
    };
  }, [mode, cameraOn, modelStatus]);

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
    setLive(null);
  }

  // ---- 360 verify ----
  async function runSpinCheck() {
    setSpinState('running');
    setSpinResult(null);
    setSpinProgress(0);
    spinFramesRef.current = [];

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
    const hits = frames.filter(f => f.type === expected).length;
    const other = frames.filter(f => f.type !== 'unknown' && f.type !== expected).length;
    const pct = total ? Math.round((hits / total) * 100) : 0;
    const pass = total >= 5 && pct >= 60 && other / Math.max(total, 1) < 0.3;

    setSpinResult({ total, hits, other, pct, pass });
    setSpinState('done');
  }

  // ---- product match ----
  function startTeaching() {
    if (!teachName.trim()) {
      alert('Enter a product name first (e.g. "Coke Classic 12oz REGULAR can" or "Coke Classic 12oz PROMO can")');
      return;
    }
    setTeaching(createReference(teachName.trim(), teachType));
  }

  async function captureAngle() {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0 || !teaching) return;
    setWorking(true);
    try {
      const cropped = cropToGuide(v);
      const emb = await getEmbedding(cropped);
      const updated = { ...teaching, embeddings: [...teaching.embeddings, emb] };
      setTeaching(updated);
    } catch (err) {
      alert('Capture failed: ' + err.message);
    }
    setWorking(false);
  }

  function finishTeaching() {
    if (teaching.embeddings.length < 5) {
      alert('Capture at least 5 angles (front, nutrition, size label, back, top) before saving.');
      return;
    }
    saveReference(teaching);
    setRefs(getReferences());
    setTeaching(null);
    setTeachName('');
  }

  async function identify() {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return;
    setWorking(true);
    setMatchResult(null);
    try {
      const samples = [];
      for (let i = 0; i < 3; i++) {
        const cropped = cropToGuide(v);
        samples.push(await getEmbedding(cropped));
        await new Promise(r => setTimeout(r, 250));
      }
      const allRanked = samples.map(s => matchAgainstReferences(s));
      // average each ref's score across samples
      const scoreMap = {};
      for (const ranked of allRanked) {
        for (const { ref, score } of ranked) {
          if (!scoreMap[ref.id]) scoreMap[ref.id] = { ref, sum: 0, n: 0 };
          scoreMap[ref.id].sum += score;
          scoreMap[ref.id].n += 1;
        }
      }
      const ranked = Object.values(scoreMap)
        .map(({ ref, sum, n }) => ({ ref, score: sum / n }))
        .sort((a, b) => b.score - a.score);
      setMatchResult(ranked);
    } catch (err) {
      alert('Identify failed: ' + err.message);
    }
    setWorking(false);
  }

  function handleDeleteRef(id) {
    if (!confirm('Delete this trained product?')) return;
    deleteReference(id);
    setRefs(getReferences());
  }

  const liveVerdict = live && (
    live.type === 'can' ? { text: 'CAN DETECTED', cls: 'vision-verdict-can' }
    : live.type === 'bottle' ? { text: 'BOTTLE DETECTED', cls: 'vision-verdict-bottle' }
    : { text: 'NOT A CAN OR BOTTLE', cls: 'vision-verdict-unknown' }
  );

  return (
    <div className="page vision-page">
      <div className="card">
        <h2>Camera Recognition <span className="badge badge-warning">BETA</span></h2>
        <p className="card-desc">
          AI object recognition test. Runs entirely on this device — no internet needed after the model loads.
        </p>

        {modelStatus === 'loading' && (
          <div className="alert alert-info">Loading AI model… this can take 10–30 seconds the first time.</div>
        )}
        {modelStatus === 'error' && (
          <div className="alert alert-warning">
            Could not load the AI model. Check your internet connection and reload the page
            (the model downloads once, then is cached).
          </div>
        )}

        {!cameraOn ? (
          <button className="btn btn-primary btn-lg btn-full" onClick={startCamera} disabled={modelStatus !== 'ready'}>
            Start Camera
          </button>
        ) : (
          <>
            <div className="vision-camera">
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
              {mode === 'live' && liveVerdict && (
                <div className={`vision-verdict ${liveVerdict.cls}`}>
                  {liveVerdict.text}
                  <span className="vision-confidence">{Math.round(live.confidence * 100)}%</span>
                </div>
              )}
              {mode === 'spin' && spinState === 'running' && (
                <div className="vision-spin-overlay">
                  <div className="vision-spin-text">SLOWLY ROTATE THE {expected.toUpperCase()} 360°</div>
                  <div className="vision-progress"><div className="vision-progress-bar" style={{ width: `${spinProgress}%` }} /></div>
                </div>
              )}
            </div>
            <button className="btn btn-sm btn-outline" onClick={stopCamera} style={{ marginTop: 8 }}>
              Stop Camera
            </button>
          </>
        )}
      </div>

      {cameraOn && (
        <div className="card">
          <div className="filter-bar">
            <button className={`btn btn-sm ${mode === 'live' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMode('live')}>
              Live ID
            </button>
            <button className={`btn btn-sm ${mode === 'spin' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMode('spin')}>
              360° Verify
            </button>
            <button className={`btn btn-sm ${mode === 'match' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMode('match')}>
              Product Match
            </button>
          </div>

          {mode === 'live' && (
            <div className="vision-section">
              <p className="field-hint">Point the camera at an object. The AI continuously identifies whether it's a can or a bottle.</p>
              {live && (
                <div className="vision-predictions">
                  {live.predictions.slice(0, 3).map((p, i) => (
                    <div key={i} className="vision-prediction-row">
                      <span>{p.className.split(',')[0]}</span>
                      <span className="vision-prediction-pct">{Math.round(p.probability * 100)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === 'spin' && (
            <div className="vision-section">
              <p className="field-hint">
                Select what you should be running, press Start, then slowly rotate the product a full
                turn so the camera sees all sides. The AI samples frames the whole time and gives a verdict.
              </p>
              <div className="form-group">
                <label className="field-label">Expected Object</label>
                <div className="condition-buttons">
                  <button className={`btn btn-condition ${expected === 'can' ? 'selected' : ''}`} onClick={() => setExpected('can')}>Can</button>
                  <button className={`btn btn-condition ${expected === 'bottle' ? 'selected' : ''}`} onClick={() => setExpected('bottle')}>Bottle</button>
                </div>
              </div>
              <button
                className="btn btn-primary btn-full"
                onClick={runSpinCheck}
                disabled={spinState === 'running'}
              >
                {spinState === 'running' ? `Scanning… ${spinProgress}%` : 'Start 360° Check'}
              </button>

              {spinResult && (
                <div className={`vision-spin-result ${spinResult.pass ? 'match-success' : 'match-fail'}`}>
                  {spinResult.pass
                    ? `VERIFIED — ${expected.toUpperCase()} confirmed on ${spinResult.pct}% of ${spinResult.total} frames`
                    : `NOT VERIFIED — only ${spinResult.pct}% of ${spinResult.total} frames looked like a ${expected}.`}
                  {!spinResult.pass && spinResult.other > 0 && (
                    <div className="vision-spin-warning">A different object type was detected. Check you are scanning the right product.</div>
                  )}
                </div>
              )}
            </div>
          )}

          {mode === 'match' && (
            <div className="vision-section">
              <p className="field-hint">
                Teach the app each product variant (regular can, promo can, promo wrap…) by capturing it
                from several angles. Then "Identify" tells you which trained product the camera sees —
                this catches promotional artwork on the same flavor.
              </p>

              {!teaching ? (
                <>
                  <div className="form-group">
                    <label className="field-label">Train a New Product</label>
                    <input
                      className="input"
                      placeholder='e.g. "Coke Classic 12oz PROMO can"'
                      value={teachName}
                      onChange={e => setTeachName(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <div className="condition-buttons">
                      {['can', 'bottle', 'wrap'].map(t => (
                        <button key={t} className={`btn btn-condition ${teachType === t ? 'selected' : ''}`} onClick={() => setTeachType(t)}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button className="btn btn-outline btn-full" onClick={startTeaching}>
                    Start Training
                  </button>

                  <button
                    className="btn btn-primary btn-full"
                    onClick={identify}
                    disabled={working || refs.length === 0}
                    style={{ marginTop: 10 }}
                  >
                    {working ? 'Analyzing…' : 'Identify This Product'}
                  </button>
                  {refs.length === 0 && <p className="field-hint">Train at least one product before identifying.</p>}

                  {matchResult && matchResult.length > 0 && (
                    <div className="vision-match-results">
                      {matchResult[0].score >= MATCH_THRESHOLD ? (
                        <div className="match-result match-success">
                          MATCH: {matchResult[0].ref.name} ({Math.round(matchResult[0].score * 100)}% similar)
                        </div>
                      ) : (
                        <div className="match-result match-fail">
                          NO CONFIDENT MATCH — closest is "{matchResult[0].ref.name}" at {Math.round(matchResult[0].score * 100)}%.
                          This may be the wrong product or an untrained variant.
                        </div>
                      )}
                      {matchResult.length > 1 && (
                        <div className="vision-runner-up">
                          Next closest: {matchResult[1].ref.name} ({Math.round(matchResult[1].score * 100)}%)
                        </div>
                      )}
                    </div>
                  )}

                  {refs.length > 0 && (
                    <div className="vision-ref-list">
                      <label className="field-label">Trained Products ({refs.length})</label>
                      {refs.map(r => (
                        <div key={r.id} className="vision-ref-row">
                          <span>{r.name} <span className="text-muted">({r.type}, {r.embeddings.length} angles)</span></span>
                          <button className="btn btn-sm btn-danger" onClick={() => handleDeleteRef(r.id)}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="vision-teaching">
                  <div className="alert alert-info">
                    Training: <strong>{teaching.name}</strong><br />
                    Line up the product inside the can guide and capture from 5 positions:
                    front label, nutrition panel, size/oz label, back side, top.
                  </div>
                  <div className="vision-angle-count">{teaching.embeddings.length} angle(s) captured</div>
                  <button className="btn btn-primary btn-full" onClick={captureAngle} disabled={working}>
                    {working ? 'Capturing…' : 'Capture This Angle'}
                  </button>
                  <div className="page-actions-row" style={{ marginTop: 10 }}>
                    <button className="btn btn-outline" onClick={() => setTeaching(null)}>Cancel</button>
                    <button className="btn btn-primary" onClick={finishTeaching} disabled={teaching.embeddings.length < 5}>
                      Save Product ({teaching.embeddings.length}/5 min)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="page-actions">
        <button className="btn btn-outline" onClick={() => navigate('/')}>← Back to Home</button>
      </div>
    </div>
  );
}
