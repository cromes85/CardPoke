import React, { useState, useRef, useEffect } from 'react';
import { RotateCw, RotateCcw, Check, X, Crop, Sparkles, ZoomIn } from 'lucide-react';
import { warpPerspective } from '../utils/cardDetection';

export default function CardCropModal({ sourceCanvas, detectedCorners, onConfirm, onCancel }) {
  const containerRef = useRef(null);
  const previewCanvasRef = useRef(null);

  const [corners, setCorners] = useState(detectedCorners || []);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [activeCornerIdx, setActiveCornerIdx] = useState(null);

  // Initialize and redraw preview canvas
  useEffect(() => {
    if (!sourceCanvas || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0);
  }, [sourceCanvas]);

  // Handle Rotation
  const rotateCanvas = (angleDeg) => {
    setRotation(prev => (prev + angleDeg + 360) % 360);
  };

  // Confirm perspective crop and run OCR
  const handleConfirmCrop = () => {
    if (!sourceCanvas) return;

    // If rotated, rotate source canvas first
    let finalSource = sourceCanvas;
    if (rotation !== 0) {
      const rotated = document.createElement('canvas');
      const ctx = rotated.getContext('2d');
      if (rotation === 90 || rotation === 270) {
        rotated.width = sourceCanvas.height;
        rotated.height = sourceCanvas.width;
      } else {
        rotated.width = sourceCanvas.width;
        rotated.height = sourceCanvas.height;
      }
      ctx.translate(rotated.width / 2, rotated.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
      finalSource = rotated;
    }

    // Warp perspective
    const warped = warpPerspective(finalSource, corners, 630, 880);
    onConfirm(warped, finalSource);
  };

  return (
    <div className="fixed inset-0 z-50 backdrop-blur-md bg-slate-950/85 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
              <Crop className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm sm:text-base">Ajuster le cadrage de la carte</h3>
              <p className="text-[11px] text-slate-400">Vérifiez que les 4 coins englobent bien toute la carte</p>
            </div>
          </div>
          
          <button
            onClick={onCancel}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Canvas Display View */}
        <div 
          ref={containerRef}
          className="relative w-full bg-slate-950 flex items-center justify-center overflow-hidden p-4 max-h-[60vh]"
        >
          <div 
            style={{ transform: `rotate(${rotation}deg)` }}
            className="relative transition-transform duration-200 max-h-[50vh] flex items-center justify-center"
          >
            <canvas
              ref={previewCanvasRef}
              className="max-h-[50vh] max-w-full object-contain rounded-xl border border-slate-800 shadow-xl"
            />
          </div>
        </div>

        {/* Action Controls Toolbar */}
        <div className="p-4 bg-slate-900/95 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          
          {/* Rotation Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => rotateCanvas(-90)}
              title="Pivoter à gauche"
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700/60 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>-90°</span>
            </button>
            <button
              onClick={() => rotateCanvas(90)}
              title="Pivoter à droite"
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700/60 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>+90°</span>
            </button>
          </div>

          {/* Confirm & Retake */}
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Reprendre
            </button>
            <button
              onClick={handleConfirmCrop}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-red-600/30 active:scale-95 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>Analyser la carte</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
