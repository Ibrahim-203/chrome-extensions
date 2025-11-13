const tabsList = document.getElementById('tabsList');
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

function formatSize(bytes) {
  if (!bytes) return '0 Ko';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// Mise à jour toutes les 2 secondes
function startLiveUpdate() {
  updatePopup();
  interval = setInterval(updatePopup, 2000);
}

// Démarrage
startLiveUpdate();

// Arrêt si popup fermée
window.addEventListener('unload', () => {
  if (interval) clearInterval(interval);
});