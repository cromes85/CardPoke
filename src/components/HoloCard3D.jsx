import React, { useState, useRef } from 'react';

export default function HoloCard3D({ imageUrl, name, rarity, className = '' }) {
  const cardRef = useRef(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Max 18 deg tilt
    const rotX = -((y - centerY) / centerY) * 16;
    const rotY = ((x - centerX) / centerX) * 16;
    
    setRotateX(rotX);
    setRotateY(rotY);
    setGlarePos({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.65
    });
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
    setGlarePos(prev => ({ ...prev, opacity: 0 }));
  };

  const isHolo = (rarity || '').toLowerCase().includes('rare') || 
                 (rarity || '').toLowerCase().includes('holo') || 
                 (rarity || '').toLowerCase().includes('ultra') || 
                 (rarity || '').toLowerCase().includes('secret');

  return (
    <div 
      className={`perspective-1000 select-none ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={cardRef}
        style={{
          transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
          transition: rotateX === 0 ? 'transform 0.5s ease-out' : 'transform 0.05s ease-out'
        }}
        className="relative rounded-2xl overflow-hidden shadow-2xl transition-shadow duration-300 border border-slate-700/60 bg-slate-900 group"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name || 'Carte Pokémon'}
            className="w-full h-auto block rounded-2xl object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full aspect-[63/88] flex flex-col items-center justify-center bg-slate-800 text-slate-400 p-4">
            <span className="text-4xl mb-2">⚡</span>
            <p className="font-semibold text-center text-sm">{name || 'Image non disponible'}</p>
          </div>
        )}

        {/* Holographic Shimmer Effect Overlay */}
        {isHolo && (
          <div
            className="pointer-events-none absolute inset-0 mix-blend-color-dodge transition-opacity duration-300"
            style={{
              opacity: glarePos.opacity,
              background: `radial-gradient(circle at ${glarePos.x}% ${glarePos.y}%, rgba(255,255,255,0.8) 10%, rgba(255, 120, 255, 0.4) 30%, rgba(0, 255, 255, 0.3) 60%, transparent 80%)`,
            }}
          />
        )}

        {/* Diagonal Rainbow Glare Bar */}
        <div
          className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-40 transition-opacity duration-300 mix-blend-overlay"
          style={{
            background: `linear-gradient(${115 + rotateY}deg, transparent 20%, rgba(255, 255, 255, 0.7) 45%, rgba(255, 215, 0, 0.5) 50%, rgba(0, 255, 255, 0.5) 55%, transparent 80%)`
          }}
        />
      </div>
    </div>
  );
}
