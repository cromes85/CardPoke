import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  RotateCw, 
  RotateCcw, 
  Check, 
  X, 
  Crop, 
  Sparkles, 
  Maximize2, 
  Scan, 
  Crosshair,
  Sliders
} from 'lucide-react';
import { 
  warpPerspective, 
  detectCardCorners, 
  getDefaultCenteredCorners, 
  orderCorners,
  CARD_ASPECT_RATIO 
} from '../utils/cardDetection';

export default function CardCropModal({ sourceCanvas, detectedCorners, onConfirm, onCancel }) {
  const containerRef = useRef(null);
  const imageCanvasRef = useRef(null);
  const loupeCanvasRef = useRef(null);

  // Source canvas working copy (handles rotation)
  const [workingCanvas, setWorkingCanvas] = useState(sourceCanvas);
  const [rotation, setRotation] = useState(0);

  // Corners in image pixel coordinates: [TL, TR, BR, BL]
  const [corners, setCorners] = useState(() => {
    if (detectedCorners && detectedCorners.length === 4) {
      return orderCorners(detectedCorners);
    }
    return sourceCanvas ? getDefaultCenteredCorners(sourceCanvas.width, sourceCanvas.height) : [];
  });

  // Dragging state
  const [activeCornerIdx, setActiveCornerIdx] = useState(null);
  const [loupePos, setLoupePos] = useState(null); // { clientX, clientY, cornerX, cornerY }

  // Draw working canvas on preview
  useEffect(() => {
    if (!workingCanvas || !imageCanvasRef.current) return;
    const canvas = imageCanvasRef.current;
    canvas.width = workingCanvas.width;
    canvas.height = workingCanvas.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(workingCanvas, 0, 0);
  }, [workingCanvas]);

  // Handle Rotation (90 deg left or right)
  const handleRotate = (angleDeg) => {
    if (!workingCanvas) return;
    const rotated = document.createElement('canvas');
    const ctx = rotated.getContext('2d');
    
    if (angleDeg === 90 || angleDeg === -270) {
      rotated.width = workingCanvas.height;
      rotated.height = workingCanvas.width;
      ctx.translate(rotated.width, 0);
      ctx.rotate(Math.PI / 2);
    } else if (angleDeg === -90 || angleDeg === 270) {
      rotated.width = workingCanvas.height;
      rotated.height = workingCanvas.width;
      ctx.translate(0, rotated.height);
      ctx.rotate(-Math.PI / 2);
    } else if (angleDeg === 180) {
      rotated.width = workingCanvas.width;
      rotated.height = workingCanvas.height;
      ctx.translate(rotated.width, rotated.height);
      ctx.rotate(Math.PI);
    }

    ctx.drawImage(workingCanvas, 0, 0);
    setWorkingCanvas(rotated);
    setRotation(prev => (prev + angleDeg + 360) % 360);

    // Auto-detect or reset corners for new orientation
    const newCorners = detectCardCorners(rotated);
    setCorners(newCorners);
  };

  // Re-run Auto Edge Detection
  const handleAutoDetect = () => {
    if (!workingCanvas) return;
    const detected = detectCardCorners(workingCanvas);
    setCorners(detected);
  };

  // Reset to default card ratio centered
  const handleResetCardRatio = () => {
    if (!workingCanvas) return;
    const def = getDefaultCenteredCorners(workingCanvas.width, workingCanvas.height);
    setCorners(def);
  };

  // Reset to full image bounds
  const handleFullImage = () => {
    if (!workingCanvas) return;
    const w = workingCanvas.width;
    const h = workingCanvas.height;
    setCorners([
      { x: 10, y: 10 },
      { x: w - 10, y: 10 },
      { x: w - 10, y: h - 10 },
      { x: 10, y: h - 10 }
    ]);
  };

  // Convert Screen/Touch Coordinates to Image Canvas Pixel Coordinates
  const getCanvasCoords = (clientX, clientY) => {
    if (!imageCanvasRef.current || !containerRef.current) return null;
    const rect = imageCanvasRef.current.getBoundingClientRect();
    
    const scaleX = workingCanvas.width / rect.width;
    const scaleY = workingCanvas.height / rect.height;

    let x = (clientX - rect.left) * scaleX;
    let y = (clientY - rect.top) * scaleY;

    // Clamp within bounds
    x = Math.max(0, Math.min(workingCanvas.width, x));
    y = Math.max(0, Math.min(workingCanvas.height, y));

    return { x, y };
  };

  // Touch / Mouse interaction handlers
  const handlePointerDown = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveCornerIdx(index);
    updateLoupe(e.clientX || e.touches?.[0]?.clientX, e.clientY || e.touches?.[0]?.clientY, corners[index]);
  };

  const handlePointerMove = useCallback((e) => {
    if (activeCornerIdx === null || !workingCanvas) return;
    
    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const clientY = e.clientY || e.touches?.[0]?.clientY;
    if (clientX === undefined || clientY === undefined) return;

    const coords = getCanvasCoords(clientX, clientY);
    if (!coords) return;

    setCorners(prev => {
      const next = [...prev];
      next[activeCornerIdx] = coords;
      return next;
    });

    updateLoupe(clientX, clientY, coords);
  }, [activeCornerIdx, workingCanvas]);

  const handlePointerUp = useCallback(() => {
    setActiveCornerIdx(null);
    setLoupePos(null);
  }, []);

  // Update Magnifier Loupe canvas
  const updateLoupe = (clientX, clientY, imgCoords) => {
    if (!workingCanvas || !loupeCanvasRef.current || !imgCoords) return;
    const loupe = loupeCanvasRef.current;
    const ctx = loupe.getContext('2d');
    const loupeSize = 100;
    const zoom = 2.4;

    loupe.width = loupeSize;
    loupe.height = loupeSize;

    const cropW = loupeSize / zoom;
    const cropH = loupeSize / zoom;
    const sx = Math.max(0, Math.min(workingCanvas.width - cropW, imgCoords.x - cropW / 2));
    const sy = Math.max(0, Math.min(workingCanvas.height - cropH, imgCoords.y - cropH / 2));

    ctx.clearRect(0, 0, loupeSize, loupeSize);
    ctx.drawImage(workingCanvas, sx, sy, cropW, cropH, 0, 0, loupeSize, loupeSize);

    // Draw center crosshair
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(loupeSize / 2, 0);
    ctx.lineTo(loupeSize / 2, loupeSize);
    ctx.moveTo(0, loupeSize / 2);
    ctx.lineTo(loupeSize, loupeSize / 2);
    ctx.stroke();

    setLoupePos({
      clientX: clientX - 60,
      clientY: clientY - 120
    });
  };

  // Add global touch/mouse move & up listeners
  useEffect(() => {
    const onMove = (e) => handlePointerMove(e);
    const onUp = () => handlePointerUp();

    if (activeCornerIdx !== null) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
      window.addEventListener('touchcancel', onUp);
    }

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
    };
  }, [activeCornerIdx, handlePointerMove, handlePointerUp]);

  // Execute Perspective Warp and send to App.jsx
  const handleConfirm = () => {
    if (!workingCanvas || corners.length !== 4) return;
    const warped = warpPerspective(workingCanvas, corners, 630, 880);
    onConfirm(warped, workingCanvas);
  };

  // Calculate percentage positions for SVG polygon
  const w = workingCanvas?.width || 1;
  const h = workingCanvas?.height || 1;
  const polyPoints = corners.map(p => `${(p.x / w) * 100}%,${(p.y / h) * 100}%`).join(' ');

  const cornerLabels = ['Haut Gauche', 'Haut Droit', 'Bas Droit', 'Bas Gauche'];

  return (
    <div className="fixed inset-0 z-50 backdrop-blur-md bg-slate-950/90 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh]">
        
        {/* Modal Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur-sm sticky top-0 z-20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
              <Crop className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm sm:text-base flex items-center gap-1.5">
                <span>Recadrage & Bords de la Carte</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Détection Auto
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Glissez les 4 pastilles colorées sur les 4 coins exacts de la carte
              </p>
            </div>
          </div>
          
          <button
            onClick={onCancel}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Toolbar for Image Adjustment */}
        <div className="px-4 py-2 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleAutoDetect}
              title="Relancer la détection automatique des bords"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-semibold transition-colors"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Détection Auto</span>
            </button>
            <button
              onClick={handleResetCardRatio}
              title="Recentrer au ratio officiel Pokémon 63:88"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 transition-colors"
            >
              <Scan className="w-3.5 h-3.5" />
              <span>Ratio Carte</span>
            </button>
            <button
              onClick={handleFullImage}
              title="Sélectionner toute l'image"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 transition-colors hidden sm:flex"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Plein cadre</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleRotate(-90)}
              title="Pivoter de 90° vers la gauche"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleRotate(90)}
              title="Pivoter de 90° vers la droite"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Interactive Cropper Viewport */}
        <div 
          ref={containerRef}
          className="relative w-full bg-slate-950 flex items-center justify-center overflow-hidden p-3 select-none touch-none max-h-[58vh]"
        >
          <div className="relative inline-block max-h-[52vh]">
            
            {/* Canvas Image Base */}
            <canvas
              ref={imageCanvasRef}
              className="max-h-[52vh] max-w-full object-contain block rounded-xl border border-slate-800 shadow-2xl pointer-events-none"
            />

            {/* Interactive SVG Overlay with Shaded Cutout & Glowing Lines */}
            <svg 
              className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
              viewBox={`0 0 ${w} ${h}`}
              preserveAspectRatio="none"
            >
              {/* Outer dimmed overlay */}
              <defs>
                <mask id="cropMask">
                  <rect x="0" y="0" width={w} height={h} fill="white" />
                  <polygon points={corners.map(p => `${p.x},${p.y}`).join(' ')} fill="black" />
                </mask>
              </defs>

              <rect 
                x="0" 
                y="0" 
                width={w} 
                height={h} 
                fill="rgba(0, 0, 0, 0.65)" 
                mask="url(#cropMask)" 
              />

              {/* Glowing Outline polygon */}
              <polygon
                points={corners.map(p => `${p.x},${p.y}`).join(' ')}
                fill="rgba(239, 68, 68, 0.08)"
                stroke="#ef4444"
                strokeWidth={Math.max(2, w * 0.004)}
                strokeDasharray="6,4"
              />
            </svg>

            {/* 4 Interactive Draggable Corner Handles */}
            {corners.map((corner, idx) => {
              const leftPercent = (corner.x / w) * 100;
              const topPercent = (corner.y / h) * 100;
              const isDragging = activeCornerIdx === idx;

              return (
                <div
                  key={idx}
                  style={{
                    left: `${leftPercent}%`,
                    top: `${topPercent}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onMouseDown={(e) => handlePointerDown(e, idx)}
                  onTouchStart={(e) => handlePointerDown(e, idx)}
                  className="absolute cursor-move z-30 flex items-center justify-center p-3 group"
                >
                  {/* Outer pulsating glow */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    isDragging
                      ? 'scale-125 bg-red-500 shadow-[0_0_20px_#ef4444]'
                      : 'bg-red-600/90 hover:scale-110 shadow-lg shadow-red-500/50 group-hover:bg-red-500'
                  } border-2 border-white text-[10px] font-black text-white shadow-xl`}>
                    {idx + 1}
                  </div>
                </div>
              );
            })}

          </div>

          {/* Floating Magnifying Loupe on Drag */}
          {loupePos && (
            <div
              style={{
                left: `${loupePos.clientX}px`,
                top: `${loupePos.clientY}px`,
              }}
              className="fixed pointer-events-none z-50 rounded-full border-4 border-white shadow-2xl overflow-hidden bg-slate-950 w-24 h-24"
            >
              <canvas
                ref={loupeCanvasRef}
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 sm:p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Annuler
          </button>

          <button
            onClick={handleConfirm}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 hover:opacity-95 text-white font-bold text-xs sm:text-sm shadow-xl shadow-red-600/30 active:scale-95 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            <span>Valider le Cadrage & Analyser</span>
          </button>
        </div>

      </div>
    </div>
  );
}
