import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function BarcodeScanner({ onScan, onClose }) {
  const [error, setError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const scannerRef = useRef(null);
  const containerRef = useRef(null);
  const onScanRef = useRef(onScan);
  const stoppedRef = useRef(false);

  onScanRef.current = onScan;

  useEffect(() => {
    const id = 'barcode-reader-' + Date.now();
    containerRef.current.id = id;
    const scanner = new Html5Qrcode(id);
    scannerRef.current = scanner;
    stoppedRef.current = false;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 }, formatsToSupport: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
        (decodedText) => {
          if (stoppedRef.current) return;
          stoppedRef.current = true;
          scanner.stop().then(() => {
            onScanRef.current(decodedText);
          }).catch(() => {
            onScanRef.current(decodedText);
          });
        },
        () => {}
      )
      .catch(() => {
        setError('Camera access denied or not available. Type the code manually below.');
      });

    return () => {
      if (!stoppedRef.current) {
        stoppedRef.current = true;
        scanner.stop().catch(() => {});
      }
    };
  }, []);

  function handleManualSubmit(e) {
    e.preventDefault();
    if (manualCode.trim()) {
      if (scannerRef.current && !stoppedRef.current) {
        stoppedRef.current = true;
        scannerRef.current.stop().catch(() => {});
      }
      onScanRef.current(manualCode.trim());
    }
  }

  return (
    <div className="scanner-overlay">
      <div className="scanner-modal">
        <div className="scanner-header">
          <h3>Scan Barcode</h3>
          <button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        <div ref={containerRef} className="scanner-viewport" />
        {error && <p className="scanner-error">{error}</p>}
        <p className="scanner-hint">Point camera at product barcode</p>
        <form onSubmit={handleManualSubmit} className="manual-entry">
          <input
            className="input"
            placeholder="Or type barcode manually..."
            value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            autoFocus={!!error}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!manualCode.trim()}>
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
