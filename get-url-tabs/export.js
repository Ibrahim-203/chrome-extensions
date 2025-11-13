document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const data = JSON.parse(decodeURIComponent(params.get('links')));

  const list = document.getElementById('linkList');
  data.forEach(link => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = link;
    a.textContent = link;
    a.target = "_blank";
    li.appendChild(a);
    list.appendChild(li);
  });

  document.getElementById('btnPdf').addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.text("Bibliographie générée :", 10, 20);

    let y = 30;
    data.forEach((link, i) => {
      // Découper le lien s’il est trop long pour tenir sur une ligne
      const lines = doc.splitTextToSize(`${i + 1}. ${link}`, 180);
      doc.text(lines, 10, y);
      y += lines.length * 10;
      if (y > 270) { // nouvelle page si besoin
        doc.addPage();
        y = 20;
      }
    });

    doc.save("liens.pdf");
  });
});
