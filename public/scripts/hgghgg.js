//image gallery//
       
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

    // Store images with metadata
    let images = JSON.parse(localStorage.getItem('galleryImages')) || [];
    let currentUser = null;
    
    // Initialize gallery
    function initGallery() {
        cleanupExpiredImages(); // Remove expired first
        renderGallery(images);
    }

    // Render gallery with filtering/sorting
    function renderGallery(imagesToRender) {
        gallery.innerHTML = '';
        
        if (imagesToRender.length === 0) {
            gallery.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-images"></i>
                    <h3>No images available</h3>
                    <p>Upload your first image to get started!</p>
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
            </div>
            <img src="${img.src}" alt="${img.caption || 'User uploaded image'}" class="protected-image">
            <div class="image-meta">
                <p class="image-caption">${img.caption || 'No caption provided'}</p>
                <div class="image-footer">
                    <span><i class="far fa-calendar-alt"></i> ${new Date(img.uploaded).toLocaleDateString()}</span>
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
                (img.caption || '').toLowerCase().includes(searchTerm)
            );
        }

        // Filter
        if (filterValue === 'expiring-soon') {
            const soon = new Date();
            soon.setHours(soon.getHours() + 24);
            filtered = filtered.filter(img => new Date(img.expiry) < soon);
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
        images = images.filter(img => new Date(img.expiry) > now);
        localStorage.setItem('galleryImages', JSON.stringify(images));
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
        uploadArea.classList.add('active');
    }

    function unhighlight() {
        uploadArea.classList.remove('active');
    }

    // Fixed file handling - better click event
    uploadArea.addEventListener('drop', handleDrop, false);
    
    // Fix for upload area click
    uploadArea.addEventListener('click', function(e) {
        // Only trigger if the click is directly on the upload area, not on child elements
        if (e.target === uploadArea) {
            fileInput.click();
        }
    });

    // Also make the entire upload area clickable via CSS if needed
    uploadArea.style.cursor = 'pointer';

    function handleDrop(e) {
        const dt = e.dataTransfer;
        handleFiles(dt.files);
    }

    fileInput.addEventListener('change', function() {
        if (this.files.length > 0) {
            handleFiles(this.files);
        }
    });

    function handleFiles(files) {
        if (files.length > 0) {
            const file = files[0];
            if (file.type.match('image.*')) {
                if (file.size <= 10 * 1024 * 1024) { // 10MB limit
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        imagePreview.src = e.target.result;
                        previewContainer.style.display = 'block';
                        // Enable upload button when image is loaded
                        uploadBtn.disabled = false;
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

    // Upload process - Updated with Firebase
    uploadBtn.addEventListener('click', function() {
        if (fileInput.files.length > 0) {
            uploadFile(fileInput.files[0]);
        } else {
            showAlert('Please select an image first');
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
        
        // Check if user is signed in
        if (currentUser) {
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
                        // Create image data
                        const expiryDate = new Date();
                        expiryDate.setDate(expiryDate.getDate() + expiryDays);
                        
                        const imageData = {
                            id: imageId,
                            src: downloadURL,
                            caption: caption,
                            expiry: expiryDate.toISOString(),
                            uploaded: new Date().toISOString(),
                            userId: currentUser.uid,
                            userEmail: currentUser.email
                        };
                        
                        // Save to Firebase Database
                        db.ref('images/' + imageId).set(imageData)
                            .then(() => {
                                // Also save to local storage for offline access
                                images.unshift(imageData);
                                localStorage.setItem('galleryImages', JSON.stringify(images));
                                
                                resetUploadForm();
                                progressBar.style.display = 'none';
                                renderGallery(images);
                                showAlert('Image uploaded successfully to cloud!', 'success');
                                
                                // Auto-scroll to show new upload
                                gallery.scrollIntoView({ behavior: 'smooth' });
                            })
                            .catch((error) => {
                                showAlert('Error saving to cloud: ' + error.message);
                                resetUploadForm();
                            });
                    });
                }
            );
        } else {
            // Fallback to local storage only
            let progressValue = 0;
            const progressInterval = setInterval(() => {
                progressValue += Math.random() * 10;
                if (progressValue >= 100) {
                    progressValue = 100;
                    clearInterval(progressInterval);
                    
                    setTimeout(() => {
                        // Create image data
                        const expiryDate = new Date();
                        expiryDate.setDate(expiryDate.getDate() + expiryDays);
                        
                        const imageData = {
                            id: Date.now().toString(),
                            src: imagePreview.src,
                            caption: caption,
                            expiry: expiryDate.toISOString(),
                            uploaded: new Date().toISOString()
                        };
                        
                        images.unshift(imageData); // Add to beginning
                        localStorage.setItem('galleryImages', JSON.stringify(images));
                        
                        resetUploadForm();
                        progressBar.style.display = 'none';
                        renderGallery(images);
                        showAlert('Image uploaded successfully to local storage!', 'success');
                        
                        // Auto-scroll to show new upload
                        gallery.scrollIntoView({ behavior: 'smooth' });
                        
                    }, 500);
                }
                progress.style.width = progressValue + '%';
            }, 200);
        }
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

    // Load images from Firebase on startup
    function loadImagesFromFirebase() {
        db.ref('images').once('value')
            .then((snapshot) => {
                const firebaseImages = [];
                snapshot.forEach((childSnapshot) => {
                    const imageData = childSnapshot.val();
                    // Only show images that haven't expired
                    if (new Date(imageData.expiry) > new Date()) {
                        firebaseImages.push(imageData);
                    }
                });
                
                // Merge with local images, remove duplicates
                const localImages = JSON.parse(localStorage.getItem('galleryImages')) || [];
                const allImages = [...firebaseImages, ...localImages];
                
                // Remove duplicates based on ID
                const uniqueImages = allImages.filter((image, index, self) =>
                    index === self.findIndex((t) => t.id === image.id)
                );
                
                images = uniqueImages;
                localStorage.setItem('galleryImages', JSON.stringify(images));
                renderGallery(images);
            })
            .catch((error) => {
                console.log('Error loading from Firebase:', error);
                // Continue with local storage only
                initGallery();
            });
    }

    // Authentication state observer
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            console.log('User signed in:', user.email);
            loadImagesFromFirebase();
        } else {
            currentUser = null;
            console.log('User signed out');
            // Use local storage only when signed out
            initGallery();
        }
    });

    // Initialize
    loadImagesFromFirebase();

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
