// Détecteur basé sur les classes de lecteurs connus
class PlayerDetector {
  constructor() {
    this.name = 'player';
    this.priorite = 4;
    
    this.playerPatterns = [
      // Lecteurs courants
      { classes: ['jwplayer', 'jw-video'], name: 'JW Player' },
      { classes: ['video-js', 'vjs-tech'], name: 'VideoJS' },
      { classes: ['flowplayer'], name: 'Flowplayer' },
      { classes: ['plyr'], name: 'Plyr' },
      { classes: ['mediaelement'], name: 'MediaElement' },
      
      // Sites spécifiques
      { classes: ['html5-video-player'], name: 'YouTube' },
      { classes: ['vp-video-wrapper'], name: 'Vimeo' },
      { classes: ['tiktok'], name: 'TikTok' },
      
      // Lecteurs d'anime
      { classes: ['jw-controller'], name: 'Anime Player' },
      { classes: ['video-wrapper'], name: 'Generic Player' },
      { selectors: ['[class*="video-js"]'], name: 'VideoJS variant' }
    ];
    
    this.sitePatterns = {
      'voiranime': ['uqload', 'mixdrop', 'voe'],
      'frenchstream': ['uqload', 'sendvid'],
      'anime-sama': ['vudeo', 'streamtape']
    };
  }

  async detect() {
    const results = [];

    // Détection par classes de lecteurs
    for (let pattern of this.playerPatterns) {
      let elements = [];
      
      if (pattern.classes) {
        pattern.classes.forEach(className => {
          elements = elements.concat(Array.from(document.querySelectorAll(`.${className}`)));
        });
      }
      
      if (pattern.selectors) {
        pattern.selectors.forEach(selector => {
          elements = elements.concat(Array.from(document.querySelectorAll(selector)));
        });
      }

      for (let element of elements) {
        // Cherche une vidéo dans le lecteur
        const video = element.querySelector('video');
        if (video && video.videoWidth > 0) {
          results.push({
            quality: this.resolutionToLabel(video.videoWidth, video.videoHeight),
            player: pattern.name,
            width: video.videoWidth,
            height: video.videoHeight,
            source: 'player-class'
          });
          break;
        }

        // Sinon, estime par la taille du conteneur
        const width = element.clientWidth;
        if (width > 200) {
          results.push({
            quality: this.estimateFromContainer(width),
            player: pattern.name,
            width: width,
            estimated: true,
            source: 'player-container'
          });
        }
      }
    }

    // Détection spécifique pour les sites d'anime
    const hostname = window.location.hostname;
    for (let [site, players] of Object.entries(this.sitePatterns)) {
      if (hostname.includes(site)) {
        for (let player of players) {
          const playerElement = document.querySelector(`[src*="${player}"], iframe[src*="${player}"]`);
          if (playerElement) {
            results.push({
              quality: '720p (estimé streaming)',
              player: player,
              site: site,
              estimated: true,
              source: 'anime-site'
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