
let sessions = []; // Cache en mémoire pour rapidité
// Variables pour débounce anti-faux événements

// Variables pour suivre le chrono
let currentUrl = null;       // L'URL actuellement chronométrée
let startTime = null;        // Moment où on a commencé à chronométrer (en ms)
let lastFocusTime = 0;
const DEBOUNCE_DELAY = 800;
let isPlaybackActive = false; // Variable pour savoir si une lecture est active (même en background)
// Charge l'historique au démarrage
chrome.storage.local.get('sessions', (result) => {
  sessions = result.sessions || [];
});

// ====================== get emission factors from electricityMap API  ================================

// Facteur par défaut si API échoue (Madagascar approx)
const DEFAULT_ENERGY_INTENSITY = 0.07; // kWh/GB ( sustainablewebdesign.org - 2025 )
const DEFAULT_GRID_INTENSITY = 339; // gCO₂e/kWh (Madagascar last 5 years average - electricitymap.org (2026) )

// Récupère les facteurs CO2 via API (une fois par jour)
async function updateCo2Factors() {
  chrome.storage.local.get('deviceInfo', (result) => {
    const info = result.deviceInfo || {};
    if (info.co2FactorsUpdated && (Date.now() - info.co2FactorsUpdated < 24 * 60 * 60 * 1000)) {
      console.log("Facteurs CO2 déjà à jour");
      return;
    }

    fetch('https://api.electricitymaps.com/v3/carbon-intensity/latest?zone=MG', {
      headers: { 'auth-token': 'Sh3JzpIlKgWZv7zbqjua' } // Remplace par ta clé
    })
      .then(r => r.json())
      .then(data => {
        info.gridCarbonIntensity = data.data.carbonIntensity || DEFAULT_GRID_INTENSITY;
        info.energyIntensity = DEFAULT_ENERGY_INTENSITY;
        info.co2FactorPerGB = (info.energyIntensity * info.gridCarbonIntensity).toFixed(2);
        info.co2FactorsUpdated = Date.now();
        chrome.storage.local.set({ deviceInfo: info });
        console.log("Facteurs CO2 mis à jour via API :", info.co2FactorPerGB, "gCO₂/Go");
      })
      .catch(() => {
        info.gridCarbonIntensity = DEFAULT_GRID_INTENSITY;
        info.energyIntensity = DEFAULT_ENERGY_INTENSITY;
        info.co2FactorPerGB = (info.energyIntensity * info.gridCarbonIntensity).toFixed(2);
        info.co2FactorsUpdated = Date.now();
        chrome.storage.local.set({ deviceInfo: info });
        console.log("Facteurs CO2 fallback :", info.co2FactorPerGB, "gCO₂/Go");
      });
  });
}

// ======================  Réception des messages du content script  ================================

// Écoute les mises à jour de content.js


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "playbackStateChanged") {
    isPlaybackActive = message.playing;

    console.log(`Lecture détectée : ${isPlaybackActive ? "EN COURS" : "ARRÊTÉE"}`);

    // Si lecture active → on force le chrono même sans focus
    if (isPlaybackActive && !startTime) {
      // On redémarre le chrono si nécessaire (ex: playback en background)
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url) {
          startTiming(tabs[0].url);
        }
      });
    }

    // Si lecture arrêtée → on laisse le focus normal gérer l'arrêt
  }
});



// Réception trafic dynamique du content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateVideoQuality") {
    const url = message.url;
    const quality = message.quality;

    chrome.storage.local.get('sessions', (result) => {
      let sessions = result.sessions || [];
      let session = sessions.find(s => s.url === url);

      if (!session) {
        session = {
          url: url,
          domain: new URL(url).hostname,
          totalSize: 0,
          timestamps: []
        };
        sessions.push(session);
      }


      session.videoQuality = quality;  // ← Nouvelle clé

      chrome.storage.local.set({ sessions })
        ;
    })
  }
});


// =============================== Time spent ==========================================

// Événement quand un onglet devient actif
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    // On récupère les infos de l'onglet qui vient d'être activé
    const tab = await chrome.tabs.get(activeInfo.tabId);

    console.log(currentUrl, ' : ', startTime);
    startChrono(tab.url);
  } catch (error) {
    console.error("Erreur onActivated :", error);
  }
});

// 2. Quand la fenêtre reprend le focus
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  const now = Date.now();

  // Debounce simple
  if (now - lastFocusTime < DEBOUNCE_DELAY) {
    console.log("⚠ Ignoré : événement focus trop rapide");
    return;
  }
  lastFocusTime = now;

  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    console.log("Chrome perd le focus → arrêt chrono");
    stopAndSaveTime();  // Arrêt et sauvegarde
  } else {
    try {
      const tabs = await chrome.tabs.query({ active: true, windowId });
      if (tabs[0] && tabs[0].url) {
        startChrono(tabs[0].url);  // ← Appel à la fonction
      }
    } catch (error) {
      console.error("Erreur onFocusChanged :", error);
    }
  }
});

// 3. Quand un onglet est fermé
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  // On vérifie si c'était l'onglet actuellement chronométré
  if (currentUrl && startTime) {
    console.log(`🗑 Onglet fermé → arrêt du chrono en cours pour ${currentUrl}`);
    stopAndSaveTime();  // On sauvegarde le temps écoulé avant fermeture
  }
});

// 4.Au changement d'URL dans un onglet (navigation interne)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active && changeInfo.url !== currentUrl) {
    console.log(`🔄 URL changée dans l'onglet actif → ${changeInfo.url}`);
    startChrono(changeInfo.url);  // Redémarre le chrono pour la nouvelle URL
  }
});

// 5. Quand une fenêtre est fermée
chrome.windows.onRemoved.addListener((windowId) => {
  console.log(`🗑 Fenêtre fermée (ID: ${windowId})`);

  // Si on avait un chrono en cours → on l'arrête et on sauvegarde le temps
  if (currentUrl && startTime) {
    console.log(`→ Arrêt du chrono à cause de la fermeture de la fenêtre`);
    stopAndSaveTime();
  }
});

// background.js – Récupération des infos appareil + géolocalisation (approche mixte : automatique au premier lancement, fallback manuel via message)

// Fonction pour détecter le type d'appareil
function detectDeviceType() {
  const ua = navigator.userAgent.toLowerCase();
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

// Récupère ou crée les infos appareil + demande géolocalisation automatique au premier lancement
function initializeDeviceInfo() {
  chrome.storage.local.get('deviceInfo', (result) => {
    let info = result.deviceInfo || {};

    // Infos de base (toujours disponibles)
    info.deviceType = detectDeviceType();
    info.cpuCores = navigator.hardwareConcurrency || 'Inconnu';
    info.memoryGB = navigator.deviceMemory || 'Inconnu';
    // info.screen = `${screen.width}x${screen.height} (ratio ${window.devicePixelRatio || 1})`;
    info.language = navigator.language || 'Inconnu';
    info.userAgent = navigator.userAgent;
    info.updatedAt = Date.now();
    chrome.storage.local.set({ deviceInfo: info });

    // Demande géolocalisation automatique si pas encore fait ou refusé
    // if (!info.geoTimestamp && !info.geoRefused) {
    //   requestGeolocation(info);
    // } else {
    //   chrome.storage.local.set({ deviceInfo: info });
    // }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "saveGeolocation") {
    chrome.storage.local.get('deviceInfo', (result) => {
      const info = result.deviceInfo || {};
      info.latitude = message.latitude;
      info.longitude = message.longitude;
      info.city = message.city;
      info.country = message.country;
      info.geoTimestamp = Date.now();
      if (message.refused) info.geoRefused = true;

      chrome.storage.local.set({ deviceInfo: info });
      console.log("Géolocalisation sauvegardée :", info.city, info.country);
    });
  }
});

// Fonction pour demander la géolocalisation
function requestGeolocation(info) {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude.toFixed(6);
      const lon = position.coords.longitude.toFixed(6);

      // Reverse geocoding gratuit avec OpenStreetMap Nominatim
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`)
        .then(r => r.json())
        .then(data => {
          info.latitude = lat;
          info.longitude = lon;
          info.city = data.address?.city || data.address?.town || data.address?.village || 'Inconnue';
          info.country = data.address?.country || 'Inconnu';
          info.country_code = data.address?.country_code || 'Inconnu';
          info.geoTimestamp = Date.now();
          chrome.storage.local.set({ deviceInfo: info });
          console.log("Géolocalisation automatique réussie");
        })
        .catch(() => {
          info.latitude = lat;
          info.longitude = lon;
          info.city = 'Inconnue';
          info.country = 'Inconnu';
          info.geoTimestamp = Date.now();
          chrome.storage.local.set({ deviceInfo: info });
        });
    },
    (error) => {
      console.log("Géolocalisation automatique refusée ou échouée :", error.message);
      info.geoRefused = true;
      info.geoTimestamp = Date.now();
      chrome.storage.local.set({ deviceInfo: info });
    },
    { timeout: 15000, maximumAge: 3600000 } // 15s timeout, cache 1h
  );
}

// Lancement automatique au premier démarrage/installation
chrome.runtime.onInstalled.addListener(initializeDeviceInfo);
chrome.runtime.onStartup.addListener(initializeDeviceInfo);

// Fallback manuel : écoute un message pour redemander (ex: depuis un bouton ailleurs)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "requestGeoManual") {
    chrome.storage.local.get('deviceInfo', (result) => {
      const info = result.deviceInfo || {};
      delete info.geoRefused; // On oublie le refus précédent
      chrome.storage.local.set({ deviceInfo: info }, () => {
        requestGeolocation(info);
        sendResponse({ status: "Demande relancée" });
      });
    });
    return true; // Pour réponse asynchrone
  }
});


// Fonctions principale de gestion du chrono


// Fonction pour démarrer le chrono sur une URL donnée
async function startChrono(url) {
  if (!url) return;  // Pas d'URL valide

  // Si déjà en cours sur la même URL → rien à faire
  if (currentUrl === url && startTime) {
    return;
  }

  // Arrête d'abord tout chrono précédent
  await stopAndSaveTime();

  // Démarre le nouveau chrono
  currentUrl = url;
  startTime = Date.now();

  console.log(`⏱ Début chrono pour : ${currentUrl}`);
}
// Arrête le chrono et sauvegarde le temps passé
async function stopAndSaveTime() {
  if (!startTime || !currentUrl) return;

  const elapsed = Date.now() - startTime;
  const url = currentUrl;

  // Date du jour au format YYYY-MM-DD (basée sur le premier timestamp de la session)
  const today = new Date().toISOString().split('T')[0]; // "2026-01-04"

  // Clé unique : URL + date
  const sessionKey = `${url}|${today}`;

  // Récupère les sessions
  const result = await chrome.storage.local.get('sessions');
  let sessions = result.sessions || [];

  // Cherche une session avec la même clé
  let session = sessions.find(s => s.key === sessionKey);

  if (!session) {
    // Crée une nouvelle session pour ce jour
    session = {
      key: sessionKey,                    // Clé unique
      url: url,
      domain: new URL(url).hostname,
      date: today,                        // ← Nouvelle colonne date
      totalSize: 0,
      totalTime: 0,
      timestamps: []
    };
    sessions.push(session);
  }

  // Cumule trafic et temps pour ce jour
  session.totalTime += elapsed;
  session.timestamps.push(Date.now());

  // (Le trafic dynamique est déjà ajouté via addTrafficDelta avec la même logique si tu l'utilises)

  // Sauvegarde
  await chrome.storage.local.set({ sessions });

  console.log(`⏱ Session ${today} pour ${url} → temps +${Math.round(elapsed / 1000)}s`);

  // Reset
  startTime = null;
  currentUrl = null;
}


// ===================================
// webRequest : Trafic précis avec URL principale de l'onglet
// ===================================

chrome.webRequest.onCompleted.addListener(
  async (details) => {
    // Ignore les requêtes internes Chrome
    if (details.url.startsWith('chrome-extension://') ||
      details.url.startsWith('chrome://') ||
      details.url.startsWith('about:')) {
      return;
    }

    // Taille de la réponse
    let size = 0;
    if (details.responseHeaders) {
      const header = details.responseHeaders.find(h => h.name.toLowerCase() === 'content-length');
      if (header && header.value) {
        size = parseInt(header.value, 10);
      }
    }

    // Fallback pour streaming (transfer-encoding: chunked)
    if (size === 0 && details.method === 'GET') {
      size = 50000; // Estimation conservatrice
    }

    if (size === 0) return;

    let tabUrl = 'unknown';
    try {
      const tab = await chrome.tabs.get(details.tabId);
      if (tab && tab.url) {
        tabUrl = tab.url;
      }
    } catch (e) {
      return; // Onglet fermé ou inaccessible
    }

    const today = new Date().toISOString().split('T')[0];
    const sessionKey = `${tabUrl}|${today}`;
    let requestType = ''

    if (details.type === 'xmlhttprequest') requestType = 'xhr';
    else if (details.type === 'fetch') requestType = 'fetch';
    else if (details.type === 'media') requestType = 'media';
    else if (details.type === 'image') requestType = 'image';
    else if (details.type === 'script') requestType = 'script';
    else if (details.type === 'websocket') requestType = 'webSocket';

    // Cumul dans sessions
    chrome.storage.local.get('sessions', (result) => {
      let sessions = result.sessions || [];
      let session = sessions.find(s => s.key === sessionKey);

      if (!session) {
        session = {
          key: sessionKey,
          url: tabUrl,
          domain: new URL(tabUrl).hostname,
          date: today,
          totalSize: 0,
          totalTime: 0,
          xhrRequests: 0,
          mediaRequests: 0,
          imagesRequests: 0,
          webSocketRequests: 0,
          fetchRequests: 0,
          scriptRequests: 0,
          timestamps: [],
          co2Grams: 0,
          co2Kg: "0.00"
        };
        sessions.push(session);
      }

      switch (requestType) {
        case 'xhr': session.xhrRequests++; break;
        case 'fetch': session.fetchRequests++; break;
        case 'media': session.mediaRequests++; break;
        case 'image': session.imageRequests++; break;
        case 'script': session.scriptRequests++; break;
        case 'webSocket': session.webSocketRequests++; break;
      }

      session.totalSize += size;
      session.timestamps.push(Date.now());

      chrome.storage.local.get('deviceInfo', (result) => {
        const info = result.deviceInfo || {};
        const co2Factor = parseFloat(info.co2FactorPerGB) || (DEFAULT_ENERGY_INTENSITY * DEFAULT_GRID_INTENSITY);
        
        session.co2Grams = session.totalSize / 1_000_000_000 * co2Factor;
        session.co2Kg = (session.co2Grams / 1000).toFixed(3);


        // Option : équivalence arbres/voitures (pour affichage)
        session.equivTrees = (session.co2Grams / 22000).toFixed(2); // gCO₂ par arbre par jour
        session.equivCarKm = (session.co2Grams / 180).toFixed(2); // gCO₂/km voiture moyenne

        chrome.storage.local.set({ sessions });
      });
    });
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

// Appel automatique
chrome.runtime.onStartup.addListener(updateCo2Factors);
chrome.runtime.onInstalled.addListener(updateCo2Factors);