// Image Gallery with Firebase
document.addEventListener('DOMContentLoaded', function() {
    // Firebase Configuration
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
    const storage = firebase.storage();

    // DOM Elements
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('preview-container');
    const imagePreview = document.getElementById('image-preview');
    const uploadBtn = document.getElementById('upload-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const gallery = document.getElementById('gallery');
    const progressBar = document.querySelector('.progress-bar');
    const progress = document.getElementById('progress');
    const captionInput = document.getElementById('caption-input');
    const expirySelect = document.getElementById('expiry-select');
    const searchInput = document.getElementById('search-input');
    const filterSelect = document.getElementById('filter-select');
    const sortSelect = document.getElementById('sort-select');
    
    // Add auth UI elements
    const authContainer = document.createElement('div');
    authContainer.className = 'auth-container';
    authContainer.innerHTML = `
        <div class="auth-buttons">
            <button id="signin-btn" class="btn btn-primary">
                <i class="fas fa-sign-in-alt"></i> Sign In
            </button>
            <button id="signout-btn" class="btn btn-secondary" style="display: none;">
                <i class="fas fa-sign-out-alt"></i> Sign Out
            </button>
        </div>
        <div id="user-info" class="user-info" style="display: none;">
            <span id="user-email"></span>
        </div>
    `;
    document.querySelector('.gallery-header').prepend(authContainer);

    const signinBtn = document.getElementById('signin-btn');
    const signoutBtn = document.getElementById('signout-btn');
    const userInfo = document.getElementById('user-info');
    const userEmail = document.getElementById('user-email');

    // Store images with metadata
    let images = [];
    let currentUser = null;

    // Authentication functions
    function initAuth() {
        auth.onAuthStateChanged((user) => {
            if (user) {
                currentUser = user;
                userEmail.textContent = user.email;
                userInfo.style.display = 'block';
                signinBtn.style.display = 'none';
                signoutBtn.style.display = 'block';
                initGallery();
            } else {
                currentUser = null;
                userInfo.style.display = 'none';
                signinBtn.style.display = 'block';
                signoutBtn.style.display = 'none';
                images = [];
                renderGallery(images);
                showAlert('Please sign in to view and upload images', 'info');
            }
        });

        signinBtn.addEventListener('click', signIn);
        signoutBtn.addEventListener('click', signOut);
    }

    function signIn() {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider)
            .then((result) => {
                showAlert('Signed in successfully!', 'success');
            })
            .catch((error) => {
                showAlert('Sign in failed: ' + error.message);
            });
    }

    function signOut() {
        auth.signOut()
            .then(() => {
                showAlert('Signed out successfully', 'info');
            })
            .catch((error) => {
                showAlert('Sign out failed: ' + error.message);
            });
    }

    // Initialize gallery
    function initGallery() {
        if (!currentUser) return;
        
        loadImagesFromFirebase();
        cleanupExpiredImages();
    }

    // Load images from Firebase
    function loadImagesFromFirebase() {
        const imagesRef = db.ref('images');
        
        imagesRef.orderByChild('uploaded').once('value')
            .then((snapshot) => {
                images = [];
                snapshot.forEach((childSnapshot) => {
                    const imageData = childSnapshot.val();
                    // Only show images that haven't expired
                    if (new Date(imageData.expiry) > new Date()) {
                        images.unshift(imageData); // Add to beginning for newest first
                    }
                });
                renderGallery(images);
            })
            .catch((error) => {
                showAlert('Error loading images: ' + error.message);
            });
    }

    // Render gallery with filtering/sorting
    function renderGallery(imagesToRender) {
        gallery.innerHTML = '';
        
        if (imagesToRender.length === 0) {
            gallery.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-images"></i>
                    <h3>No images available</h3>
                    <p>${currentUser ? 'Upload your first image to get started!' : 'Please sign in to view images'}</p>
                </div>
            `;
            return;
        }

        imagesToRender.forEach(img => {
            const imageCard = createImageCard(img);
            gallery.appendChild(imageCard);
        });
    }

    // Create image card component
    function createImageCard(img) {
        const expiry = new Date(img.expiry);
        const now = new Date();
        const timeRemaining = expiry - now;
        
        // Calculate time remaining text
        let timeText;
        if (timeRemaining <= 0) {
            timeText = 'Expired';
        } else {
            const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
            const days = Math.floor(hours / 24);
            timeText = days > 1 ? `Expires in ${days} days` : 
                      hours > 1 ? `Expires in ${hours} hours` : 
                      'Expires soon';
        }

        const card = document.createElement('div');
        card.className = 'image-card';
        card.dataset.id = img.id;
        card.innerHTML = `
            <div class="card-header">
                <span class="expiry-tag ${timeRemaining <= 0 ? 'expired' : ''}">${timeText}</span>
                ${img.userId === currentUser?.uid ? '<span class="user-badge">Your Image</span>' : ''}
            </div>
            <img src="${img.src}" alt="${img.caption || 'User uploaded image'}" class="protected-image">
            <div class="image-meta">
                <p class="image-caption">${img.caption || 'No caption provided'}</p>
                <div class="image-footer">
                    <span><i class="far fa-calendar-alt"></i> ${new Date(img.uploaded).toLocaleDateString()}</span>
                    ${img.userEmail ? `<span><i class="fas fa-user"></i> ${img.userEmail.split('@')[0]}</span>` : ''}
                </div>
            </div>
        `;
        
        // Prevent right-click save
        const imgElement = card.querySelector('.protected-image');
        imgElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showAlert('Image saving is disabled', 'info');
        });
        
        return card;
    }

    // Search/filter/sort functionality
    function applyFilters() {
        let filtered = [...images];
        const searchTerm = searchInput.value.toLowerCase();
        const filterValue = filterSelect.value;
        const sortValue = sortSelect.value;

        // Search
        if (searchTerm) {
            filtered = filtered.filter(img => 
                (img.caption || '').toLowerCase().includes(searchTerm) ||
                (img.userEmail || '').toLowerCase().includes(searchTerm)
            );
        }

        // Filter
        if (filterValue === 'expiring-soon') {
            const soon = new Date();
            soon.setHours(soon.getHours() + 24);
            filtered = filtered.filter(img => new Date(img.expiry) < soon);
        } else if (filterValue === 'my-images') {
            filtered = filtered.filter(img => img.userId === currentUser?.uid);
        }

        // Sort
        if (sortValue === 'newest') {
            filtered.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
        } else if (sortValue === 'oldest') {
            filtered.sort((a, b) => new Date(a.uploaded) - new Date(b.uploaded));
        }

        renderGallery(filtered);
    }

    // Event listeners for search/filter/sort
    searchInput.addEventListener('input', applyFilters);
    filterSelect.addEventListener('change', applyFilters);
    sortSelect.addEventListener('change', applyFilters);

    // Cleanup expired images
    function cleanupExpiredImages() {
        const now = new Date();
        const expiredImages = images.filter(img => new Date(img.expiry) <= now);
        
        expiredImages.forEach(img => {
            // Remove from Firebase
            db.ref('images/' + img.id).remove()
                .catch(error => {
                    console.error('Error removing expired image:', error);
                });
        });
    }

    // Drag and drop handlers
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, unhighlight, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight() {
        if (!currentUser) {
            showAlert('Please sign in to upload images', 'info');
            return;
        }
        uploadArea.classList.add('active');
    }

    function unhighlight() {
        uploadArea.classList.remove('active');
    }

    // File handling
    uploadArea.addEventListener('drop', handleDrop, false);
    uploadArea.addEventListener('click', () => {
        if (!currentUser) {
            showAlert('Please sign in to upload images', 'info');
            return;
        }
        fileInput.click();
    });

    function handleDrop(e) {
        if (!currentUser) {
            showAlert('Please sign in to upload images', 'info');
            return;
        }
        const dt = e.dataTransfer;
        handleFiles(dt.files);
    }

    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (!currentUser) {
            showAlert('Please sign in to upload images', 'info');
            return;
        }

        if (files.length > 0) {
            const file = files[0];
            if (file.type.match('image.*')) {
                if (file.size <= 10 * 1024 * 1024) { // 10MB limit
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        imagePreview.src = e.target.result;
                        previewContainer.style.display = 'block';
                    };
                    reader.readAsDataURL(file);
                } else {
                    showAlert('File size exceeds 10MB limit');
                }
            } else {
                showAlert('Please select an image file (JPEG, PNG, or GIF)');
            }
        }
    }

    // Alert system
    function showAlert(message, type = 'error') {
        // Remove any existing alerts first
        const existingAlerts = document.querySelectorAll('.alert');
        existingAlerts.forEach(alert => alert.remove());
        
        const alert = document.createElement('div');
        alert.className = `alert ${type}`;
        alert.textContent = message;
        document.body.appendChild(alert);
        
        // Trigger reflow to enable transition
        alert.offsetHeight;
        
        alert.classList.add('show');
        
        setTimeout(() => {
            alert.classList.remove('show');
            setTimeout(() => alert.remove(), 300);
        }, 3000);
    }

    // Upload process
    uploadBtn.addEventListener('click', function() {
        if (!currentUser) {
            showAlert('Please sign in to upload images', 'info');
            return;
        }

        if (fileInput.files.length > 0) {
            uploadFile(fileInput.files[0]);
        }
    });

    cancelBtn.addEventListener('click', resetUploadForm);

    function uploadFile(file) {
        const caption = captionInput.value.trim();
        const expiryDays = parseInt(expirySelect.value) || 2;
        
        // Validate
        if (!file.type.match('image.*')) {
            showAlert('Please select a valid image file');
            return;
        }

        progressBar.style.display = 'block';
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<div class="loading"></div> Uploading...';
        
        // Upload to Firebase Storage
        const storageRef = storage.ref();
        const imageId = Date.now().toString();
        const imageRef = storageRef.child(`images/${imageId}_${file.name}`);
        
        const uploadTask = imageRef.put(file);
        
        uploadTask.on('state_changed',
            (snapshot) => {
                // Progress tracking
                const progressValue = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                progress.style.width = progressValue + '%';
            },
            (error) => {
                // Handle errors
                showAlert('Upload failed: ' + error.message);
                resetUploadForm();
            },
            () => {
                // Upload completed
                uploadTask.snapshot.ref.getDownloadURL().then((downloadURL) => {
                    // Create image data for database
                    const expiryDate = new Date();
                    expiryDate.setDate(expiryDate.getDate() + expiryDays);
                    
                    const imageData = {
                        id: imageId,
                        src: downloadURL,
                        caption: caption,
                        expiry: expiryDate.toISOString(),
                        uploaded: new Date().toISOString(),
                        userId: currentUser.uid,
                        userEmail: currentUser.email,
                        fileName: file.name
                    };
                    
                    // Save to Firebase Database
                    db.ref('images/' + imageId).set(imageData)
                        .then(() => {
                            resetUploadForm();
                            progressBar.style.display = 'none';
                            loadImagesFromFirebase(); // Reload images
                            showAlert('Image uploaded successfully!', 'success');
                            
                            // Auto-scroll to show new upload
                            gallery.scrollIntoView({ behavior: 'smooth' });
                        })
                        .catch((error) => {
                            showAlert('Error saving image data: ' + error.message);
                            resetUploadForm();
                        });
                });
            }
        );
    }

    function resetUploadForm() {
        fileInput.value = '';
        imagePreview.src = '#';
        captionInput.value = '';
        previewContainer.style.display = 'none';
        progressBar.style.display = 'none';
        progress.style.width = '0%';
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Image';
    }

    // Initialize
    initAuth();

    // Additional protection against image saving
    document.addEventListener('contextmenu', function(e) {
        if (e.target.classList.contains('protected-image')) {
            e.preventDefault();
            showAlert('Image saving is disabled', 'info');
        }
    }, false);
    
    // Prevent drag and drop of images
    document.addEventListener('dragstart', function(e) {
        if (e.target.classList.contains('protected-image')) {
            e.preventDefault();
        }
    }, false);
});
