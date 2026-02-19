// Détecteur de vidéos dans les iframes
class IframeDetector {
  constructor() {
    this.name = 'iframe';
    this.priorite = 2;
  }

  async detect() {
    const iframes = document.querySelectorAll('iframe');
    const results = [];

    for (let iframe of iframes) {
      try {
        // Essaie d'accéder au contenu de l'iframe
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          const videos = iframeDoc.querySelectorAll('video');
          for (let video of videos) {
            if (video.videoWidth > 0) {
              results.push({
                quality: this.resolutionToLabel(video.videoWidth, video.videoHeight),
                width: video.videoWidth,
                height: video.videoHeight,
                source: 'iframe'
              });
            }
          }
        }
      } catch (e) {
        // Cross-origin - on essaie par la taille
        if (iframe.width > 100 || iframe.height > 100) {
          const width = parseInt(iframe.width) || iframe.clientWidth;
          if (width > 0) {
            results.push({
              quality: this.estimateFromContainer(width),
              width: width,
              estimated: true,
              source: 'iframe-container'
            });
          }
        }
      }
    }

    return results.length > 0 ? results[0] : null;
  }

  estimateFromContainer(width) {
    if (width >= 1920) return '1080p (estimé)';
    if (width >= 1280) return '720p (estimé)';
    if (width >= 854) return '480p (estimé)';
    return 'SD (estimé)';
  }

  resolutionToLabel(width, height) {
    if (width >= 3840) return '4K';
    if (width >= 1920) return '1080p';
    if (width >= 1280) return '720p';
    if (width >= 854) return '480p';
    return 'SD';
  }
}