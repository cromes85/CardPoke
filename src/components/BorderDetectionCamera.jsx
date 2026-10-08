import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  Flashlight,
  RefreshCw,
  Eye,
  Sliders,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Scan,
  Maximize2,
  Copy,
  Check,
  ZoomIn,
  Move,
  Lock,
  Layers
} from 'lucide-react';
import {
  detectCardCornersHybrid,
  TemporalCornerSmoother,
  extractCardWarped,
  CARD_RATIO,
  sortCornersClockwise
} from '../utils/cardEdgeDetector';

export default function BorderDetectionCamera() {
  // Références matérielles & DOM
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const smootherRef = useRef(new TemporalCornerSmoother(0.30));
  const fileInputRef = useRef(null);
  const svgRef = useRef(null);

  // États Caméra & Flux
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  // Zoom Numérique & Recadrage de visée
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [offsetY, setOffsetY] = useState(0); // Décalage vertical %

  // Mode de Détection : 'auto' (Détection active) | 'manual' (4 poignées tactiles) | 'fixed' (Calibré Fixe)
  const [detectMode, setDetectMode] = useState('auto');

  // Paramètres Détecteur
  const [sensitivity, setSensitivity] = useState(38);
  const [showControls, setShowControls] = useState(true);
  const [copiedCoords, setCopiedCoords] = useState(false);

  // Coins Détectés ou Ajustés
  const [corners, setCorners] = useState([
    { x: 0.20, y: 0.18 }, // TL
    { x: 0.80, y: 0.18 }, // TR
    { x: 0.80, y: 0.82 }, // BR
    { x: 0.20, y: 0.82 }  // BL
  ]);
  const [isLocked, setIsLocked] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(0.716);
  const [fps, setFps] = useState(0);
  const [engineName, setEngineName] = useState('Prêt');

  // Drag & Drop tactile des 4 coins
  const [activeDragCorner, setActiveDragCorner] = useState(null);

  // Extraction / Freeze
  const [capturedWarpedImage, setCapturedWarpedImage] = useState(null);
  const [staticImageSource, setStaticImageSource] = useState(null);

  // Mesure FPS
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());
  const lastProcessTimeRef = useRef(0);

  // 1. Démarrage Caméra
  const startCamera = useCallback(async (deviceId = '') => {
    setCameraError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }

    try {
      const constraints = {
        audio: false,
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          facingMode: deviceId ? undefined : { ideal: 'environment' },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraActive(true);
      setStaticImageSource(null);

      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      setHasTorch(!!capabilities.torch);

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      setVideoDevices(videoInputs);
      if (!selectedDeviceId && videoInputs.length > 0) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.error('Erreur accès caméra:', err);
      setCameraError('Impossible d’accéder à la caméra. Vérifiez les autorisations du navigateur.');
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

  // 2. Bascule Torche
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch (e) {
      console.warn('Torch error:', e);
    }
  };

  // 3. Bascule Caméra
  const handleSwitchCamera = () => {
    if (videoDevices.length <= 1) return;
    const curIdx = videoDevices.findIndex(d => d.deviceId === selectedDeviceId);
    const nextIdx = (curIdx + 1) % videoDevices.length;
    const nextDev = videoDevices[nextIdx];
    setSelectedDeviceId(nextDev.deviceId);
    startCamera(nextDev.deviceId);
  };

  // 4. Boucle de Détection Temps Réel
  useEffect(() => {
    let isRunning = true;
    const workCanvas = document.createElement('canvas');
    const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });

    const processLoop = (timestamp) => {
      if (!isRunning) return;

      // Calcul FPS
      frameCountRef.current++;
      const now = performance.now();
      if (now - lastFpsTimeRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }

      // Cadencer le traitement à ~25 FPS pour garantir une fluidité totale sur mobile
      if (timestamp - lastProcessTimeRef.current >= 40 && detectMode === 'auto') {
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
          // Appliquer le zoom numérique / zone d'intérêt
          const cropW = sw / zoomLevel;
          const cropH = sh / zoomLevel;
          const startX = (sw - cropW) / 2;
          const startY = Math.max(0, Math.min(sh - cropH, (sh - cropH) / 2 + (offsetY / 100) * sh));

          workCanvas.width = 360;
          workCanvas.height = Math.round(360 * (cropH / cropW));

          workCtx.drawImage(
            source,
            startX, startY, cropW, cropH,
            0, 0, workCanvas.width, workCanvas.height
          );

          const res = detectCardCornersHybrid(workCanvas, {
            sensitivity,
            centerBox: { x: 0.16, y: 0.14, width: 0.68, height: 0.72 }
          });

          if (res && res.corners) {
            const smoothed = smootherRef.current.update(res.corners);
            setCorners(smoothed);
            setConfidence(res.confidence);
            setAspectRatio(res.aspectRatio);
            setIsLocked(res.confidence >= 60);
            setEngineName(res.engine || 'Auto');
          } else {
            smootherRef.current.update(null);
            setIsLocked(false);
            setConfidence(0);
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(processLoop);
    };

    animFrameRef.current = requestAnimationFrame(processLoop);

    return () => {
      isRunning = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [detectMode, cameraActive, staticImageSource, sensitivity, zoomLevel, offsetY]);

  // 5. Manipulation tactile directe des 4 coins (Mode Manuel)
  const handleTouchMove = (e) => {
    if (activeDragCorner === null || !svgRef.current) return;
    const touch = e.touches ? e.touches[0] : e;
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height));

    setCorners(prev => {
      const next = [...prev];
      next[activeDragCorner] = { x, y };
      return next;
    });
  };

  const handleTouchEnd = () => {
    setActiveDragCorner(null);
  };

  // 6. Copier les coordonnées exactes des 4 coins
  const handleCopyCoords = () => {
    const text = `📐 Coordonnées des 4 Coins :\n` +
      `1. Haut-Gauche (TL) : X=${(corners[0].x * 100).toFixed(1)}%, Y=${(corners[0].y * 100).toFixed(1)}%\n` +
      `2. Haut-Droit  (TR) : X=${(corners[1].x * 100).toFixed(1)}%, Y=${(corners[1].y * 100).toFixed(1)}%\n` +
      `3. Bas-Droit   (BR) : X=${(corners[2].x * 100).toFixed(1)}%, Y=${(corners[2].y * 100).toFixed(1)}%\n` +
      `4. Bas-Gauche  (BL) : X=${(corners[3].x * 100).toFixed(1)}%, Y=${(corners[3].y * 100).toFixed(1)}%\n\n` +
      `JSON: ${JSON.stringify(corners.map(p => ({ x: Number(p.x.toFixed(3)), y: Number(p.y.toFixed(3)) })))}`;
    
    navigator.clipboard.writeText(text);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2500);
  };

  // 7. Figer & Extraire la carte redressée (630 x 880 px)
  const handleCaptureWarped = () => {
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

    if (width === 0 || height === 0) return;

    const warped = extractCardWarped(canvas, corners, 630, 880);
    if (warped) {
      setCapturedWarpedImage(warped.toDataURL('image/jpeg', 0.92));
    }
  };

  // 8. Charger une image de test depuis la galerie
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
        smootherRef.current.reset();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const getSvgPolygonPoints = () => {
    return corners.map(pt => `${pt.x * 100},${pt.y * 100}`).join(' ');
  };

  return (
    <div
      className="relative w-full h-[100dvh] bg-slate-950 flex flex-col justify-between overflow-hidden select-none"
      onMouseMove={activeDragCorner !== null ? handleTouchMove : undefined}
      onMouseUp={activeDragCorner !== null ? handleTouchEnd : undefined}
      onTouchMove={activeDragCorner !== null ? handleTouchMove : undefined}
      onTouchEnd={activeDragCorner !== null ? handleTouchEnd : undefined}
    >
      
      {/* 1. Header Barre de Statut & HUD */}
      <header className="relative z-30 flex items-center justify-between px-3 py-2.5 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Scan className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white tracking-wide">Détecteur de Bords</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-medium ${
                isLocked || detectMode !== 'auto'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}>
                {detectMode === 'manual' ? '✋ Mode Manuel' : isLocked ? '🎯 Verrouillé' : '🔍 Recherche...'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 flex items-center gap-1.5 font-mono">
              <span>{fps} FPS</span>
              <span>•</span>
              <span>{engineName}</span>
              <span>•</span>
              <span>Zoom {zoomLevel.toFixed(1)}x</span>
            </p>
          </div>
        </div>

        {/* Boutons d'actions rapides */}
        <div className="flex items-center gap-1.5">
          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-2 rounded-xl border transition ${
                torchOn
                  ? 'bg-amber-500 text-black border-amber-400 shadow-md'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              <Flashlight className="w-3.5 h-3.5" />
            </button>
          )}

          {videoDevices.length > 1 && (
            <button
              onClick={handleSwitchCamera}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 active:scale-95 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => setShowControls(prev => !prev)}
            className={`p-2 rounded-xl border transition ${
              showControls
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 2. Viseur Vidéo & Calque de Détection SVG */}
      <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
        
        {/* Flux Caméra avec Zoom & Offset */}
        {cameraActive && (
          <div
            className="w-full h-full flex items-center justify-center transition-transform duration-75 origin-center"
            style={{
              transform: `scale(${zoomLevel}) translateY(${offsetY}%)`
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover sm:object-contain"
            />
          </div>
        )}

        {/* Image Statique de Test */}
        {staticImageSource && (
          <div
            className="w-full h-full flex items-center justify-center origin-center"
            style={{
              transform: `scale(${zoomLevel}) translateY(${offsetY}%)`
            }}
          >
            <img
              src={staticImageSource.src}
              alt="Test"
              className="w-full h-full object-contain"
            />
          </div>
        )}

        {/* Message d'erreur */}
        {cameraError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90">
            <AlertCircle className="w-10 h-10 text-rose-500 mb-2" />
            <p className="text-xs text-slate-200 mb-3">{cameraError}</p>
            <button
              onClick={() => startCamera()}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold"
            >
              Réessayer
            </button>
          </div>
        )}

        {/* Calque de Traçage SVG Dynamique & Poignées d'Angles */}
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full z-10 select-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Lignes de repère guide 63:88 centrales */}
          <rect
            x="20"
            y="18"
            width="60"
            height="64"
            rx="2"
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="0.4"
            strokeDasharray="1,1"
          />

          {/* Polygone de bordure détectée */}
          <polygon
            points={getSvgPolygonPoints()}
            className={`transition-all duration-75 fill-emerald-500/10 stroke-[1.2] ${
              isLocked || detectMode !== 'auto'
                ? 'stroke-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                : 'stroke-amber-400 stroke-dasharray-[2_2]'
            }`}
          />

          {/* Les 4 coins avec poignées tactiles */}
          {corners.map((pt, idx) => {
            const labels = ['TL', 'TR', 'BR', 'BL'];
            const colors = ['#38bdf8', '#818cf8', '#34d399', '#f472b6'];
            const isDragging = activeDragCorner === idx;

            return (
              <g
                key={idx}
                className="cursor-pointer"
                onMouseDown={() => setActiveDragCorner(idx)}
                onTouchStart={() => setActiveDragCorner(idx)}
              >
                {/* Zone de touch agrandie invisible */}
                <circle
                  cx={pt.x * 100}
                  cy={pt.y * 100}
                  r="8"
                  fill="transparent"
                />

                {/* Point d'angle visible */}
                <circle
                  cx={pt.x * 100}
                  cy={pt.y * 100}
                  r={isDragging ? '3.5' : '2.2'}
                  fill={colors[idx]}
                  stroke="#ffffff"
                  strokeWidth="0.6"
                  className="transition-all duration-75 drop-shadow-md"
                />

                {/* Étiquette d'angle */}
                <text
                  x={pt.x * 100 + (idx === 0 || idx === 3 ? -3 : 3)}
                  y={pt.y * 100 + (idx === 0 || idx === 1 ? -3 : 4)}
                  fill="#ffffff"
                  fontSize="2.8"
                  fontWeight="bold"
                  textAnchor={idx === 0 || idx === 3 ? 'end' : 'start'}
                  className="pointer-events-none drop-shadow"
                >
                  {labels[idx]}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Badge Viseur Flottant */}
        <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
          <div className="bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-200 flex items-center gap-2 shadow-lg">
            <span className="text-emerald-400 font-bold">
              {isLocked || detectMode !== 'auto' ? '✓ Bords Cadrés' : 'Alignez la carte'}
            </span>
            <span>•</span>
            <span>Ratio : <strong className="text-indigo-300">{aspectRatio.toFixed(3)}</strong></span>
          </div>

          <button
            onClick={handleCopyCoords}
            className="pointer-events-auto bg-slate-900/90 hover:bg-slate-800 border border-slate-800 px-2 py-1 rounded-lg text-[10px] text-slate-300 flex items-center gap-1 transition"
          >
            {copiedCoords ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
            <span>{copiedCoords ? 'Copié !' : 'Copier Coins'}</span>
          </button>
        </div>
      </div>

      {/* 3. Tiroir de Réglages & Modes de Détection */}
      {showControls && (
        <div className="relative z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-3.5 py-2.5 space-y-2.5">
          
          {/* Sélecteur de Mode */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-medium">
            <button
              onClick={() => {
                setDetectMode('auto');
                smootherRef.current.reset();
              }}
              className={`py-1.5 rounded-lg flex items-center justify-center gap-1 transition ${
                detectMode === 'auto'
                  ? 'bg-emerald-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Scan className="w-3.5 h-3.5" />
              Auto-Aimant
            </button>

            <button
              onClick={() => setDetectMode('manual')}
              className={`py-1.5 rounded-lg flex items-center justify-center gap-1 transition ${
                detectMode === 'manual'
                  ? 'bg-indigo-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Move className="w-3.5 h-3.5" />
              Poignées 4 Coins
            </button>

            <button
              onClick={() => {
                setDetectMode('fixed');
                // Préréglage d'usine Support 3D calibré
                setCorners([
                  { x: 0.268, y: 0.28 },
                  { x: 0.738, y: 0.28 },
                  { x: 0.738, y: 0.82 },
                  { x: 0.268, y: 0.82 }
                ]);
              }}
              className={`py-1.5 rounded-lg flex items-center justify-center gap-1 transition ${
                detectMode === 'fixed'
                  ? 'bg-purple-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              Support 3D Fixe
            </button>
          </div>

          {/* Curseur de Zoom Numérique & Centrage */}
          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-800/80">
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-slate-300 font-medium">
                <span className="flex items-center gap-1">
                  <ZoomIn className="w-3 h-3 text-indigo-400" />
                  Zoom Caméra :
                </span>
                <span className="font-mono text-indigo-300">{zoomLevel.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="3.2"
                step="0.1"
                value={zoomLevel}
                onChange={(e) => setZoomLevel(Number(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-slate-300 font-medium">
                <span>Centrage Vertical :</span>
                <span className="font-mono text-indigo-300">{offsetY > 0 ? `+${offsetY}` : offsetY}%</span>
              </div>
              <input
                type="range"
                min="-20"
                max="20"
                step="1"
                value={offsetY}
                onChange={(e) => setOffsetY(Number(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          </div>

        </div>
      )}

      {/* 4. Barre de Contrôles Inférieure */}
      <footer className="relative z-30 px-3.5 py-2.5 bg-slate-950 border-t border-slate-900 flex items-center justify-between gap-2.5">
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 py-2.5 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 flex items-center justify-center gap-1.5 text-xs font-semibold active:scale-95 transition"
        >
          <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
          Tester Image
        </button>

        <button
          onClick={handleCaptureWarped}
          className="flex-[1.5] py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white flex items-center justify-center gap-1.5 text-xs font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          Figer & Découper (63x88)
        </button>

        {staticImageSource && (
          <button
            onClick={() => startCamera(selectedDeviceId)}
            className="py-2.5 px-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold active:scale-95 transition"
          >
            Caméra
          </button>
        )}
      </footer>

      {/* 5. Modal de Vérification de l'Extraction Redressée */}
      {capturedWarpedImage && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4">
          <div className="max-w-xs w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-2xl flex flex-col items-center space-y-3">
            <div className="flex items-center justify-between w-full">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Carte Extraite à Plat (63x88)
              </h3>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                630 × 880 px
              </span>
            </div>

            <div className="w-full aspect-[63/88] rounded-xl overflow-hidden border-2 border-emerald-500 shadow-xl bg-slate-950 flex items-center justify-center">
              <img
                src={capturedWarpedImage}
                alt="Carte extraite"
                className="w-full h-full object-cover"
              />
            </div>

            <p className="text-[11px] text-slate-400 text-center">
              Vérifiez la découpe sur les 4 bordures extérieures.
            </p>

            <button
              onClick={() => setCapturedWarpedImage(null)}
              className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
            >
              Retour au Viseur
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
