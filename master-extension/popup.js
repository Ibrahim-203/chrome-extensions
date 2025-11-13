const tabsList = document.getElementById("tabsList");

// Récupère TOUS les onglets (toutes les fenêtres)
chrome.tabs.query({}, (tabs) => {
  tabsList.innerHTML = ""; // Vide la liste

  tabs.forEach(tab => {
    const li = document.createElement("li");

    // Favicon (si disponible)
    const favicon = tab.favIconUrl ? 
      `<img src="${tab.favIconUrl}" width="16" height="16" onerror="this.style.display='none'">` : 
      "🌐";

    // Titre (tronqué si trop long)
    const title = tab.title.length > 10 ? tab.title.substring(0, 9) + "..." : tab.title;

    // URL (tronquée)
    const url = tab.url.substring(0, 20) + (tab.url.length > 20 ? "..." : "");

    li.innerHTML = `
      <div class="tab-item">
        <div class="favicon">${favicon}</div>
        <div class="info">
          <strong>${title}</strong><br>
          <small>${url}</small>
        </div>
        <button class="switch-btn" data-id="${tab.id}">Aller</button>
      </div>
    `;

    // Bouton pour switcher vers l’onglet
    li.querySelector(".switch-btn").addEventListener("click", () => {
      chrome.tabs.update(tab.id, { active: true });
      chrome.windows.update(tab.windowId, { focused: true });
      window.close(); // Ferme la popup
    });

    tabsList.appendChild(li);
  });
});