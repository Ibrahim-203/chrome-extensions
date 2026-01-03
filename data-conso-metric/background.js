// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   if (request.action === 'saveTabData') {
//     // ✅ sender.tab.id = l'ID de l'onglet AUTOMATIQUE
//     const tabId = sender.tab?.id;
    
//     if (!tabId) {
//       sendResponse({ status: 'no-tab-id' });
//       return true;
//     }

//     const key = `tabData_${tabId}`;
//     chrome.storage.local.set({
//       [key]: request.data
//     });
    
//     console.log(`✅ Données sauvegardées pour onglet ${tabId}: ${request.data.title}`);
//     sendResponse({ status: 'saved' });
//   }
//   return true;
// });

// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   if (request.action === 'updateTabData' && sender.tab?.id) {
//     const key = `tabData_${sender.tab.id}`;
//     chrome.storage.local.set({ [key]: request.data });
//     sendResponse({ status: 'updated' });
//   }
//   return true;
// });

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

// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   if (request.action === 'updateSessionData' && sender.tab?.id) {
//     const tabId = sender.tab.id;
//     const currentUrl = request.data.url;

//     // Trouve ou crée la session pour cette URL
//     let session = sessions.find(s => s.url === currentUrl);
//     if (!session) {
//       session = {
//         url: currentUrl,
//         domain: new URL(currentUrl).hostname, // Ex: 'youtube.com'
//         totalSize: 0,
//         totalTime: 0, // Pour futur temps passé
//         timestamps: [] // Pour plusieurs visites
//       };
//       sessions.push(session);
//     }

//     // Cumule le delta (nouvelle data)
//     session.totalSize += request.data.sizeDelta;
//     session.timestamps.push(request.data.timestamp);

//     // Sauvegarde global
//     chrome.storage.local.set({ sessions });

//     sendResponse({ status: 'updated' });
//   }
//   return true;
// });

// Réception trafic dynamique du content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "addTrafficDelta") {
    const url = message.url;
    const delta = message.delta;

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

      session.totalSize += delta;
      session.timestamps.push(Date.now());

      chrome.storage.local.set({ sessions });
    });
  }else if (message.action === "updateVideoQuality") {
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

      chrome.storage.local.set({ sessions });
    });
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

  const elapsed = Date.now() - startTime;  // Temps écoulé en millisecondes
  const url = currentUrl;

  // Récupère les temps déjà sauvegardés
  const result = await chrome.storage.local.get('timeByUrl');
  const timeByUrl = result.timeByUrl || {};

  // Ajoute le temps écoulé à cette URL
  timeByUrl[url] = (timeByUrl[url] || 0) + elapsed;

  // Sauvegarde
  await chrome.storage.local.set({ timeByUrl });

  console.log(`⏱ Arrêt chrono pour ${url} → +${Math.round(elapsed / 1000)} secondes`);

  // Reset pour le prochain onglet
  startTime = null;
  currentUrl = null;
}