import { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { Printer, Download, Camera, QrCode, Search } from 'lucide-react';
import { Modal, InlineAlert } from './UiPrimitives';
import type { FireDoor } from '../types';

export default function QrCodeModal({
  door,
  onClose,
}: {
  door: FireDoor | null;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    if (!door) return;
    const payload = JSON.stringify({
      system: 'DoorProof AI',
      door_code: door.door_code,
      qr_token: door.qr_token,
      building: door.building_name,
      location: `${door.floor || ''} ${door.room_location}`,
      rating: door.fire_rating,
    });
    QRCode.toDataURL(payload, {
      width: 240,
      margin: 2,
      color: { dark: '#0b1324', light: '#ffffff' },
    })
      .then(setDataUrl)
      .catch(console.error);
  }, [door]);

  if (!door) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${door.door_code}-qr-label.png`;
    a.click();
  };

  return (
    <Modal
      open={Boolean(door)}
      onClose={onClose}
      title={`QR Asset Tag — ${door.door_code}`}
      subtitle="Affix to hinge-side frame edge for rapid mobile field inspection lookup"
      maxWidth="max-w-md"
    >
      <div className="flex flex-col items-center text-center">
        <div className="border-2 border-slate-900 rounded-2xl p-5 bg-white shadow-sm w-full max-w-[295px]">
          <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-blue-700">
            DoorProof AI Asset Tag
          </div>
          <div className="text-lg font-mono font-bold text-slate-950 mt-0.5">{door.door_code}</div>
          {dataUrl && (
            <img src={dataUrl} alt={`QR for ${door.door_code}`} className="w-48 h-48 mx-auto my-2" />
          )}
          <div className="text-xs font-semibold text-slate-900">{door.building_name}</div>
          <div className="text-xs text-slate-500">
            {door.floor} • {door.room_location}
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-200 flex items-center justify-between text-[11px] font-mono text-slate-600">
            <span>Rating: {door.fire_rating}</span>
            <span>{door.door_type}</span>
          </div>
          <div className="text-[10px] font-mono text-slate-400 mt-1 truncate">{door.qr_token}</div>
        </div>

        <div className="flex items-center gap-2.5 mt-5 w-full">
          <button
            onClick={handleDownload}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium rounded-xl dp-btn-primary"
          >
            <Download className="w-3.5 h-3.5" />
            Download PNG
          </button>
          <button
            onClick={() => window.print()}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium rounded-xl dp-btn-glass"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Tag
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Mobile & Desktop QR Scanner Modal — uses native camera + BarcodeDetector when available,
 * plus instant handheld scanner / manual token lookup fallback.
 */
export function QrScannerModal({
  open,
  onClose,
  doors,
  onMatch,
}: {
  open: boolean;
  onClose: () => void;
  doors: FireDoor[];
  onMatch: (door: FireDoor) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);

  const resolvePayload = (raw: string) => {
    const cleaned = raw.trim();
    let token = cleaned;
    let code = cleaned;
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed.qr_token) token = parsed.qr_token;
      if (parsed.door_code) code = parsed.door_code;
    } catch {
      // plain text scan
    }
    const found = doors.find(
      (d) =>
        d.qr_token.toLowerCase() === token.toLowerCase() ||
        d.door_code.toLowerCase() === code.toLowerCase() ||
        d.door_code.toLowerCase() === cleaned.toLowerCase()
    );
    if (found) {
      onMatch(found);
      onClose();
    } else {
      setScanError(`No registered fire door matched "${cleaned}".`);
    }
  };

  useEffect(() => {
    if (!open) {
      setCameraActive(false);
      setCameraError(null);
      setScanError(null);
      setManualCode('');
      return;
    }
    let stream: MediaStream | null = null;
    let rafId = 0;

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera access is unavailable in this browser. Use manual or USB QR entry below.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraActive(true);
        }
        const Detector = (window as any).BarcodeDetector;
        if (Detector) {
          const detector = new Detector({ formats: ['qr_code'] });
          const scanLoop = async () => {
            if (!videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes?.[0]?.rawValue) {
                resolvePayload(codes[0].rawValue);
                return;
              }
            } catch {
              // ignore frame read errors
            }
            rafId = requestAnimationFrame(scanLoop);
          };
          rafId = requestAnimationFrame(scanLoop);
        } else {
          setCameraError(
            'Live camera active — native BarcodeDetector is not enabled in this browser; scan with a handheld barcode reader or enter the Door ID / QR Token below.'
          );
        }
      } catch {
        setCameraError('Camera permission was declined or no camera detected. Enter Door ID or QR token below.');
      }
    };

    startCamera();

    return () => {
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Scan Fire Door QR Tag"
      subtitle="Point your mobile camera at a DoorProof AI tag or scan via handheld scanner"
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-[4/3] flex items-center justify-center border border-slate-800">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          {!cameraActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
              <Camera className="w-8 h-8 mb-2 opacity-60" />
              <span className="text-xs">Camera viewfinder</span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-8 border-2 border-blue-400/70 rounded-xl shadow-[0_0_0_999px_rgba(15,23,42,0.38)]" />
        </div>

        {cameraError && <InlineAlert type="info" message={cameraError} />}
        {scanError && <InlineAlert type="error" message={scanError} onDismiss={() => setScanError(null)} />}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (manualCode.trim()) resolvePayload(manualCode);
          }}
          className="space-y-2.5"
        >
          <label className="block text-xs font-medium text-slate-700">
            Handheld Scanner / Manual Door ID or QR Token
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <QrCode className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="FD-1001 or DP-111111-FD-1001-..."
                className="w-full pl-9 pr-3 py-2 text-xs font-mono rounded-lg dp-input"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg dp-btn-blue"
            >
              <Search className="w-3.5 h-3.5" />
              Lookup
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
