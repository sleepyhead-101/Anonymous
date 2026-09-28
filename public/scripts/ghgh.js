/* ═══════════════════════════════════════════════════════════════════
   WhisperWall — scripts/app.js  (v11.1 — bug-fix + hardening pass on v11.0)
   Firebase Realtime DB v8  ·  Anonymous auth  ·  Quill editor

   CHANGES IN v11.1 vs v11.0
   ─────────────────────────
   FIXES
   · Timestamp updater no longer dies after leaving/switching a space.
   · Offline queue: items are no longer discarded on reload (uid is not
     persisted, so it is no longer required on load) and are only removed
     after each is confirmed sent — a tab close mid-flush loses nothing.
   · Reactions now sync live for the first reaction (child_added) and the
     last removal (child_removed), not just child_changed.
   · Banned/removed users and deleted spaces now eject a live session.
   · Send button is no longer force-enabled with an empty editor.
   · "Clear Chat" no longer silently stops live messages.
   SECURITY / ROBUSTNESS
   · Invite re-checked at join time; pasted images capped at 400 KB;
     profanity filter folds common evasions; changelog claims corrected.
   PERFORMANCE
   · One bulk reactions read instead of one per message; live message
     query bounded with limitToLast; relativeTime cache now actually hits.

   CHANGES IN v11.0 vs v10.1
   ─────────────────────────
   SECURITY
   · [CORRECTED in v11.1] The message payload STILL includes uid. Database
     rules must enforce newData.child('uid').val() === auth.uid so a client
     cannot spoof another sender.
   · [CORRECTED in v11.1] No constant-time invite comparison exists (the earlier
     changelog claimed one). Invite validation happens server-side via the
     invites/ node and database rules.
   · domainId is validated against a safe pattern before any DB reads
     to prevent path-traversal-style inputs from being used as keys.
   · Custom wallpaper Data URLs are validated for image MIME prefix
     before localStorage write; truncated/corrupt values are discarded
     on read.
   · Queue items written to localStorage are now stripped of any uid
     field before persistence so queued messages never embed identity
     outside the Firebase session.

   CORRECTNESS / BUG FIXES
   · Domains.resolveInvite: invite resolution was not guarded against
     a null inviteSnap.val() returning a domainId of undefined, which
     could cause a spurious read on `domains/undefined`. Added explicit
     typeof check.
   · Messages.load: skeleton was appended directly to DOM.messages,
     but if the element is null (page not fully rendered) this threw
     a silent TypeError. Now guarded.
   · Reactions._openPicker: event listeners were added to `document`
     inside a setTimeout but never cleaned up if the picker was removed
     via the Reactions.render cycle before the timeout fired. Added
     a guard flag (_pickerAborted) so stale listeners self-cancel.
   · Typing.broadcast: the debounce wrapper closes over the original
     `this`, but was being called as `Typing.broadcast(...)` directly
     which loses `this`. Bound explicitly in subscribe() and broadcast()
     call sites.
   · MessageEdit.start: the blur → cancel path could fire if focus
     moved to a Save confirmation dialog (e.g. the ContextMenu), which
     cancelled the in-progress edit silently. Now checks
     `document.activeElement` with a longer RAF delay to allow dialog
     interactions.
   · Queue.flush: failed items were re-prepended but the queue save
     happened before the flush loop finished, so a second concurrent
     flush (race with reconnect events) could double-send recovered
     items. Added a per-domain lock key checked before each push.
   · Messages._buildEl: `data.alias` was rendered without escaping
     in the title attribute of `msg-avatar` (potential XSS via
     crafted alias). Now escaped.
   · Cleanup.run: `deletes` object keys were built before checking
     `count > 0`, meaning an empty `deletes` object was passed to
     `update({})` on every owner session start. Added early return.
   · Sound.play: AudioContext nodes (OscillatorNode + GainNode) were
     created but never explicitly disconnected after stopping, leaking
     references in some browser GC implementations. Added explicit
     disconnect in an osc.onended handler.
   · Presence._scheduleHeartbeat: heartbeat timer was pushed to
     State._timers for bulk teardown, but _scheduleHeartbeat uses its
     own internal timer reference; the bulk teardown path called
     clearInterval on a setTimeout id, which is a no-op but confusing.
     Heartbeat timer management is now entirely internal to Presence.
   · Router.submitJoinAlias: if _pendingJoin was null (e.g. user
     navigated back and re-submitted), the function returned silently
     without user feedback. Now shows a recoverable error message.
   · Wallpaper._apply: backgroundImage was set to an empty string when
     clearing, but backgroundSize and backgroundRepeat were only reset
     when _customWallpaper was set. Other CSS properties (background)
     set in the preset path were never cleared when cycling back to
     index 0 (None). Now always resets all six properties at the top.

   PERFORMANCE
   · Messages.subscribe child_added listener now skips DOM work
     entirely when !State._initialLoadDone, since Messages.load()
     handles the initial batch synchronously. Prevents double-render
     of the first MSG_LOAD_LIMIT messages.
   · Reactions.render uses a keyed-update strategy: existing reaction
     buttons are updated in place rather than replaceChildren() on
     every child_changed event, eliminating forced layout thrash on
     active messages.
   · relativeTime is now memoised per-second bucket so 100 visible
     messages don't each re-calculate the same string in updateTimers.
   · MySpaces.list() now caches its parse result for the lifetime of
     the current JS task to prevent repeated JSON.parse on rapid
     re-renders of the picker.
   · avatarGradient hash is cached in a WeakMap-like Map keyed by the
     alias string to avoid recalculating on every message render.
   · Wallpaper custom Data URL is now stored in a module-level var
     and only re-read from localStorage on boot, not on every _apply.

   MAINTAINABILITY / CODE QUALITY
   · All magic numbers extracted into C (ALIAS_DEBOUNCE_MS, EDIT_BLUR_DELAY_MS,
     AVATAR_CACHE_MAX, QUEUE_FLUSH_LOCK_MS).
   · Replaced the `getter with side-effect` anti-pattern on DOM.charWrap
     with a plain lazy-init function `getCharWrap()`.
   · `Utils.genInviteCode` defensive branch for missing crypto.getRandomValues
     now logs a console.warn (silent fallback to Math.random is a security
     downgrade that should be visible in dev).
   · Listener registry now stores a `label` for each entry so
     Listeners.dump() can aid debugging in dev mode.
   · Extracted `buildMenuBtn` out of ContextMenu._open into a named
     factory so it can be unit-tested independently.
   · Removed `window.__wwQuill` assignment (debug leak into global scope).
   · Replaced manual `for...of` with array destructuring and early-return
     patterns throughout for readability.
   · `initEvents` split into smaller named functions:
     initRoutingEvents, initChatEvents, initWindowEvents.
   · Consistent null-coalescing throughout (removed mixed ?. / &&
     patterns for the same optional chain).
   · JSDoc `@param`/`@returns` added to every exported-to-window function.
   · Boot timeout now logs the elapsed time for diagnosis.

   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ════════════════════════════════════════════════════════════════
   1. FIREBASE CONFIG
════════════════════════════════════════════════════════════════ */
function getFirebaseConfig() {
  const cfg = window.__WW_CONFIG;
  if (!cfg || typeof cfg !== 'object') {
    throw new Error(
      'WhisperWall: window.__WW_CONFIG is missing. ' +
      'Inject it server-side before app.js loads.'
    );
  }
  const required = ['apiKey', 'authDomain', 'projectId', 'databaseURL'];
  for (const key of required) {
    if (!cfg[key]) throw new Error(`WhisperWall: window.__WW_CONFIG.${key} is missing.`);
  }
  return cfg;
}

/* ════════════════════════════════════════════════════════════════
   2. CONSTANTS
════════════════════════════════════════════════════════════════ */
const C = Object.freeze({
  SEND_RATE_MS:           3_000,
  MSG_MAX_CHARS:          2_500,
  MSG_WARN_CHARS:         2_000,
  MSG_DANGER_CHARS:       2_400,

  ALIAS_MIN:              3,
  ALIAS_MAX:              20,
  ALIAS_RE:               /^[a-zA-Z0-9_]{3,20}$/,

  DOMAIN_NAME_MIN:        3,
  DOMAIN_NAME_MAX:        40,

  /* Domain ID safety: Firebase push-keys are -[A-Za-z0-9_] up to 20 chars */
  DOMAIN_ID_RE:           /^-?[A-Za-z0-9_]{1,22}$/,

  INVITE_CODE_LEN:        8,
  INVITE_CODE_ALPHABET:   'ABCDEFGHJKMNPQRSTUVWXYZ23456789',

  DEFAULT_MSG_TTL_DAYS:   5,
  MIN_MSG_TTL_DAYS:       1,
  MAX_MSG_TTL_DAYS:       30,

  MSG_LOAD_LIMIT:         100,
  MSG_LOAD_PAGE:          50,

  TYPING_CLEAR_MS:        3_000,
  TYPING_DEBOUNCE_MS:     150,
  ALIAS_DEBOUNCE_MS:      300,
  SCROLL_THRESHOLD:       60,
  SCROLL_TOP_LOAD:        120,
  PRESENCE_HEARTBEAT:     25_000,
  NOTIF_DURATION:         3_200,
  RECONNECT_MAX:          6,
  RECONNECT_BASE_MS:      1_000,
  REACTION_DEBOUNCE_MS:   150,
  MSG_HIGHLIGHT_MS:       650,
  CONTEXT_MENU_MS:        400,
  BOOT_TIMEOUT_MS:        10_000,
  LOADOLDER_DEBOUNCE_MS:  200,
  QUEUE_PRUNE_TTL_MS:     5 * 24 * 60 * 60 * 1_000,
  QUEUE_FLUSH_LOCK_MS:    5_000,

  EDIT_BLUR_DELAY_MS:     200,   /* was RAF-only; needs enough time for dialog focus */
  PASTE_IMG_MAX_BYTES:    400 * 1024,  /* pasted image cap — keeps writes under RTDB limits */
  MEMBERSHIP_CHECK_MS:    20_000,      /* how often to verify we are still a member */
  AVATAR_CACHE_MAX:       500,   /* max cached gradient strings */

  CUSTOM_WP_STORAGE_KEY:  'ww_custom_wallpaper',
  MY_SPACES_KEY:          'ww_my_spaces',

  URL_RE:                 /https?:\/\/[^\s<>"']+/g,
  IS_MAC:                 /Mac|iPod|iPhone|iPad/.test(navigator.platform),
  IS_MOBILE:              /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),
  IS_IOS:                 /iPhone|iPad|iPod/i.test(navigator.userAgent),

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
  QUICK_REACTIONS: Object.freeze(['👍','💜','😂','😮','🔥','👎','🎉','✨','💀','🫡']),
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
    { label: 'Midnight Grid', bg: 'repeating-linear-gradient(0deg,rgba(124,109,250,.05) 0,rgba(124,109,250,.05) 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,rgba(124,109,250,.05) 0,rgba(124,109,250,.05) 1px,transparent 1px,transparent 40px)' },
    { label: 'Violet Haze',   bg: 'radial-gradient(ellipse at 20% 50%,rgba(124,109,250,.18) 0,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(74,222,128,.12) 0,transparent 50%)' },
    { label: 'Neon Fog',      bg: 'radial-gradient(ellipse at 50% 100%,rgba(167,139,250,.2) 0,transparent 70%)' },
    { label: 'Dot Matrix',    bg: 'radial-gradient(rgba(124,109,250,.18) 1px,transparent 1px)', size: '20px 20px' },
    { label: '🌌 Starry Night', bg: 'radial-gradient(circle at 20% 30%, rgba(124,109,250,.15) 0%, rgba(0,0,0,0) 50%), repeating-radial-gradient(circle at 30% 40%, rgba(255,255,255,.08) 0, rgba(255,255,255,.08) 1px, transparent 1px, transparent 30px)', size: '60px 60px' },
    { label: '🌊 Ocean Waves',  bg: 'repeating-linear-gradient(45deg, rgba(56,189,248,.08) 0px, rgba(56,189,248,.08) 2px, transparent 2px, transparent 8px), repeating-linear-gradient(135deg, rgba(6,182,212,.06) 0px, rgba(6,182,212,.06) 2px, transparent 2px, transparent 8px)' },
    { label: '🏔️ Mountain Mist', bg: 'linear-gradient(180deg, rgba(124,109,250,.08) 0%, rgba(74,222,128,.04) 100%)' },
    { label: '🍂 Autumn Leaves', bg: 'radial-gradient(circle at 10% 20%, rgba(251,146,60,.12) 0%, transparent 50%), radial-gradient(circle at 90% 80%, rgba(244,114,182,.1) 0%, transparent 50%)' },
    { label: '🔺 Triangle Mesh',  bg: 'repeating-linear-gradient(60deg, rgba(124,109,250,.06) 0px, rgba(124,109,250,.06) 1px, transparent 1px, transparent 30px), repeating-linear-gradient(120deg, rgba(124,109,250,.06) 0px, rgba(124,109,250,.06) 1px, transparent 1px, transparent 30px)' },
    { label: '✨ Glitter Sparkle',  bg: 'radial-gradient(circle at 30% 40%, rgba(255,215,0,.15) 1px, transparent 1px), radial-gradient(circle at 70% 80%, rgba(255,215,0,.1) 1px, transparent 1px)', size: '50px 50px' },
    { label: '🌅 Sunset Glow',   bg: 'linear-gradient(135deg, rgba(244,114,182,.12) 0%, rgba(251,146,60,.08) 50%, rgba(124,109,250,.12) 100%)' },
    { label: '💜 Cosmic Purple', bg: 'radial-gradient(ellipse at 30% 40%, rgba(139,92,246,.15) 0%, rgba(124,109,250,.05) 60%, transparent 100%)' },
    { label: '🎨 Bokeh Lights', bg: 'radial-gradient(circle at 20% 30%, rgba(244,114,182,.12) 0px, transparent 40px), radial-gradient(circle at 80% 70%, rgba(74,222,128,.1) 0px, transparent 50px), radial-gradient(circle at 40% 80%, rgba(124,109,250,.08) 0px, transparent 35px)' },
    { label: '🔥 Ember Glow',   bg: 'radial-gradient(ellipse at 50% 100%, rgba(251,146,60,.15) 0%, rgba(239,68,68,.05) 50%, transparent 80%)' },
  ]),
});

const _PROFANITY_RE = (() => {
  const escaped = C.PROFANITY.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
})();

/* ════════════════════════════════════════════════════════════════
   3. APPLICATION STATE
════════════════════════════════════════════════════════════════ */
const State = {
  uid:  null,
  auth: null,
  db:   null,

  currentDomainId: null,
  domain:          null,
  alias:           null,
  isOwner:         false,

  presenceRef:  null,
  typingRef:    null,
  messagesRef:  null,
  reactionsRef: null,
  membersRef:   null,

  quill:      null,
  lastSendTs: 0,

  renderedIds:   new Set(),
  _oldestMsgTs:  Infinity,
  _loadingOlder: false,
  _initialLoadDone: false,

  atBottom:    true,
  unreadCount: 0,
  _scrollRaf:  null,

  isTyping:    false,
  typingTimer: null,

  isOnline:          true,
  _wasOffline:       false,
  reconnectAttempts: 0,

  wallpaperIdx:  0,
  timerInterval: null,

  offlineQueue: [],

  _listeners: [],
  _timers:    [],

  soundEnabled: false,
  _audioCtx:    null,

  _flushInProgress:  false,
  _flushLockUntil:   0,

  _pullStartY: 0,
  _pullActive: false,

  _resizeObserver: null,

  _emojiTrayOpen: false,

  _customWallpaper: null,

  /* MySpaces parse cache — cleared on each upsert/remove */
  _mySpacesCache: null,

  /* Set while a "Clear Chat" is in effect so live messages still render */
  _chatClearedAt: 0,
};

/* ════════════════════════════════════════════════════════════════
   4. DOM CACHE
════════════════════════════════════════════════════════════════ */
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelector(sel);

/* Lazy-init helper — avoids the getter-with-side-effect anti-pattern */
let _charWrapEl = null;
let _charWrapSearched = false;
function getCharWrap() {
  if (!_charWrapSearched) {
    _charWrapEl       = $$('.char-pill') ?? null;
    _charWrapSearched = true;
  }
  return _charWrapEl;
}

const DOM = {
  /* landing / routing */
  landingScreen:        $('landingScreen'),
  landingCreateBtn:     $('landingCreateBtn'),
  landingJoinInput:     $('landingJoinInput'),
  landingJoinBtn:       $('landingJoinBtn'),
  mySpacesList:         $('mySpacesList'),

  createDomainScreen:      $('createDomainScreen'),
  createDomainNameInput:   $('createDomainNameInput'),
  createDomainSubmitBtn:   $('createDomainSubmitBtn'),
  createDomainBackBtn:     $('createDomainBackBtn'),

  joinDomainScreen:          $('joinDomainScreen'),
  joinDomainPreviewName:     $('joinDomainPreviewName'),
  joinDomainAliasInput:      $('joinDomainAliasInput'),
  joinDomainAliasCharCount:  $('joinDomainAliasCharCount'),
  joinDomainStatusMsg:       $('joinDomainStatusMsg'),
  joinDomainSubmitBtn:       $('joinDomainSubmitBtn'),
  joinDomainBackBtn:         $('joinDomainBackBtn'),

  themeToggle:       $('themeToggle'),
  onlineCount:       $('onlineCount'),
  onlineList:        $('onlineList'),
  messages:          $('messages'),
  emptyState:        $('emptyState'),
  displayUsername:   $('displayUsername'),
  userAvatar:        $('userAvatar'),
  sendButton:        $('sendButton'),
  msgCharCount:      $('messageCharCount'),
  refreshButton:     $('refreshButton'),
  notification:      $('notification'),
  notifText:         $('notificationText'),
  notifIcon:         $('notifIcon'),
  notifClose:        $('notifClose'),
  typingIndicator:   $('typingIndicator'),
  typingUsers:       $('typingUsers'),
  wallpaperBtn:      $('wallpaperSideBtn'),
  customWpBtn:       $('customWallpaperBtn'),
  clearWpBtn:        $('clearWallpaperBtn'),
  customWpInput:     $('customWallpaperInput'),
  scrollBtn:         $('scrollToBottomBtn'),
  unreadBadge:       $('unreadBadge'),
  connStatus:        $('connectionStatus'),
  connDot:           $('connDot'),
  connLabel:         $('connLabel'),
  editorWrap:        $('editorWrap'),
  srAnnounce:        $('srAnnounce'),
  emojiToggleBtn:    $('emojiToggleBtn'),

  domainNameDisplay:    $('domainNameDisplay'),
  leaveDomainBtn:       $('leaveDomainBtn'),
  switchDomainBtn:      $('switchDomainBtn'),
  inviteLinkDisplay:    $('inviteLinkDisplay'),
  copyInviteBtn:        $('copyInviteBtn'),
  rotateInviteBtn:      $('rotateInviteBtn'),
  revokeInviteBtn:      $('revokeInviteBtn'),
  adminPanelBtn:        $('adminPanelBtn'),
  adminPanel:           $('adminPanel'),
  renameDomainInput:    $('renameDomainInput'),
  renameDomainBtn:      $('renameDomainBtn'),
  retentionDaysInput:   $('retentionDaysInput'),
  retentionSaveBtn:     $('retentionSaveBtn'),
  deleteDomainBtn:      $('deleteDomainBtn'),
  deleteDomainConfirmInput: $('deleteDomainConfirmInput'),
};

/* ════════════════════════════════════════════════════════════════
   5. LISTENER REGISTRY
════════════════════════════════════════════════════════════════ */
const Listeners = {
  /**
   * @param {object} ref   - Firebase DatabaseReference
   * @param {string} event - Firebase event name
   * @param {Function} handler
   * @param {string} [label] - debug label
   */
  add(ref, event, handler, label = '') {
    ref.on(event, handler);
    State._listeners.push({ ref, event, handler, label });
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

    State._resizeObserver?.disconnect();
    State._resizeObserver = null;
  },

  /** Dev-only: print active listeners to console */
  dump() {
    console.table(State._listeners.map(({ event, label }) => ({ event, label })));
  },
};

/* ════════════════════════════════════════════════════════════════
   6. UTILITIES
════════════════════════════════════════════════════════════════ */

/* Avatar gradient cache — avoids rehashing on every message render */
const _avatarCache = new Map();

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

  /* Memoised per-second bucket to avoid re-computing identical strings
     for every visible message on each updateTimers tick. */
  _relCache: new Map(),
  relativeTime(ts, now = Date.now()) {
    /* Bucket by 5s (strings only change at that granularity below 1 min and
       far more slowly above it), so repeated calls in a tick actually hit. */
    const bucket = Math.floor(now / 5_000);
    const key    = `${ts}:${bucket}`;
    if (this._relCache.has(key)) return this._relCache.get(key);
    if (this._relCache.size > 2_000) this._relCache.clear(); /* bounded eviction */

    const s = Math.floor((now - ts) / 1_000);
    const result =
      s < 5      ? 'just now'                        :
      s < 60     ? `${s}s ago`                       :
      s < 3_600  ? `${Math.floor(s / 60)}m ago`      :
      s < 86_400 ? `${Math.floor(s / 3_600)}h ago`   :
                   `${Math.floor(s / 86_400)}d ago`;

    this._relCache.set(key, result);
    return result;
  },

  ttlMs() {
    const days = State.domain?.messageTtlDays ?? C.DEFAULT_MSG_TTL_DAYS;
    return days * 24 * 60 * 60 * 1_000;
  },

  daysLeft(ts) {
    const remaining = this.ttlMs() - (Date.now() - ts);
    return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1_000)));
  },

  isExpired(ts) {
    return Date.now() - ts > this.ttlMs();
  },

  hasProfanity(text) {
    if (!text) return false;
    const plain = String(text).replace(/<[^>]*>/g, ' ');
    if (_PROFANITY_RE.test(plain)) return true;

    /* Second pass — catches deliberate evasions WITHOUT flagging ordinary words.
       (An earlier whole-string "squash" approach wrongly blocked peacock,
       Hancock, cocktail, and phrases like "a bit chatty".) Only two shapes
       are treated as evasion:
         1. letters deliberately isolated by separators:  f u c k / f.u.c.k / f-u-c-k
         2. a single word written in leetspeak/lookalikes: fvck, b1tch, @sshole
       Client-side courtesy filter only — not a security boundary. */
    const cleaned = plain
      .normalize('NFKD')
      .replace(/[\u200B-\u200D\u2060\uFEFF\u0300-\u036F]/g, '');

    /* 1) Rejoin runs of single letters separated by spaces/punctuation,
          e.g. "f u c k" -> "fuck", then test as whole words. */
    const rejoined = cleaned.replace(
      /\b(?:[A-Za-z][\s.\-_*]+){2,}[A-Za-z]\b/g,
      m => m.replace(/[\s.\-_*]+/g, '')
    );
    if (_PROFANITY_RE.test(rejoined)) return true;

    /* 2) Per-word leetspeak folding, whole-word match only. */
    const leet = { '@': 'a', '4': 'a', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '$': 's', '5': 's', 'v': 'u' };
    const words = cleaned.toLowerCase().split(/[^a-z0-9@$!]+/).filter(Boolean);
    for (const w of words) {
      if (!/[@$!0-9]|v/.test(w)) continue;          /* nothing to fold */
      const folded = w.replace(/[@43!105$v]/g, ch => leet[ch] ?? ch);
      if (folded !== w && _PROFANITY_RE.test(folded)) return true;
    }
    return false;
  },

  avatarGradient(name) {
    if (_avatarCache.has(name)) return _avatarCache.get(name);
    if (_avatarCache.size >= C.AVATAR_CACHE_MAX) {
      /* evict oldest entry */
      _avatarCache.delete(_avatarCache.keys().next().value);
    }
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    const [a, b] = C.AVATAR_GRADIENTS[Math.abs(h) % C.AVATAR_GRADIENTS.length];
    const result = `linear-gradient(135deg,${a},${b})`;
    _avatarCache.set(name, result);
    return result;
  },

  userInitial: name => (name || '?')[0].toUpperCase(),

  roleBadge(role) {
    if (role === 'owner') return '<span class="ubadge badge-admin"><i class="fas fa-shield-alt" aria-hidden="true"></i> Owner</span>';
    return '';
  },

  genId: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9),

  genInviteCode(len = C.INVITE_CODE_LEN) {
    const alphabet = C.INVITE_CODE_ALPHABET;
    let out = '';
    const arr = new Uint32Array(len);
    if (window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(arr);
      for (let i = 0; i < len; i++) out += alphabet[arr[i] % alphabet.length];
    } else {
      console.warn('[WhisperWall] crypto.getRandomValues unavailable — invite codes use Math.random (insecure).');
      for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  },

  /**
   * Validate a Firebase push-key-shaped domainId to prevent
   * path-traversal inputs (e.g. "../other" or "..%2F") reaching DB refs.
   * @param {string} id
   * @returns {boolean}
   */
  isValidDomainId(id) {
    return typeof id === 'string' && C.DOMAIN_ID_RE.test(id);
  },

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

  formatBytes(bytes) {
    if (bytes < 1024)    return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  },
};

/* ════════════════════════════════════════════════════════════════
   7. VIEWPORT + MOBILE EDITOR PATCHES
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

function injectMobileEditorStyles() {
  if (document.getElementById('ww-mobile-patch')) return;
  const style = document.createElement('style');
  style.id = 'ww-mobile-patch';
  style.textContent = `
    #editorWrap, .ql-container, .ql-editor, .ql-toolbar { touch-action: manipulation; }
    .ql-editor {
      -webkit-user-select: text !important; user-select: text !important;
      -webkit-touch-callout: default !important; font-size: max(16px, 1em) !important;
    }
    #ww-mobile-kb-trigger {
      position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none;
      border: none; outline: none; padding: 0; margin: 0; font-size: 16px; top: 0; left: 0; z-index: -1;
    }
    .reaction, .add-reaction { min-width: 44px; min-height: 36px; }
    @media (max-width: 600px) {
      .ql-toolbar { overflow-x: auto; -webkit-overflow-scrolling: touch; flex-wrap: nowrap; }
      .ql-formats { display: inline-flex !important; flex-shrink: 0; }
      #sendButton { min-height: 44px; padding: 10px 18px; }
    }
    #messages { -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
    #ww-pull-indicator {
      display: flex; align-items: center; justify-content: center; height: 0; overflow: hidden;
      transition: height 0.2s ease; color: var(--acc, #7c6dfa); font-size: 13px; gap: 6px;
    }
    #ww-pull-indicator.active { height: 40px; }
    #ww-pull-indicator .pull-spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    #notification {
      cursor: pointer; touch-action: pan-x;
      transition: transform 0.2s ease, opacity 0.2s ease; will-change: transform;
    }
  `;
  document.head.appendChild(style);
}

/* ════════════════════════════════════════════════════════════════
   8. NOTIFICATION TOAST
════════════════════════════════════════════════════════════════ */
let _notifTimer = null;

function notify(msg, type = 'success', duration = C.NOTIF_DURATION) {
  if (!DOM.notification || !DOM.notifText) {
    console[type === 'error' ? 'error' : 'log']('[WhisperWall]', msg);
    return;
  }
  if (_notifTimer != null
