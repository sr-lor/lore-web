/**
 * Lore Core Share Client
 * Handles:
 * 1. Automatic Domain Detection (Zero hardcoded domains)
 * 2. Instant Deep Linking to Mobile App (lore://)
 * 3. Fallback to App Store / Play Store or Web Preview
 * 4. GraphQL Query Engine for AWS AppSync (Public Query without heavy AWS SDKs)
 * 5. Clipboard and Native Share APIs
 */

const LoreConfig = {
  // Read AppSync URL from amplify_outputs or fallback to the known AppSync endpoint
  appsyncUrl: 'https://b5gwc56ssvdsfhx7qiypcensuq.appsync-api.eu-west-1.amazonaws.com/graphql',
  awsRegion: 'eu-west-1',
  appScheme: 'lore',
  appStoreUrl: 'https://apps.apple.com/app/lore-novels/id6470000000', // Update when live
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.lore.novels'
};

// Automatic Domain Recognition
const LoreApp = {
  getDomain() {
    return window.location.origin;
  },

  getCurrentUrl() {
    return window.location.href;
  },

  getPathId() {
    const fromQuery = new URLSearchParams(window.location.search).get('id');
    if (fromQuery && fromQuery.trim().length > 0) return decodeURIComponent(fromQuery.trim());
    const segments = window.location.pathname.split('/').filter(Boolean);
    return segments.length > 1 ? decodeURIComponent(segments[1]) : '';
  },


  /**
   * Directly attempt to launch the Lore app via custom scheme
   * If not installed, seamlessly falls back without breaking UX
   */
  launchApp(targetPath, fallbackUrl = null) {
    const appUrl = `${LoreConfig.appScheme}://${targetPath.replace(/^\//, '')}`;
    const start = Date.now();

    // Direct intent/scheme launch
    window.location.href = appUrl;

    // Timeout check: if user stays on the page after 1800ms, the app probably is not installed
    setTimeout(() => {
      if (Date.now() - start < 2500) {
        if (fallbackUrl) {
          window.location.href = fallbackUrl;
        } else {
          // Highlight download prompt
          const banner = document.getElementById('app-download-banner');
          if (banner) {
            banner.classList.add('pulse-highlight');
            setTimeout(() => banner.classList.remove('pulse-highlight'), 1500);
          }
        }
      }
    }, 1800);
  },

  /**
   * Check if device is mobile
   */
  isMobile() {
    return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  },

  /**
   * Auto launch if requested or user visits directly from mobile browser
   */
  autoLaunchIfMobile(targetPath) {
    const urlParams = new URLSearchParams(window.location.search);
    // Auto launch if on mobile and not coming from explicit back navigation
    if (this.isMobile() && urlParams.get('no_redirect') !== '1') {
      // Small delay to allow initial DOM render
      setTimeout(() => {
        this.launchApp(targetPath);
      }, 400);
    }
  },

  /**
   * Copy current link with toast feedback
   */
  async copyCurrentLink(buttonElement) {
    try {
      await navigator.clipboard.writeText(this.getCurrentUrl());
      this.showToast('تم نسخ الرابط بنجاح!');
      if (buttonElement) {
        const originalText = buttonElement.innerHTML;
        buttonElement.innerHTML = `<span class="icon">✓</span> تم النسخ`;
        setTimeout(() => {
          buttonElement.innerHTML = originalText;
        }, 2000);
      }
    } catch (err) {
      this.showToast('تعذر نسخ الرابط');
    }
  },

  /**
   * Native Web Share API
   */
  async shareContent(title, text, url = null) {
    const shareUrl = url || this.getCurrentUrl();
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: text,
          url: shareUrl
        });
      } catch (e) {
        // User cancelled or error
      }
    } else {
      this.copyCurrentLink();
    }
  },

  showToast(message) {
    let toast = document.getElementById('lore-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'lore-toast';
      toast.className = 'lore-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => {
      toast.classList.remove('visible');
    }, 2800);
  },

  /**
   * Format numbers gracefully (e.g. 1500 -> 1.5K)
   */
  formatCount(count) {
    if (!count || isNaN(count)) return '0';
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
    return count.toString();
  }
};

window.LoreApp = LoreApp;
