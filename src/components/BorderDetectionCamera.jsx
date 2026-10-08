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
  Activity,
  Layers
} from 'lucide-react';
import {
  detectCardCornersHybrid,
  TemporalCornerSmoother,
  extractCardWarped,
  CARD_RATIO
} from '../utils/cardEdgeDetector';

export default function BorderDetectionCamera() {
  // Références matérielles
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const smootherRef = useRef(new TemporalCornerSmoother(0.35));
  const fileInputRef = useRef(null);

  // États Caméra & Détection
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  // Paramètres & Contrôles
  const [sensitivity, setSensitivity] = useState(36);
  const [preferOpenCV, setPreferOpenCV] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Données de Détection en Temps Réel
  const [detectionResult, setDetectionResult] = useState(null);
  const [fps, setFps] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  // Extraction / Freeze
  const [capturedWarpedImage, setCapturedWarpedImage] = useState(null);
  const [staticImageSource, setStaticImageSource] = useState(null);

  // Mesure du FPS
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());

  // 1. Initialisation Caméra
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
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 30, min: 15 }
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

      // Détecter capacités (Torche / Flash)
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      setHasTorch(!!capabilities.torch);

      // Lister les caméras disponibles
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      setVideoDevices(videoInputs);
      if (!selectedDeviceId && videoInputs.length > 0) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.error('Erreur accès caméra:', err);
      setCameraError('Impossible d’accéder à la caméra. Vérifiez les autorisations de votre navigateur.');
      setCameraActive(false);
    }
  }, [selectedDeviceId]);

  // Démarrage initial
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

  // 2. Basculer Torche / Flash
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextState = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextState }]
      });
      setTorchOn(nextState);
    } catch (e) {
      console.warn('Impossible de basculer la torche', e);
    }
  };

  // 3. Basculer Caméra
  const handleSwitchCamera = () => {
    if (videoDevices.length <= 1) return;
    const currentIndex = videoDevices.findIndex(d => d.deviceId === selectedDeviceId);
    const nextIndex = (currentIndex + 1) % videoDevices.length;
    const nextDevice = videoDevices[nextIndex];
    setSelectedDeviceId(nextDevice.deviceId);
    startCamera(nextDevice.deviceId);
  };

  // 4. Boucle de Détection Temps Réel (RequestAnimationFrame)
  useEffect(() => {
    let isRunning = true;
    const workCanvas = document.createElement('canvas');
    const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });

    const processFrame = () => {
      if (!isRunning) return;

      const video = videoRef.current;
      const staticImg = staticImageSource;

      // Calcul du FPS
      frameCountRef.current++;
      const now = performance.now();
      if (now - lastFpsTimeRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }

      let source = null;
      let width = 0;
      let height = 0;

      if (staticImg) {
        source = staticImg;
        width = staticImg.width || staticImg.naturalWidth;
        height = staticImg.height || staticImg.naturalHeight;
      } else if (video && video.readyState >= 2 && video.videoWidth > 0) {
        source = video;
        width = video.videoWidth;
        height = video.videoHeight;
      }

      if (source && width > 0 && height > 0) {
        // Redimensionner le canvas temporaire
        workCanvas.width = width;
        workCanvas.height = height;
        workCtx.drawImage(source, 0, 0, width, height);

        // Exécuter l'algorithme de détection des bords
        const result = detectCardCornersHybrid(workCanvas, {
          sensitivity,
          preferOpenCV,
          debug: showDebug
        });

        if (result && result.corners) {
          // Lissage temporel
          const smoothedCorners = smootherRef.current.update(result.corners);
          result.corners = smoothedCorners;

          setDetectionResult(result);
          setIsLocked(result.confidence >= 65);
        } else {
          smootherRef.current.update(null);
          setDetectionResult(null);
          setIsLocked(false);
        }
      }

      // Prochaine frame (cadencé à ~30 FPS sur mobile)
      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      isRunning = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [cameraActive, staticImageSource, sensitivity, preferOpenCV, showDebug]);

  // 5. Charger une image de test depuis l'appareil
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
        }
        setCameraActive(false);
        setStaticImageSource(img);
        smootherRef.current.reset();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // 6. Figer & Extraire la carte redressée selon les 4 bords
  const handleCaptureWarped = () => {
    if (!detectionResult || !detectionResult.corners) return;

    const canvas = document.createElement('canvas');
    let width = 0;
    let height = 0;

    if (staticImageSource) {
      width = staticImageSource.naturalWidth || staticImageSource.width;
      height = staticImageSource.naturalHeight || staticImageSource.height;
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(staticImageSource, 0, 0);
    } else if (videoRef.current) {
      width = videoRef.current.videoWidth;
      height = videoRef.current.videoHeight;
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    }

    if (width === 0 || height === 0) return;

    const warped = extractCardWarped(canvas, detectionResult.corners, 630, 880);
    if (warped) {
      setCapturedWarpedImage(warped.toDataURL('image/jpeg', 0.92));
    }
  };

  // Conversion des coordonnées relatives [0..1] en SVG polygon points
  const getSvgPolygonPoints = () => {
    if (!detectionResult || !detectionResult.corners) return '';
    return detectionResult.corners.map(pt => `${pt.x * 100},${pt.y * 100}`).join(' ');
  };

  return (
    <div className="relative w-full h-[100dvh] bg-slate-950 flex flex-col justify-between overflow-hidden select-none">
      
      {/* 1. Header Barre de Statut & HUD */}
      <header className="relative z-30 flex items-center justify-between px-4 py-3 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Scan className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              Détecteur de Bords
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium ${
                isLocked
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}>
                {isLocked ? '🎯 Carte Verrouillée' : '🔍 Recherche Bords...'}
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 flex items-center gap-2">
              <span>{fps} FPS</span>
              <span>•</span>
              <span>{detectionResult?.engine || 'PureJS Outside-In'}</span>
            </p>
          </div>
        </div>

        {/* Boutons d'actions rapides du header */}
        <div className="flex items-center gap-2">
          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-2 rounded-xl transition border ${
                torchOn
                  ? 'bg-amber-500 text-black border-amber-400 shadow-lg shadow-amber-500/30'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
              title="Allumer le Flash"
            >
              <Flashlight className="w-4 h-4" />
            </button>
          )}

          {videoDevices.length > 1 && (
            <button
              onClick={handleSwitchCamera}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 active:scale-95 transition"
              title="Changer d'objectif caméra"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => setShowControls(prev => !prev)}
            className={`p-2 rounded-xl border transition ${
              showControls
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Panneau de réglages"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. Viseur Vidéo & Calque de Détection SVG */}
      <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
        
        {/* Flux Caméra */}
        {cameraActive && (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover sm:object-contain"
          />
        )}

        {/* Image Statique de Test (si chargée depuis la galerie) */}
        {staticImageSource && (
          <img
            src={staticImageSource.src}
            alt="Carte de test"
            className="w-full h-full object-contain"
          />
        )}

        {/* Message d'erreur caméra */}
        {cameraError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90">
            <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
            <p className="text-sm text-slate-200 mb-4 max-w-xs">{cameraError}</p>
            <button
              onClick={() => startCamera()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
            >
              Réessayer l'accès caméra
            </button>
          </div>
        )}

        {/* Calque de Traçage SVG Dynamique */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {detectionResult && detectionResult.corners && (
            <>
              {/* Polygone de bordure lumineuse */}
              <polygon
                points={getSvgPolygonPoints()}
                className={`transition-all duration-75 fill-transparent stroke-[1.2] ${
                  isLocked
                    ? 'stroke-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                    : 'stroke-amber-400 stroke-dasharray-[2_2] drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]'
                }`}
              />

              {/* Réticules aux 4 coins (TL, TR, BR, BL) */}
              {detectionResult.corners.map((pt, idx) => {
                const labels = ['TL', 'TR', 'BR', 'BL'];
                const colors = ['#38bdf8', '#818cf8', '#34d399', '#f472b6'];
                return (
                  <g key={idx}>
                    {/* Cercle d'angle */}
                    <circle
                      cx={pt.x * 100}
                      cy={pt.y * 100}
                      r="1.8"
                      fill={colors[idx]}
                      stroke="#ffffff"
                      strokeWidth="0.5"
                      className="drop-shadow-md"
                    />
                    {/* Réticule en croix */}
                    <line
                      x1={pt.x * 100 - 1.2}
                      y1={pt.y * 100}
                      x2={pt.x * 100 + 1.2}
                      y2={pt.y * 100}
                      stroke="#ffffff"
                      strokeWidth="0.4"
                    />
                    <line
                      x1={pt.x * 100}
                      y1={pt.y * 100 - 1.2}
                      x2={pt.x * 100}
                      y2={pt.y * 100 + 1.2}
                      stroke="#ffffff"
                      strokeWidth="0.4"
                    />
                  </g>
                );
              })}
            </>
          )}

          {/* Points de debug du balayage (si activé) */}
          {showDebug && detectionResult?.debugPoints && detectionResult.debugPoints.map((pt, i) => (
            <circle
              key={i}
              cx={(pt.x / 400) * 100}
              cy={(pt.y / 300) * 100}
              r="0.5"
              fill="#ef4444"
            />
          ))}
        </svg>

        {/* Badge Viseur Flottant : Mesures exactes des bords */}
        {detectionResult && (
          <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
            <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-200 flex items-center gap-3 shadow-lg">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                Confiance : <strong className="text-emerald-400">{detectionResult.confidence}%</strong>
              </span>
              <span>•</span>
              <span>Ratio : <strong className="text-indigo-300">{detectionResult.aspectRatio.toFixed(3)}</strong> (Réf: {CARD_RATIO.toFixed(3)})</span>
              <span>•</span>
              <span>Surface : <strong className="text-amber-300">{detectionResult.areaPercent}%</strong></span>
            </div>
          </div>
        )}

        {/* Lignes de repère centrales légères si aucune carte */}
        {!detectionResult && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-[63vw] max-w-[280px] aspect-[63/88] rounded-2xl border-2 border-dashed border-slate-600/50 flex flex-col items-center justify-center p-4 text-center">
              <Scan className="w-8 h-8 text-slate-500/70 mb-2 animate-bounce" />
              <p className="text-xs text-slate-400 font-medium">
                Placez une carte Pokémon dans le champ de vision
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Détection automatique des 4 bords extérieurs
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. Tiroir de Réglages & Panneau d'Analyse (Repliable) */}
      {showControls && (
        <div className="relative z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-4 py-3.5 space-y-3">
          
          {/* Ligne 1 : Curseur de Sensibilité du Détecteur */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs font-medium text-slate-300">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                Sensibilité du contour (Seuil Gradient) :
              </span>
              <span className="font-mono text-indigo-300 font-bold">{sensitivity}</span>
            </div>
            <input
              type="range"
              min="15"
              max="75"
              value={sensitivity}
              onChange={(e) => setSensitivity(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Plus Sensible (Cartes sombres / peu contrastées)</span>
              <span>Moins Sensible (Anti-bruit)</span>
            </div>
          </div>

          {/* Ligne 2 : Options avancées & Vue Debug */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80 text-xs">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showDebug}
                onChange={(e) => setShowDebug(e.target.checked)}
                className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-800"
              />
              <span className="flex items-center gap-1 text-[11px]">
                <Eye className="w-3.5 h-3.5 text-slate-400" />
                Afficher Masque Rayons (Debug)
              </span>
            </label>

            {typeof window !== 'undefined' && window.cv && (
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferOpenCV}
                  onChange={(e) => setPreferOpenCV(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-800"
                />
                <span className="text-[11px] font-mono text-emerald-400">OpenCV.js Mode</span>
              </label>
            )}
          </div>
        </div>
      )}

      {/* 4. Barre de Contrôles Inférieure */}
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
          className="flex-1 py-3 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 transition"
        >
          <ImageIcon className="w-4 h-4 text-slate-400" />
          Tester Image
        </button>

        {/* Déclencher Capture & Vérifier Redressement 63:88 */}
        <button
          onClick={handleCaptureWarped}
          disabled={!detectionResult}
          className={`flex-[1.5] py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold shadow-lg transition active:scale-95 ${
            detectionResult
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-emerald-500/25'
              : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
          }`}
        >
          <Maximize2 className="w-4 h-4" />
          Figer & Redresser (63x88)
        </button>

        {/* Reprendre Flux Caméra si sur Image */}
        {staticImageSource && (
          <button
            onClick={() => startCamera(selectedDeviceId)}
            className="py-3 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold active:scale-95 transition"
          >
            Reprendre Caméra
          </button>
        )}
      </footer>

      {/* 5. Modal de Vérification de l'Extraction Redressée */}
      {capturedWarpedImage && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
          <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col items-center space-y-4">
            <div className="flex items-center justify-between w-full">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Carte Découpée aux Bords Exacts
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                630 × 880 px
              </span>
            </div>

            {/* Aperçu de la carte extraite */}
            <div className="w-full aspect-[63/88] rounded-xl overflow-hidden border-2 border-emerald-500 shadow-xl bg-slate-950 flex items-center justify-center">
              <img
                src={capturedWarpedImage}
                alt="Carte extraite"
                className="w-full h-full object-cover"
              />
            </div>

            <p className="text-xs text-slate-400 text-center">
              Les 4 bords extérieurs ont été détectés et redressés à plat avec succès.
            </p>

            <div className="flex items-center gap-3 w-full">
              <button
                onClick={() => setCapturedWarpedImage(null)}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
              >
                Retour au Viseur
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
