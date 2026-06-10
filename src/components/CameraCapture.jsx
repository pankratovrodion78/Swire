import { useRef, useState, useEffect } from 'react';

export default function CameraCapture({ label, onCapture, existingPhoto, expectedProduct }) {
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [preview, setPreview] = useState(existingPhoto || null);
  const [verified, setVerified] = useState(existingPhoto ? true : null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (streaming && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [streaming]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      setStreaming(true);
    } catch {
      fileRef.current?.click();
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    handlePhoto(dataUrl);
    stopCamera();
  }

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      handlePhoto(ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function handlePhoto(dataUrl) {
    setPreview(dataUrl);
    if (expectedProduct) {
      setVerified(null);
    } else {
      setVerified(true);
      onCapture(dataUrl);
    }
  }

  function confirmPhoto(isCorrect) {
    if (isCorrect) {
      setVerified(true);
      onCapture(preview);
    } else {
      setPreview(null);
      setVerified(null);
      onCapture(null);
      alert('Photo rejected — wrong product detected. Please retake with the correct product.');
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setStreaming(false);
  }

  function retake() {
    setPreview(null);
    setVerified(null);
    onCapture(null);
    startCamera();
  }

  return (
    <div className="camera-capture">
      <label className="field-label">{label}</label>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        hidden
      />

      {preview ? (
        <div className="photo-preview">
          <img src={preview} alt={label} />

          {expectedProduct && verified === null && (
            <div className="verify-prompt">
              <div className="verify-question">
                <strong>Verify:</strong> You are running <span className="verify-product">{expectedProduct}</span>.
                Does this photo match the correct product?
              </div>
              <div className="verify-buttons">
                <button className="btn btn-result pass" onClick={() => confirmPhoto(true)}>
                  YES — Correct Product
                </button>
                <button className="btn btn-result fail" onClick={() => confirmPhoto(false)}>
                  NO — Wrong Product
                </button>
              </div>
            </div>
          )}

          {verified && (
            <div className="verify-confirmed">Verified</div>
          )}

          <button className="btn btn-sm btn-outline" onClick={retake}>Retake</button>
        </div>
      ) : streaming ? (
        <div className="camera-live">
          <video ref={videoRef} playsInline muted className="camera-video" />
          <div className="camera-guide-overlay">
            <div className="camera-guide-box" />
            <p className="camera-guide-text">
              {label.toLowerCase().includes('can')
                ? 'Make sure the WHOLE CAN is visible'
                : 'Make sure the WHOLE CASE is visible'}
            </p>
            {expectedProduct && (
              <p className="camera-expected-product">
                Expected: {expectedProduct}
              </p>
            )}
          </div>
          <div className="camera-controls">
            <button className="btn btn-primary btn-capture" onClick={capture}>Capture</button>
            <button className="btn btn-sm btn-outline" onClick={stopCamera}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="photo-buttons">
          <button className="btn btn-outline" onClick={startCamera}>
            Take Photo — {label}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>
            Upload from Gallery
          </button>
        </div>
      )}
    </div>
  );
}
