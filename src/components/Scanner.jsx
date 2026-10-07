import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Camera, 
  FlipHorizontal, 
  Zap, 
  ZapOff, 
  Upload, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw,
  Scan,
  Maximize2,
  Sliders
} from 'lucide-react';
import { detectCardCorners, CARD_ASPECT_RATIO } from '../utils/cardDetection';
import { soundManager } from '../utils/audio';

export default function Scanner({ onCardCaptured, isProcessing, ocrProgress, statusMessage }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const fileInputRef = useRef(null);

  // States
  const [hasCamera, setHasCamera] = useState(true);
  const [cameraError, setCameraError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' (back) or 'user' (front)
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [scanMode, setScanMode] = useState('button'); // 'auto' (à la volée), 'button' (bouton), 'upload' (fichier)
  const [autoScanCountdown, setAutoScanCountdown] = useState(0); // 0 to 100%
  const [isStable, setIsStable] = useState(false);
  const stabilityTimerRef = useRef(null);
  const autoScanActiveRef = useRef(false);

  // Start Camera Stream
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }

      const constraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Check for torch capability
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      setHasTorch(!!capabilities.torch);
      setHasCamera(true);
    } catch (err) {
      console.warn("Camera access failed:", err);
      setHasCamera(false);
      setCameraError(err.message || "Impossible d'accéder à la caméra. Vérifiez les autorisations du navigateur.");
    }
  }, [facingMode]);

  // Toggle Torch
  const toggleTorch = async () => {
    if (!videoRef.current || !videoRef.current.srcObject) return;
    const track = videoRef.current.srcObject.getVideoTracks()[0];
    if (track && hasTorch) {
      try {
        const nextState = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState }]
        });
        setTorchOn(nextState);
      } catch (e) {
        console.warn("Torch failed:", e);
      }
    }
  };

  // Flip Camera
  const toggleCameraFacing = () => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Initialize camera on mount and when facing mode changes
  useEffect(() => {
    startCamera();
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [startCamera]);

  // Capture current video frame to high-resolution Canvas
  const captureFrame = useCallback(() => {
    if (!videoRef.current || isProcessing) return null;
    soundManager.playSnap();

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Detect card corners
    const corners = detectCardCorners(canvas);

    onCardCaptured({
      sourceCanvas: canvas,
      detectedCorners: corners
    });
  }, [isProcessing, onCardCaptured]);

  // Auto-Scan ("À la volée") Stability Loop
  useEffect(() => {
    if (scanMode !== 'auto' || isProcessing || !hasCamera) {
      setAutoScanCountdown(0);
      return;
    }

    let count = 0;
    const interval = setInterval(() => {
      count += 10;
      setAutoScanCountdown(Math.min(100, count));
      soundManager.playScanTick();

      if (count >= 100) {
        clearInterval(interval);
        setAutoScanCountdown(0);
        captureFrame();
      }
    }, 150);

    return () => clearInterval(interval);
  }, [scanMode, isProcessing, hasCamera, captureFrame]);

  // Handle File Upload from Disk/Gallery
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    soundManager.playSnap();
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const corners = detectCardCorners(canvas);
        onCardCaptured({
          sourceCanvas: canvas,
          detectedCorners: corners
        });
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col items-center justify-center p-3 sm:p-6 max-w-4xl mx-auto w-full">
      
      {/* Mode Switcher */}
      <div className="w-full flex items-center justify-between mb-4 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setScanMode('button')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              scanMode === 'button'
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Mode Bouton</span>
          </button>

          <button
            onClick={() => setScanMode('auto')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              scanMode === 'auto'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>À la volée (Auto)</span>
          </button>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-colors"
        >
          <Upload className="w-3.5 h-3.5 text-blue-400" />
          <span>Importer photo</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>

      {/* Main Viewfinder Box */}
      <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] max-h-[65vh] rounded-3xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-2xl flex items-center justify-center group">
        
        {/* Camera Stream */}
        {hasCamera && !cameraError ? (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400 max-w-md">
            <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
            <h3 className="text-white font-bold text-base mb-1">Caméra indisponible</h3>
            <p className="text-xs text-slate-400 mb-4">{cameraError || "Veuillez autoriser l'accès à la caméra pour scanner vos cartes en direct."}</p>
            <div className="flex gap-2">
              <button
                onClick={startCamera}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold border border-slate-700"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Réessayer</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Importer une photo</span>
              </button>
            </div>
          </div>
        )}

        {/* Holographic Card Target HUD Overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <div 
            className="relative w-full max-w-[280px] sm:max-w-[320px] aspect-[63/88] rounded-2xl border-2 border-dashed border-red-500/50 flex flex-col justify-between p-3 transition-all duration-300"
            style={{
              boxShadow: scanMode === 'auto' 
                ? '0 0 30px rgba(245, 158, 11, 0.2), inset 0 0 20px rgba(245, 158, 11, 0.1)'
                : '0 0 30px rgba(239, 68, 68, 0.2), inset 0 0 20px rgba(239, 68, 68, 0.1)'
            }}
          >
            {/* 4 Corner Reticles */}
            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-red-500 rounded-tl-lg" />
            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-red-500 rounded-tr-lg" />
            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-red-500 rounded-bl-lg" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-red-500 rounded-br-lg" />

            {/* Target Header Guide */}
            <div className="w-full flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-slate-950/80 text-red-400 border border-red-500/30">
                Aligner Nom & PV
              </span>
              <span className="text-[10px] text-white/70 bg-slate-950/80 px-1.5 py-0.5 rounded font-mono">
                63x88mm
              </span>
            </div>

            {/* Laser Scan Line Animation */}
            {!isProcessing && (
              <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_12px_#ef4444] animate-scan" />
            )}

            {/* Target Footer Guide */}
            <div className="w-full flex items-center justify-center">
              <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-slate-950/80 text-red-400 border border-red-500/30">
                Numéro & Symbole Série
              </span>
            </div>
          </div>
        </div>

        {/* Top Controls Overlay on Video (Torch, Flip Camera) */}
        {hasCamera && (
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {hasTorch && (
              <button
                onClick={toggleTorch}
                title="Activer/Désactiver le flash"
                className={`p-2.5 rounded-full backdrop-blur-md transition-all shadow-lg ${
                  torchOn
                    ? 'bg-amber-400 text-slate-950 font-bold'
                    : 'bg-slate-900/80 text-white hover:bg-slate-800'
                }`}
              >
                {torchOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
              </button>
            )}

            <button
              onClick={toggleCameraFacing}
              title="Changer de caméra"
              className="p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white backdrop-blur-md transition-all shadow-lg"
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Live Status Toast / OCR Progress Bar */}
        {isProcessing && (
          <div className="absolute inset-0 backdrop-blur-sm bg-slate-950/80 flex flex-col items-center justify-center p-6 z-20">
            <div className="relative w-16 h-16 mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
              <div 
                className="absolute inset-0 rounded-full border-4 border-red-500 border-t-transparent animate-spin"
              />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white font-mono">
                {Math.round(ocrProgress * 100)}%
              </div>
            </div>
            <h4 className="text-white font-bold text-sm mb-1 animate-pulse">
              {statusMessage || "Analyse de la carte en cours..."}
            </h4>
            <p className="text-[11px] text-slate-400 text-center max-w-xs">
              Recadrage, reconnaissance des caractères et recherche dans la base TCGdex...
            </p>
          </div>
        )}
      </div>

      {/* Bottom Capture Controls Bar */}
      <div className="w-full flex items-center justify-center gap-6 mt-6">
        {scanMode === 'button' ? (
          <button
            onClick={captureFrame}
            disabled={isProcessing || !hasCamera}
            className="group relative flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-tr from-red-600 to-rose-500 p-1.5 shadow-2xl shadow-red-600/50 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center border-2 border-white/80 group-hover:bg-slate-900 transition-colors">
              <div className="w-8 h-8 rounded-full bg-red-600 border border-white/60 shadow-inner flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-white group-hover:scale-110 transition-transform" />
              </div>
            </div>
          </button>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="relative w-16 h-16 rounded-full bg-slate-900 border-2 border-amber-500/60 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-800"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-amber-500 transition-all duration-150"
                  strokeDasharray={`${autoScanCountdown}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <Sparkles className="absolute w-6 h-6 text-amber-400 animate-pulse" />
            </div>
            <span className="text-xs font-bold text-amber-400">
              Scan à la volée actif
            </span>
          </div>
        )}
      </div>

      {/* Helpful Scanning Tips Banner */}
      <div className="mt-6 w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-slate-400 text-xs">
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-base">💡</span>
          <span>Bonne lumière sans reflet direct</span>
        </div>
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-base">📐</span>
          <span>Tenir la carte bien droite dans le cadre</span>
        </div>
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-base">🔍</span>
          <span>Numéro du bas bien visible</span>
        </div>
      </div>
    </div>
  );
}
