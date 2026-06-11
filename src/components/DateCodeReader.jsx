import { useState, useRef, useEffect, useCallback } from 'react';
import { parseDateCode, enhanceCanBottomImage, formatDateCodeSummary } from '../utils/dateCode';

let tesseractWorker = null;

async function getWorker() {
  if (tesseractWorker) return tesseractWorker;
  const Tesseract = await import('tesseract.js');
  tesseractWorker = await Tesseract.createWorker('eng');
  return tesseractWorker;
}

export default function DateCodeReader({ onResult, onCancel, mode = 'standalone' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [enhanced, setEnhanced] = useState(null);
  const [ocrText, setOcrText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [ocrReady, setOcrReady] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

  // Editable fields for manual correction
  const [editMonth, setEditMonth] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDayCode, setEditDayCode] = useState('');
  const [editTime, setEditTime] = useState('');

  useEffect(() => {
    return () => stopCamera();
  }, []);

  // Auto-start camera
  useEffect(() => {
    if (!cameraOn && !photo) startCamera();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      setCameraOn(true);
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch {
      alert('Camera not available.');
    }
  }

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  }, []);

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    // Crop to the circular guide area (center 60%)
    const cropSize = Math.round(Math.min(vw, vh) * 0.6);
    const sx = Math.round((vw - cropSize) / 2);
    const sy = Math.round((vh - cropSize) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = cropSize;
    canvas.height = cropSize;
    canvas.getContext('2d').drawImage(video, sx, sy, cropSize, cropSize, 0, 0, cropSize, cropSize);

    const photoUrl = canvas.toDataURL('image/jpeg', 0.95);
    setPhoto(photoUrl);
    stopCamera();

    // Create enhanced version for OCR
    const enhCanvas = document.createElement('canvas');
    enhCanvas.width = cropSize;
    enhCanvas.height = cropSize;
    enhCanvas.getContext('2d').drawImage(canvas, 0, 0);
    enhanceCanBottomImage(enhCanvas);
    setEnhanced(enhCanvas.toDataURL('image/png'));

    canvasRef.current = enhCanvas;
  }

  async function runOCR() {
    if (!canvasRef.current) return;
    setProcessing(true);
    setOcrLoading(true);

    try {
      const worker = await getWorker();
      setOcrReady(true);
      setOcrLoading(false);

      const { data } = await worker.recognize(canvasRef.current);
      const text = data.text.trim();
      setOcrText(text);

      const result = parseDateCode(text);
      setParsed(result);

      if (result && result.confidence !== 'none') {
        setEditMonth(result.month || '');
        setEditDate(result.date || '');
        setEditDayCode(result.dayCode || '');
        setEditTime(result.time || '');
      }
    } catch (err) {
      setOcrText('OCR failed: ' + err.message);
      setOcrLoading(false);
    }
    setProcessing(false);
  }

  function retake() {
    setPhoto(null);
    setEnhanced(null);
    setOcrText('');
    setParsed(null);
    setEditMonth('');
    setEditDate('');
    setEditDayCode('');
    setEditTime('');
    canvasRef.current = null;
    startCamera();
  }

  function handleConfirm() {
    onResult({
      photo,
      enhanced,
      ocrRaw: ocrText,
      month: editMonth,
      date: editDate,
      dayCode: editDayCode,
      time: editTime,
      summary: `BB ${editMonth} ${editDate} ${editDayCode} ${editTime}`.trim(),
    });
  }

  function handleManualEntry() {
    onResult({
      photo,
      enhanced,
      ocrRaw: ocrText || '(manual)',
      month: editMonth,
      date: editDate,
      dayCode: editDayCode,
      time: editTime,
      summary: `BB ${editMonth} ${editDate} ${editDayCode} ${editTime}`.trim(),
    });
  }

  return (
    <div className={mode === 'standalone' ? 'wizard-overlay' : 'date-code-reader'}>
      {mode === 'standalone' && (
        <div className="wizard-header">
          <div className="wizard-header-top">
            <button className="btn btn-sm btn-outline wizard-cancel-btn" onClick={onCancel}>Cancel</button>
            <span className="wizard-progress">Date Code Reader</span>
          </div>
          <h2 className="wizard-title">SCAN DATE CODE</h2>
        </div>
      )}

      <div className={mode === 'standalone' ? 'wizard-body' : ''}>
        <div className="wizard-step-content">

          {/* Camera View */}
          {cameraOn && !photo && (
            <>
              <p className="wizard-instruction">Hold the bottom of the can up to the camera</p>
              <p className="wizard-sub-instruction">Line up the date code text inside the circle</p>
              <div className="wizard-camera-container">
                <video ref={videoRef} playsInline muted className="wizard-camera-video" />
                <div className="date-code-guide-overlay">
                  <svg className="date-code-guide-svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">
                    <circle cx="100" cy="100" r="58" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeDasharray="8,4" />
                    <line x1="30" y1="100" x2="55" y2="100" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
                    <line x1="145" y1="100" x2="170" y2="100" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
                    <line x1="100" y1="30" x2="100" y2="55" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
                    <line x1="100" y1="145" x2="100" y2="170" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
                  </svg>
                  <div className="can-guide-label">DATE CODE</div>
                </div>
                <div className="wizard-camera-controls">
                  <button className="btn btn-primary btn-capture" onClick={capturePhoto}>
                    Capture Date Code
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Photo captured — show original + enhanced */}
          {photo && !processing && !parsed && (
            <>
              <p className="wizard-instruction">Photo captured — run OCR to read the code</p>
              <div className="date-code-photos">
                <div className="date-code-photo-pair">
                  <div className="date-code-photo-box">
                    <span className="date-code-photo-label">Original</span>
                    <img src={photo} alt="Can bottom" className="date-code-preview" />
                  </div>
                  <div className="date-code-photo-box">
                    <span className="date-code-photo-label">Enhanced</span>
                    <img src={enhanced} alt="Enhanced" className="date-code-preview" />
                  </div>
                </div>
              </div>
              <button className="btn btn-primary btn-lg btn-full" onClick={runOCR}>
                {ocrLoading ? 'Loading OCR Engine...' : 'Read Date Code'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={retake} style={{ alignSelf: 'center' }}>
                Retake Photo
              </button>
            </>
          )}

          {/* Processing */}
          {processing && (
            <div className="date-code-processing">
              <div className="alert alert-info">
                {!ocrReady ? 'Loading OCR engine (first time may take 10-20 seconds)...' : 'Reading date code...'}
              </div>
            </div>
          )}

          {/* OCR Results */}
          {parsed && (
            <>
              <p className="wizard-instruction">
                {parsed.confidence === 'high' ? 'Date code recognized!' :
                 parsed.confidence === 'partial' ? 'Partial read — verify the fields below' :
                 'Could not read automatically — enter manually'}
              </p>

              {parsed.confidence !== 'none' && (
                <div className={`date-code-result ${parsed.confidence === 'high' ? 'date-code-result-good' : 'date-code-result-partial'}`}>
                  <span className="date-code-raw">OCR: {ocrText}</span>
                  <span className="date-code-parsed">{formatDateCodeSummary(parsed)}</span>
                </div>
              )}

              <div className="date-code-photos" style={{ marginBottom: 8 }}>
                <div className="date-code-photo-pair">
                  <div className="date-code-photo-box">
                    <span className="date-code-photo-label">Original</span>
                    <img src={photo} alt="Can bottom" className="date-code-preview" />
                  </div>
                  <div className="date-code-photo-box">
                    <span className="date-code-photo-label">Enhanced</span>
                    <img src={enhanced} alt="Enhanced" className="date-code-preview" />
                  </div>
                </div>
              </div>

              <p className="wizard-sub-instruction" style={{ fontWeight: 700 }}>
                Verify or correct the fields:
              </p>

              <div className="date-code-fields">
                <div className="date-code-field">
                  <label className="field-label required">Month</label>
                  <select className="input" value={editMonth} onChange={e => setEditMonth(e.target.value)}>
                    <option value="">Select</option>
                    {Object.entries({ JAN:'January',FEB:'February',MAR:'March',APR:'April',MAY:'May',JUN:'June',JUL:'July',AUG:'August',SEP:'September',OCT:'October',NOV:'November',DEC:'December' }).map(([k,v]) => (
                      <option key={k} value={k}>{k} — {v}</option>
                    ))}
                  </select>
                </div>
                <div className="date-code-field">
                  <label className="field-label required">Date (4-digit)</label>
                  <input className="input" placeholder="e.g. 0827" value={editDate} onChange={e => setEditDate(e.target.value)} maxLength={4} />
                </div>
                <div className="date-code-field">
                  <label className="field-label">Day Code</label>
                  <input className="input" placeholder="e.g. SCD" value={editDayCode} onChange={e => setEditDayCode(e.target.value.toUpperCase())} maxLength={4} />
                </div>
                <div className="date-code-field">
                  <label className="field-label">Time</label>
                  <input className="input" placeholder="e.g. 12:01" value={editTime} onChange={e => setEditTime(e.target.value)} maxLength={5} />
                </div>
              </div>

              <button
                className="btn btn-primary btn-lg btn-full"
                onClick={handleConfirm}
                disabled={!editMonth || !editDate}
              >
                Confirm Date Code
              </button>

              <div className="date-code-actions-row">
                <button className="btn btn-outline btn-sm" onClick={retake}>Retake Photo</button>
                <button className="btn btn-outline btn-sm" onClick={runOCR}>Re-run OCR</button>
              </div>
            </>
          )}

          {/* Always show manual entry option */}
          {!cameraOn && !processing && !parsed && !photo && (
            <>
              <p className="wizard-instruction">Enter date code manually</p>
              <div className="date-code-fields">
                <div className="date-code-field">
                  <label className="field-label required">Month</label>
                  <select className="input" value={editMonth} onChange={e => setEditMonth(e.target.value)}>
                    <option value="">Select</option>
                    {Object.entries({ JAN:'January',FEB:'February',MAR:'March',APR:'April',MAY:'May',JUN:'June',JUL:'July',AUG:'August',SEP:'September',OCT:'October',NOV:'November',DEC:'December' }).map(([k,v]) => (
                      <option key={k} value={k}>{k} — {v}</option>
                    ))}
                  </select>
                </div>
                <div className="date-code-field">
                  <label className="field-label required">Date (4-digit)</label>
                  <input className="input" placeholder="e.g. 0827" value={editDate} onChange={e => setEditDate(e.target.value)} maxLength={4} />
                </div>
                <div className="date-code-field">
                  <label className="field-label">Day Code</label>
                  <input className="input" placeholder="e.g. SCD" value={editDayCode} onChange={e => setEditDayCode(e.target.value.toUpperCase())} maxLength={4} />
                </div>
                <div className="date-code-field">
                  <label className="field-label">Time</label>
                  <input className="input" placeholder="e.g. 12:01" value={editTime} onChange={e => setEditTime(e.target.value)} maxLength={5} />
                </div>
              </div>
              <button className="btn btn-primary btn-lg btn-full" onClick={handleManualEntry} disabled={!editMonth || !editDate}>
                Save Date Code
              </button>
              <button className="btn btn-outline btn-sm" onClick={startCamera} style={{ alignSelf: 'center' }}>
                Open Camera Instead
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
