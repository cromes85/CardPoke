# ⚡ PokéScan Live — Scanner & Estimation de Cartes Pokémon

[![GitHub Pages](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-success?style=for-the-badge&logo=github)](https://cromes85.github.io/CardPoke/)
[![Version](https://img.shields.io/badge/Version-v2.6.0-red?style=for-the-badge)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

Application web moderne, ultra-rapide et **100% exécutable côté client** (hébergement direct sur **GitHub Pages**, aucun backend requis). Elle permet de scanner des cartes Pokémon en direct via caméra, photo ou support tour 3D, d'extraire automatiquement les informations de la carte grâce à l'OCR & Computer Vision, d'afficher les cotes marchandes en temps réel (**Cardmarket €** et **TCGPlayer $**) et d'évaluer instantanément la rentabilité d'une gradation (**PSA / PCA / CGC**).

---

## 📋 Journal des Modifications & Historique des Versions (Changelog)

> ⚠️ **Règle de Développement** : Chaque modification apportée au projet doit obligatoirement incrémenter le numéro de version (dans `package.json`, `index.html`, `src/components/Header.jsx`) et être documentée dans cette section avant tout déploiement sur GitHub Pages.

| Version | Date | Description & Nouveautés |
| :--- | :--- | :--- |
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
