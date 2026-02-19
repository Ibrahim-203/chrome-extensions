// Détecteur de vidéos standards
class StandardVideoDetector {
  constructor() {
    this.name = 'standard';
    this.priorite = 1; // Plus bas = plus prioritaire
  }

  async detect() {
    const videos = document.querySelectorAll('video');
    let bestVideo = null;
    let maxArea = 0;

    videos.forEach(v => {
      if (v.videoWidth > 0 && v.videoHeight > 0) {
        const area = v.videoWidth * v.videoHeight;
        if (area > maxArea) {
          maxArea = area;
          bestVideo = v;
        }
      }
    });

    if (bestVideo) {
      return {
        quality: this.resolutionToLabel(bestVideo.videoWidth, bestVideo.videoHeight),
        width: bestVideo.videoWidth,
        height: bestVideo.videoHeight,
        element: bestVideo
      };
    }
    return null;
  }

  resolutionToLabel(width, height) {
    if (width >= 3840) return '4K';
    if (width >= 1920) return '1080p';
    if (width >= 1280) return '720p';
    if (width >= 854) return '480p';
    if (width >= 640) return '360p';
    if (width >= 426) return '240p';
    return '144p';
  }
}