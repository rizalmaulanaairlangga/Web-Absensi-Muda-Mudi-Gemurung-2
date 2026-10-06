import React from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Modal } from './ui.jsx';

export function shortQr(value, head = 12, tail = 6) {
  const s = String(value || '');
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}...${s.slice(-tail)}`;
}

function cameraMessage(err) {
  const msg = String(err?.message || err || '');
  if (/NotAllowedError|Permission denied|permission/i.test(msg)) {
    return 'Kamera tidak dapat diakses. Izinkan akses kamera pada browser, lalu coba lagi.';
  }
  if (/NotFoundError|no camera|no video/i.test(msg)) {
    return 'Tidak ada kamera yang ditemukan pada perangkat ini.';
  }
  if (/NotReadableError|in use|being used/i.test(msg)) {
    return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.';
  }
  if (/secure|SecureContext|getUserMedia/i.test(msg)) {
    return 'Browser memblokir kamera pada koneksi ini. Gunakan localhost atau HTTPS.';
  }
  return 'Kamera tidak dapat dibuka. Periksa izin browser lalu coba lagi.';
}

export default function QrScanner({ title = 'Scan QR', hint = 'Arahkan kamera ke QR kartu.', onResult, onClose }) {
  const boxId = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const regionId = `qr-region-${boxId}`;
  const aliveRef = React.useRef(true);
  const scannerRef = React.useRef(null);
  const doneRef = React.useRef(false);
  const [status, setStatus] = React.useState('starting');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    aliveRef.current = true;
    doneRef.current = false;
    let cancelled = false;
    (async () => {
      try {
        const scanner = new Html5Qrcode(regionId);
        if (cancelled) return;
        scannerRef.current = scanner;
        const onOk = async (decodedText) => {
          if (doneRef.current) return;
          doneRef.current = true;
          try { await scanner.stop(); } catch { /* abaikan */ }
          try { scanner.clear(); } catch { /* abaikan */ }
          if (aliveRef.current) onResult?.(String(decodedText || ''));
        };
        const onFrameError = () => {};
        const config = { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 };
        try {
          await scanner.start({ facingMode: 'environment' }, config, onOk, onFrameError);
        } catch {
          if (doneRef.current) return;
          await scanner.start({ facingMode: 'user' }, config, onOk, onFrameError);
        }
        if (aliveRef.current && !cancelled) setStatus('scanning');
      } catch (e) {
        if (aliveRef.current && !cancelled) {
          setStatus('error');
          setError(cameraMessage(e));
        }
      }
    })();
    return () => {
      cancelled = true;
      aliveRef.current = false;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      (async () => {
        try {
          if (scanner && scanner.isScanning) await scanner.stop();
        } catch { /* abaikan */ }
        try { scanner?.clear(); } catch { /* abaikan */ }
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionId]);

  return (
    <Modal title={title} onClose={onClose} foot={<button className="btn" onClick={onClose}>Batal</button>}>
      <div className="qr-wrap">
        <div className="qr-view">
          <div id={regionId} className="qr-region" />
          {status === 'scanning' && <div className="qr-frame" aria-hidden="true" />}
        </div>
        {status === 'starting' && <p className="hint">Membuka kamera...</p>}
        {status === 'scanning' && <p className="hint">{hint}</p>}
        {status === 'error' && <div className="banner danger"><span>{error}</span></div>}
      </div>
    </Modal>
  );
}
