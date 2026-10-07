import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  RotateCw, 
  RotateCcw, 
  X, 
  Crop, 
  Sparkles, 
  Maximize2, 
  Scan, 
  Crosshair
} from 'lucide-react';
import { 
  warpPerspective, 
  detectCardCorners, 
  getDefaultCenteredCorners, 
  orderCorners 
} from '../utils/cardDetection';

export default function CardCropModal({ sourceCanvas, detectedCorners, onConfirm, onCancel }) {
  const containerRef = useRef(null);
  const imageCanvasRef = useRef(null);
  const loupeCanvasRef = useRef(null);

  const [workingCanvas, setWorkingCanvas] = useState(sourceCanvas);
  const [rotation, setRotation] = useState(0);

  // 4 corners: [TL, TR, BR, BL]
  const [corners, setCorners] = useState(() => {
    if (detectedCorners && detectedCorners.length === 4) {
      return orderCorners(detectedCorners);
    }
    return sourceCanvas ? getDefaultCenteredCorners(sourceCanvas.width, sourceCanvas.height) : [];
  });

  const [activeCornerIdx, setActiveCornerIdx] = useState(null);
  const [loupePos, setLoupePos] = useState(null);

  // Redraw preview canvas
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
    }

    ctx.drawImage(workingCanvas, 0, 0);
    setWorkingCanvas(rotated);
    setRotation(prev => (prev + angleDeg + 360) % 360);

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

  // Convert Screen / Pointer Coordinates to Image Pixel Coordinates
  const getCanvasCoords = (clientX, clientY) => {
    if (!imageCanvasRef.current) return null;
    const rect = imageCanvasRef.current.getBoundingClientRect();
    
    const scaleX = workingCanvas.width / rect.width;
    const scaleY = workingCanvas.height / rect.height;

    let x = (clientX - rect.left) * scaleX;
    let y = (clientY - rect.top) * scaleY;

    x = Math.max(0, Math.min(workingCanvas.width, x));
    y = Math.max(0, Math.min(workingCanvas.height, y));

    return { x, y };
  };

  // Universal HTML5 Pointer Event Drag Handlers (Touch + Mouse + Stylus)
  const handlePointerDown = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (err) {}
    setActiveCornerIdx(index);
    updateLoupe(e.clientX, e.clientY, corners[index]);
  };

  const handlePointerMove = (e, index) => {
    if (activeCornerIdx !== index || !workingCanvas) return;
    e.preventDefault();
    e.stopPropagation();

    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (!coords) return;

    setCorners(prev => {
      const next = [...prev];
      next[index] = coords;
      return next;
    });

    updateLoupe(e.clientX, e.clientY, coords);
  };

  const handlePointerUp = (e) => {
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch (err) {}
    setActiveCornerIdx(null);
    setLoupePos(null);
  };

  // Update Magnifier Loupe canvas
  const updateLoupe = (clientX, clientY, imgCoords) => {
    if (!workingCanvas || !loupeCanvasRef.current || !imgCoords) return;
    const loupe = loupeCanvasRef.current;
    const ctx = loupe.getContext('2d');
    const loupeSize = 110;
    const zoom = 2.5;

    loupe.width = loupeSize;
    loupe.height = loupeSize;

    const cropW = loupeSize / zoom;
    const cropH = loupeSize / zoom;
    const sx = Math.max(0, Math.min(workingCanvas.width - cropW, imgCoords.x - cropW / 2));
    const sy = Math.max(0, Math.min(workingCanvas.height - cropH, imgCoords.y - cropH / 2));

    ctx.clearRect(0, 0, loupeSize, loupeSize);
    ctx.drawImage(workingCanvas, sx, sy, cropW, cropH, 0, 0, loupeSize, loupeSize);

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(loupeSize / 2, 0);
    ctx.lineTo(loupeSize / 2, loupeSize);
    ctx.moveTo(0, loupeSize / 2);
    ctx.lineTo(loupeSize, loupeSize / 2);
    ctx.stroke();

    setLoupePos({
      clientX: clientX - 55,
      clientY: clientY - 130
    });
  };

  // Confirm perspective warp & run OCR
  const handleConfirm = () => {
    if (!workingCanvas || corners.length !== 4) return;
    const warped = warpPerspective(workingCanvas, corners, 630, 880);
    onConfirm(warped, workingCanvas);
  };

  const w = workingCanvas?.width || 1;
  const h = workingCanvas?.height || 1;

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
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                  v2.2
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Glissez les 4 pastilles rouges sur les 4 coins exacts de la carte
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

        {/* Quick Toolbar */}
        <div className="px-4 py-2 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleAutoDetect}
              title="Détecter automatiquement les bords de la carte"
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
          className="relative w-full bg-slate-950 flex items-center justify-center overflow-hidden p-3 select-none max-h-[58vh]"
          style={{ touchAction: 'none' }}
        >
          <div className="relative inline-block max-h-[52vh]">
            
            {/* Canvas Base */}
            <canvas
              ref={imageCanvasRef}
              className="max-h-[52vh] max-w-full object-contain block rounded-xl border border-slate-800 shadow-2xl pointer-events-none"
            />

            {/* SVG Mask & Outline */}
            <svg 
              className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
              viewBox={`0 0 ${w} ${h}`}
              preserveAspectRatio="none"
            >
              <defs>
                <mask id="cropMaskV2">
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
                mask="url(#cropMaskV2)" 
              />

              <polygon
                points={corners.map(p => `${p.x},${p.y}`).join(' ')}
                fill="rgba(239, 68, 68, 0.08)"
                stroke="#ef4444"
                strokeWidth={Math.max(2, w * 0.004)}
                strokeDasharray="6,4"
              />
            </svg>

            {/* 4 Interactive Pointer Draggable Handles */}
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
                    touchAction: 'none'
                  }}
                  onPointerDown={(e) => handlePointerDown(e, idx)}
                  onPointerMove={(e) => handlePointerMove(e, idx)}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="absolute cursor-move z-30 flex items-center justify-center p-3 group"
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    isDragging
                      ? 'scale-125 bg-red-500 shadow-[0_0_25px_#ef4444]'
                      : 'bg-red-600 hover:scale-110 shadow-lg shadow-red-500/50 group-hover:bg-red-500'
                  } border-2 border-white text-[11px] font-black text-white shadow-2xl`}>
                    {idx + 1}
                  </div>
                </div>
              );
            })}

          </div>

          {/* Floating Magnifying Loupe */}
          {loupePos && (
            <div
              style={{
                left: `${loupePos.clientX}px`,
                top: `${loupePos.clientY}px`,
              }}
              className="fixed pointer-events-none z-50 rounded-full border-4 border-white shadow-2xl overflow-hidden bg-slate-950 w-28 h-28"
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
