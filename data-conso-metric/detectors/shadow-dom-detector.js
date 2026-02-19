// Détecteur de vidéos dans le Shadow DOM
class ShadowDomDetector {
  constructor() {
    this.name = 'shadow-dom';
    this.priorite = 3;
  }

  async detect() {
    let results = [];

    const exploreShadowDOM = (element) => {
      // Vérifie si l'élément a un shadowRoot
      if (element.shadowRoot) {
        // Cherche des vidéos dans le shadowRoot
        const videos = element.shadowRoot.querySelectorAll('video');
        videos.forEach(video => {
          if (video.videoWidth > 0) {
            results.push({
              quality: this.resolutionToLabel(video.videoWidth, video.videoHeight),
              width: video.videoWidth,
              height: video.videoHeight,
              source: 'shadow-dom'
            });
          }
        });

        // Cherche récursivement dans les enfants du shadowRoot
        element.shadowRoot.querySelectorAll('*').forEach(child => {
          if (child.shadowRoot) {
            exploreShadowDOM(child);
          }
        });
      }

      // Cherche dans les enfants normaux qui pourraient avoir leur propre shadow DOM
      element.querySelectorAll('*').forEach(child => {
        if (child.shadowRoot) {
          exploreShadowDOM(child);
        }
      });
    };

    // Commence l'exploration depuis le document
    exploreShadowDOM(document.body);

    return results.length > 0 ? results[0] : null;
  }

  resolutionToLabel(width, height) {
    if (width >= 3840) return '4K';
    if (width >= 1920) return '1080p';
    if (width >= 1280) return '720p';
    if (width >= 854) return '480p';
    return 'SD';
  }
}