# ⚡ PokéScan Live — Scanner & Estimation de Cartes Pokémon

[![GitHub Pages](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-success?style=for-the-badge&logo=github)](https://cromes85.github.io/CardPoke/)
[![Version](https://img.shields.io/badge/Version-v3.3.0-red?style=for-the-badge)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

Application web moderne, ultra-rapide et **100% exécutable côté client** (hébergement direct sur **GitHub Pages**, aucun backend requis). Elle permet de scanner des cartes Pokémon en direct via caméra, photo ou support tour 3D, d'extraire automatiquement les informations de la carte grâce à l'OCR & Computer Vision, d'afficher les cotes marchandes en temps réel (**Cardmarket €** et **TCGPlayer $**) et d'évaluer instantanément la rentabilité d'une gradation (**PSA / PCA / CGC**).

---

## 📋 Journal des Modifications & Historique des Versions (Changelog)

> ⚠️ **Règle de Développement** : Chaque modification apportée au projet doit obligatoirement incrémenter le numéro de version (dans `package.json`, `index.html`, `src/components/Header.jsx`) et être documentée dans cette section avant tout déploiement sur GitHub Pages.

| Version | Date | Description & Nouveautés |
| :--- | :--- | :--- |
| **`v3.3.0`** | 07/10/2026 | 🏷️ **Positionnement Précis Haut de Carte (Bandeau Nom & PV)**<br>• Calibrage strict du **Cadre Bleu en haut du viseur** (couvrant exactement les 18% supérieurs de la carte : `[Stade]`, `[Nom du Pokémon]` et `[PV / HP / PC]`).<br>• Séparation visuelle nette dans le viseur : Bandeau supérieur Nom & PV / Espace illustration & attaques / Pied de carte.<br>• Recadrage géométrique chirurgical du flux vidéo en veille (`cropY = cardTopY + 2%`) pour cibler exclusivement le haut de la carte sans interférences avec l'illustration.<br>• Extension du dictionnaire et filtrage automatique des sous-titres d'évolution (*ex: "Évolution de Terhal" -> Métang, "Évolution de Fantominus" -> Spectrum*). |
| **`v3.2.0`** | 07/10/2026 | 🔵 **Cadre Bleu Dynamique & Pré-Reconnaissance Temps Réel (Nom & PV/PC)**<br>• Ajout d'un **cadre de ciblage bleu électrique (`border-blue-400` / `shadow-blue-500`)** directement dans le viseur caméra pour indiquer visuellement la zone de recherche en direct.<br>• Moteur de pré-détection OCR asynchrone en arrière-plan (`scanHeaderLive`) analysant le bandeau supérieur en continu dès que la caméra est en attente (*standby*).<br>• Extraction et affichage en temps réel du **Nom du Pokémon** et des **Points de Vie (PV / HP / PC)** dans une pastille cyan interactive (*ex: `🎯 Monorpale • 60 PV`*).<br>• Balayage laser bleu animé à l'intérieur du cadre pour un guidage utilisateur clair et intuitif. |
| **`v3.1.0`** | 07/10/2026 | 🎯 **Algorithme de Balayage Outside-In & Verrouillage Bords Extérieurs**<br>• Refonte totale du détecteur de contours (`detectCardCornersPureJS`) avec un **balayeur de rayons périphériques Outside-In** (de l'extérieur de l'image vers le centre).<br>• Calcul de gradient de couleur euclidien 3 canaux RGB ($\sqrt{\Delta R^2 + \Delta G^2 + \Delta B^2}$) pour détecter infailliblement les bordures jaunes, grises/argentées et noires sans se faire piéger par le fort contraste de l'illustration intérieure.<br>• Régression linéaire robuste avec filtrage des anomalies statistiques par écart médian absolu (**MAD**).<br>• Nouvel outil 1-clic **"🔲 Bords Extérieurs"** (`expandCornersToOuterEdges`) dans le modal de recadrage pour étendre et verrouiller instantanément le cadre sur le périmètre physique complet de la carte. |
| **`v3.0.0`** | 07/10/2026 | 🏷️ **Moteur de Détection des Catégories & Stades d'Évolution**<br>• Détection automatique et catégorisation instantanée : **Base / Basic**, **Niveau 1**, **Niveau 2**, **Bébé**, **Restauré**, **V**, **VMAX**, **VSTAR**, **Pokémon ex**.<br>• Prise en charge intégrale des cartes **Dresseur** (*Supporter / Partisan, Objet, Stade, Outil Pokémon, High-Tech / ACE SPEC*) et **Énergies** (*Énergie de Base, Énergie Spéciale*).<br>• Badges visuels dynamiques et stylisés avec codes couleur sur le modal de résultat, le récapitulatif 3D et le live ticker.<br>• Système d'onglets et de filtres par catégorie dans le classeur virtuel (*Tous, Base, Niveau 1, Niveau 2, Dresseurs, Énergies, Ultra/ex*). |
| **`v2.9.0`** | 07/10/2026 | 💡 **Régulateur de Luminosité Ambiante, Égaliseur IA & Anti-Ombres**<br>• Capteur et jauge de luminosité ambiante en temps réel avec badge dynamique (*Luminosité optimale / Éclairage faible / Reflets*).<br>• Algorithme d'égalisation dynamique des tons & rehaussement des ombres (*Tone Mapping Gamma adaptatif + étirement d'histogramme anti-voile*).<br>• Atténuateur de reflets spéculaires et dorures holographiques pour cartes brillantes.<br>• Asservissement matériel caméra continu (*continuous auto-exposure, auto-focus & white-balance*).<br>• Outil 1-clic **"💡 Éclairage IA (Anti-Ombre)"** dans le modal de cadrage pour déboucher instantanément les photos sombres.<br>• Prétraitement et binarisation adaptative intégrale 300 DPI pour une reconnaissance OCR fiable dans toutes les conditions d'éclairage. |
| **`v2.8.0`** | 07/10/2026 | 📱 **Refonte Responsivité Mobile & Ergonomie Tactile**<br>• Viseur caméra portrait adaptatif (`aspect-[3/4]` sur mobile portrait / `aspect-[16/10]` sur écran large) pour caler parfaitement les cartes sans coupure.<br>• Header mobile compact avec onglets épurés et badge de collection dynamique.<br>• Barre de modes de scan et puces de recherche avec défilement horizontal fluide (*no-scrollbar*).<br>• Modaux de recadrage et de valorisation 100% tactiles avec boutons d'action pleine largeur et commandes D-pad compactes. |
| **`v2.7.0`** | 07/10/2026 | 🎯 **Moteur de Cadrage Intelligent, Magnétisme & Bords Automatiques**<br>• Algorithme de détection de bords multi-passes (Canny multi-epsilon, contour `minAreaRect` pour coins arrondis et analyseur de gradient Sobel multi-rayons).<br>• Fonction **"🧲 Magnétiser Bords"** (attraction magnétique automatique des 4 coins sur les véritables bordures physiques de la carte).<br>• Bouton **"Ratio 63:88"** (calibrage instantané sur les proportions officielles Pokémon sans déformation).<br>• Viseur de cadrage caméra enrichi avec reticule doré et guidage visuel dynamique. |
| **`v2.6.0`** | 07/10/2026 | 🌐 **Édition Bilingue FR/EN & Recherche Multi-Critères**<br>• Recherche simultanée en français et en anglais (*ex: Glimmet & Germéclat, Charizard & Dracaufeu*).<br>• Recherche instantanée par fraction d'extension (*ex: `108/167`*), par code de set (*ex: `TWM 108`*), et combo nom + numéro.<br>• Dictionnaire OCR bilingue étendu et gestion des sets récents (*Mascarade Crépusculaire / Twilight Masquerade, Forces Temporelles, 151, etc.*). |
| **`v2.5.0`** | 07/10/2026 | 🏗️ **Édition Tour 3D & Reconnaissance Chirurgicale**<br>• Mode scan en continu dédié aux supports de cartes imprimés en 3D avec détecteur optique de chute (*MAD motion detector*).<br>• Contrôles Play / Pause / Stop et file de traitement asynchrone en arrière-plan.<br>• Modal de **Récapitulatif Financier de session** (valeur totale du lot en €, prix moyen, podium Top 3 Hits, tableau détaillé, export CSV/Excel et sauvegarde du classeur).<br>• **Correction chirurgicale du bug "BASE"** (exclusion du mot-clé "BASE" du set code) et binarisation adaptative 300 DPI.<br>• Résolution par dénominateur `SET_TOTAL_MAP` (*ex: `/217` ➔ `me02.5`, `/165` ➔ `sv03.5`*). |
| **`v2.4.0`** | 07/10/2026 | 📐 **Recadrage Perspectif 4 Points & Loupe de Précision**<br>• Modal interactif de recadrage avec 4 poignées d'angles, D-pad de micro-ajustement, loupe grossissante et redressement homographique automatique 63:88. |
| **`v2.3.0`** | 07/10/2026 | 💶 **Cotations Multi-Finitions & Gradation IA**<br>• Sélecteur de finition en direct : Normal, Holo, Reverse.<br>• Matrice de rentabilité de gradation PSA / PCA / CGC avec calcul automatique du ROI net. |
| **`v2.2.0`** | 07/10/2026 | 📷 **Support Caméra Avancé & Auto-Scan**<br>• Sélection d'objectif macro/grand angle, contrôle du flash / torche mobile et détection de stabilité. |
| **`v2.0.0`** | 06/10/2026 | 🧠 **Moteur OCR Tesseract.js & TCGdex API v2**<br>• Analyse locale dans le navigateur, carte 3D avec reflets holographiques interactifs. |
| **`v1.0.0`** | 06/10/2026 | 🚀 **Version Initiale**<br>• Scanner basique, recherche de cartes et classeur virtuel dans le `localStorage`. |

---

## 🌟 Fonctionnalités Clés

### 1. 🏗️ Mode Tour 3D & Scan en Série ("À la Volée")
* **Détection Optique de Chute (*Drop Detector*)** : Posez votre téléphone sur une tour d'impression 3D. Dès qu'une carte tombe au fond du réceptacle, le mouvement est détecté et déclenche la capture sans action manuelle.
* **Contrôles Play / Pause / Stop** : Lancez une session, glissez vos cartes les unes après les autres.
* **Synthèse Audio Rétro** : Bips de détection laser, ding de pièce pour les cotes et fanfare festive pour les cartes rares.
* **Bilan Financier de Fin de Session** : Valeur totale cumulée, prix moyen par carte, podium des 3 meilleures trouvailles, export CSV/Excel pour déclarations ou revente, et sauvegarde en lot dans votre portfolio.

### 2. 🧠 Reconnaissance & OCR Chirurgical
* **3 Passes ROI Ciblées** : En-tête (*Nom & PV*), pied de carte (*Numéro local & Total de l'extension*) et contexte complet.
* **Binarisation Adaptative 300 DPI** : Supprime les reflets brillants, les dorures holographiques et les fonds texturés.
* **Résolution Instantanée Direct ID (`SET_TOTAL_MAP`)** : Détection du set officiel via le total de cartes imprimé (*ex: `/217` ➔ Héros Transcendants, `/167` ➔ Mascarade Crépusculaire, `/165` ➔ 151*).
* **Bilingue Français / Anglais** : Support complet des cartes françaises et anglaises.

### 3. 💶 Cotes Marchandes Cardmarket (€) & Aide à la Gradation
* **Cotes Cardmarket en Euros (€)** : Prix moyen, Prix le plus bas, Prix Tendance, Prix Normal, Holo et Reverse.
* **Matrice de Décision Gradation (PSA / PCA / CGC)** : Calcul de rentabilité nette (évaluation du gain potentiel PSA 9 / PSA 10 déduit des ~15 € de coût de certification).
* **Liens Directs** : Accès en 1 clic aux annonces et ventes réussies sur **Cardmarket**, **eBay France** et **TCGPlayer**.

### 4. 🗂️ Classeur Virtuel & Export
* **Gestion de Collection Locale** : Stockage sécurisé dans le navigateur (`localStorage`).
* **Export Universel** : Exportation **CSV** (compatible Excel / Google Sheets) et **JSON**.

---

## 🚀 Déploiement sur GitHub Pages

L'application est configurée pour se déployer automatiquement sur GitHub Pages :

```bash
# 1. Compiler et déployer sur la branche gh-pages
npm run deploy

# 2. Pousser les sources sur la branche main
git add .
git commit -m "feat: Mise à jour et publication"
git push origin main
```

L'application est disponible en direct sur : **`https://<pseudo>.github.io/<depot>/`**

---

## 🛠️ Stack Technique

* **Framework :** React 19 + Vite
* **Styling :** Tailwind CSS + Lucide Icons + Canvas Confetti
* **OCR & Vision :** Tesseract.js (fra + eng) + Canvas API (filtres Sobel, RANSAC & binarisation adaptative intégrale)
* **API TCG :** [TCGdex API v2 (Bilingue FR / EN)](https://tcgdex.net/)
* **Audio :** Synthétiseur Web Audio API natif

---

## 📄 Licence & Mentions Légales
Application open-source sous licence MIT.
Pokémon et les noms associés sont des marques déposées de Nintendo, Creatures Inc. et GAME FREAK inc. Données de prix fournies à titre indicatif via les API publiques TCGdex et Cardmarket.
