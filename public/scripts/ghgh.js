const CONFIG = {
  apiKey: 'AIzaSyBaKWaW1qgVxMNeCd1wdWm_o9vR81j7T1w',
  authDomain: 'whisperwalldemo.firebaseapp.com',
  projectId: 'whisperwalldemo',
  storageBucket: 'whisperwalldemo.firebasestorage.app',
  messagingSenderId: '743228341123',
  appId: '1:743228341123:web:1cd60340f5d6a2940ad4b6',
  measurementId: 'G-SJ3504X1T0',
  databaseURL: 'https://whisperwalldemo-default-rtdb.firebaseio.com'
};

class AppState {
  constructor() {
    this.currentUser = null;
    this.userRoles = {};
    this.isTyping = false;
    this.typingUsers = {};
    this.lastMessageTimestamp = 0;
    this.isScrolledToBottom = true;
    this.currentWallpaper = 0;
    this.onlineRef = null;
    this.messagesRef = null;
    this.reactionsRef = null;
    this.typingRef = null;
    this.typingTimeoutRef = null;
    this.quill = null;
    this.availableReactions = ['👍', '💜', '😂', '😮', '👎', '🔥'];
    this.wallpaperVariants = Array.from({length: 14}, (_, i) => 
      `whisper-doodles${i === 0 ? '' : i + 1}.png`
    );
  }
}

firebase.initializeApp(CONFIG);
const db = firebase.database();
const auth = firebase.auth();
const appState = new AppState();

const DOM = {
  themeToggle: document.getElementById('themeToggle'),
  onlineCount: document.getElementById('onlineCount'),
  messages: document.getElementById('messages'),
  username: document.getElementById('username'),
  usernameCharCount: document.getElementById('usernameCharCount'),
  registerButton: document.getElementById('registerButton'),
  displayUsername: document.getElementById('displayUsername'),
  userAvatar: document.getElementById('userAvatar'),
  registerScreen: document.getElementById('registerScreen'),
  chatScreen: document.getElementById('chatScreen'),
  sendButton: document.getElementById('sendButton'),
  messageCharCount: document.getElementById('messageCharCount'),
  refreshButton: document.getElementById('refreshButton'),
  notification: document.getElementById('notification'),
  notificationText: document.getElementById('notificationText'),
  typingIndicator: document.getElementById('typingIndicator'),
  typingUsers: document.getElementById('typingUsers'),
  wallpaperBtn: document.getElementById('wallpaperBtn'),
  formatToggle: document.getElementById('formatToggle'),
  messageEditor: document.getElementById('messageEditor'),
  editorToolbar: document.getElementById('editorToolbar')
};

class Utils {
  static getRelativeTime(timestamp, currentTime = Date.now()) {
    const diff = currentTime - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  static containsProfanity(text) {
    if (!text) return false;
    const profanityList = [
      'fuck', 'asshole', 'bitch', 'fag', 'retard', 'whore', 
      'slut', 'pussy', 'cock', 'bastard', 'douche', 'bombo', 'bombom'
    ];
    const lowercaseText = text.toLowerCase();
    return profanityList.some(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      return regex.test(lowercaseText);
    });
  }

  static filterOldMessages(messages, maxAge = 302400000) {
    const now = Date.now();
    return messages.filter(message => now - message.timestamp < maxAge);
  }

  static getUserBadge(username, userRoles) {
    if (!username || !userRoles[username]) return '';
    const role = userRoles[username];
    const badges = {
      admin: '<span class="user-badge badge-admin"><i class="fas fa-shield-alt"></i> Admin</span>',
      vip: '<span class="user-badge badge-vip"><i class="fas fa-star"></i> VIP</span>',
      new: '<span class="user-badge badge-new"><i class="fas fa-seedling"></i> New</span>'
    };
    return badges[role] || '';
  }

  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  static generateAvatarColor(username) {
    if (!username) return 'hsl(0, 0%, 65%)';
    const hash = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `hsl(${hash % 360}, 70%, 65%)`;
  }
}

class UIManager {
  static showNotification(message, isSuccess = true, duration = 3000) {
    if (!DOM.notification || !DOM.notificationText) {
      console[isSuccess ? 'log' : 'error'](message);
      return;
    }
    DOM.notificationText.textContent = message;
    DOM.notification.className = `notification ${isSuccess ? 'success' : 'error'} show`;
    const icon = DOM.notification.querySelector('i');
    if (icon) {
      icon.className = isSuccess ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
    }
    setTimeout(() => {
      DOM.notification.classList.remove('show');
    }, duration);
  }

  static updateMessageTimers() {
    const timeElements = document.querySelectorAll('.relative-time');
    const currentTime = Date.now();
    timeElements.forEach(element => {
      const timestamp = parseInt(element.getAttribute('data-timestamp'));
      if (!isNaN(timestamp)) {
        element.textContent = Utils.getRelativeTime(timestamp, currentTime);
      }
    });
  }

  static applyWallpaper() {
    const wallpaper = appState.wallpaperVariants[appState.currentWallpaper];
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const lightGradient = 'radial-gradient(circle at 15% 50%, rgba(174, 214, 241, 0.1) 0%, transparent 25%), radial-gradient(circle at 85% 30%, rgba(167, 139, 250, 0.1) 0%, transparent 25%)';
    const darkGradient = 'radial-gradient(circle at 15% 50%, rgba(39, 60, 117, 0.1) 0%, transparent 25%), radial-gradient(circle at 85% 30%, rgba(67, 46, 118, 0.1) 0%, transparent 25%)';
    document.body.style.background = `${isDark ? darkGradient : lightGradient}, url('${wallpaper}')`;
  }

  static changeWallpaper() {
    appState.currentWallpaper = (appState.currentWallpaper + 1) % appState.wallpaperVariants.length;
    this.applyWallpaper();
    localStorage.setItem('wallpaperIndex', appState.currentWallpaper);
    this.showNotification('Wallpaper changed!', true, 2000);
  }

  static createMessageElement(message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    messageEl.id = `message-${message.id}`;
    if (appState.currentUser && message.username === appState.currentUser) {
      messageEl.classList.add('own-message');
    }
    if (message.timestamp > appState.lastMessageTimestamp) {
      messageEl.classList.add('new');
    }
    const timeString = message.timestamp ? 
      new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 
      '';
    messageEl.innerHTML = `
      <div class="message-header">
        <div class="message-username">
          ${message.username || 'unknown'} 
          ${Utils.getUserBadge(message.username, appState.userRoles)}
        </div>
      </div>
      <div class="message-content">${message.message || ''}</div>
      <div class="message-footer">
        <div class="message-time">
          <span class="absolute-time">${timeString}</span>
          <span class="relative-time" data-timestamp="${message.timestamp}"></span>
        </div>
        <div class="reactions-container" id="reactions-${message.id}"></div>
      </div>
    `;
    return messageEl;
  }

  static renderMessagesSnapshot(snapshot) {
    if (!DOM.messages) return;
    if (DOM.refreshButton) {
      DOM.refreshButton.disabled = false;
      DOM.refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
    }
    if (!snapshot.exists()) {
      DOM.messages.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-comment-slash"></i>
          <p>No messages yet. Be the first to post!</p>
        </div>
      `;
      return;
    }
    const messages = [];
    snapshot.forEach(child => {
      messages.push({
        id: child.key,
        ...child.val()
      });
    });
    const filteredMessages = Utils.filterOldMessages(messages);
    filteredMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const latestTimestamp = filteredMessages.length > 0 ? 
      filteredMessages[filteredMessages.length - 1].timestamp : 0;
    if (latestTimestamp > appState.lastMessageTimestamp && 
        DOM.messages.children.length > 0 && 
        !DOM.messages.querySelector('.empty-state')) {
      const newMessages = filteredMessages.filter(
        msg => msg.timestamp > appState.lastMessageTimestamp
      );
      newMessages.forEach(message => {
        const messageEl = this.createMessageElement(message);
        DOM.messages.appendChild(messageEl);
        ReactionManager.loadReactions(message.id, document.getElementById(`reactions-${message.id}`));
      });
      this.highlightNewMessages();
    } else {
      DOM.messages.innerHTML = '';
      filteredMessages.forEach(message => {
        const messageEl = this.createMessageElement(message);
        DOM.messages.appendChild(messageEl);
        const reactionsContainer = document.getElementById(`reactions-${message.id}`);
        if (reactionsContainer) {
          ReactionManager.loadReactions(message.id, reactionsContainer);
        }
      });
    }
    this.updateMessageTimers();
    appState.lastMessageTimestamp = latestTimestamp;
    this.maintainScrollPosition();
  }

  static highlightNewMessages() {
    const newMessages = document.querySelectorAll('.message.new');
    newMessages.forEach(message => {
      message.classList.add('message-highlight');
      setTimeout(() => {
        message.classList.remove('new', 'message-highlight');
      }, 2000);
    });
  }

  static maintainScrollPosition() {
    if (appState.isScrolledToBottom && DOM.messages) {
      setTimeout(() => {
        DOM.messages.scrollTop = DOM.messages.scrollHeight;
      }, 100);
    }
  }
}

class AuthManager {
  static async register() {
    if (!DOM.username) {
      UIManager.showNotification('Username input not found', false);
      return;
    }
    let username = DOM.username.value.trim();
    if (!username) {
      UIManager.showNotification('Please enter a username', false);
      return;
    }
    if (username.length < 3) {
      UIManager.showNotification('Username must be at least 3 characters', false);
      return;
    }
    if (Utils.containsProfanity(username)) {
      UIManager.showNotification('Username contains inappropriate content', false);
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      UIManager.showNotification('Username can only contain letters, numbers, and underscores', false);
      return;
    }
    username = username.replace(/\s+/g, '_');
    const user = auth.currentUser;
    if (!user) {
      UIManager.showNotification('Authentication not ready. Try again.', false);
      return;
    }
    const originalButtonContent = DOM.registerButton?.innerHTML;
    if (DOM.registerButton) {
      DOM.registerButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registering...';
      DOM.registerButton.disabled = true;
    }
    try {
      const usernameSnapshot = await db.ref(`users/${username}`).once('value');
      if (usernameSnapshot.exists()) {
        UIManager.showNotification('Username already taken', false);
        return;
      }
      let role = 'new';
      const lowerUsername = username.toLowerCase();
      if (lowerUsername.includes('admin')) {
        role = 'admin';
      } else if (lowerUsername.includes('vip')) {
        role = 'vip';
      } else if (lowerUsername === 'system') {
        role = 'system';
      }
      appState.userRoles[username] = role;
      const updates = {};
      updates[`users/${username}`] = {
        uid: user.uid,
        username: username,
        registeredAt: Date.now(),
        role: role,
        lastSeen: Date.now()
      };
      updates[`users_by_uid/${user.uid}`] = {
        username: username,
        role: role
      };
      await db.ref().update(updates);
      localStorage.setItem('username', username);
      UIManager.showNotification('Username registered successfully! Reloading...', true, 1500);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      UIManager.showNotification(`Error: ${error.message}`, false);
    } finally {
      if (DOM.registerButton) {
        DOM.registerButton.innerHTML = originalButtonContent;
        DOM.registerButton.disabled = false;
      }
    }
  }

  static updateUserUI(username) {
    if (DOM.displayUsername) {
      DOM.displayUsername.innerHTML = username + Utils.getUserBadge(username, appState.userRoles);
    }
    if (DOM.userAvatar) {
      DOM.userAvatar.textContent = username.charAt(0).toUpperCase();
      DOM.userAvatar.style.backgroundColor = Utils.generateAvatarColor(username);
    }
  }

  static showChat() {
    if (DOM.registerScreen) DOM.registerScreen.style.display = 'none';
    if (DOM.chatScreen) DOM.chatScreen.style.display = 'block';
    setTimeout(() => {
      if (appState.quill) appState.quill.focus();
    }, 300);
  }

  static async loadUserRoles() {
    const cachedRoles = localStorage.getItem('userRoles');
    const cacheTime = localStorage.getItem('userRolesCacheTime');
    if (cachedRoles && cacheTime && Date.now() - parseInt(cacheTime) < 300000) {
      appState.userRoles = JSON.parse(cachedRoles);
      return;
    }
    try {
      const rolesSnapshot = await db.ref('users').once('value');
      if (rolesSnapshot.exists()) {
        rolesSnapshot.forEach(child => {
          const userData = child.val();
          appState.userRoles[userData.username] = userData.role || 'new';
        });
        localStorage.setItem('userRoles', JSON.stringify(appState.userRoles));
        localStorage.setItem('userRolesCacheTime', Date.now().toString());
      }
    } catch (error) {
      console.error('Error loading user roles:', error);
    }
  }
}

class MessageManager {
  static async sendMessage() {
    if (!appState.currentUser) {
      UIManager.showNotification('Please register a username first', false);
      return;
    }
    if (!appState.quill) {
      UIManager.showNotification('Editor not ready', false);
      return;
    }
    const htmlContent = appState.quill.root.innerHTML;
    const plainText = appState.quill.getText().trim();
    if (!plainText) {
      UIManager.showNotification('Please enter a message', false);
      return;
    }
    if (plainText.length > 2500) {
      UIManager.showNotification('Message is too long (max 2500 characters)', false);
      return;
    }
    if (Utils.containsProfanity(plainText)) {
      UIManager.showNotification('Message contains inappropriate content', false);
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      UIManager.showNotification('Not authenticated', false);
      return;
    }
    const originalButtonContent = DOM.sendButton?.innerHTML;
    if (DOM.sendButton) {
      DOM.sendButton.disabled = true;
      DOM.sendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    }
    try {
      const timestamp = Date.now();
      const messageData = {
        username: appState.currentUser,
        uid: user.uid,
        message: htmlContent,
        plainText: plainText,
        timestamp: timestamp
      };
      await db.ref('messages').push(messageData);
      appState.quill.setText('');
      if (DOM.messageCharCount) {
        DOM.messageCharCount.textContent = '0';
        DOM.messageCharCount.style.color = '';
      }
      if (appState.typingRef) {
        appState.typingRef.set(false);
        appState.isTyping = false;
      }
      UIManager.showNotification('Message sent!');
    } catch (error) {
      UIManager.showNotification(`Error: ${error.message}`, false);
    } finally {
      if (DOM.sendButton) {
        DOM.sendButton.disabled = false;
        DOM.sendButton.innerHTML = originalButtonContent;
      }
    }
  }

  static async loadMessages() {
    if (DOM.refreshButton) {
      DOM.refreshButton.disabled = true;
      DOM.refreshButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    }
    try {
      const snapshot = await db.ref('messages')
        .orderByChild('timestamp')
        .limitToLast(50)
        .once('value');
      UIManager.renderMessagesSnapshot(snapshot);
    } catch (error) {
      UIManager.showNotification(`Error loading messages: ${error.message}`, false);
    } finally {
      if (DOM.refreshButton) {
        DOM.refreshButton.disabled = false;
        DOM.refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
      }
    }
  }

  static setupMessageListener() {
    if (appState.messagesRef) {
      appState.messagesRef.off();
    }
    let renderTimeout;
    appState.messagesRef = db.ref('messages')
      .orderByChild('timestamp')
      .limitToLast(50);
    appState.messagesRef.on('value', snapshot => {
      clearTimeout(renderTimeout);
      renderTimeout = setTimeout(() => {
        UIManager.renderMessagesSnapshot(snapshot);
      }, 100);
    });
  }
}

class ReactionManager {
  static async addReaction(messageId, reaction) {
    if (!appState.currentUser) {
      UIManager.showNotification('Please register to react to messages', false);
      return;
    }
    const reactionRef = db.ref(`reactions/${messageId}/${appState.currentUser}`);
    try {
      const snapshot = await reactionRef.once('value');
      if (snapshot.exists() && snapshot.val() === reaction) {
        await reactionRef.remove();
      } else {
        await reactionRef.set(reaction);
      }
    } catch (error) {
      UIManager.showNotification('Failed to add reaction', false);
    }
  }

  static createReactionElement(messageId, emoji, count, isActive, users = []) {
    const reactionEl = document.createElement('div');
    reactionEl.className = `reaction ${isActive ? 'active' : ''}`;
    reactionEl.innerHTML = `
      <span class="reaction-emoji">${emoji}</span>
      <span class="reaction-count">${count}</span>
    `;
    if (users.length > 0) {
      const usersTooltip = document.createElement('div');
      usersTooltip.className = 'reaction-users';
      usersTooltip.textContent = users.join(', ');
      reactionEl.appendChild(usersTooltip);
      reactionEl.title = `${users.join(', ')} reacted with ${emoji}`;
    }
    reactionEl.addEventListener('click', () => this.addReaction(messageId, emoji));
    return reactionEl;
  }

  static showReactionPicker(triggerElement, messageId) {
    const existingPicker = document.querySelector('.reaction-picker');
    if (existingPicker) {
      existingPicker.remove();
      return;
    }
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    appState.availableReactions.forEach(emoji => {
      const emojiEl = document.createElement('div');
      emojiEl.className = 'reaction-emoji';
      emojiEl.textContent = emoji;
      emojiEl.addEventListener('click', () => {
        this.addReaction(messageId, emoji);
        picker.remove();
      });
      picker.appendChild(emojiEl);
    });
    const triggerRect = triggerElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    let top = triggerRect.top - 60;
    if (top + 60 > viewportHeight - 100) {
      top = viewportHeight - 160;
    }
    Object.assign(picker.style, {
      position: 'fixed',
      top: `${top}px`,
      left: `${triggerRect.left - 80}px`,
      zIndex: '1000'
    });
    document.body.appendChild(picker);
    const closePicker = (event) => {
      if (!picker.contains(event.target) && event.target !== triggerElement) {
        picker.remove();
        document.removeEventListener('click', closePicker);
      }
    };
    setTimeout(() => document.addEventListener('click', closePicker), 0);
  }

  static loadReactions(messageId, container) {
    if (!container) return;
    const reactionsRef = db.ref(`reactions/${messageId}`);
    reactionsRef.once('value').then(snapshot => {
      if (!snapshot.exists()) {
        container.innerHTML = `<div class="add-reaction-btn" data-message-id="${messageId}" title="Add reaction">+</div>`;
        this.setupReactionPicker(container, messageId);
        return;
      }
      const reactions = snapshot.val() || {};
      const reactionCounts = {};
      const reactionUsers = {};
      const userReactions = {};
      Object.entries(reactions).forEach(([username, emoji]) => {
        reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
        if (!reactionUsers[emoji]) {
          reactionUsers[emoji] = [];
        }
        reactionUsers[emoji].push(username);
        if (username === appState.currentUser) {
          userReactions[emoji] = true;
        }
      });
      container.innerHTML = '';
      Object.entries(reactionCounts)
        .sort(([, countA], [, countB]) => countB - countA)
        .forEach(([emoji, count]) => {
          const isActive = !!userReactions[emoji];
          const users = reactionUsers[emoji] || [];
          const reactionEl = this.createReactionElement(messageId, emoji, count, isActive, users);
          container.appendChild(reactionEl);
        });
      const addButton = document.createElement('div');
      addButton.className = 'add-reaction-btn';
      addButton.innerHTML = '+';
      addButton.setAttribute('data-message-id', messageId);
      addButton.title = 'Add reaction';
      addButton.addEventListener('click', (event) => {
        event.stopPropagation();
        this.showReactionPicker(event.target, messageId);
      });
      container.appendChild(addButton);
    }).catch(error => {
      console.error('Error loading reactions:', error);
    });
  }

  static setupReactionListener() {
    if (appState.reactionsRef) {
      appState.reactionsRef.off();
    }
    const pendingUpdates = new Set();
    let updateTimeout = null;
    const processPendingUpdates = () => {
      pendingUpdates.forEach(messageId => {
        const container = document.getElementById(`reactions-${messageId}`);
        if (container) {
          this.loadReactions(messageId, container);
        }
      });
      pendingUpdates.clear();
      updateTimeout = null;
    };
    appState.reactionsRef = db.ref('reactions');
    appState.reactionsRef.on('value', snapshot => {
      if (!snapshot.exists()) return;
      snapshot.forEach(child => {
        pendingUpdates.add(child.key);
      });
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      updateTimeout = setTimeout(processPendingUpdates, 100);
    }, error => {
      console.error('Reaction listener error:', error);
      UIManager.showNotification('Error updating reactions', false);
    });
  }
}

class TypingManager {
  static handleTypingIndicator = Utils.debounce(function(text) {
    if (!appState.currentUser || !appState.typingRef) return;
    const isTyping = text.length > 0;
    if (isTyping !== appState.isTyping) {
      appState.isTyping = isTyping;
      appState.typingRef.set(isTyping);
      if (appState.typingTimeoutRef) {
        clearTimeout(appState.typingTimeoutRef);
      }
      if (isTyping) {
        appState.typingTimeoutRef = setTimeout(() => {
          appState.isTyping = false;
          appState.typingRef.set(false);
        }, 3000);
      }
    }
  }, 300);

  static setupTypingListener() {
    if (appState.typingRef) {
      appState.typingRef.off();
    }
    db.ref('typing').on('value', snapshot => {
      if (!snapshot.exists()) {
        DOM.typingIndicator.style.display = 'none';
        return;
      }
      const typingData = snapshot.val();
      const typingUsers = Object.keys(typingData).filter(username => 
        username !== appState.currentUser && typingData[username] === true
      );
      if (typingUsers.length > 0) {
        let typingText = '';
        if (typingUsers.length === 1) {
          typingText = `${typingUsers[0]} is typing`;
        } else if (typingUsers.length === 2) {
          typingText = `${typingUsers[0]} and ${typingUsers[1]} are typing`;
        } else {
          typingText = `${typingUsers[0]}, ${typingUsers[1]} and others are typing`;
        }
        DOM.typingUsers.textContent = typingText;
        DOM.typingIndicator.style.display = 'flex';
      } else {
        DOM.typingIndicator.style.display = 'none';
      }
    });
  }
}

class EditorManager {
  static initQuill() {
    const toolbarOptions = { toolbar: DOM.editorToolbar };
    appState.quill = new Quill('#editor-container', {
      modules: toolbarOptions,
      placeholder: "What's your secret?",
      theme: 'snow'
    });
    let changeTimeout;
    appState.quill.on('text-change', () => {
      clearTimeout(changeTimeout);
      changeTimeout = setTimeout(() => {
        const text = appState.quill.getText().trim();
        const length = text.length;
        if (DOM.messageCharCount) {
          DOM.messageCharCount.textContent = length;
          if (length > 2400) {
            DOM.messageCharCount.style.color = '#e74c3c';
          } else if (length > 2000) {
            DOM.messageCharCount.style.color = '#f39c12';
          } else {
            DOM.messageCharCount.style.color = '';
          }
        }
        if (DOM.sendButton) {
          const isTooLong = length > 2500;
          const isEmpty = length === 0;
          DOM.sendButton.disabled = isEmpty || isTooLong || !appState.currentUser;
        }
        TypingManager.handleTypingIndicator(text);
      }, 300);
    });
    appState.quill.keyboard.addBinding({
      key: 'Enter',
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false
    }, () => {
      if (!DOM.sendButton.disabled) {
        MessageManager.sendMessage();
      }
    });
    if (DOM.formatToggle) {
      DOM.formatToggle.addEventListener('click', function() {
        DOM.editorToolbar.classList.toggle('visible');
        DOM.messageEditor.classList.toggle('expanded');
        const icon = DOM.formatToggle.querySelector('i');
        if (DOM.editorToolbar.classList.contains('visible')) {
          icon.classList.replace('fa-plus', 'fa-times');
        } else {
          icon.classList.replace('fa-times', 'fa-plus');
        }
      });
    }
  }
}

class ThemeManager {
  static initThemeToggle() {
    if (!DOM.themeToggle) return;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedTheme = localStorage.getItem('theme');
    if (!savedTheme && prefersDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    UIManager.applyWallpaper();
    DOM.themeToggle.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
      }
      UIManager.applyWallpaper();
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
      if (localStorage.getItem('theme') === null) {
        if (event.matches) {
          document.documentElement.setAttribute('data-theme', 'dark');
        } else {
          document.documentElement.removeAttribute('data-theme');
        }
        UIManager.applyWallpaper();
      }
    });
  }
}

class OnlineManager {
  static updateOnlineUsers = Utils.debounce(function() {
    db.ref('online').on('value', snapshot => {
      const count = snapshot ? snapshot.numChildren() : 0;
      if (DOM.onlineCount) {
        DOM.onlineCount.textContent = count;
      }
    });
  }, 1000);
}

class ScrollManager {
  static setupScrollTracking() {
    if (!DOM.messages) return;
    DOM.messages.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = DOM.messages;
      appState.isScrolledToBottom = scrollHeight - scrollTop - clientHeight < 50;
    });
  }
}

class UsernameManager {
  static initUsernameInput() {
    if (!DOM.username) return;
    DOM.username.addEventListener('input', function() {
      const length = this.value.length;
      if (DOM.usernameCharCount) {
        DOM.usernameCharCount.textContent = length;
        if (length > 0 && length < 3) {
          DOM.usernameCharCount.style.color = '#e74c3c';
        } else if (length >= 3 && length <= 20) {
          DOM.usernameCharCount.style.color = '#2ecc71';
        } else {
          DOM.usernameCharCount.style.color = '';
        }
      }
      if (DOM.registerButton) {
        DOM.registerButton.disabled = length < 3 || length > 20;
      }
    });
    DOM.username.addEventListener('keypress', event => {
      if (event.key === 'Enter' && !DOM.registerButton.disabled) {
        AuthManager.register();
      }
    });
    DOM.username.addEventListener('blur', function() {
      const username = this.value.trim();
      if (username.length > 0 && username.length < 3) {
        UIManager.showNotification('Username must be at least 3 characters', false);
      }
    });
  }
}

class EventManager {
  static setupEventListeners() {
    if (DOM.registerButton) {
      DOM.registerButton.addEventListener('click', AuthManager.register);
    }
    if (DOM.sendButton) {
      DOM.sendButton.addEventListener('click', MessageManager.sendMessage);
    }
    if (DOM.refreshButton) {
      DOM.refreshButton.addEventListener('click', MessageManager.loadMessages);
    }
    if (DOM.wallpaperBtn) {
      DOM.wallpaperBtn.addEventListener('click', () => UIManager.changeWallpaper());
    }
    window.addEventListener('beforeunload', () => {
      if (appState.onlineRef) appState.onlineRef.remove();
      if (appState.typingRef) appState.typingRef.remove();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && appState.typingRef && appState.isTyping) {
        appState.typingRef.set(false);
        appState.isTyping = false;
      }
    });
  }
}

class App {
  static async init() {
    try {
      EditorManager.initQuill();
      ThemeManager.initThemeToggle();
      UsernameManager.initUsernameInput();
      ScrollManager.setupScrollTracking();
      EventManager.setupEventListeners();
      const savedWallpaper = localStorage.getItem('wallpaperIndex');
      if (savedWallpaper !== null) {
        appState.currentWallpaper = parseInt(savedWallpaper);
      }
      UIManager.applyWallpaper();
      await AuthManager.loadUserRoles();
      const savedUsername = localStorage.getItem('username');
      if (savedUsername) {
        appState.currentUser = savedUsername;
        AuthManager.updateUserUI(savedUsername);
        AuthManager.showChat();
        MessageManager.setupMessageListener();
        ReactionManager.setupReactionListener();
        TypingManager.setupTypingListener();
        OnlineManager.updateOnlineUsers();
        MessageManager.loadMessages();
        await auth.signInAnonymously();
        const user = auth.currentUser;
        if (user) {
          if (appState.onlineRef) {
            appState.onlineRef.remove();
          }
          appState.onlineRef = db.ref(`online/${appState.currentUser}`);
          await appState.onlineRef.set(true);
          appState.onlineRef.onDisconnect().remove();
          if (appState.typingRef) {
            appState.typingRef.remove();
          }
          appState.typingRef = db.ref(`typing/${appState.currentUser}`);
          await appState.typingRef.set(false);
          appState.typingRef.onDisconnect().remove();
        }
      } else {
        await auth.signInAnonymously();
      }
      appState.timerInterval = setInterval(() => {
        UIManager.updateMessageTimers();
      }, 60000);
    } catch (error) {
      UIManager.showNotification(`Authentication error: ${error.message}`, false);
      console.error('Init error:', error);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

window.register = AuthManager.register;
window.sendMessage = MessageManager.sendMessage;
window.loadMessages = MessageManager.loadMessages;
window.changeWallpaper = () => UIManager.changeWallpaper();
