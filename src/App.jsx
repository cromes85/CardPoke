import React, { useState, useEffect, useMemo } from 'react';
import Header from './components/Header';
import Scanner from './components/Scanner';
import CardCropModal from './components/CardCropModal';
import CardResultModal from './components/CardResultModal';
import ManualSearch from './components/ManualSearch';
import Collection from './components/Collection';
import DeployGuideModal from './components/DeployGuideModal';
import Footer from './components/Footer';

import { ocrService } from './utils/ocrService';
import { searchCard, getCardDetails } from './utils/tcgApi';
import { soundManager } from './utils/audio';
import { getSavedCollection, saveCardToCollection, removeCardFromCollection } from './utils/storage';

export default function App() {
  // Navigation & UI States
  const [activeTab, setActiveTab] = useState('scanner');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showDeployGuide, setShowDeployGuide] = useState(false);
  const [prefilledQuery, setPrefilledQuery] = useState('');

  // Collection State
  const [collection, setCollection] = useState([]);

  // Scan & Processing States
  const [capturedData, setCapturedData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  // Result Modal State
  const [selectedCard, setSelectedCard] = useState(null);
  const [alternativeMatches, setAlternativeMatches] = useState([]);
  const [ocrMeta, setOcrMeta] = useState({});
  const [userCroppedDataUrl, setUserCroppedDataUrl] = useState(null);

  // Load collection on mount
  useEffect(() => {
    const saved = getSavedCollection();
    setCollection(saved);
  }, []);

  const totalValueEur = useMemo(() => {
    return collection.reduce((sum, item) => sum + (Number(item.priceEur) || 0), 0);
  }, [collection]);

  const handleCardCaptured = (captureResult) => {
    setCapturedData(captureResult);
  };

  // Confirm Crop & run OCR + TCG search
  const handleConfirmCropAndScan = async (warpedCanvas, sourceCanvas) => {
    setCapturedData(null);
    setIsProcessing(true);
    setOcrProgress(0.1);
    setStatusMessage("Reconnaissance optique des caractères (OCR)...");

    const croppedDataUrl = warpedCanvas.toDataURL('image/jpeg', 0.85);
    setUserCroppedDataUrl(croppedDataUrl);

    try {
      // 1. Run OCR
      const ocrResult = await ocrService.scanCard(warpedCanvas, (prog) => {
        setOcrProgress(prog);
      });

      setStatusMessage("Recherche des cotes en direct sur TCGdex...");

      // 2. Query TCGdex
      const searchResult = await searchCard({
        primaryName: ocrResult.primaryName,
        candidateWords: ocrResult.candidateWords,
        extractedNumbers: ocrResult.extractedNumbers,
        localId: ocrResult.localId,
        totalInSet: ocrResult.totalInSet,
        setCode: ocrResult.setCode
      });

      setIsProcessing(false);

      if (searchResult && searchResult.bestMatch) {
        soundManager.playSuccess();
        setSelectedCard(searchResult.bestMatch);
        setAlternativeMatches(searchResult.alternatives || []);
        setOcrMeta(searchResult.meta || {});
      } else {
        // Fallback gracefully without alert popup
        const queryCandidate = ocrResult.primaryName || ocrResult.localId || '';
        setPrefilledQuery(queryCandidate);
        setActiveTab('search');
      }
    } catch (err) {
      console.error("Scan analysis error:", err);
      setIsProcessing(false);
      setActiveTab('search');
    }
  };

  const handleSelectAlternative = async (cardId) => {
    setIsProcessing(true);
    const details = await getCardDetails(cardId);
    setIsProcessing(false);
    if (details) {
      setSelectedCard(details);
    }
  };

  const handleUpdateSearch = async (params) => {
    setIsProcessing(true);
    const searchResult = await searchCard(params);
    setIsProcessing(false);
    if (searchResult && searchResult.bestMatch) {
      setSelectedCard(searchResult.bestMatch);
      setAlternativeMatches(searchResult.alternatives || []);
      setOcrMeta(searchResult.meta || {});
    }
  };

  const handleSaveToCollection = (cardData, userPhoto, condition, notes) => {
    const newItem = saveCardToCollection(cardData, userPhoto, condition, notes);
    if (newItem) {
      setCollection(prev => [newItem, ...prev]);
    }
  };

  const handleRemoveFromCollection = (itemId) => {
    const updated = removeCardFromCollection(itemId);
    setCollection(updated);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-red-500 selection:text-white">
      
      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        collectionCount={collection.length}
        totalValueEur={totalValueEur}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        onOpenDeployGuide={() => setShowDeployGuide(true)}
      />

      {/* Main Viewport */}
      <main className="flex-1 flex flex-col justify-start py-4 sm:py-6">
        {activeTab === 'scanner' && (
          <Scanner
            onCardCaptured={handleCardCaptured}
            isProcessing={isProcessing}
            ocrProgress={ocrProgress}
            statusMessage={statusMessage}
          />
        )}

        {activeTab === 'collection' && (
          <Collection
            collection={collection}
            onRemoveCard={handleRemoveFromCollection}
            onSelectCard={(item) => {
              getCardDetails(item.cardId || item.id).then(details => {
                if (details) setSelectedCard(details);
                else setSelectedCard(item);
              });
            }}
            onReloadCollection={() => setCollection(getSavedCollection())}
          />
        )}

        {activeTab === 'search' && (
          <ManualSearch
            initialQuery={prefilledQuery}
            onSelectCard={(card) => {
              setSelectedCard(card);
              setAlternativeMatches([]);
            }}
          />
        )}
      </main>

      {/* Modals */}
      {capturedData && (
        <CardCropModal
          sourceCanvas={capturedData.sourceCanvas}
          detectedCorners={capturedData.detectedCorners}
          onConfirm={handleConfirmCropAndScan}
          onCancel={() => setCapturedData(null)}
        />
      )}

      {selectedCard && (
        <CardResultModal
          card={selectedCard}
          alternatives={alternativeMatches}
          ocrMeta={ocrMeta}
          userCroppedImage={userCroppedDataUrl}
          onSaveToCollection={handleSaveToCollection}
          onSelectAlternative={handleSelectAlternative}
          onUpdateSearch={handleUpdateSearch}
          onManualSearchFallback={() => {
            setSelectedCard(null);
            setActiveTab('search');
          }}
          onClose={() => setSelectedCard(null)}
        />
      )}

      {showDeployGuide && (
        <DeployGuideModal
          onClose={() => setShowDeployGuide(false)}
        />
      )}

      <Footer onOpenDeployGuide={() => setShowDeployGuide(true)} />

    </div>
  );
}
