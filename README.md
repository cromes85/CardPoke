# ⚡ PokéScan Live — Scanner & Estimation de Cartes Pokémon

Application web moderne, rapide et 100% hébergeable sur **GitHub Pages** (aucun serveur backend requis), permettant de scanner des cartes Pokémon en direct via caméra ou photo, d'extraire automatiquement leurs données (OCR & Computer Vision), de consulter leur cote marchande en temps réel (**Cardmarket** et **TCGPlayer**) et d'évaluer la rentabilité d'une gradation (**PSA / PCA / CGC**).

![PokéScan Live](https://raw.githubusercontent.com/tcgdex/cards-database/master/branding/logo.png)

---

## 🌟 Fonctionnalités Principales

### 1. 📷 Scanner Intelligent & Capture Double Mode
* **Mode "À la volée" (Auto-Scan)** : Détecte automatiquement la stabilité de la carte dans le cadre et déclenche l'analyse sans toucher l'écran.
* **Mode Manuel (Bouton Snap)** : Cadrez et déclenchez la photo au moment optimal avec feedback haptique et sonore (synthèse Web Audio API).
* **Import Photo / Galerie** : Glissez-déposez ou sélectionnez n'importe quelle photo depuis votre téléphone ou PC.
* **Support Caméra Avancé** : Bascule caméra avant / arrière (objectif grand angle macro) et contrôle du flash / torche sur mobile.

### 2. 📐 Détection de Bords & Recadrage Perspectif (Computer Vision)
* **Homographie & Déformation Perspective 4 Points** : Redresse automatiquement la carte inclinée pour obtenir un rectangle parfait au format officiel (63 × 88 mm).
* **Prétraitement Haute Définition pour l'OCR** : Binarisation adaptative, rehaussement de contraste et découpage ciblé des zones clés (*Nom/PV* en haut, *Numéro/Série* en bas).

### 3. 🧠 Reconnaissance de Caractères (OCR) & Moteur de Correspondance TCG
* **Moteur Tesseract.js embarqué** dans le navigateur (aucun envoi d'image sur un serveur tiers = respect de la vie privée).
* **Moteur de recherche multicritère** sur l'API open-source **TCGdex** (support complet de la langue française).
* **Algorithme de similarité Levenshtein** pour corriger les erreurs de lecture mineures.
* **Recherche instantanée manuelle** avec auto-complétion parmi plus de 20 000 cartes.

### 4. 💶 Cotes Marchandes en Temps Réel & Aide à la Gradation (IA)
* **Cotes Cardmarket en Euros (€)** : Prix moyen, Prix le plus bas, Prix Tendance, Prix Version Holo / Reverse.
* **Cotes TCGPlayer en Dollars ($)**.
* **Matrice de rentabilité de gradation (PSA / PCA / CGC)** : Calcul automatique du retour sur investissement (*ROI*) basé sur la valeur brute de la carte vs le coût d'envoi (~15 €) et estimation des notes PSA 9 / PSA 10.
* **Liens directs** vers les ventes réussies sur **eBay France**, **Cardmarket** et **TCGPlayer**.

### 5. 🗂️ Classeur Virtuel & Gestion de Portfolio
* **Sauvegarde automatique** dans le `localStorage` du navigateur.
* **Calculateur de valeur totale** de votre collection en temps réel.
* **Tri & Filtres** (par valeur marchande, date d'ajout, rareté, nom).
* **Exportation & Sauvegarde** au format **CSV** (compatible Excel / Google Sheets) et **JSON**.

---

## 🚀 Déploiement sur GitHub Pages (En 2 Minutes)

Ce projet est prêt pour **GitHub Pages** avec son workflow GitHub Actions automatique inclus (`.github/workflows/deploy.yml`).

### Étape 1 : Pousser le projet sur GitHub
```bash
git add .
git commit -m "feat: Déploiement PokéScan Live"
git push origin main
```

### Étape 2 : Activer GitHub Pages
1. Rendez-vous sur votre dépôt GitHub.
2. Cliquez sur l'onglet **Settings** (Paramètres) > **Pages** (dans le menu de gauche).
3. Dans la section **Build and deployment**, sous **Source**, choisissez : **`GitHub Actions`**.

👉 C'est tout ! GitHub va automatiquement construire et publier votre application à l'adresse :
`https://<votre-pseudo>.github.io/<nom-du-depot>/`

---

## 🛠️ Stack Technique

* **Framework :** React 18 + Vite
* **Styling :** Tailwind CSS + Lucide Icons + Effets 3D Tilt Holographiques
* **Vision & OCR :** Canvas API + Tesseract.js (fra + eng) + OpenCV.js (fallback rapide)
* **API TCG :** [TCGdex API v2 (Français)](https://tcgdex.net/)
* **Audio :** Web Audio API Native (synthétiseur de sons laser / fanfare)
* **Déploiement :** GitHub Actions CI/CD pour GitHub Pages

---

## 💻 Développement Local

```bash
# 1. Cloner le dépôt
git clone <url-du-depot>
cd noble-tesla

# 2. Installer les dépendances
npm install

# 3. Lancer le serveur de développement
npm run dev

# 4. Compiler pour la production
npm run build
```

---

## 📄 Licence & Mentions Légales
Application open-source sous licence MIT.
Pokémon et les noms de personnages Pokémon sont des marques déposées de Nintendo, Creatures Inc. et GAME FREAK inc. Données de prix fournies à titre indicatif via les API publiques TCGdex et Cardmarket.
