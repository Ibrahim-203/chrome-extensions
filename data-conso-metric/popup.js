const tabsList = document.getElementById('tabsList');
const statusDiv = document.getElementById('status');
const topSitesList = document.getElementById('topSitesList');
// const refreshBtn = document.getElementById('refreshBtn');
const exportBtn = document.getElementById('exportBtn');
const timeList = document.getElementById('timeList');
const copyBtn = document.getElementById('copyId');
let interval = null;


async function updatePopup() {
  const tabs = await chrome.tabs.query({});
  const storage = await chrome.storage.local.get(null);
  const tabData = {};

  Object.keys(storage).forEach(key => {
    if (key.startsWith('tabData_')) {
      tabData[key.split('_')[1]] = storage[key];
    }
  });

  tabsList.innerHTML = '';
  tabs.forEach(tab => {
    const data = tabData[tab.id];
    const sizeText = data ? formatSize(data.size) : 'Chargement...';

    const li = document.createElement('li');
    li.innerHTML = `
      <strong>${tab.title.substring(0, 30)}...</strong><br>
      <small>${tab.url.substring(0, 50)}...</small><br>
      <b style="color: #d93025;">${sizeText}</b>
      ${data ? ` <small style="color: #1a73e8;">(live)</small>` : ''}
    `;
    tabsList.appendChild(li);
  });
}



// Algorithme principal : charger et afficher les deux vues
async function loadData() {
  // statusDiv.textContent = "Chargement...";

  try {
    // 1. Récupère l'historique des sessions (global, persistant)
    const storage = await chrome.storage.local.get('sessions');
    const sessions = storage.sessions || [];
    const today = new Date().toISOString().split('T')[0];


    // 2. Vue 1 : Onglets ouverts (live)
    // - Liste les onglets actuels
    // - Pour chaque, trouve la session correspondante à son URL actuelle
    const tabs = await chrome.tabs.query({});
    tabsList.innerHTML = '';
    if (tabs.length > 0) {
      tabs.forEach(tab => {
        const sessionsKey = `${tab.url}|${today}`
        const session = sessions.find(s => s.key === sessionsKey);  // Associe à la session
        const sizeText = session ? formatSize(session.totalSize) : 'Non mesuré';
        const co2Text = session ? `${session.co2Kg} kg CO₂e` : '0 kg CO₂e';
        const timeMs = session?.totalTime || 0;
        const timeText = formatTime(timeMs);

        const li = document.createElement('li');
        li.innerHTML = `
        <strong>${tab.title.substring(0, 30)}...</strong><br>
        <small>${tab.url.substring(0, 50)}...</small><br>
        <b>${sizeText} | ${timeText} | ${co2Text}</b> (live)
      `;
        tabsList.appendChild(li);
      });
    } else {
      tabsList.innerHTML = '<li>Aucun onglet ouvert</li>';
    }


    // 3. Vue 2 : Top sites historiques (agrégé par domaine)
    // - Groupe toutes les sessions par domaine
    // - Cumule les tailles
    // - Trie du plus gros au plus petit
    const aggregated = {};
    sessions.forEach(s => {
      if (!aggregated[s.domain]) aggregated[s.domain] = { totalSize: 0, visits: 0 };
      aggregated[s.domain].totalSize += s.totalSize;
      aggregated[s.domain].visits++;
    });

    const sorted = Object.entries(aggregated).sort((a, b) => b[1].totalSize - a[1].totalSize).slice(0, 5);
    topSitesList.innerHTML = '';
    sorted.forEach(([domain, data]) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <strong>${domain}</strong><br>
        <small>${formatSize(data.totalSize)} total | ${data.visits} visites</small>
      `;
      topSitesList.appendChild(li);
    });

    const byDomain = {};

    // Parcourt toutes les sessions pour agréger le temps par domaine
    sessions.forEach(session => {
      const domain = session.domain || (session.url ? new URL(session.url).hostname : 'inconnu');

      // Ajoute le temps de cette session au domaine
      byDomain[domain] = (byDomain[domain] || 0) + (session.totalTime || 0);
    });

    // Tri du plus grand au plus petit
    const sortedTime = Object.entries(byDomain)
      .sort((a, b) => b[1] - a[1]);

    timeList.innerHTML = '';
    if (sortedTime.length === 0) {
      timeList.innerHTML = '<li>Aucun temps enregistré</li>';
    } else {
      sortedTime.forEach(([domain, ms]) => {
        const li = document.createElement('li');
        li.innerHTML = `
          <strong>${domain}</strong><br>
          <span class="time">${formatTime(ms)}</span>
        `;
        timeList.appendChild(li);
      });
    }

    statusDiv.textContent = "Données mises à jour";
  } catch (error) {
    statusDiv.textContent = "Erreur ato : " + error.message;
  }
}


// Convertit millisecondes → format lisible (ex: 1h 23min 45s)
function formatTime(ms) {
  if (ms === 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let str = '';
  if (hours > 0) str += `${hours}h `;
  if (minutes > 0 || hours > 0) str += `${minutes}min `;
  str += `${seconds}s`;

  return str.trim();
}

// Copy chrome runtime id to clipboard
copyBtn.addEventListener('click', () => {
  const extensionId = chrome.runtime.id;
  navigator.clipboard.writeText(extensionId).then(() => {
       // déclenche l'animation de sortie
    copyBtn.classList.add('is-changing');

    setTimeout(() => {
      // switch icône
      copyBtn.classList.remove('fa-copy');
      copyBtn.classList.add('fa-check', 'success');

      // animation d'entrée
      copyBtn.classList.remove('is-changing');
    }, 200);

    // retour à l’icône initiale
    setTimeout(() => {
      copyBtn.classList.add('is-changing');

      setTimeout(() => {
        copyBtn.classList.remove('fa-check', 'success');
        copyBtn.classList.add('fa-copy');
        copyBtn.classList.remove('is-changing');
      }, 200);
    }, 2000);
  }).catch(err => {
    console.error('Erreur de copie : ', err);
  });

});

// Export JSON (sessions + deviceInfo)
exportBtn.addEventListener('click', async () => {
  try {
    const storage = await chrome.storage.local.get(['sessions', 'deviceInfo']);
    const data = {
      deviceInfo: storage.deviceInfo || {},
      sessions: storage.sessions || []
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: 'data-collector.json', saveAs: true });
  } catch (error) {
    console.error("Erreur export :", error);
    status.textContent = "Erreur export : " + error.message;
  }
});

// Démarrage
startLiveUpdate();
// refreshBtn.addEventListener('click', loadData);

// Arrêt interval si popup ferme
window.addEventListener('unload', () => clearInterval(interval));

async function showDataStore() {
  const data = await chrome.storage.local.get(null)
  console.log(data)
}

// Formatage des tailles
function formatSize(bytes) {
  if (!bytes) return '0 Ko';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// Mise à jour toutes les 2 secondes
function startLiveUpdate() {
  loadData();
  interval = setInterval(loadData, 2000);
  console.log("live on")
}

document.getElementById('exportBtn').addEventListener('click', async () => {
  const storage = await chrome.storage.local.get(null);
  const data = Object.values(storage).filter(v => v.url);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename: 'streaming-data.json' });
});

// Démarrage
startLiveUpdate();

window.addEventListener('load', () => {
  showDataStore()

  const tabButtons = document.querySelectorAll('.tab i');
  const tabContents = document.querySelectorAll('.tab-content');
  console.log(tabContents)

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const target = button.getAttribute('data-target');

      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'))

      button.classList.add('active');
      document.getElementById(target).classList.add('active');

    });
  })

})

async function clearLocalStorage() {
  try {
    await chrome.storage.local.clear();
    console.log("Local storage cleared.");
    loadData();
  } catch (error) {
    console.error("Error clearing local storage:", error);
  }

}

document.getElementById('ClearData').addEventListener('click', clearLocalStorage);

// Arrêt si popup fermée
window.addEventListener('unload', () => {
  if (interval) clearInterval(interval);
});

// Connexion Google via chrome.identity
document.getElementById('loginBtn')?.addEventListener('click', () => {
  const status = document.getElementById('userStatus');
  status.textContent = "Connexion en cours...";

  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError) {
      status.textContent = "Erreur : " + chrome.runtime.lastError.message;
      return;
    }

    // Avec le token, on récupère les infos utilisateur Google
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': 'Bearer ' + token.token }
    })
      .then(response => response.json())
      .then(user => {
        const ownerUid = user.sub; // ID unique Google (stable et unique par compte)
        const ownerEmail = user.email;
        const ownerName = user.name || user.given_name || 'Utilisateur';

        // Stocke dans deviceInfo
        chrome.storage.local.get('deviceInfo', (result) => {
          const info = result.deviceInfo || {};
          info.ownerUid = ownerUid;
          info.ownerEmail = ownerEmail;
          info.ownerName = ownerName;
          info.ownerConnectedAt = Date.now();

          chrome.storage.local.set({ deviceInfo: info }, () => {
            status.innerHTML = `Connecté : <strong>${ownerName}</strong> (${ownerEmail})`;
            // Option : rafraîchir le dashboard ou la popup
          });
        });
      })
      .catch(error => {
        status.textContent = "Erreur connexion : " + error.message;
      });
  });
});

// Affichage de l’état actuel au chargement de la popup
chrome.storage.local.get('deviceInfo', (result) => {
  const info = result.deviceInfo || {};
  const status = document.getElementById('userStatus');

  if (info.ownerUid) {
    status.innerHTML = `Connecté : <strong>${info.ownerName || 'Utilisateur'}</strong> (${info.ownerEmail})`;
    document.getElementsByClassName('gsi-material-button-contents').textContent = "Changer de compte";
  } else {
    status.textContent = "Non connecté – Connectez-vous pour associer vos données";
  }
});

function updateSession(){
  chrome.storage.local.get('sessions', (result) => {
    const sessions = result.sessions || [];
    sessions.forEach(session =>{
      session.co2Grams = session.totalSize/1_000_000_000 * 143.18;
      session.co2Kg = (session.co2Grams / 1000).toFixed(3);
    }) 
    chrome.storage.local.set({sessions}, () => {      console.log("sessions updated with CO2 data")
    }); 
  })
}