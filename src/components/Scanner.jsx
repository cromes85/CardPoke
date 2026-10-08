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
  detectLiveCardQuad,
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

  // Real-Time Document Quad Detection (Android Style Live Auto-Detector)
  const [isAutoDocMode, setIsAutoDocMode] = useState(() => {
    const saved = localStorage.getItem('pokescan_autodoc_mode');
    return saved !== null ? saved === 'true' : true;
  });
  const [liveQuad, setLiveQuad] = useState(null);
  const prevQuadCornersRef = useRef(null);
  const liveQuadRef = useRef(null);
  const lastQuadSeenTimeRef = useRef(0);

  // Optical & Digital Zoom Engine for 3D Tower & Distance Calibration (2D Viewport Pan & Zoom)
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('pokescan_zoom_3d_v362');
    return saved ? parseFloat(saved) : 2.6;
  });
  const [offsetX, setOffsetX] = useState(() => {
    const saved = localStorage.getItem('pokescan_offset_x_3d_v362');
    return saved ? parseFloat(saved) : 0.12;
  });
  const [offsetY, setOffsetY] = useState(() => {
    const saved = localStorage.getItem('pokescan_offset_y_3d_v362');
    return saved ? parseFloat(saved) : -0.05;
  });
  const [showZoomPanel, setShowZoomPanel] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef(null);
  const [hwZoomSupported, setHwZoomSupported] = useState(false);
  const [hwZoomRange, setHwZoomRange] = useState({ min: 1, max: 5, step: 0.1 });

  // Real-Time Dynamic Header (Nom + PV/PC) Detection in Standby
  const [liveHeaderScan, setLiveHeaderScan] = useState({
    name: '',
    hp: '',
    stage: '',
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

  // Compute Zoomed ROI in Video Coordinate System with 2D Offsets
  const getZoomedCropDimensions = useCallback((vw, vh, z, offX, offY) => {
    const zoomVal = Math.max(1.0, z || 1.0);
    const cropW = Math.floor(vw / zoomVal);
    const cropH = Math.floor(vh / zoomVal);

    // Coordinate mapping: Positive offX shifts video right in CSS, so crop moves left in raw video
    const centerX = (vw / 2) - (vw * (offX || 0));
    const centerY = (vh / 2) - (vh * (offY || 0));

    const cropX = Math.max(0, Math.min(vw - cropW, Math.floor(centerX - cropW / 2)));
    const cropY = Math.max(0, Math.min(vh - cropH, Math.floor(centerY - cropH / 2)));

    return { cropX, cropY, cropW, cropH };
  }, []);

  // Set Zoom and 2D Calibration Level and persist per mode
  const handleSetCalibration = useCallback((newZoom, newOffX = null, newOffY = null) => {
    const targetZoom = Math.max(1.0, Math.min(4.5, Number(newZoom)));
    const targetOffX = newOffX !== null ? Math.max(-0.4, Math.min(0.4, Number(newOffX))) : offsetX;
    const targetOffY = newOffY !== null ? Math.max(-0.4, Math.min(0.4, Number(newOffY))) : offsetY;
    
    setZoom(targetZoom);
    if (newOffX !== null) setOffsetX(targetOffX);
    if (newOffY !== null) setOffsetY(targetOffY);

    if (scanMode === 'batch3d') {
      localStorage.setItem('pokescan_zoom_3d', String(targetZoom));
      if (newOffX !== null) localStorage.setItem('pokescan_offset_x_3d', String(targetOffX));
      if (newOffY !== null) localStorage.setItem('pokescan_offset_y_3d', String(targetOffY));
    } else {
      localStorage.setItem('pokescan_zoom_normal', String(targetZoom));
      if (newOffX !== null) localStorage.setItem('pokescan_offset_x_normal', String(targetOffX));
      if (newOffY !== null) localStorage.setItem('pokescan_offset_y_normal', String(targetOffY));
    }
  }, [offsetX, offsetY, scanMode]);

  // Handle Nudge via D-Pad Buttons
  const handleNudgeOffset = (dx, dy) => {
    const nextX = Math.max(-0.4, Math.min(0.4, offsetX + dx * 0.02));
    const nextY = Math.max(-0.4, Math.min(0.4, offsetY + dy * 0.02));
    handleSetCalibration(zoom, nextX, nextY);
  };

  const handleNudgeZoom = (dZoom) => {
    const nextZ = Math.max(1.0, Math.min(4.5, zoom + dZoom));
    handleSetCalibration(nextZ, offsetX, offsetY);
  };

  // Touch and Drag-to-Position (Pan) Handlers
  const handlePointerDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    panStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: offsetX,
      initY: offsetY
    };
    setIsPanning(true);
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (err) {}
  };

  const handlePointerMove = (e) => {
    if (!isPanning || !panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.startX;
    const dy = e.clientY - panStartRef.current.startY;

    const container = e.currentTarget.getBoundingClientRect();
    const deltaX = (dx / container.width) * (1 / zoom) * 1.5;
    const deltaY = (dy / container.height) * (1 / zoom) * 1.5;

    const newX = Math.max(-0.4, Math.min(0.4, panStartRef.current.initX + deltaX));
    const newY = Math.max(-0.4, Math.min(0.4, panStartRef.current.initY + deltaY));

    setOffsetX(newX);
    setOffsetY(newY);
  };

  const handlePointerUp = (e) => {
    if (isPanning) {
      setIsPanning(false);
      try {
        e.target.releasePointerCapture(e.pointerId);
      } catch (err) {}
      handleSetCalibration(zoom, offsetX, offsetY);
    }
    panStartRef.current = null;
  };

  // Handle Mode Change and Restore Corresponding Zoom Preset
  const handleModeChange = (mode) => {
    setScanMode(mode);
    if (mode === 'batch3d') {
      const saved3D = parseFloat(localStorage.getItem('pokescan_zoom_3d_v362')) || 2.6;
      const savedOffX = parseFloat(localStorage.getItem('pokescan_offset_x_3d_v362')) || 0.12;
      const savedOffY = parseFloat(localStorage.getItem('pokescan_offset_y_3d_v362')) || -0.05;
      handleSetCalibration(saved3D, savedOffX, savedOffY);
    } else {
      const savedNorm = parseFloat(localStorage.getItem('pokescan_zoom_normal')) || 1.0;
      const savedOffX = parseFloat(localStorage.getItem('pokescan_offset_x_normal')) || 0.0;
      const savedOffY = parseFloat(localStorage.getItem('pokescan_offset_y_normal')) || 0.0;
      handleSetCalibration(savedNorm, savedOffX, savedOffY);
    }
  };

  // Start Camera Stream with Continuous Auto-Exposure & Zoom Capabilities
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
        if (capabilities.zoom) {
          setHwZoomSupported(true);
          setHwZoomRange({
            min: capabilities.zoom.min || 1,
            max: capabilities.zoom.max || 5,
            step: capabilities.zoom.step || 0.1
          });
        }
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

  // Real-Time Live Document / Card Quad Detection Loop (Only in Free Photo / Auto Modes, not in 3D Tower)
  useEffect(() => {
    if (!hasCamera || cameraError || !isAutoDocMode || scanMode === 'batch3d') {
      setLiveQuad(null);
      liveQuadRef.current = null;
      prevQuadCornersRef.current = null;
      return;
    }

    let isRunning = true;
    let animId;
    let lastScanTime = 0;

    const runLiveDocScan = () => {
      if (!isRunning) return;

      const now = performance.now();
      // Scan every ~90ms (~11 FPS) for smooth real-time tracking
      if (now - lastScanTime >= 90 && videoRef.current && videoRef.current.readyState >= 2 && !isProcessing) {
        lastScanTime = now;
        try {
          const video = videoRef.current;
          const quad = detectLiveCardQuad(video, prevQuadCornersRef.current, {
            targetAspect: CARD_ASPECT_RATIO,
            minAreaPercent: 0.20,
            maxAreaPercent: 0.95
          });

          if (quad && quad.confidence > 0.75) {
            prevQuadCornersRef.current = quad.corners;
            liveQuadRef.current = quad;
            lastQuadSeenTimeRef.current = Date.now();
            setLiveQuad(quad);
          } else {
            // Keep quad for ~400ms before clearing
            if (Date.now() - lastQuadSeenTimeRef.current > 400) {
              prevQuadCornersRef.current = null;
              liveQuadRef.current = null;
              setLiveQuad(null);
            }
          }
        } catch (e) {}
      }

      animId = requestAnimationFrame(runLiveDocScan);
    };

    animId = requestAnimationFrame(runLiveDocScan);
    return () => {
      isRunning = false;
      cancelAnimationFrame(animId);
    };
  }, [hasCamera, cameraError, isAutoDocMode, scanMode, isProcessing]);

  // Standby Real-Time Name & PV / HP Detection Loop (Cadre Bleu : En haut de la carte)
  useEffect(() => {
    if (!hasCamera || cameraError || isProcessing) return;

    const interval = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2 || isProcessing || isLiveScanningRef.current) return;
      if (scanMode === 'batch3d' && batchStatus === 'running') return;

      const video = videoRef.current;
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;

      let headerCanvas = null;

      // 1. In Free Photo mode: If valid Live Document Quad is locked, extract top 20% of the quad
      if (scanMode !== 'batch3d' && isAutoDocMode && liveQuadRef.current && liveQuadRef.current.headerQuad) {
        try {
          const fullCanvas = document.createElement('canvas');
          fullCanvas.width = vw;
          fullCanvas.height = vh;
          const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });
          fullCtx.drawImage(video, 0, 0, vw, vh);

          headerCanvas = warpPerspective(fullCanvas, liveQuadRef.current.headerQuad, 420, 110);
        } catch (e) {}
      }

      // 2. In Support 3D & default mode: Extract top 22% of the Zoomed ROI (matching the framed card perfectly)
      if (!headerCanvas) {
        const { cropX, cropY, cropW, cropH } = getZoomedCropDimensions(vw, vh, zoom, offsetX, offsetY);
        const headerW = Math.min(vw - cropX, Math.floor(cropW * 0.96));
        const headerH = Math.min(vh - cropY, Math.floor(cropH * 0.22));
        const headerX = Math.max(0, Math.min(vw - headerW, Math.floor(cropX + cropW * 0.02)));
        const headerY = Math.max(0, Math.min(vh - headerH, Math.floor(cropY)));

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = headerW;
        tempCanvas.height = headerH;
        const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, headerX, headerY, headerW, headerH, 0, 0, headerW, headerH);
        headerCanvas = tempCanvas;
      }

      try {
        isLiveScanningRef.current = true;
        setLiveHeaderScan(prev => ({ ...prev, isSearching: true }));

        const res = await ocrService.scanHeaderLive(headerCanvas);

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
    }, 1300);

    return () => clearInterval(interval);
  }, [hasCamera, cameraError, isProcessing, scanMode, batchStatus, zoom, offsetX, offsetY, isAutoDocMode, getZoomedCropDimensions]);

  // Single Frame Capture with Live Document Auto-Warp or Zoomed ROI
  const captureFrame = useCallback(() => {
    if (!videoRef.current || isProcessing) return null;
    soundManager.playSnap();

    const video = videoRef.current;
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;

    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = vw;
    fullCanvas.height = vh;
    const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });
    fullCtx.drawImage(video, 0, 0, vw, vh);

    let finalCanvas = null;
    let detectedCorners = null;

    // 1. If Live Document Quad is active, do instant Perspective Warp (Android Document Scanner Mode)
    if (isAutoDocMode && liveQuadRef.current && liveQuadRef.current.corners) {
      try {
        const warped = warpPerspective(fullCanvas, liveQuadRef.current.corners, 630, 880);
        finalCanvas = autoEnhanceLighting(warped, 0.85);
        detectedCorners = [
          { x: 0, y: 0 },
          { x: 630, y: 0 },
          { x: 630, y: 880 },
          { x: 0, y: 880 }
        ];
      } catch (e) {
        console.warn("Auto-doc warp error:", e);
      }
    }

    // 2. Fallback: Zoomed ROI crop
    if (!finalCanvas) {
      const { cropX, cropY, cropW, cropH } = getZoomedCropDimensions(vw, vh, zoom, offsetX, offsetY);
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = cropW;
      cropCanvas.height = cropH;
      const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
      cropCtx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      finalCanvas = autoEnhanceLighting(cropCanvas, 0.85);
      detectedCorners = detectCardCorners(finalCanvas);
    }

    onCardCaptured({
      sourceCanvas: finalCanvas,
      detectedCorners: detectedCorners
    });
  }, [isProcessing, onCardCaptured, isAutoDocMode, zoom, offsetX, offsetY, getZoomedCropDimensions]);

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
        hp: ocrRes.hp,
        detectedCategory: ocrRes.detectedCategory,
        stage: ocrRes.detectedCategory?.stage,
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
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      const { cropX, cropY, cropW, cropH } = getZoomedCropDimensions(vw, vh, zoom, offsetX, offsetY);

      // Sample central 50% of the zoomed card drop zone
      const sampleCropX = cropX + Math.floor(cropW * 0.25);
      const sampleCropY = cropY + Math.floor(cropH * 0.25);
      const sampleCropW = Math.floor(cropW * 0.50);
      const sampleCropH = Math.floor(cropH * 0.50);

      sampleCtx.drawImage(video, sampleCropX, sampleCropY, sampleCropW, sampleCropH, 0, 0, sampleW, sampleH);
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

            const fullCanvas = document.createElement('canvas');
            fullCanvas.width = vw;
            fullCanvas.height = vh;
            const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });
            fullCtx.drawImage(video, 0, 0, vw, vh);

            let snapCanvas = null;
            // 1. If Live Document Quad is locked on card in chute, do instant auto-warp!
            if (isAutoDocMode && liveQuadRef.current && liveQuadRef.current.corners) {
              try {
                snapCanvas = warpPerspective(fullCanvas, liveQuadRef.current.corners, 630, 880);
              } catch (e) {}
            }

            // 2. Fallback: High-res zoomed frame crop
            if (!snapCanvas) {
              snapCanvas = document.createElement('canvas');
              snapCanvas.width = cropW;
              snapCanvas.height = cropH;
              const snapCtx = snapCanvas.getContext('2d');
              snapCtx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
            }

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
  }, [scanMode, batchStatus, hasCamera, isProcessingQueue, processBatchQueue, isAutoDocMode, zoom, offsetX, offsetY, getZoomedCropDimensions]);

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
            onClick={() => handleModeChange('batch3d')}
            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-black transition-all whitespace-nowrap ${
              scanMode === 'batch3d'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Support 3D</span>
            <span className="text-[8px] sm:text-[9px] px-1 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-400/40 font-bold">
              Auto-Centré
            </span>
          </button>

          <button
            onClick={() => handleModeChange('button')}
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
            onClick={() => handleModeChange('auto')}
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
        
        {/* Camera Stream with 2D Drag-to-Position Pan & Zoom */}
        {hasCamera && !cameraError ? (
          <div 
            className="w-full h-full overflow-hidden relative flex items-center justify-center cursor-move select-none touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            title="Glissez avec le doigt pour centrer la carte dans le cadre"
          >
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={{
                transform: `scale(${zoom}) translate(${offsetX * 100}%, ${offsetY * 100}%)`,
                transformOrigin: 'center center',
                transition: isPanning ? 'none' : 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              className="w-full h-full object-cover pointer-events-none will-change-transform"
            />
          </div>
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

        {/* Real-time Ambient Lighting & Mode Badges */}
        {hasCamera && !cameraError && (
          <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 flex-wrap max-w-[75%]">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-800/80 shadow-lg text-[10px] sm:text-[11px] font-bold transition-all">
              <span 
                className="w-2 h-2 rounded-full animate-pulse shrink-0" 
                style={{ backgroundColor: lightingInfo.color || '#10b981' }} 
              />
              <span className="text-slate-200 truncate max-w-[90px] sm:max-w-none">
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

            {scanMode !== 'batch3d' && (
              <button
                onClick={() => {
                  const next = !isAutoDocMode;
                  setIsAutoDocMode(next);
                  localStorage.setItem('pokescan_autodoc_mode', String(next));
                }}
                title="Mode Scanner de Documents Android : Détection et recadrage automatique 4 coins en direct"
                className={`flex items-center gap-1 px-2.5 py-1 rounded-xl backdrop-blur-md border shadow-lg text-[10px] sm:text-[11px] font-bold transition-all ${
                  isAutoDocMode
                    ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60 shadow-emerald-500/20'
                    : 'bg-slate-950/85 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                <Scan className="w-3.5 h-3.5 text-emerald-400" />
                <span>Auto-Cadrage {isAutoDocMode ? 'ON' : 'OFF'}</span>
              </button>
            )}
          </div>
        )}

        {/* Interactive Touch Drag Tip (when manual framing) */}
        {hasCamera && !cameraError && scanMode === 'batch3d' && (
          <div className="absolute top-3 right-14 z-20 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-400/30 text-amber-300 text-[9.5px] font-bold backdrop-blur-md pointer-events-none">
            <span>👆 Glissez pour centrer</span>
          </div>
        )}

        {/* Floating Quick Zoom Toolbar on Viewfinder */}
        {hasCamera && !cameraError && (
          <div className="absolute bottom-3 right-3 sm:right-4 z-30 flex items-center gap-1 bg-slate-950/90 backdrop-blur-md p-1 sm:p-1.5 rounded-2xl border border-slate-700/80 shadow-2xl">
            {[
              { label: '1x', val: 1.0, ox: 0.0, oy: 0.0 },
              { label: '1.5x', val: 1.5, ox: 0.06, oy: -0.03 },
              { label: '2x', val: 2.0, ox: 0.10, oy: -0.04 },
              { label: '2.6x 🎯 3D', val: 2.6, ox: 0.12, oy: -0.05 },
              { label: '3x', val: 3.0, ox: 0.14, oy: -0.06 }
            ].map(preset => (
              <button
                key={preset.val}
                onClick={() => handleSetCalibration(preset.val, preset.ox, preset.oy)}
                className={`px-2 py-1 rounded-xl text-[10px] sm:text-xs font-black transition-all ${
                  Math.abs(zoom - preset.val) < 0.12
                    ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-red-600/40 scale-105'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                {preset.label}
              </button>
            ))}

            <button
              onClick={() => setShowZoomPanel(!showZoomPanel)}
              title="Ajuster le cadrage au millimètre (D-pad & curseurs)"
              className={`p-1.5 rounded-xl border transition-colors ${
                showZoomPanel
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Granular Zoom & 2D Centering Fine-Tuning Drawer */}
        {showZoomPanel && (
          <div className="absolute top-12 inset-x-2 sm:inset-x-6 z-40 p-3.5 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-700 shadow-2xl space-y-3 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-white flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>Calibrage Chirurgical Viseur & Tour 3D</span>
              </span>
              <button
                onClick={() => setShowZoomPanel(false)}
                className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800 font-bold"
              >
                Fermer
              </button>
            </div>

            {/* D-Pad 2D Directional Nudge + Zoom Controls */}
            <div className="grid grid-cols-2 gap-3 items-center bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
              
              {/* D-Pad Arrows */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-400 font-semibold mb-0.5">Recadrage Manuel (D-Pad)</span>
                <button
                  onClick={() => handleNudgeOffset(0, 1)}
                  className="w-8 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs active:scale-95 shadow"
                >
                  ▲
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleNudgeOffset(1, 0)}
                    className="w-8 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs active:scale-95 shadow"
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => handleSetCalibration(2.6, 0.12, -0.05)}
                    title="Centrer par défaut pour support 3D"
                    className="w-8 h-7 rounded-lg bg-red-600/30 text-red-300 font-bold flex items-center justify-center text-[10px] active:scale-95 border border-red-500/40"
                  >
                    🎯
                  </button>
                  <button
                    onClick={() => handleNudgeOffset(-1, 0)}
                    className="w-8 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs active:scale-95 shadow"
                  >
                    ▶
                  </button>
                </div>
                <button
                  onClick={() => handleNudgeOffset(0, -1)}
                  className="w-8 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs active:scale-95 shadow"
                >
                  ▼
                </button>
              </div>

              {/* Zoom In / Out Buttons & Coordinate Display */}
              <div className="flex flex-col items-center justify-center gap-2">
                <span className="text-[10px] text-slate-400 font-semibold">Grossissement</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleNudgeZoom(-0.1)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-black text-sm active:scale-95 shadow border border-slate-700"
                  >
                    -
                  </button>
                  <span className="text-amber-400 font-mono font-black text-sm">{zoom.toFixed(1)}x</span>
                  <button
                    onClick={() => handleNudgeZoom(+0.1)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-black text-sm active:scale-95 shadow border border-slate-700"
                  >
                    +
                  </button>
                </div>
                <span className="text-[9px] text-slate-500 font-mono">
                  Décalage : X:{Math.round(offsetX * 100)}% Y:{Math.round(offsetY * 100)}%
                </span>
              </div>

            </div>

            {/* 1-Click Calibration Shortcuts */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => handleSetCalibration(2.6, 0.12, -0.05)}
                className="flex-1 py-1.5 px-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold text-center transition-colors"
              >
                🎯 Tour 3D Préréglée (2.6x)
              </button>
              <button
                onClick={() => handleSetCalibration(1.0, 0.0, 0.0)}
                className="flex-1 py-1.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-semibold text-center transition-colors"
              >
                📱 Vue Normale (1.0x)
              </button>
            </div>
          </div>
        )}

        {/* REAL-TIME DYNAMIC MAGNETIC QUAD OVERLAY (Only for Free Photo Mode with strictly verified card quad) */}
        {scanMode !== 'batch3d' && isAutoDocMode && liveQuad && (
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
            <svg 
              viewBox="0 0 100 100" 
              preserveAspectRatio="none" 
              className="w-full h-full absolute inset-0"
            >
              {/* Full Card Glowing Polygonal Boundary */}
              <polygon 
                points={liveQuad.relativeCorners.map(p => `${p.x},${p.y}`).join(' ')} 
                fill="rgba(16, 185, 129, 0.12)" 
                stroke="#10b981" 
                strokeWidth="0.8"
                strokeDasharray="2.5 1.5"
                className="transition-all duration-75"
              />

              {/* Dynamic Top Header Blue Polygon (Cadre Bleu Nom & PV) */}
              <polygon 
                points={liveQuad.relativeHeaderQuad.map(p => `${p.x},${p.y}`).join(' ')} 
                fill="rgba(59, 130, 246, 0.32)" 
                stroke="#38bdf8" 
                strokeWidth="0.9"
                className="transition-all duration-75"
              />

              {/* 4 Corner Magnetic Target Reticles */}
              {liveQuad.relativeCorners.map((pt, idx) => (
                <g key={idx}>
                  <circle cx={pt.x} cy={pt.y} r="1.6" fill="#34d399" stroke="#064e3b" strokeWidth="0.5" />
                  <circle cx={pt.x} cy={pt.y} r="0.6" fill="#ffffff" />
                </g>
              ))}
            </svg>

            {/* Floating Live Badge & Header Result centered over detected card */}
            <div 
              style={{ 
                left: `${liveQuad.center.relX}%`, 
                top: `${Math.max(6, liveQuad.relativeCorners[0].y - 6)}%` 
              }}
              className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center gap-1 transition-all duration-100 max-w-[280px]"
            >
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/95 border border-emerald-400 text-emerald-300 shadow-2xl text-[10px] sm:text-xs font-black backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>🎯 Document Détecté (Auto-Cadré)</span>
              </div>

              {/* Dynamic OCR Live Tag for Top of Card */}
              {(liveHeaderScan.name || liveHeaderScan.hp) && (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-blue-950/95 border border-cyan-400 text-cyan-200 text-[10.5px] font-black shadow-lg">
                  {liveHeaderScan.stage && (
                    <span className="text-[8px] px-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {liveHeaderScan.stage}
                    </span>
                  )}
                  <span className="truncate max-w-[120px]">{liveHeaderScan.name}</span>
                  {liveHeaderScan.hp && (
                    <span className="font-mono text-[9.5px] text-cyan-300 px-1 bg-cyan-900/60 rounded">
                      {liveHeaderScan.hp}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3D Support & Standard Calibration HUD Overlay (Clean & Rock-Solid) */}
        {(scanMode === 'batch3d' || !isAutoDocMode || !liveQuad) && (
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
        )}

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
