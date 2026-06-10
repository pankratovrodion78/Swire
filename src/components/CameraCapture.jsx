import { useRef, useState } from 'react';

export default function CameraCapture({ label, onCapture, existingPhoto }) {
  const videoRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [preview, setPreview] = useState(existingPhoto || null);
  const streamRef = useRef(null);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      videoRef.current.play();
      setStreaming(true);
    } catch {
      alert('Camera not available. Please check permissions.');
    }
  }

  function capture() {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    setPreview(dataUrl);
    onCapture(dataUrl);
    stopCamera();
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
    onCapture(null);
    startCamera();
  }

  return (
    <div className="camera-capture">
      <label className="field-label">{label}</label>
      {preview ? (
        <div className="photo-preview">
          <img src={preview} alt={label} />
          <button className="btn btn-sm btn-outline" onClick={retake}>Retake</button>
        </div>
      ) : streaming ? (
        <div className="camera-live">
          <video ref={videoRef} playsInline className="camera-video" />
          <div className="camera-guide-overlay">
            <div className="camera-guide-box" />
            <p className="camera-guide-text">
              {label.toLowerCase().includes('can')
                ? 'Make sure the WHOLE CAN is visible'
                : 'Make sure the WHOLE CASE is visible'}
            </p>
          </div>
          <div className="camera-controls">
            <button className="btn btn-primary btn-capture" onClick={capture}>📸 Capture</button>
            <button className="btn btn-sm btn-outline" onClick={stopCamera}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-outline" onClick={startCamera}>
          📷 Take Photo — {label}
        </button>
      )}
    </div>
  );
}
