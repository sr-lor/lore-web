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
  },

  /**
   * Universal S3 image loader using Cognito guest signing fallback
   */
  async loadS3Image(url, imgElement, placeholderElement = null) {
    if (!url || !imgElement) return;

    const showPlaceholder = () => {
      imgElement.style.display = 'none';
      if (placeholderElement) placeholderElement.style.display = 'block';
    };

    const showImage = (src) => {
      imgElement.src = src;
      imgElement.style.display = 'block';
      if (placeholderElement) placeholderElement.style.display = 'none';
    };

    // If not AWS S3, standard load
    if (!url.includes('amazonaws.com') && !url.includes('s3')) {
      showImage(url);
      return;
    }

    // Try direct load first
    const testImg = new Image();
    testImg.onload = () => showImage(url);
    testImg.onerror = async () => {
      // S3 returned 403 Forbidden - use Cognito Identity guest credentials to fetch blob
      try {
        const u = new URL(url);
        const region = 'eu-west-1';
        const path = u.pathname;

        let creds = null;
        try {
          creds = JSON.parse(sessionStorage.getItem('lore_guest_creds') || 'null');
        } catch (_) {}

        if (!creds || !creds.exp || creds.exp < Date.now() / 1000) {
          const idRes = await fetch('https://cognito-identity.eu-west-1.amazonaws.com/', {
            method: 'POST',
            headers: {'X-Amz-Target': 'AWSCognitoIdentityService.GetId', 'Content-Type': 'application/x-amz-json-1.1'},
            body: JSON.stringify({IdentityPoolId: 'eu-west-1:a6c24b58-0ca0-41ca-965e-bdc1d28a2461'})
          });
          const { IdentityId } = await idRes.json();
          const credRes = await fetch('https://cognito-identity.eu-west-1.amazonaws.com/', {
            method: 'POST',
            headers: {'X-Amz-Target': 'AWSCognitoIdentityService.GetCredentialsForIdentity', 'Content-Type': 'application/x-amz-json-1.1'},
            body: JSON.stringify({IdentityId})
          });
          const c = await credRes.json();
          creds = {
            ak: c.Credentials.AccessKeyId,
            sk: c.Credentials.SecretKey,
            st: c.Credentials.SessionToken,
            exp: c.Credentials.Expiration
          };
          sessionStorage.setItem('lore_guest_creds', JSON.stringify(creds));
        }

        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.substring(0, 8);
        const host = u.host;
        const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

        const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${emptyHash}\nx-amz-date:${amzDate}\nx-amz-security-token:${creds.st}\n`;
        const signedHeaders = 'host;x-amz-content-sha256;x-amz-date;x-amz-security-token';
        const canonicalRequest = `GET\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${emptyHash}`;
        const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;

        const encoder = new TextEncoder();
        async function sha256Hex(str) {
          const buf = await crypto.subtle.digest('SHA-256', encoder.encode(str));
          return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        }
        async function hmac(key, str) {
          const cryptoKey = await crypto.subtle.importKey('raw', key, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
          return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(str)));
        }

        const canonHash = await sha256Hex(canonicalRequest);
        const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonHash}`;

        const kDate = await hmac(encoder.encode('AWS4' + creds.sk), dateStamp);
        const kRegion = await hmac(kDate, region);
        const kService = await hmac(kRegion, 's3');
        const kSigning = await hmac(kService, 'aws4_request');
        const sigBuf = await hmac(kSigning, stringToSign);
        const signature = Array.from(sigBuf).map(b => b.toString(16).padStart(2, '0')).join('');

        const authHeader = `AWS4-HMAC-SHA256 Credential=${creds.ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

        const s3Res = await fetch(url, {
          headers: {
            'x-amz-content-sha256': emptyHash,
            'x-amz-date': amzDate,
            'x-amz-security-token': creds.st,
            'Authorization': authHeader
          }
        });

        if (s3Res.ok) {
          const blob = await s3Res.blob();
          showImage(URL.createObjectURL(blob));
        } else {
          showPlaceholder();
        }
      } catch (err) {
        showPlaceholder();
      }
    };
    testImg.src = url;
  }
};

window.LoreApp = LoreApp;
