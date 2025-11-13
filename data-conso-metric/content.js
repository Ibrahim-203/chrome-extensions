let totalSize = 0;
let observer = null;

// === 1. Mesure au chargement initial ===
function measureInitial() {
  const nav = performance.getEntriesByType('navigation')[0];
  if (nav) totalSize += nav.transferSize || 0;

  performance.getEntriesByType('resource').forEach(res => {
    totalSize += res.transferSize || 0;
  });

  sendUpdate();
}

// === 2. Observer pour les nouveaux chunks ===
function startObserver() {
  observer = new PerformanceObserver((list) => {
    list.getEntries().forEach(entry => {
      // Filtre les vidéos (YouTube, Netflix, etc.)
      if (
        entry.initiatorType === 'video' ||
        entry.name.includes('.mp4') ||
        entry.name.includes('.m3u8') ||
        entry.name.includes('.ts') ||
        entry.name.includes('videoplayback') ||
        entry.name.includes('fragment')
      ) {
        totalSize += entry.transferSize || 0;
        sendUpdate(); // Met à jour à chaque chunk
      }
    });
  });

  observer.observe({ type: 'resource', buffered: true }); // buffered = inclut les anciens
}

// === 3. Envoie les données au background ===
function sendUpdate() {
  chrome.runtime.sendMessage({
    action: 'updateTabData',
    data: {
      url: window.location.href,
      title: document.title,
      size: totalSize,
      timestamp: Date.now()
    }
  });
}

// === Démarrage ===
window.addEventListener('load', () => {
  measureInitial();
  startObserver();
});

// Nettoyage si page fermée
window.addEventListener('unload', () => {
  if (observer) observer.disconnect();
});