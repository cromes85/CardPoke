import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Scan,
  Flashlight,
  RefreshCw,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Maximize2,
  Camera
} from 'lucide-react';
import {
  autoDetectCardEdges,
  TemporalCornerSmoother,
  extractCardWarped,
  POKEMON_RATIO
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

  // Résultat de Détection 100% Automatique
  const [corners, setCorners] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(0.716);
  const [fps, setFps] = useState(0);

  // Extraction & Vérification
  const [capturedWarpedImage, setCapturedWarpedImage] = useState(null);
  const [staticImageSource, setStaticImageSource] = useState(null);

  // FPS & Intervalle
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());
  const lastProcessTimeRef = useRef(0);

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

  // 4. Moteur de Détection Automatique Temps Réel (Boucle RAF)
  useEffect(() => {
    let isRunning = true;
    const workCanvas = document.createElement('canvas');
    const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });

    const processFrame = (timestamp) => {
      if (!isRunning) return;

      // Calcul du FPS
      frameCountRef.current++;
      const now = performance.now();
      if (now - lastFpsTimeRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }

      // Cadencer l'analyse automatique à ~25 FPS pour zéro lag
      if (timestamp - lastProcessTimeRef.current >= 40) {
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

          // Détection 100% Automatique
          const result = autoDetectCardEdges(workCanvas);

          if (result && result.corners) {
            const smoothedCorners = smootherRef.current.update(result.corners);
            setCorners(smoothedCorners);
            setConfidence(result.confidence || 85);
            setAspectRatio(result.ratio);
            setIsLocked(true);
          } else {
            smootherRef.current.update(null);
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
  }, [cameraActive, staticImageSource]);

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
        smootherRef.current.reset();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // 6. Figer & Extraire la carte redressée (630 x 880 px)
  const handleCaptureWarped = () => {
    if (!corners || corners.length !== 4) return;

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
      setCapturedWarpedImage(warped.toDataURL('image/jpeg', 0.94));
    }
  };

  const getSvgPolygonPoints = () => {
    if (!corners) return '';
    return corners.map(pt => `${pt.x * 100},${pt.y * 100}`).join(' ');
  };

  return (
    <div className="relative w-full h-[100dvh] bg-slate-950 flex flex-col justify-between overflow-hidden select-none">
      
      {/* 1. Header Transparent Épuré */}
      <header className="relative z-30 flex items-center justify-between px-4 py-3 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-sm">
            <Scan className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              Détecteur Pokémon
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium ${
                isLocked
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}>
                {isLocked ? '🎯 Carte Verrouillée' : '🔍 Recherche...'}
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 font-mono">
              {fps} FPS • Auto-Vision IA
            </p>
          </div>
        </div>

        {/* Boutons d'actions rapides */}
        <div className="flex items-center gap-2">
          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-2.5 rounded-xl border transition ${
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
              className="p-2.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 active:scale-95 transition"
              title="Changer d'objectif caméra"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
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

        {/* Image Statique de Test */}
        {staticImageSource && (
          <img
            src={staticImageSource.src}
            alt="Carte de test"
            className="w-full h-full object-contain"
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
          {corners && (
            <>
              {/* Polygone de bordure lumineuse avec animation néon */}
              <polygon
                points={getSvgPolygonPoints()}
                className="transition-all duration-75 fill-emerald-500/15 stroke-emerald-400 stroke-[1.2] drop-shadow-[0_0_10px_rgba(52,211,153,0.9)]"
              />

              {/* Réticules lumineux aux 4 coins (TL, TR, BR, BL) */}
              {corners.map((pt, idx) => {
                const labels = ['TL', 'TR', 'BR', 'BL'];
                const colors = ['#38bdf8', '#818cf8', '#34d399', '#f472b6'];
                return (
                  <g key={idx}>
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

        {/* Badge Viseur Flottant : Mesures exactes */}
        {isLocked && corners && (
          <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-center pointer-events-none">
            <div className="bg-slate-900/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-emerald-500/40 text-xs font-mono text-emerald-300 flex items-center gap-2 shadow-xl">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>4 Bords Cadrés ({aspectRatio.toFixed(2)})</span>
            </div>
          </div>
        )}

        {/* Guidage si aucune carte */}
        {!isLocked && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-[65vw] max-w-[280px] aspect-[63/88] rounded-2xl border-2 border-dashed border-slate-600/40 flex flex-col items-center justify-center p-4 text-center">
              <Scan className="w-8 h-8 text-slate-500/60 mb-2 animate-bounce" />
              <p className="text-xs text-slate-400 font-medium">
                Visez n'importe quelle carte Pokémon
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Détection 100% automatique des bords
              </p>
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

        {/* Reprendre Caméra si sur image de test */}
        {staticImageSource && (
          <button
            onClick={() => startCamera(selectedDeviceId)}
            className="py-3 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold active:scale-95 transition"
          >
            <Camera className="w-4 h-4" />
          </button>
        )}
      </footer>

      {/* 4. Modal de Contrôle de l'Extraction Redressée */}
      {capturedWarpedImage && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4">
          <div className="max-w-xs w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col items-center space-y-4">
            <div className="flex items-center justify-between w-full">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Carte Découpée aux 4 Bords
              </h3>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                630 × 880 px
              </span>
            </div>

            <div className="w-full aspect-[63/88] rounded-xl overflow-hidden border-2 border-emerald-500 shadow-2xl bg-slate-950 flex items-center justify-center">
              <img
                src={capturedWarpedImage}
                alt="Carte extraite"
                className="w-full h-full object-cover"
              />
            </div>

            <p className="text-[11px] text-slate-400 text-center">
              Les 4 bords extérieurs ont été détectés et redressés automatiquement.
            </p>

            <button
              onClick={() => setCapturedWarpedImage(null)}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
            >
              Retour au Viseur
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
