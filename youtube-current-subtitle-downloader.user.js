// ==UserScript==
// @name         YouTube Subtitle Downloader — Current Captions to TXT
// @namespace    https://checkoutworks.dev/userscripts
// @version      1.0.1
// @description  Download the subtitle language currently displayed by YouTube as timestamped UTF-8 TXT. Supports manual, auto-generated, and translated captions.
// @author       Johnny Chen
// @homepageURL  https://github.com/johnnychendev/youtube-current-subtitle-downloader
// @supportURL   https://github.com/johnnychendev/youtube-current-subtitle-downloader/issues
// @updateURL    https://raw.githubusercontent.com/johnnychendev/youtube-current-subtitle-downloader/main/youtube-current-subtitle-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/johnnychendev/youtube-current-subtitle-downloader/main/youtube-current-subtitle-downloader.user.js
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/* Modified by CheckoutWorks.dev */
(() => {
  'use strict';

  const BUTTON_ID = 'cw-current-subtitle-download';
  const STYLE_ID = 'cw-current-subtitle-download-styles';
  const ICON_CLASS = 'cw-current-subtitle-download-icon';
  const TOOLTIP_CLASS = 'cw-current-subtitle-download-tooltip';
  const REFRESH_DELAY = 80;
  const MOUNT_RETRY_DELAYS = [160, 480, 1200];
  const MAX_TIMED_TEXT_URLS = 12;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let refreshTimer = 0;
  let mountRetryTimer = 0;
  let mountedPlayer = null;
  const timedTextUrls = [];
  const listeningPlayers = new WeakSet();

  const svgElement = (name, attributes) => {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  };

  const createIcon = (type) => {
    const isDownload = type === 'download' || !type;
    const svg = svgElement('svg', {
      viewBox: isDownload ? '0 0 28 24' : '0 0 24 24',
      width: isDownload ? '28' : '22',
      height: '22',
      'aria-hidden': 'true',
    });
    if (type === 'loading') {
      svg.append(svgElement('circle', {
        cx: '12', cy: '12', r: '8', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', opacity: '.28',
      }));
      const arc = svgElement('path', {
        d: 'M12 4a8 8 0 0 1 8 8', fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-width': '2',
      });
      arc.append(svgElement('animateTransform', {
        attributeName: 'transform', type: 'rotate', from: '0 12 12', to: '360 12 12', dur: '.7s', repeatCount: 'indefinite',
      }));
      svg.append(arc);
    } else if (type === 'error') {
      svg.append(svgElement('path', {
        d: 'M11 7h2v7h-2V7Zm0 9h2v2h-2v-2Zm1-14 10 19H2L12 2Zm0 4.3L5.3 19h13.4L12 6.3Z',
        fill: 'currentColor',
      }));
    } else {
      svg.append(svgElement('rect', {
        x: '1.5', y: '5', width: '15', height: '14', rx: '2.2', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8',
      }));
      const label = svgElement('text', {
        x: '3.3', y: '14.5', fill: 'currentColor', 'font-family': 'Arial, sans-serif', 'font-size': '8', 'font-weight': '700',
      });
      label.textContent = 'CC';
      svg.append(label);
      svg.append(svgElement('path', {
        d: 'M23 7v10m0 0-3-3m3 3 3-3',
        fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2.3',
      }));
    }
    return svg;
  };

  const setButtonIcon = (button, type = 'download') => {
    let container = button.querySelector(`.${ICON_CLASS}`);
    if (!container) {
      container = document.createElement('span');
      container.className = ICON_CLASS;
      container.setAttribute('aria-hidden', 'true');
      button.prepend(container);
    }
    container.replaceChildren(createIcon(type));
  };

  const setButtonTooltip = (button, text) => {
    const tooltip = button.querySelector(`.${TOOLTIP_CLASS}`);
    if (tooltip) tooltip.textContent = text;
    button.setAttribute('aria-label', text);
  };

  const ensureStyles = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID} .${ICON_CLASS} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      #${BUTTON_ID} .${ICON_CLASS} svg {
        display: block;
      }
      #${BUTTON_ID} .${TOOLTIP_CLASS} {
        position: absolute;
        left: 50%;
        bottom: calc(100% + 12px);
        z-index: 100;
        padding: 8px 11px;
        border-radius: 8px;
        background: rgba(28, 28, 28, .92);
        color: #fff;
        font: 500 14px/20px Roboto, Arial, sans-serif;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: translate(-50%, 4px);
        transition: opacity .1s ease, transform .1s ease, visibility .1s ease;
      }
      #${BUTTON_ID}:hover .${TOOLTIP_CLASS},
      #${BUTTON_ID}:focus-visible .${TOOLTIP_CLASS} {
        opacity: 1;
        visibility: visible;
        transform: translate(-50%, 0);
      }
    `;
    (document.head || document.documentElement).append(style);
  };

  const rememberTimedTextUrl = (value) => {
    if (typeof value !== 'string' || !value.includes('/api/timedtext')) return;
    try {
      const url = new URL(value);
      if (url.hostname !== 'www.youtube.com' || url.pathname !== '/api/timedtext') return;
      const existing = timedTextUrls.indexOf(url.href);
      if (existing >= 0) timedTextUrls.splice(existing, 1);
      timedTextUrls.push(url.href);
      if (timedTextUrls.length > MAX_TIMED_TEXT_URLS) timedTextUrls.shift();
    } catch (_) {
      // Ignore malformed or non-URL resource names.
    }
  };

  try {
    performance.getEntriesByType('resource').forEach((entry) => rememberTimedTextUrl(entry.name));
    new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => rememberTimedTextUrl(entry.name));
    }).observe({ type: 'resource', buffered: true });
  } catch (_) {
    // The signed player-response URL remains available as a compatibility fallback.
  }

  const textOf = (value) => {
    if (typeof value === 'string') return value;
    if (value && typeof value.simpleText === 'string') return value.simpleText;
    if (value && Array.isArray(value.runs)) return value.runs.map((run) => run.text || '').join('');
    return '';
  };

  const getPlayer = () => document.querySelector('#movie_player');

  const isVideoPage = () => location.pathname === '/watch' || location.pathname.startsWith('/shorts/');

  const getVideoId = () => {
    const url = new URL(location.href);
    return url.searchParams.get('v') || (url.pathname.match(/^\/shorts\/([^/?]+)/) || [])[1] || '';
  };

  const getPlayerResponse = (player) => {
    try {
      return player && typeof player.getPlayerResponse === 'function' ? player.getPlayerResponse() : null;
    } catch (_) {
      return null;
    }
  };

  const getCurrentTrack = (player) => {
    try {
      const track = player && typeof player.getOption === 'function'
        ? player.getOption('captions', 'track')
        : null;
      if (track && typeof track === 'object' && track.languageCode) return track;
    } catch (_) {
      // Fall through to the player's most recent authenticated caption request.
    }
    if (!captionsAreDisplayed(player)) return null;
    const videoId = getVideoId();
    for (let index = timedTextUrls.length - 1; index >= 0; index -= 1) {
      const url = new URL(timedTextUrls[index]);
      if (url.searchParams.get('v') !== videoId) continue;
      const sourceLanguage = url.searchParams.get('lang');
      if (!sourceLanguage) continue;
      const targetLanguage = url.searchParams.get('tlang');
      return {
        baseUrl: url.href,
        languageCode: sourceLanguage,
        kind: url.searchParams.get('kind') || undefined,
        translationLanguage: targetLanguage ? { languageCode: targetLanguage } : undefined,
      };
    }
    return null;
  };

  const captionsAreDisplayed = (player) => {
    const button = player?.querySelector('.ytp-subtitles-button[aria-pressed]');
    return !button || button.getAttribute('aria-pressed') === 'true';
  };

  // Player-response tracks come first: they carry baseUrl and include auto-generated
  // tracks, which the live tracklist omits when a video also has manual tracks.
  const getTrackList = (player) => {
    const responseTracks = getPlayerResponse(player)?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    let liveTracks = null;
    try {
      liveTracks = player?.getOption?.('captions', 'tracklist');
    } catch (_) {
      // The player response alone is enough.
    }
    return [
      ...(Array.isArray(responseTracks) ? responseTracks : []),
      ...(Array.isArray(liveTracks) ? liveTracks : []),
    ];
  };

  // The player response uses vssId; the live player API uses vss_id.
  const trackVssId = (track) => track.vssId || track.vss_id || '';

  const getTrackData = (player, currentTrack) => {
    const tracks = getTrackList(player);
    const currentVssId = trackVssId(currentTrack);
    return tracks.find((track) =>
      (currentVssId && trackVssId(track) === currentVssId) ||
      (currentTrack.baseUrl && track.baseUrl === currentTrack.baseUrl) ||
      (track.languageCode === currentTrack.languageCode && (track.kind || '') === (currentTrack.kind || ''))
    ) || (currentTrack.baseUrl ? {
      baseUrl: currentTrack.baseUrl,
      languageCode: currentTrack.languageCode,
      kind: currentTrack.kind,
      name: currentTrack.name,
    } : null);
  };

  const displayedLanguage = (track) => {
    const translation = track.translationLanguage || track.translatedLanguage;
    return translation?.languageCode || track.languageCode || '';
  };

  const displayedLanguageName = (track, fallback) => {
    const translation = track.translationLanguage || track.translatedLanguage;
    return textOf(translation?.languageName || translation?.name) || textOf(track.name) || fallback;
  };

  const subtitleType = (trackData, currentTrack) => {
    const baseType = trackData.kind === 'asr' ? 'Automatic' : 'Manual';
    return displayedLanguage(currentTrack) !== trackData.languageCode ? `${baseType} (Translated)` : baseType;
  };

  const capturedCaptionUrl = (trackData, currentTrack, videoId) => {
    const targetLanguage = displayedLanguage(currentTrack);
    const translated = targetLanguage !== trackData.languageCode;
    for (let index = timedTextUrls.length - 1; index >= 0; index -= 1) {
      const url = new URL(timedTextUrls[index]);
      if (url.searchParams.get('v') !== videoId) continue;
      if (url.searchParams.get('lang') !== trackData.languageCode) continue;
      if ((url.searchParams.get('tlang') || '') !== (translated ? targetLanguage : '')) continue;
      if (url.searchParams.has('pot')) return url.href;
    }
    return '';
  };

  const buildCaptionUrl = (trackData, currentTrack, videoId) => {
    const url = new URL(
      capturedCaptionUrl(trackData, currentTrack, videoId) ||
      currentTrack.baseUrl ||
      trackData.baseUrl
    );
    url.searchParams.set('fmt', 'json3');
    const targetLanguage = displayedLanguage(currentTrack);
    if (targetLanguage && targetLanguage !== trackData.languageCode) url.searchParams.set('tlang', targetLanguage);
    return url.href;
  };

  const formatTimestamp = (milliseconds) => {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  };

  const transcriptFromJson3 = (payload) => {
    const lines = [];
    for (const event of payload.events || []) {
      if (!Array.isArray(event.segs)) continue;
      let caption = '';
      for (const segment of event.segs) caption += segment.utf8 || '';
      caption = caption.replace(/\s+/g, ' ').trim();
      if (caption) lines.push(`[${formatTimestamp(Number(event.tStartMs) || 0)}] ${caption}`);
    }
    return lines.join('\n');
  };

  const sanitizeFilename = (value) => value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96) || 'YouTube-subtitles';

  const metadata = ({ title, channel, url, videoId, language, languageName, type }) => [
    'Document-Type: YouTube Subtitle Transcript',
    `Video-Title: ${title}`,
    `Channel: ${channel}`,
    `URL: ${url}`,
    `Video-ID: ${videoId}`,
    `Subtitle-Language: ${language}${languageName && languageName !== language ? ` (${languageName})` : ''}`,
    `Subtitle-Type: ${type}`,
    `Downloaded-At: ${new Date().toISOString()}`,
    '',
  ].join('\n');

  const getButton = () => document.getElementById(BUTTON_ID);

  const updateButton = () => {
    const button = getButton();
    if (!button || !isVideoPage()) return;
    const player = getPlayer();
    const track = getCurrentTrack(player);
    const enabled = Boolean(captionsAreDisplayed(player) && track && getTrackData(player, track));
    button.disabled = !enabled;
    button.style.opacity = enabled ? '.9' : '.38';
    setButtonTooltip(
      button,
      enabled ? `Download displayed subtitles as TXT (${displayedLanguage(track)})` : 'No subtitles are currently displayed'
    );
  };

  const refresh = (attempt = 0) => {
    mount();
    updateButton();
    if (isVideoPage() && !getButton() && attempt < MOUNT_RETRY_DELAYS.length) {
      mountRetryTimer = window.setTimeout(() => refresh(attempt + 1), MOUNT_RETRY_DELAYS[attempt]);
    }
  };

  const scheduleRefresh = () => {
    clearTimeout(refreshTimer);
    clearTimeout(mountRetryTimer);
    refreshTimer = window.setTimeout(refresh, REFRESH_DELAY);
  };

  const mount = () => {
    if (!isVideoPage()) {
      getButton()?.remove();
      mountedPlayer = null;
      return;
    }
    const player = getPlayer();
    const controls = player?.querySelector('.ytp-right-controls');
    if (!player || !controls) return;
    ensureStyles();
    if (!listeningPlayers.has(player) && typeof player.addEventListener === 'function') {
      listeningPlayers.add(player);
      player.addEventListener('onApiChange', scheduleRefresh);
    }
    if (mountedPlayer && mountedPlayer !== player) getButton()?.remove();
    mountedPlayer = player;
    if (getButton()?.parentElement === controls) return;
    getButton()?.remove();

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.className = 'ytp-button';
    button.type = 'button';
    button.disabled = true;
    setButtonIcon(button);
    const tooltip = document.createElement('span');
    tooltip.className = TOOLTIP_CLASS;
    tooltip.setAttribute('role', 'tooltip');
    button.append(tooltip);
    setButtonTooltip(button, 'No subtitles are currently displayed');
    button.style.cssText = 'position:relative;display:inline-flex;align-items:center;justify-content:center;width:40px;padding:0;overflow:visible;color:#fff;opacity:.9;vertical-align:top;';
    button.addEventListener('click', downloadCurrentSubtitle);
    controls.insertBefore(button, controls.firstChild);
  };

  const downloadCurrentSubtitle = async () => {
    const button = getButton();
    const player = getPlayer();
    const currentTrack = getCurrentTrack(player);
    const trackData = currentTrack && getTrackData(player, currentTrack);
    if (!button || !currentTrack || !trackData) return updateButton();

    button.disabled = true;
    setButtonIcon(button, 'loading');
    setButtonTooltip(button, 'Downloading displayed subtitles as TXT…');
    button.setAttribute('aria-busy', 'true');
    try {
      const currentPlayerResponse = getPlayerResponse(player) || {};
      const currentVideoId = currentPlayerResponse.videoDetails?.videoId || getVideoId();
      const response = await fetch(buildCaptionUrl(trackData, currentTrack, currentVideoId), {
        credentials: 'same-origin',
        cache: 'force-cache',
      });
      if (!response.ok) throw new Error(`Caption request failed (${response.status})`);
      const responseText = await response.text();
      if (!responseText) throw new Error('YouTube returned an empty subtitle response (missing or expired PO Token)');
      const transcript = transcriptFromJson3(JSON.parse(responseText));
      if (!transcript) throw new Error('The displayed subtitle track returned no text');

      const playerResponse = getPlayerResponse(player) || currentPlayerResponse;
      const details = playerResponse.videoDetails || {};
      const videoId = details.videoId || getVideoId();
      const language = displayedLanguage(currentTrack);
      const content = metadata({
        title: details.title || document.title.replace(/\s*-\s*YouTube$/, ''),
        channel: details.author || '',
        url: location.href,
        videoId,
        language,
        languageName: displayedLanguageName(currentTrack, language),
        type: subtitleType(trackData, currentTrack),
      }) + transcript + '\n';
      const filename = `${sanitizeFilename(details.title || 'YouTube-subtitles')} [${sanitizeFilename(language)}] [${sanitizeFilename(videoId)}].txt`;
      const blobUrl = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (error) {
      console.warn('[Current Subtitle Downloader]', error);
      button.disabled = false;
      button.removeAttribute('aria-busy');
      setButtonIcon(button, 'error');
      button.style.color = '#ff6b6b';
      setButtonTooltip(button, `Download failed: ${error.message}`);
      setTimeout(() => {
        setButtonIcon(button);
        button.style.color = '#fff';
        updateButton();
      }, 3000);
      return;
    }
    button.removeAttribute('aria-busy');
    setButtonIcon(button);
    button.style.color = '#fff';
    updateButton();
  };

  const relevantPlayerControl = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return false;
    if (!target.closest('#movie_player')) return false;
    return event.composedPath().some((node) =>
      node instanceof Element && node.matches('.ytp-subtitles-button, .ytp-settings-button, .ytp-menuitem')
    );
  };

  const isTypingTarget = (target) => target instanceof Element && (
    target.matches('input, textarea, select') ||
    target.isContentEditable ||
    Boolean(target.closest('[contenteditable="true"]'))
  );

  document.addEventListener('yt-navigate-finish', () => {
    mountedPlayer = null;
    scheduleRefresh();
  });
  document.addEventListener('yt-player-updated', scheduleRefresh);
  document.addEventListener('yt-page-data-updated', scheduleRefresh);
  document.addEventListener('DOMContentLoaded', scheduleRefresh, { once: true });
  document.addEventListener('click', (event) => { if (relevantPlayerControl(event)) scheduleRefresh(); }, true);
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.repeat || event.key?.toLowerCase() !== 'c') return;
    if (!isTypingTarget(event.target)) scheduleRefresh();
  }, true);
  window.addEventListener('popstate', scheduleRefresh);

  scheduleRefresh();
})();
