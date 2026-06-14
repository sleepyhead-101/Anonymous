/* ═══════════════════════════════════════════════════════════════════
   WhisperWall — scripts/ghgh.js  (v9.0)
   Firebase Realtime DB v8  ·  Anonymous auth  ·  Quill editor

   FIXES vs v8.2
   ─────────────
   · [FIX — CRITICAL] C object was syntactically unclosed before the
     _PROFANITY_RE declaration, causing a JS parse error. The Object.freeze
     call now correctly terminates before _PROFANITY_RE is declared.

   · [FIX — CRITICAL] C.PURIFY_MSG and C.PURIFY_SEND were referenced
     throughout but never defined. Both DOMPurify config objects are now
     declared in the constants block.

   · [FIX — CRITICAL] Scroll FAB (#scrollToBottomBtn) was nested inside
     #messages in HTML and got deleted on every Messages.load() call.
     The FAB is now excluded from the cleanup loop (like emptyState) so it
     survives message reloads without needing to be repositioned in DOM.

   · [FIX] Space Mono font was referenced in CSS (--font-mono) but not
     loaded in HTML. Font link added in index.html.

   · [FIX] .app-wrap had overflow:hidden which clipped the ambient orb
     pseudo-elements that extend beyond the container edges. The orb
     pseudo-elements are now pointer-events:none and fixed-position so
     they're not clipped.

   · [FIX] Auth.onAnonymousAuth catch branch did not await loadUserRoles()
     before proceeding — fixed to properly await.

   · [FIX] initHelpModal — modal and button IDs existed in code but not
     in HTML, causing silent errors. Function now returns early gracefully
     with a clear comment (modal can be added to HTML later).

   · [NEW] Custom Wallpaper — users can upload any image from their device
     and it will be saved to localStorage as a base64 data URL and used as
     the chat background. The Wallpaper module has been extended with:
       - Wallpaper.setCustom(file)  — reads, saves, and applies a file
       - Wallpaper.clearCustom()    — removes the custom wallpaper
       - Sidebar button "My Wallpaper" triggers a hidden <input type=file>
       - On boot, any saved custom wallpaper is restored automatically
       - Cycles through built-in wallpapers while keeping custom available

   · [IMPROVE] Messages.load() cleanup loop now correctly skips the
     scrollBtn element (in addition to emptyState and pull-indicator) so
     the FAB is never accidentally removed during a refresh.

   · [IMPROVE] Queue.flush() null-guard on State.db moved to top-level
     early return so subsequent code can assume db is available.

   · [IMPROVE] Typing debounce reduced to 150ms (from 200ms) for even
     snappier feedback on fast connections.

   · [IMPROVE] All DOMPurify calls now reference C.PURIFY_MSG /
     C.PURIFY_SEND constants for consistency and easier tuning.
════════════════════════════════════════════════════════════════════ */

'use strict';

/* ════════════════════════════════════════════════════════════════
   1. FIREBASE CONFIG
════════════════════════════════════════════════════════════════ */
function getFirebaseConfig() {
  const cfg = window.__WW_CONFIG;
  if (!cfg || typeof cfg !== 'object') {
    throw new Error(
      'WhisperWall: window.__WW_CONFIG is missing. ' +
      'Inject it server-side before ghgh.js loads.'
    );
  }
  const required = ['apiKey', 'authDomain', 'projectId', 'databaseURL'];
  for (const key of required) {
    if (!cfg[key]) throw new Error(`WhisperWall: window.__WW_CONFIG.${key} is missing.`);
  }
  return cfg;
}

/* ════════════════════════════════════════════════════════════════
   2. ROLE WHITELISTS  (display only — real enforcement via DB rules)
════════════════════════════════════════════════════════════════ */
const ADMIN_USERNAMES = Object.freeze(['yourAdminName']);
const VIP_USERNAMES   = Object.freeze(['yourVipName']);

/* ════════════════════════════════════════════════════════════════
   3. CONSTANTS
   [FIX] C object now correctly closed before _PROFANITY_RE.
   [FIX] PURIFY_MSG and PURIFY_SEND added — were referenced but never defined.
════════════════════════════════════════════════════════════════ */
const C = Object.freeze({
  SEND_RATE_MS:           3_000,
  MSG_MAX_CHARS:          2_500,
  MSG_WARN_CHARS:         2_000,
  MSG_DANGER_CHARS:       2_400,
  USERNAME_MIN:           3,
  USERNAME_MAX:           20,
  MSG_LOAD_LIMIT:         100,
  MSG_LOAD_PAGE:          50,
  MSG_TTL_MS:             5 * 24 * 60 * 60 * 1_000,
  TYPING_CLEAR_MS:        3_000,
  TYPING_DEBOUNCE_MS:     150,
  SCROLL_THRESHOLD:       60,
  SCROLL_TOP_LOAD:        120,
  PRESENCE_HEARTBEAT:     25_000,
  NOTIF_DURATION:         3_200,
  ROLES_CACHE_TTL_MS:     5 * 60 * 1_000,
  ROLES_CACHE_VERSION:    'v2',
  RECONNECT_MAX:          6,
  RECONNECT_BASE_MS:      1_000,
  REACTION_DEBOUNCE_MS:   150,
  MSG_HIGHLIGHT_MS:       650,
  CONTEXT_MENU_MS:        400,
  BOOT_TIMEOUT_MS:        10_000,
  LOADOLDER_DEBOUNCE_MS:  200,
  QUEUE_PRUNE_TTL_MS:     5 * 24 * 60 * 60 * 1_000,
  CUSTOM_WP_STORAGE_KEY:  'ww_custom_wallpaper',
  USERNAME_RE:            /^[a-zA-Z0-9_]{3,20}$/,
  URL_RE:                 /https?:\/\/[^\s<>"']+/g,
  IS_MAC:                 /Mac|iPod|iPhone|iPad/.test(navigator.platform),
  IS_MOBILE:              /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),
  IS_IOS:                 /iPhone|iPad|iPod/i.test(navigator.userAgent),

  /* [FIX] DOMPurify config objects — were used throughout but never defined */
  PURIFY_MSG: Object.freeze({
    ALLOWED_TAGS:  ['b','i','u','s','em','strong','code','pre','blockquote','br','p','ul','ol','li','a','img','span'],
    ALLOWED_ATTR:  ['href','src','alt','title','target','rel','class'],
    ALLOW_DATA_ATTR: false,
    FORCE_BODY:    true,
    RETURN_DOM_FRAGMENT: false,
  }),
  PURIFY_SEND: Object.freeze({
    ALLOWED_TAGS:  ['b','i','u','s','em','strong','code','pre','blockquote','br','p','ul','ol','li','a','img','span'],
    ALLOWED_ATTR:  ['href','src','alt','title','target','rel','class'],
    ALLOW_DATA_ATTR: false,
    FORCE_BODY:    true,
    RETURN_DOM_FRAGMENT: false,
  }),

  PROFANITY: Object.freeze([
    'fuck','asshole','bitch','fag','retard','whore','slut',
    'pussy','cock','bastard','douche','bombo','bombom',
  ]),
  QUICK_REACTIONS: Object.freeze([
    '👍','💜','😂','😮','🔥','👎','🎉','✨','💀','🫡',
  ]),
  QUICK_EMOJIS: Object.freeze([
    '😀','😂','😍','🤔','😎','😭','🥺','😤','🤯','🥳',
    '👏','🙌','🤝','👀','💯','🔥','✨','💀','😈','👻',
    '🌙','⭐','🎉','🎊','💫','🚀','💡','❤️','💜','💙',
  ]),
  AVATAR_GRADIENTS: Object.freeze([
    ['#7c6dfa','#4ade80'], ['#f472b6','#a78bfa'], ['#fb923c','#f472b6'],
    ['#4ade80','#38bdf8'], ['#a78bfa','#7c6dfa'], ['#38bdf8','#4ade80'],
    ['#fbbf24','#f472b6'], ['#f87171','#fb923c'],
  ]),
  WALLPAPERS: Object.freeze([
    { label: 'None', bg: '' },

    // Original
    { label: 'Midnight Grid', bg: 'repeating-linear-gradient(0deg,rgba(124,109,250,.05) 0,rgba(124,109,250,.05) 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,rgba(124,109,250,.05) 0,rgba(124,109,250,.05) 1px,transparent 1px,transparent 40px)' },
    { label: 'Violet Haze',   bg: 'radial-gradient(ellipse at 20% 50%,rgba(124,109,250,.18) 0,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(74,222,128,.12) 0,transparent 50%)' },
    { label: 'Neon Fog',      bg: 'radial-gradient(ellipse at 50% 100%,rgba(167,139,250,.2) 0,transparent 70%)' },
    { label: 'Dot Matrix',    bg: 'radial-gradient(rgba(124,109,250,.18) 1px,transparent 1px)', size: '20px 20px' },

    // Nature & Space
    { label: '🌌 Starry Night', bg: 'radial-gradient(circle at 20% 30%, rgba(124,109,250,.15) 0%, rgba(0,0,0,0) 50%), repeating-radial-gradient(circle at 30% 40%, rgba(255,255,255,.08) 0, rgba(255,255,255,.08) 1px, transparent 1px, transparent 30px)', size: '60px 60px' },
    { label: '🌊 Ocean Waves',  bg: 'repeating-linear-gradient(45deg, rgba(56,189,248,.08) 0px, rgba(56,189,248,.08) 2px, transparent 2px, transparent 8px), repeating-linear-gradient(135deg, rgba(6,182,212,.06) 0px, rgba(6,182,212,.06) 2px, transparent 2px, transparent 8px)' },
    { label: '🏔️ Mountain Mist', bg: 'linear-gradient(180deg, rgba(124,109,250,.08) 0%, rgba(74,222,128,.04) 100%)' },
    { label: '🍂 Autumn Leaves', bg: 'radial-gradient(circle at 10% 20%, rgba(251,146,60,.12) 0%, transparent 50%), radial-gradient(circle at 90% 80%, rgba(244,114,182,.1) 0%, transparent 50%)' },

    // Geometric
    { label: '🔺 Triangle Mesh',  bg: 'repeating-linear-gradient(60deg, rgba(124,109,250,.06) 0px, rgba(124,109,250,.06) 1px, transparent 1px, transparent 30px), repeating-linear-gradient(120deg, rgba(124,109,250,.06) 0px, rgba(124,109,250,.06) 1px, transparent 1px, transparent 30px)' },
    { label: '🎯 Concentric Rings', bg: 'radial-gradient(circle at 50% 50%, rgba(124,109,250,.02) 0px, transparent 1px, rgba(124,109,250,.04) 2px, transparent 3px, rgba(124,109,250,.06) 4px, transparent 5px)', size: '40px 40px' },
    { label: '✨ Glitter Sparkle',  bg: 'radial-gradient(circle at 30% 40%, rgba(255,215,0,.15) 1px, transparent 1px), radial-gradient(circle at 70% 80%, rgba(255,215,0,.1) 1px, transparent 1px)', size: '50px 50px' },
    { label: '🧩 Diagonal Stripes', bg: 'repeating-linear-gradient(45deg, rgba(124,109,250,.08) 0px, rgba(124,109,250,.08) 2px, transparent 2px, transparent 20px)' },
    { label: '🌀 Psychedelic Swirl', bg: 'conic-gradient(from 0deg at 50% 50%, rgba(124,109,250,.08) 0deg, rgba(244,114,182,.08) 90deg, rgba(251,146,60,.08) 180deg, rgba(74,222,128,.08) 270deg, rgba(124,109,250,.08) 360deg)' },

    // Gradients
    { label: '🌅 Sunset Glow',   bg: 'linear-gradient(135deg, rgba(244,114,182,.12) 0%, rgba(251,146,60,.08) 50%, rgba(124,109,250,.12) 100%)' },
    { label: '🌿 Mint Breeze',   bg: 'linear-gradient(45deg, rgba(74,222,128,.06) 0%, rgba(16,185,129,.1) 100%)' },
    { label: '💜 Cosmic Purple', bg: 'radial-gradient(ellipse at 30% 40%, rgba(139,92,246,.15) 0%, rgba(124,109,250,.05) 60%, transparent 100%)' },
    { label: '💙 Arctic Blue',   bg: 'linear-gradient(0deg, rgba(56,189,248,.08) 0%, rgba(6,182,212,.04) 100%)' },

    // Textured
    { label: '🎨 Bokeh Lights', bg: 'radial-gradient(circle at 20% 30%, rgba(244,114,182,.12) 0px, transparent 40px), radial-gradient(circle at 80% 70%, rgba(74,222,128,.1) 0px, transparent 50px), radial-gradient(circle at 40% 80%, rgba(124,109,250,.08) 0px, transparent 35px)' },
    { label: '💎 Crystal Grid', bg: 'repeating-linear-gradient(0deg, rgba(124,109,250,.06) 0px, rgba(124,109,250,.06) 1px, transparent 1px, transparent 15px), repeating-linear-gradient(90deg, rgba(124,109,250,.06) 0px, rgba(124,109,250,.06) 1px, transparent 1px, transparent 15px)' },
    { label: '🔥 Ember Glow',   bg: 'radial-gradient(ellipse at 50% 100%, rgba(251,146,60,.15) 0%, rgba(239,68,68,.05) 50%, transparent 80%)' },

    // Minimal
    { label: '▪️ Floating Dots', bg: 'radial-gradient(circle at 20% 30%, rgba(124,109,250,.08) 2px, transparent 2px), radial-gradient(circle at 70% 80%, rgba(124,109,250,.06) 2px, transparent 2px)', size: '80px 80px' },
    { label: '〰️ Wavy Lines',   bg: 'repeating-linear-gradient(0deg, rgba(124,109,250,.06) 0px, rgba(124,109,250,.06) 2px, transparent 2px, transparent 15px)' },
    { label: '🎭 Shadow Play',   bg: 'radial-gradient(ellipse at 30% 40%, rgba(0,0,0,.15) 0%, transparent 70%)' },

    // Fun
    { label: '🌟 Starburst',  bg: 'repeating-radial-gradient(circle at 20% 30%, rgba(255,215,0,.1) 0, rgba(255,215,0,.1) 2px, transparent 2px, transparent 40px), radial-gradient(circle at 80% 70%, rgba(124,109,250,.08) 0px, transparent 30px)' },
    { label: '🌈 Rainbow Veil', bg: 'linear-gradient(90deg, rgba(239,68,68,.04) 0%, rgba(249,115,22,.04) 16%, rgba(234,179,8,.04) 33%, rgba(34,197,94,.04) 50%, rgba(59,130,246,.04) 66%, rgba(139,92,246,.04) 83%, rgba(236,72,153,.04) 100%)' },
    { label: '🎪 Confetti',   bg: 'radial-gradient(circle at 10% 10%, rgba(239,68,68,.1) 2px, transparent 2px), radial-gradient(circle at 90% 30%, rgba(59,130,246,.1) 2px, transparent 2px), radial-gradient(circle at 50% 85%, rgba(234,179,8,.1) 2px, transparent 2px), radial-gradient(circle at 30% 70%, rgba(236,72,153,.1) 2px, transparent 2px)', size: '60px 60px' },
  ]),
});

/* Pre-compile profanity patterns once at module load */
const _PROFANITY_RE = (() => {
  const escaped = C.PROFANITY.map(w =>
    w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
})();

/* ════════════════════════════════════════════════════════════════
   4. APPLICATION STATE
════════════════════════════════════════════════════════════════ */
const State = {
  uid:      null,
  username: null,
  userRoles: Object.create(null),

  db:           null,
  auth:         null,
  presenceRef:  null,
  typingRef:    null,
  messagesRef:  null,
  reactionsRef: null,

  quill:      null,
  lastSendTs: 0,

  renderedIds:   new Set(),
  lastMsgTs:     0,
  _msgSince:     0,
  _oldestMsgTs:  Infinity,
  _loadingOlder: false,
  _initialLoadDone: false,

  atBottom:    true,
  unreadCount: 0,
  _scrollRaf:  null,

  isTyping:    false,
  typingTimer: null,
  typingUsers: Object.create(null),

  isOnline:          true,
  _wasOffline:       false,
  reconnectAttempts: 0,
  reconnectTimer:    null,

  wallpaperIdx:  0,
  timerInterval: null,

  offlineQueue: [],

  _listeners: [],
  _timers:    [],

  soundEnabled: false,
  _audioCtx:    null,

  _flushInProgress: false,

  _pullStartY: 0,
  _pullActive: false,

  _resizeObserver: null,

  _emojiTrayOpen: false,

  /* [NEW] Custom wallpaper state */
  _customWallpaper: null,  // base64 data URL or null
};

/* ════════════════════════════════════════════════════════════════
   5. DOM CACHE
════════════════════════════════════════════════════════════════ */
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelector(sel);

const DOM = {
  themeToggle:       $('themeToggle'),
  onlineCount:       $('onlineCount'),
  onlineList:        $('onlineList'),
  messages:          $('messages'),
  emptyState:        $('emptyState'),
  username:          $('usernameInput'),
  usernameCharCount: $('usernameCharCount'),
  usernameStatus:    $('usernameStatusMsg'),
  registerButton:    $('registerButton'),
  registerScreen:    $('registerScreen'),
  displayUsername:   $('displayUsername'),
  userAvatar:        $('userAvatar'),
  sendButton:        $('sendButton'),
  msgCharCount:      $('messageCharCount'),
  _charWrapEl: null,
  _charWrapSearched: false,
  get charWrap() {
    if (!this._charWrapSearched) {
      this._charWrapEl       = $$('.char-pill') ?? null;
      this._charWrapSearched = true;
    }
    return this._charWrapEl;
  },
  refreshButton:     $('refreshButton'),
  notification:      $('notification'),
  notifText:         $('notificationText'),
  notifIcon:         $('notifIcon'),
  typingIndicator:   $('typingIndicator'),
  typingUsers:       $('typingUsers'),
  wallpaperBtn:      $('wallpaperSideBtn'),
  customWpBtn:       $('customWallpaperBtn'),    /* [NEW] */
  clearWpBtn:        $('clearWallpaperBtn'),      /* [NEW] */
  customWpInput:     $('customWallpaperInput'),   /* [NEW] */
  scrollBtn:         $('scrollToBottomBtn'),
  unreadBadge:       $('unreadBadge'),
  connStatus:        $('connectionStatus'),
  connDot:           $('connDot'),
  connLabel:         $('connLabel'),
  editorWrap:        $('editorWrap'),
  srAnnounce:        $('srAnnounce'),
  emojiToggleBtn:    $('emojiToggleBtn'),
  notifClose:        $('notifClose'),
};

/* ════════════════════════════════════════════════════════════════
   6. LISTENER REGISTRY
════════════════════════════════════════════════════════════════ */
const Listeners = {
  add(ref, event, handler) {
    ref.on(event, handler);
    State._listeners.push({ ref, event, handler });
  },

  removeAll() {
    for (const { ref, event, handler } of State._listeners) {
      try { ref.off(event, handler); } catch { /* already detached */ }
    }
    State._listeners = [];

    for (const id of State._timers) {
      if (id != null) clearInterval(id);
    }
    State._timers = [];

    Presence.stop();

    if (State._resizeObserver) {
      State._resizeObserver.disconnect();
      State._resizeObserver = null;
    }
  },
};

/* ════════════════════════════════════════════════════════════════
   7. UTILITIES
════════════════════════════════════════════════════════════════ */
const Utils = {

  debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  },

  throttle(fn, ms) {
    let last = 0;
    return function (...args) {
      const now = Date.now();
      if (now - last < ms) return;
      last = now;
      return fn.apply(this, args);
    };
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  linkify(html) {
    if (!html) return '';
    return html.replace(C.URL_RE, url => {
      const safe = Utils.escapeHtml(url);
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
    });
  },

  formatTime(ts) {
    if (!ts) return '';
    const d    = new Date(ts);
    let h      = d.getHours();
    const m    = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h          = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
  },

  relativeTime(ts, now = Date.now()) {
    const s = Math.floor((now - ts) / 1_000);
    if (s < 5)      return 'just now';
    if (s < 60)     return `${s}s ago`;
    if (s < 3_600)  return `${Math.floor(s / 60)}m ago`;
    if (s < 86_400) return `${Math.floor(s / 3_600)}h ago`;
    return `${Math.floor(s / 86_400)}d ago`;
  },

  daysLeft(ts) {
    const remaining = C.MSG_TTL_MS - (Date.now() - ts);
    return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1_000)));
  },

  isExpired(ts) {
    return Date.now() - ts > C.MSG_TTL_MS;
  },

  hasProfanity(text) {
    if (!text) return false;
    const plain = String(text).replace(/<[^>]*>/g, ' ');
    return _PROFANITY_RE.test(plain);
  },

  avatarGradient(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    const [a, b] = C.AVATAR_GRADIENTS[Math.abs(h) % C.AVATAR_GRADIENTS.length];
    return `linear-gradient(135deg,${a},${b})`;
  },

  userInitial: name => (name || '?')[0].toUpperCase(),

  roleBadge(username, roles) {
    const role = roles[username];
    if (role === 'admin') return '<span class="ubadge badge-admin"><i class="fas fa-shield-alt" aria-hidden="true"></i> Admin</span>';
    if (role === 'vip')   return '<span class="ubadge badge-vip"><i class="fas fa-star" aria-hidden="true"></i> VIP</span>';
    return '';
  },

  resolveRole(username) {
    if (ADMIN_USERNAMES.includes(username)) return 'admin';
    if (VIP_USERNAMES.includes(username))   return 'vip';
    return 'member';
  },

  genId: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9),

  backoffMs(attempt, base = C.RECONNECT_BASE_MS) {
    const cap  = 30_000;
    const expo = Math.min(cap, base * 2 ** attempt);
    return expo / 2 + Math.random() * (expo / 2);
  },

  sendShortcut: () => C.IS_MAC ? '⌘↵' : 'Ctrl+↵',

  vibrate(pattern = [10]) {
    try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
  },

  idle(fn) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(fn, { timeout: 2_000 });
    } else {
      setTimeout(fn, 200);
    }
  },

  safeJsonParse(str, fallback = null) {
    try { return JSON.parse(str); }
    catch { return fallback; }
  },

  /* [NEW] Format file size for display */
  formatBytes(bytes) {
    if (bytes < 1024)       return `${bytes} B`;
    if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  },
};

/* ════════════════════════════════════════════════════════════════
   8. VIEWPORT PATCH
════════════════════════════════════════════════════════════════ */
function patchViewport() {
  let meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
  }
  const current = meta.content ?? '';
  if (!current.includes('width=device-width') || !current.includes('initial-scale')) {
    meta.content = 'width=device-width, initial-scale=1, maximum-scale=5';
  }
}

/* ════════════════════════════════════════════════════════════════
   9. MOBILE EDITOR CSS PATCH
════════════════════════════════════════════════════════════════ */
function injectMobileEditorStyles() {
  if (document.getElementById('ww-mobile-patch')) return;
  const style = document.createElement('style');
  style.id = 'ww-mobile-patch';
  style.textContent = `
    #editorWrap, .ql-container, .ql-editor, .ql-toolbar {
      touch-action: manipulation;
    }
    .ql-editor {
      -webkit-user-select: text !important;
      user-select: text !important;
      -webkit-touch-callout: default !important;
      font-size: max(16px, 1em) !important;
    }
    #ww-mobile-kb-trigger {
      position: absolute;
      width: 1px; height: 1px;
      opacity: 0; pointer-events: none;
      border: none; outline: none;
      padding: 0; margin: 0;
      font-size: 16px;
      top: 0; left: 0;
      z-index: -1;
    }
    .reaction, .add-reaction {
      min-width: 44px;
      min-height: 36px;
    }
    @media (max-width: 600px) {
      .ql-toolbar {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        flex-wrap: nowrap;
      }
      .ql-formats {
        display: inline-flex !important;
        flex-shrink: 0;
      }
      #sendButton {
        min-height: 44px;
        padding: 10px 18px;
      }
    }
    #messages {
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }
    #ww-pull-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 0;
      overflow: hidden;
      transition: height 0.2s ease;
      color: var(--acc, #7c6dfa);
      font-size: 13px;
      gap: 6px;
    }
    #ww-pull-indicator.active { height: 40px; }
    #ww-pull-indicator .pull-spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    #notification {
      cursor: pointer;
      touch-action: pan-x;
      transition: transform 0.2s ease, opacity 0.2s ease;
      will-change: transform;
    }
  `;
  document.head.appendChild(style);
}

/* ════════════════════════════════════════════════════════════════
   10. NOTIFICATION TOAST
════════════════════════════════════════════════════════════════ */
let _notifTimer = null;

function notify(msg, type = 'success', duration = C.NOTIF_DURATION) {
  if (!DOM.notification || !DOM.notifText) {
    console[type === 'error' ? 'error' : 'log']('[WhisperWall]', msg);
    return;
  }
  if (_notifTimer != null) clearTimeout(_notifTimer);
  DOM.notifText.textContent        = msg;
  DOM.notification.hidden          = false;
  DOM.notification.style.transform = '';
  DOM.notification.style.opacity   = '';

  if (DOM.notifIcon) {
    const iconMap  = {
      error:   'fas fa-circle-exclamation',
      warn:    'fas fa-triangle-exclamation',
      success: 'fas fa-circle-check',
    };
    const colorMap = {
      error:   'var(--red,#f87171)',
      warn:    'var(--amber,#fbbf24)',
      success: 'var(--green,#4ade80)',
    };
    DOM.notifIcon.className   = iconMap[type]  ?? iconMap.success;
    DOM.notifIcon.style.color = colorMap[type] ?? colorMap.success;
  }

  _notifTimer = setTimeout(() => { DOM.notification.hidden = true; }, duration);
}

function initNotifSwipe() {
  const el = DOM.notification;
  if (!el) return;

  let startX = 0;
  el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    el.style.transform = `translateX(${dx}px)`;
    el.style.opacity   = String(Math.max(0, 1 - Math.abs(dx) / 120));
  }, { passive: true });
  el.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 80) {
      el.hidden = true;
      if (_notifTimer != null) clearTimeout(_notifTimer);
    } else {
      el.style.transform = '';
      el.style.opacity   = '';
    }
  }, { passive: true });
  el.addEventListener('click', () => {
    el.hidden = true;
    if (_notifTimer != null) clearTimeout(_notifTimer);
  });

  DOM.notifClose?.addEventListener('click', e => {
    e.stopPropagation();
    el.hidden = true;
    if (_notifTimer != null) clearTimeout(_notifTimer);
  });
}

/* ════════════════════════════════════════════════════════════════
   11. CONNECTION STATUS
════════════════════════════════════════════════════════════════ */
function setConnStatus(connected, attempt = 0) {
  State.isOnline = connected === true;
  if (!DOM.connDot) return;
  DOM.connDot.className = 'conn-dot ' + (State.isOnline ? 'connected' : 'disconnected');
  if (DOM.connLabel) {
    DOM.connLabel.textContent = State.isOnline
      ? 'Connected'
      : attempt > 0 ? `Offline (retry ${attempt})` : 'Offline';
  }
}

/* ════════════════════════════════════════════════════════════════
   12. THEME
════════════════════════════════════════════════════════════════ */
const Theme = {
  init() {
    const saved       = localStorage.getItem('ww_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const wantDark    = saved ? saved === 'dark' : prefersDark;
    document.body.classList.toggle('light', !wantDark);
    this._updateIcon();

    DOM.themeToggle?.addEventListener('click', () => {
      document.body.classList.toggle('light');
      const isLight = document.body.classList.contains('light');
      localStorage.setItem('ww_theme', isLight ? 'light' : 'dark');
      this._updateIcon();
    });
  },

  _updateIcon() {
    if (!DOM.themeToggle) return;
    const isLight = document.body.classList.contains('light');
    const icon = DOM.themeToggle.querySelector('i');
    if (icon) {
      icon.className = isLight ? 'fas fa-sun' : 'fas fa-moon';
    }
    DOM.themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
  },
};

/* ════════════════════════════════════════════════════════════════
   13. WALLPAPER
   [v9.0] Extended with custom wallpaper upload support.
   - Users can upload any image from their device.
   - Image is converted to base64 and stored in localStorage.
   - Custom wallpaper survives page refreshes.
   - "Remove" button clears the custom wallpaper.
   - Built-in cycle still works independently.
   - Wallpaper button closes sidebar before applying change.
════════════════════════════════════════════════════════════════ */
const Wallpaper = {
  init() {
    /* Restore saved built-in index */
    const raw = localStorage.getItem('ww_wallpaper');
    if (raw !== null) {
      const parsed = parseInt(raw, 10);
      State.wallpaperIdx = (!Number.isNaN(parsed) && parsed >= 0 && parsed < C.WALLPAPERS.length)
        ? parsed : 0;
    }

    /* Restore saved custom wallpaper */
    const savedCustom = localStorage.getItem(C.CUSTOM_WP_STORAGE_KEY);
    if (savedCustom) {
      State._customWallpaper = savedCustom;
    }

    this._apply();
    this._updateClearBtnVisibility();

    /* Built-in cycle button */
    DOM.wallpaperBtn?.addEventListener('click', () => {
      Sidebar.close();
      setTimeout(() => this.cycle(), 80);
    });

    /* Custom wallpaper upload button triggers hidden file input */
    DOM.customWpBtn?.addEventListener('click', () => {
      DOM.customWpInput?.click();
    });

    /* File input change handler */
    DOM.customWpInput?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) {
        Sidebar.close();
        setTimeout(() => this.setCustom(file), 80);
      }
      /* Reset input so same file can be re-selected */
      e.target.value = '';
    });

    /* Clear custom wallpaper button */
    DOM.clearWpBtn?.addEventListener('click', () => {
      Sidebar.close();
      setTimeout(() => this.clearCustom(), 80);
    });
  },

  cycle() {
    /* When cycling built-in wallpapers, clear custom first */
    if (State._customWallpaper) {
      this.clearCustom(true);
    }
    State.wallpaperIdx = (State.wallpaperIdx + 1) % C.WALLPAPERS.length;
    this._apply();
    localStorage.setItem('ww_wallpaper', State.wallpaperIdx);
    notify('Wallpaper: ' + C.WALLPAPERS[State.wallpaperIdx].label);
  },

  /* [NEW] Set a custom image wallpaper from a File object */
  setCustom(file) {
    if (!file || !file.type.startsWith('image/')) {
      notify('Please choose an image file (PNG, JPG, GIF, WebP)', 'error');
      return;
    }

    /* 5 MB cap to avoid filling localStorage */
    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      notify(`Image too large (${Utils.formatBytes(file.size)}). Max 5 MB.`, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      try {
        localStorage.setItem(C.CUSTOM_WP_STORAGE_KEY, dataUrl);
        State._customWallpaper = dataUrl;
        this._apply();
        this._updateClearBtnVisibility();
        notify('Custom wallpaper applied! 🖼️');
      } catch (storageErr) {
        /* localStorage quota exceeded */
        notify('Image too large for local storage. Try a smaller file.', 'error');
      }
    };
    reader.onerror = () => notify('Failed to read image file.', 'error');
    reader.readAsDataURL(file);
  },

  /* [NEW] Remove custom wallpaper and fall back to built-in */
  clearCustom(silent = false) {
    State._customWallpaper = null;
    localStorage.removeItem(C.CUSTOM_WP_STORAGE_KEY);
    this._apply();
    this._updateClearBtnVisibility();
    if (!silent) notify('Custom wallpaper removed');
  },

  _apply() {
    const el = DOM.messages;
    if (!el) return;

    /* Custom wallpaper takes priority over built-in */
    if (State._customWallpaper) {
      el.style.backgroundImage = `url(${State._customWallpaper})`;
      el.style.backgroundSize  = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.backgroundRepeat   = 'no-repeat';
      return;
    }

    /* Reset any leftover custom styles */
    el.style.backgroundImage    = '';
    el.style.backgroundPosition = '';
    el.style.backgroundRepeat   = '';

    const idx = (State.wallpaperIdx >= 0 && State.wallpaperIdx < C.WALLPAPERS.length)
      ? State.wallpaperIdx : 0;
    const wp = C.WALLPAPERS[idx];

    if (wp.bg) {
      el.style.background     = wp.bg;
      el.style.backgroundSize = wp.size ?? 'auto';
    } else {
      el.style.background     = '';
      el.style.backgroundSize = '';
    }
  },

  /* [NEW] Show/hide the "Remove Custom" button depending on state */
  _updateClearBtnVisibility() {
    if (!DOM.clearWpBtn) return;
    DOM.clearWpBtn.hidden = !State._customWallpaper;
  },
};

/* ════════════════════════════════════════════════════════════════
   14. OFFLINE QUEUE
════════════════════════════════════════════════════════════════ */
const Queue = {
  _save() {
    try { localStorage.setItem('ww_queue', JSON.stringify(State.offlineQueue)); }
    catch { /* storage full */ }
  },

  load() {
    const raw    = localStorage.getItem('ww_queue');
    const parsed = Utils.safeJsonParse(raw, []);
    if (!Array.isArray(parsed)) { State.offlineQueue = []; return; }

    const now = Date.now();
    State.offlineQueue = parsed.filter(item => {
      if (!item || typeof item !== 'object') return false;
      if (!item.username || !item.uid || !item.message) return false;
      const age = now - (item._qts ?? 0);
      return age < C.QUEUE_PRUNE_TTL_MS;
    });

    if (parsed.length !== State.offlineQueue.length) this._save();
  },

  add(msg) {
    State.offlineQueue.push({ ...msg, _qid: Utils.genId(), _qts: Date.now() });
    this._save();
    notify('Message queued (offline) — will send when reconnected.', 'warn');
  },

  async flush() {
    if (State._flushInProgress) return;
    if (!State.db || !State.isOnline || !State.offlineQueue.length || !State.uid) return;

    State._flushInProgress = true;
    const items            = [...State.offlineQueue];
    State.offlineQueue     = [];

    let sent = 0;
    const failed = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (!State.uid) {
        for (let j = i; j < items.length; j++) failed.push(items[j]);
        break;
      }

      if (!item.username || !item.uid || !item.message) continue;

      try {
        await State.db.ref('messages').push({
          username:  item.username,
          uid:       item.uid,
          message:   item.message,
          plainText: item.plainText,
          timestamp: firebase.database.ServerValue.TIMESTAMP,
        });
        sent++;
      } catch {
        failed.push(item);
      }
    }

    if (failed.length || State.offlineQueue.length) {
      State.offlineQueue = [...failed, ...State.offlineQueue];
      this._save();
    } else {
      localStorage.removeItem('ww_queue');
    }

    State._flushInProgress = false;

    if (sent > 0) notify(`${sent} queued message${sent > 1 ? 's' : ''} sent!`);
  },
};

/* ════════════════════════════════════════════════════════════════
   15. SCROLL + pull-to-refresh + infinite scroll up
════════════════════════════════════════════════════════════════ */
const Scroll = {
  init() {
    if (!DOM.messages) return;

    DOM.messages.addEventListener('scroll', () => {
      if (State._scrollRaf) return;
      State._scrollRaf = requestAnimationFrame(() => {
        State._scrollRaf = null;
        if (!DOM.messages) return;
        const { scrollTop, scrollHeight, clientHeight } = DOM.messages;
        const atBottom = scrollHeight - scrollTop - clientHeight < C.SCROLL_THRESHOLD;

        if (atBottom !== State.atBottom) {
          State.atBottom = atBottom;
          if (atBottom) State.unreadCount = 0;
          this._badge();
        }

        if (scrollTop < C.SCROLL_TOP_LOAD && !State._loadingOlder) {
          Messages.loadOlderDebounced();
        }
      });
    }, { passive: true });

    DOM.scrollBtn?.addEventListener('click', () => this.toBottom());

    if (C.IS_MOBILE) this._initPullRefresh();
  },

  _initPullRefresh() {
    if (!DOM.messages) return;

    const indicator = document.createElement('div');
    indicator.id        = 'ww-pull-indicator';
    indicator.innerHTML = '<i class="fas fa-rotate pull-spin" aria-hidden="true"></i><span>Refreshing…</span>';
    DOM.messages.prepend(indicator);

    DOM.messages.addEventListener('touchstart', e => {
      if (DOM.messages.scrollTop === 0) {
        State._pullStartY = e.touches[0].clientY;
        State._pullActive = true;
      }
    }, { passive: true });

    DOM.messages.addEventListener('touchmove', e => {
      if (!State._pullActive) return;
      if (e.touches[0].clientY - State._pullStartY > 60) indicator.classList.add('active');
    }, { passive: true });

    DOM.messages.addEventListener('touchend', async () => {
      if (!State._pullActive) return;
      State._pullActive = false;
      if (indicator.classList.contains('active')) {
        indicator.classList.remove('active');
        await Messages.load();
      }
    }, { passive: true });
  },

  toBottom(smooth = true) {
    if (!DOM.messages) return;
    DOM.messages.scrollTo({ top: DOM.messages.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
    State.atBottom    = true;
    State.unreadCount = 0;
    this._badge();
  },

  onNewMsg(isOwn) {
    if (State.atBottom || isOwn) {
      this.toBottom();
    } else {
      State.unreadCount++;
      this._badge();
      if (DOM.srAnnounce) {
        DOM.srAnnounce.textContent = `${State.unreadCount} new message${State.unreadCount > 1 ? 's' : ''}`;
      }
    }
  },

  _badge() {
    if (!DOM.scrollBtn || !DOM.unreadBadge) return;
    if (!State.atBottom && State.unreadCount > 0) {
      DOM.scrollBtn.hidden        = false;
      DOM.unreadBadge.textContent = State.unreadCount > 99 ? '99+' : String(State.unreadCount);
      DOM.scrollBtn.setAttribute('aria-label', `Scroll to bottom — ${State.unreadCount} unread`);
    } else {
      DOM.scrollBtn.hidden        = true;
      DOM.unreadBadge.textContent = '';
      DOM.scrollBtn.setAttribute('aria-label', 'Scroll to bottom');
    }
  },
};

/* ════════════════════════════════════════════════════════════════
   16. REACTIONS
════════════════════════════════════════════════════════════════ */
const Reactions = {
  _pending: new Map(),
  _docListeners: { click: null, keydown: null },

  toggle(msgId, emoji) {
    if (!State.username) { notify('Register first to react', 'error'); return; }
    const ref = State.db.ref(`reactions/${msgId}/${State.username}`);
    ref.once('value').then(snap =>
      snap.val() === emoji ? ref.remove() : ref.set(emoji)
    ).catch(() => notify('Reaction failed', 'error'));
  },

  render(msgId, container, data = {}) {
    if (!container) return;

    const counts = Object.create(null);
    const byMe   = Object.create(null);
    const names  = Object.create(null);

    for (const [uname, emoji] of Object.entries(data)) {
      counts[emoji] = (counts[emoji] ?? 0) + 1;
      if (uname === State.username) byMe[emoji] = true;
      (names[emoji] ??= []).push(uname);
    }

    const frag = document.createDocumentFragment();

    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([emoji, count]) => {
        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'reaction' + (byMe[emoji] ? ' active' : '');
        btn.title     = (names[emoji] ?? []).join(', ');
        btn.textContent = `${emoji} ${count}`;
        btn.setAttribute('aria-label',   `React ${emoji} — ${count}`);
        btn.setAttribute('aria-pressed', String(!!byMe[emoji]));
        btn.addEventListener('click', () => this.toggle(msgId, emoji));
        frag.appendChild(btn);
      });

    const add = document.createElement('button');
    add.type      = 'button';
    add.className = 'reaction add-reaction';
    add.innerHTML = '<i class="fas fa-plus" aria-hidden="true"></i>';
    add.title     = 'Add reaction';
    add.setAttribute('aria-label', 'Add reaction');
    add.addEventListener('click', e => { e.stopPropagation(); this._openPicker(e.currentTarget, msgId); });
    frag.appendChild(add);

    container.replaceChildren(frag);
  },

  load(msgId, container) {
    State.db.ref(`reactions/${msgId}`).once('value')
      .then(snap => this.render(msgId, container, snap.val() ?? {}))
      .catch(err  => console.warn('[Reactions] load:', err));
  },

  subscribe() {
    if (State.reactionsRef) State.reactionsRef.off();
    State.reactionsRef = State.db.ref('reactions');

    Listeners.add(State.reactionsRef, 'child_changed', snap => {
      const msgId = snap.key;
      if (this._pending.has(msgId)) clearTimeout(this._pending.get(msgId));
      this._pending.set(msgId, setTimeout(() => {
        this._pending.delete(msgId);
        const el = $(`reactions-${msgId}`);
        if (el) this.render(msgId, el, snap.val() ?? {});
      }, C.REACTION_DEBOUNCE_MS));
    });
  },

  _openPicker(trigger, msgId) {
    this._detachDocListeners();
    document.querySelectorAll('.emoji-picker-popup').forEach(p => p.remove());

    const picker = document.createElement('div');
    picker.className     = 'emoji-picker-popup';
    picker.style.cssText = 'z-index:60;position:absolute;';
    picker.setAttribute('role', 'menu');
    picker.setAttribute('aria-label', 'Reaction picker');

    const frag = document.createDocumentFragment();
    C.QUICK_REACTIONS.forEach(emoji => {
      const btn = document.createElement('button');
      btn.type        = 'button';
      btn.className   = 'emoji-picker-btn';
      btn.textContent = emoji;
      btn.setAttribute('aria-label', `React ${emoji}`);
      btn.setAttribute('role', 'menuitem');
      btn.style.cssText = 'min-width:44px;min-height:44px;font-size:20px;';
      btn.addEventListener('click', () => { this.toggle(msgId, emoji); picker.remove(); });
      frag.appendChild(btn);
    });
    picker.appendChild(frag);

    const row = trigger.closest('.msg-reactions');
    if (row) {
      if (window.getComputedStyle(row).position === 'static') row.style.position = 'relative';
      row.appendChild(picker);

      if (C.IS_MOBILE) {
        requestAnimationFrame(() => {
          const rect    = picker.getBoundingClientRect();
          const vHeight = window.visualViewport?.height ?? window.innerHeight;
          if (rect.bottom > vHeight - 20) {
            picker.style.bottom = '100%';
            picker.style.top    = 'auto';
          }
        });
      }
    }

    const removePicker = () => {
      picker.remove();
      this._detachDocListeners();
    };

    this._docListeners.click = e => {
      if (!picker.contains(e.target) && e.target !== trigger) removePicker();
    };
    this._docListeners.keydown = e => {
      if (e.key === 'Escape') { removePicker(); trigger.focus(); }
    };

    setTimeout(() => {
      document.addEventListener('click',   this._docListeners.click);
      document.addEventListener('keydown', this._docListeners.keydown);
    }, 10);

    picker.querySelector('button')?.focus();
  },

  _detachDocListeners() {
    if (this._docListeners.click) {
      document.removeEventListener('click',   this._docListeners.click);
      this._docListeners.click = null;
    }
    if (this._docListeners.keydown) {
      document.removeEventListener('keydown', this._docListeners.keydown);
      this._docListeners.keydown = null;
    }
  },
};

/* ════════════════════════════════════════════════════════════════
   17. TYPING
════════════════════════════════════════════════════════════════ */
const Typing = {
  _ref: null,

  broadcast: Utils.debounce(function (hasText) {
    if (!State.username || !State.typingRef) return;
    const desired = !!hasText;
    if (desired === State.isTyping) return;
    State.isTyping = desired;
    State.typingRef.set(desired).catch(() => {});
    if (State.typingTimer != null) clearTimeout(State.typingTimer);
    if (desired) {
      State.typingTimer = setTimeout(() => {
        State.isTyping = false;
        State.typingRef?.set(false).catch(() => {});
      }, C.TYPING_CLEAR_MS);
    }
  }, C.TYPING_DEBOUNCE_MS),

  stop() {
    if (!State.isTyping) return;
    State.isTyping = false;
    if (State.typingTimer != null) clearTimeout(State.typingTimer);
    State.typingRef?.set(false).catch(() => {});
  },

  subscribe() {
    if (this._ref) { this._ref.off(); this._ref = null; }

    this._ref = State.db.ref('typing');
    Listeners.add(this._ref, 'value', snap => {
      if (!DOM.typingIndicator || !DOM.typingUsers) return;
      const data = snap.val() ?? {};
      const list = Object.entries(data)
        .filter(([u, v]) => u !== State.username && v === true)
        .map(([u]) => Utils.escapeHtml(u));

      if (!list.length) { DOM.typingIndicator.hidden = true; return; }

      DOM.typingUsers.textContent =
        list.length === 1 ? `${list[0]} is typing…` :
        list.length === 2 ? `${list[0]} and ${list[1]} are typing…` :
                            `${list[0]}, ${list[1]} and others are typing…`;

      DOM.typingIndicator.hidden = false;
    });
  },
};

/* ════════════════════════════════════════════════════════════════
   18. PRESENCE
════════════════════════════════════════════════════════════════ */
const Presence = {
  _heartbeatTimer: null,
  _failCount: 0,

  async setup(username) {
    this.stop();

    State.presenceRef = State.db.ref(`presence/${State.uid}`);
    State.typingRef   = State.db.ref(`typing/${username}`);

    await State.presenceRef.set({
      username,
      ts:     firebase.database.ServerValue.TIMESTAMP,
      online: true,
    });
    await State.typingRef.set(false);

    State.presenceRef.onDisconnect().remove();
    State.typingRef.onDisconnect().remove();

    this._scheduleHeartbeat();
  },

  _scheduleHeartbeat() {
    if (this._heartbeatTimer != null) clearTimeout(this._heartbeatTimer);

    const delay = this._failCount === 0
      ? C.PRESENCE_HEARTBEAT
      : Utils.backoffMs(this._failCount, C.PRESENCE_HEARTBEAT);

    this._heartbeatTimer = setTimeout(async () => {
      if (!State.isOnline || document.hidden) {
        this._scheduleHeartbeat();
        return;
      }
      try {
        await State.presenceRef?.update({ ts: firebase.database.ServerValue.TIMESTAMP });
        this._failCount = 0;
      } catch {
        this._failCount = Math.min(this._failCount + 1, 8);
      }
      this._scheduleHeartbeat();
    }, delay);
  },

  stop() {
    if (this._heartbeatTimer != null) clearTimeout(this._heartbeatTimer);
    this._heartbeatTimer = null;
    this._failCount      = 0;
    State.presenceRef?.remove().catch(() => {});
    State.typingRef?.remove().catch(() => {});
  },

  subscribe() {
    Listeners.add(State.db.ref('presence'), 'value', snap => {
      const data            = snap.val() ?? {};
      const now             = Date.now();
      const staleThreshold  = now - C.PRESENCE_HEARTBEAT * 2;
      const users           = Object.values(data)
        .filter(u => u?.username && (u.ts ?? 0) > staleThreshold);

      if (DOM.onlineCount) DOM.onlineCount.textContent = users.length;
      this._renderList(users);
    });
  },

  _renderList(users) {
    if (!DOM.onlineList) return;
    const frag = document.createDocumentFragment();

    if (!users.length) {
      const div = document.createElement('div');
      div.style.cssText = 'font-size:11px;color:var(--tx3);padding:4px 8px';
      div.textContent   = 'Nobody yet';
      frag.appendChild(div);
    } else {
      users.forEach(u => {
        const isMe = u.username === State.username;
        const div  = document.createElement('div');
        div.className = 'online-user';
        div.setAttribute('role', 'listitem');

        const dot  = document.createElement('div');
        dot.className = 'dot';
        dot.setAttribute('aria-hidden', 'true');

        const name = document.createElement('span');
        name.textContent = u.username;

        div.append(dot, name);
        if (isMe) {
          const you = document.createElement('span');
          you.textContent   = '(you)';
          you.style.cssText = 'font-size:10px;color:var(--acc-s,#9b7dff)';
          you.setAttribute('aria-label', '(you)');
          div.appendChild(you);
        }
        frag.appendChild(div);
      });
    }

    DOM.onlineList.replaceChildren(frag);
  },
};

/* ════════════════════════════════════════════════════════════════
   19. AUTO-CLEANUP — admin only
════════════════════════════════════════════════════════════════ */
const Cleanup = {
  async run() {
    if (!ADMIN_USERNAMES.includes(State.username)) return;
    try {
      const cutoff = Date.now() - C.MSG_TTL_MS;
      const snap   = await State.db.ref('messages')
        .orderByChild('timestamp')
        .endAt(cutoff)
        .once('value');

      if (!snap.exists()) return;

      const deletes = {};
      snap.forEach(child => {
        deletes[`messages/${child.key}`]  = null;
        deletes[`reactions/${child.key}`] = null;
      });

      const count = Math.floor(Object.keys(deletes).length / 2);
      if (count > 0) {
        await State.db.ref().update(deletes);
        console.info(`[Cleanup] Pruned ${count} expired message(s).`);
      }
    } catch (err) {
      if (err?.code !== 'PERMISSION_DENIED') {
        console.warn('[Cleanup] Auto-cleanup failed:', err);
      }
    }
  },
};

/* ════════════════════════════════════════════════════════════════
   20. SOUND
   AudioContext created lazily on first play() call.
════════════════════════════════════════════════════════════════ */
const Sound = {
  _getCtx() {
    if (!State._audioCtx) {
      try {
        State._audioCtx = new (window.AudioContext ?? window.webkitAudioContext)();
      } catch {
        return null;
      }
    }
    return State._audioCtx;
  },

  async play() {
    if (!State.soundEnabled) return;
    try {
      const ctx = this._getCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
        if (ctx.state === 'suspended') return;
      }
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type            = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } catch { /* AudioContext unavailable */ }
  },

  resumeOnGesture() {
    const resume = () => {
      if (State._audioCtx?.state === 'suspended') State._audioCtx.resume().catch(() => {});
    };
    document.addEventListener('touchstart', resume, { once: true, passive: true });
    document.addEventListener('click',      resume, { once: true });
  },

  init() {
    State.soundEnabled = localStorage.getItem('ww_sound') === 'true';
    const btn = $('soundToggle');
    if (btn) {
      this._updateBtn(btn);
      btn.addEventListener('click', () => {
        State.soundEnabled = !State.soundEnabled;
        localStorage.setItem('ww_sound', String(State.soundEnabled));
        this._updateBtn(btn);
        notify(State.soundEnabled ? 'Sounds on 🔔' : 'Sounds off 🔇');
      });
    }
    this.resumeOnGesture();
  },

  _updateBtn(btn) {
    const on = State.soundEnabled;
    btn.innerHTML = `<i class="fas ${on ? 'fa-volume-high' : 'fa-volume-xmark'}" aria-hidden="true"></i>`;
    btn.setAttribute('aria-label', on ? 'Mute sounds' : 'Enable sounds');
  },
};

/* ════════════════════════════════════════════════════════════════
   21. CONTEXT MENU — delete / edit own messages
════════════════════════════════════════════════════════════════ */
const ContextMenu = {
  _el:          null,
  _pressTimer:  null,

  init() {
    document.addEventListener('click',   e => { if (this._el && !this._el.contains(e.target)) this._close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this._close(); });
  },

  attach(msgEl, msgId, uid) {
    if (uid !== State.uid) return;

    msgEl.addEventListener('contextmenu', e => { e.preventDefault(); this._open(e.clientX, e.clientY, msgId); });

    msgEl.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      this._pressTimer = setTimeout(() => {
        Utils.vibrate([15]);
        this._open(e.clientX, e.clientY, msgId);
      }, C.CONTEXT_MENU_MS);
    });
    msgEl.addEventListener('pointerup',     () => { if (this._pressTimer != null) clearTimeout(this._pressTimer); });
    msgEl.addEventListener('pointermove',   () => { if (this._pressTimer != null) clearTimeout(this._pressTimer); });
    msgEl.addEventListener('pointercancel', () => { if (this._pressTimer != null) clearTimeout(this._pressTimer); });
  },

  _open(clientX, clientY, msgId) {
    this._close();

    const menu = document.createElement('div');
    menu.className     = 'ctx-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Message options');
    menu.style.cssText = `
      position:fixed;left:${clientX}px;top:${clientY}px;
      background:var(--c-bg3,#18182a);
      border:1px solid var(--bd2,rgba(124,92,252,.3));
      border-radius:var(--r-sm,8px);
      padding:5px;z-index:200;
      box-shadow:0 8px 28px rgba(0,0,0,.5);
      min-width:160px;
    `;

    const editBtn = this._menuBtn(
      '<i class="fas fa-pencil" aria-hidden="true"></i><span>Edit message</span>',
      'var(--tx,#f0eeff)',
      () => { this._close(); MessageEdit.start(msgId); }
    );
    const delBtn = this._menuBtn(
      '<i class="fas fa-trash" aria-hidden="true"></i><span>Delete message</span>',
      'var(--red,#f87171)',
      () => { this._close(); this._deleteMsg(msgId); }
    );

    menu.append(editBtn, delBtn);
    document.body.appendChild(menu);
    this._el = menu;

    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right  > window.innerWidth)  menu.style.left = `${clientX - rect.width  - 8}px`;
      if (rect.bottom > window.innerHeight) menu.style.top  = `${clientY - rect.height - 8}px`;
    });

    editBtn.focus();
  },

  _menuBtn(html, color, onClick) {
    const btn = document.createElement('button');
    btn.type            = 'button';
    btn.setAttribute('role', 'menuitem');
    btn.style.cssText   = `
      display:flex;align-items:center;gap:8px;
      width:100%;padding:10px 12px;border-radius:5px;
      background:transparent;color:${color};
      font-size:13px;border:none;cursor:pointer;
      min-height:44px;transition:background .12s;
    `;
    btn.innerHTML = html;
    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,.06)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
    btn.addEventListener('click', onClick);
    return btn;
  },

  _close() { this._el?.remove(); this._el = null; },

  async _deleteMsg(msgId) {
    try {
      await State.db.ref().update({
        [`messages/${msgId}`]:  null,
        [`reactions/${msgId}`]: null,
      });
      notify('Message deleted');
    } catch (err) {
      notify('Delete failed: ' + (err.message ?? err), 'error');
    }
  },
};

/* ════════════════════════════════════════════════════════════════
   22. MESSAGE EDIT — inline edit for own messages
════════════════════════════════════════════════════════════════ */
const MessageEdit = {
  async start(msgId) {
    const msgEl  = $(`msg-${msgId}`);
    const bubble = msgEl?.querySelector('.msg-bubble');
    if (!bubble) return;

    let plainText = '';
    try {
      const snap = await State.db.ref(`messages/${msgId}/plainText`).once('value');
      plainText  = snap.val() ?? bubble.textContent.trim();
    } catch {
      plainText = bubble.textContent.trim();
    }

    const ta = document.createElement('textarea');
    ta.value     = plainText;
    ta.rows       = Math.max(2, plainText.split('\n').length);
    ta.style.cssText = `
      width:100%;resize:vertical;padding:8px 10px;
      border-radius:8px;line-height:1.5;
      font-family:inherit;color:var(--tx,#f0eeff);
      background:var(--c-bg2,#161625);
      border:1px solid var(--acc,#7c6dfa);
      outline:none;box-sizing:border-box;
      min-height:60px;font-size:max(16px,1em);
    `;
    ta.setAttribute('aria-label', 'Edit message');

    bubble.replaceWith(ta);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);

    let _saved = false;

    const cancel = () => {
      if (_saved) return;
      const newBubble = document.createElement('div');
      newBubble.className = 'msg-bubble';
      newBubble.innerHTML = DOMPurify.sanitize(Utils.linkify(Utils.escapeHtml(plainText)), C.PURIFY_MSG);
      ta.replaceWith(newBubble);
    };

    const save = async () => {
      if (_saved) return;
      const newText = ta.value.trim();
      if (!newText || newText === plainText) { cancel(); return; }
      if (Utils.hasProfanity(newText)) { notify('Contains inappropriate content', 'error'); return; }

      _saved = true;
      const safe = DOMPurify.sanitize(Utils.linkify(Utils.escapeHtml(newText)), C.PURIFY_SEND);
      try {
        await State.db.ref(`messages/${msgId}`).update({
          message:   safe,
          plainText: newText,
          edited:    true,
          editedAt:  firebase.database.ServerValue.TIMESTAMP,
        });
        notify('Message updated');
      } catch (err) {
        _saved = false;
        notify('Edit failed: ' + (err.message ?? err), 'error');
        cancel();
      }
    };

    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
      if (e.key === 'Escape') cancel();
    });

    ta.addEventListener('blur', () => {
      requestAnimationFrame(() => {
        if (!_saved && document.activeElement !== ta) cancel();
      });
    });
  },
};

/* ════════════════════════════════════════════════════════════════
   23. MESSAGES — render, delete, subscribe, paginate
   [FIX] Messages.load() cleanup now also skips DOM.scrollBtn so
   the FAB is never accidentally removed during a message refresh.
════════════════════════════════════════════════════════════════ */
const Messages = {

  loadOlderDebounced: Utils.debounce(function () {
    Messages.loadOlder();
  }, C.LOADOLDER_DEBOUNCE_MS),

  _buildEl(id, data) {
    const isOwn   = data.uid === State.uid;
    const time    = Utils.formatTime(data.timestamp);
    const grad    = Utils.avatarGradient(data.username ?? '?');
    const initial = Utils.userInitial(data.username);
    const badge   = Utils.roleBadge(data.username, State.userRoles);
    const expires = data.timestamp ? `Expires in ${Utils.daysLeft(data.timestamp)} day(s)` : '';

    let safe = '';
    try {
      const raw = data.message ?? Utils.linkify(Utils.escapeHtml(data.plainText ?? ''));
      safe = DOMPurify.sanitize(raw, C.PURIFY_MSG);
    } catch {
      safe = Utils.escapeHtml(data.plainText ?? '[message unavailable]');
    }

    const row = document.createElement('div');
    row.className = 'msg' + (isOwn ? ' own' : '');
    row.id        = `msg-${id}`;
    row.setAttribute('role', 'article');
    row.dataset.uid = data.uid       ?? '';
    row.dataset.ts  = data.timestamp ?? '0';

    const absTime    = Utils.escapeHtml(time);
    const relTime    = data.timestamp ? Utils.relativeTime(data.timestamp) : '';
    const editedMark = data.edited
      ? '<span class="msg-edited" title="Edited" aria-label="Edited"> (edited)</span>'
      : '';

    const metaHtml = isOwn
      ? `<span class="msg-time" title="${relTime}" data-reltime="${data.timestamp ?? ''}">${absTime}</span>${editedMark}`
      : `<span class="msg-author">${Utils.escapeHtml(data.username ?? 'ghost')}${badge}</span>
         <span class="msg-time" title="${relTime}" data-reltime="${data.timestamp ?? ''}">${absTime}</span>${editedMark}`;

    row.innerHTML = `
      <div class="msg-avatar" style="background:${grad}" aria-hidden="true">${initial}</div>
      <div class="msg-body">
        <div class="msg-meta">${metaHtml}</div>
        <div class="msg-bubble" title="${Utils.escapeHtml(expires)}">${safe}</div>
        <div class="msg-reactions" id="reactions-${id}" role="group" aria-label="Reactions"></div>
      </div>`;

    Utils.idle(() => Reactions.load(id, row.querySelector(`#reactions-${id}`)));
    ContextMenu.attach(row, id, data.uid);
    return row;
  },

  _checkGrouping(row, data) {
    let prev = row.previousElementSibling;
    while (prev && !prev.classList.contains('msg')) {
      prev = prev.previousElementSibling;
    }
    if (!prev) return;
    const prevUid = prev.dataset.uid;
    const prevTs  = parseInt(prev.dataset.ts ?? '0', 10);
    if (prevUid === data.uid && (data.timestamp - prevTs) < 3 * 60 * 1_000) {
      row.classList.add('msg-grouped');
    }
  },

  append(id, data, isNew = false) {
    if (State.renderedIds.has(id)) return;
    State.renderedIds.add(id);

    if (data.timestamp && data.timestamp < State._oldestMsgTs) {
      State._oldestMsgTs = data.timestamp;
    }

    if (DOM.emptyState) DOM.emptyState.hidden = true;

    const el = this._buildEl(id, data);
    DOM.messages.appendChild(el);
    this._checkGrouping(el, data);

    if (isNew) {
      requestAnimationFrame(() => {
        el.classList.add('msg-new');
        setTimeout(() => el.classList.remove('msg-new'), C.MSG_HIGHLIGHT_MS);
      });
      if (data.uid !== State.uid) Sound.play();
    }

    Scroll.onNewMsg(data.uid === State.uid);
  },

  prepend(id, data) {
    if (State.renderedIds.has(id)) return;
    State.renderedIds.add(id);

    if (data.timestamp && data.timestamp < State._oldestMsgTs) {
      State._oldestMsgTs = data.timestamp;
    }

    const el = this._buildEl(id, data);
    const firstMsg = DOM.messages.querySelector('.msg');
    DOM.messages.insertBefore(el, firstMsg ?? null);
  },

  remove(id) {
    $(`msg-${id}`)?.remove();
    State.renderedIds.delete(id);
    if (!State.renderedIds.size && DOM.emptyState) DOM.emptyState.hidden = false;
  },

  async load() {
    if (DOM.refreshButton) {
      DOM.refreshButton.disabled  = true;
      DOM.refreshButton.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span class="topbar-btn-label">Loading…</span>';
    }

    /*
     * [FIX] Skip the scrollBtn element as well as emptyState and
     * pull-indicator so the FAB is never removed during a refresh.
     * The FAB lives inside #messages in the HTML but is position:fixed,
     * so it must not be removed when we clear message children.
     */
    if (DOM.messages) {
      Array.from(DOM.messages.children).forEach(el => {
        if (
          el !== DOM.emptyState &&
          el.id !== 'ww-pull-indicator' &&
          el !== DOM.scrollBtn
        ) {
          el.remove();
        }
      });
    }

    State.renderedIds.clear();
    State._oldestMsgTs    = Infinity;
    State._initialLoadDone = false;
    if (DOM.emptyState) DOM.emptyState.hidden = true;

    if (!State._msgSince || !Number.isFinite(State._msgSince)) {
      State._msgSince = Date.now() - C.MSG_TTL_MS;
    }

    const skeleton = this._buildSkeleton();
    DOM.messages?.appendChild(skeleton);

    try {
      const snap = await State.db.ref('messages')
        .orderByChild('timestamp')
        .limitToLast(C.MSG_LOAD_LIMIT)
        .once('value');

      skeleton.remove();

      if (snap.exists()) {
        const msgs = [];
        snap.forEach(c => msgs.push({ id: c.key, ...c.val() }));
        msgs
          .filter(m => !Utils.isExpired(m.timestamp))
          .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
          .forEach(m => this.append(m.id, m, false));
      }

      if (!State.renderedIds.size && DOM.emptyState) DOM.emptyState.hidden = false;
      Scroll.toBottom(false);

    } catch (err) {
      skeleton.remove();
      if (DOM.emptyState) DOM.emptyState.hidden = false;
      notify('Error loading messages: ' + (err.message ?? err), 'error');
    } finally {
      State._initialLoadDone = true;

      if (DOM.refreshButton) {
        DOM.refreshButton.disabled  = false;
        DOM.refreshButton.innerHTML = '<i class="fas fa-rotate" aria-hidden="true"></i><span class="topbar-btn-label">Refresh</span>';
      }
    }
  },

  async loadOlder() {
    if (State._loadingOlder) return;
    if (State._oldestMsgTs === Infinity) return;

    State._loadingOlder = true;
    const prevHeight    = DOM.messages?.scrollHeight ?? 0;

    try {
      const snap = await State.db.ref('messages')
        .orderByChild('timestamp')
        .endAt(State._oldestMsgTs - 1)
        .limitToLast(C.MSG_LOAD_PAGE)
        .once('value');

      if (snap.exists()) {
        const msgs = [];
        snap.forEach(c => msgs.push({ id: c.key, ...c.val() }));
        msgs
          .filter(m => !Utils.isExpired(m.timestamp))
          .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
          .forEach(m => this.prepend(m.id, m));

        requestAnimationFrame(() => {
          if (!DOM.messages) return;
          DOM.messages.scrollTop += DOM.messages.scrollHeight - prevHeight;
        });
      }
    } catch (err) {
      console.warn('[Messages] loadOlder failed:', err);
    } finally {
      State._loadingOlder = false;
    }
  },

  _buildSkeleton() {
    const wrap = document.createElement('div');
    wrap.className = 'msg-skeleton-wrap';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = `
      <div class="msg-skeleton">
        <div class="msg-skeleton-avatar skeleton-pulse"></div>
        <div class="msg-skeleton-body">
          <div class="msg-skeleton-line skeleton-pulse"></div>
          <div class="msg-skeleton-bubble skeleton-pulse"></div>
        </div>
      </div>
      <div class="msg-skeleton">
        <div class="msg-skeleton-avatar skeleton-pulse"></div>
        <div class="msg-skeleton-body">
          <div class="msg-skeleton-line skeleton-pulse"></div>
          <div class="msg-skeleton-bubble skeleton-pulse"></div>
        </div>
      </div>`;
    return wrap;
  },

  subscribe() {
    if (State.messagesRef) State.messagesRef.off();

    if (!State._msgSince || !Number.isFinite(State._msgSince)) {
      State._msgSince = Date.now() - C.MSG_TTL_MS;
    }

    State.messagesRef = State.db.ref('messages')
      .orderByChild('timestamp')
      .startAt(State._msgSince);

    Listeners.add(State.messagesRef, 'child_added', snap => {
      const data = { ...snap.val() };
      if (Utils.isExpired(data.timestamp)) return;

      const alreadyRendered = State.renderedIds.has(snap.key);
      const isNew           = State._initialLoadDone && !alreadyRendered;
      this.append(snap.key, data, isNew);
    });

    Listeners.add(State.messagesRef, 'child_removed', snap => {
      this.remove(snap.key);
    });

    Listeners.add(State.messagesRef, 'child_changed', snap => {
      const data   = snap.val();
      const msgEl  = $(`msg-${snap.key}`);
      if (!msgEl) return;
      const bubble = msgEl.querySelector('.msg-bubble');
      if (!bubble) return;
      try {
        const raw = data.message ?? Utils.linkify(Utils.escapeHtml(data.plainText ?? ''));
        bubble.innerHTML = DOMPurify.sanitize(raw, C.PURIFY_MSG);
        const meta = msgEl.querySelector('.msg-meta');
        if (meta && data.edited && !meta.querySelector('.msg-edited')) {
          const mark = document.createElement('span');
          mark.className   = 'msg-edited';
          mark.title       = 'Edited';
          mark.textContent = ' (edited)';
          meta.appendChild(mark);
        }
      } catch { /* ignore */ }
    });
  },

  updateTimers() {
    if (!DOM.messages) return;
    const now = Date.now();
    DOM.messages.querySelectorAll('[data-reltime]').forEach(el => {
      const ts = parseInt(el.dataset.reltime, 10);
      if (!isNaN(ts) && ts > 0) el.title = Utils.relativeTime(ts, now);
    });
  },
};

/* ════════════════════════════════════════════════════════════════
   24. EDITOR — Quill + mobile keyboard + ResizeObserver + emoji tray
════════════════════════════════════════════════════════════════ */
const Editor = {
  _kbTrigger: null,

  init() {
    State.quill = new Quill('#editor-container', {
      theme:       'snow',
      placeholder: "What's your secret?",
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline', 'strike'],
          ['blockquote', 'code-block'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link'],
          ['clean'],
        ],
        keyboard: {
          bindings: {
            sendCtrl: { key: 13, ctrlKey: true, handler: () => Send.send() },
            sendCmd:  { key: 13, metaKey: true, handler: () => Send.send() },
          },
        },
      },
    });

    window.__wwQuill = State.quill;

    const hintEl = $$('.send-hint');
    if (hintEl) hintEl.textContent = Utils.sendShortcut();

    State.quill.on('text-change', Utils.debounce(() => {
      const plain = State.quill.getText().trim();
      const len   = State.quill.getLength() - 1;

      if (DOM.msgCharCount) DOM.msgCharCount.textContent = len;

      const cw = DOM.charWrap;
      if (cw) {
        cw.className = len > C.MSG_DANGER_CHARS ? 'char-pill danger'
          : len > C.MSG_WARN_CHARS ? 'char-pill warn' : 'char-pill';
      }

      const canSend = plain.length > 0 && len <= C.MSG_MAX_CHARS && !!State.username;
      if (DOM.sendButton) {
        DOM.sendButton.disabled = !canSend;
        DOM.sendButton.setAttribute('aria-disabled', String(!canSend));
      }

      Typing.broadcast(plain.length > 0);
    }, 150));

    this._initResizeObserver();
    this._initPaste();
    this._initMobileKeyboard();
    this._initEmojiTray();
  },

  _initResizeObserver() {
    const container = document.getElementById('editor-container');
    if (!container || typeof ResizeObserver === 'undefined') return;

    State._resizeObserver = new ResizeObserver(() => {
      /* Reserved for layout-sensitive recalculations */
    });
    State._resizeObserver.observe(container);
  },

  _initEmojiTray() {
    if (!DOM.emojiToggleBtn) return;

    let tray = null;

    const closeTray = () => {
      tray?.remove();
      tray = null;
      State._emojiTrayOpen = false;
      DOM.emojiToggleBtn.setAttribute('aria-expanded', 'false');
    };

    DOM.emojiToggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (State._emojiTrayOpen) { closeTray(); return; }

      tray = document.createElement('div');
      tray.className = 'emoji-tray';
      tray.setAttribute('role', 'toolbar');
      tray.setAttribute('aria-label', 'Emoji picker');

      C.QUICK_EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.type        = 'button';
        btn.className   = 'emoji-btn';
        btn.textContent = emoji;
        btn.setAttribute('aria-label', `Insert ${emoji}`);
        btn.addEventListener('click', () => {
          const q     = State.quill;
          const range = q.getSelection(true);
          const idx   = range ? range.index : q.getLength();
          q.insertText(idx, emoji, 'user');
          q.setSelection(idx + emoji.length, 0);
          closeTray();
          q.focus();
        });
        tray.appendChild(btn);
      });

      const composerBar = $$('.composer-bar');
      if (composerBar) {
        composerBar.parentElement.insertBefore(tray, composerBar);
      } else {
        DOM.emojiToggleBtn.closest('.composer')?.prepend(tray);
      }

      State._emojiTrayOpen = true;
      DOM.emojiToggleBtn.setAttribute('aria-expanded', 'true');
    });

    document.addEventListener('click', e => {
      if (State._emojiTrayOpen && tray && !tray.contains(e.target) && e.target !== DOM.emojiToggleBtn) {
        closeTray();
      }
    });
  },

  _initMobileKeyboard() {
    if (!C.IS_MOBILE) return;

    const editorContainer = document.getElementById('editor-container');
    if (!editorContainer) return;

    const ta = document.createElement('textarea');
    ta.id             = 'ww-mobile-kb-trigger';
    ta.autocomplete   = 'off';
    ta.autocorrect    = 'off';
    ta.autocapitalize = 'off';
    ta.spellcheck     = false;
    ta.tabIndex       = -1;
    ta.setAttribute('aria-hidden', 'true');

    editorContainer.parentElement?.appendChild(ta);
    this._kbTrigger = ta;

    ta.addEventListener('focus', () => {
      setTimeout(() => {
        const qlEditor = editorContainer.querySelector('.ql-editor');
        if (qlEditor) {
          qlEditor.focus();
          const range = document.createRange();
          const sel   = window.getSelection();
          range.selectNodeContents(qlEditor);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }, 50);
    });

    const wrap = DOM.editorWrap ?? editorContainer.parentElement;
    if (wrap) {
      wrap.addEventListener('touchend', e => {
        const qlEditor = editorContainer.querySelector('.ql-editor');
        if (document.activeElement !== qlEditor) {
          e.preventDefault();
          ta.focus();
        }
      }, { passive: false });
    }

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', Utils.throttle(() => {
        const vvHeight  = window.visualViewport.height;
        const winHeight = window.innerHeight;
        if (vvHeight < winHeight * 0.75) {
          setTimeout(() => Scroll.toBottom(false), 100);
        }
      }, 200));
    }
  },

  _initPaste() {
    const container = document.getElementById('editor-container');
    if (!container) return;

    container.addEventListener('paste', e => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const img   = items.find(i => i.type.startsWith('image/'));
      if (!img) return;

      e.preventDefault();
      e.stopPropagation();

      const file = img.getAsFile();
      if (!file) return;

      const reader = new FileReader();
      reader.onload = ev => {
        const url   = ev.target.result;
        const q     = State.quill;
        const range = q.getSelection(true);
        const idx   = range ? range.index : q.getLength();
        q.insertEmbed(idx, 'image', url, 'user');
        q.setSelection(idx + 1, 0);
      };
      reader.readAsDataURL(file);
    }, true);
  },

  focus() {
    if (C.IS_MOBILE) {
      setTimeout(() => this._kbTrigger?.focus(), 80);
    } else {
      setTimeout(() => State.quill?.focus(), 80);
    }
  },

  clear() {
    State.quill?.setText('');
    if (DOM.msgCharCount) DOM.msgCharCount.textContent = '0';
    const cw = DOM.charWrap;
    if (cw) cw.className = 'char-pill';
  },
};

/* ════════════════════════════════════════════════════════════════
   25. SEND
════════════════════════════════════════════════════════════════ */
const Send = {
  async send() {
    if (!State.username) { notify('Register a username first', 'error'); return; }
    if (!State.quill)    { notify('Editor not ready', 'error'); return; }

    const now   = Date.now();
    const since = now - State.lastSendTs;
    if (since < C.SEND_RATE_MS) {
      notify(`Slow down — wait ${Math.ceil((C.SEND_RATE_MS - since) / 1_000)}s`, 'warn');
      return;
    }

    const plain = State.quill.getText().trim();
    const html  = State.quill.root.innerHTML;
    const len   = State.quill.getLength() - 1;

    if (!plain)                { notify('Message is empty', 'warn'); return; }
    if (len > C.MSG_MAX_CHARS) { notify(`Too long (max ${C.MSG_MAX_CHARS} chars)`, 'warn'); return; }
    if (Utils.hasProfanity(plain)) { notify('Message contains inappropriate content', 'error'); return; }

    let safe = '';
    try {
      safe = DOMPurify.sanitize(html, C.PURIFY_SEND);
    } catch {
      safe = Utils.escapeHtml(plain);
    }

    const payload = { username: State.username, uid: State.uid, message: safe, plainText: plain };

    State.lastSendTs = now;
    this._loading(true);
    Utils.vibrate([10, 30, 10]);

    try {
      if (!State.isOnline) {
        Queue.add(payload);
        Editor.clear();
        return;
      }

      await State.db.ref('messages').push({
        ...payload,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
      });

      Editor.clear();
      Typing.stop();
      Scroll.toBottom();

    } catch (err) {
      State.lastSendTs = 0;
      if (!State.isOnline) {
        Queue.add(payload);
        Editor.clear();
      } else {
        notify('Send failed: ' + (err.message ?? err), 'error');
      }
    } finally {
      this._loading(false);
    }
  },

  _loading(on) {
    if (!DOM.sendButton) return;
    DOM.sendButton.disabled = on;
    DOM.sendButton.setAttribute('aria-disabled', String(on));
    DOM.sendButton.innerHTML = on
      ? '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Sending…</span>'
      : '<i class="fas fa-paper-plane" aria-hidden="true"></i><span>Send</span>';
  },
};

/* ════════════════════════════════════════════════════════════════
   26. AUTH / REGISTRATION
════════════════════════════════════════════════════════════════ */
const Auth = {

  async _startListeners() {
    await Messages.load();
    Messages.subscribe();
    Reactions.subscribe();
    Typing.subscribe();
    Presence.subscribe();
  },

  async onAnonymousAuth(user) {
    State.uid = user.uid;
    const saved = localStorage.getItem('ww_username');

    if (saved && C.USERNAME_RE.test(saved)) {
      try {
        const snap = await State.db.ref(`users/${saved}`).once('value');
        if (snap.exists()) {
          const data = snap.val();
          const role = data.role ?? Utils.resolveRole(saved);
          State.userRoles[saved] = role;
          State.db.ref(`users_by_uid/${user.uid}`).set({ username: saved, role }).catch(() => {});
          State.db.ref(`users/${saved}`).update({ lastSeen: Date.now(), uid: user.uid }).catch(() => {});
          this._applySession(saved, role);
          this._showChat();
          await this._startListeners();
          return;
        } else {
          localStorage.removeItem('ww_username');
        }
      } catch {
        /* [FIX] properly await loadUserRoles before continuing */
        await loadUserRoles();
        const role = Utils.resolveRole(saved);
        State.userRoles[saved] = role;
        this._applySession(saved, role);
        this._showChat();
        await this._startListeners();
        return;
      }
    }

    if (DOM.registerScreen) {
      DOM.registerScreen.hidden = false;
      requestAnimationFrame(() => DOM.username?.focus());
    }
  },

  async register() {
    const raw  = DOM.username?.value ?? '';
    const name = raw.trim().replace(/\s+/g, '_');

    if (!name)                        { notify('Enter a username', 'error'); return; }
    if (name.length < C.USERNAME_MIN) { notify(`Min ${C.USERNAME_MIN} characters`, 'error'); return; }
    if (name.length > C.USERNAME_MAX) { notify(`Max ${C.USERNAME_MAX} characters`, 'error'); return; }
    if (!C.USERNAME_RE.test(name))    { notify('Letters, numbers and underscores only', 'error'); return; }
    if (Utils.hasProfanity(name))     { notify('Inappropriate username', 'error'); return; }
    if (!State.auth.currentUser)      { notify('Auth not ready — try again', 'error'); return; }

    this._registerLoading(true);
    try {
      const taken = await State.db.ref(`users/${name}`).once('value');
      if (taken.exists()) { notify('Username taken — choose another', 'error'); return; }

      const role = Utils.resolveRole(name);
      const uid  = State.uid;
      const now  = Date.now();

      await State.db.ref().update({
        [`users/${name}`]:       { uid, username: name, registeredAt: now, role, lastSeen: now },
        [`users_by_uid/${uid}`]: { username: name, role },
      });

      localStorage.setItem('ww_username', name);
      State.userRoles[name] = role;

      this._applySession(name, role);
      this._showChat();
      notify(`Welcome to WhisperWall, ${name}! 👾`);
      await this._startListeners();

    } catch (err) {
      notify('Registration error: ' + (err.message ?? err), 'error');
    } finally {
      this._registerLoading(false);
    }
  },

  _applySession(username, role) {
    State.username = username;
    if (DOM.displayUsername) DOM.displayUsername.textContent = username;
    if (DOM.userAvatar) {
      DOM.userAvatar.textContent      = Utils.userInitial(username);
      DOM.userAvatar.style.background = Utils.avatarGradient(username);
    }
    const badge = $$('.id-badge');
    if (badge) {
      if      (role === 'admin') { badge.className = 'id-badge badge-admin'; badge.textContent = 'Admin'; }
      else if (role === 'vip')   { badge.className = 'id-badge badge-vip';   badge.textContent = 'VIP'; }
      else                       { badge.className = 'id-badge';              badge.textContent = 'Member'; }
    }
    Presence.setup(username);
  },

  _showChat() {
    if (DOM.registerScreen) DOM.registerScreen.hidden = true;
    if (DOM.sendButton) {
      DOM.sendButton.disabled = false;
      DOM.sendButton.setAttribute('aria-disabled', 'false');
    }
    Editor.focus();
  },

  _registerLoading(on) {
    if (!DOM.registerButton) return;
    DOM.registerButton.disabled  = on;
    DOM.registerButton.innerHTML = on
      ? '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Checking…</span>'
      : '<span>Enter the wall</span><i class="fas fa-arrow-right" aria-hidden="true"></i>';
  },

  checkAvailability: Utils.debounce(async function (val) {
    if (!DOM.usernameStatus) return;
    if (!C.USERNAME_RE.test(val)) { DOM.usernameStatus.textContent = ''; return; }
    DOM.usernameStatus.textContent = '⏳ Checking…';
    DOM.usernameStatus.className   = 'username-status';
    try {
      const snap = await State.db.ref(`users/${val}`).once('value');
      const ok   = !snap.exists();
      DOM.usernameStatus.textContent = ok ? '✓ Available' : '✗ Taken';
      DOM.usernameStatus.className   = `username-status ${ok ? 'status-good' : 'status-bad'}`;
      if (DOM.registerButton) {
        DOM.registerButton.disabled = !ok;
        DOM.registerButton.setAttribute('aria-disabled', String(!ok));
      }
    } catch { DOM.usernameStatus.textContent = ''; }
  }, 500),
};

/* ════════════════════════════════════════════════════════════════
   27. USERNAME INPUT
════════════════════════════════════════════════════════════════ */
function initUsernameInput() {
  if (!DOM.username) return;
  if (C.IS_MOBILE) DOM.username.style.fontSize = 'max(16px, 1em)';

  if (DOM.usernameStatus) {
    DOM.usernameStatus.setAttribute('role', 'status');
    DOM.usernameStatus.setAttribute('aria-live', 'polite');
    DOM.usernameStatus.setAttribute('aria-atomic', 'true');
  }

  const setStatus = (text, cls) => {
    if (!DOM.usernameStatus) return;
    DOM.usernameStatus.textContent = text;
    DOM.usernameStatus.className   = `username-status${cls ? ' ' + cls : ''}`;
  };

  DOM.username.addEventListener('input', function () {
    const v   = this.value;
    const len = v.length;
    if (DOM.usernameCharCount) DOM.usernameCharCount.textContent = len;

    if (len === 0)              { setStatus('', ''); return; }
    if (len < C.USERNAME_MIN)   { setStatus('Too short', 'status-bad'); return; }
    if (!C.USERNAME_RE.test(v)) { setStatus('Letters, numbers, underscores only', 'status-bad'); return; }

    Auth.checkAvailability(v.trim());
  });

  DOM.username.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !DOM.registerButton?.disabled) Auth.register();
  });
}

/* ════════════════════════════════════════════════════════════════
   28. SIDEBAR
════════════════════════════════════════════════════════════════ */
const Sidebar = {
  _sidebar:  null,
  _toggle:   null,
  _closeBtn: null,
  _backdrop: null,

  init() {
    this._sidebar  = $('sidebar');
    this._toggle   = $('menuToggle');
    this._closeBtn = $('sidebarClose');
    this._backdrop = $('sidebarBackdrop');

    if (!this._sidebar) return;

    this._toggle?.addEventListener('click', () => {
      this._sidebar.classList.contains('open') ? this.close() : this.open();
    });

    this._closeBtn?.addEventListener('click', () => this.close());
    this._backdrop?.addEventListener('click', () => this.close());

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this._sidebar.classList.contains('open')) this.close();
    });
  },

  open() {
    if (!this._sidebar) return;
    this._sidebar.classList.add('open');
    this._backdrop?.classList.add('visible');
    this._toggle?.setAttribute('aria-expanded', 'true');
    this._closeBtn?.focus();
  },

  close() {
    if (!this._sidebar) return;
    this._sidebar.classList.remove('open');
    this._backdrop?.classList.remove('visible');
    this._toggle?.setAttribute('aria-expanded', 'false');
  },
};

/* ════════════════════════════════════════════════════════════════
   29. CONNECTION
════════════════════════════════════════════════════════════════ */
function initConnection() {
  if (!State.db) { console.error('[WhisperWall] initConnection called before State.db is set'); return; }

  Listeners.add(State.db.ref('.info/connected'), 'value', snap => {
    const connected = !!snap.val();
    setConnStatus(connected, State.reconnectAttempts);

    if (connected) {
      if (State.reconnectTimer != null) { clearTimeout(State.reconnectTimer); State.reconnectTimer = null; }
      State.reconnectAttempts = 0;
      Queue.flush();
      if (State._wasOffline) { notify('Reconnected! 🟢'); State._wasOffline = false; }
    } else {
      State._wasOffline       = true;
      State.reconnectAttempts = Math.min(State.reconnectAttempts + 1, C.RECONNECT_MAX);
      notify('Connection lost — messages will be queued', 'warn');
    }
  });

  if ('connection' in navigator) {
    const conn = navigator.connection;
    const warnSlow = () => {
      if (['slow-2g', '2g'].includes(conn.effectiveType)) {
        notify('Slow network detected — some features may lag', 'warn', 5_000);
      }
    };
    warnSlow();
    conn.addEventListener('change', warnSlow);
  }
}

/* ════════════════════════════════════════════════════════════════
   30. LOAD USER ROLES
════════════════════════════════════════════════════════════════ */
async function loadUserRoles() {
  const cacheKey   = `ww_roles_${C.ROLES_CACHE_VERSION}`;
  const cacheTsKey = `ww_roles_ts_${C.ROLES_CACHE_VERSION}`;
  const cached     = Utils.safeJsonParse(localStorage.getItem(cacheKey), null);
  const cacheTs    = parseInt(localStorage.getItem(cacheTsKey) ?? '0', 10);

  if (cached && typeof cached === 'object' && Date.now() - cacheTs < C.ROLES_CACHE_TTL_MS) {
    Object.assign(State.userRoles, cached);
    return;
  }

  try {
    const snap = await State.db.ref('users').once('value');
    if (snap.exists()) {
      snap.forEach(c => {
        const d = c.val();
        if (d?.username) State.userRoles[d.username] = d.role ?? 'member';
      });
      try {
        localStorage.setItem(cacheKey,   JSON.stringify(State.userRoles));
        localStorage.setItem(cacheTsKey, String(Date.now()));
      } catch { /* storage full */ }
    }
  } catch (err) { console.warn('[Roles]', err); }
}

/* ════════════════════════════════════════════════════════════════
   31. EVENT WIRING
════════════════════════════════════════════════════════════════ */
function initEvents() {
  DOM.registerButton?.addEventListener('click', () => Auth.register());
  DOM.sendButton?.addEventListener('click',     () => Send.send());
  DOM.refreshButton?.addEventListener('click',  () => Messages.load());

  $('galleryBtn')?.addEventListener('click', () => {
    Sidebar.close();
    notify('Gallery coming soon!', 'success');
  });

  $('clearChatBtn')?.addEventListener('click', () => {
    if (!DOM.messages) return;
    Array.from(DOM.messages.children).forEach(el => {
      if (
        el !== DOM.emptyState &&
        el.id !== 'ww-pull-indicator' &&
        el !== DOM.scrollBtn
      ) {
        el.remove();
      }
    });
    State.renderedIds.clear();
    State._oldestMsgTs     = Infinity;
    State._initialLoadDone = false;
    if (DOM.emptyState) DOM.emptyState.hidden = false;
    Sidebar.close();
    notify('Chat cleared locally — messages still exist on server');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) Typing.stop();
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      Editor.focus();
    }
  });

  window.addEventListener('online',  () => setConnStatus(true));
  window.addEventListener('offline', () => setConnStatus(false));

  window.addEventListener('beforeunload', () => {
    Typing.stop();
    Presence.stop();
    if (State.timerInterval != null) clearInterval(State.timerInterval);
    if (State._scrollRaf   != null) cancelAnimationFrame(State._scrollRaf);
    Listeners.removeAll();
  });

  initNotifSwipe();
}

/* ════════════════════════════════════════════════════════════════
   32. HELP MODAL
   [FIX] The modal HTML elements don't exist in index.html.
   The function returns early gracefully. To enable the help modal,
   add the relevant HTML elements with IDs: helpModal, closeHelpBtn,
   helpNavBtn, footerHelpLink, formatHelpBtn.
════════════════════════════════════════════════════════════════ */
function initHelpModal() {
  const helpModal = $('helpModal');
  /* Not in HTML yet — skip without error */
  if (!helpModal) return;

  const closeHelpBtn   = $('closeHelpBtn');
  const helpNavBtn     = $('helpNavBtn');
  const footerHelpLink = $('footerHelpLink');
  const formatHelpBtn  = $('formatHelpBtn');

  helpModal.setAttribute('role', 'dialog');
  helpModal.setAttribute('aria-modal', 'true');
  helpModal.setAttribute('aria-label', 'Help');

  let _lastFocus = null;

  const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  const trapFocus = e => {
    if (helpModal.hidden) return;
    const focusable = Array.from(helpModal.querySelectorAll(FOCUSABLE));
    if (!focusable.length) return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];

    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
  };

  const openModal = e => {
    e?.preventDefault();
    _lastFocus = document.activeElement;
    helpModal.hidden = false;
    document.addEventListener('keydown', trapFocus);
    setTimeout(() => closeHelpBtn?.focus(), 50);
  };

  const closeModal = () => {
    helpModal.hidden = true;
    document.removeEventListener('keydown', trapFocus);
    _lastFocus?.focus();
  };

  closeHelpBtn?.addEventListener('click', closeModal);
  helpNavBtn?.addEventListener('click', openModal);
  footerHelpLink?.addEventListener('click', openModal);
  formatHelpBtn?.addEventListener('click', openModal);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !helpModal.hidden) closeModal();
  });

  helpModal.addEventListener('click', e => {
    if (e.target === helpModal) closeModal();
  });
}

/* ════════════════════════════════════════════════════════════════
   33. FATAL ERROR UI
════════════════════════════════════════════════════════════════ */
function showFatalError(err) {
  const msg = err?.message ?? String(err);
  console.error('[WhisperWall boot]', err);
  notify('Startup error: ' + msg, 'error', 8_000);

  const el = $$('.chat-area') ?? document.body;
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100%;gap:16px;padding:40px;text-align:center;
                font-family:'Outfit',sans-serif;color:var(--tx3,#9d9ab8)">
      <i class="fas fa-triangle-exclamation" style="font-size:40px;color:var(--red,#f87171)" aria-hidden="true"></i>
      <strong style="font-size:16px;color:var(--tx,#f0eeff)">WhisperWall couldn't start</strong>
      <p style="font-size:13px;max-width:360px;line-height:1.6">${Utils.escapeHtml(msg)}</p>
      <button type="button" onclick="location.reload()"
        style="padding:9px 20px;border-radius:8px;border:none;background:var(--acc,#7c6dfa);
               color:#fff;font-family:'Outfit',sans-serif;font-size:13px;cursor:pointer">
        Reload
      </button>
    </div>`;
}

/* ════════════════════════════════════════════════════════════════
   34. BOOT
════════════════════════════════════════════════════════════════ */
async function boot() {
  let bootTimeout = null;

  try {
    const FIREBASE_CONFIG = getFirebaseConfig();

    bootTimeout = setTimeout(() => {
      showFatalError(new Error(
        `Boot timed out after ${C.BOOT_TIMEOUT_MS / 1_000}s. ` +
        'Check your network connection and Firebase project status.'
      ));
    }, C.BOOT_TIMEOUT_MS);

    patchViewport();
    injectMobileEditorStyles();

    firebase.initializeApp(FIREBASE_CONFIG);
    State.db   = firebase.database();
    State.auth = firebase.auth();

    Theme.init();
    Wallpaper.init();
    Sound.init();
    Editor.init();
    Scroll.init();
    ContextMenu.init();
    Sidebar.init();
    initUsernameInput();
    initEvents();
    initHelpModal();
    Queue.load();
    await loadUserRoles();
    initConnection();

    const cred = await State.auth.signInAnonymously();
    clearTimeout(bootTimeout);
    bootTimeout = null;

    await Auth.onAnonymousAuth(cred.user);

    Utils.idle(() => Cleanup.run());

    const tid = setInterval(() => Messages.updateTimers(), 60_000);
    State._timers.push(tid);
    State.timerInterval = tid;

  } catch (err) {
    if (bootTimeout != null) clearTimeout(bootTimeout);
    showFatalError(err);
  }
}

document.addEventListener('DOMContentLoaded', boot);

/* ════════════════════════════════════════════════════════════════
   GLOBAL API
════════════════════════════════════════════════════════════════ */
window.register         = () => { if (State.db)       Auth.register();       };
window.sendMessage      = () => { if (State.username) Send.send();            };
window.loadMessages     = () => { if (State.db)       Messages.load();        };
window.changeWallpaper  = () => {                     Wallpaper.cycle();      };
window.clearWallpaper   = () => {                     Wallpaper.clearCustom(); };
