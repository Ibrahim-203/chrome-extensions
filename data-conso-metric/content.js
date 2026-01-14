let currentQualityLabel = null;
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

function safeSendMessage(message) {
  if (chrome.runtime?.id) {  // Vérifie que le runtime est encore valide
    chrome.runtime.sendMessage(message).catch(() => {
      // Silencieux : l'erreur est ignorée si contexte invalide
      console.log("Message ignoré : contexte invalide");
    });
  }
}

 setInterval(detectVideoResolution, 10000);


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
});
