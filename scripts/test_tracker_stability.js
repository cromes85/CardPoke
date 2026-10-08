import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';
import { autoDetectPokemonCardV2 } from './test_robust_detector.js';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';

// --------------------------------------------------------------------------------------
// TRACKER TEMPOREL ULTRA-STABLE (HYSTÉRÈSE + PERSISTANCE + FILTRE ADAPTATIF)
// --------------------------------------------------------------------------------------
export class RobustCardTracker {
  constructor() {
    this.lockedQuad = null;
    this.consecutiveHits = 0;
    this.lostFrames = 0;
    this.state = 'SEARCHING'; // 'SEARCHING' | 'LOCKED'
  }

  update(rawDetection) {
    if (!rawDetection || !rawDetection.corners) {
      if (this.state === 'LOCKED') {
        this.lostFrames++;
        // Persistance pendant 8 frames (~300ms) pour éviter les clignotements
        if (this.lostFrames <= 8) {
          return {
            corners: this.lockedQuad,
            isLocked: true,
            state: 'LOCKED'
          };
        }
      }
      this.consecutiveHits = 0;
      this.state = 'SEARCHING';
      this.lockedQuad = null;
      return null;
    }

    const newCorners = rawDetection.corners;

    if (this.state === 'SEARCHING') {
      this.consecutiveHits++;
      if (this.consecutiveHits >= 2) {
        this.state = 'LOCKED';
        this.lockedQuad = newCorners.map(p => ({ ...p }));
        this.lostFrames = 0;
      }
      return {
        corners: newCorners,
        isLocked: this.state === 'LOCKED',
        state: this.state
      };
    }

    // En état LOCKED : association optimale des coins & lissage anti-tremblement
    this.lostFrames = 0;
    const matchedCorners = matchCornersByDistance(this.lockedQuad, newCorners);

    // Calcul de la distance moyenne de déplacement
    let avgDist = 0;
    for (let i = 0; i < 4; i++) {
      avgDist += Math.hypot(matchedCorners[i].x - this.lockedQuad[i].x, matchedCorners[i].y - this.lockedQuad[i].y);
    }
    avgDist /= 4;

    // Si le mouvement est infime (< 1.5% de l'écran), filtrage très fort (zéro jitter)
    // Si mouvement modéré, suivi fluide
    // Si grand saut (> 20%), réaligner plus vite
    let alpha = 0.20;
    if (avgDist < 0.015) {
      alpha = 0.08; // Immobilité parfaite
    } else if (avgDist > 0.15) {
      alpha = 0.70; // Mouvement rapide de la main
    }

    const smoothed = [];
    for (let i = 0; i < 4; i++) {
      smoothed.push({
        x: this.lockedQuad[i].x * (1 - alpha) + matchedCorners[i].x * alpha,
        y: this.lockedQuad[i].y * (1 - alpha) + matchedCorners[i].y * alpha
      });
    }

    this.lockedQuad = smoothed;
    return {
      corners: smoothed,
      isLocked: true,
      state: 'LOCKED'
    };
  }

  reset() {
    this.lockedQuad = null;
    this.consecutiveHits = 0;
    this.lostFrames = 0;
    this.state = 'SEARCHING';
  }
}

// Association par distance euclidienne minimale pour éviter tout retournement/papillon
function matchCornersByDistance(prevQuad, newQuad) {
  if (!prevQuad || !newQuad || prevQuad.length !== 4 || newQuad.length !== 4) {
    return newQuad;
  }

  // 4 permutations possibles (rotations de 0, 90, 180, 270 deg)
  let bestPerm = newQuad;
  let minTotalDist = Infinity;

  for (let shift = 0; shift < 4; shift++) {
    const perm = [
      newQuad[shift % 4],
      newQuad[(shift + 1) % 4],
      newQuad[(shift + 2) % 4],
      newQuad[(shift + 3) % 4]
    ];

    let totalDist = 0;
    for (let i = 0; i < 4; i++) {
      totalDist += Math.hypot(perm[i].x - prevQuad[i].x, perm[i].y - prevQuad[i].y);
    }

    if (totalDist < minTotalDist) {
      minTotalDist = totalDist;
      bestPerm = perm;
    }
  }

  return bestPerm;
}

async function testTracker() {
  const tracker = new RobustCardTracker();
  const files = ['media_1791464110343.jpg', 'media_1791459061888.jpg', 'media_1791400444020.jpg'];

  for (const f of files) {
    const img = await loadImage(path.join(uploadedDir, f));
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const raw = autoDetectPokemonCardV2(canvas);
    const tracked = tracker.update(raw);

    console.log(`[${f}] Tracked State: ${tracked ? tracked.state : 'NONE'} | Corners:`, tracked ? tracked.corners : null);
  }
}

testTracker();
