// scripts/app.js
// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBaKWaW1qgVxMNeCd1wdWm_o9vR81j7T1w",
    authDomain: "whisperwalldemo.firebaseapp.com",
    projectId: "whisperwalldemo",
    storageBucket: "whisperwalldemo.firebasestorage.app",
    messagingSenderId: "743228341123",
    appId: "1:743228341123:web:1cd60340f5d6a2940ad4b6",
    measurementId: "G-SJ3504X1T0",
    databaseURL: "https://whisperwalldemo-default-rtdb.firebaseio.com"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

// Application state management
const AppState = {
    currentUser: null,
    onlineRef: null,
    messagesRef: null,
    reactionsRef: null,
    typingRef: null,
    typingTimeoutRef: null,
    quill: null,
    userRoles: {},
    availableReactions: ['👍','💜','😂','😮','👎','🔥'],
    isTyping: false,
    typingUsers: {},
    messageListeners: [],
    lastMessageTimestamp: 0,
    isScrolledToBottom: true,
    wallpaperVariants: [
        'whisper-doodles.png',
        'whisper-doodles2.png',
        'whisper-doodles3.png',
        'whisper-doodles4.png',
        'whisper-doodles5.png',
        'whisper-doodles6.png',
        'whisper-doodles7.png',
        'whisper-doodles8.png',
        'whisper-doodles9.png',
        'whisper-doodles10.png',
        'whisper-doodles11.png',
        'whisper-doodles12.png',
        'whisper-doodles13.png',
        'whisper-doodles14.png',
    ],
    currentWallpaper: 0,
    timerInterval: null
};

// DOM Elements cache
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

// Utility functions
const Utils = {
    getRelativeTime(timestamp, now = Date.now()) {
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    },
    
    containsProfanity(text) {
        if (!text) return false;
        
        const profanityList = [
            "fuck", "asshole", "bitch", "fag", 
            "retard", "whore", "slut", "pussy", "cock", "bastard", "douche","bombo","bombom"
        ];
        
        const lowerText = text.toLowerCase();
        return profanityList.some(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            return regex.test(lowerText);
        });
    },
    
    filterOldMessages(messages) {
        const threeAndHalfDays = 3.5 * 24 * 60 * 60 * 1000;
        const currentTime = Date.now();
        
        return messages.filter(message => {
            return currentTime - message.timestamp < threeAndHalfDays;
        });
    },
    
    getUserBadge(username, userRoles) {
        if (!username) return '';
        
        if (userRoles[username] === 'admin') {
            return '<span class="user-badge badge-admin"><i class="fas fa-shield-alt"></i> Admin</span>';
        } else if (userRoles[username] === 'vip') {
            return '<span class="user-badge badge-vip"><i class="fas fa-star"></i> VIP</span>';
        } else if (userRoles[username] === 'new') {
            return '<span class="user-badge badge-new"><i class="fas fa-seedling"></i> New</span>';
        }r
        return '';
    },
    
    debounce(func, wait) {
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
};

// UI Management
const UIManager = {
    showNotification(message, success = true, duration = 3000) {
        if (!DOM.notification || !DOM.notificationText) {
            console[success ? 'log' : 'error'](message);
            return;
        }
        
        DOM.notificationText.textContent = message;
        DOM.notification.className = `notification ${success ? 'success' : 'error'} show`;
        
        const icon = DOM.notification.querySelector('i');
        if (icon) {
            icon.className = success ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
        }
        
        setTimeout(() => {
            DOM.notification.classList.remove("show");
        }, duration);
    },
    
    updateMessageTimers() {
        const timeElements = document.querySelectorAll('.relative-time');
        const now = Date.now();
        
        timeElements.forEach(element => {
            const timestamp = parseInt(element.getAttribute('data-timestamp'));
            if (!isNaN(timestamp)) {
                element.textContent = Utils.getRelativeTime(timestamp, now);
            }
        });
    },
    
    applyWallpaper() {
        const wallpaperUrl = AppState.wallpaperVariants[AppState.currentWallpaper];
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";

        document.body.style.background = `
            radial-gradient(circle at 15% 50%, ${
                isDark ? "rgba(39, 60, 117, 0.1)" : "rgba(174, 214, 241, 0.1)"
            } 0%, transparent 25%),
            radial-gradient(circle at 85% 30%, ${
                isDark ? "rgba(67, 46, 118, 0.1)" : "rgba(167, 139, 250, 0.1)"
            } 0%, transparent 25%),
            url('${wallpaperUrl}')
        `;
    },
    
    changeWallpaper() {
        AppState.currentWallpaper = (AppState.currentWallpaper + 1) % AppState.wallpaperVariants.length;
        this.applyWallpaper();
        
        localStorage.setItem('wallpaperIndex', AppState.currentWallpaper);
        UIManager.showNotification(`Wallpaper changed!`, true, 2000);
    },
    
    highlightNewMessages() {
        const newMessages = document.querySelectorAll('.message.new');
        newMessages.forEach(msg => {
            msg.classList.add('message-highlight');
            
            setTimeout(() => {
                msg.classList.remove('new');
                msg.classList.remove('message-highlight');
            }, 2000);
        });
    },
    
    maintainScrollPosition() {
        if (AppState.isScrolledToBottom && DOM.messages) {
            setTimeout(() => {
                DOM.messages.scrollTop = DOM.messages.scrollHeight;
            }, 100);
        }
    },
    
    createMessageElement(message) {
        const messageEl = document.createElement("div");
        messageEl.className = "message";
        messageEl.id = "message-" + message.id;
        
        if (AppState.currentUser && message.username === AppState.currentUser) {
            messageEl.classList.add("own-message");
        }
        
        if (message.timestamp > AppState.lastMessageTimestamp) {
            messageEl.classList.add("new");
        }

        const timeDisplay = message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : '';

        messageEl.innerHTML = `
            <div class="message-header">
                <div class="message-username">${message.username || 'unknown'} ${Utils.getUserBadge(message.username, AppState.userRoles)}</div>
            </div>
            <div class="message-content">${message.message || ''}</div>
            <div class="message-footer">
                <div class="message-time">
                    <span class="absolute-time">${timeDisplay}</span>
                    <span class="relative-time" data-timestamp="${message.timestamp}"></span>
                </div>
                <div class="reactions-container" id="reactions-${message.id}"></div>
            </div>
        `;

        return messageEl;
    },
    
    renderMessagesSnapshot(snapshot) {
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
        snapshot.forEach(childSnapshot => {
            messages.push({ id: childSnapshot.key, ...childSnapshot.val() });
        });

        const filteredMessages = Utils.filterOldMessages(messages);
        filteredMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        const latestMessageTime = filteredMessages.length > 0 ? 
            filteredMessages[filteredMessages.length - 1].timestamp : 0;
        
        if (latestMessageTime > AppState.lastMessageTimestamp && 
            DOM.messages.children.length > 0 && 
            !DOM.messages.querySelector('.empty-state')) {
            
            const newMessages = filteredMessages.filter(msg => msg.timestamp > AppState.lastMessageTimestamp);
            
            newMessages.forEach(m => {
                const messageEl = this.createMessageElement(m);
                DOM.messages.appendChild(messageEl);
                
                const reactionsContainer = document.getElementById(`reactions-${m.id}`);
                if (reactionsContainer) ReactionManager.loadReactions(m.id, reactionsContainer);
            });
            
            this.highlightNewMessages();
        } else {
            DOM.messages.innerHTML = '';
            
            filteredMessages.forEach(m => {
                const messageEl = this.createMessageElement(m);
                DOM.messages.appendChild(messageEl);
                
                const reactionsContainer = document.getElementById(`reactions-${m.id}`);
                if (reactionsContainer) ReactionManager.loadReactions(m.id, reactionsContainer);
            });
        }
        
        this.updateMessageTimers();
        AppState.lastMessageTimestamp = latestMessageTime;
        this.maintainScrollPosition();
    }
};

// Authentication and User Management
const AuthManager = {
    async register() {
        if (!DOM.username) {
            UIManager.showNotification("Username input not found", false);
            return;
        }

        let username = DOM.username.value.trim();
        if (!username) {
            UIManager.showNotification("Please enter a username", false);
            return;
        }
        
        if (username.length < 3) {
            UIManager.showNotification("Username must be at least 3 characters", false);
            return;
        }
        
        if (Utils.containsProfanity(username)) {
            UIManager.showNotification("Username contains inappropriate content", false);
            return;
        }
        
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            UIManager.showNotification("Username can only contain letters, numbers, and underscores", false);
            return;
        }

        username = username.replace(/\s+/g, '_');

        const user = auth.currentUser;
        if (!user) {
            UIManager.showNotification("Authentication not ready. Try again.", false);
            return;
        }

        const uid = user.uid;
        const originalText = DOM.registerButton ? DOM.registerButton.innerHTML : null;
        
        if (DOM.registerButton) {
            DOM.registerButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registering...';
            DOM.registerButton.disabled = true;
        }

        try {
            const snapshot = await db.ref('users/' + username).once('value');
            if (snapshot.exists()) {
                UIManager.showNotification("Username already taken", false);
                if (DOM.registerButton) {
                    DOM.registerButton.innerHTML = originalText;
                    DOM.registerButton.disabled = false;
                }
                return;
            }

            let userRole = 'new';
            if (username.toLowerCase().includes('admin')) userRole = 'admin';
            else if (username.toLowerCase().includes('vip')) userRole = 'vip';
            else if (username.toLowerCase() === 'system') userRole = 'system';
            
            AppState.userRoles[username] = userRole;

            const updates = {};
            updates['users/' + username] = { 
                uid: uid, 
                username: username, 
                registeredAt: Date.now(),
                role: userRole,
                lastSeen: Date.now()
            };
            updates['users_by_uid/' + uid] = { 
                username: username,
                role: userRole
            };

            await db.ref().update(updates);

            localStorage.setItem("username", username);
            AppState.currentUser = username;
            
            if (DOM.displayUsername) {
                DOM.displayUsername.innerHTML = username + Utils.getUserBadge(username, AppState.userRoles);
            }
            
            if (DOM.userAvatar) {
                DOM.userAvatar.textContent = username.charAt(0).toUpperCase();
                const hue = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
                DOM.userAvatar.style.backgroundColor = `hsl(${hue}, 70%, 65%)`;
            }

            if (AppState.onlineRef) {
                AppState.onlineRef.remove();
                AppState.onlineRef = null;
            }
            
            AppState.onlineRef = db.ref('online/' + username);
            await AppState.onlineRef.set(true);
            AppState.onlineRef.onDisconnect().remove();
            
            if (AppState.typingRef) {
                AppState.typingRef.remove();
                AppState.typingRef = null;
            }
            
            AppState.typingRef = db.ref('typing/' + username);
            await AppState.typingRef.set(false);
            AppState.typingRef.onDisconnect().remove();

            this.showChat();
            UIManager.showNotification("Username registered successfully!");
            
            MessageManager.loadMessages();
            TypingManager.setupTypingListener();
            
        } catch (err) {
            UIManager.showNotification("Error: " + (err.message || err), false);
            if (DOM.registerButton) {
                DOM.registerButton.innerHTML = originalText;
                DOM.registerButton.disabled = false;
            }
        }
    },
    
    showChat() {
        if (DOM.registerScreen) {
            DOM.registerScreen.style.display = "none";
        }
        if (DOM.chatScreen) {
            DOM.chatScreen.style.display = "block";
        }
        
        if (AppState.quill) {
            setTimeout(() => AppState.quill.focus(), 100);
        }
    },
    
    async loadUserRoles() {
        const cachedRoles = localStorage.getItem('userRoles');
        const cacheTime = localStorage.getItem('userRolesCacheTime');
        
        if (cachedRoles && cacheTime && Date.now() - parseInt(cacheTime) < 300000) {
            AppState.userRoles = JSON.parse(cachedRoles);
            return;
        }
        
        try {
            const snapshot = await db.ref('users').once('value');
            if (snapshot.exists()) {
                snapshot.forEach(childSnapshot => {
                    const userData = childSnapshot.val();
                    AppState.userRoles[userData.username] = userData.role || 'new';
                });
                
                localStorage.setItem('userRoles', JSON.stringify(AppState.userRoles));
                localStorage.setItem('userRolesCacheTime', Date.now().toString());
            }
        } catch (err) {
            console.error('Error loading user roles:', err);
        }
    }
};

// Message Management
const MessageManager = {
    async sendMessage() {
        if (!AppState.currentUser) {
            UIManager.showNotification("Please register a username first", false);
            return;
        }

        if (!AppState.quill) {
            UIManager.showNotification("Editor not ready", false);
            return;
        }

        const messageContent = AppState.quill.root.innerHTML;
        const plainText = AppState.quill.getText().trim();
        
        if (!plainText) {
            UIManager.showNotification("Please enter a message", false);
            return;
        }
        
        if (plainText.length > 2500) {
            UIManager.showNotification("Message is too long (max 2500 characters)", false);
            return;
        }
        
        if (Utils.containsProfanity(plainText)) {
            UIManager.showNotification("Message contains inappropriate content", false);
            return;
        }

        const user = auth.currentUser;
        if (!user) {
            UIManager.showNotification("Not authenticated", false);
            return;
        }

        const uid = user.uid;
        const originalText = DOM.sendButton ? DOM.sendButton.innerHTML : null;
        
        if (DOM.sendButton) {
            DOM.sendButton.disabled = true;
            DOM.sendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        }

        try {
            const now = Date.now();
            await db.ref('messages').push({
                username: AppState.currentUser,
                uid: uid,
                message: messageContent,
                plainText: plainText,
                timestamp: now
            });

            AppState.quill.setText('');
            
            if (DOM.messageCharCount) {
                DOM.messageCharCount.textContent = "0";
                DOM.messageCharCount.style.color = '';
            }
            
            if (AppState.typingRef) {
                AppState.typingRef.set(false);
                AppState.isTyping = false;
            }
            
            UIManager.showNotification("Message sent!");
        } catch (err) {
            UIManager.showNotification("Error: " + (err.message || err), false);
        } finally {
            if (DOM.sendButton) {
                DOM.sendButton.disabled = false;
                DOM.sendButton.innerHTML = originalText;
            }
        }
    },
    
    async loadMessages() {
        if (DOM.refreshButton) {
            DOM.refreshButton.disabled = true;
            DOM.refreshButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        }

        try {
            const snapshot = await db.ref('messages').orderByChild('timestamp').limitToLast(50).once('value');
            UIManager.renderMessagesSnapshot(snapshot);
        } catch (err) {
            UIManager.showNotification("Error loading messages: " + (err.message || err), false);
            if (DOM.refreshButton) {
                DOM.refreshButton.disabled = false;
                DOM.refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
            }
        }
    },
    
    setupMessageListener() {
        if (AppState.messagesRef) {
            AppState.messagesRef.off();
        }
        
        let messageUpdateTimeout;
        AppState.messagesRef = db.ref('messages').orderByChild('timestamp').limitToLast(50);
        
        AppState.messagesRef.on('value', snapshot => {
            clearTimeout(messageUpdateTimeout);
            messageUpdateTimeout = setTimeout(() => {
                UIManager.renderMessagesSnapshot(snapshot);
            }, 100);
        });
    }
};

// Reaction Management
const ReactionManager = {
    addReaction(messageId, emoji) {
        if (!AppState.currentUser) {
            UIManager.showNotification("Please register to react to messages", false);
            return;
        }
        
        const reactionRef = db.ref(`reactions/${messageId}/${AppState.currentUser}`);
        reactionRef.once('value').then(snapshot => {
            if (snapshot.exists() && snapshot.val() === emoji) {
                return reactionRef.remove();
            } else {
                return reactionRef.set(emoji);
            }
        }).catch(err => UIManager.showNotification("Failed to add reaction", false));
    },
    
    createReactionElement(messageId, emoji, count, userReacted, users) {
        const reactionEl = document.createElement('div');
        reactionEl.className = `reaction ${userReacted ? 'active' : ''}`;
        reactionEl.innerHTML = `
            <span class="reaction-emoji">${emoji}</span>
            <span class="reaction-count">${count}</span>
        `;
        
        if (users && users.length > 0) {
            const userList = document.createElement('div');
            userList.className = 'reaction-users';
            userList.textContent = users.join(', ');
            reactionEl.appendChild(userList);
            
            reactionEl.title = `${users.join(', ')} reacted with ${emoji}`;
        }
        
        reactionEl.addEventListener('click', () => this.addReaction(messageId, emoji));
        return reactionEl;
    },
    
    showReactionPicker(button, messageId) {
        const existingPicker = document.querySelector('.reaction-picker');
        if (existingPicker) {
            existingPicker.remove();
            return;
        }
        
        const picker = document.createElement('div');
        picker.className = 'reaction-picker';
        
        AppState.availableReactions.forEach(emoji => {
            const emojiEl = document.createElement('div');
            emojiEl.className = 'reaction-emoji';
            emojiEl.textContent = emoji;
            emojiEl.addEventListener('click', () => {
                this.addReaction(messageId, emoji);
                picker.remove();
            });
            picker.appendChild(emojiEl);
        });
        
        const rect = button.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        
        let topPosition = rect.top - 60;
        if (topPosition + 60 > viewportHeight - 100) {
            topPosition = viewportHeight - 160;
        }
        
        picker.style.position = 'fixed';
        picker.style.top = topPosition + 'px';
        picker.style.left = (rect.left - 80) + 'px';
        picker.style.zIndex = '1000';
        
        document.body.appendChild(picker);
        
        const closePicker = (ev) => {
            if (!picker.contains(ev.target) && ev.target !== button) {
                picker.remove();
                document.removeEventListener('click', closePicker);
            }
        };
        
        setTimeout(() => document.addEventListener('click', closePicker), 0);
    },
    
    setupReactionPicker(container, messageId) {
        const addButton = container.querySelector('.add-reaction-btn');
        if (addButton) {
            addButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showReactionPicker(e.target, messageId);
            });
        }
    },
    
    loadReactions(messageId, container) {
        const path = `reactions/${messageId}`;
        
        db.ref(path).once('value').then((snapshot) => {
            if (!container) return;
            
            if (!snapshot.exists()) {
                container.innerHTML = `<div class="add-reaction-btn" data-message-id="${messageId}" title="Add reaction">+</div>`;
                this.setupReactionPicker(container, messageId);
                return;
            }

            const reactions = snapshot.val() || {};
            const reactionCounts = {};
            const userReactions = {};
            const reactionUsers = {};

            Object.keys(reactions).forEach((username) => {
                const emoji = reactions[username];
                reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
                if (username === AppState.currentUser) userReactions[emoji] = true;
                
                if (!reactionUsers[emoji]) {
                    reactionUsers[emoji] = [];
                }
                reactionUsers[emoji].push(username);
            });

            container.innerHTML = '';
            
            Object.entries(reactionCounts)
                .sort((a, b) => b[1] - a[1])
                .forEach(([emoji, count]) => {
                    const userReacted = !!userReactions[emoji];
                    const users = reactionUsers[emoji] || [];
                    const reactionEl = this.createReactionElement(messageId, emoji, count, userReacted, users);
                    container.appendChild(reactionEl);
                });

            const addButton = document.createElement('div');
            addButton.className = 'add-reaction-btn';
            addButton.innerHTML = '+';
            addButton.setAttribute('data-message-id', messageId);
            addButton.title = "Add reaction";
            
            addButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showReactionPicker(e.target, messageId);
            });
            
            container.appendChild(addButton);
        }).catch((error) => {
            console.error('Error loading reactions:', error);
        });
    },
    
    setupReactionListener() {
        if (AppState.reactionsRef) {
            AppState.reactionsRef.off();
        }
        
        AppState.reactionsRef = db.ref('reactions');
        
        const reactionUpdateQueue = new Set();
        let reactionUpdateTimeout = null;
        
        const processReactionUpdates = () => {
            reactionUpdateQueue.forEach(messageId => {
                const container = document.getElementById(`reactions-${messageId}`);
                if (container) {
                    this.loadReactions(messageId, container);
                }
            });
            reactionUpdateQueue.clear();
            reactionUpdateTimeout = null;
        };
        
        AppState.reactionsRef.on('value', (snapshot) => {
            if (!snapshot.exists()) return;
            
            snapshot.forEach((messageSnapshot) => {
                reactionUpdateQueue.add(messageSnapshot.key);
            });
            
            if (reactionUpdateTimeout) {
                clearTimeout(reactionUpdateTimeout);
            }
            
            reactionUpdateTimeout = setTimeout(processReactionUpdates, 100);
        }, (error) => {
            console.error('Reaction listener error:', error);
            UIManager.showNotification('Error updating reactions', false);
        });
    }
};

// Typing Management
const TypingManager = {
    handleTypingIndicator: Utils.debounce(function(text) {
        if (!AppState.currentUser || !AppState.typingRef) return;
        
        const currentlyTyping = text.length > 0;
        
        if (currentlyTyping !== AppState.isTyping) {
            AppState.isTyping = currentlyTyping;
            AppState.typingRef.set(currentlyTyping);
            
            if (AppState.typingTimeoutRef) {
                clearTimeout(AppState.typingTimeoutRef);
            }
            
            if (currentlyTyping) {
                AppState.typingTimeoutRef = setTimeout(() => {
                    AppState.isTyping = false;
                    AppState.typingRef.set(false);
                }, 3000);
            }
        }
    }, 300),
    
    setupTypingListener() {
        if (AppState.typingRef) {
            AppState.typingRef.off();
        }
        
        db.ref('typing').on('value', (snapshot) => {
            if (!snapshot.exists()) {
                DOM.typingIndicator.style.display = 'none';
                return;
            }
            
            const typingData = snapshot.val();
            const typingUsernames = [];
            
            Object.keys(typingData).forEach(username => {
                if (username !== AppState.currentUser && typingData[username] === true) {
                    typingUsernames.push(username);
                }
            });
            
            if (typingUsernames.length > 0) {
                let typingText = '';
                if (typingUsernames.length === 1) {
                    typingText = `${typingUsernames[0]} is typing`;
                } else if (typingUsernames.length === 2) {
                    typingText = `${typingUsernames[0]} and ${typingUsernames[1]} are typing`;
                } else {
                    typingText = `${typingUsernames[0]}, ${typingUsernames[1]} and others are typing`;
                }
                
                DOM.typingUsers.textContent = typingText;
                DOM.typingIndicator.style.display = 'flex';
            } else {
                DOM.typingIndicator.style.display = 'none';
            }
        });
    }
};

// Editor Management
const EditorManager = {
    initQuill() {
        AppState.quill = new Quill('#editor-container', {
            modules: {
                toolbar: DOM.editorToolbar
            },
            placeholder: "What's your secret?",
            theme: 'snow'
        });

        let textChangeTimeout;
        AppState.quill.on('text-change', () => {
            clearTimeout(textChangeTimeout);
            textChangeTimeout = setTimeout(() => {
                const plainText = AppState.quill.getText().trim();
                const charCount = plainText.length;

                if (DOM.messageCharCount) {
                    DOM.messageCharCount.textContent = charCount;
                    
                    if (charCount > 2400) {
                        DOM.messageCharCount.style.color = '#e74c3c';
                    } else if (charCount > 2000) {
                        DOM.messageCharCount.style.color = '#f39c12';
                    } else {
                        DOM.messageCharCount.style.color = '';
                    }
                }

                if (DOM.sendButton) {
                    const tooLong = charCount > 2500;
                    const tooShort = charCount === 0;
                    DOM.sendButton.disabled = tooShort || tooLong || !AppState.currentUser;
                }

                TypingManager.handleTypingIndicator(plainText);
            }, 300);
        });
        
        AppState.quill.keyboard.addBinding({
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

        // Toggle formatting toolbar
        if (DOM.formatToggle) {
            DOM.formatToggle.addEventListener('click', function() {
                DOM.editorToolbar.classList.toggle('visible');
                DOM.messageEditor.classList.toggle('expanded');
                
                // Change icon between + and x
                const icon = DOM.formatToggle.querySelector('i');
                if (DOM.editorToolbar.classList.contains('visible')) {
                    icon.classList.remove('fa-plus');
                    icon.classList.add('fa-times');
                } else {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-plus');
                }
            });
        }
    }
};

// Theme Management
const ThemeManager = {
    initThemeToggle() {
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
            const currentTheme = document.documentElement.getAttribute('data-theme');
            if (currentTheme === 'dark') {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('theme', 'light');
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
            }
            UIManager.applyWallpaper();
        });

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (localStorage.getItem('theme') === null) {
                if (e.matches) {
                    document.documentElement.setAttribute('data-theme', 'dark');
                } else {
                    document.documentElement.removeAttribute('data-theme');
                }
                UIManager.applyWallpaper();
            }
        });
    }
};

// Online Users Management
const OnlineManager = {
    updateOnlineUsers: Utils.debounce(function() {
        db.ref('online').on('value', snapshot => {
            const onlineCount = snapshot ? snapshot.numChildren() : 0;
            if (DOM.onlineCount) {
                DOM.onlineCount.textContent = onlineCount;
            }
        });
    }, 1000)
};

// Scroll Management
const ScrollManager = {
    setupScrollTracking() {
        if (DOM.messages) {
            DOM.messages.addEventListener('scroll', () => {
                const { scrollTop, scrollHeight, clientHeight } = DOM.messages;
                AppState.isScrolledToBottom = scrollHeight - scrollTop - clientHeight < 50;
            });
        }
    }
};

// Username Input Management
const UsernameManager = {
    initUsernameInput() {
        if (!DOM.username) return;
        
        DOM.username.addEventListener('input', function() {
            const charCount = this.value.length;
            if (DOM.usernameCharCount) {
                DOM.usernameCharCount.textContent = charCount;
                
                if (charCount > 0 && charCount < 3) {
                    DOM.usernameCharCount.style.color = '#e74c3c';
                } else if (charCount >= 3 && charCount <= 20) {
                    DOM.usernameCharCount.style.color = '#2ecc71';
                } else {
                    DOM.usernameCharCount.style.color = '';
                }
            }
            
            if (DOM.registerButton) {
                DOM.registerButton.disabled = charCount < 3 || charCount > 20;
            }
        });

        DOM.username.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !DOM.registerButton.disabled) {
                AuthManager.register();
            }
        });
        
        DOM.username.addEventListener('blur', function() {
            const username = this.value.trim();
            if (username.length > 0 && username.length < 3) {
                UIManager.showNotification("Username must be at least 3 characters", false);
            }
        });
    }
};

// Event Listeners Management
const EventManager = {
    setupEventListeners() {
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
            if (AppState.onlineRef) {
                AppState.onlineRef.remove();
            }
            if (AppState.typingRef) {
                AppState.typingRef.remove();
            }
        });
        
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && AppState.typingRef && AppState.isTyping) {
                AppState.typingRef.set(false);
                AppState.isTyping = false;
            }
        });
    }
};

// Main Application Initialization
const App = {
    async init() {
        try {
            EditorManager.initQuill();
            ThemeManager.initThemeToggle();
            UsernameManager.initUsernameInput();
            ScrollManager.setupScrollTracking();
            
            const savedWallpaper = localStorage.getItem('wallpaperIndex');
            if (savedWallpaper !== null) {
                AppState.currentWallpaper = parseInt(savedWallpaper);
            }
            
            UIManager.applyWallpaper();
            
            await AuthManager.loadUserRoles();
            
            const savedUsername = localStorage.getItem("username");
            
            if (savedUsername) {
                AppState.currentUser = savedUsername;
                
                if (DOM.username) {
                    DOM.username.value = savedUsername;
                }
                
                if (DOM.displayUsername) {
                    DOM.displayUsername.innerHTML = savedUsername + Utils.getUserBadge(savedUsername, AppState.userRoles);
                }
                
                if (DOM.userAvatar) {
                    DOM.userAvatar.textContent = savedUsername.charAt(0).toUpperCase();
                    const hue = savedUsername.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
                    DOM.userAvatar.style.backgroundColor = `hsl(${hue}, 70%, 65%)`;
                }
                
                AuthManager.showChat();
                MessageManager.setupMessageListener();
                ReactionManager.setupReactionListener();
                TypingManager.setupTypingListener();
            }

            await auth.signInAnonymously();
            const user = auth.currentUser;
            
            if (!user) {
                throw new Error('Authentication failed');
            }
            
            const uid = user.uid;
            
            try {
                const snapshot = await db.ref('users_by_uid/' + uid).once('value');
                
                if (snapshot.exists()) {
                    const userData = snapshot.val();
                    const savedUsername = userData.username;
                    const role = userData.role || 'new';
                    
                    if (savedUsername && !AppState.currentUser) {
                        AppState.currentUser = savedUsername;
                        AppState.userRoles[savedUsername] = role;
                        
                        if (DOM.displayUsername) {
                            DOM.displayUsername.innerHTML = savedUsername + Utils.getUserBadge(savedUsername, AppState.userRoles);
                        }
                        
                        if (DOM.userAvatar) {
                            DOM.userAvatar.textContent = savedUsername.charAt(0).toUpperCase();
                            const hue = savedUsername.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
                            DOM.userAvatar.style.backgroundColor = `hsl(${hue}, 70%, 65%)`;
                        }
                        
                        AuthManager.showChat();
                        MessageManager.setupMessageListener();
                        ReactionManager.setupReactionListener();
                        TypingManager.setupTypingListener();
                    }
                }
            } catch (err) {
                console.warn('users_by_uid lookup failed', err);
            }
            
            if (AppState.currentUser) {
                if (AppState.onlineRef) {
                    AppState.onlineRef.remove();
                    AppState.onlineRef = null;
                }
                
                AppState.onlineRef = db.ref('online/' + AppState.currentUser);
                await AppState.onlineRef.set(true);
                AppState.onlineRef.onDisconnect().remove();
                
                if (AppState.typingRef) {
                    AppState.typingRef.remove();
                    AppState.typingRef = null;
                }
                
                AppState.typingRef = db.ref('typing/' + AppState.currentUser);
                await AppState.typingRef.set(false);
                AppState.typingRef.onDisconnect().remove();
            }
            
            OnlineManager.updateOnlineUsers();
            MessageManager.loadMessages();
            
            // Set up interval to update message timers every minute
            AppState.timerInterval = setInterval(() => {
                UIManager.updateMessageTimers();
            }, 60000);
            
        } catch (err) {
            UIManager.showNotification("Authentication error: " + (err.message || err), false);
            console.error("Init error:", err);
        }
    }
};

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    EventManager.setupEventListeners();
    App.init();
});

// Expose functions to global for buttons
window.register = AuthManager.register;
window.sendMessage = MessageManager.sendMessage;
window.loadMessages = MessageManager.loadMessages;
window.changeWallpaper = () => UIManager.changeWallpaper();
