chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showModal") {
    showModal(message.title, message.links);
  }
});

function showModal(title, links) {
  // Supprimer un ancien modal s’il existe
  const oldModal = document.getElementById("ext-modal");
  if (oldModal) oldModal.remove();

  // Conteneur principal
  const modal = document.createElement("div");
  modal.id = "ext-modal";
  modal.style.cssText = `
    position: fixed;
    z-index: 999999;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    background-color: rgba(0,0,0,0.7);
    display: flex;
    justify-content: center;
    align-items: center;
  `;

  // Contenu du modal
  const content = document.createElement("div");
  content.style.cssText = `
    background: white;
    border-radius: 10px;
    padding: 20px;
    width: 60%;
    max-height: 80%;
    overflow-y: auto;
    box-shadow: 0 0 10px rgba(0,0,0,0.3);
  `;

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Fermer";
  closeBtn.style.cssText = `
    float: right;
    background-color: crimson;
    color: white;
    border: none;
    padding: 6px 10px;
    border-radius: 5px;
    cursor: pointer;
  `;
  closeBtn.onclick = () => modal.remove();

    // Bouton PDF
  const pdfBtn = document.createElement("button");
  pdfBtn.textContent = "Exporter en PDF";
  pdfBtn.style.cssText = `
    float: right;
    margin-right: 10px;
    background-color: #007bff;
    color: white;
    border: none;
    padding: 6px 10px;
    border-radius: 5px;
    cursor: pointer;
  `;
  pdfBtn.onclick = () => exportToPDF(title, links);

  const titleEl = document.createElement("h2");
  titleEl.textContent = title;

  const list = document.createElement("ul");
  list.style.cssText = `
    width: 80%;
    word-wrap: break-word;
  `;
  links.forEach((url) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = url;
    a.textContent = url;
    a.target = "_blank";
    li.appendChild(a);
    list.appendChild(li);
  });

  content.append(closeBtn,pdfBtn , titleEl, list);
  modal.appendChild(content);
  document.body.appendChild(modal);
}

function exportToPDF(title, links) {
chrome.runtime.sendMessage({
    action: "export_links",
    links: links
  });
}

