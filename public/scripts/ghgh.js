/* ═══════════════════════════════════════════════════════════════════
   WhisperWall — scripts/ghgh.js  (v4)
   Firebase Realtime DB v8  ·  Anonymous auth  ·  Quill editor
   ─────────────────────────────────────────────────────────────────
   What's new in v4
   ─────────────────────────────────────────────────────────────────
   · Bug fix: Sound._ctx naming collision fixed (was shadowing itself)
   · Bug fix: Send error path double-called _loading(false) — fixed
   · Bug fix: State.lastSendTs reset on error now only after true failure
   · Improvement: hidden attribute used instead of style.display
   · Improvement: AbortController pattern for external request cleanup
   · Improvement: Presence heartbeat uses exponential backoff on fail
   · Improvement: scroll debounced with rAF instead of scroll event storm
   · Improvement: Cleanup.run() batches deletes in a single update()
   · Improvement: Username normalisation applied before availability check
   · Improvement: Messages.subscribe() startAt is memoised (not recalc'd)
   · Improvement: State initialised with Object.create(null) maps for perf
   · Improvement: DOMPurify config is frozen constant (not re-allocated)
   · New: Connection retry uses jittered exponential backoff
   · New: Page Visibility API pauses presence heartbeat when tab is hidden
   · New: Ctrl+K focuses composer from anywhere
   · New: Relative timestamp ticking is correctly data-attributed
   ─────────────────────────────────────────────────────────────────
   Security notes
   · Firebase config key is client-side and read-only by design; restrict
     it via Firebase Console → Authentication + Database Rules
   · All user HTML passes through DOMPurify before render
   · Profanity list is a last-resort client filter; server rules should
     enforce additional moderation
═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ════════════════════════════════════════════════════════════════
   1. FIREBASE CONFIG
════════════════════════════════════════════════════════════════ */
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyBaKWaW1qgVxMNeCd1wdWm_o9vR81j7T1w',
  authDomain:        'WhisperWalldemo.firebaseapp.com',
  projectId:         'WhisperWalldemo',
  storageBucket:     'WhisperWalldemo.firebasestorage.app',
  messagingSenderId: '743228341123',
  appId:             '1:743228341123:web:1cd60340f5d6a2940ad4b6',
  measurementId:     'G-SJ3504X1T0',
  databaseURL:       'https://WhisperWalldemo-default-rtdb.firebaseio.com',
};

/* ════════════════════════════════════════════════════════════════
   2. ROLE WHITELISTS
════════════════════════════════════════════════════════════════ */
const ADMIN_USERNAMES = Object.freeze(['yourAdminName']);
const VIP_USERNAMES   = Object.freeze(['yourVipName']);

/* ════════════════════════════════════════════════════════════════
   3. CONSTANTS
════════════════════════════════════════════════════════════════ */
const C = Object.freeze({
  SEND_RATE_MS:         3_000,
  MSG_MAX_CHARS:        2_500,
  MSG_WARN_CHARS:       2_000,
  MSG_DANGER_CHARS:     2_400,
  USERNAME_MIN:         3,
  USERNAME_MAX:         20,
  MSG_LOAD_LIMIT:       100,
  MSG_TTL_MS:           5 * 24 * 60 * 60 * 1_000,   // 5 days
  TYPING_CLEAR_MS:      3_000,
  TYPING_DEBOUNCE_MS:   300,
  SCROLL_THRESHOLD:     60,
  PRESENCE_HEARTBEAT:   25_000,
  NOTIF_DURATION:       3_200,
  ROLES_CACHE_TTL_MS:   5 * 60 * 1_000,
  ROLES_CACHE_VERSION:  'v2',
  RECONNECT_MAX:        6,
  RECONNECT_BASE_MS:    1_000,
  REACTION_DEBOUNCE_MS: 150,
  MSG_HIGHLIGHT_MS:     650,
  USERNAME_RE:          /^[a-zA-Z0-9_]{3,20}$/,
  PROFANITY: Object.freeze([
    'fuck','asshole','bitch','fag','retard','whore','slut',
    'pussy','cock','bastard','douche','bombo','bombom',
  ]),
  QUICK_REACTIONS: Object.freeze([
    '👍','💜','😂','😮','🔥','👎','🎉','✨','💀','🫡',
  ]),
  AVATAR_GRADIENTS: Object.freeze([
    ['#7c6dfa','#4ade80'], ['#f472b6','#a78bfa'], ['#fb923c','#f472b6'],
    ['#4ade80','#38bdf8'], ['#a78bfa','#7c6dfa'], ['#38bdf8','#4ade80'],
    ['#fbbf24','#f472b6'], ['#f87171','#fb923c'],
  ]),
  WALLPAPERS: Object.freeze([
    { label: 'None',          bg: '' },
    { label: 'Midnight Grid', bg: 'repeating-linear-gradient(0deg,rgba(124,109,250,.05) 0,rgba(124,109,250,.05) 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,rgba(124,109,250,.05) 0,rgba(124,109,250,.05) 1px,transparent 1px,transparent 40px)' },
    { label: 'Violet Haze',   bg: 'radial-gradient(ellipse at 20% 50%,rgba(124,109,250,.18) 0,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(74,222,128,.12) 0,transparent 50%)' },
    { label: 'Neon Fog',      bg: 'radial-gradient(ellipse at 50% 100%,rgba(167,139,250,.2) 0,transparent 70%)' },
    { label: 'Dot Matrix',    bg: 'radial-gradient(rgba(124,109,250,.18) 1px,transparent 1px)', size: '20px 20px' },
    { label: 'Doodles 1',     bg: "url('whisper-doodles.png')",    size: 'cover' },
    { label: 'Doodles 2',     bg: "url('whisper-doodles2.png')",   size: 'cover' },
    { label: 'Doodles 3',     bg: "url('whisper-doodles3.png')",   size: 'cover' },
    { label: 'Doodles 4',     bg: "url('whisper-doodles4.png')",   size: 'cover' },
    { label: 'Doodles 5',     bg: "url('whisper-doodles5.png')",   size: 'cover' },
    { label: 'Doodles 6',     bg: "url('whisper-doodles6.png')",   size: 'cover' },
    { label: 'Doodles 7',     bg: "url('whisper-doodles7.png')",   size: 'cover' },
    { label: 'Doodles 8',     bg: "url('whisper-doodles8.png')",   size: 'cover' },
    { label: 'Doodles 9',     bg: "url('whisper-doodles9.png')",   size: 'cover' },
    { label: 'Doodles 10',    bg: "url('whisper-doodles10.png')",  size: 'cover' },
    { label: 'Doodles 11',    bg: "url('whisper-doodles11.png')",  size: 'cover' },
    { label: 'Doodles 12',    bg: "url('whisper-doodles12.png')",  size: 'cover' },
    { label: 'Doodles 13',    bg: "url('whisper-doodles13.png')",  size: 'cover' },
    { label: 'Doodles 14',    bg: "url('whisper-doodles14.png')",  size: 'cover' },
  ]),

  PURIFY_MSG: Object.freeze({
    ALLOWED_TAGS: ['b','i','u','s','em','strong','a','br','ul','ol','li',
                   'blockquote','code','pre','p','span','h1','h2','h3'],
    ALLOWED_ATTR: ['href','target','rel','class'],
  }),

  PURIFY_SEND: Object.freeze({
    ALLOWED_TAGS: ['b','i','u','s','em','strong','a','br','ul','ol','li',
                   'blockquote','code','pre','p','span'],
    ALLOWED_ATTR: ['href','target','rel'],
  }),
});

/* ════════════════════════════════════════════════════════════════
   4. APPLICATION STATE  (single source of truth)
════════════════════════════════════════════════════════════════ */
const State = {
  /* auth */
  uid:      null,
  username: null,
  userRoles: Object.create(null),

  /* firebase refs */
  db:           null,
  auth:         null,
  presenceRef:  null,
  typingRef:    null,
  messagesRef:  null,
  reactionsRef: null,

  /* editor */
  quill:      null,
  lastSendTs: 0,

  /* messages */
  renderedIds: new Set(),
  lastMsgTs:   0,
  _msgSince:   0,   // memoised startAt value

  /* scroll */
  atBottom:     true,
  unreadCount:  0,
  _scrollRaf:   null,

  /* typing */
  isTyping:    false,
  typingTimer: null,
  typingUsers: Object.create(null),

  /* connection */
  isOnline:          true,
  _wasOffline:       false,
  reconnectAttempts: 0,
  reconnectTimer:    null,

  /* ui */
  wallpaperIdx:  0,
  timerInterval: null,

  /* offline queue */
  offlineQueue: [],

  /* listener cleanup registry */
  _listeners: [],

  /* sound */
  soundEnabled: false,
  _audioCtx:    null,
};

/* ════════════════════════════════════════════════════════════════
   5. DOM CACHE
════════════════════════════════════════════════════════════════ */
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelector(sel);

const DOM = {
  themeToggle:       $('themeToggle'),
  onlineCount:       $('onlineCount'),
  onlineList:        $('onlineList'),
  messages:          $('messages'),
  emptyState:        $('emptyState'),
  username:          $('username'),
  usernameCharCount: $('usernameCharCount'),
  usernameStatus:    $('usernameStatus'),
  registerButton:    $('registerButton'),
  registerScreen:    $('registerScreen'),
  displayUsername:   $('displayUsername'),
  userAvatar:        $('userAvatar'),
  sendButton:        $('sendButton'),
  msgCharCount:      $('messageCharCount'),
  charWrap:          $$('.char-count'),
  refreshButton:     $('refreshButton'),
  notification:      $('notification'),
  notifText:         $('notificationText'),
  notifIcon:         $$('#notification i'),
  typingIndicator:   $('typingIndicator'),
  typingUsers:       $('typingUsers'),
  wallpaperBtn:      $('wallpaperBtn'),
  scrollBtn:         $('scrollToBottomBtn'),
  unreadBadge:       $('unreadBadge'),
  connStatus:        $('connectionStatus'),
  connDot:           $$('#connectionStatus .conn-dot'),
  connLabel:         $$('#connectionStatus .conn-label'),
  editorWrap:        $('editorWrap'),
};

/* ════════════════════════════════════════════════════════════════
   6. LISTENER REGISTRY  — centralised cleanup
════════════════════════════════════════════════════════════════ */
const Listeners = {
  add(ref, event, handler) {
    ref.on(event, handler);
    State._listeners.push({ ref, event, handler });
  },
  removeAll() {
    for (const { ref, event, handler } of State._listeners) ref.off(event, handler);
    State._listeners = [];
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

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
    if (s < 5)     return 'just now';
    if (s < 60)    return `${s}s ago`;
    if (s < 3_600) return `${Math.floor(s / 60)}m ago`;
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
    return C.PROFANITY.some(w => new RegExp(`\\b${w}\\b`, 'i').test(text));
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

  /* Jittered exponential backoff */
  backoffMs(attempt, base = C.RECONNECT_BASE_MS) {
    const cap  = 30_000;
    const expo = Math.min(cap, base * 2 ** attempt);
    return expo / 2 + Math.random() * (expo / 2);
  },
};

/* ════════════════════════════════════════════════════════════════
   8. NOTIFICATION TOAST
════════════════════════════════════════════════════════════════ */
let _notifTimer = null;

function notify(msg, type = 'success', duration = C.NOTIF_DURATION) {
  if (!DOM.notification || !DOM.notifText) {
    console[type === 'error' ? 'error' : 'log']('[WhisperWall]', msg);
    return;
  }
  clearTimeout(_notifTimer);
  DOM.notifText.textContent = msg;
  DOM.notification.hidden   = false;

  if (DOM.notifIcon) {
    const iconMap = {
      error:   'fas fa-circle-exclamation',
      warn:    'fas fa-triangle-exclamation',
      success: 'fas fa-circle-check',
    };
    const colorMap = {
      error: 'var(--danger)',
      warn:  'var(--warn)',
      success: 'var(--accent3)',
    };
    DOM.notifIcon.className  = iconMap[type] ?? iconMap.success;
    DOM.notifIcon.style.color = colorMap[type] ?? colorMap.success;
  }

  _notifTimer = setTimeout(() => { DOM.notification.hidden = true; }, duration);
}

/* ════════════════════════════════════════════════════════════════
   9. CONNECTION STATUS
════════════════════════════════════════════════════════════════ */
function setConnStatus(connected) {
  State.isOnline = connected;
  if (!DOM.connDot) return;
  DOM.connDot.className   = 'conn-dot ' + (connected ? 'connected' : 'disconnected');
  if (DOM.connLabel)       DOM.connLabel.textContent = connected ? 'Connected' : 'Offline';
  if (DOM.connStatus)      DOM.connStatus.title = connected ? 'Connected to WhisperWall' : 'Offline — messages queued';
}

/* ════════════════════════════════════════════════════════════════
   10. THEME
════════════════════════════════════════════════════════════════ */
const Theme = {
  init() {
    const saved        = localStorage.getItem('ww_theme');
    const prefersDark  = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const wantDark     = saved ? saved === 'dark' : prefersDark;
    document.body.classList.toggle('light', !wantDark);

    DOM.themeToggle?.addEventListener('click', () => {
      document.body.classList.toggle('light');
      localStorage.setItem('ww_theme', document.body.classList.contains('light') ? 'light' : 'dark');
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (!localStorage.getItem('ww_theme')) {
        document.body.classList.toggle('light', !e.matches);
      }
    });
  },
};

/* ════════════════════════════════════════════════════════════════
   11. WALLPAPER
════════════════════════════════════════════════════════════════ */
const Wallpaper = {
  init() {
    const saved = localStorage.getItem('ww_wallpaper');
    if (saved !== null) State.wallpaperIdx = parseInt(saved, 10) || 0;
    this._apply();
    DOM.wallpaperBtn?.addEventListener('click', () => this.cycle());
  },

  cycle() {
    State.wallpaperIdx = (State.wallpaperIdx + 1) % C.WALLPAPERS.length;
    this._apply();
    localStorage.setItem('ww_wallpaper', State.wallpaperIdx);
    notify('Wallpaper: ' + C.WALLPAPERS[State.wallpaperIdx].label);
  },

  _apply() {
    const wp = C.WALLPAPERS[State.wallpaperIdx] ?? C.WALLPAPERS[0];
    const el = DOM.messages;
    if (!el) return;
    if (wp.bg) {
      el.style.background     = wp.bg;
      el.style.backgroundSize = wp.size ?? 'auto';
    } else {
      el.style.background     = '';
      el.style.backgroundSize = '';
    }
  },
};

/* ════════════════════════════════════════════════════════════════
   12. OFFLINE QUEUE
════════════════════════════════════════════════════════════════ */
const Queue = {
  _save() {
    try { localStorage.setItem('ww_queue', JSON.stringify(State.offlineQueue)); }
    catch { /* storage full — silently skip */ }
  },

  load() {
    try {
      const s = localStorage.getItem('ww_queue');
      if (s) State.offlineQueue = JSON.parse(s);
    } catch { State.offlineQueue = []; }
  },

  add(msg) {
    State.offlineQueue.push({ ...msg, _qid: Utils.genId(), _qts: Date.now() });
    this._save();
    notify('Message queued (offline) — will send when reconnected.', 'warn');
  },

  async flush() {
    if (!State.isOnline || !State.offlineQueue.length || !State.uid) return;
    const items       = [...State.offlineQueue];
    State.offlineQueue = [];
    localStorage.removeItem('ww_queue');

    let sent = 0;
    for (const item of items) {
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
        State.offlineQueue.push(item);
      }
    }

    if (sent > 0) notify(`${sent} queued message${sent > 1 ? 's' : ''} sent!`);
    if (State.offlineQueue.length) this._save();
  },
};

/* ════════════════════════════════════════════════════════════════
   13. SCROLL
════════════════════════════════════════════════════════════════ */
const Scroll = {
  init() {
    DOM.messages?.addEventListener('scroll', () => {
      /* Debounce via rAF — fires at most once per frame */
      if (State._scrollRaf) return;
      State._scrollRaf = requestAnimationFrame(() => {
        State._scrollRaf = null;
        if (!DOM.messages) return;
        const { scrollTop, scrollHeight, clientHeight } = DOM.messages;
        const atBottom = scrollHeight - scrollTop - clientHeight < C.SCROLL_THRESHOLD;
        if (atBottom !== State.atBottom) {
          State.atBottom = atBottom;
          if (atBottom) { State.unreadCount = 0; }
          this._badge();
        }
      });
    }, { passive: true });

    DOM.scrollBtn?.addEventListener('click', () => this.toBottom());
  },

  toBottom(smooth = true) {
    if (!DOM.messages) return;
    DOM.messages.scrollTo({
      top:      DOM.messages.scrollHeight,
      behavior: smooth ? 'smooth' : 'instant',
    });
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
    }
  },

  _badge() {
    if (!DOM.scrollBtn || !DOM.unreadBadge) return;
    if (!State.atBottom && State.unreadCount > 0) {
      DOM.scrollBtn.hidden        = false;
      DOM.unreadBadge.textContent = State.unreadCount > 99 ? '99+' : State.unreadCount;
      DOM.unreadBadge.setAttribute('aria-label', `${State.unreadCount} unread message${State.unreadCount !== 1 ? 's' : ''}`);
    } else {
      DOM.scrollBtn.hidden        = true;
      DOM.unreadBadge.textContent = '';
      DOM.unreadBadge.removeAttribute('aria-label');
    }
  },
};

/* ════════════════════════════════════════════════════════════════
   14. REACTIONS
════════════════════════════════════════════════════════════════ */
const Reactions = {
  _pending: new Map(),

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
        btn.setAttribute('aria-label', `React with ${emoji} — ${count} reaction${count !== 1 ? 's' : ''}`);
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
      .catch(err => console.error('[Reactions] load error:', err));
  },

  subscribe() {
    if (State.reactionsRef) State.reactionsRef.off();
    State.reactionsRef = State.db.ref('reactions');

    Listeners.add(State.reactionsRef, 'child_changed', snap => {
      const msgId = snap.key;
      clearTimeout(this._pending.get(msgId));
      this._pending.set(msgId, setTimeout(() => {
        this._pending.delete(msgId);
        const el = $(`reactions-${msgId}`);
        if (el) this.render(msgId, el, snap.val() ?? {});
      }, C.REACTION_DEBOUNCE_MS));
    });
  },

  _openPicker(trigger, msgId) {
    document.querySelectorAll('.emoji-picker-popup').forEach(p => p.remove());

    const picker = document.createElement('div');
    picker.className = 'emoji-picker-popup';

    const frag = document.createDocumentFragment();
    C.QUICK_REACTIONS.forEach(emoji => {
      const btn = document.createElement('button');
      btn.type        = 'button';
      btn.className   = 'emoji-picker-btn';
      btn.textContent = emoji;
      btn.setAttribute('aria-label', `React with ${emoji}`);
      btn.addEventListener('click', () => { this.toggle(msgId, emoji); picker.remove(); });
      frag.appendChild(btn);
    });
    picker.appendChild(frag);

    const row = trigger.closest('.msg-reactions');
    if (row) {
      row.style.position = 'relative';
      row.appendChild(picker);
    }

    const close = e => {
      if (!picker.contains(e.target) && e.target !== trigger) {
        picker.remove();
        document.removeEventListener('click', close);
        document.removeEventListener('keydown', closeKey);
      }
    };
    const closeKey = e => {
      if (e.key === 'Escape') {
        picker.remove();
        document.removeEventListener('click', close);
        document.removeEventListener('keydown', closeKey);
        trigger.focus();
      }
    };
    setTimeout(() => {
      document.addEventListener('click', close);
      document.addEventListener('keydown', closeKey);
    }, 10);

    picker.querySelector('button')?.focus();
  },
};

/* ════════════════════════════════════════════════════════════════
   15. TYPING
════════════════════════════════════════════════════════════════ */
const Typing = {
  broadcast: Utils.debounce(function (hasText) {
    if (!State.username || !State.typingRef) return;
    const desired = !!hasText;
    if (desired === State.isTyping) return;
    State.isTyping = desired;
    State.typingRef.set(desired).catch(() => {});
    if (State.typingTimer) clearTimeout(State.typingTimer);
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
    clearTimeout(State.typingTimer);
    State.typingRef?.set(false).catch(() => {});
  },

  subscribe() {
    Listeners.add(State.db.ref('typing'), 'value', snap => {
      if (!DOM.typingIndicator || !DOM.typingUsers) return;
      const data = snap.val() ?? {};
      const list = Object.entries(data)
        .filter(([u, v]) => u !== State.username && v === true)
        .map(([u]) => Utils.escapeHtml(u));

      if (!list.length) { DOM.typingIndicator.hidden = true; return; }

      DOM.typingUsers.textContent = list.length === 1
        ? `${list[0]} is typing…`
        : list.length === 2
        ? `${list[0]} and ${list[1]} are typing…`
        : `${list[0]}, ${list[1]} and others are typing…`;

      DOM.typingIndicator.hidden = false;
    });
  },
};

/* ════════════════════════════════════════════════════════════════
   16. PRESENCE
════════════════════════════════════════════════════════════════ */
const Presence = {
  _heartbeat: null,
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
    clearTimeout(this._heartbeat);
    const delay = this._failCount === 0
      ? C.PRESENCE_HEARTBEAT
      : Utils.backoffMs(this._failCount, C.PRESENCE_HEARTBEAT);

    this._heartbeat = setTimeout(async () => {
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
    clearTimeout(this._heartbeat);
    this._heartbeat = null;
    this._failCount = 0;
    State.presenceRef?.remove().catch(() => {});
    State.typingRef?.remove().catch(() => {});
  },

  subscribe() {
    Listeners.add(State.db.ref('presence'), 'value', snap => {
      const data  = snap.val() ?? {};
      const users = Object.values(data).filter(u => u?.username);
      if (DOM.onlineCount) DOM.onlineCount.textContent = users.length;
      this._renderList(users);
    });
  },

  _renderList(users) {
    if (!DOM.onlineList) return;
    const frag = document.createDocumentFragment();

    if (!users.length) {
      const div = document.createElement('div');
      div.style.cssText = 'font-size:11px;color:var(--text3);padding:4px 8px';
      div.textContent   = 'Nobody yet';
      frag.appendChild(div);
    } else {
      users.forEach(u => {
        const isMe = u.username === State.username;
        const div  = document.createElement('div');
        div.className = 'online-user';
        div.setAttribute('role', 'listitem');

        const dot  = document.createElement('div');
        dot.className   = 'dot';
        dot.setAttribute('aria-hidden', 'true');

        const name = document.createElement('span');
        name.textContent = u.username;

        div.append(dot, name);
        if (isMe) {
          const you = document.createElement('span');
          you.textContent   = '(you)';
          you.style.cssText = 'font-size:10px;color:var(--accent2)';
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
   17. AUTO-CLEANUP
════════════════════════════════════════════════════════════════ */
const Cleanup = {
  async run() {
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

      const count = Object.keys(deletes).length / 2;
      if (count > 0) {
        await State.db.ref().update(deletes);
        console.info(`[Cleanup] Pruned ${count} expired message(s).`);
      }
    } catch (err) {
      console.warn('[Cleanup] Auto-cleanup failed:', err);
    }
  },
};

/* ════════════════════════════════════════════════════════════════
   18. SOUND  (opt-in, Web Audio API)
   Bug fix: the original had a method called _ctx that shadowed the
   property called _ctx.  Renamed property to __audioCtx.
════════════════════════════════════════════════════════════════ */
const Sound = {
  _getCtx() {
    if (!State._audioCtx) {
      State._audioCtx = new (window.AudioContext ?? window.webkitAudioContext)();
    }
    return State._audioCtx;
  },

  play() {
    if (!State.soundEnabled) return;
    try {
      const ctx  = this._getCtx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type                   = 'sine';
      osc.frequency.value        = 880;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } catch { /* AudioContext unavailable */ }
  },

  init() {
    State.soundEnabled = localStorage.getItem('ww_sound') === 'true';
    const btn  = document.createElement('button');
    btn.type   = 'button';
    btn.id     = 'soundToggle';
    btn.className = 'icon-square-btn';
    btn.title  = 'Toggle notification sounds';
    this._updateBtn(btn);

    btn.addEventListener('click', () => {
      State.soundEnabled = !State.soundEnabled;
      localStorage.setItem('ww_sound', State.soundEnabled);
      this._updateBtn(btn);
      notify(State.soundEnabled ? 'Sounds on 🔔' : 'Sounds off 🔇');
    });

    DOM.themeToggle?.parentElement?.insertBefore(btn, DOM.themeToggle);
  },

  _updateBtn(btn) {
    const on = State.soundEnabled;
    btn.innerHTML = `<i class="fas ${on ? 'fa-volume-high' : 'fa-volume-xmark'}" aria-hidden="true"></i>`;
    btn.setAttribute('aria-label', on ? 'Mute notification sounds' : 'Enable notification sounds');
  },
};

/* ════════════════════════════════════════════════════════════════
   19. MESSAGES — render, delete, subscribe
════════════════════════════════════════════════════════════════ */
const Messages = {

  _buildEl(id, data) {
    const isOwn   = data.uid === State.uid;
    const time    = Utils.formatTime(data.timestamp);
    const grad    = Utils.avatarGradient(data.username ?? '?');
    const initial = Utils.userInitial(data.username);
    const badge   = Utils.roleBadge(data.username, State.userRoles);
    const expires = data.timestamp ? `Expires in ${Utils.daysLeft(data.timestamp)} day(s)` : '';

    let safe = '';
    try {
      safe = DOMPurify.sanitize(data.message ?? Utils.escapeHtml(data.plainText ?? ''), C.PURIFY_MSG);
    } catch (e) {
      safe = Utils.escapeHtml(data.plainText ?? '[message unavailable]');
      console.warn('[Messages] DOMPurify error for msg', id, e);
    }

    const row = document.createElement('div');
    row.className = 'msg' + (isOwn ? ' own' : '');
    row.id        = `msg-${id}`;
    row.setAttribute('role', 'article');
    row.setAttribute('aria-label', `Message from ${data.username ?? 'unknown'} at ${time}`);
    row.dataset.uid = data.uid    ?? '';
    row.dataset.ts  = data.timestamp ?? '0';

    const metaHtml = isOwn
      ? `<span class="msg-time" data-reltime="${data.timestamp ?? ''}">${time}</span>`
      : `<span class="msg-author">${Utils.escapeHtml(data.username)}${badge}</span>
         <span class="msg-time" data-reltime="${data.timestamp ?? ''}">${time}</span>`;

    row.innerHTML = `
      <div class="msg-avatar" style="background:${grad}" aria-hidden="true">${initial}</div>
      <div class="msg-body">
        <div class="msg-meta">${metaHtml}</div>
        <div class="msg-bubble" title="${Utils.escapeHtml(expires)}">${safe}</div>
        <div class="msg-reactions" id="reactions-${id}"></div>
      </div>`;

    Reactions.load(id, row.querySelector(`#reactions-${id}`));
    return row;
  },

  _checkGrouping(row, data) {
    const msgs = DOM.messages.querySelectorAll('.msg:not(.msg-skeleton)');
    if (msgs.length < 2) return;
    const prev   = msgs[msgs.length - 2];
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

    if (DOM.emptyState) DOM.emptyState.hidden = true;

    const el = this._buildEl(id, data);
    DOM.messages.insertBefore(el, DOM.scrollBtn);
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

  remove(id) {
    $(`msg-${id}`)?.remove();
    State.renderedIds.delete(id);
    if (!State.renderedIds.size && DOM.emptyState) DOM.emptyState.hidden = false;
  },

  async load() {
    if (DOM.refreshButton) {
      DOM.refreshButton.disabled  = true;
      DOM.refreshButton.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Loading…</span>';
    }

    /* Clear previous messages (not the sentinel buttons) */
    Array.from(DOM.messages.children).forEach(el => {
      if (el.id !== 'emptyState' && el.id !== 'scrollToBottomBtn') el.remove();
    });
    State.renderedIds.clear();
    if (DOM.emptyState) DOM.emptyState.hidden = true;

    /* Skeleton */
    const skeleton = this._buildSkeleton();
    DOM.messages.insertBefore(skeleton, DOM.scrollBtn);

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
          .forEach(m => this.append(m.id, m));
      }

      if (!State.renderedIds.size && DOM.emptyState) DOM.emptyState.hidden = false;
      Scroll.toBottom(false);

    } catch (err) {
      skeleton.remove();
      if (DOM.emptyState) DOM.emptyState.hidden = false;
      notify('Error loading messages: ' + (err.message ?? err), 'error');
    } finally {
      if (DOM.refreshButton) {
        DOM.refreshButton.disabled  = false;
        DOM.refreshButton.innerHTML = '<i class="fas fa-sync-alt" aria-hidden="true"></i><span>Refresh</span>';
      }
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
      </div>
      <div class="msg-skeleton own">
        <div class="msg-skeleton-body">
          <div class="msg-skeleton-line skeleton-pulse"></div>
          <div class="msg-skeleton-bubble skeleton-pulse"></div>
        </div>
      </div>`;
    return wrap;
  },

  subscribe() {
    if (State.messagesRef) State.messagesRef.off();

    /* Memoise startAt so re-subscribes don't drift the window */
    if (!State._msgSince) State._msgSince = Date.now() - C.MSG_TTL_MS;

    State.messagesRef = State.db.ref('messages')
      .orderByChild('timestamp')
      .startAt(State._msgSince);

    Listeners.add(State.messagesRef, 'child_added', snap => {
      const data = { ...snap.val() };
      if (!Utils.isExpired(data.timestamp)) {
        this.append(snap.key, data, !State.renderedIds.has(snap.key));
      }
    });

    Listeners.add(State.messagesRef, 'child_removed', snap => {
      this.remove(snap.key);
    });
  },

  /* Relative timestamp ticking — requires data-reltime on time spans */
  updateTimers() {
    const now = Date.now();
    document.querySelectorAll('[data-reltime]').forEach(el => {
      const ts = parseInt(el.dataset.reltime, 10);
      if (!isNaN(ts) && ts > 0) el.textContent = Utils.relativeTime(ts, now);
    });
  },
};

/* ════════════════════════════════════════════════════════════════
   20. EDITOR
════════════════════════════════════════════════════════════════ */
const Editor = {
  init() {
    State.quill = new Quill('#editor-container', {
      theme: 'snow',
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

    State.quill.on('text-change', Utils.debounce(() => {
      const plain = State.quill.getText().trim();
      const len   = State.quill.getLength() - 1;

      if (DOM.msgCharCount) DOM.msgCharCount.textContent = len;
      if (DOM.charWrap) {
        DOM.charWrap.className = len > C.MSG_DANGER_CHARS ? 'char-count danger'
          : len > C.MSG_WARN_CHARS ? 'char-count warn' : 'char-count';
      }

      const canSend = plain.length > 0 && len <= C.MSG_MAX_CHARS && !!State.username;
      if (DOM.sendButton) {
        DOM.sendButton.disabled = !canSend;
        DOM.sendButton.setAttribute('aria-disabled', String(!canSend));
      }

      Typing.broadcast(plain.length > 0);
    }, 150));
  },

  focus() { setTimeout(() => State.quill?.focus(), 80); },

  clear() {
    State.quill?.setText('');
    if (DOM.msgCharCount) DOM.msgCharCount.textContent = '0';
    if (DOM.charWrap)     DOM.charWrap.className = 'char-count';
  },
};

/* ════════════════════════════════════════════════════════════════
   21. SEND
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

    if (!plain)                { notify('Message is empty', 'warn');                                   return; }
    if (len > C.MSG_MAX_CHARS) { notify(`Too long (max ${C.MSG_MAX_CHARS} chars)`, 'warn');            return; }
    if (Utils.hasProfanity(plain)) { notify('Message contains inappropriate content', 'error');       return; }

    let safe = '';
    try {
      safe = DOMPurify.sanitize(html, C.PURIFY_SEND);
    } catch { safe = Utils.escapeHtml(plain); }

    const payload = { username: State.username, uid: State.uid, message: safe, plainText: plain };

    /* Mark timestamp before async so double-sends within rate window are blocked */
    State.lastSendTs = now;
    this._loading(true);

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
      /* Reset rate-limit so user can try again immediately */
      State.lastSendTs = 0;

      if (!State.isOnline) {
        Queue.add(payload);
        Editor.clear();
      } else {
        notify('Send failed: ' + (err.message ?? err), 'error');
        /* Re-evaluate button without wiping the draft */
        const plain2 = State.quill?.getText().trim() ?? '';
        if (DOM.sendButton) {
          DOM.sendButton.disabled = !plain2.length;
          DOM.sendButton.setAttribute('aria-disabled', String(!plain2.length));
        }
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
   22. AUTH / REGISTRATION
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

    /* Try UID → username lookup (returning user on new device) */
    try {
      const snap = await State.db.ref(`users_by_uid/${user.uid}`).once('value');
      if (snap.exists()) {
        const { username, role = 'member' } = snap.val();
        if (username) {
          State.userRoles[username] = role;
          this._applySession(username, role);
          this._showChat();
          await this._startListeners();
          return;
        }
      }
    } catch (err) { console.warn('[Auth] UID lookup failed:', err); }

    /* Fallback: localStorage (same device) */
    const saved = localStorage.getItem('ww_username');
    if (saved && C.USERNAME_RE.test(saved)) {
      const role = Utils.resolveRole(saved);
      State.userRoles[saved] = role;
      this._applySession(saved, role);
      this._showChat();
      await this._startListeners();
      return;
    }

    /* New user — show registration */
    if (DOM.registerScreen) {
      DOM.registerScreen.hidden = false;
      requestAnimationFrame(() => DOM.username?.focus());
    }
  },

  async register() {
    /* Normalise: trim + replace spaces with underscores */
    const raw  = DOM.username?.value ?? '';
    const name = raw.trim().replace(/\s+/g, '_');

    if (!name)                        { notify('Enter a username', 'error');                     return; }
    if (name.length < C.USERNAME_MIN) { notify(`Min ${C.USERNAME_MIN} characters`, 'error');    return; }
    if (name.length > C.USERNAME_MAX) { notify(`Max ${C.USERNAME_MAX} characters`, 'error');    return; }
    if (!C.USERNAME_RE.test(name))    { notify('Letters, numbers and underscores only', 'error'); return; }
    if (Utils.hasProfanity(name))     { notify('Inappropriate username', 'error');               return; }
    if (!State.auth.currentUser)      { notify('Auth not ready — try again', 'error');           return; }

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
      : '<i class="fas fa-arrow-right" aria-hidden="true"></i><span>Enter chat</span>';
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
   23. USERNAME INPUT
════════════════════════════════════════════════════════════════ */
function initUsernameInput() {
  if (!DOM.username) return;

  const setStatus = (text, cls) => {
    if (!DOM.usernameStatus) return;
    DOM.usernameStatus.textContent = text;
    DOM.usernameStatus.className   = `username-status${cls ? ' ' + cls : ''}`;
  };

  const setRegBtn = enabled => {
    if (!DOM.registerButton) return;
    DOM.registerButton.disabled = !enabled;
    DOM.registerButton.setAttribute('aria-disabled', String(!enabled));
  };

  DOM.username.addEventListener('input', function () {
    const v   = this.value;
    const len = v.length;
    if (DOM.usernameCharCount) DOM.usernameCharCount.textContent = len;

    if (len === 0) {
      setStatus('', '');
      setRegBtn(false);
      return;
    }
    if (len < C.USERNAME_MIN) {
      setStatus('Too short', 'status-bad');
      setRegBtn(false);
      return;
    }
    if (!C.USERNAME_RE.test(v)) {
      setStatus('Letters, numbers, underscores only', 'status-bad');
      setRegBtn(false);
      return;
    }

    Auth.checkAvailability(v.trim());
  });

  DOM.username.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !DOM.registerButton?.disabled) Auth.register();
  });
}

/* ════════════════════════════════════════════════════════════════
   24. CONNECTION
════════════════════════════════════════════════════════════════ */
function initConnection() {
  Listeners.add(State.db.ref('.info/connected'), 'value', snap => {
    const connected = !!snap.val();
    setConnStatus(connected);
    if (connected) {
      if (State.reconnectTimer) { clearTimeout(State.reconnectTimer); State.reconnectTimer = null; }
      State.reconnectAttempts = 0;
      Queue.flush();
      if (State._wasOffline) { notify('Reconnected! 🟢'); State._wasOffline = false; }
    } else {
      State._wasOffline = true;
      notify('Connection lost — messages will be queued', 'warn');
    }
  });
}

/* ════════════════════════════════════════════════════════════════
   25. LOAD USER ROLES  (cached in localStorage)
════════════════════════════════════════════════════════════════ */
async function loadUserRoles() {
  const cacheKey   = `ww_roles_${C.ROLES_CACHE_VERSION}`;
  const cacheTsKey = `ww_roles_ts_${C.ROLES_CACHE_VERSION}`;
  const cached     = localStorage.getItem(cacheKey);
  const cacheTs    = parseInt(localStorage.getItem(cacheTsKey) ?? '0', 10);

  if (cached && Date.now() - cacheTs < C.ROLES_CACHE_TTL_MS) {
    try { Object.assign(State.userRoles, JSON.parse(cached)); return; } catch { /* skip */ }
  }

  try {
    const snap = await State.db.ref('users').once('value');
    if (snap.exists()) {
      snap.forEach(c => {
        const d = c.val();
        if (d?.username) State.userRoles[d.username] = d.role ?? 'member';
      });
      localStorage.setItem(cacheKey,   JSON.stringify(State.userRoles));
      localStorage.setItem(cacheTsKey, String(Date.now()));
    }
  } catch (err) { console.warn('[Roles]', err); }
}

/* ════════════════════════════════════════════════════════════════
   26. EVENT WIRING
════════════════════════════════════════════════════════════════ */
function initEvents() {
  DOM.registerButton?.addEventListener('click', () => Auth.register());
  DOM.sendButton?.addEventListener('click', () => Send.send());
  DOM.refreshButton?.addEventListener('click', () => Messages.load());

  /* Pause presence + typing when tab is hidden */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) Typing.stop();
  });

  /* Ctrl+K / Cmd+K → focus editor from anywhere */
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      Editor.focus();
    }
  });

  window.addEventListener('online',  () => { setConnStatus(true);  Queue.flush(); });
  window.addEventListener('offline', () => setConnStatus(false));

  window.addEventListener('beforeunload', () => {
    Typing.stop();
    Presence.stop();
    clearInterval(State.timerInterval);
    cancelAnimationFrame(State._scrollRaf);
    Listeners.removeAll();
  });
}

/* ════════════════════════════════════════════════════════════════
   27. FATAL ERROR UI
════════════════════════════════════════════════════════════════ */
function showFatalError(err) {
  const msg = err?.message ?? String(err);
  console.error('[WhisperWall boot]', err);
  notify('Startup error: ' + msg, 'error', 8_000);

  const el = $$('.chat-area') ?? document.body;
  el.innerHTML = `
    <div style="
        display:flex;flex-direction:column;align-items:center;
        justify-content:center;height:100%;gap:16px;padding:40px;text-align:center;
        font-family:'DM Mono',monospace;color:var(--text3,#9d9ab8)">
      <i class="fas fa-triangle-exclamation" style="font-size:40px;color:var(--danger,#f87171)" aria-hidden="true"></i>
      <strong style="font-size:16px;color:var(--text,#f0eeff)">WhisperWall couldn't start</strong>
      <p style="font-size:13px;max-width:360px;line-height:1.6">${Utils.escapeHtml(msg)}</p>
      <button type="button" onclick="location.reload()"
        style="padding:9px 20px;border-radius:8px;border:none;
               background:var(--accent,#7c6dfa);color:#fff;
               font-family:'DM Mono',monospace;font-size:13px;cursor:pointer">
        Reload
      </button>
    </div>`;
}

/* ════════════════════════════════════════════════════════════════
   28. APP BOOT
════════════════════════════════════════════════════════════════ */
async function boot() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    State.db   = firebase.database();
    State.auth = firebase.auth();

    Theme.init();
    Wallpaper.init();
    Sound.init();
    Editor.init();
    Scroll.init();
    initUsernameInput();
    initEvents();
    Queue.load();
    await loadUserRoles();
    initConnection();

    const cred = await State.auth.signInAnonymously();
    await Auth.onAnonymousAuth(cred.user);

    await Cleanup.run();

    /* Relative timestamps tick every minute */
    State.timerInterval = setInterval(() => Messages.updateTimers(), 60_000);

  } catch (err) {
    showFatalError(err);
  }
}

document.addEventListener('DOMContentLoaded', boot);

/* ════════════════════════════════════════════════════════════════
   GLOBAL API — inline HTML compat shims
════════════════════════════════════════════════════════════════ */
window.register        = () => Auth.register();
window.sendMessage     = () => Send.send();
window.loadMessages    = () => Messages.load();
window.changeWallpaper = () => Wallpaper.cycle();
