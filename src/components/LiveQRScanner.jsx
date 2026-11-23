import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  RefreshCw,
  Upload,
  StopCircle,
  AlertCircle,
  Smartphone,
  CheckCircle2,
  Link2,
  ShieldCheck
} from 'lucide-react';

/**
 * Multi-Scale + Center-Crop + High-Contrast QR Decoder for iPhone/Android Native Camera Photos
 */
export async function decodeQrFromImageFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        // 1. Try native BarcodeDetector first if supported
        if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
          try {
            const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
            const codes = await detector.detect(img);
            if (codes && codes.length > 0 && codes[0].rawValue) {
              resolve(codes[0].rawValue);
              return;
            }
          } catch {
            // Fall through to multi-scale jsQR
          }
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // 2. Multi-scale full-frame scan (handles 12MP/48MP iPhone HEIC/JPEG photos)
        const scales = [1400, 1000, 720, 500, 360];
        for (const maxDim of scales) {
          const ratio = Math.min(1, maxDim / Math.max(img.width, img.height, 1));
          const w = Math.max(1, Math.round(img.width * ratio));
          const h = Math.max(1, Math.round(img.height * ratio));
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);

          const imgData = ctx.getImageData(0, 0, w, h);
          const qr = jsQR(imgData.data, w, h, { inversionAttempts: 'attemptBoth' });
          if (qr && qr.data) {
            resolve(qr.data);
            return;
          }

          // High-contrast binarized pass at 720px & 500px to cut through screen glare
          if (maxDim === 720 || maxDim === 500) {
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
              const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              const bin = lum > 128 ? 255 : 0;
              data[i] = bin;
              data[i + 1] = bin;
              data[i + 2] = bin;
            }
            const qrBin = jsQR(data, w, h, { inversionAttempts: 'attemptBoth' });
            if (qrBin && qrBin.data) {
              resolve(qrBin.data);
              return;
            }
          }
        }

        // 3. Center-crop scan (65% central window for iPhone photos taken slightly far away)
        const cropRatios = [0.65, 0.45];
        for (const crop of cropRatios) {
          const sx = Math.round(img.width * ((1 - crop) / 2));
          const sy = Math.round(img.height * ((1 - crop) / 2));
          const sw = Math.max(1, Math.round(img.width * crop));
          const sh = Math.max(1, Math.round(img.height * crop));
          canvas.width = 720;
          canvas.height = 720;
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 720, 720);
          const cropData = ctx.getImageData(0, 0, 720, 720);
          const qrCrop = jsQR(cropData.data, 720, 720, { inversionAttempts: 'attemptBoth' });
          if (qrCrop && qrCrop.data) {
            resolve(qrCrop.data);
            return;
          }
        }

        resolve(null);
      };
      img.onerror = () => resolve(null);
      img.src = reader.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export default function LiveQRScanner({
  onQrDecoded,
  onUploadFile,
  onLookupCandidate
}) {
  const canUseWebRTC =
    typeof window !== 'undefined' &&
    Boolean(window.isSecureContext) &&
    Boolean(navigator?.mediaDevices?.getUserMedia);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [nativeFallbackMode, setNativeFallbackMode] = useState(!canUseWebRTC);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' | 'user'
  const [cameraError, setCameraError] = useState('');
  const [scanFeedback, setScanFeedback] = useState('');
  const [streamReady, setStreamReady] = useState(false);
  const [decodingPhoto, setDecodingPhoto] = useState(false);
  const [manualLookupInput, setManualLookupInput] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const fileInputRef = useRef(null);
  const nativeCameraInputRef = useRef(null);

  const stopActiveStream = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreamReady(false);
  }, []);

  // React StrictMode-safe camera lifecycle
  useEffect(() => {
    if (!scannerOpen) {
      stopActiveStream();
      return;
    }

    const secureNow =
      typeof window !== 'undefined' &&
      Boolean(window.isSecureContext) &&
      Boolean(navigator?.mediaDevices?.getUserMedia);

    if (!secureNow) {
      setNativeFallbackMode(true);
      setStreamReady(false);
      return;
    }

    let cancelled = false;
    let barcodeDetector = null;
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch {
        barcodeDetector = null;
      }
    }

    async function initCamera() {
      setCameraError('');
      setStreamReady(false);
      setNativeFallbackMode(false);
      stopActiveStream();

      let stream = null;
      try {
        const primaryConstraints = selectedDeviceId
          ? { video: { deviceId: { exact: selectedDeviceId } }, audio: false }
          : {
              video: {
                facingMode: { ideal: facingMode },
                width: { ideal: 640 },
                height: { ideal: 640 }
              },
              audio: false
            };
        stream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch {
          if (!cancelled) {
            setNativeFallbackMode(true);
            setStreamReady(false);
          }
          return;
        }
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        if (!cancelled) {
          setCameraDevices(videoInputs);
          const activeTrack = stream.getVideoTracks()[0];
          const activeDeviceId = activeTrack?.getSettings?.()?.deviceId;
          if (activeDeviceId && !selectedDeviceId) {
            setSelectedDeviceId(activeDeviceId);
          }
        }
      } catch {
        // ignore enumeration error
      }

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        try {
          await video.play();
          if (!cancelled) setStreamReady(true);
        } catch {
          // onLoadedMetadata will trigger play
        }
      }

      let lastCheck = 0;
      const scanFrame = async (now) => {
        if (cancelled || !videoRef.current) return;
        const video = videoRef.current;

        if (now - lastCheck > 160 && video.readyState >= 2 && video.videoWidth > 0) {
          lastCheck = now;

          if (barcodeDetector) {
            try {
              const barcodes = await barcodeDetector.detect(video);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                const rawVal = barcodes[0].rawValue;
                stopActiveStream();
                setScannerOpen(false);
                setScanFeedback('QR code decoded from live camera stream.');
                if (onQrDecoded) onQrDecoded(rawVal);
                return;
              }
            } catch {
              // Fall through to jsQR
            }
          }

          if (canvasRef.current) {
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const qr = jsQR(imgData.data, imgData.width, imgData.height, {
              inversionAttempts: 'attemptBoth'
            });
            if (qr && qr.data) {
              stopActiveStream();
              setScannerOpen(false);
              setScanFeedback('QR code decoded from live camera stream.');
              if (onQrDecoded) onQrDecoded(qr.data);
              return;
            }
          }
        }

        rafRef.current = requestAnimationFrame(scanFrame);
      };

      rafRef.current = requestAnimationFrame(scanFrame);
    }

    initCamera();

    return () => {
      cancelled = true;
      stopActiveStream();
    };
  }, [scannerOpen, selectedDeviceId, facingMode, stopActiveStream, onQrDecoded]);

  const handleFlipCamera = () => {
    if (cameraDevices.length > 1) {
      const idx = cameraDevices.findIndex((d) => d.deviceId === selectedDeviceId);
      const nextIdx = (idx + 1) % cameraDevices.length;
      setSelectedDeviceId(cameraDevices[nextIdx].deviceId);
    } else {
      setSelectedDeviceId('');
      setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    }
  };

  const handleNativeCameraPhotoCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraError('');
    setScanFeedback('');
    setDecodingPhoto(true);

    try {
      const decoded = await decodeQrFromImageFile(file);
      if (decoded) {
        setScanFeedback('QR code decoded from camera capture.');
        setScannerOpen(false);
        if (onQrDecoded) onQrDecoded(decoded);
      } else if (onUploadFile) {
        onUploadFile({ target: { files: [file], value: '' } });
      } else {
        setCameraError('No QR code detected in the photo. Please center the QR code and try again.');
      }
    } finally {
      setDecodingPhoto(false);
      e.target.value = '';
    }
  };

  const handleManualLookupSubmit = (e) => {
    e.preventDefault();
    const q = manualLookupInput.trim();
    if (!q) return;
    setCameraError('');
    setScanFeedback('');
    if (onLookupCandidate) {
      onLookupCandidate(q);
    } else if (onQrDecoded) {
      onQrDecoded(q);
    }
  };

  return (
    <div className="linkedin-card p-4 sm:p-5 space-y-4">
      {/* Top Action Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-base text-[#191919] dark:text-white">
            Candidate QR &amp; Cryptographic Verification Station
          </h2>
          <p className="text-xs text-[#666666] dark:text-[#8B949E]">
            Scan candidate QR code, capture via mobile camera, or paste a Candidate Portfolio Link / DID
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!canUseWebRTC ? (
            <button
              type="button"
              onClick={() => nativeCameraInputRef.current?.click()}
              disabled={decodingPhoto}
              className="linkedin-btn-primary text-xs py-2 px-4"
            >
              <Smartphone className="w-4 h-4" />
              <span>{decodingPhoto ? 'Decoding QR...' : 'Open iPhone Camera to Scan QR'}</span>
            </button>
          ) : !scannerOpen ? (
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="linkedin-btn-primary text-xs py-2 px-4"
            >
              <Camera className="w-4 h-4" />
              <span>Scan QR Camera</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setScannerOpen(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-red-600 text-white"
            >
              <StopCircle className="w-4 h-4" />
              <span>Close Camera</span>
            </button>
          )}

          {canUseWebRTC && (
            <button
              type="button"
              onClick={() => nativeCameraInputRef.current?.click()}
              disabled={decodingPhoto}
              className="linkedin-btn-outline text-xs py-1.5 px-3.5"
            >
              <Smartphone className="w-4 h-4" />
              <span>{decodingPhoto ? 'Decoding...' : 'Open iPhone Camera to Scan QR'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="linkedin-btn-outline text-xs py-1.5 px-3.5"
          >
            <Upload className="w-4 h-4" />
            <span>Upload QR / JSON</span>
          </button>

          <input
            ref={nativeCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleNativeCameraPhotoCapture}
            className="hidden"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/json,.json"
            onChange={onUploadFile}
            className="hidden"
          />
        </div>
      </div>

      {/* Paste Candidate Portfolio Link, DID, or Verification Code */}
      <form
        onSubmit={handleManualLookupSubmit}
        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1"
      >
        <div className="relative flex-1">
          <Link2 className="w-4 h-4 text-[#666666] dark:text-[#8B949E] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Paste Candidate Portfolio Link, DID (did:trusttrace:...), Student ID, or Verification Code..."
            value={manualLookupInput}
            onChange={(e) => setManualLookupInput(e.target.value)}
            className="linkedin-input pl-9 text-xs py-2"
          />
        </div>
        <button
          type="submit"
          className="linkedin-btn-primary text-xs py-2 px-4 shrink-0"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Verify Candidate</span>
        </button>
      </form>

      {/* WHEN BLOCKED BY HTTP LAN OR PERMISSION: Render clean Native iPhone Camera Card (NEVER a black box!) */}
      {(scannerOpen && nativeFallbackMode) || !canUseWebRTC ? (
        <div className="p-4 rounded-xl bg-[#F4F2EE] dark:bg-[#0D1117] border border-[#E0DFDC] dark:border-[#30363D] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0A66C2]/10 text-[#0A66C2] flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[#191919] dark:text-white">
                iPhone / Mobile Hardware Camera Ready
              </h3>
              <p className="text-xs text-[#666666] dark:text-[#8B949E] mt-0.5">
                Tap below to snap the QR code directly with your native iPhone camera for instant verification.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => nativeCameraInputRef.current?.click()}
            disabled={decodingPhoto}
            className="linkedin-btn-primary text-xs py-2.5 px-5 shrink-0 w-full sm:w-auto"
          >
            <Camera className="w-4 h-4" />
            <span>{decodingPhoto ? 'Decoding Photo...' : 'Open iPhone Camera to Scan QR'}</span>
          </button>
        </div>
      ) : null}

      {/* LIVE WEBRTC CAMERA QR VIEWPORT */}
      {scannerOpen && !nativeFallbackMode && canUseWebRTC && (
        <div className="p-4 rounded-xl bg-[#F4F2EE] dark:bg-[#0D1117] border border-[#E0DFDC] dark:border-[#30363D] flex flex-col items-center space-y-3">
          <div className="w-full max-w-sm flex items-center justify-between gap-2">
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="linkedin-input text-xs py-1.5 flex-1"
            >
              {cameraDevices.length === 0 ? (
                <option value="">Default Camera ({facingMode === 'environment' ? 'Back' : 'Front'})</option>
              ) : (
                cameraDevices.map((dev, idx) => (
                  <option key={dev.deviceId || idx} value={dev.deviceId}>
                    {dev.label || `Camera ${idx + 1}`}
                  </option>
                ))
              )}
            </select>

            <button
              type="button"
              onClick={handleFlipCamera}
              className="linkedin-btn-neutral text-xs py-1.5 px-3 shrink-0"
              title="Flip Front/Back Camera"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Flip Camera</span>
            </button>
          </div>

          <div className="relative w-full max-w-sm aspect-square rounded-xl overflow-hidden bg-black border-2 border-[#0A66C2] shadow-md flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => {
                videoRef.current?.play().catch(() => {});
                setStreamReady(true);
              }}
              className="w-full aspect-square max-w-sm rounded-xl object-cover bg-black"
            />
            <div className="absolute inset-10 border-2 border-dashed border-white/70 rounded-xl pointer-events-none" />
            {!streamReady && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-xs font-medium">
                Starting camera stream...
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {scanFeedback && (
        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{scanFeedback}</span>
        </div>
      )}

      {cameraError && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{cameraError}</span>
        </div>
      )}
    </div>
  );
}
