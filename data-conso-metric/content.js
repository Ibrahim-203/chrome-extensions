// content.js - Version améliorée sans casser l'existant
let detector = null;
let currentQualityLabel = null;
let detectionInterval = null;

// Initialisation uniquement si nécessaire
function initVideoDetection() {
  console.log("Initialisation du détecteur vidéo (amélioré)...");
  
  // Vérifie si on est sur un site pertinent pour la détection vidéo
  const hostname = window.location.hostname;
  const videoSites = ['youtube', 'netflix', 'twitch', 'vimeo', 'dailymotion', 
                      'voiranime', 'frenchstream', 'anime', 'stream'];
  
  const shouldDetect = videoSites.some(site => hostname.includes(site));
  
  if (!shouldDetect) {
    console.log("Site non vidéo, détection allégée");
    return;
  }
  
  // Charge les détecteurs uniquement si nécessaire
  loadDetectors();
}

function loadDetectors() {
  // Crée les détecteurs seulement si nécessaire
  if (typeof MainVideoDetector === 'undefined') {
    console.log("Détecteurs non disponibles, utilisation du détecteur standard");
    // Fallback sur l'ancien système
    startLegacyDetection();
    return;
  }
  
  detector = new MainVideoDetector();
  
  // Détection initiale après un petit délai
  setTimeout(detectVideoQuality, 2000);
  
  // Détection périodique
  detectionInterval = setInterval(detectVideoQuality, 5000);
}

// Ancien système de détection (pour compatibilité)
function startLegacyDetection() {
  console.log("Utilisation du détecteur standard (legacy)");
  setInterval(() => {
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
      }
    }
  }, 5000);
}

// Nouvelle détection améliorée
async function detectVideoQuality() {
  if (!detector) return;
  
  const quality = await detector.detectAll();
  
  if (quality && quality.quality !== currentQualityLabel) {
    currentQualityLabel = quality.quality;
    
    // MÊME MESSAGE que l'ancien système pour compatibilité
    chrome.runtime.sendMessage({
      action: "updateVideoQuality",
      quality: quality.quality,
      url: window.location.href
      // On garde le même format pour ne pas casser background.js
    });
    
    console.log(`[Video] Qualité détectée: ${quality.quality} (${quality.detector})`);
  }
}

// Garde la fonction originale pour compatibilité
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

// Ancienne fonction de détection (renommée mais gardée)
function legacyDetectVideoResolution() {
  // Ton code original
  const videos = document.querySelectorAll('video');
  console.log("finding quality video")
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

// Lancement conditionnel
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVideoDetection);
} else {
  initVideoDetection();
}

// Nettoyage
window.addEventListener('beforeunload', () => {
  if (detectionInterval) {
    clearInterval(detectionInterval);
  }
});

function safeSendMessage(message) {
  if (chrome.runtime?.id) {  // Vérifie que le runtime est encore valide
    chrome.runtime.sendMessage(message).catch(() => {
      // Silencieux : l'erreur est ignorée si contexte invalide
      console.log("Message ignoré : contexte invalide");
    });
  }
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
// window.addEventListener('load', () => {
//   setTimeout(detectVideoResolution, 8000);
// });
