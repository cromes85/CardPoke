import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  RotateCw, 
  RotateCcw, 
  X, 
  Crop, 
  Sparkles, 
  Maximize2, 
  Scan, 
  Crosshair,
  Eye,
  Move,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sun,
  Copy,
  Save,
  Check,
  BookmarkCheck
} from 'lucide-react';
import { 
  warpPerspective, 
  detectCardCorners, 
  getDefaultCenteredCorners, 
  orderCorners,
  snapAllCornersToEdges,
  snapPointToEdge,
  expandCornersToOuterEdges,
  fitCardCornersToRatio,
  autoEnhanceLighting
} from '../utils/cardDetection';

export default function CardCropModal({ sourceCanvas, detectedCorners, onConfirm, onCancel }) {
  const containerRef = useRef(null);
  const imageCanvasRef = useRef(null);
  const loupeCanvasRef = useRef(null);
  const miniPreviewCanvasRef = useRef(null);

  const [workingCanvas, setWorkingCanvas] = useState(sourceCanvas);
  const [rotation, setRotation] = useState(0);
  const [showMiniPreview, setShowMiniPreview] = useState(true);
  const [selectedCornerIdx, setSelectedCornerIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [savedAsCalibration, setSavedAsCalibration] = useState(false);

  // 4 corners: [TL, TR, BR, BL]
  const [corners, setCorners] = useState(() => {
    if (detectedCorners && detectedCorners.length === 4) {
      return orderCorners(detectedCorners);
    }
    const savedCustom = localStorage.getItem('pokescan_custom_corners');
    if (savedCustom && sourceCanvas) {
      try {
        const parsed = JSON.parse(savedCustom);
        if (parsed.length === 4) {
          const w = sourceCanvas.width;
          const h = sourceCanvas.height;
          return parsed.map(pt => ({
            x: pt.x * w,
            y: pt.y * h
          }));
        }
      } catch (e) {}
    }
    if (sourceCanvas) {
      return detectCardCorners(sourceCanvas);
    }
    return [];
  });

  const [activeCornerIdx, setActiveCornerIdx] = useState(null);
  const [isDraggingBox, setIsDraggingBox] = useState(false);
  const [dragStartPos, setDragStartPos] = useState(null);
  const [initialCornersOnDrag, setInitialCornersOnDrag] = useState(null);
  const [loupePos, setLoupePos] = useState(null);

  // Redraw main viewport image
  useEffect(() => {
    if (!workingCanvas || !imageCanvasRef.current) return;
    const canvas = imageCanvasRef.current;
    canvas.width = workingCanvas.width;
    canvas.height = workingCanvas.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(workingCanvas, 0, 0);
  }, [workingCanvas]);

  // Update Mini Warped Preview when corners change
  useEffect(() => {
    if (!showMiniPreview || !workingCanvas || !miniPreviewCanvasRef.current || corners.length !== 4) return;
    try {
      const warped = warpPerspective(workingCanvas, corners, 240, 335);
      const canvas = miniPreviewCanvasRef.current;
      canvas.width = 240;
      canvas.height = 335;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(warped, 0, 0);
    } catch (e) {}
  }, [corners, workingCanvas, showMiniPreview]);

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

  // 1-Click Magnetic Snap to Real Card Edges
  const handleSnapEdges = () => {
    if (!workingCanvas || corners.length !== 4) return;
    const snapped = snapAllCornersToEdges(workingCanvas, corners, 35);
    setCorners(snapped);
  };

  // 1-Click Expand to Outermost Real Card Borders
  const handleExpandToOuterEdges = () => {
    if (!workingCanvas || corners.length !== 4) return;
    const expanded = expandCornersToOuterEdges(workingCanvas, corners, 1.08);
    setCorners(expanded);
  };

  // Lock and Fit to Official 63:88 Card Ratio
  const handleFitRatio = () => {
    if (!workingCanvas || corners.length !== 4) return;
    const fitted = fitCardCornersToRatio(corners);
    setCorners(fitted);
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

  // 1-Click AI Ambient Lighting Equalizer & Anti-Shadow Lifter
  const handleEnhanceLighting = () => {
    if (!workingCanvas) return;
    const enhanced = autoEnhanceLighting(workingCanvas, 1.0);
    setWorkingCanvas(enhanced);
  };

  // Nudge Selected Corner with Arrow Buttons (for ultra-precise adjustment)
  const handleNudge = (dx, dy) => {
    if (selectedCornerIdx === null || !workingCanvas) return;
    const w = workingCanvas.width;
    const h = workingCanvas.height;

    setCorners(prev => {
      const next = [...prev];
      const cur = next[selectedCornerIdx];
      next[selectedCornerIdx] = {
        x: Math.max(0, Math.min(w, cur.x + dx * (w * 0.006))),
        y: Math.max(0, Math.min(h, cur.y + dy * (h * 0.006)))
      };
      return next;
    });
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

  // Corner Drag Handlers
  const handleCornerPointerDown = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (err) {}
    setActiveCornerIdx(index);
    setSelectedCornerIdx(index);
    updateLoupe(e.clientX, e.clientY, corners[index]);
  };

  const handleCornerPointerMove = (e, index) => {
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

  const handleCornerPointerUp = (e) => {
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch (err) {}
    setActiveCornerIdx(null);
    setLoupePos(null);
  };

  // Box Drag Handlers (Drag entire card quad by grabbing inside)
  const handleBoxPointerDown = (e) => {
    if (activeCornerIdx !== null) return;
    e.preventDefault();
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (err) {}
    setIsDraggingBox(true);
    setDragStartPos({ clientX: e.clientX, clientY: e.clientY });
    setInitialCornersOnDrag(corners.map(p => ({ ...p })));
  };

  const handleBoxPointerMove = (e) => {
    if (!isDraggingBox || !dragStartPos || !initialCornersOnDrag || !imageCanvasRef.current || !workingCanvas) return;
    e.preventDefault();

    const rect = imageCanvasRef.current.getBoundingClientRect();
    const scaleX = workingCanvas.width / rect.width;
    const scaleY = workingCanvas.height / rect.height;

    const deltaX = (e.clientX - dragStartPos.clientX) * scaleX;
    const deltaY = (e.clientY - dragStartPos.clientY) * scaleY;

    const w = workingCanvas.width;
    const h = workingCanvas.height;

    // Check bounds
    let canMove = true;
    for (const p of initialCornersOnDrag) {
      if (p.x + deltaX < 0 || p.x + deltaX > w || p.y + deltaY < 0 || p.y + deltaY > h) {
        canMove = false;
        break;
      }
    }

    if (canMove) {
      setCorners(initialCornersOnDrag.map(p => ({
        x: p.x + deltaX,
        y: p.y + deltaY
      })));
    }
  };

  const handleBoxPointerUp = (e) => {
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch (err) {}
    setIsDraggingBox(false);
    setDragStartPos(null);
    setInitialCornersOnDrag(null);
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

  const w = workingCanvas?.width || 1;
  const h = workingCanvas?.height || 1;

  // Format 4 corners as readable string and JSON
  const getFormattedCoordinates = () => {
    if (!workingCanvas || corners.length !== 4) return '';
    const p1 = { x: ((corners[0].x / w) * 100).toFixed(1), y: ((corners[0].y / h) * 100).toFixed(1) };
    const p2 = { x: ((corners[1].x / w) * 100).toFixed(1), y: ((corners[1].y / h) * 100).toFixed(1) };
    const p3 = { x: ((corners[2].x / w) * 100).toFixed(1), y: ((corners[2].y / h) * 100).toFixed(1) };
    const p4 = { x: ((corners[3].x / w) * 100).toFixed(1), y: ((corners[3].y / h) * 100).toFixed(1) };

    return `📐 Coordonnées des 4 Coins :\n` +
           `1. Haut-Gauche (TL) : X=${p1.x}%, Y=${p1.y}%\n` +
           `2. Haut-Droit  (TR) : X=${p2.x}%, Y=${p2.y}%\n` +
           `3. Bas-Droit   (BR) : X=${p3.x}%, Y=${p3.y}%\n` +
           `4. Bas-Gauche  (BL) : X=${p4.x}%, Y=${p4.y}%\n\n` +
           `JSON: ` + JSON.stringify(corners.map(pt => ({
             x: Number((pt.x / w).toFixed(4)),
             y: Number((pt.y / h).toFixed(4))
           })));
  };

  // Copy coordinates to clipboard
  const handleCopyCoordinates = () => {
    const text = getFormattedCoordinates();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Save 4 corners as permanent calibration for 3D and Auto modes
  const handleSaveAsPermanentCalibration = () => {
    if (!workingCanvas || corners.length !== 4) return;
    const relativeCorners = corners.map(pt => ({
      x: Number((pt.x / w).toFixed(4)),
      y: Number((pt.y / h).toFixed(4))
    }));
    localStorage.setItem('pokescan_custom_corners', JSON.stringify(relativeCorners));
    setSavedAsCalibration(true);
    setTimeout(() => setSavedAsCalibration(false), 3000);
  };

  // Reset permanent calibration
  const handleResetPermanentCalibration = () => {
    localStorage.removeItem('pokescan_custom_corners');
    setSavedAsCalibration(false);
    handleAutoDetect();
  };

  // Confirm perspective warp & run OCR
  const handleConfirm = () => {
    if (!workingCanvas || corners.length !== 4) return;
    const warped = warpPerspective(workingCanvas, corners, 630, 880);
    onConfirm(warped, workingCanvas);
  };

  return (
    <div className="fixed inset-0 z-50 backdrop-blur-md bg-slate-950/90 flex items-center justify-center p-1.5 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[96vh]">
        
        {/* Modal Header */}
        <div className="p-2.5 sm:p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 backdrop-blur-sm sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="p-1.5 sm:p-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
              <Crop className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div>
              <h3 className="text-white font-bold text-xs sm:text-base flex items-center gap-1.5">
                <span>Cadrage Automatique & Calibrage 4 Coins</span>
                <span className="text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                  v3.6.4
                </span>
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-400">
                Ajustez les 4 coins au doigt ou sauvegardez pour le mode 3D & Auto
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
        <div className="px-3 sm:px-4 py-2 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleAutoDetect}
              title="Recalculer la détection automatique IA des 4 bords extérieurs"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 font-bold transition-all shadow-sm"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Auto-Ajuster IA</span>
            </button>
            <button
              onClick={handleExpandToOuterEdges}
              title="Agrandir et caler les 4 coins sur les bordures extérieures physiques réelles de la carte"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 font-bold border border-blue-500/40 transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Bords Extérieurs</span>
            </button>
            <button
              onClick={handleSnapEdges}
              title="Magnétiser les 4 coins automatiquement sur les vrais bords de la carte"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 font-bold border border-purple-500/40 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Magnétiser Bords</span>
            </button>
            <button
              onClick={handleEnhanceLighting}
              title="Égaliser l'éclairage ambiant, déboucher les ombres et éliminer les reflets"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold border border-amber-500/40 transition-colors"
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Éclairage IA</span>
            </button>
            <button
              onClick={handleFitRatio}
              title="Ajuster et verrouiller au ratio officiel Pokémon 63:88"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 transition-colors"
            >
              <Scan className="w-3.5 h-3.5" />
              <span>Ratio 63:88</span>
            </button>
            <button
              onClick={handleResetCardRatio}
              title="Recentrer le cadre au milieu"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 transition-colors hidden sm:flex"
            >
              <Move className="w-3.5 h-3.5" />
              <span>Recentrer</span>
            </button>
            <button
              onClick={() => setShowMiniPreview(!showMiniPreview)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-semibold border transition-colors ${
                showMiniPreview 
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/40' 
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Aperçu</span>
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

        {/* Live 4-Corner Coordinates & Calibration Bar */}
        <div className="px-3 sm:px-4 py-2 bg-slate-950 border-b border-slate-800 flex flex-col gap-1.5">
          <div className="flex items-center justify-between flex-wrap gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-black text-amber-300 flex items-center gap-1">
                <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                <span>Coordonnées des 4 Coins</span>
              </span>
              {savedAsCalibration && (
                <span className="text-[9.5px] px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1 animate-pulse">
                  <Check className="w-3 h-3" /> Cadrage 3D Sauvegardé !
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={handleCopyCoordinates}
                title="Copier les coordonnées des 4 coins dans le presse-papier"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-[10.5px] font-bold transition-all shadow-sm active:scale-95"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-blue-400" />}
                <span>{copied ? '✅ Copié !' : '📋 Copier Coordonnées'}</span>
              </button>

              <button
                onClick={handleSaveAsPermanentCalibration}
                title="Enregistrer ce cadrage exact pour qu'il soit appliqué automatiquement tout le temps en mode 3D et Auto"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/50 text-[10.5px] font-black transition-all shadow-sm active:scale-95"
              >
                <Save className="w-3 h-3 text-emerald-400" />
                <span>💾 Enregistrer pour Support 3D & Auto</span>
              </button>
            </div>
          </div>

          {/* 4 Interactive Corner Pill Displays */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] font-mono">
            <div 
              onClick={() => setSelectedCornerIdx(0)}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                selectedCornerIdx === 0 
                  ? 'bg-red-950/60 border-red-500 text-red-200 ring-1 ring-red-500/50' 
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between font-sans text-[9px] font-bold text-red-400 mb-0.5">
                <span>1. Haut-Gauche (TL)</span>
                {selectedCornerIdx === 0 && <span className="text-[8px] bg-red-600 text-white px-1 rounded">Actif</span>}
              </div>
              <div>X: {((corners[0]?.x / w) * 100).toFixed(1)}% | Y: {((corners[0]?.y / h) * 100).toFixed(1)}%</div>
            </div>

            <div 
              onClick={() => setSelectedCornerIdx(1)}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                selectedCornerIdx === 1 
                  ? 'bg-red-950/60 border-red-500 text-red-200 ring-1 ring-red-500/50' 
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between font-sans text-[9px] font-bold text-red-400 mb-0.5">
                <span>2. Haut-Droit (TR)</span>
                {selectedCornerIdx === 1 && <span className="text-[8px] bg-red-600 text-white px-1 rounded">Actif</span>}
              </div>
              <div>X: {((corners[1]?.x / w) * 100).toFixed(1)}% | Y: {((corners[1]?.y / h) * 100).toFixed(1)}%</div>
            </div>

            <div 
              onClick={() => setSelectedCornerIdx(2)}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                selectedCornerIdx === 2 
                  ? 'bg-red-950/60 border-red-500 text-red-200 ring-1 ring-red-500/50' 
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between font-sans text-[9px] font-bold text-red-400 mb-0.5">
                <span>3. Bas-Droit (BR)</span>
                {selectedCornerIdx === 2 && <span className="text-[8px] bg-red-600 text-white px-1 rounded">Actif</span>}
              </div>
              <div>X: {((corners[2]?.x / w) * 100).toFixed(1)}% | Y: {((corners[2]?.y / h) * 100).toFixed(1)}%</div>
            </div>

            <div 
              onClick={() => setSelectedCornerIdx(3)}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                selectedCornerIdx === 3 
                  ? 'bg-red-950/60 border-red-500 text-red-200 ring-1 ring-red-500/50' 
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between font-sans text-[9px] font-bold text-red-400 mb-0.5">
                <span>4. Bas-Gauche (BL)</span>
                {selectedCornerIdx === 3 && <span className="text-[8px] bg-red-600 text-white px-1 rounded">Actif</span>}
              </div>
              <div>X: {((corners[3]?.x / w) * 100).toFixed(1)}% | Y: {((corners[3]?.y / h) * 100).toFixed(1)}%</div>
            </div>
          </div>
        </div>

        {/* Interactive Cropper Viewport */}
        <div 
          ref={containerRef}
          className="relative w-full bg-slate-950 flex items-center justify-center overflow-hidden p-3 select-none max-h-[55vh]"
          style={{ touchAction: 'none' }}
        >
          <div className="relative inline-block max-h-[50vh]">
            
            {/* Canvas Base */}
            <canvas
              ref={imageCanvasRef}
              className="max-h-[50vh] max-w-full object-contain block rounded-xl border border-slate-800 shadow-2xl pointer-events-none"
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

              {/* Polygon border */}
              <polygon
                points={corners.map(p => `${p.x},${p.y}`).join(' ')}
                fill="rgba(239, 68, 68, 0.08)"
                stroke="#ef4444"
                strokeWidth={Math.max(2, w * 0.004)}
                strokeDasharray="6,4"
              />

              {/* Center Crosshair / Drag Target */}
              {corners.length === 4 && (
                <g 
                  transform={`translate(${(corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4}, ${(corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4})`}
                  className="pointer-events-auto cursor-grab active:cursor-grabbing"
                  onPointerDown={handleBoxPointerDown}
                  onPointerMove={handleBoxPointerMove}
                  onPointerUp={handleBoxPointerUp}
                  onPointerCancel={handleBoxPointerUp}
                >
                  <circle r={Math.max(16, w * 0.04)} fill="rgba(15, 23, 42, 0.75)" stroke="#ef4444" strokeWidth="2" />
                  <path d="M -8 0 L 8 0 M 0 -8 L 0 8" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                </g>
              )}
            </svg>

            {/* 4 Interactive Pointer Draggable Handles */}
            {corners.map((corner, idx) => {
              const leftPercent = (corner.x / w) * 100;
              const topPercent = (corner.y / h) * 100;
              const isDragging = activeCornerIdx === idx;
              const isSelected = selectedCornerIdx === idx;

              return (
                <div
                  key={idx}
                  style={{
                    left: `${leftPercent}%`,
                    top: `${topPercent}%`,
                    transform: 'translate(-50%, -50%)',
                    touchAction: 'none'
                  }}
                  onPointerDown={(e) => handleCornerPointerDown(e, idx)}
                  onPointerMove={(e) => handleCornerPointerMove(e, idx)}
                  onPointerUp={handleCornerPointerUp}
                  onPointerCancel={handleCornerPointerUp}
                  className="absolute cursor-move z-30 flex items-center justify-center p-3 group"
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    isDragging
                      ? 'scale-125 bg-red-500 shadow-[0_0_25px_#ef4444]'
                      : isSelected
                        ? 'bg-red-600 ring-4 ring-red-400/50 scale-110 shadow-xl'
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

          {/* Live Mini Straightened Card Preview */}
          {showMiniPreview && (
            <div className="absolute bottom-3 right-3 z-40 bg-slate-900/95 border-2 border-slate-700 rounded-2xl shadow-2xl p-2 max-w-[110px] backdrop-blur-md">
              <span className="text-[9px] font-bold text-slate-400 block mb-1 text-center">
                Aperçu Redressé
              </span>
              <canvas
                ref={miniPreviewCanvasRef}
                className="w-full aspect-[63/88] rounded-lg border border-slate-800 object-cover"
              />
            </div>
          )}
        </div>

        {/* Micro-Adjustment Precision Controls */}
        <div className="px-4 py-2 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
            <span className="font-semibold text-slate-300">Coin {selectedCornerIdx + 1} :</span>
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3].map(i => (
                <button
                  key={i}
                  onClick={() => setSelectedCornerIdx(i)}
                  className={`w-6 h-6 rounded-md font-bold text-[10px] transition-colors ${
                    selectedCornerIdx === i
                      ? 'bg-red-600 text-white shadow-md'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>

          {/* D-Pad Nudge Arrows */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => handleNudge(-1, 0)}
              title="Déplacer vers la gauche"
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleNudge(0, -1)}
              title="Déplacer vers le haut"
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleNudge(0, 1)}
              title="Déplacer vers le bas"
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleNudge(1, 0)}
              title="Déplacer vers la droite"
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-2.5 sm:p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-2">
          <button
            onClick={onCancel}
            className="px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Annuler
          </button>

          <button
            onClick={handleConfirm}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 sm:px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 hover:opacity-95 text-white font-bold text-xs sm:text-sm shadow-xl shadow-red-600/30 active:scale-95 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            <span>Valider & Analyser</span>
          </button>
        </div>

      </div>
    </div>
  );
}
