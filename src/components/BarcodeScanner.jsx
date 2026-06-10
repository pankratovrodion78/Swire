import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function BarcodeScanner({ onScan, onClose }) {
  const [error, setError] = useState('');
  const scannerRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const id = 'barcode-reader-' + Date.now();
    containerRef.current.id = id;
    const scanner = new Html5Qrcode(id);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
          scanner.stop().catch(() => {});
          onScan(decodedText);
        },
        () => {}
      )
      .catch((err) => {
        setError('Camera access denied or not available. You can type the code manually.');
      });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, [onScan]);

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
      </div>
    </div>
  );
}
