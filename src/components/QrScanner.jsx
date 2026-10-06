import React from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Modal } from './ui.jsx';

export function shortQr(value, head = 12, tail = 6) {
  const s = String(value || '');
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}...${s.slice(-tail)}`;
}

function devLog(...args) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[QR]', ...args);
  }
}

function cameraMessage(err) {
  const msg = String(err?.message || err?.name || err || '');
  if (/NotAllowedError|Permission denied|permission/i.test(msg)) {
    return 'Kamera tidak dapat diakses. Izinkan akses kamera pada browser, lalu coba lagi.';
  }
  if (/NotFoundError|no camera|no video|OverconstrainedError/i.test(msg)) {
    return 'Tidak ada kamera yang cocok ditemukan pada perangkat ini.';
  }
  if (/NotReadableError|in use|being used|TrackStartError/i.test(msg)) {
    return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.';
  }
  if (/secure|SecureContext|getUserMedia/i.test(msg)) {
    return 'Browser memblokir kamera pada koneksi ini. Gunakan localhost atau HTTPS.';
  }
  return 'Kamera tidak dapat dibuka. Periksa izin browser lalu coba lagi.';
}

async function nativeSupported() {
  try {
    if (typeof window === 'undefined' || typeof window.BarcodeDetector !== 'function') return false;
    if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      return Array.isArray(formats) && formats.includes('qr_code');
    }
    return true;
  } catch {
    return false;
  }
}

export default function QrScanner({ title = 'Scan QR', hint = 'Arahkan kamera ke QR kartu.', onResult, onClose }) {
  const boxId = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const regionId = `qr-region-${boxId}`;
  const aliveRef = React.useRef(true);
  const doneRef = React.useRef(false);
  const stopRef = React.useRef(null);
  const [engine, setEngine] = React.useState('starting');
  const [error, setError] = React.useState('');
  const [slow, setSlow] = React.useState(false);

  React.useEffect(() => {
    aliveRef.current = true;
    doneRef.current = false;
    let cancelled = false;
    let slowTimer = 0;
    devLog('Scanner initialized');

    const finish = async (raw) => {
      if (doneRef.current) return;
      doneRef.current = true;
      window.clearTimeout(slowTimer);
      devLog('QR detected, decoded payload:', raw);
      try { await stopRef.current?.(); } catch { /* abaikan */ }
      if (aliveRef.current) onResult?.(String(raw || ''));
    };

    (async () => {
      const video = document.getElementById(`${regionId}-video`);
      try {
        if (await nativeSupported()) {
          devLog('Decoder: native BarcodeDetector');
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          try {
            const [track] = stream.getVideoTracks();
            await track?.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
            devLog('Autofocus: continuous');
          } catch {
            devLog('Autofocus: tidak didukung, lanjut tanpa autofocus');
          }
          if (!video) throw new Error('Video element missing');
          video.srcObject = stream;
          await video.play();
          devLog('Camera initialized', `${video.videoWidth}x${video.videoHeight}`);
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          let raf = 0;
          let last = 0;
          let frames = 0;
          stopRef.current = async () => {
            cancelAnimationFrame(raf);
            stream.getTracks().forEach((t) => t.stop());
            if (video) video.srcObject = null;
          };
          const loop = async (t) => {
            if (!aliveRef.current || doneRef.current || cancelled) return;
            if (t - last > 120 && video.readyState >= 2 && video.videoWidth > 0) {
              last = t;
              frames += 1;
              if (frames === 1) devLog('Scanning...');
              try {
                const codes = await detector.detect(video);
                const raw = codes && codes.length ? String(codes[0].rawValue || '') : '';
                if (raw) {
                  finish(raw);
                  return;
                }
              } catch (e) {
                devLog('Decoder frame error:', String(e?.message || e));
              }
            }
            raf = requestAnimationFrame(loop);
          };
          if (aliveRef.current && !cancelled) {
            setEngine('native');
            raf = requestAnimationFrame(loop);
          } else {
            await stopRef.current();
          }
          return;
        }
        throw new Error('native-unavailable');
      } catch (e) {
        if (String(e?.message) === 'native-unavailable') {
          devLog('Decoder: fallback html5-qrcode (ZXing)');
        } else {
          devLog('Native gagal, fallback html5-qrcode:', String(e?.message || e));
        }
        if (cancelled || doneRef.current) return;
        try {
          const scanner = new Html5Qrcode(regionId);
          stopRef.current = async () => {
            try { if (scanner.isScanning) await scanner.stop(); } catch { /* abaikan */ }
            try { scanner.clear(); } catch { /* abaikan */ }
          };
          const onOk = (decodedText) => finish(decodedText);
          const onFrameError = () => {};
          const config = { fps: 10 };
          try {
            await scanner.start({ facingMode: 'environment' }, config, onOk, onFrameError);
          } catch {
            if (doneRef.current) return;
            await scanner.start({ facingMode: 'user' }, config, onOk, onFrameError);
          }
          devLog('Camera initialized (fallback)');
          if (aliveRef.current && !cancelled) setEngine('zxing');
          else await stopRef.current();
        } catch (err) {
          if (aliveRef.current && !cancelled) {
            setEngine('error');
            setError(cameraMessage(err));
            devLog('Camera error:', String(err?.message || err));
          }
        }
      }
    })();

    slowTimer = window.setTimeout(() => {
      if (aliveRef.current && !doneRef.current) setSlow(true);
    }, 8000);

    return () => {
      cancelled = true;
      aliveRef.current = false;
      window.clearTimeout(slowTimer);
      const stop = stopRef.current;
      stopRef.current = null;
      (async () => {
        try { await stop?.(); } catch { /* abaikan */ }
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionId]);

  return (
    <Modal title={title} onClose={onClose} foot={<button className="btn" onClick={onClose}>Batal</button>}>
      <div className="qr-wrap">
        <div className="qr-view">
          <video id={`${regionId}-video`} className="qr-native" playsInline muted autoPlay style={{ display: engine === 'native' ? 'block' : 'none' }} />
          <div id={regionId} className="qr-region" style={{ display: engine === 'zxing' ? 'block' : 'none' }} />
          {(engine === 'native' || engine === 'zxing') && <div className="qr-frame" aria-hidden="true" />}
        </div>
        {engine === 'starting' && <p className="hint">Membuka kamera...</p>}
        {(engine === 'native' || engine === 'zxing') && !slow && <p className="hint">{hint}</p>}
        {(engine === 'native' || engine === 'zxing') && slow && (
          <p className="hint">Belum mendeteksi QR. Dekatkan kartu, pastikan QR terlihat penuh dan pencahayaan cukup.</p>
        )}
        {engine === 'error' && <div className="banner danger"><span>{error}</span></div>}
      </div>
    </Modal>
  );
}
