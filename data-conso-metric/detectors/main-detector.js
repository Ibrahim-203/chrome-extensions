// Détecteur principal qui coordonne tous les autres
class MainVideoDetector {
  constructor() {
    this.detectors = [
      new StandardVideoDetector(),
    //   new NetworkDetector(), // À créer si besoin
      new IframeDetector(),
      new ShadowDomDetector(),
      new PlayerDetector()
    ].sort((a, b) => a.priorite - b.priorite);
    
    this.currentQuality = null;
    this.detectionHistory = [];
  }

  async detectAll() {
    const results = [];
    const methods = [];

    // Essaie tous les détecteurs
    for (let detector of this.detectors) {
      try {
        console.log(`Tentative avec détecteur: ${detector.name}`);
        const result = await detector.detect();
        
        if (result) {
          results.push({
            ...result,
            detector: detector.name,
            timestamp: Date.now()
          });
          methods.push(detector.name);
        }
      } catch (e) {
        console.error(`Erreur détecteur ${detector.name}:`, e);
      }
    }

    // Sélectionne la meilleure qualité
    const bestQuality = this.selectBestQuality(results);
    
    if (bestQuality) {
      this.currentQuality = bestQuality;
      this.detectionHistory.push(bestQuality);
      
      console.log('Qualité détectée:', bestQuality);
      console.log('Méthodes utilisées:', methods);
      
      return bestQuality;
    }
    
    return null;
  }

  selectBestQuality(results) {
    if (results.length === 0) return null;
    
    // Priorité : non-estimé > estimé
    const nonEstimated = results.filter(r => !r.estimated);
    if (nonEstimated.length > 0) {
      return this.getHighestQuality(nonEstimated);
    }
    
    return this.getHighestQuality(results);
  }

  getHighestQuality(results) {
    const qualityOrder = {
      '4K': 5,
      '1080p': 4,
      '720p': 3,
      '480p': 2,
      '360p': 1,
      'SD': 0
    };

    return results.reduce((best, current) => {
      const bestScore = this.extractQualityScore(best.quality, qualityOrder);
      const currentScore = this.extractQualityScore(current.quality, qualityOrder);
      return currentScore > bestScore ? current : best;
    });
  }

  extractQualityScore(quality, order) {
    for (let [key, value] of Object.entries(order)) {
      if (quality.includes(key)) {
        return value;
      }
    }
    return -1;
  }
}

// Export pour utilisation
window.MainVideoDetector = MainVideoDetector;