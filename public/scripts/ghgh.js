/* ═══════════════════════════════════════════════════════════════════
   WhisperWall — scripts/app.js  (v11.2 — owner-role fix on v11.1)
   Firebase Realtime DB v8  ·  Anonymous auth  ·  Quill editor

   CHANGES IN v11.2 vs v11.1
   ─────────────────────────
   · Owner keeps role 'owner' when picking an alias right after creating a
     space. Domains.join() no longer hard-codes 'member'; the caller passes
     the role, and when it is unknown join() tries 'member' first and falls
     back to 'owner' (an owner rejoining through their own invite link).
     The database rules derive the correct role server-side, so a wrong
     guess is rejected, never accepted.
   · Router.submitJoinAlias() detects the create-then-join case (the pending
     record is the full domain and ownerUid === State.uid) and passes 'owner'.
   · Removed a stale duplicated JSDoc block above Domains.resolveInvite.

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
  if (_notifTimer != null) clearTimeout(_notifTimer);
  DOM.notifText.textContent        = msg;
  DOM.notification.hidden          = false;
  DOM.notification.style.transform = '';
  DOM.notification.style.opacity   = '';

  if (DOM.notifIcon) {
    const iconMap  = { error: 'fas fa-circle-exclamation', warn: 'fas fa-triangle-exclamation', success: 'fas fa-circle-check' };
    const colorMap = { error: 'var(--red,#f87171)', warn: 'var(--amber,#fbbf24)', success: 'var(--green,#4ade80)' };
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
   9. CONNECTION STATUS
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

function initConnection() {
  if (!State.db) { console.error('[WhisperWall] initConnection called before State.db is set'); return; }

  Listeners.add(State.db.ref('.info/connected'), 'value', snap => {
    const connected = !!snap.val();
    setConnStatus(connected, State.reconnectAttempts);

    if (connected) {
      State.reconnectAttempts = 0;
      Queue.flush();
      if (State._wasOffline) { notify('Reconnected! 🟢'); State._wasOffline = false; }
    } else {
      State._wasOffline       = true;
      State.reconnectAttempts = Math.min(State.reconnectAttempts + 1, C.RECONNECT_MAX);
      notify('Connection lost — messages will be queued', 'warn');
    }
  }, '.info/connected');

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
   10. THEME / SOUND
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
    if (icon) icon.className = isLight ? 'fas fa-sun' : 'fas fa-moon';
    DOM.themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
  },
};

const Sound = {
  _getCtx() {
    if (!State._audioCtx) {
      try { State._audioCtx = new (window.AudioContext ?? window.webkitAudioContext)(); }
      catch { return null; }
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
      /* Disconnect nodes once finished to release GC references */
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
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
   11. WALLPAPER
════════════════════════════════════════════════════════════════ */
const Wallpaper = {
  init() {
    const raw = localStorage.getItem('ww_wallpaper');
    if (raw !== null) {
      const parsed = parseInt(raw, 10);
      State.wallpaperIdx = (!Number.isNaN(parsed) && parsed >= 0 && parsed < C.WALLPAPERS.length) ? parsed : 0;
    }

    /* Validate stored Data URL before trusting it */
    const savedCustom = localStorage.getItem(C.CUSTOM_WP_STORAGE_KEY);
    if (savedCustom && /^data:image\/[a-z+]+;base64,/.test(savedCustom)) {
      State._customWallpaper = savedCustom;
    } else if (savedCustom) {
      /* Corrupt / non-image value — discard silently */
      localStorage.removeItem(C.CUSTOM_WP_STORAGE_KEY);
    }

    this._apply();
    this._updateClearBtnVisibility();

    DOM.wallpaperBtn?.addEventListener('click', () => { Sidebar.close(); setTimeout(() => this.cycle(), 80); });
    DOM.customWpBtn?.addEventListener('click', () => DOM.customWpInput?.click());
    DOM.customWpInput?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) { Sidebar.close(); setTimeout(() => this.setCustom(file), 80); }
      e.target.value = '';
    });
    DOM.clearWpBtn?.addEventListener('click', () => { Sidebar.close(); setTimeout(() => this.clearCustom(), 80); });
  },

  cycle() {
    if (State._customWallpaper) this.clearCustom(true);
    State.wallpaperIdx = (State.wallpaperIdx + 1) % C.WALLPAPERS.length;
    this._apply();
    localStorage.setItem('ww_wallpaper', State.wallpaperIdx);
    notify('Wallpaper: ' + C.WALLPAPERS[State.wallpaperIdx].label);
  },

  setCustom(file) {
    if (!file || !file.type.startsWith('image/')) {
      notify('Please choose an image file (PNG, JPG, GIF, WebP)', 'error');
      return;
    }
    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      notify(`Image too large (${Utils.formatBytes(file.size)}). Max 5 MB.`, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      if (!/^data:image\/[a-z+]+;base64,/.test(dataUrl)) {
        notify('Unrecognised image format.', 'error');
        return;
      }
      try {
        localStorage.setItem(C.CUSTOM_WP_STORAGE_KEY, dataUrl);
        State._customWallpaper = dataUrl;
        this._apply();
        this._updateClearBtnVisibility();
        notify('Custom wallpaper applied! 🖼️');
      } catch {
        notify('Image too large for local storage. Try a smaller file.', 'error');
      }
    };
    reader.onerror = () => notify('Failed to read image file.', 'error');
    reader.readAsDataURL(file);
  },

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

    /* Always reset all six properties first to avoid stale values
       when switching between custom and preset modes. */
    el.style.backgroundImage    = '';
    el.style.backgroundSize     = '';
    el.style.backgroundPosition = '';
    el.style.backgroundRepeat   = '';
    el.style.background         = '';

    if (State._customWallpaper) {
      el.style.backgroundImage    = `url(${State._customWallpaper})`;
      el.style.backgroundSize     = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.backgroundRepeat   = 'no-repeat';
      return;
    }

    const idx = (State.wallpaperIdx >= 0 && State.wallpaperIdx < C.WALLPAPERS.length) ? State.wallpaperIdx : 0;
    const wp  = C.WALLPAPERS[idx];

    if (wp.bg) {
      el.style.background     = wp.bg;
      el.style.backgroundSize = wp.size ?? 'auto';
    }
  },

  _updateClearBtnVisibility() {
    if (!DOM.clearWpBtn) return;
    DOM.clearWpBtn.hidden = !State._customWallpaper;
  },
};

/* ════════════════════════════════════════════════════════════════
   12. MY SPACES
════════════════════════════════════════════════════════════════ */
const MySpaces = {
  list() {
    if (State._mySpacesCache !== null) return State._mySpacesCache;
    const parsed = Utils.safeJsonParse(localStorage.getItem(C.MY_SPACES_KEY), []);
    State._mySpacesCache = Array.isArray(parsed) ? parsed : [];
    return State._mySpacesCache;
  },

  _invalidateCache() { State._mySpacesCache = null; },

  get(domainId) {
    return this.list().find(s => s.domainId === domainId) ?? null;
  },

  upsert(domainId, name, alias) {
    this._invalidateCache();
    const all = this.list().filter(s => s.domainId !== domainId);
    all.unshift({ domainId, name, alias, joinedAt: Date.now() });
    try { localStorage.setItem(C.MY_SPACES_KEY, JSON.stringify(all.slice(0, 50))); }
    catch { /* storage full */ }
    this._invalidateCache();
  },

  remove(domainId) {
    this._invalidateCache();
    const all = this.list().filter(s => s.domainId !== domainId);
    try { localStorage.setItem(C.MY_SPACES_KEY, JSON.stringify(all)); }
    catch { /* storage full */ }
    this._invalidateCache();
  },

  renderPicker() {
    if (!DOM.mySpacesList) return;
    const spaces = this.list();
    DOM.mySpacesList.replaceChildren();

    if (!spaces.length) {
      DOM.mySpacesList.hidden = true;
      return;
    }
    DOM.mySpacesList.hidden = false;

    const frag = document.createDocumentFragment();
    for (const s of spaces) {
      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = 'nav-item';
      btn.innerHTML = `<i class="fas fa-hashtag" aria-hidden="true"></i><span>${Utils.escapeHtml(s.name)} — ${Utils.escapeHtml(s.alias)}</span>`;
      btn.addEventListener('click', () => Router.enterSavedSpace(s.domainId));
      frag.appendChild(btn);
    }
    DOM.mySpacesList.appendChild(frag);
  },
};

/* ════════════════════════════════════════════════════════════════
   13. DOMAINS
════════════════════════════════════════════════════════════════ */
const Domains = {

  /**
   * Resolve an invite code to a space preview.
   * Reads ONLY invites/{code} — a path any signed-in (including anonymous)
   * visitor can read by rule — so this never touches domains/{id} directly,
   * which is members-only. Returns { domainId, preview } on success, or null
   * if the link is genuinely invalid/revoked. THROWS an Error with
   * .code === 'PERMISSION_DENIED' / 'NETWORK' when the lookup itself failed,
   * so callers can tell a bad link apart from a rules/connectivity problem.
   */
  async resolveInvite(code) {
    const clean = (code ?? '').trim().toUpperCase();
    if (!clean) return null;

    const step = `invites/${clean}`;
    try {
      const inviteSnap = await State.db.ref(step).once('value');
      if (!inviteSnap.exists()) return null;

      const val = inviteSnap.val();
      if (!val || typeof val.domainId !== 'string' || !Utils.isValidDomainId(val.domainId)) return null;
      if (val.enabled === false) return null;

      /* name may be missing on invites created before this preview field
         existed — fall back to a generic label rather than fail the join. */
      const name = typeof val.name === 'string' && val.name ? val.name : 'this space';

      return { domainId: val.domainId, preview: { name } };
    } catch (err) {
      const denied = /permission[_ ]denied/i.test(String(err?.code ?? '') + ' ' + String(err?.message ?? ''));
      console.error(`[Domains] resolveInvite failed while reading "${step}":`, err);
      const wrapped = new Error(
        denied
          ? `Firebase rules blocked reading "${step}" for a visitor.`
          : `Could not look up the invite (${err?.message ?? 'unknown error'}).`
      );
      wrapped.code = denied ? 'PERMISSION_DENIED' : 'NETWORK';
      wrapped.step = step;
      throw wrapped;
    }
  },

  async getFull(domainId) {
    if (!Utils.isValidDomainId(domainId)) throw new Error('Invalid domain ID.');
    const snap = await State.db.ref(`domains/${domainId}`).once('value');
    if (!snap.exists()) throw new Error('gone');
    return snap.val();
  },

  async create(rawName) {
    const name = (rawName ?? '').trim();
    if (name.length < C.DOMAIN_NAME_MIN || name.length > C.DOMAIN_NAME_MAX) {
      throw new Error(`Space name must be ${C.DOMAIN_NAME_MIN}–${C.DOMAIN_NAME_MAX} characters.`);
    }
    if (!State.uid) throw new Error('Not signed in yet — try again in a moment.');

    const domainRef = State.db.ref('domains').push();
    const domainId  = domainRef.key;
    const code      = Utils.genInviteCode();
    const now       = Date.now();

    const domain = {
      name,
      createdAt:       now,
      ownerUid:        State.uid,
      inviteCode:      code,
      inviteEnabled:   true,
      messageTtlDays:  C.DEFAULT_MSG_TTL_DAYS,
      members: {
        [State.uid]: { alias: null, role: 'owner', joinedAt: now },
      },
    };

    await State.db.ref().update({
      [`domains/${domainId}`]: domain,
      /* The invite record carries its own visitor-safe preview (name + enabled)
         so an unauthenticated-to-the-space visitor never has to read domains/
         directly — that node is members-only. See resolveInvite(). */
      [`invites/${code}`]:     { domainId, name, enabled: true },
    });

    return { domainId, domain };
  },

  /**
   * Join a space with an alias.
   *
   * @param {string} domainId
   * @param {string} rawAlias
   * @param {'owner'|'member'|null} [role=null]
   *   The role to write on the member row. Pass 'owner' when the caller knows
   *   this uid owns the space (e.g. right after Domains.create()). When null,
   *   'member' is tried first and 'owner' second — the database rules derive
   *   the correct role server-side, so a wrong guess is rejected, never
   *   accepted. The fallback covers an owner rejoining through their own
   *   invite link, where the client only has the {name} preview.
   * @returns {Promise<string>} the alias that was registered
   */
  async join(domainId, rawAlias, role = null) {
    if (!Utils.isValidDomainId(domainId)) throw new Error('Invalid space.');
    const alias = (rawAlias ?? '').trim();
    if (!C.ALIAS_RE.test(alias)) throw new Error('Letters, numbers and underscores only, 3–20 characters.');
    if (Utils.hasProfanity(alias)) throw new Error('Please choose a different alias.');
    if (!State.uid) throw new Error('Not signed in yet — try again in a moment.');

    const bannedSnap = await State.db.ref(`domains/${domainId}/banned/${State.uid}`).once('value');
    if (bannedSnap.exists()) throw new Error('You no longer have access to this space.');

    /* We deliberately do NOT pre-read domains/{id}/inviteEnabled,
       domains/{id}/ownerUid, or domains/{id}/aliasIndex/{alias} here.
       Each of those sits under the members-only domains/$domainId node, and a
       non-member's read there should not be relied on. Every check those reads
       existed for is already enforced unambiguously by the WRITE-side rules,
       so we attempt the write and interpret the result instead:
         - stale/revoked invite  -> members/$uid .write requires
           inviteEnabled === true (or being the owner), so a revoked invite
           makes the write itself fail.
         - correct owner/member role -> members/$uid/role .validate derives
           the correct value server-side by comparing $uid to ownerUid.
         - alias uniqueness -> aliasIndex/$alias .write already rejects a
           slot already owned by someone else. */
    const isDenied = err =>
      /permission[_ ]denied/i.test(String(err?.code ?? '') + ' ' + String(err?.message ?? ''));

    const attempt = r => State.db.ref().update({
      [`domains/${domainId}/members/${State.uid}`]:              { alias, role: r, joinedAt: Date.now() },
      [`domains/${domainId}/aliasIndex/${alias.toLowerCase()}`]: State.uid,
    });

    const order = role ? [role] : ['member', 'owner'];

    for (const r of order) {
      try {
        await attempt(r);
        return alias;
      } catch (err) {
        if (!isDenied(err)) throw err;
        /* denied: try the next role, if any */
      }
    }

    /* A denied write here could mean: invite revoked, alias taken by someone
       else, or (unlikely) a rules misconfiguration. We can't cheaply tell these
       apart without the reads we just avoided, so give the most actionable,
       honest message. */
    throw new Error('Could not join — the invite may have been revoked, or that alias is taken. Try a different alias or ask for a fresh invite link.');
  },

  async rejoin(domainId) {
    if (!Utils.isValidDomainId(domainId)) throw new Error('Invalid space.');

    const bannedSnap = await State.db.ref(`domains/${domainId}/banned/${State.uid}`).once('value');
    if (bannedSnap.exists()) throw new Error('banned');

    const domainSnap = await State.db.ref(`domains/${domainId}`).once('value');
    if (!domainSnap.exists()) throw new Error('gone');

    const memberSnap = await State.db.ref(`domains/${domainId}/members/${State.uid}`).once('value');
    if (!memberSnap.exists()) throw new Error('not-a-member');

    return { domain: domainSnap.val(), member: memberSnap.val() };
  },

  async leave(domainId) {
    if (!domainId || !State.uid || !Utils.isValidDomainId(domainId)) return;
    const member = await State.db.ref(`domains/${domainId}/members/${State.uid}`).once('value');
    const alias  = member.val()?.alias;
    const updates = { [`domains/${domainId}/members/${State.uid}`]: null };
    if (alias) updates[`domains/${domainId}/aliasIndex/${alias.toLowerCase()}`] = null;
    await State.db.ref().update(updates);
    MySpaces.remove(domainId);
  },

  requireOwner() {
    if (!State.isOwner) throw new Error('Only the space owner can do that.');
  },

  async rename(newName) {
    this.requireOwner();
    const name = (newName ?? '').trim();
    if (name.length < C.DOMAIN_NAME_MIN || name.length > C.DOMAIN_NAME_MAX) {
      throw new Error(`Space name must be ${C.DOMAIN_NAME_MIN}–${C.DOMAIN_NAME_MAX} characters.`);
    }
    const updates = { [`domains/${State.currentDomainId}/name`]: name };
    if (State.domain?.inviteCode) updates[`invites/${State.domain.inviteCode}/name`] = name;
    await State.db.ref().update(updates);
    State.domain.name = name;
  },

  async setRetention(days) {
    this.requireOwner();
    const n = Math.round(Number(days));
    if (!Number.isFinite(n) || n < C.MIN_MSG_TTL_DAYS || n > C.MAX_MSG_TTL_DAYS) {
      throw new Error(`Retention must be ${C.MIN_MSG_TTL_DAYS}–${C.MAX_MSG_TTL_DAYS} days.`);
    }
    await State.db.ref(`domains/${State.currentDomainId}/messageTtlDays`).set(n);
    State.domain.messageTtlDays = n;
  },

  async rotateInvite() {
    this.requireOwner();
    const oldCode = State.domain.inviteCode;
    const newCode = Utils.genInviteCode();
    const updates = {
      [`domains/${State.currentDomainId}/inviteCode`]:    newCode,
      [`domains/${State.currentDomainId}/inviteEnabled`]: true,
      [`invites/${newCode}`]: { domainId: State.currentDomainId, name: State.domain.name, enabled: true },
    };
    if (oldCode) updates[`invites/${oldCode}`] = null;
    await State.db.ref().update(updates);
    State.domain.inviteCode    = newCode;
    State.domain.inviteEnabled = true;
    return newCode;
  },

  async revokeInvite() {
    this.requireOwner();
    const updates = { [`domains/${State.currentDomainId}/inviteEnabled`]: false };
    if (State.domain?.inviteCode) updates[`invites/${State.domain.inviteCode}/enabled`] = false;
    await State.db.ref().update(updates);
    State.domain.inviteEnabled = false;
  },

  async banUser(targetUid) {
    this.requireOwner();
    if (targetUid === State.domain.ownerUid) throw new Error("Can't ban the owner.");

    const memberSnap = await State.db.ref(`domains/${State.currentDomainId}/members/${targetUid}`).once('value');
    const alias       = memberSnap.val()?.alias;

    const updates = {
      [`domains/${State.currentDomainId}/banned/${targetUid}`]:  true,
      [`domains/${State.currentDomainId}/members/${targetUid}`]: null,
    };
    if (alias) updates[`domains/${State.currentDomainId}/aliasIndex/${alias.toLowerCase()}`] = null;

    await State.db.ref().update(updates);
  },

  async unbanUser(targetUid) {
    this.requireOwner();
    await State.db.ref(`domains/${State.currentDomainId}/banned/${targetUid}`).remove();
  },

  async deleteDomain() {
    this.requireOwner();
    const domainId = State.currentDomainId;
    const code      = State.domain.inviteCode;
    const updates = { [`domains/${domainId}`]: null };
    if (code) updates[`invites/${code}`] = null;
    await State.db.ref().update(updates);
    MySpaces.remove(domainId);
  },

  inviteUrl(code) {
    return `${location.origin}/?invite=${encodeURIComponent(code)}`;
  },
};

/* ════════════════════════════════════════════════════════════════
   14. ROUTER
════════════════════════════════════════════════════════════════ */
const Router = {
  _pendingJoin: null,

  parseInviteFromUrl() {
    try {
      const url = new URL(window.location.href);
      const q = url.searchParams.get('invite');
      if (q) return q.trim().toUpperCase();
      const m = url.pathname.match(/\/join\/([A-Za-z0-9]+)/);
      if (m) return m[1].trim().toUpperCase();
    } catch { /* ignore malformed URL */ }
    return null;
  },

  clearInviteFromUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('invite');
      url.pathname = url.pathname.replace(/\/join\/[A-Za-z0-9]+\/?$/, '/');
      window.history.replaceState({}, '', url.toString());
    } catch { /* non-fatal */ }
  },

  showScreen(name) {
    const screens = {
      landing: DOM.landingScreen,
      create:  DOM.createDomainScreen,
      join:    DOM.joinDomainScreen,
    };
    for (const [key, el] of Object.entries(screens)) {
      if (el) el.hidden = key !== name;
    }
  },

  async boot() {
    const inviteCode = this.parseInviteFromUrl();

    if (inviteCode) {
      let resolved = null;
      try {
        resolved = await Domains.resolveInvite(inviteCode);
      } catch (err) {
        /* The lookup itself failed — this is NOT the same as a bad link. */
        this.clearInviteFromUrl();
        if (err.code === 'PERMISSION_DENIED') {
          notify(
            'This invite link can\'t be opened yet: the database is blocking visitors from reading it. ' +
            'The space owner needs to update the Firebase rules (see console for details).',
            'error', 12_000
          );
        } else {
          notify('Couldn\'t check that invite link — check your connection and try again.', 'error', 8_000);
        }
        return this.showLanding();
      }
      if (!resolved) {
        notify("That invite link isn't valid anymore.", 'error');
        this.clearInviteFromUrl();
        return this.showLanding();
      }

      const cached = MySpaces.get(resolved.domainId);
      if (cached) {
        try {
          /* rejoin() returns the FULL domain record — that is what enterDomain needs */
          const { domain: fullDomain } = await Domains.rejoin(resolved.domainId);
          this.clearInviteFromUrl();
          return App.enterDomain(resolved.domainId, fullDomain, cached.alias, false);
        } catch {
          MySpaces.remove(resolved.domainId);
        }
      }

      this.clearInviteFromUrl();
      /* A first-time visitor only has the safe preview (name) at this point. */
      return this.showJoinScreen(resolved.domainId, resolved.preview);
    }

    return this.showLanding();
  },

  showLanding() {
    MySpaces.renderPicker();
    this.showScreen('landing');
  },

  showCreateScreen() {
    this.showScreen('create');
    requestAnimationFrame(() => DOM.createDomainNameInput?.focus());
  },

  showJoinScreen(domainId, domain) {
    this._pendingJoin = { domainId, domain };
    if (DOM.joinDomainPreviewName) DOM.joinDomainPreviewName.textContent = domain.name;
    this.showScreen('join');
    requestAnimationFrame(() => DOM.joinDomainAliasInput?.focus());
  },

  async enterSavedSpace(domainId) {
    const cached = MySpaces.get(domainId);
    if (!cached) return;
    try {
      const { domain } = await Domains.rejoin(domainId);
      App.enterDomain(domainId, domain, cached.alias, false);
    } catch (err) {
      if (err.message === 'banned') notify('You no longer have access to that space.', 'error');
      else notify('That space is no longer available.', 'error');
      MySpaces.remove(domainId);
      this.showLanding();
    }
  },

  async submitCreate() {
    const name = DOM.createDomainNameInput?.value ?? '';
    if (DOM.createDomainSubmitBtn) DOM.createDomainSubmitBtn.disabled = true;
    try {
      const { domainId, domain } = await Domains.create(name);
      this.showJoinScreen(domainId, domain);
      notify(`Space "${domain.name}" created! Pick an alias to enter it.`);
    } catch (err) {
      notify(err.message ?? 'Could not create space', 'error');
    } finally {
      if (DOM.createDomainSubmitBtn) DOM.createDomainSubmitBtn.disabled = false;
    }
  },

  async submitJoinLink() {
    const raw  = DOM.landingJoinInput?.value ?? '';
    /* Accept a pasted full link OR a bare code */
    let code = raw.trim();
    try {
      const u = new URL(code);
      code = u.searchParams.get('invite') ?? (u.pathname.match(/\/join\/([A-Za-z0-9]+)/)?.[1] ?? code);
    } catch { /* not a URL — treat as a bare code */ }

    if (!code) { notify('Paste an invite link or code first.', 'warn'); return; }

    let resolved = null;
    try {
      resolved = await Domains.resolveInvite(code);
    } catch (err) {
      notify(
        err.code === 'PERMISSION_DENIED'
          ? 'The database is blocking this lookup — the space owner needs to update the Firebase rules.'
          : 'Couldn\'t check that invite — check your connection and try again.',
        'error', 8_000
      );
      return;
    }
    if (!resolved) { notify('Invalid or expired invite code', 'error'); return; }
    this.showJoinScreen(resolved.domainId, resolved.preview);
  },

  async submitJoinAlias() {
    const pending = this._pendingJoin;
    if (!pending) {
      /* User navigated back and re-triggered submit without a pending join */
      notify('No space selected — try your invite link again.', 'warn');
      return this.showLanding();
    }
    const alias = DOM.joinDomainAliasInput?.value ?? '';

    /* Right after "Create space", pending.domain is the FULL record, so we can
       tell we are the owner and must keep role 'owner'. For an invite visitor it
       is only the {name} preview, so ownerUid is undefined and role stays null
       (Domains.join then works out the role itself). */
    const role = pending.domain?.ownerUid === State.uid ? 'owner' : null;

    if (DOM.joinDomainSubmitBtn) DOM.joinDomainSubmitBtn.disabled = true;
    try {
      const finalAlias = await Domains.join(pending.domainId, alias, role);
      this._pendingJoin = null;
      /* pending.domain may be just the preview ({name}); enterDomain needs the
         full record (ownerUid, inviteCode, TTL, ...). Now that we are a member
         we are allowed to read it. */
      let fullDomain = pending.domain;
      if (!fullDomain || fullDomain.ownerUid === undefined) {
        fullDomain = await Domains.getFull(pending.domainId);
      }
      App.enterDomain(pending.domainId, fullDomain, finalAlias, true);
    } catch (err) {
      if (DOM.joinDomainStatusMsg) {
        DOM.joinDomainStatusMsg.textContent = err.message ?? 'Could not join';
        DOM.joinDomainStatusMsg.className   = 'username-status status-bad';
      }
    } finally {
      if (DOM.joinDomainSubmitBtn) DOM.joinDomainSubmitBtn.disabled = false;
    }
  },
};

/* ════════════════════════════════════════════════════════════════
   15. PRESENCE
════════════════════════════════════════════════════════════════ */
const Presence = {
  _heartbeatTimer: null,
  _failCount: 0,

  async setup() {
    this.stop();
    State.presenceRef = State.db.ref(`domains/${State.currentDomainId}/presence/${State.uid}`);
    State.typingRef   = State.db.ref(`domains/${State.currentDomainId}/typing/${State.uid}`);

    await State.presenceRef.set({ alias: State.alias, ts: firebase.database.ServerValue.TIMESTAMP, online: true });
    await State.typingRef.set(false);

    State.presenceRef.onDisconnect().remove();
    State.typingRef.onDisconnect().remove();

    this._scheduleHeartbeat();
  },

  /* Heartbeat timer is managed entirely inside Presence — not added to
     State._timers, because it uses setTimeout not setInterval and its
     ID is stored here rather than shared globally. */
  _scheduleHeartbeat() {
    if (this._heartbeatTimer != null) clearTimeout(this._heartbeatTimer);
    const delay = this._failCount === 0
      ? C.PRESENCE_HEARTBEAT
      : Utils.backoffMs(this._failCount, C.PRESENCE_HEARTBEAT);

    this._heartbeatTimer = setTimeout(async () => {
      if (!State.isOnline || document.hidden) { this._scheduleHeartbeat(); return; }
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
    Listeners.add(
      State.db.ref(`domains/${State.currentDomainId}/presence`),
      'value',
      snap => {
        const data           = snap.val() ?? {};
        const now             = Date.now();
        const staleThreshold  = now - C.PRESENCE_HEARTBEAT * 2;
        const users           = Object.entries(data)
          .filter(([, u]) => u?.alias && (u.ts ?? 0) > staleThreshold)
          .map(([uid, u]) => ({ uid, ...u }));

        if (DOM.onlineCount) DOM.onlineCount.textContent = users.length;
        this._renderList(users);
      },
      'presence/value'
    );
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
      for (const u of users) {
        const isMe    = u.uid === State.uid;
        const isOwner = u.uid === State.domain?.ownerUid;
        const div     = document.createElement('div');
        div.className = 'online-user';
        div.setAttribute('role', 'listitem');
        /* Expose uid and alias as data attributes so Typing can look them up */
        div.dataset.uid   = u.uid;
        div.dataset.alias = u.alias;

        const dot = document.createElement('div');
        dot.className = 'dot';
        dot.setAttribute('aria-hidden', 'true');

        const name = document.createElement('span');
        name.textContent = u.alias;

        div.append(dot, name);

        if (isOwner) {
          const badge = document.createElement('span');
          badge.className   = 'ubadge badge-admin';
          badge.textContent = 'Owner';
          div.appendChild(badge);
        }
        if (isMe) {
          const you = document.createElement('span');
          you.textContent   = '(you)';
          you.style.cssText = 'font-size:10px;color:var(--acc-s,#9b7dff)';
          div.appendChild(you);
        }

        if (State.isOwner && !isMe && !isOwner) {
          const banBtn = document.createElement('button');
          banBtn.type        = 'button';
          banBtn.className   = 'composer-btn';
          banBtn.title       = `Ban ${u.alias}`;
          banBtn.setAttribute('aria-label', `Ban ${u.alias}`);
          banBtn.style.cssText = 'margin-left:auto;min-width:28px;min-height:28px;';
          banBtn.innerHTML   = '<i class="fas fa-user-slash" aria-hidden="true"></i>';
          banBtn.addEventListener('click', () => Moderation.confirmBan(u.uid, u.alias));
          div.appendChild(banBtn);
        }

        frag.appendChild(div);
      }
    }

    DOM.onlineList.replaceChildren(frag);
  },
};

/* ════════════════════════════════════════════════════════════════
   16. MODERATION UI HELPERS
════════════════════════════════════════════════════════════════ */
const Moderation = {
  async confirmBan(uid, alias) {
    const ok = window.confirm(`Remove ${alias} from this space? They won't be able to rejoin.`);
    if (!ok) return;
    try {
      await Domains.banUser(uid);
      notify(`${alias} removed from this space`);
    } catch (err) {
      notify(err.message ?? 'Could not remove user', 'error');
    }
  },

  async deleteAnyMessage(msgId) {
    try {
      await State.db.ref().update({
        [`domains/${State.currentDomainId}/messages/${msgId}`]:  null,
        [`domains/${State.currentDomainId}/reactions/${msgId}`]: null,
      });
      notify('Message removed');
    } catch (err) {
      notify('Delete failed: ' + (err.message ?? err), 'error');
    }
  },

  refreshPanelVisibility() {
    if (DOM.adminPanelBtn) DOM.adminPanelBtn.hidden = !State.isOwner;
    if (DOM.adminPanel)    DOM.adminPanel.hidden     = true;
  },

  initPanel() {
    DOM.adminPanelBtn?.addEventListener('click', () => {
      if (!DOM.adminPanel) return;
      DOM.adminPanel.hidden = !DOM.adminPanel.hidden;
      if (!DOM.adminPanel.hidden) {
        if (DOM.renameDomainInput)  DOM.renameDomainInput.value  = State.domain?.name ?? '';
        if (DOM.retentionDaysInput) DOM.retentionDaysInput.value = State.domain?.messageTtlDays ?? C.DEFAULT_MSG_TTL_DAYS;
      }
    });

    DOM.renameDomainBtn?.addEventListener('click', async () => {
      try {
        await Domains.rename(DOM.renameDomainInput?.value ?? '');
        if (DOM.domainNameDisplay) DOM.domainNameDisplay.textContent = State.domain.name;
        notify('Space renamed');
      } catch (err) { notify(err.message, 'error'); }
    });

    DOM.retentionSaveBtn?.addEventListener('click', async () => {
      try {
        await Domains.setRetention(DOM.retentionDaysInput?.value);
        notify(`Messages now auto-delete after ${State.domain.messageTtlDays} day(s)`);
      } catch (err) { notify(err.message, 'error'); }
    });

    DOM.rotateInviteBtn?.addEventListener('click', async () => {
      try {
        await Domains.rotateInvite();
        InviteUI.render();
        notify('Invite link rotated — the old one no longer works');
      } catch (err) { notify(err.message, 'error'); }
    });

    DOM.revokeInviteBtn?.addEventListener('click', async () => {
      try {
        await Domains.revokeInvite();
        InviteUI.render();
        notify('Invite link revoked');
      } catch (err) { notify(err.message, 'error'); }
    });

    DOM.deleteDomainBtn?.addEventListener('click', async () => {
      const confirmText = DOM.deleteDomainConfirmInput?.value ?? '';
      if (confirmText.trim() !== (State.domain?.name ?? '')) {
        notify('Type the space name exactly to confirm deletion', 'warn');
        return;
      }
      const ok = window.confirm('This permanently deletes the space and all its messages. Continue?');
      if (!ok) return;
      try {
        await Domains.deleteDomain();
        notify('Space deleted');
        App.exitToLanding();
      } catch (err) { notify(err.message, 'error'); }
    });
  },
};

const InviteUI = {
  render() {
    if (!State.domain) return;
    const url = Domains.inviteUrl(State.domain.inviteCode);
    if (DOM.inviteLinkDisplay) {
      DOM.inviteLinkDisplay.textContent = State.domain.inviteEnabled === false ? 'Invite link revoked' : url;
    }
  },
  init() {
    DOM.copyInviteBtn?.addEventListener('click', async () => {
      if (!State.domain || State.domain.inviteEnabled === false) { notify('No active invite link', 'warn'); return; }
      const url = Domains.inviteUrl(State.domain.inviteCode);
      try {
        await navigator.clipboard.writeText(url);
        notify('Invite link copied!');
      } catch {
        notify(url, 'success', 6_000);
      }
    });
  },
};

/* ════════════════════════════════════════════════════════════════
   17. TYPING
════════════════════════════════════════════════════════════════ */
const Typing = {
  /* broadcast is defined as a debounced method; the debounce wrapper
     needs to be applied at object-definition time so `this` is correct
     when called via `Typing.broadcast(...)`. */
  broadcast: Utils.debounce(function (hasText) {
    if (!State.alias || !State.typingRef) return;
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
    Listeners.add(
      State.db.ref(`domains/${State.currentDomainId}/typing`),
      'value',
      snap => {
        if (!DOM.typingIndicator || !DOM.typingUsers) return;
        const data = snap.val() ?? {};
        const list = Object.entries(data)
          .filter(([uid, v]) => uid !== State.uid && v === true)
          .map(([uid]) => uid);

        if (!list.length) { DOM.typingIndicator.hidden = true; return; }

        /* Resolve uids to aliases via presence data attributes */
        const aliasFor = uid => {
          const el = DOM.onlineList?.querySelector(`[data-uid="${CSS.escape(uid)}"]`);
          return el?.dataset.alias ?? 'Someone';
        };
        const names = list.map(aliasFor);

        DOM.typingUsers.textContent =
          names.length === 1 ? `${names[0]} is typing…` :
          names.length === 2 ? `${names[0]} and ${names[1]} are typing…` :
                                `${names[0]}, ${names[1]} and others are typing…`;

        DOM.typingIndicator.hidden = false;
      },
      'typing/value'
    );
  },
};

/* ════════════════════════════════════════════════════════════════
   18. REACTIONS
════════════════════════════════════════════════════════════════ */
const Reactions = {
  _pending: new Map(),
  _docListeners: { click: null, keydown: null },

  toggle(msgId, emoji) {
    if (!State.alias) { notify('Join a space first', 'error'); return; }
    const ref = State.db.ref(`domains/${State.currentDomainId}/reactions/${msgId}/${State.uid}`);
    ref.once('value').then(snap =>
      snap.val() === emoji ? ref.remove() : ref.set(emoji)
    ).catch(() => notify('Reaction failed', 'error'));
  },

  /**
   * Keyed-update strategy: update existing buttons in place and only
   * add/remove the delta, rather than replaceChildren() on every event.
   * This eliminates forced layout recalculations on active messages.
   */
  render(msgId, container, data = {}) {
    if (!container) return;

    const counts = Object.create(null);
    const byMe   = Object.create(null);

    for (const [uid, emoji] of Object.entries(data)) {
      counts[emoji] = (counts[emoji] ?? 0) + 1;
      if (uid === State.uid) byMe[emoji] = true;
    }

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    /* Build a map of existing emoji buttons for keyed updates */
    const existingBtns = new Map();
    for (const btn of container.querySelectorAll('.reaction[data-emoji]')) {
      existingBtns.set(btn.dataset.emoji, btn);
    }

    const seen = new Set();

    for (const [emoji, count] of sorted) {
      seen.add(emoji);
      let btn = existingBtns.get(emoji);
      if (btn) {
        /* Update in place */
        btn.textContent = `${emoji} ${count}`;
        btn.className   = 'reaction' + (byMe[emoji] ? ' active' : '');
        btn.setAttribute('aria-label',   `React ${emoji} — ${count}`);
        btn.setAttribute('aria-pressed', String(!!byMe[emoji]));
      } else {
        btn = document.createElement('button');
        btn.type             = 'button';
        btn.dataset.emoji    = emoji;
        btn.className        = 'reaction' + (byMe[emoji] ? ' active' : '');
        btn.textContent      = `${emoji} ${count}`;
        btn.setAttribute('aria-label',   `React ${emoji} — ${count}`);
        btn.setAttribute('aria-pressed', String(!!byMe[emoji]));
        btn.addEventListener('click', () => this.toggle(msgId, emoji));
        container.insertBefore(btn, container.querySelector('.add-reaction'));
      }
    }

    /* Remove buttons for emoji no longer present */
    for (const [emoji, btn] of existingBtns) {
      if (!seen.has(emoji)) btn.remove();
    }

    /* Ensure add-reaction button exists */
    if (!container.querySelector('.add-reaction')) {
      const add = document.createElement('button');
      add.type      = 'button';
      add.className = 'reaction add-reaction';
      add.innerHTML = '<i class="fas fa-plus" aria-hidden="true"></i>';
      add.setAttribute('aria-label', 'Add reaction');
      add.addEventListener('click', e => { e.stopPropagation(); this._openPicker(e.currentTarget, msgId); });
      container.appendChild(add);
    }
  },

  /* Bulk cache filled by one read of the whole reactions node during
     Messages.load(); avoids one network read per message. */
  _bulk: null,

  async primeBulk() {
    try {
      const snap = await State.db.ref(`domains/${State.currentDomainId}/reactions`).once('value');
      this._bulk = snap.val() ?? {};
    } catch (err) {
      this._bulk = null;
      console.warn('[Reactions] bulk prime failed, falling back to per-message reads:', err);
    }
  },

  load(msgId, container) {
    if (!container) return;
    /* Fast path: bulk data already fetched */
    if (this._bulk) {
      this.render(msgId, container, this._bulk[msgId] ?? {});
      return;
    }
    State.db.ref(`domains/${State.currentDomainId}/reactions/${msgId}`).once('value')
      .then(snap => this.render(msgId, container, snap.val() ?? {}))
      .catch(err => console.warn('[Reactions] load:', err));
  },

  subscribe() {
    const ref = State.db.ref(`domains/${State.currentDomainId}/reactions`);

    /* child_added fires when a message gets its FIRST reaction (node is created);
       child_changed when reactions are added/removed on an existing node;
       child_removed when the LAST reaction on a message is removed. All three
       must be handled or the UI drifts out of sync until reload. */
    const schedule = (msgId, data) => {
      if (this._pending.has(msgId)) clearTimeout(this._pending.get(msgId));
      this._pending.set(msgId, setTimeout(() => {
        this._pending.delete(msgId);
        const el = $(`reactions-${msgId}`);
        if (el) this.render(msgId, el, data ?? {});
      }, C.REACTION_DEBOUNCE_MS));
    };

    Listeners.add(ref, 'child_added',   snap => schedule(snap.key, snap.val()), 'reactions/child_added');
    Listeners.add(ref, 'child_changed', snap => schedule(snap.key, snap.val()), 'reactions/child_changed');
    Listeners.add(ref, 'child_removed', snap => schedule(snap.key, {}),         'reactions/child_removed');
  },

  _openPicker(trigger, msgId) {
    this._detachDocListeners();
    document.querySelectorAll('.emoji-picker-popup').forEach(p => p.remove());

    let _pickerAborted = false;

    const picker = document.createElement('div');
    picker.className     = 'emoji-picker-popup';
    picker.style.cssText = 'z-index:60;position:absolute;';
    picker.setAttribute('role', 'menu');
    picker.setAttribute('aria-label', 'Reaction picker');

    const frag = document.createDocumentFragment();
    for (const emoji of C.QUICK_REACTIONS) {
      const btn = document.createElement('button');
      btn.type        = 'button';
      btn.className   = 'emoji-picker-btn';
      btn.textContent = emoji;
      btn.setAttribute('aria-label', `React ${emoji}`);
      btn.setAttribute('role', 'menuitem');
      btn.style.cssText = 'min-width:44px;min-height:44px;font-size:20px;';
      btn.addEventListener('click', () => {
        this.toggle(msgId, emoji);
        picker.remove();
        _pickerAborted = true;
      });
      frag.appendChild(btn);
    }
    picker.appendChild(frag);

    const row = trigger.closest('.msg-reactions');
    if (row) {
      if (window.getComputedStyle(row).position === 'static') row.style.position = 'relative';
      row.appendChild(picker);

      if (C.IS_MOBILE) {
        requestAnimationFrame(() => {
          const rect    = picker.getBoundingClientRect();
          const vHeight = window.visualViewport?.height ?? window.innerHeight;
          if (rect.bottom > vHeight - 20) { picker.style.bottom = '100%'; picker.style.top = 'auto'; }
        });
      }
    }

    const removePicker = () => { picker.remove(); this._detachDocListeners(); };

    /* Use a timeout to attach document listeners so the current click
       that opened the picker doesn't immediately close it; guard the
       handlers so they self-cancel if the picker was already closed. */
    this._docListeners.click   = e => {
      if (_pickerAborted) return;
      if (!picker.contains(e.target) && e.target !== trigger) removePicker();
    };
    this._docListeners.keydown = e => {
      if (_pickerAborted) return;
      if (e.key === 'Escape') { removePicker(); trigger.focus(); }
    };

    setTimeout(() => {
      if (_pickerAborted) return;
      document.addEventListener('click',   this._docListeners.click);
      document.addEventListener('keydown', this._docListeners.keydown);
    }, 10);

    picker.querySelector('button')?.focus();
  },

  _detachDocListeners() {
    if (this._docListeners.click)   { document.removeEventListener('click',   this._docListeners.click);   this._docListeners.click   = null; }
    if (this._docListeners.keydown) { document.removeEventListener('keydown', this._docListeners.keydown); this._docListeners.keydown = null; }
  },
};

/* ════════════════════════════════════════════════════════════════
   19. CONTEXT MENU
════════════════════════════════════════════════════════════════ */

/**
 * Build a context menu button — extracted so it can be tested in isolation.
 * @param {string} html    - inner HTML (icon + label)
 * @param {string} color   - CSS color string
 * @param {Function} onClick
 * @returns {HTMLButtonElement}
 */
function buildMenuBtn(html, color, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('role', 'menuitem');
  btn.style.cssText = `
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
}

const ContextMenu = {
  _el: null,
  _pressTimer: null,

  init() {
    document.addEventListener('click',   e => { if (this._el && !this._el.contains(e.target)) this._close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this._close(); });
  },

  attach(msgEl, msgId, uid) {
    const isOwnMsg = uid === State.uid;
    if (!isOwnMsg && !State.isOwner) return;

    msgEl.addEventListener('contextmenu', e => { e.preventDefault(); this._open(e.clientX, e.clientY, msgId, isOwnMsg); });

    msgEl.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      this._pressTimer = setTimeout(() => {
        Utils.vibrate([15]);
        this._open(e.clientX, e.clientY, msgId, isOwnMsg);
      }, C.CONTEXT_MENU_MS);
    });
    const cancelPress = () => { if (this._pressTimer != null) clearTimeout(this._pressTimer); };
    msgEl.addEventListener('pointerup',     cancelPress);
    msgEl.addEventListener('pointermove',   cancelPress);
    msgEl.addEventListener('pointercancel', cancelPress);
  },

  _open(clientX, clientY, msgId, isOwnMsg) {
    this._close();

    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
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

    if (isOwnMsg) {
      menu.appendChild(buildMenuBtn(
        '<i class="fas fa-pencil" aria-hidden="true"></i><span>Edit message</span>',
        'var(--tx,#f0eeff)',
        () => { this._close(); MessageEdit.start(msgId); }
      ));
    }

    const deleteLabel = isOwnMsg ? 'Delete message' : 'Remove message (moderation)';
    menu.appendChild(buildMenuBtn(
      `<i class="fas fa-trash" aria-hidden="true"></i><span>${deleteLabel}</span>`,
      'var(--red,#f87171)',
      () => { this._close(); isOwnMsg ? this._deleteOwnMsg(msgId) : Moderation.deleteAnyMessage(msgId); }
    ));

    document.body.appendChild(menu);
    this._el = menu;

    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right  > window.innerWidth)  menu.style.left = `${clientX - rect.width  - 8}px`;
      if (rect.bottom > window.innerHeight) menu.style.top  = `${clientY - rect.height - 8}px`;
    });

    menu.querySelector('button')?.focus();
  },

  _close() { this._el?.remove(); this._el = null; },

  async _deleteOwnMsg(msgId) {
    try {
      await State.db.ref().update({
        [`domains/${State.currentDomainId}/messages/${msgId}`]:  null,
        [`domains/${State.currentDomainId}/reactions/${msgId}`]: null,
      });
      notify('Message deleted');
    } catch (err) {
      notify('Delete failed: ' + (err.message ?? err), 'error');
    }
  },
};

/* ════════════════════════════════════════════════════════════════
   20. MESSAGE EDIT
════════════════════════════════════════════════════════════════ */
const MessageEdit = {
  async start(msgId) {
    const msgEl  = $(`msg-${msgId}`);
    const bubble = msgEl?.querySelector('.msg-bubble');
    if (!bubble) return;

    let plainText = '';
    try {
      const snap = await State.db.ref(`domains/${State.currentDomainId}/messages/${msgId}/plainText`).once('value');
      plainText  = snap.val() ?? bubble.textContent.trim();
    } catch {
      plainText = bubble.textContent.trim();
    }

    const ta = document.createElement('textarea');
    ta.value  = plainText;
    ta.rows   = Math.max(2, plainText.split('\n').length);
    ta.style.cssText = `
      width:100%;resize:vertical;padding:8px 10px;border-radius:8px;line-height:1.5;
      font-family:inherit;color:var(--tx,#f0eeff);background:var(--c-bg2,#161625);
      border:1px solid var(--acc,#7c6dfa);outline:none;box-sizing:border-box;
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
        await State.db.ref(`domains/${State.currentDomainId}/messages/${msgId}`).update({
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

    /* Use a longer delay than a single RAF so dialog/context-menu focus
       shifts don't spuriously cancel the edit. */
    ta.addEventListener('blur', () => {
      setTimeout(() => { if (!_saved && document.activeElement !== ta) cancel(); }, C.EDIT_BLUR_DELAY_MS);
    });
  },
};

/* ════════════════════════════════════════════════════════════════
   21. MESSAGES
════════════════════════════════════════════════════════════════ */
const Messages = {

  loadOlderDebounced: Utils.debounce(function () { Messages.loadOlder(); }, C.LOADOLDER_DEBOUNCE_MS),

  _buildEl(id, data) {
    const isOwn   = data.uid === State.uid;
    const time    = Utils.formatTime(data.timestamp);
    /* Escape alias before use in attributes to prevent XSS via crafted alias */
    const alias   = Utils.escapeHtml(data.alias ?? 'ghost');
    const grad    = Utils.avatarGradient(data.alias ?? '?');
    const initial = Utils.userInitial(data.alias);
    const isMsgOwner = data.uid === State.domain?.ownerUid;
    const badge   = Utils.roleBadge(isMsgOwner ? 'owner' : 'member');
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
    const relTime    = data.timestamp ? Utils.escapeHtml(Utils.relativeTime(data.timestamp)) : '';
    const editedMark = data.edited
      ? '<span class="msg-edited" title="Edited" aria-label="Edited"> (edited)</span>'
      : '';

    /* Use escaped `alias` in HTML attributes consistently */
    const metaHtml = isOwn
      ? `<span class="msg-time" title="${relTime}" data-reltime="${data.timestamp ?? ''}">${absTime}</span>${editedMark}`
      : `<span class="msg-author">${alias}${badge}</span>
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
    while (prev && !prev.classList.contains('msg')) prev = prev.previousElementSibling;
    if (!prev) return;
    const prevUid = prev.dataset.uid;
    const prevTs  = parseInt(prev.dataset.ts ?? '0', 10);
    if (prevUid === data.uid && (data.timestamp - prevTs) < 3 * 60 * 1_000) row.classList.add('msg-grouped');
  },

  append(id, data, isNew = false) {
    if (State.renderedIds.has(id)) return;
    State.renderedIds.add(id);

    if (data.timestamp && data.timestamp < State._oldestMsgTs) State._oldestMsgTs = data.timestamp;
    if (DOM.emptyState) DOM.emptyState.hidden = true;

    const el = this._buildEl(id, data);
    DOM.messages?.appendChild(el);
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
    if (data.timestamp && data.timestamp < State._oldestMsgTs) State._oldestMsgTs = data.timestamp;

    const el = this._buildEl(id, data);
    const firstMsg = DOM.messages?.querySelector('.msg');
    DOM.messages?.insertBefore(el, firstMsg ?? null);
  },

  remove(id) {
    $(`msg-${id}`)?.remove();
    State.renderedIds.delete(id);
    if (!State.renderedIds.size && DOM.emptyState) DOM.emptyState.hidden = false;
  },

  async load() {
    if (!DOM.messages) return;

    if (DOM.refreshButton) {
      DOM.refreshButton.disabled  = true;
      DOM.refreshButton.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span class="topbar-btn-label">Loading…</span>';
    }

    Array.from(DOM.messages.children).forEach(el => {
      if (el !== DOM.emptyState && el.id !== 'ww-pull-indicator' && el !== DOM.scrollBtn) el.remove();
    });

    State.renderedIds.clear();
    State._oldestMsgTs     = Infinity;
    State._initialLoadDone = false;
    State._chatClearedAt   = 0;   /* an explicit refresh cancels a local clear */
    if (DOM.emptyState) DOM.emptyState.hidden = true;

    const skeleton = this._buildSkeleton();
    DOM.messages.appendChild(skeleton);

    try {
      Reactions._bulk = null;
      await Reactions.primeBulk();

      const snap = await State.db.ref(`domains/${State.currentDomainId}/messages`)
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
    if (State._loadingOlder || State._oldestMsgTs === Infinity) return;
    State._loadingOlder = true;
    const prevHeight = DOM.messages?.scrollHeight ?? 0;

    try {
      const snap = await State.db.ref(`domains/${State.currentDomainId}/messages`)
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
      <div class="msg-skeleton"><div class="msg-skeleton-avatar skeleton-pulse"></div>
        <div class="msg-skeleton-body"><div class="msg-skeleton-line skeleton-pulse"></div><div class="msg-skeleton-bubble skeleton-pulse"></div></div></div>
      <div class="msg-skeleton"><div class="msg-skeleton-avatar skeleton-pulse"></div>
        <div class="msg-skeleton-body"><div class="msg-skeleton-line skeleton-pulse"></div><div class="msg-skeleton-bubble skeleton-pulse"></div></div></div>`;
    return wrap;
  },

  subscribe() {
    /* Bounded live query: only the newest MSG_LOAD_LIMIT messages are replayed
       (instead of the entire history), and renderedIds dedupes against load(). */
    State.messagesRef = State.db.ref(`domains/${State.currentDomainId}/messages`)
      .orderByChild('timestamp')
      .limitToLast(C.MSG_LOAD_LIMIT);

    Listeners.add(State.messagesRef, 'child_added', snap => {
      /* Skip the initial batch — Messages.load() handles them synchronously.
         Only process genuinely new messages that arrive after load completes. */
      if (!State._initialLoadDone) return;
      const data = { ...snap.val() };
      if (Utils.isExpired(data.timestamp)) return;
      /* Respect a local "Clear Chat": hide only what existed at clear time */
      if (State._chatClearedAt && (data.timestamp ?? 0) <= State._chatClearedAt) return;
      this.append(snap.key, data, true);
    }, 'messages/child_added');

    Listeners.add(State.messagesRef, 'child_removed', snap => this.remove(snap.key), 'messages/child_removed');

    Listeners.add(State.messagesRef, 'child_changed', snap => {
      const data  = snap.val();
      const msgEl = $(`msg-${snap.key}`);
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
    }, 'messages/child_changed');
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
   22. SCROLL
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
        if (scrollTop < C.SCROLL_TOP_LOAD && !State._loadingOlder) Messages.loadOlderDebounced();
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
      if (DOM.messages.scrollTop === 0) { State._pullStartY = e.touches[0].clientY; State._pullActive = true; }
    }, { passive: true });

    DOM.messages.addEventListener('touchmove', e => {
      if (!State._pullActive) return;
      if (e.touches[0].clientY - State._pullStartY > 60) indicator.classList.add('active');
    }, { passive: true });

    DOM.messages.addEventListener('touchend', async () => {
      if (!State._pullActive) return;
      State._pullActive = false;
      if (indicator.classList.contains('active')) { indicator.classList.remove('active'); await Messages.load(); }
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
      if (DOM.srAnnounce) DOM.srAnnounce.textContent = `${State.unreadCount} new message${State.unreadCount > 1 ? 's' : ''}`;
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
   23. OFFLINE QUEUE
════════════════════════════════════════════════════════════════ */
const Queue = {
  _storageKey() { return `ww_queue_${State.currentDomainId ?? 'none'}`; },

  _save() {
    try {
      if (State.offlineQueue.length) localStorage.setItem(this._storageKey(), JSON.stringify(State.offlineQueue));
      else localStorage.removeItem(this._storageKey());
    } catch { /* storage full */ }
  },

  load() {
    if (!State.currentDomainId) { State.offlineQueue = []; return; }
    const raw    = localStorage.getItem(this._storageKey());
    const parsed = Utils.safeJsonParse(raw, []);
    if (!Array.isArray(parsed)) { State.offlineQueue = []; return; }

    const now = Date.now();
    /* uid is intentionally NOT persisted (see add()), so it must not be
       required here — the live session uid is attached at flush time. */
    State.offlineQueue = parsed.filter(item => {
      if (!item || typeof item !== 'object') return false;
      if (!item.alias || !item.message) return false;
      return now - (item._qts ?? 0) < C.QUEUE_PRUNE_TTL_MS;
    });

    if (parsed.length !== State.offlineQueue.length) this._save();
  },

  add(msg) {
    /* Strip uid from persisted queue items — uid comes from the live auth session */
    const { uid: _uid, ...rest } = msg;  // eslint-disable-line no-unused-vars
    State.offlineQueue.push({ ...rest, _qid: Utils.genId(), _qts: Date.now() });
    this._save();
    notify('Message queued (offline) — will send when reconnected.', 'warn');
  },

  async flush() {
    /* Per-domain double-flush lock: if a flush is already in progress
       or completed very recently, bail out to prevent duplicate sends. */
    const now = Date.now();
    if (State._flushInProgress || now < State._flushLockUntil) return;
    if (!State.db || !State.isOnline || !State.offlineQueue.length || !State.uid || !State.currentDomainId) return;

    State._flushInProgress = true;
    State._flushLockUntil  = now + C.QUEUE_FLUSH_LOCK_MS;

    /* Snapshot, but do NOT empty the persisted queue up front. Items are only
       removed after each one is confirmed written, so a tab close or crash
       mid-flush can never lose unsent messages. */
    const domainId = State.currentDomainId;
    const items    = [...State.offlineQueue];
    let sent = 0;

    try {
      for (const item of items) {
        /* Domain changed mid-flush — stop; leftovers stay queued for that domain */
        if (State.currentDomainId !== domainId) break;

        if (!item.alias || !item.message) {
          /* Malformed — drop it so it can't block the queue forever */
          State.offlineQueue = State.offlineQueue.filter(q => q._qid !== item._qid);
          this._save();
          continue;
        }

        try {
          await State.db.ref(`domains/${domainId}/messages`).push({
            alias:     item.alias,
            uid:       State.uid,   /* always the live session uid */
            message:   item.message,
            plainText: item.plainText,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
          });
          sent++;
          State.offlineQueue = State.offlineQueue.filter(q => q._qid !== item._qid);
          this._save();
        } catch {
          /* Leave the item (and everything after it) queued; retry next flush */
          break;
        }
      }
    } finally {
      State._flushInProgress = false;
    }

    if (sent > 0) notify(`${sent} queued message${sent > 1 ? 's' : ''} sent!`);
  },
};

/* ════════════════════════════════════════════════════════════════
   24. EDITOR
════════════════════════════════════════════════════════════════ */
const Editor = {
  _kbTrigger: null,

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

    /* Removed: window.__wwQuill assignment (global scope leak) */

    const hintEl = $$('.send-hint');
    if (hintEl) hintEl.textContent = Utils.sendShortcut();

    State.quill.on('text-change', Utils.debounce(() => {
      const plain = State.quill.getText().trim();
      const len   = State.quill.getLength() - 1;

      if (DOM.msgCharCount) DOM.msgCharCount.textContent = len;

      const cw = getCharWrap();
      if (cw) cw.className = len > C.MSG_DANGER_CHARS ? 'char-pill danger' : len > C.MSG_WARN_CHARS ? 'char-pill warn' : 'char-pill';

      const canSend = plain.length > 0 && len <= C.MSG_MAX_CHARS && !!State.alias && !!State.currentDomainId;
      if (DOM.sendButton) { DOM.sendButton.disabled = !canSend; DOM.sendButton.setAttribute('aria-disabled', String(!canSend)); }

      Typing.broadcast(plain.length > 0);
    }, 150));

    this._initResizeObserver();
    this._initPaste();
    this._initMobileKeyboard();
    this._initEmojiTray();
  },

  _initResizeObserver() {
    /* Removed: the previous ResizeObserver had an empty callback and only
       added overhead. Kept as a no-op so init() call sites stay stable. */
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

      for (const emoji of C.QUICK_EMOJIS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'emoji-btn';
        btn.textContent = emoji;
        btn.setAttribute('aria-label', `Insert ${emoji}`);
        btn.addEventListener('click', () => {
          const q = State.quill;
          const range = q.getSelection(true);
          const idx = range ? range.index : q.getLength();
          q.insertText(idx, emoji, 'user');
          q.setSelection(idx + emoji.length, 0);
          closeTray();
          q.focus();
        });
        tray.appendChild(btn);
      }

      const composerBar = $$('.composer-bar');
      if (composerBar) composerBar.parentElement.insertBefore(tray, composerBar);
      else DOM.emojiToggleBtn.closest('.composer')?.prepend(tray);

      State._emojiTrayOpen = true;
      DOM.emojiToggleBtn.setAttribute('aria-expanded', 'true');
    });

    document.addEventListener('click', e => {
      if (State._emojiTrayOpen && tray && !tray.contains(e.target) && e.target !== DOM.emojiToggleBtn) closeTray();
    });
  },

  _initMobileKeyboard() {
    if (!C.IS_MOBILE) return;
    const editorContainer = document.getElementById('editor-container');
    if (!editorContainer) return;

    const ta = document.createElement('textarea');
    ta.id = 'ww-mobile-kb-trigger';
    ta.autocomplete = 'off'; ta.autocorrect = 'off'; ta.autocapitalize = 'off'; ta.spellcheck = false;
    ta.tabIndex = -1;
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
        if (document.activeElement !== qlEditor) { e.preventDefault(); ta.focus(); }
      }, { passive: false });
    }

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', Utils.throttle(() => {
        const vvHeight  = window.visualViewport.height;
        const winHeight = window.innerHeight;
        if (vvHeight < winHeight * 0.75) setTimeout(() => Scroll.toBottom(false), 100);
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

      if (file.size > C.PASTE_IMG_MAX_BYTES) {
        notify(`Pasted image too large (${Utils.formatBytes(file.size)}). Max ${Utils.formatBytes(C.PASTE_IMG_MAX_BYTES)}.`, 'warn');
        return;
      }

      const reader = new FileReader();
      reader.onload = ev => {
        const url = ev.target.result;
        const q   = State.quill;
        const range = q.getSelection(true);
        const idx = range ? range.index : q.getLength();
        q.insertEmbed(idx, 'image', url, 'user');
        q.setSelection(idx + 1, 0);
      };
      reader.readAsDataURL(file);
    }, true);
  },

  focus() {
    if (C.IS_MOBILE) setTimeout(() => this._kbTrigger?.focus(), 80);
    else             setTimeout(() => State.quill?.focus(),     80);
  },

  clear() {
    State.quill?.setText('');
    if (DOM.msgCharCount) DOM.msgCharCount.textContent = '0';
    const cw = getCharWrap();
    if (cw) cw.className = 'char-pill';
  },
};

/* ════════════════════════════════════════════════════════════════
   25. SEND
════════════════════════════════════════════════════════════════ */
const Send = {
  async send() {
    if (!State.alias || !State.currentDomainId) { notify('Join a space first', 'error'); return; }
    if (!State.quill) { notify('Editor not ready', 'error'); return; }

    const now   = Date.now();
    const since = now - State.lastSendTs;
    if (since < C.SEND_RATE_MS) {
      notify(`Slow down — wait ${Math.ceil((C.SEND_RATE_MS - since) / 1_000)}s`, 'warn');
      return;
    }

    const plain = State.quill.getText().trim();
    const html  = State.quill.root.innerHTML;
    const len   = State.quill.getLength() - 1;

    if (!plain) { notify('Message is empty', 'warn'); return; }
    if (len > C.MSG_MAX_CHARS) { notify(`Too long (max ${C.MSG_MAX_CHARS} chars)`, 'warn'); return; }
    if (Utils.hasProfanity(plain)) { notify('Message contains inappropriate content', 'error'); return; }

    let safe = '';
    try { safe = DOMPurify.sanitize(html, C.PURIFY_SEND); }
    catch { safe = Utils.escapeHtml(plain); }

    /* NOTE: uid is still written to the message (the UI uses it to tell own vs
       other messages and to attach the context menu). Your database rules MUST
       enforce  newData.child('uid').val() === auth.uid  so it cannot be spoofed. */
    const payload = { alias: State.alias, uid: State.uid, message: safe, plainText: plain };

    State.lastSendTs = now;
    this._loading(true);
    Utils.vibrate([10, 30, 10]);

    try {
      if (!State.isOnline) { Queue.add(payload); Editor.clear(); return; }

      await State.db.ref(`domains/${State.currentDomainId}/messages`).push({
        alias:     State.alias,
        uid:       State.uid,
        message:   safe,
        plainText: plain,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
      });

      Editor.clear();
      Typing.stop();
      Scroll.toBottom();

    } catch (err) {
      State.lastSendTs = 0;
      if (!State.isOnline) { Queue.add(payload); Editor.clear(); }
      else notify('Send failed: ' + (err.message ?? err), 'error');
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
   26. AUTO-CLEANUP
════════════════════════════════════════════════════════════════ */
const Membership = {
  _ejecting: false,

  start() {
    this._ejecting = false;
    const domainId = State.currentDomainId;
    const memberRef = State.db.ref(`domains/${domainId}/members/${State.uid}`);
    let firstMemberSnap = true;
    let firstNameSnap   = true;

    /* Live watch: if our member node disappears (ban), eject. The first snapshot
       fires immediately on attach and reflects state at entry, so it is ignored;
       and every "missing" result is re-confirmed with a fresh read before we act,
       so a transient blip can never kick a legitimate user. */
    Listeners.add(memberRef, 'value', snap => {
      if (firstMemberSnap) { firstMemberSnap = false; return; }
      if (snap.exists() || State.isOwner) return;
      this._confirmThenEject(domainId, 'removed');
    }, 'members/self');

    /* Space deleted entirely */
    Listeners.add(State.db.ref(`domains/${domainId}/name`), 'value', snap => {
      if (firstNameSnap) { firstNameSnap = false; return; }
      if (snap.exists()) return;
      this._confirmThenEject(domainId, 'deleted');
    }, 'domain/name');
  },

  async _confirmThenEject(domainId, reason) {
    /* Guard: only act if we're still in the same space and not already leaving */
    if (this._ejecting || State.currentDomainId !== domainId) return;
    try {
      const path = reason === 'deleted' ? `domains/${domainId}/name` : `domains/${domainId}/members/${State.uid}`;
      const fresh = await State.db.ref(path).once('value');
      if (fresh.exists()) return;                       /* false alarm */
      if (State.currentDomainId !== domainId) return;   /* user already left */
    } catch {
      return;                                           /* can't confirm — do nothing */
    }
    this._eject(domainId, reason);
  },

  async _eject(domainId, reason) {
    if (this._ejecting) return;
    this._ejecting = true;
    let banned = false;
    if (reason !== 'deleted') {
      try {
        const b = await State.db.ref(`domains/${domainId}/banned/${State.uid}`).once('value');
        banned = b.exists();
      } catch { /* ignore */ }
    }
    if (State.currentDomainId !== domainId) return;     /* already navigated away */

    MySpaces.remove(domainId);
    notify(
      reason === 'deleted' ? 'This space was deleted.' :
      banned               ? 'You were removed from this space.' :
                             'You are no longer a member of this space.',
      'error', 6_000
    );
    App.exitToLanding();
  },

  stop() { this._ejecting = false; /* listeners are torn down by Listeners.removeAll() */ },
};

const Cleanup = {
  async run() {
    if (!State.isOwner || !State.currentDomainId) return;
    try {
      const cutoff = Date.now() - Utils.ttlMs();
      const snap = await State.db.ref(`domains/${State.currentDomainId}/messages`)
        .orderByChild('timestamp')
        .endAt(cutoff)
        .once('value');

      if (!snap.exists()) return;

      const deletes = {};
      snap.forEach(child => {
        deletes[`domains/${State.currentDomainId}/messages/${child.key}`]  = null;
        deletes[`domains/${State.currentDomainId}/reactions/${child.key}`] = null;
      });

      const count = Math.floor(Object.keys(deletes).length / 2);
      /* Early return if nothing to delete — avoids spurious update({}) call */
      if (count === 0) return;

      await State.db.ref().update(deletes);
      console.info(`[Cleanup] Pruned ${count} expired message(s).`);
    } catch (err) {
      if (err?.code !== 'PERMISSION_DENIED') console.warn('[Cleanup] Auto-cleanup failed:', err);
    }
  },
};

/* ════════════════════════════════════════════════════════════════
   27. SIDEBAR
════════════════════════════════════════════════════════════════ */
const Sidebar = {
  _sidebar: null, _toggle: null, _closeBtn: null, _backdrop: null,

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
   28. APP
════════════════════════════════════════════════════════════════ */
const App = {
  async enterDomain(domainId, domain, alias, isFreshJoin) {
    State.currentDomainId = domainId;
    State.domain          = domain;
    State.alias           = alias;
    State.isOwner         = domain.ownerUid === State.uid;

    MySpaces.upsert(domainId, domain.name, alias);

    Router.showScreen(null);

    if (DOM.domainNameDisplay) DOM.domainNameDisplay.textContent = domain.name;
    if (DOM.displayUsername)   DOM.displayUsername.textContent   = alias;
    if (DOM.userAvatar) {
      DOM.userAvatar.textContent      = Utils.userInitial(alias);
      DOM.userAvatar.style.background = Utils.avatarGradient(alias);
    }
    /* Send stays disabled until the editor actually has text (the editor's
       text-change handler enables it). Reset the editor for the new space. */
    Editor.clear();
    if (DOM.sendButton) { DOM.sendButton.disabled = true; DOM.sendButton.setAttribute('aria-disabled', 'true'); }

    InviteUI.render();
    Moderation.refreshPanelVisibility();

    Queue.load();
    Queue.flush();
    await Messages.load();
    Messages.subscribe();
    Reactions.subscribe();
    Typing.subscribe();
    Presence.subscribe();
    Membership.start();
    await Presence.setup();

    if (isFreshJoin) notify(`Welcome to ${domain.name}, ${alias}! 👾`);
    Editor.focus();
    Utils.idle(() => Cleanup.run());
  },

  async leaveDomain() {
    const domainId = State.currentDomainId;
    Typing.stop();
    Presence.stop();
    Listeners.removeAll();
    if (domainId) await Domains.leave(domainId).catch(() => {});
    this._resetDomainState();
    Router.showLanding();
  },

  exitToLanding() {
    Typing.stop();
    Presence.stop();
    Listeners.removeAll();
    this._resetDomainState();
    Router.showLanding();
  },

  _resetDomainState() {
    State.currentDomainId = null;
    State.domain           = null;
    State.alias            = null;
    State.isOwner          = false;
    State.renderedIds.clear();
    State._oldestMsgTs      = Infinity;
    State._initialLoadDone  = false;
    State._chatClearedAt    = 0;
    Reactions._bulk         = null;
    Membership.stop();
    if (DOM.messages) {
      Array.from(DOM.messages.children).forEach(el => {
        if (el !== DOM.emptyState && el.id !== 'ww-pull-indicator' && el !== DOM.scrollBtn) el.remove();
      });
    }
  },
};

/* ════════════════════════════════════════════════════════════════
   29. EVENT WIRING — split into focused sub-functions
════════════════════════════════════════════════════════════════ */
function initRoutingEvents() {
  DOM.landingCreateBtn?.addEventListener('click', () => Router.showCreateScreen());
  DOM.landingJoinBtn?.addEventListener('click', () => Router.submitJoinLink());
  DOM.createDomainSubmitBtn?.addEventListener('click', () => Router.submitCreate());
  DOM.createDomainBackBtn?.addEventListener('click', () => Router.showLanding());
  DOM.joinDomainSubmitBtn?.addEventListener('click', () => Router.submitJoinAlias());
  DOM.joinDomainBackBtn?.addEventListener('click', () => Router.showLanding());
  DOM.joinDomainAliasInput?.addEventListener('keydown', e => { if (e.key === 'Enter') Router.submitJoinAlias(); });
  DOM.joinDomainAliasInput?.addEventListener('input', function () {
    if (DOM.joinDomainAliasCharCount) DOM.joinDomainAliasCharCount.textContent = this.value.length;
  });
}

function initChatEvents() {
  DOM.sendButton?.addEventListener('click',    () => Send.send());
  DOM.refreshButton?.addEventListener('click', () => Messages.load());
  DOM.leaveDomainBtn?.addEventListener('click', () => App.leaveDomain());
  DOM.switchDomainBtn?.addEventListener('click', () => App.leaveDomain());

  $('galleryBtn')?.addEventListener('click', () => { Sidebar.close(); notify('Gallery coming soon!', 'success'); });

  $('clearChatBtn')?.addEventListener('click', () => {
    if (!DOM.messages) return;
    Array.from(DOM.messages.children).forEach(el => {
      if (el !== DOM.emptyState && el.id !== 'ww-pull-indicator' && el !== DOM.scrollBtn) el.remove();
    });
    State.renderedIds.clear();
    State._oldestMsgTs     = Infinity;
    /* Do NOT reset _initialLoadDone here — that would silently stop live
       messages from rendering. Remember the clear time instead. */
    State._chatClearedAt   = Date.now();
    if (DOM.emptyState) DOM.emptyState.hidden = false;
    Sidebar.close();
    notify('Chat cleared locally — new messages will still appear');
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) Typing.stop(); });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      /* Don't steal the shortcut while the user is typing in another field */
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') ) return;
      if (!State.currentDomainId) return;
      e.preventDefault(); Editor.focus();
    }
  });
}

function initWindowEvents() {
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

function initEvents() {
  initRoutingEvents();
  initChatEvents();
  initWindowEvents();
}

/* ════════════════════════════════════════════════════════════════
   30. FATAL ERROR UI
════════════════════════════════════════════════════════════════ */
function showFatalError(err) {
  const msg = err?.message ?? String(err);
  console.error('[WhisperWall boot]', err);
  notify('Startup error: ' + msg, 'error', 8_000);

  const el = $$('.chat-area') ?? $$('.app-wrap') ?? document.body;
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
   31. BOOT
════════════════════════════════════════════════════════════════ */
async function boot() {
  let bootTimeout = null;
  const bootStart = Date.now();

  try {
    const FIREBASE_CONFIG = getFirebaseConfig();

    bootTimeout = setTimeout(() => {
      const elapsed = Math.round((Date.now() - bootStart) / 1_000);
      showFatalError(new Error(
        `Boot timed out after ${elapsed}s (limit ${C.BOOT_TIMEOUT_MS / 1_000}s). ` +
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
    InviteUI.init();
    Moderation.initPanel();
    initEvents();
    initConnection();

    const cred = await State.auth.signInAnonymously();
    clearTimeout(bootTimeout);
    bootTimeout = null;

    State.uid = cred.user.uid;

    await Router.boot();

    /* Global clock — deliberately NOT in State._timers, because that array is
       wiped by Listeners.removeAll() on every space change. */
    State.timerInterval = setInterval(() => Messages.updateTimers(), 60_000);

  } catch (err) {
    if (bootTimeout != null) clearTimeout(bootTimeout);
    showFatalError(err);
  }
}

document.addEventListener('DOMContentLoaded', boot);

/* ════════════════════════════════════════════════════════════════
   GLOBAL API
════════════════════════════════════════════════════════════════ */
/** @returns {Promise<void>} */
window.sendMessage     = () => { if (State.alias) Send.send(); };
/** @returns {Promise<void>} */
window.loadMessages    = () => { if (State.db) Messages.load(); };
/** @returns {void} */
window.changeWallpaper = () => { Wallpaper.cycle(); };
/** @returns {void} */
window.clearWallpaper  = () => { Wallpaper.clearCustom(); };
/** @returns {Promise<void>} */
window.leaveSpace      = () => App.leaveDomain();
/* v11.1: window.* helpers kept for backward compatibility with inline handlers. */
