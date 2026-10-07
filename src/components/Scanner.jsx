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
  Sliders, 
  Layers, 
  Play, 
  Square, 
  Pause, 
  Coins, 
  Flame, 
  Check,
  Sun,
  SunMedium
} from 'lucide-react';
import { 
  detectCardCorners, 
  CARD_ASPECT_RATIO, 
  warpPerspective,
  analyzeLightingLevel,
  autoEnhanceLighting
} from '../utils/cardDetection';
import { soundManager } from '../utils/audio';
import { ocrService } from '../utils/ocrService';
import { searchCard, getCardCategoryInfo } from '../utils/tcgApi';

export default function Scanner({ 
  onCardCaptured, 
  onFinishBatchSession, 
  isProcessing, 
  ocrProgress, 
  statusMessage 
}) {
  const videoRef = useRef(null);
  const motionCanvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // General Camera States
  const [hasCamera, setHasCamera] = useState(true);
  const [cameraError, setCameraError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' or 'user'
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

  // Real-Time Dynamic Header (Nom + PV/PC) Detection in Standby
  const [liveHeaderScan, setLiveHeaderScan] = useState({
    name: '',
    hp: '',
    isSearching: false,
    lastScannedTime: 0
  });
  const isLiveScanningRef = useRef(false);

  // Ambient Lighting Metering State
  const [lightingInfo, setLightingInfo] = useState({ 
    state: 'optimal', 
    label: 'Lumière Optimale', 
    color: '#10b981', 
    needsBoost: false, 
    mean: 128 
  });

  // Scan Modes: 'button' | 'auto' | 'batch3d'
  const [scanMode, setScanMode] = useState('batch3d'); 
  const [autoScanCountdown, setAutoScanCountdown] = useState(0);

  // 3D Tower Batch Scanning States
  const [batchStatus, setBatchStatus] = useState('idle'); // 'idle' | 'running' | 'paused'
  const [batchCards, setBatchCards] = useState([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [lastScannedCard, setLastScannedCard] = useState(null);
  const [motionIndicator, setMotionIndicator] = useState('attente'); // 'attente' | 'chute' | 'analyse'

  // Refs for motion tracking
  const prevFrameDataRef = useRef(null);
  const motionDetectedRef = useRef(false);
  const stillnessFramesRef = useRef(0);
  const lastCaptureTimeRef = useRef(0);
  const batchQueueRef = useRef([]);

  // Start Camera Stream with Continuous Auto-Exposure Constraints
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
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          advanced: [
            { exposureMode: 'continuous' },
            { whiteBalanceMode: 'continuous' },
            { focusMode: 'continuous' }
          ]
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      
      // Attempt hardware dynamic auto exposure & focus locking
      try {
        const adv = {};
        if (capabilities.exposureMode?.includes('continuous')) adv.exposureMode = 'continuous';
        if (capabilities.whiteBalanceMode?.includes('continuous')) adv.whiteBalanceMode = 'continuous';
        if (capabilities.focusMode?.includes('continuous')) adv.focusMode = 'continuous';
        if (Object.keys(adv).length > 0) {
          await track.applyConstraints({ advanced: [adv] });
        }
      } catch (e) {}

      setHasTorch(!!capabilities.torch);
      setHasCamera(true);
    } catch (err) {
      console.warn("Camera access failed:", err);
      setHasCamera(false);
      setCameraError(err.message || "Impossible d'accéder à la caméra. Vérifiez les autorisations.");
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
        console.warn("Torch error:", e);
      }
    }
  };

  const toggleCameraFacing = () => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, [startCamera]);

  // Real-Time Ambient Lighting Monitoring Loop
  useEffect(() => {
    if (!hasCamera || cameraError) return;
    const interval = setInterval(() => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const v = videoRef.current;
        const meterCanvas = document.createElement('canvas');
        meterCanvas.width = 120;
        meterCanvas.height = 120;
        const mCtx = meterCanvas.getContext('2d', { willReadFrequently: true });
        mCtx.drawImage(
          v, 
          v.videoWidth * 0.2, 
          v.videoHeight * 0.2, 
          v.videoWidth * 0.6, 
          v.videoHeight * 0.6, 
          0, 
          0, 
          120, 
          120
        );
        const info = analyzeLightingLevel(meterCanvas);
        setLightingInfo(info);
      } catch (e) {}
    }, 1200);

    return () => clearInterval(interval);
  }, [hasCamera, cameraError]);

  // Standby Real-Time Name & PV / HP Detection Loop (Cadre Bleu Dynamique)
  useEffect(() => {
    if (!hasCamera || cameraError || isProcessing) return;

    const interval = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2 || isProcessing || isLiveScanningRef.current) return;
      if (scanMode === 'batch3d' && batchStatus === 'running') return; // 3D batch mode handles its own triggers

      const video = videoRef.current;
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;

      // The card is centered in video viewport with aspect ratio 63/88:
      const cardH = vh * 0.70;
      const cardW = cardH * (63 / 88);
      const cardTopY = Math.max(0, (vh - cardH) / 2);
      const cardLeftX = Math.max(0, (vw - cardW) / 2);

      // Extract strictly the TOP BANNER of the card (where Name and HP/PV are printed)
      const cropW = Math.min(vw - 10, Math.floor(cardW * 0.96));
      const cropH = Math.min(vh - 10, Math.floor(cardH * 0.20));
      const cropX = Math.min(vw - cropW, Math.floor(cardLeftX + cardW * 0.02));
      const cropY = Math.min(vh - cropH, Math.floor(cardTopY + cardH * 0.02));

      try {
        isLiveScanningRef.current = true;
        setLiveHeaderScan(prev => ({ ...prev, isSearching: true }));

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = cropW;
        tempCanvas.height = cropH;
        const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        const enhanced = autoEnhanceLighting(tempCanvas, 0.9);
        const res = await ocrService.scanHeaderLive(enhanced);

        if (res && (res.name || res.hp)) {
          setLiveHeaderScan({
            name: res.name || '',
            hp: res.hp || '',
            stage: res.stage || '',
            isSearching: false,
            lastScannedTime: Date.now()
          });
        } else {
          setLiveHeaderScan(prev => ({ ...prev, isSearching: false }));
        }
      } catch (err) {
        setLiveHeaderScan(prev => ({ ...prev, isSearching: false }));
      } finally {
        isLiveScanningRef.current = false;
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [hasCamera, cameraError, isProcessing, scanMode, batchStatus]);

  // Single Frame Capture (for Button & Auto Modes) with Auto-Lighting Equalizer
  const captureFrame = useCallback(() => {
    if (!videoRef.current || isProcessing) return null;
    soundManager.playSnap();

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Apply Dynamic Tone Mapping & Shadow Equalizer
    const enhancedCanvas = autoEnhanceLighting(canvas, 0.85);
    const corners = detectCardCorners(enhancedCanvas);

    onCardCaptured({
      sourceCanvas: enhancedCanvas,
      detectedCorners: corners
    });
  }, [isProcessing, onCardCaptured]);

  // Handle Standard Auto-Scan Mode Countdown
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

  // Process Background Queue for 3D Tower Batch Mode
  const processBatchQueue = useCallback(async () => {
    if (batchQueueRef.current.length === 0) {
      setIsProcessingQueue(false);
      return;
    }

    setIsProcessingQueue(true);
    const item = batchQueueRef.current.shift();
    setQueueCount(batchQueueRef.current.length);

    try {
      // 1. Equalize ambient lighting & lift dark shadows
      const enhancedCanvas = autoEnhanceLighting(item.canvas, 0.85);
      
      // 2. Warp Perspective with Auto Corners
      const corners = detectCardCorners(enhancedCanvas);
      const warped = warpPerspective(enhancedCanvas, corners, 630, 880);
      const userPhoto = warped.toDataURL('image/jpeg', 0.82);

      // 3. Run OCR in background
      const ocrRes = await ocrService.scanCard(warped);

      // 4. Query TCGdex
      const searchRes = await searchCard({
        primaryName: ocrRes.primaryName,
        candidateWords: ocrRes.candidateWords,
        extractedNumbers: ocrRes.extractedNumbers,
        localId: ocrRes.localId,
        totalInSet: ocrRes.totalInSet,
        setCode: ocrRes.setCode
      });

      if (searchRes && searchRes.bestMatch) {
        const cardMatch = searchRes.bestMatch;
        const price = Number(cardMatch.pricing?.estimatedEur || 0);

        if (price >= 5) {
          soundManager.playRareFanfare();
        } else {
          soundManager.playCoinDing();
        }

        const newEntry = {
          card: cardMatch,
          userPhoto,
          timestamp: new Date().toISOString()
        };

        setBatchCards(prev => [newEntry, ...prev]);
        setLastScannedCard(newEntry);
      }
    } catch (err) {
      console.warn("Batch queue card process error:", err);
    }

    // Continue queue
    setTimeout(() => {
      processBatchQueue();
    }, 100);
  }, []);

  // 3D Tower Real-Time Motion & Card Drop Detector Loop
  useEffect(() => {
    if (scanMode !== 'batch3d' || batchStatus !== 'running' || !hasCamera) return;

    let animId;
    const sampleW = 48;
    const sampleH = 48;
    let sampleCanvas = motionCanvasRef.current;
    if (!sampleCanvas) {
      sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = sampleW;
      sampleCanvas.height = sampleH;
      motionCanvasRef.current = sampleCanvas;
    }
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

    const checkMotionLoop = () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        animId = requestAnimationFrame(checkMotionLoop);
        return;
      }

      const video = videoRef.current;
      // Sample central 60% drop zone
      const cropX = video.videoWidth * 0.2;
      const cropY = video.videoHeight * 0.2;
      const cropW = video.videoWidth * 0.6;
      const cropH = video.videoHeight * 0.6;

      sampleCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, sampleW, sampleH);
      const imgData = sampleCtx.getImageData(0, 0, sampleW, sampleH);
      const d = imgData.data;

      if (prevFrameDataRef.current) {
        const prev = prevFrameDataRef.current;
        let diffSum = 0;
        const totalPixels = sampleW * sampleH;

        for (let i = 0; i < totalPixels; i++) {
          const idx = i * 4;
          const lumCur = (d[idx] * 299 + d[idx + 1] * 587 + d[idx + 2] * 114) >> 10;
          const lumPrev = (prev[idx] * 299 + prev[idx + 1] * 587 + prev[idx + 2] * 114) >> 10;
          diffSum += Math.abs(lumCur - lumPrev);
        }

        const mad = diffSum / totalPixels; // Mean Absolute Difference
        const now = Date.now();
        const timeSinceLastSnap = now - lastCaptureTimeRef.current;

        // Motion threshold (card dropping / hand moving)
        if (mad > 4.5) {
          motionDetectedRef.current = true;
          stillnessFramesRef.current = 0;
          setMotionIndicator('chute');
        } else if (mad < 2.0 && motionDetectedRef.current && timeSinceLastSnap > 1400) {
          // Card settled in tray
          stillnessFramesRef.current += 1;
          setMotionIndicator('analyse');

          if (stillnessFramesRef.current >= 4) {
            // Trigger Automatic Snapshot
            motionDetectedRef.current = false;
            stillnessFramesRef.current = 0;
            lastCaptureTimeRef.current = now;
            soundManager.playDropBeep();

            // Capture high-res frame
            const snapCanvas = document.createElement('canvas');
            snapCanvas.width = video.videoWidth || 1280;
            snapCanvas.height = video.videoHeight || 720;
            const snapCtx = snapCanvas.getContext('2d');
            snapCtx.drawImage(video, 0, 0);

            // Add to background queue
            batchQueueRef.current.push({ canvas: snapCanvas, time: now });
            setQueueCount(batchQueueRef.current.length);

            if (!isProcessingQueue) {
              processBatchQueue();
            }
          }
        } else if (stillnessFramesRef.current === 0) {
          setMotionIndicator('attente');
        }
      }

      prevFrameDataRef.current = new Uint8ClampedArray(d);
      animId = requestAnimationFrame(checkMotionLoop);
    };

    animId = requestAnimationFrame(checkMotionLoop);
    return () => cancelAnimationFrame(animId);
  }, [scanMode, batchStatus, hasCamera, isProcessingQueue, processBatchQueue]);

  // Start Batch Session
  const handleStartBatch = () => {
    soundManager.playSuccess();
    setBatchCards([]);
    setLastScannedCard(null);
    batchQueueRef.current = [];
    setQueueCount(0);
    setBatchStatus('running');
  };

  // Pause / Resume Batch Session
  const handleTogglePauseBatch = () => {
    setBatchStatus(prev => (prev === 'running' ? 'paused' : 'running'));
  };

  // Stop Batch Session & Trigger Recap Modal
  const handleStopBatch = () => {
    soundManager.playSuccess();
    setBatchStatus('idle');
    if (onFinishBatchSession) {
      onFinishBatchSession(batchCards);
    }
  };

  // Handle File Upload from Gallery with Auto-Lighting Equalizer
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

        const enhanced = autoEnhanceLighting(canvas, 0.85);
        const corners = detectCardCorners(enhanced);
        onCardCaptured({
          sourceCanvas: enhanced,
          detectedCorners: corners
        });
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const totalBatchValue = batchCards.reduce((sum, item) => sum + Number(item.card?.pricing?.estimatedEur || 0), 0);

  return (
    <div className="flex flex-col items-center justify-center p-2 sm:p-4 max-w-4xl mx-auto w-full">
      
      {/* Mode Switcher */}
      <div className="w-full flex items-center justify-between mb-3 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 shadow-xl gap-1 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setScanMode('batch3d')}
            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-black transition-all whitespace-nowrap ${
              scanMode === 'batch3d'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Support 3D</span>
            <span className="text-[8px] sm:text-[9px] px-1 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-400/40">
              NEW
            </span>
          </button>

          <button
            onClick={() => setScanMode('button')}
            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap ${
              scanMode === 'button'
                ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Mode Bouton</span>
          </button>

          <button
            onClick={() => setScanMode('auto')}
            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap ${
              scanMode === 'auto'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>À la volée</span>
          </button>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-colors shrink-0 ml-auto whitespace-nowrap"
        >
          <Upload className="w-3.5 h-3.5 text-blue-400" />
          <span>Importer</span>
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
      <div className="relative w-full aspect-[3/4] sm:aspect-[4/3] md:aspect-[16/10] max-h-[58vh] rounded-3xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-2xl flex items-center justify-center group">
        
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
            <p className="text-xs text-slate-400 mb-4">{cameraError || "Veuillez autoriser l'accès à la caméra."}</p>
            <button
              onClick={startCamera}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold border border-slate-700"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Réessayer</span>
            </button>
          </div>
        )}

        {/* Real-time Ambient Lighting Status Badge */}
        {hasCamera && !cameraError && (
          <div className={`absolute z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-800/80 shadow-lg text-[10px] sm:text-[11px] font-bold transition-all ${
            scanMode === 'batch3d' && lastScannedCard ? 'bottom-3 left-3' : 'top-3 left-3'
          }`}>
            <span 
              className="w-2 h-2 rounded-full animate-pulse shrink-0" 
              style={{ backgroundColor: lightingInfo.color || '#10b981' }} 
            />
            <span className="text-slate-200 truncate max-w-[130px] sm:max-w-none">
              {lightingInfo.label}
            </span>
            {lightingInfo.needsBoost && hasTorch && !torchOn && (
              <button
                onClick={toggleTorch}
                title="Allumer la torche pour compenser le manque de lumière"
                className="ml-1 px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[9px] font-bold transition-colors"
              >
                + Torche
              </button>
            )}
          </div>
        )}

        {/* 3D Support Calibration HUD Overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <div 
            className="relative w-full max-w-[270px] sm:max-w-[310px] aspect-[63/88] rounded-2xl border-2 border-dashed flex flex-col justify-between p-3 transition-all duration-300"
            style={{
              borderColor: scanMode === 'batch3d' 
                ? (batchStatus === 'running' ? '#10b981' : '#059669') 
                : '#ef4444',
              boxShadow: scanMode === 'batch3d' && batchStatus === 'running'
                ? '0 0 35px rgba(16, 185, 129, 0.25), inset 0 0 20px rgba(16, 185, 129, 0.15)'
                : '0 0 25px rgba(239, 68, 68, 0.15)'
            }}
          >
            {/* 4 Corner Reticles */}
            <div className={`absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 rounded-tl-lg ${scanMode === 'batch3d' ? 'border-emerald-400' : 'border-red-500'}`} />
            <div className={`absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 rounded-tr-lg ${scanMode === 'batch3d' ? 'border-emerald-400' : 'border-red-500'}`} />
            <div className={`absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 rounded-bl-lg ${scanMode === 'batch3d' ? 'border-emerald-400' : 'border-red-500'}`} />
            <div className={`absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 rounded-br-lg ${scanMode === 'batch3d' ? 'border-emerald-400' : 'border-red-500'}`} />

            {/* Target Card Header Guide */}
            <div className="w-full flex items-center justify-between mb-1">
              <span className={`text-[9.5px] sm:text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-slate-950/85 border ${
                scanMode === 'batch3d' ? 'text-emerald-400 border-emerald-500/30' : 'text-red-400 border-red-500/30'
              }`}>
                {scanMode === 'batch3d' ? 'Support 3D' : 'Viseur Carte'}
              </span>
              <span className="text-[9.5px] sm:text-[10px] text-white/70 bg-slate-950/85 px-1.5 py-0.5 rounded font-mono">
                63x88mm
              </span>
            </div>

            {/* DYNAMIC BLUE TARGETING FRAME (Cadre Bleu : En haut de la carte pour Nom & PV) */}
            <div className="relative w-full rounded-xl border-2 border-blue-400 bg-blue-500/20 backdrop-blur-[1px] p-2 flex flex-col justify-between shadow-[0_0_22px_rgba(59,130,246,0.5),inset_0_0_12px_rgba(59,130,246,0.25)] transition-all min-h-[66px] sm:min-h-[74px]">
              {/* 4 Blue Inner Corner Reticles */}
              <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-cyan-300 rounded-tl-sm" />
              <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-cyan-300 rounded-tr-sm" />
              <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-cyan-300 rounded-bl-sm" />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-cyan-300 rounded-br-sm" />

              {/* Header Label inside Blue Frame */}
              <div className="flex items-center justify-between w-full">
                <span className="flex items-center gap-1.5 text-[8.5px] sm:text-[9.5px] font-black tracking-wide uppercase px-2 py-0.5 rounded bg-blue-600 text-white shadow-md border border-blue-400/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-ping" />
                  <span>Cadre Bleu : Haut de la Carte</span>
                </span>
                {liveHeaderScan.isSearching ? (
                  <span className="text-[8.5px] text-cyan-300 font-mono font-bold animate-pulse">
                    SCAN...
                  </span>
                ) : (
                  <span className="text-[8.5px] text-blue-300/90 font-semibold">
                    Nom & PV
                  </span>
                )}
              </div>

              {/* Dynamic Live Result Pill */}
              <div className="flex items-center justify-center w-full my-auto py-0.5">
                {liveHeaderScan.name || liveHeaderScan.hp ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-950/95 border border-cyan-400 text-cyan-300 font-black text-[11px] sm:text-xs shadow-xl animate-in zoom-in-95">
                    <span className="text-amber-400 text-xs">🎯</span>
                    {liveHeaderScan.stage && (
                      <span className="text-[8.5px] px-1 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {liveHeaderScan.stage}
                      </span>
                    )}
                    <span className="truncate max-w-[110px] sm:max-w-[150px]">{liveHeaderScan.name || 'Pokémon'}</span>
                    {liveHeaderScan.hp && (
                      <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-200 border border-cyan-500/50 text-[10px] font-mono">
                        {liveHeaderScan.hp}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-[8.5px] sm:text-[9.5px] text-blue-200/90 font-medium bg-slate-950/70 px-2 py-0.5 rounded-md">
                    <span className="animate-pulse">🔍 Analyse active du Nom en haut...</span>
                  </div>
                )}
              </div>

              {/* Blue Laser Ray Animation */}
              <div className="absolute inset-x-1 h-[2px] bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_8px_#38bdf8] animate-pulse opacity-80" />
            </div>

            {/* Illustration & Attack Zone Spacer */}
            <div className="w-full flex-1 flex flex-col items-center justify-center border border-dashed border-slate-700/30 rounded-xl my-1.5 bg-slate-950/15">
              <span className="text-[8.5px] sm:text-[9px] text-slate-500 font-semibold tracking-wider uppercase">
                Illustration & Attaques
              </span>
            </div>

            {/* Scanning Beam (Support 3D) */}
            {batchStatus === 'running' && (
              <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_#10b981] animate-scan" />
            )}

            {/* Status Footer Guide */}
            <div className="w-full flex items-center justify-center">
              {scanMode === 'batch3d' && batchStatus === 'running' ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                  {motionIndicator === 'chute' ? '⚡ Chute détectée...' : motionIndicator === 'analyse' ? '🔍 Stabilisation & Scan...' : '✨ En attente de la carte suivante...'}
                </span>
              ) : (
                <span className="text-[9px] sm:text-[9.5px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-slate-950/85 text-slate-400 border border-slate-700">
                  Gardez la carte droite dans le cadre
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Top Video Controls Overlay (Flash, Flip) */}
        {hasCamera && (
          <div className="absolute top-3 right-3 flex items-center gap-2">
            {hasTorch && (
              <button
                onClick={toggleTorch}
                title="Flash / Torche"
                className={`p-2 rounded-full backdrop-blur-md transition-all shadow-lg ${
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
              className="p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white backdrop-blur-md transition-all shadow-lg"
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Live Ticker Strip of Last Scanned Card */}
        {scanMode === 'batch3d' && lastScannedCard && (
          <div className="absolute top-3 left-3 z-30 flex items-center gap-2.5 p-2 rounded-2xl bg-slate-900/90 border border-emerald-500/40 shadow-2xl backdrop-blur-md animate-in slide-in-from-top-2 max-w-[260px]">
            <div className="w-8 h-11 rounded-lg bg-slate-950 overflow-hidden shrink-0 border border-slate-700">
              {lastScannedCard.card?.imageLow || lastScannedCard.card?.image ? (
                <img src={lastScannedCard.card.imageLow || lastScannedCard.card.image} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[8px] text-slate-600">Img</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-0.5">
                  <Check className="w-3 h-3" /> Scannée !
                </span>
                <span className={`text-[8px] px-1 rounded font-bold border ${(lastScannedCard.card?.categoryInfo || getCardCategoryInfo(lastScannedCard.card)).chipClass}`}>
                  {(lastScannedCard.card?.categoryInfo || getCardCategoryInfo(lastScannedCard.card)).badge}
                </span>
              </div>
              <h5 className="text-xs font-bold text-white truncate">
                {lastScannedCard.card?.name}
              </h5>
              <div className="text-[11px] font-black text-emerald-300">
                {Number(lastScannedCard.card?.pricing?.estimatedEur || 0).toFixed(2)} €
              </div>
            </div>
          </div>
        )}

        {/* Single Mode OCR Progress Modal */}
        {isProcessing && (
          <div className="absolute inset-0 backdrop-blur-sm bg-slate-950/85 flex flex-col items-center justify-center p-6 z-20">
            <div className="relative w-16 h-16 mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
              <div className="absolute inset-0 rounded-full border-4 border-red-500 border-t-transparent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white font-mono">
                {Math.round(ocrProgress * 100)}%
              </div>
            </div>
            <h4 className="text-white font-bold text-sm mb-1 animate-pulse">
              {statusMessage || "Analyse en cours..."}
            </h4>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="w-full mt-3 sm:mt-4">
        {scanMode === 'batch3d' ? (
          /* Support 3D Tower Controls */
          <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3 bg-slate-900/90 p-2.5 sm:p-3 rounded-2xl border border-slate-800 shadow-xl">
            
            {/* Live Metrics Pill */}
            <div className="flex items-center justify-between w-full sm:w-auto gap-2">
              <div className="flex items-center gap-2">
                <div className="px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">Cartes :</span>
                  <span className="text-xs sm:text-sm font-black text-white">{batchCards.length}</span>
                </div>

                <div className="px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">Total :</span>
                  <span className="text-xs sm:text-sm font-black text-emerald-400">{totalBatchValue.toFixed(2)} €</span>
                </div>
              </div>

              {queueCount > 0 && (
                <span className="text-[10px] sm:text-[11px] text-amber-400 font-semibold animate-pulse">
                  ⏳ {queueCount} en cours...
                </span>
              )}
            </div>

            {/* Action Buttons: PLAY / PAUSE / STOP */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {batchStatus === 'idle' ? (
                <button
                  onClick={handleStartBatch}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:opacity-95 text-white font-black text-xs sm:text-sm shadow-xl shadow-emerald-600/30 active:scale-95 transition-all"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Démarrer le Scan en Série (Play)</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={handleTogglePauseBatch}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors"
                  >
                    {batchStatus === 'running' ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Reprendre</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleStopBatch}
                    className="flex-2 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:opacity-95 text-white font-black text-xs sm:text-sm shadow-xl shadow-red-600/30 active:scale-95 transition-all"
                  >
                    <Square className="w-3.5 h-3.5 fill-white" />
                    <span>Terminer & Récap (Stop)</span>
                  </button>
                </>
              )}
            </div>

          </div>
        ) : scanMode === 'button' ? (
          /* Button Capture Mode */
          <div className="w-full flex flex-col items-center justify-center gap-2">
            <button
              onClick={captureFrame}
              disabled={isProcessing || !hasCamera}
              className="group relative flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-red-600 to-rose-500 p-1.5 shadow-2xl shadow-red-600/50 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
            >
              <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center border-2 border-white/80 group-hover:bg-slate-900 transition-colors">
                <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-red-600 border border-white/60 shadow-inner flex items-center justify-center">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-white group-hover:scale-110 transition-transform" />
                </div>
              </div>
            </button>
            <span className="text-[11px] text-slate-400 font-semibold">Appuyez pour capturer</span>
          </div>
        ) : (
          /* Auto Scan Countdown Mode */
          <div className="w-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="relative w-16 h-16 rounded-full bg-slate-900 border-2 border-amber-500/60 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <path className="text-slate-800" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-amber-500 transition-all duration-150" strokeDasharray={`${autoScanCountdown}, 100`} strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <Sparkles className="absolute w-6 h-6 text-amber-400 animate-pulse" />
              </div>
              <span className="text-xs font-bold text-amber-400">Scan à la volée actif</span>
            </div>
          </div>
        )}
      </div>

      {/* Guide Banner for 3D Tower Scanner */}
      {scanMode === 'batch3d' && (
        <div className="mt-4 w-full p-3 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="text-base">💡</span>
            <span>
              <strong>Mode Support 3D :</strong> Déposez vos cartes une par une dans la goulotte. La caméra détecte la chute, capture l'image et calcule la cote en direct !
            </span>
          </div>
        </div>
      )}

    </div>
  );
}
