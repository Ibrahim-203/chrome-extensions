const tabsList = document.getElementById('tabsList');
const statusDiv = document.getElementById('status');
const topSitesList = document.getElementById('topSitesList');
// const refreshBtn = document.getElementById('refreshBtn');
const exportBtn = document.getElementById('exportBtn');
const timeList = document.getElementById('timeList');
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
    const result = await chrome.storage.local.get('timeByUrl');
    const timeByUrl = result.timeByUrl || {};
    const sessions = storage.sessions || [];

    // 2. Vue 1 : Onglets ouverts (live)
    // - Liste les onglets actuels
    // - Pour chaque, trouve la session correspondante à son URL actuelle
    const tabs = await chrome.tabs.query({});
    tabsList.innerHTML = '';
    tabs.forEach(tab => {
      const session = sessions.find(s => s.url === tab.url);  // Associe à la session
      const sizeText = session ? formatSize(session.totalSize) : 'Non mesuré';
      const timeMs = timeByUrl[tab.url] || 0;
      const timeText = formatTime(timeMs);

      const li = document.createElement('li');
      li.innerHTML = `
        <strong>${tab.title.substring(0, 30)}...</strong><br>
        <small>${tab.url.substring(0, 50)}...</small><br>
        <b>${sizeText}</b> (live)
      `;
      tabsList.appendChild(li);
    });

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
    Object.keys(timeByUrl).forEach(url => {
      try {
        const domain = new URL(url).hostname;
        byDomain[domain] = (byDomain[domain] || 0) + timeByUrl[url];
      } catch (e) {
        // URL invalide (chrome://, etc.) → ignorée
      }
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
    statusDiv.textContent = "Erreur : " + error.message;
  }
}

// Formatage des tailles
function formatSize(bytes) {
  if (bytes === 0) return '0 Ko';
  const k = 1024;
  const sizes = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

// Mise à jour live (toutes les 2s)
function startLiveUpdate() {
  loadData();
  interval = setInterval(loadData, 2000);
}

// Export (historique sessions)
exportBtn.addEventListener('click', async () => {
  const storage = await chrome.storage.local.get('sessions');
  const blob = new Blob([JSON.stringify(storage.sessions || [], null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename: 'sessions-data.json' });
});

// Démarrage
startLiveUpdate();
// refreshBtn.addEventListener('click', loadData);

// Arrêt interval si popup ferme
window.addEventListener('unload', () => clearInterval(interval));

async function showDataStore (){
  const data = await chrome.storage.local.get(null)
  console.log(data)
}

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

window.addEventListener('load', ()=>{
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

async function clearLocalStorage(){
  try{
    await chrome.storage.local.clear();
    console.log("Local storage cleared.");
    loadData();
  }catch(error){
    console.error("Error clearing local storage:", error);
  }
  
}

document.getElementById('ClearData').addEventListener('click', clearLocalStorage);

// Arrêt si popup fermée
window.addEventListener('unload', () => {
  if (interval) clearInterval(interval);
});