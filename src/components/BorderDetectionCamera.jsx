import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Scan,
  Flashlight,
  RefreshCw,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Maximize2,
  Camera,
  Layers,
  Sparkles,
  Sun,
  Sliders,
  Download,
  Wand2,
  Hash,
  Loader2,
  Copy,
  Check,
  Zap,
  ZoomIn,
  Search,
  ExternalLink
} from 'lucide-react';
import {
  autoDetectCardEdges,
  RobustCardTracker,
  extractCardWarped,
  POKEMON_RATIO
} from '../utils/cardEdgeDetector';
import { recognizeCardInfo } from '../utils/cardTextRecognizer';
import { searchPokemonCard, getCardDetails } from '../utils/pokemonCardMatcher';

// Coordonnées d'usine étalonnées pour la Tour 3D
const STAND_3D_CORNERS = [
  { x: 0.268, y: 0.480 }, // TL
  { x: 0.538, y: 0.480 }, // TR
  { x: 0.538, y: 0.690 }, // BR
  { x: 0.268, y: 0.690 }  // BL
];

export default function BorderDetectionCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const trackerRef = useRef(new RobustCardTracker());
  const fileInputRef = useRef(null);
  const lastWarpedCanvasRef = useRef(null);

  // Mode de Détection : 'stand' (Tour/Support 3D) | 'auto' (Table / Libre)
  const [scanMode, setScanMode] = useState('stand');

  // Éclairage & Luminosité (Valeurs par défaut optimisées pour la Tour 3D sombre)
  const [brightness, setBrightness] = useState(() => {
    const saved = localStorage.getItem('card_lighting_brightness');
    return saved ? parseFloat(saved) : 1.35;
  });
  const [contrast, setContrast] = useState(() => {
    const saved = localStorage.getItem('card_lighting_contrast');
    return saved ? parseFloat(saved) : 1.08;
  });
  const [showLightingPanel, setShowLightingPanel] = useState(false);
  const [autoEnhance, setAutoEnhance] = useState(true);

  // Zoom Optique & Matériel
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [hasHardwareZoom, setHasHardwareZoom] = useState(false);
  const [zoomCaps, setZoomCaps] = useState({ min: 1, max: 4, step: 0.1 });

  // États OCR Automatique & Base Pokémon
  const [detectedName, setDetectedName] = useState('');
  const [detectedHP, setDetectedHP] = useState('');
  const [detectedNumber, setDetectedNumber] = useState('');
  const [isReadingOCR, setIsReadingOCR] = useState(false);
  const [isSearchingAPI, setIsSearchingAPI] = useState(false);
  const [candidateCards, setCandidateCards] = useState([]);
  const [selectedCardDetails, setSelectedCardDetails] = useState(null);
  const [headerCropPreview, setHeaderCropPreview] = useState(null);
  const [footerCropPreview, setFooterCropPreview] = useState(null);
  const [isCopied, setIsCopied] = useState(false);

  // États Caméra & Matériel
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  // Résultat de Détection
  const [corners, setCorners] = useState(STAND_3D_CORNERS);
  const [isLocked, setIsLocked] = useState(true);
  const [fps, setFps] = useState(0);

  // Extraction & Vérification
  const [capturedWarpedImage, setCapturedWarpedImage] = useState(null);
  const [staticImageSource, setStaticImageSource] = useState(null);

  // Mesure FPS
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());
  const lastProcessTimeRef = useRef(0);

  // 1. Démarrage Caméra Haute Définition (Capteur 4K / UHD avec autofocus continu)
  const startCamera = useCallback(async (deviceId = '') => {
    setCameraError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }

    try {
      let stream;
      try {
        // Tentative 4K / UHD avec focus continu
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            facingMode: deviceId ? undefined : { ideal: 'environment' },
            width: { ideal: 3840, min: 1280 },
            height: { ideal: 2160, min: 720 },
            advanced: [{ focusMode: 'continuous' }]
          }
        });
      } catch (errHighRes) {
        // Repli 1080p
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            facingMode: deviceId ? undefined : { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('Erreur lecture directe video:', playErr);
        }
      }

      setCameraActive(true);
      setStaticImageSource(null);
      trackerRef.current.reset();

      const track = stream.getVideoTracks()[0];
      const capabilities = track?.getCapabilities ? track.getCapabilities() : {};
      setHasTorch(!!capabilities.torch);
      if (capabilities.zoom) {
        setHasHardwareZoom(true);
        setZoomCaps({
          min: capabilities.zoom.min || 1,
          max: capabilities.zoom.max || 5,
          step: capabilities.zoom.step || 0.1
        });
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      setVideoDevices(videoInputs);
      if (!selectedDeviceId && videoInputs.length > 0) {
        const activeTrack = stream.getVideoTracks()[0];
        const activeDevId = activeTrack?.getSettings?.()?.deviceId || videoInputs[0].deviceId;
        setSelectedDeviceId(activeDevId);
      }
    } catch (err) {
      console.error('Erreur accès caméra:', err);
      setCameraError('Impossible d’accéder à la caméra. Vérifiez les autorisations.');
      setCameraActive(false);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // Sécurité d'attachement du flux vidéo
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch(e => console.warn('Play error:', e));
    }
  }, [cameraActive]);

  // 2. Basculer Torche / Flash
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextState = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: nextState }] });
      setTorchOn(nextState);
    } catch (e) {
      console.warn('Erreur torche:', e);
    }
  };

  // 3. Basculer Objectif Caméra
  const handleSwitchCamera = () => {
    if (videoDevices.length <= 1) return;
    const curIdx = videoDevices.findIndex(d => d.deviceId === selectedDeviceId);
    const nextIdx = (curIdx + 1) % videoDevices.length;
    const nextDev = videoDevices[nextIdx];
    setSelectedDeviceId(nextDev.deviceId);
    startCamera(nextDev.deviceId);
  };

  // 4. Boucle de Traitement Vidéo
  useEffect(() => {
    let isRunning = true;
    const workCanvas = document.createElement('canvas');
    const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });

    const processFrame = (timestamp) => {
      if (!isRunning) return;

      frameCountRef.current++;
      const now = performance.now();
      if (now - lastFpsTimeRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }

      if (scanMode === 'stand') {
        // En mode Support 3D : cadrage automatique instantané au millimètre sur la goulotte
        setCorners(STAND_3D_CORNERS);
        setIsLocked(true);
      } else if (timestamp - lastProcessTimeRef.current >= 35) {
        // En mode Table / Libre : analyse par vision par ordinateur adaptative
        lastProcessTimeRef.current = timestamp;

        const video = videoRef.current;
        const staticImg = staticImageSource;
        let source = null, sw = 0, sh = 0;

        if (staticImg) {
          source = staticImg;
          sw = staticImg.naturalWidth || staticImg.width;
          sh = staticImg.naturalHeight || staticImg.height;
        } else if (video && video.readyState >= 2 && video.videoWidth > 0) {
          source = video;
          sw = video.videoWidth;
          sh = video.videoHeight;
        }

        if (source && sw > 0 && sh > 0) {
          workCanvas.width = sw;
          workCanvas.height = sh;
          workCtx.drawImage(source, 0, 0, sw, sh);

          const rawResult = autoDetectCardEdges(workCanvas);
          const tracked = trackerRef.current.update(rawResult);

          if (tracked && tracked.corners) {
            setCorners(tracked.corners);
            setIsLocked(tracked.isLocked);
          } else {
            setCorners(null);
            setIsLocked(false);
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      isRunning = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [scanMode, cameraActive, staticImageSource]);

  // 5. Charger une image de test
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new window.Image();
      img.onload = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
        }
        setCameraActive(false);
        setStaticImageSource(img);
        trackerRef.current.reset();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Gestionnaires de Luminosité & Contraste
  const handleBrightnessChange = (val) => {
    const num = parseFloat(val);
    setBrightness(num);
    localStorage.setItem('card_lighting_brightness', num.toString());
  };

  const handleContrastChange = (val) => {
    const num = parseFloat(val);
    setContrast(num);
    localStorage.setItem('card_lighting_contrast', num.toString());
  };

  const setLightingPreset = (b, c) => {
    setBrightness(b);
    setContrast(c);
    localStorage.setItem('card_lighting_brightness', b.toString());
    localStorage.setItem('card_lighting_contrast', c.toString());
  };

  // Gestionnaire de Zoom Matériel
  const handleZoomChange = async (val) => {
    const num = parseFloat(val);
    setZoomLevel(num);
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track && track.getCapabilities?.().zoom) {
        try {
          await track.applyConstraints({ advanced: [{ zoom: num }] });
        } catch (e) {
          console.warn('Erreur réglage zoom:', e);
        }
      }
    }
  };

  // Lecture OCR Automatique Complète (Nom, PV, Numéro de Carte) + Requête TCGdex
  const readAllCardInfo = async (canvas) => {
    if (!canvas) return;
    setIsReadingOCR(true);
    setIsSearchingAPI(true);
    setCandidateCards([]);
    setSelectedCardDetails(null);
    setDetectedName('');
    setDetectedHP('');
    setDetectedNumber('');

    try {
      // 1. OCR multi-zones
      const res = await recognizeCardInfo(canvas);
      if (res.name) setDetectedName(res.name);
      if (res.hp) setDetectedHP(res.hp);
      if (res.number) setDetectedNumber(res.number);
      if (res.headerPreview) setHeaderCropPreview(res.headerPreview);
      if (res.footerPreview) setFooterCropPreview(res.footerPreview);
      setIsReadingOCR(false);

      // 2. Recherche Base de données Pokémon TCGdex
      const searchName = res.name;
      if (searchName && searchName.trim().length >= 2) {
        const matches = await searchPokemonCard(searchName, res.hp, res.number);
        setCandidateCards(matches || []);

        if (matches && matches.length > 0) {
          const topMatch = matches[0];
          const details = await getCardDetails(topMatch.id);
          if (details) {
            setSelectedCardDetails(details);
            // Si le numéro lu par OCR était vide, utiliser le numéro vérifié de l'API
            if (!res.number || res.number.length < 3) {
              setDetectedNumber(details.number);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Erreur OCR / TCGdex:', err);
    } finally {
      setIsReadingOCR(false);
      setIsSearchingAPI(false);
    }
  };

  const handleSelectCandidate = async (candidate) => {
    setIsSearchingAPI(true);
    try {
      const details = await getCardDetails(candidate.id);
      if (details) {
        setSelectedCardDetails(details);
        setDetectedNumber(details.number);
        if (details.name) setDetectedName(details.name);
        if (details.hp) setDetectedHP(details.hp);
      }
    } catch (err) {
      console.warn('Erreur sélection candidat:', err);
    } finally {
      setIsSearchingAPI(false);
    }
  };

  const handleManualSearch = async () => {
    if (!detectedName || detectedName.trim().length < 2) return;
    setIsSearchingAPI(true);
    try {
      const matches = await searchPokemonCard(detectedName.trim(), detectedHP, detectedNumber);
      setCandidateCards(matches || []);
      if (matches && matches.length > 0) {
        const details = await getCardDetails(matches[0].id);
        if (details) {
          setSelectedCardDetails(details);
          if (!detectedNumber) {
            setDetectedNumber(details.number);
          }
        }
      }
    } catch (err) {
      console.warn('Erreur recherche manuelle:', err);
    } finally {
      setIsSearchingAPI(false);
    }
  };

  const handleCopyCardInfo = () => {
    const setInfo = selectedCardDetails?.setName ? ` [${selectedCardDetails.setName}]` : '';
    const summary = `${detectedName || 'Pokémon'} ${detectedHP ? `(${detectedHP})` : ''} - N° ${detectedNumber || 'Non renseigné'}${setInfo}`.trim();
    navigator.clipboard?.writeText(summary);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // 6. Figer & Extraire la carte redressée (750 x 1050 px HD) avec OCR Automatique
  const handleCaptureWarped = async (forceEnhance = autoEnhance) => {
    if (!corners || corners.length !== 4) return;

    let sourceCanvas = null;

    // 1. Essai de capture haute résolution native capteur via ImageCapture API
    if (!staticImageSource && streamRef.current && typeof window.ImageCapture !== 'undefined') {
      try {
        const track = streamRef.current.getVideoTracks()[0];
        if (track && track.readyState === 'live') {
          const imageCap = new window.ImageCapture(track);
          if (typeof imageCap.grabFrame === 'function') {
            const bitmap = await imageCap.grabFrame();
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = bitmap.width;
            tempCanvas.height = bitmap.height;
            tempCanvas.getContext('2d').drawImage(bitmap, 0, 0);
            sourceCanvas = tempCanvas;
          }
        }
      } catch (capErr) {
        console.warn('ImageCapture fallback sur le flux vidéo:', capErr);
      }
    }

    if (!sourceCanvas) {
      const canvas = document.createElement('canvas');
      let width = 0, height = 0;

      if (staticImageSource) {
        width = staticImageSource.naturalWidth || staticImageSource.width;
        height = staticImageSource.naturalHeight || staticImageSource.height;
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(staticImageSource, 0, 0);
      } else if (videoRef.current) {
        const video = videoRef.current;
        width = video.videoWidth;
        height = video.videoHeight;
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(video, 0, 0);
      }
      sourceCanvas = canvas;
    }

    if (!sourceCanvas || sourceCanvas.width === 0 || sourceCanvas.height === 0) return;

    const warped = extractCardWarped(sourceCanvas, corners, 750, 1050, brightness, contrast, forceEnhance);
    if (warped) {
      lastWarpedCanvasRef.current = warped;
      setCapturedWarpedImage(warped.toDataURL('image/jpeg', 0.95));
      // Lancement immédiat de la reconnaissance OCR + Recherche TCGdex
      readAllCardInfo(warped);
    }
  };

  const getSvgPolygonPoints = () => {
    if (!corners) return '';
    return corners.map(pt => `${pt.x * 100},${pt.y * 100}`).join(' ');
  };

  return (
    <div className="relative w-full h-[100dvh] bg-slate-950 flex flex-col justify-between overflow-hidden select-none font-sans">
      
      {/* 1. Header Transparent Épuré avec Sélecteur de Mode */}
      <header className="relative z-30 flex items-center justify-between px-3.5 py-2.5 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-sm">
            <Scan className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xs font-bold text-white tracking-wide">Détecteur Pokémon</h1>
            <p className="text-[10px] text-slate-400 font-mono">
              {fps} FPS • {scanMode === 'stand' ? '🎯 Tour 3D' : '📱 Table'}
            </p>
          </div>
        </div>

        {/* Sélecteur de mode 1-clic : Tour 3D vs Table */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-medium">
          <button
            onClick={() => setScanMode('stand')}
            className={`px-3 py-1 rounded-lg transition ${
              scanMode === 'stand'
                ? 'bg-emerald-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🏗️ Tour 3D
          </button>
          <button
            onClick={() => setScanMode('auto')}
            className={`px-3 py-1 rounded-lg transition ${
              scanMode === 'auto'
                ? 'bg-indigo-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            📱 Table
          </button>
        </div>

        {/* Boutons Flash, Luminosité & Switch Caméra */}
        <div className="flex items-center gap-1.5">
          {/* Bouton Panneau Éclairage */}
          <button
            onClick={() => setShowLightingPanel(prev => !prev)}
            className={`px-2.5 py-1.5 rounded-xl border transition flex items-center gap-1.5 text-xs ${
              showLightingPanel || brightness > 1.05
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-md font-bold'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
            title="Ajuster la luminosité"
          >
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] font-mono">
              {brightness >= 1.0 ? `+${Math.round((brightness - 1) * 100)}%` : `${Math.round((brightness - 1) * 100)}%`}
            </span>
          </button>

          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-2 rounded-xl border transition ${
                torchOn
                  ? 'bg-amber-500 text-black border-amber-400 shadow-md'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="Activer/Désactiver la Torche LED"
            >
              <Flashlight className="w-3.5 h-3.5" />
            </button>
          )}

          {videoDevices.length > 1 && (
            <button
              onClick={handleSwitchCamera}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 active:scale-95 transition"
              title="Changer de caméra"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* Panneau Déroulant de Réglage de Luminosité & Éclairage */}
      {showLightingPanel && (
        <div className="relative z-30 px-4 py-3 bg-slate-900/95 backdrop-blur-md border-b border-amber-500/30 flex flex-col gap-2.5 shadow-2xl transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <Sun className="w-4 h-4 text-amber-400" />
              <span>Boost Luminosité & Contraste</span>
            </div>
            <button
              onClick={() => setLightingPreset(1.0, 1.0)}
              className="text-[10px] text-slate-400 hover:text-slate-200 underline font-mono"
            >
              Réinitialiser (100%)
            </button>
          </div>

          {/* Préréglages Rapides 1-Clic */}
          <div className="grid grid-cols-4 gap-1.5 text-[10px] font-medium">
            <button
              onClick={() => setLightingPreset(1.0, 1.0)}
              className={`py-1.5 rounded-lg border transition ${
                brightness === 1.0 && contrast === 1.0
                  ? 'bg-amber-500 text-black font-bold border-amber-400 shadow'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              Standard 100%
            </button>
            <button
              onClick={() => setLightingPreset(1.35, 1.08)}
              className={`py-1.5 rounded-lg border transition ${
                brightness === 1.35 && contrast === 1.08
                  ? 'bg-amber-500 text-black font-bold border-amber-400 shadow'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              ⭐ Tour 3D (+35%)
            </button>
            <button
              onClick={() => setLightingPreset(1.65, 1.12)}
              className={`py-1.5 rounded-lg border transition ${
                brightness === 1.65 && contrast === 1.12
                  ? 'bg-amber-500 text-black font-bold border-amber-400 shadow'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              Lumineux (+65%)
            </button>
            <button
              onClick={() => setLightingPreset(2.0, 1.15)}
              className={`py-1.5 rounded-lg border transition ${
                brightness === 2.0 && contrast === 1.15
                  ? 'bg-amber-500 text-black font-bold border-amber-400 shadow'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              Ultra (+100%)
            </button>
          </div>

          {/* Curseur de précision Luminosité */}
          <div className="flex items-center gap-3 pt-1">
            <span className="text-[11px] text-slate-300 w-24 flex items-center gap-1 font-mono">
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              {Math.round(brightness * 100)}%
            </span>
            <input
              type="range"
              min="0.80"
              max="2.50"
              step="0.05"
              value={brightness}
              onChange={(e) => handleBrightnessChange(e.target.value)}
              className="flex-1 accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Curseur de précision Contraste */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-300 w-24 flex items-center gap-1 font-mono">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              Contraste {Math.round(contrast * 100)}%
            </span>
            <input
              type="range"
              min="0.90"
              max="1.40"
              step="0.02"
              value={contrast}
              onChange={(e) => handleContrastChange(e.target.value)}
              className="flex-1 accent-indigo-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Contrôles de Zoom Optique & Matériel */}
          {hasHardwareZoom && (
            <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                  <ZoomIn className="w-3.5 h-3.5" />
                  Zoom Capteur / Optique
                </span>
                <span className="text-[11px] font-mono text-emerald-300 font-bold">
                  {zoomLevel.toFixed(1)}x
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-[10px] font-medium">
                {[1.0, 1.5, 2.0, 2.5].map((z) => (
                  <button
                    key={z}
                    onClick={() => handleZoomChange(z)}
                    className={`py-1 rounded-lg border transition font-mono ${
                      Math.abs(zoomLevel - z) < 0.1
                        ? 'bg-emerald-500 text-black font-bold border-emerald-400 shadow'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {z.toFixed(1)}x
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] text-slate-300 w-24 flex items-center gap-1 font-mono">
                  <ZoomIn className="w-3.5 h-3.5 text-emerald-400" />
                  {zoomLevel.toFixed(1)}x
                </span>
                <input
                  type="range"
                  min={zoomCaps.min || 1}
                  max={Math.min(zoomCaps.max || 5, 4)}
                  step={zoomCaps.step || 0.1}
                  value={zoomLevel}
                  onChange={(e) => handleZoomChange(e.target.value)}
                  className="flex-1 accent-emerald-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Viseur Vidéo & Calque de Détection SVG */}
      <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
        
        {/* Flux Caméra avec Filtre d'Éclairage */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`w-full h-full object-cover sm:object-contain ${staticImageSource ? 'hidden' : 'block'}`}
          style={{
            filter: `brightness(${brightness}) contrast(${contrast})`
          }}
        />

        {/* Image Statique de Test */}
        {staticImageSource && (
          <img
            src={staticImageSource.src}
            alt="Carte de test"
            className="w-full h-full object-contain"
            style={{
              filter: `brightness(${brightness}) contrast(${contrast})`
            }}
          />
        )}

        {/* Message d'erreur */}
        {cameraError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-slate-950/95">
            <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
            <p className="text-sm text-slate-200 mb-4">{cameraError}</p>
            <button
              onClick={() => startCamera()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold"
            >
              Réessayer
            </button>
          </div>
        )}

        {/* Calque de Traçage SVG Dynamique */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {corners && (
            <>
              {/* Polygone de bordure lumineuse */}
              <polygon
                points={getSvgPolygonPoints()}
                className="fill-emerald-500/20 stroke-emerald-400 stroke-[1.4] drop-shadow-[0_0_12px_rgba(52,211,153,0.9)] transition-all duration-100 ease-out"
              />

              {/* Réticules aux 4 coins (TL, TR, BR, BL) */}
              {corners.map((pt, idx) => {
                const labels = ['TL', 'TR', 'BR', 'BL'];
                const colors = ['#38bdf8', '#818cf8', '#34d399', '#f472b6'];
                return (
                  <g key={idx} className="transition-all duration-100 ease-out">
                    <circle
                      cx={pt.x * 100}
                      cy={pt.y * 100}
                      r="2.2"
                      fill={colors[idx]}
                      stroke="#ffffff"
                      strokeWidth="0.6"
                      className="drop-shadow-lg"
                    />
                    <text
                      x={pt.x * 100 + (idx === 0 || idx === 3 ? -3 : 3)}
                      y={pt.y * 100 + (idx === 0 || idx === 1 ? -3 : 4)}
                      fill="#ffffff"
                      fontSize="3.0"
                      fontWeight="bold"
                      textAnchor={idx === 0 || idx === 3 ? 'end' : 'start'}
                      className="pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                    >
                      {labels[idx]}
                    </text>
                  </g>
                );
              })}
            </>
          )}
        </svg>

        {/* Badge Viseur Flottant */}
        {isLocked && corners && (
          <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-center pointer-events-none">
            <div className="bg-slate-900/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-emerald-500/40 text-xs font-mono text-emerald-300 flex items-center gap-2 shadow-xl">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>4 Bords Cadrés (63:88)</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Barre de Contrôles Inférieure */}
      <footer className="relative z-30 px-4 py-3 bg-slate-950 border-t border-slate-900 flex items-center justify-between gap-3">
        
        {/* Charger une Image */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 transition"
        >
          <ImageIcon className="w-4 h-4 text-slate-400" />
          Tester Image
        </button>

        {/* Bouton Principal : Capturer & Découper */}
        <button
          onClick={handleCaptureWarped}
          disabled={!isLocked}
          className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold shadow-lg transition active:scale-95 ${
            isLocked
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-emerald-500/25'
              : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
          }`}
        >
          <Maximize2 className="w-4 h-4" />
          Capturer & Découper (63x88)
        </button>

        {staticImageSource && (
          <button
            onClick={() => startCamera(selectedDeviceId)}
            className="py-3 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold active:scale-95 transition"
          >
            <Camera className="w-4 h-4" />
          </button>
        )}
      </footer>

      {/* 4. Modal de Contrôle de l'Extraction Redressée & Identification */}
      {capturedWarpedImage && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-3 overflow-y-auto">
          <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-2xl flex flex-col items-center space-y-3 my-auto max-h-[96vh] overflow-y-auto">
            
            {/* Titre & Résolution */}
            <div className="flex items-center justify-between w-full">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Scan Redressé HD
              </h3>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 font-bold">
                750 × 1050 px
              </span>
            </div>

            {/* Aperçu Carte Rectangulaire 63:88 */}
            <div className="w-full max-h-44 aspect-[63/88] rounded-xl overflow-hidden border-2 border-emerald-500 shadow-2xl bg-slate-950 flex items-center justify-center">
              <img
                src={capturedWarpedImage}
                alt="Carte extraite HD"
                className="w-full h-full object-contain"
              />
            </div>

            {/* 1. Boîtier Nom & PV (En-Tête) */}
            <div className="w-full bg-slate-950/90 rounded-xl p-2.5 border border-slate-800 flex flex-col gap-1.5 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Nom & Points de Vie (PV)
                </span>
                {isReadingOCR ? (
                  <span className="text-[10px] text-amber-400 flex items-center gap-1 font-mono animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" /> Lecture OCR...
                  </span>
                ) : detectedName ? (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                    <CheckCircle2 className="w-3 h-3" /> Identifié
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {headerCropPreview && (
                  <div className="w-20 h-7 rounded border border-slate-700 overflow-hidden bg-black flex-shrink-0 flex items-center justify-center shadow">
                    <img
                      src={headerCropPreview}
                      alt="Zoom Titre"
                      className="w-full h-full object-cover"
                      title="En-tête de la carte"
                    />
                  </div>
                )}

                <div className="flex-1 flex items-center gap-1.5">
                  <input
                    type="text"
                    value={detectedName}
                    onChange={(e) => setDetectedName(e.target.value)}
                    placeholder={isReadingOCR ? "Lecture..." : "Nom Pokémon"}
                    className="flex-1 bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-2 py-1 text-xs font-bold text-white focus:outline-none placeholder-slate-600 transition"
                  />
                  <input
                    type="text"
                    value={detectedHP}
                    onChange={(e) => setDetectedHP(e.target.value)}
                    placeholder="PV"
                    className="w-16 bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-1.5 py-1 text-xs font-mono font-bold text-amber-300 focus:outline-none placeholder-slate-600 text-center transition"
                  />
                  <button
                    onClick={handleManualSearch}
                    disabled={isSearchingAPI}
                    title="Rechercher dans la base Pokémon"
                    className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition active:scale-95"
                  >
                    <Search className="w-3.5 h-3.5 text-amber-400" />
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Boîtier Numéro de Carte avec Loupe Agrandie */}
            <div className="w-full bg-slate-950/90 rounded-xl p-2.5 border border-slate-800 flex flex-col gap-1.5 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-emerald-400" />
                  Numéro de Carte
                </span>
                {detectedNumber ? (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                    <CheckCircle2 className="w-3 h-3" /> N° Résolu
                  </span>
                ) : !isReadingOCR ? (
                  <span className="text-[10px] text-slate-500 font-mono">
                    Non détecté
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {footerCropPreview && (
                  <div className="w-24 h-8 rounded border border-emerald-500/60 overflow-hidden bg-black flex-shrink-0 flex items-center justify-center shadow-lg relative group">
                    <img
                      src={footerCropPreview}
                      alt="Loupe Zoom N°"
                      className="w-full h-full object-cover transform scale-110"
                      title="Loupe haute définition zone numéro"
                    />
                    <div className="absolute inset-0 bg-emerald-500/10 pointer-events-none"></div>
                  </div>
                )}

                <div className="flex-1 flex items-center gap-1">
                  <input
                    type="text"
                    value={detectedNumber}
                    onChange={(e) => setDetectedNumber(e.target.value)}
                    placeholder={isReadingOCR ? "Lecture..." : "ex: 123/217"}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-lg px-2 py-1 text-xs font-mono font-bold text-emerald-400 focus:outline-none placeholder-slate-600 transition"
                  />

                  <button
                    onClick={handleCopyCardInfo}
                    title="Copier les informations"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition active:scale-95"
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    onClick={() => readAllCardInfo(lastWarpedCanvasRef.current)}
                    disabled={isReadingOCR || isSearchingAPI}
                    title="Relancer l'analyse OCR et API"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isReadingOCR || isSearchingAPI ? 'animate-spin text-amber-400' : ''}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* 3. Informations Extension & Versions Officielles (TCGdex) */}
            {selectedCardDetails && (
              <div className="w-full bg-slate-950/80 rounded-xl p-2.5 border border-indigo-500/30 flex flex-col gap-1.5 shadow-inner">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-indigo-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    {selectedCardDetails.setName}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-300 font-bold">
                    {selectedCardDetails.rarity}
                  </span>
                </div>

                {/* Variantes / Séries Disponibles */}
                {candidateCards.length > 1 && (
                  <div className="flex flex-col gap-1 pt-1">
                    <span className="text-[9px] text-slate-400 font-medium">Autres extensions trouvées :</span>
                    <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                      {candidateCards.slice(0, 4).map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleSelectCandidate(c)}
                          className={`text-[9px] px-2 py-0.5 rounded-lg border font-mono transition ${
                            selectedCardDetails.id === c.id
                              ? 'bg-indigo-600 text-white font-bold border-indigo-400 shadow'
                              : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          N° {c.localId}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sélecteur de Rendu : Amélioration Auto HD vs Brut */}
            <div className="w-full flex items-center gap-2 pt-1">
              <button
                onClick={() => {
                  const nextState = !autoEnhance;
                  setAutoEnhance(nextState);
                  handleCaptureWarped(nextState);
                }}
                className={`flex-1 py-2 px-3 rounded-xl border text-[11px] font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 ${
                  autoEnhance
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                {autoEnhance ? '✨ HD Éclatant' : '📷 Brut'}
              </button>

              <a
                href={capturedWarpedImage}
                download={`pokemon_${detectedName || 'scan'}_${Date.now()}.jpg`}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition active:scale-95"
                title="Télécharger l'image"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Enregistrer</span>
              </a>
            </div>

            <button
              onClick={() => setCapturedWarpedImage(null)}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition active:scale-95 shadow-md shadow-indigo-600/20"
            >
              Retour au Viseur
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
