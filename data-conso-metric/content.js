var totalDelta = 0;
let observer = null;
let currentQualityLabel = null;

// === 1. Mesure au chargement initial ===
function measureInitial() {
let initialSize = 0;

  // Document principal (HTML)
  const navEntries = performance.getEntriesByType('navigation');
  if (navEntries[0] && navEntries[0].transferSize) {
    initialSize += navEntries[0].transferSize;
  }

  // Toutes les ressources chargées au load (CSS, JS, images, etc.)
  const resourceEntries = performance.getEntriesByType('resource');
  resourceEntries.forEach(entry => {
    if (entry.transferSize) {
      initialSize += entry.transferSize;
    }
  });

  // Envoi immédiat du trafic initial
  if (initialSize > 0) {
    chrome.runtime.sendMessage({
      action: "addTrafficDelta",
      delta: initialSize,
      url: window.location.href
    });
    console.log(`Trafic initial capturé : ${initialSize} octets`);
  }
}

// === 2. Observer pour les nouveaux chunks ===
function startObserver() {
  observer = new PerformanceObserver((list) => {
    list.getEntries().forEach(entry => {
      const size = entry.transferSize || 0;
      console.log(`Nouvelle ressource capturée : ${entry.name} - ${size} octets`);
      if (size > 500) {  // Ignore petits appels
        totalDelta += size;
      }
    });
  });

  observer.observe({ type: 'resource', buffered: true });
}


// Map resolution → label standard
function resolutionToLabel(width, height) {
  const res = width + 'x' + height;
  if (width >= 3840) return '4K';
  if (width >= 1920) return '1080p';
  if (width >= 1280) return '720p';
  if (width >= 854) return '480p';
  if (width >= 640) return '360p';
  if (width >= 426) return '240p';
  return '144p ou moins';
}

// Détection périodique de la qualité
function detectVideoResolution() {
  // Cherche le <video> le plus grand/actif
  const videos = document.querySelectorAll('video');
  let bestVideo = null;
  let maxArea = 0;

  videos.forEach(v => {
    if (v.videoWidth > 0 && v.videoHeight > 0) {
      const area = v.videoWidth * v.videoHeight;
      if (area > maxArea) {
        maxArea = area;
        bestVideo = v;
      }
    }
  });

  if (bestVideo) {
    const label = resolutionToLabel(bestVideo.videoWidth, bestVideo.videoHeight);
    if (label !== currentQualityLabel) {
      currentQualityLabel = label;
      chrome.runtime.sendMessage({
        action: "updateVideoQuality",
        quality: label,
        url: window.location.href
      });
      console.log(`Qualité détectée : ${label} (${bestVideo.videoWidth}x${bestVideo.videoHeight})`);
    }
  }
}

setInterval(() => {
  if (totalDelta > 0) {
    chrome.runtime.sendMessage({
      action: "addTrafficDelta",
      delta: totalDelta,
      url: window.location.href
    });
    console.log(`Trafic dynamique envoyé : +${totalDelta} octets`);
    totalDelta = 0;
  }
}, 8000); // Toutes les 8 secondes
setInterval(detectVideoResolution, 10000);

// === 3. Envoie les données au background ===
// Ancienne version (données identifier par onglet)
// function sendUpdate() {
//   chrome.runtime.sendMessage({
//     action: 'updateTabData',
//     data: {
//       url: window.location.href,
//       title: document.title,
//       size: totalSize,
//       timestamp: Date.now()
//     }
//   });
// }

// Envoie (avec URL actuelle pour détection de changements)
// function sendUpdate() {
//   chrome.runtime.sendMessage({
//     action: 'updateSessionData',
//     data: {
//       url: window.location.href,
//       title: document.title,
//       sizeDelta: totalSize, // Delta pour cumuler
//       timestamp: Date.now()
//     }
//   });
//   totalSize = 0; // Reset delta après envoi (pour ne cumuler que les nouveaux)
// }


// content.js – Détection de lecture audio/vidéo active

let playbackCheckInterval = null;
let lastPlaybackState = false;  // État précédent pour éviter les messages inutiles

// Fonction qui vérifie si une lecture est en cours
function isPlaybackActive() {
  // 1. Méthode moderne : Media Session API (utilisée par YouTube, Spotify, etc.)
  if (navigator.mediaSession && navigator.mediaSession.playbackState === "playing") {
    return true;
  }

  // 2. Méthode classique : chercher un élément <video> ou <audio> en lecture
  const mediaElements = document.querySelectorAll('video, audio');
  for (const media of mediaElements) {
    if (media.duration > 0 && !media.paused && !media.ended && media.readyState > 2) {
      return true;
    }
  }

  return false;
}

// Vérification périodique toutes les 5 secondes
function startPlaybackDetection() {
  if (playbackCheckInterval) return; // Déjà lancé

  playbackCheckInterval = setInterval(() => {
    const currentState = isPlaybackActive();

    // On n'envoie un message que si l'état change
    if (currentState !== lastPlaybackState) {
      chrome.runtime.sendMessage({
        action: "playbackStateChanged",
        playing: currentState
      });
      lastPlaybackState = currentState;
    }
  }, 5000); // Toutes les 5 secondes
}

// === Démarrage ===
window.addEventListener('load', () => {
  setTimeout(detectVideoResolution, 8000);
  measureInitial();
  startObserver();
  startPlaybackDetection();
});

// Nettoyage si page fermée
window.addEventListener('unload', () => {
  if (observer) observer.disconnect();

  if (playbackCheckInterval) {
    clearInterval(playbackCheckInterval);
  }
  // Informe le background que la lecture s'arrête
  chrome.runtime.sendMessage({
    action: "playbackStateChanged",
    playing: false
  });
// Envoi final si reste du trafic dynamique
  if (totalDelta > 0) {
    chrome.runtime.sendMessage({
      action: "addTrafficDelta",
      delta: totalDelta,
      url: window.location.href
    });
  }
});