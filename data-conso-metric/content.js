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

function safeSendMessage(message) {
  if (chrome.runtime?.id) {  // Vérifie que le runtime est encore valide
    chrome.runtime.sendMessage(message).catch(() => {
      // Silencieux : l'erreur est ignorée si contexte invalide
      console.log("Message ignoré : contexte invalide");
    });
  }
}

setInterval(() => {
  if (totalDelta > 0) {
    safeSendMessage({
      action: "addTrafficDelta",
      delta: totalDelta,
      url: window.location.href
    });
    console.log(`Trafic dynamique envoyé : +${totalDelta} octets`);
    totalDelta = 0;
  }
}, 8000); // Toutes les 8 secondes
setInterval(detectVideoResolution, 10000);

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

// ----- Geolocalisation-------------

//  Vérifie si on a déjà demandé la géolocalisation
chrome.storage.local.get('deviceInfo', (result) => {
  const info = result.deviceInfo || {};

  // Si déjà demandé (succès ou refus) → on ne fait rien
  if (info.geoTimestamp || info.geoRefused) {
    return;
  }

  // Sinon, on demande automatiquement
  console.log("Première page chargée → demande automatique de géolocalisation");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude.toFixed(6);
      const lon = position.coords.longitude.toFixed(6);

      // Reverse geocoding avec Nominatim (gratuit)
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`)
        .then(r => r.json())
        .then(data => {
          const city = data.address?.city || data.address?.town || data.address?.village || 'Inconnue';
          const country = data.address?.country || 'Inconnu';

          sendGeoToBackground(lat, lon, city, country, false);
        })
        .catch(() => {
          sendGeoToBackground(lat, lon, 'Inconnue', 'Inconnu', false);
        });
    },
    (error) => {
      console.log("Géolocalisation refusée automatiquement :", error.message);
      sendGeoToBackground(null, null, 'Refusée', 'Refusée', true);
    },
    { timeout: 15000, maximumAge: 3600000 }
  );
});

// Fonction pour envoyer au background
function sendGeoToBackground(lat, lon, city, country, refused) {
  chrome.runtime.sendMessage({
    action: "saveGeolocation",
    latitude: lat,
    longitude: lon,
    city: city,
    country: country,
    refused: refused
  });
}

// --------End Geolocalisation ----------

// === Démarrage ===
window.addEventListener('load', () => {
  setTimeout(detectVideoResolution, 8000);
  measureInitial();
  startObserver();
  // startPlaybackDetection();
});

// Nettoyage si page fermée
window.addEventListener('unload', () => {
  if (observer) observer.disconnect();

  if (playbackCheckInterval) {
    clearInterval(playbackCheckInterval);
  }
  // Informe le background que la lecture s'arrête
  // chrome.runtime.sendMessage({
  //   action: "playbackStateChanged",
  //   playing: false
  // });
// Envoi final si reste du trafic dynamique
  if (totalDelta > 0) {
    chrome.runtime.sendMessage({
      action: "addTrafficDelta",
      delta: totalDelta,
      url: window.location.href
    });
  }
});