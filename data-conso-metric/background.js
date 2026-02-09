// Au tout début de background.js
importScripts('./assets/firebase/firebase.app.compat.js')
importScripts('./assets/firebase/firebase.database.compat.js')

// ============================= Firebase setup ==================================
// Variables pour throttle
let lastSyncTime = 0;
const SYNC_INTERVAL = 30000; // 30 secondes (ajustable : 15s pour plus réactif, 60s pour économie)

const firebaseConfig = {
  apiKey: "AIzaSyDol1NoTuwb849gjARAgmisEWK-u1Pli3g",
  authDomain: "data-collector-mvp.firebaseapp.com",
  projectId: "data-collector-mvp",
  storageBucket: "data-collector-mvp.firebasestorage.app",
  messagingSenderId: "13360282567",
  appId: "1:13360282567:web:4f678a5ace717a6ab0f7e2",
  measurementId: "G-6NZL88N3Y3"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Cache en mémoire pour rapidité
let sessions = [];
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

// ====================== get emission factors from ember API  ================================

const EMBER_API_BASE = "https://api.ember-energy.org/v1";
// SWD = Sustainable Web Design - embodied (fabrication) + operational (usage)
const DEFAULT_ENERGY_INTENSITY = {
  "model": "SWD-v4",
  "valid_from": 2025,
  "assumptions": {
    "network_kwh_per_gb": 0.072,
    "datacenter_kwh_per_gb": 0.067,
    "device_kwh_per_gb": 0.161
  }
}; // kWh/GB (moyenne mondiale 2025-2026)
const API_KEY = '7c797af9-103b-3f32-acc1-941be6ad37f3'

// Fonction pour récupérer le facteur carbone Ember par pays
async function fetchEmberCarbonIntensity(countryCode) {
  // countryCode = "MDG" pour Madagascar, "FR" pour France, etc.
  // Ember utilise des codes ISO 3166-1 alpha-2
  try {
    console.log(`[Ember API] Appel pour pays ${countryCode}`);

    const response = await fetch(`${EMBER_API_BASE}/carbon-intensity/yearly?entity_code=MDG&api_key=${API_KEY}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Ember API status: ${response.status}`);
    }

    const data = await response.json();
    console.log("[Ember API] Réponse reçue :", data);

    // Ember retourne souvent l'intensité carbone annuelle/mensuelle
    // On prend la dernière valeur disponible (mensuelle ou annuelle)
    const latest = data.data?.[data.data.length - 1];
    const intensity = latest?.emissions_intensity_gco2_per_kwh || null;

    if (intensity) {
      return intensity; // gCO₂/kWh
    } else {
      throw new Error("Aucune intensité carbone trouvée");
    }
  } catch (error) {
    console.error("[Ember API] Erreur :", error);
    return null;
  }
}

async function updateEmberCo2Factor() {
  const TOTAL_ENERGY_INTENSITY = DEFAULT_ENERGY_INTENSITY.assumptions.network_kwh_per_gb +
    DEFAULT_ENERGY_INTENSITY.assumptions.datacenter_kwh_per_gb +
    DEFAULT_ENERGY_INTENSITY.assumptions.device_kwh_per_gb;
  chrome.storage.local.get('deviceInfo', async (result) => {
    const info = result.deviceInfo || {};

    // On récupère le code pays depuis la géolocalisation (ou fallback)
    let countryCode = 'MDG'; // Fallback Madagascar

    // Appel Ember
    const gridIntensity = await fetchEmberCarbonIntensity(countryCode);

    if (gridIntensity) {
      info.gridCarbonIntensity = gridIntensity;
      info.energyIntensity = TOTAL_ENERGY_INTENSITY;
      info.co2FactorPerGB = (TOTAL_ENERGY_INTENSITY * gridIntensity).toFixed(2);
      info.co2Source = "Ember";
      info.co2UpdatedAt = Date.now();
    } else {
      // Fallback
      info.gridCarbonIntensity = 600;
      info.energyIntensity = TOTAL_ENERGY_INTENSITY;
      info.co2FactorPerGB = (TOTAL_ENERGY_INTENSITY * 600).toFixed(2);
      info.co2Source = "Fallback";
      info.co2UpdatedAt = Date.now();
    }

    chrome.storage.local.set({ deviceInfo: info });
    console.log("[CO2] Facteur Ember mis à jour :", info.co2FactorPerGB, "gCO₂/Go");
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
chrome.runtime.onSuspend.addListener(() => syncToFirebase(sessions));

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

// Lancement automatique au premier démarrage/installation
chrome.runtime.onInstalled.addListener(() => {
  initializeDeviceInfo();
  updateEmberCo2Factor();
  resetTodaySessions();
  updateSessionStructure()
});
chrome.runtime.onStartup.addListener(() => {
  initializeDeviceInfo();
  updateEmberCo2Factor();
  resetTodaySessions()
  updateSessionStructure()
});

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

// ================================ Functions ========================================

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

  // Date du jour au format YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];

  // Clé unique : URL + date
  const sessionKey = `${url}|${today}`;

  // Récupère les deux clés
  const result = await chrome.storage.local.get(['todaySessions', 'unsentSessions']);
  let todaySessions = result.todaySessions || [];
  let unsentSessions = result.unsentSessions || [];

  // ────────────────────────────────────────────────────────────────
  // 1. Gestion de todaySessions (affichage popup)
  // ────────────────────────────────────────────────────────────────

  let todaySession = todaySessions.find(s => s.key === sessionKey);

  if (!todaySession) {
    todaySession = {
      key: sessionKey,
      url: url,
      domain: new URL(url).hostname,
      date: today,
      totalSize: 0,
      totalTime: 0,
      xhrRequests: 0,
      mediaRequests: 0,
      imageRequests: 0,
      webSocketRequests: 0,
      fetchRequests: 0,
      scriptRequests: 0,
      timestamps: [],
      co2Grams: 0,
      co2Kg: "0.00",
      equivTrees: "0.00",
      equivCarKm: "0.00"
    };
    todaySessions.push(todaySession);
  }

  // Cumule temps et timestamp
  todaySession.totalTime += elapsed;
  todaySession.timestamps.push(Date.now());

  // ────────────────────────────────────────────────────────────────
  // 2. Gestion de unsentSessions (envoi incrémental)
  // ────────────────────────────────────────────────────────────────

  let unsentSession = unsentSessions.find(s => s.key === sessionKey);

  if (!unsentSession) {
    // On réutilise l’objet todaySession (même référence) pour éviter duplication mémoire
    unsentSession = todaySession;
    unsentSessions.push(unsentSession);
  }

  // Cumule temps et timestamp (déjà fait sur todaySession, donc synchronisé)
  // Pas besoin de refaire ici

  // ────────────────────────────────────────────────────────────────
  // 3. Calcul CO₂ (une seule fois, car les deux objets sont liés)
  // ────────────────────────────────────────────────────────────────

  const deviceInfoResult = await chrome.storage.local.get('deviceInfo');
  const info = deviceInfoResult.deviceInfo || {};
  const co2Factor = parseFloat(info.co2FactorPerGB) || 0.02864; // fallback

  const totalGB = todaySession.totalSize / 1_000_000_000;
  todaySession.co2Grams = totalGB * co2Factor;
  todaySession.co2Kg = (todaySession.co2Grams / 1000).toFixed(3);

  todaySession.equivTrees = (todaySession.co2Grams / 22000).toFixed(2);
  todaySession.equivCarKm = (todaySession.co2Grams / 180).toFixed(2);

  // ────────────────────────────────────────────────────────────────
  // 4. Sauvegarde des deux clés
  // ────────────────────────────────────────────────────────────────

  await chrome.storage.local.set({
    todaySessions,
    unsentSessions
  });

  console.log(`[Time] Session ${today} pour ${url} → +${Math.round(elapsed / 1000)}s | Aujourd’hui: ${todaySessions.length} | En attente: ${unsentSessions.length}`);

  // Déclenche sync si seuil atteint
  if (unsentSessions.length >= 5) {
    console.log(unsentSessions.length, "sessions en attente → déclenchement sync");
    // syncUnsentSessions();
  }

  // Reset
  startTime = null;
  currentUrl = null;
}

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

function syncToFirebase(sessions) {
  const deviceId = 'device_' + chrome.runtime.id;
  db.ref('users/' + deviceId + '/sessions').set(sessions)
    .then(() => console.log("[Firebase] Sync OK - " + new Date().toLocaleTimeString()))
    .catch(error => console.error("[Firebase] Sync erreur :", error));
}


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

// Génère un UUID v4 (simple, sans dépendance externe)
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// reset todaySessions à minuit
function resetTodaySessions() {
  const today = new Date().toISOString().split('T')[0];   // ex: "2026-01-27"

  chrome.storage.local.get('todayDate', (result) => {
    const savedDate = result.todayDate;

    // Si on a changé de jour → on reset
    if (savedDate !== today) {
      chrome.storage.local.set({
        todayDate: today,           // met à jour la date du jour
        todaySessions: []           // vide les sessions du jour précédent
      });
      console.log(`[Reset] Nouveau jour (${today}) → todaySessions vidé`);
    }
  });
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

    chrome.storage.local.get(['todaySessions', 'unsentSessions'], (result) => {
      let todaySessions = result.todaySessions || [];
      let unsentSessions = result.unsentSessions || [];

      // 1. Recherche ou création de la session (pour aujourd'hui et pour l'envoi)
      let todaySession = todaySessions.find(s => s.key === sessionKey);
      let unsentSession = unsentSessions.find(s => s.key === sessionKey);

      // Si la session n'existe pas encore pour aujourd'hui → on la crée
      if (!todaySession) {
        todaySession = {
          key: sessionKey,
          url: tabUrl,
          domain: new URL(tabUrl).hostname,
          date: today,
          totalSize: 0,
          totalTime: 0,
          xhrRequests: 0,
          fetchRequests: 0,
          mediaRequests: 0,
          imageRequests: 0,
          scriptRequests: 0,
          webSocketRequests: 0,
          timestamps: [],
          co2Grams: 0,
          co2Kg: "0.00",
          equivTrees: "0.00",
          equivCarKm: "0.00"
        };
        todaySessions.push(todaySession);
      }

      // Même chose pour le buffer d'envoi (on ne duplique pas l'objet, on le réutilise)
      if (!unsentSession) {
        // On peut réutiliser l'objet todaySession (même référence) pour éviter duplication mémoire
        unsentSession = todaySession;
        unsentSessions.push(unsentSession);
      }

      // 2. Mise à jour des compteurs de requêtes (une seule fois pour les deux)
      const counters = {
        xhr: 'xhrRequests',
        fetch: 'fetchRequests',
        media: 'mediaRequests',
        image: 'imageRequests',
        script: 'scriptRequests',
        webSocket: 'webSocketRequests'
      };

      const counterKey = counters[requestType];
      if (counterKey) {
        todaySession[counterKey]++;
        // Pas besoin de le faire deux fois : unsentSession pointe sur le même objet
      }

      // 3. Mise à jour globale (taille, timestamp, CO2)
      const now = Date.now();
      todaySession.totalSize += size;
      todaySession.timestamps.push(now);

      // 4. Calcul CO2 (une seule fois)
      chrome.storage.local.get('deviceInfo', (res) => {
        const info = res.deviceInfo || {};
        const co2Factor = parseFloat(info.co2FactorPerGB) || 0.02864; // valeur par défaut

        const totalGB = todaySession.totalSize / 1_000_000_000;
        todaySession.co2Grams = totalGB * co2Factor;
        todaySession.co2Kg = (todaySession.co2Grams / 1000).toFixed(3);

        // Équivalences (calculées une fois)
        todaySession.equivTrees = (todaySession.co2Grams / 22000).toFixed(2);
        todaySession.equivCarKm = (todaySession.co2Grams / 180).toFixed(2);

        // Sauvegarde des deux clés (todaySessions est déjà à jour)
        chrome.storage.local.set({
          todaySessions,
          unsentSessions
        });

        console.log(`[Storage] Session mise à jour - Aujourd’hui : ${todaySessions.length} | En attente : ${unsentSessions.length}`);

        // Déclenchement sync si seuil atteint
        // Déclenche sync si seuil atteint
        if (unsentSessions.length >= 5) {
          console.log(unsentSessions.length, "sessions en attente → déclenchement sync");
          // syncUnsentSessions();
        }
      });
    });

    // Cumul dans sessions
    // chrome.storage.local.get('sessions', (result) => {
    //   let sessions = result.sessions || [];
    //   let session = sessions.find(s => s.key === sessionKey);

    //   if (!session) {
    //     session = {
    //       key: sessionKey,
    //       url: tabUrl,
    //       domain: new URL(tabUrl).hostname,
    //       date: today,
    //       totalSize: 0,
    //       totalTime: 0,
    //       xhrRequests: 0,
    //       mediaRequests: 0,
    //       imagesRequests: 0,
    //       webSocketRequests: 0,
    //       fetchRequests: 0,
    //       scriptRequests: 0,
    //       timestamps: [],
    //       co2Grams: 0,
    //       co2Kg: "0.00"
    //     };
    //     sessions.push(session);
    //   }

    //   switch (requestType) {
    //     case 'xhr': session.xhrRequests++; break;
    //     case 'fetch': session.fetchRequests++; break;
    //     case 'media': session.mediaRequests++; break;
    //     case 'image': session.imageRequests++; break;
    //     case 'script': session.scriptRequests++; break;
    //     case 'webSocket': session.webSocketRequests++; break;
    //   }

    //   session.totalSize += size;
    //   session.timestamps.push(Date.now());

    //   chrome.storage.local.get('deviceInfo', (result) => {
    //     const info = result.deviceInfo || {};
    //     const co2Factor = parseFloat(info.co2FactorPerGB) || (DEFAULT_ENERGY_INTENSITY * DEFAULT_GRID_INTENSITY);

    //     session.co2Grams = session.totalSize / 1_000_000_000 * co2Factor;
    //     session.co2Kg = (session.co2Grams / 1000).toFixed(3);


    //     // Option : équivalence arbres/voitures (pour affichage)
    //     session.equivTrees = (session.co2Grams / 22000).toFixed(2); // gCO₂ par arbre par jour
    //     session.equivCarKm = (session.co2Grams / 180).toFixed(2); // gCO₂/km voiture moyenne

    //     chrome.storage.local.set({ sessions });
    //     const now = Date.now();
    //     if (now - lastSyncTime >= SYNC_INTERVAL) {
    //       lastSyncTime = now;
    //       syncToFirebase(sessions);
    //     }
    //   });
    // });
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

async function syncUnsentSessions() {
  chrome.storage.local.get('unsentSessions', async (result) => {
    const unsent = result.unsentSessions || [];
    if (unsent.length === 0) return;

    const deviceId = chrome.runtime.id;

    try {
      console.log(`[Sync] Envoi de ${unsent.length} sessions`);

      const sessionsRef = db.ref(`users/devices_${deviceId}/sessions`);

      for (const session of unsent) {
        const sessionKey = session.key;
        if (!sessionKey) continue;

        const sessionRef = db.ref(`users/devices_${deviceId}/sessions/${sessionKey}`);
        sessionRef.set(session);
      }

      console.log("[Sync] Succès");

      // Vide seulement le buffer unsent (todaySessions reste intact)
      chrome.storage.local.set({ unsentSessions: [] });
    } catch (err) {
      console.error("[Sync] Échec :", err.message);
      // Retry dans 30s
      setTimeout(syncUnsentSessions, 30000);
    }
  });
}

async function updateSessionStructure() {
  let sessions = await chrome.storage.local.get('sessions')
  sessions = sessions.sessions || [];
  let newSessions = {};

  sessions = sessions.map(s => {
    const newKey = hashKey(s.key);
   newSessions[newKey] = s;
  });
  // Send to Firebase with new structure
  syncToFirebase(newSessions);
}

function hashKey(originalKey) {
  // Simple hash MD5-like (pas besoin de lib lourde)
  let hash = 0;
  for (let i = 0; i < originalKey.length; i++) {
    const char = originalKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return 's_' + Math.abs(hash).toString(36); // préfixe + base 36
}