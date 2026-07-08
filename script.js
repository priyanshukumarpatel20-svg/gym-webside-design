document.addEventListener('DOMContentLoaded', function () {

    console.log('Script loaded, initializing...');

    // ---- Shared helpers ----
    function getDeviceId() {
        let id = localStorage.getItem('gymDeviceId');
        if (!id) {
            id = 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem('gymDeviceId', id);
        }
        return id;
    }

    function extractYouTubeId(url) {
        if (!url) return null;
        const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        return match ? match[1] : null;
    }

    function compressImageFile(file, maxWidth, quality) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = new Image();
                img.onload = function () {
                    let width = img.width;
                    let height = img.height;
                    if (width > maxWidth) {
                        height = Math.round(height * (maxWidth / width));
                        width = maxWidth;
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // Tracks whether the owner is currently logged in (Firebase Authentication),
    // shared across the feedback and tutorials features so delete/add controls
    // show up only for the owner.
    let isOwnerLoggedIn = false;
    const ownerUiListeners = [];
    function onOwnerAuthChange(callback) {
        ownerUiListeners.push(callback);
    }
    if (window.auth) {
        window.auth.onAuthStateChanged(function (user) {
            isOwnerLoggedIn = !!user;
            ownerUiListeners.forEach(function (cb) { cb(isOwnerLoggedIn); });
        });
    }

    // Feedback form and star rating
    const feedbackForm = document.getElementById('feedbackForm');
    const feedbackNameInput = document.getElementById('feedbackName');
    const feedbackEmailInput = document.getElementById('feedbackEmail');
    const feedbackMessageInput = document.getElementById('feedbackMessage');
    const feedbackRatingStars = document.querySelectorAll('#feedbackRatingStars button');
    const feedbackPhotoInput = document.getElementById('feedbackPhoto');
    const feedbackPhotoPreview = document.getElementById('feedbackPhotoPreview');
    const feedbackVideoInput = document.getElementById('feedbackVideo');
    const feedbackList = document.getElementById('feedbackList');
    const averageRatingValue = document.getElementById('averageRatingValue');
    const averageRatingCount = document.getElementById('averageRatingCount');

    let feedbackCompressedPhoto = null;

    if (feedbackPhotoInput) {
        feedbackPhotoInput.addEventListener('change', function () {
            const file = feedbackPhotoInput.files[0];
            if (!file) return;
            compressImageFile(file, 1000, 0.7).then(function (dataUrl) {
                feedbackCompressedPhoto = dataUrl;
                feedbackPhotoPreview.src = dataUrl;
                feedbackPhotoPreview.style.display = 'block';
            }).catch(function () {
                alert('Could not read this image. Please try a different photo.');
            });
        });
    }

    onOwnerAuthChange(function () {
        renderFeedbackList();
    });

    // State variables
    let selectedRating = 0;
    let feedbackEntries = [];
    let showAllFeedback = false;
    let sortMode = 'latest';
    const MAX_FEEDBACK_VISIBLE = 4;

    // Check if Firebase is properly configured
    let firebaseReady = false;
    let reviewsCollection = null;

    function initFirebase() {
        try {
            const database = window.db;
            if (typeof firebase !== 'undefined' && database) {
                reviewsCollection = database.collection('reviews');
                firebaseReady = true;
                console.log('Firebase connected successfully');
                return true;
            }
        } catch (e) {
            console.warn('Firebase not configured:', e.message);
        }
        console.log('Using localStorage fallback');
        return false;
    }

    function setRating(rating) {
        selectedRating = rating;
        feedbackRatingStars.forEach(star => {
            const value = Number(star.dataset.value);
            star.classList.toggle('active', value <= rating);
        });
    }

    function renderAverageRating() {
        if (!feedbackEntries.length) {
            averageRatingValue.textContent = '0.0';
            averageRatingCount.textContent = 'No reviews yet';
            return;
        }

        const total = feedbackEntries.reduce((s, i) => s + i.rating, 0);
        averageRatingValue.textContent = (total / feedbackEntries.length).toFixed(1);
        averageRatingCount.textContent = `Based on ${feedbackEntries.length} reviews`;
    }

    function getSortedFeedbacks() {
        const copy = [...feedbackEntries];

        if (sortMode === 'rating') {
            return copy.sort((a, b) => b.rating - a.rating);
        }

        return copy.sort((a, b) => {
            const timeA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : 0;
            const timeB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : 0;
            return timeB - timeA;
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    function renderFeedbackList() {
        feedbackList.innerHTML = '';

        if (!feedbackEntries.length) {
            feedbackList.innerHTML = '<p class="feedback-empty">No feedback yet. Be the first to share your experience!</p>';
            return;
        }

        const sorted = getSortedFeedbacks();
        const visible = showAllFeedback ? sorted : sorted.slice(0, MAX_FEEDBACK_VISIBLE);
        const deviceId = getDeviceId();

        visible.forEach(entry => {
            const div = document.createElement('div');
            div.className = 'feedback-item';

            let starsHtml = '';
            for (let i = 1; i <= 5; i++) {
                starsHtml += '<span class="star' + (i <= entry.rating ? ' filled' : '') + '">★</span>';
            }

            const likedBy = entry.likedBy || [];
            const hasLiked = likedBy.indexOf(deviceId) !== -1;
            const comments = entry.comments || [];

            let mediaHtml = '';
            if (entry.photoBase64) {
                mediaHtml += '<img class="feedback-item-photo" src="' + entry.photoBase64 + '" alt="Feedback photo">';
            }
            if (entry.videoId) {
                mediaHtml += '<div class="feedback-item-video"><iframe src="https://www.youtube.com/embed/' + entry.videoId + '" allowfullscreen></iframe></div>';
            }

            let commentsHtml = '';
            comments.forEach(function (c) {
                commentsHtml += '<div class="feedback-comment-item"><span class="comment-author">' + escapeHtml(c.name) + '</span>' + escapeHtml(c.text) + '</div>';
            });

            div.innerHTML =
                '<div class="feedback-item-header">' +
                    '<p class="feedback-item-name">' + escapeHtml(entry.name) + '</p>' +
                    '<p class="feedback-item-email">' + escapeHtml(entry.email) + '</p>' +
                '</div>' +
                '<div class="feedback-item-stars">' + starsHtml + '</div>' +
                '<p class="feedback-item-message">' + escapeHtml(entry.message) + '</p>' +
                (mediaHtml ? '<div class="feedback-item-media">' + mediaHtml + '</div>' : '') +
                '<div class="feedback-item-actions">' +
                    '<button type="button" class="feedback-like-btn' + (hasLiked ? ' liked' : '') + '">♥ <span class="like-count">' + likedBy.length + '</span></button>' +
                    '<button type="button" class="feedback-comment-toggle-btn">💬 ' + comments.length + ' Comment' + (comments.length === 1 ? '' : 's') + '</button>' +
                    (isOwnerLoggedIn ? '<button type="button" class="feedback-delete-btn">Delete</button>' : '') +
                '</div>' +
                '<div class="feedback-comments-section">' +
                    '<div class="feedback-comments-list">' + commentsHtml + '</div>' +
                    '<form class="feedback-comment-form">' +
                        '<input type="text" class="comment-name-input" placeholder="Your name" required>' +
                        '<input type="text" class="comment-text-input" placeholder="Write a comment..." required>' +
                        '<button type="submit" class="btn btn-outline">Post</button>' +
                    '</form>' +
                '</div>';

            feedbackList.appendChild(div);

            // Like button
            const likeBtn = div.querySelector('.feedback-like-btn');
            likeBtn.addEventListener('click', function () {
                toggleLike(entry, deviceId, likeBtn);
            });

            // Comment toggle
            const commentToggleBtn = div.querySelector('.feedback-comment-toggle-btn');
            const commentsSection = div.querySelector('.feedback-comments-section');
            commentToggleBtn.addEventListener('click', function () {
                commentsSection.classList.toggle('open');
            });

            // Comment submit
            const commentForm = div.querySelector('.feedback-comment-form');
            commentForm.onsubmit = function (e) {
                e.preventDefault();
                const name = div.querySelector('.comment-name-input').value.trim();
                const text = div.querySelector('.comment-text-input').value.trim();
                if (!name || !text) return false;
                addComment(entry, { name: name, text: text });
                commentForm.reset();
                return false;
            };

            // Owner delete
            const deleteBtn = div.querySelector('.feedback-delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', function () {
                    if (confirm('Delete this feedback? This cannot be undone.')) {
                        deleteFeedback(entry);
                    }
                });
            }
        });

        if (sorted.length > MAX_FEEDBACK_VISIBLE) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'btn btn-outline';
            toggleBtn.style.marginTop = '10px';
            toggleBtn.textContent = showAllFeedback ? 'Show Less' : 'More';
            toggleBtn.addEventListener('click', function() {
                showAllFeedback = !showAllFeedback;
                renderFeedbackList();
            });
            feedbackList.appendChild(toggleBtn);
        }
    }

    function toggleLike(entry, deviceId, likeBtn) {
        const likedBy = entry.likedBy || [];
        const hasLiked = likedBy.indexOf(deviceId) !== -1;

        if (firebaseReady && reviewsCollection && entry.id) {
            const update = hasLiked
                ? { likedBy: firebase.firestore.FieldValue.arrayRemove(deviceId) }
                : { likedBy: firebase.firestore.FieldValue.arrayUnion(deviceId) };
            reviewsCollection.doc(entry.id).update(update).then(function () {
                if (hasLiked) {
                    entry.likedBy = likedBy.filter(id => id !== deviceId);
                } else {
                    entry.likedBy = likedBy.concat([deviceId]);
                }
                renderFeedbackList();
            }).catch(function (error) {
                console.error('Like error:', error);
            });
        } else {
            entry.likedBy = hasLiked ? likedBy.filter(id => id !== deviceId) : likedBy.concat([deviceId]);
            saveToLocalStorage();
            renderFeedbackList();
        }
    }

    function addComment(entry, comment) {
        comment.timestamp = Date.now();

        if (firebaseReady && reviewsCollection && entry.id) {
            reviewsCollection.doc(entry.id).update({
                comments: firebase.firestore.FieldValue.arrayUnion(comment)
            }).then(function () {
                entry.comments = (entry.comments || []).concat([comment]);
                renderFeedbackList();
            }).catch(function (error) {
                console.error('Comment error:', error);
            });
        } else {
            entry.comments = (entry.comments || []).concat([comment]);
            saveToLocalStorage();
            renderFeedbackList();
        }
    }

    function deleteFeedback(entry) {
        if (firebaseReady && reviewsCollection && entry.id) {
            reviewsCollection.doc(entry.id).delete().then(function () {
                feedbackEntries = feedbackEntries.filter(f => f.id !== entry.id);
                renderAverageRating();
                renderFeedbackList();
            }).catch(function (error) {
                console.error('Delete error:', error);
                alert('Could not delete this feedback. Please try again.');
            });
        } else {
            feedbackEntries = feedbackEntries.filter(f => f !== entry);
            saveToLocalStorage();
            renderAverageRating();
            renderFeedbackList();
        }
    }

    // Star click handler
    feedbackRatingStars.forEach(function(star) {
        star.addEventListener('click', function() {
            setRating(Number(star.dataset.value));
        });
    });

    function loadFromLocalStorage() {
        try {
            var stored = localStorage.getItem('gymFeedbacks');
            feedbackEntries = stored ? JSON.parse(stored) : [];
        } catch(e) {
            feedbackEntries = [];
        }
        renderAverageRating();
        renderFeedbackList();
    }

    function loadReviews() {
        feedbackList.innerHTML = '<p class="feedback-empty">Loading reviews...</p>';
        
        if (firebaseReady && reviewsCollection) {
            reviewsCollection.get()
                .then(function(snapshot) {
                    feedbackEntries = [];
                    snapshot.forEach(function(doc) {
                        // FIX: flatten doc data so entry.name, entry.rating etc. work directly
                        var data = doc.data();
                        feedbackEntries.push({
                            id: doc.id,
                            name: data.name,
                            email: data.email,
                            message: data.message,
                            rating: data.rating,
                            timestamp: data.timestamp,
                            photoBase64: data.photoBase64 || null,
                            videoId: data.videoId || null,
                            likedBy: data.likedBy || [],
                            comments: data.comments || []
                        });
                    });
                    renderAverageRating();
                    renderFeedbackList();
                })
                .catch(function(error) {
                    console.error('Firebase error:', error);
                    loadFromLocalStorage();
                });
        } else {
            loadFromLocalStorage();
        }
    }

    function saveToLocalStorage() {
        try {
            localStorage.setItem('gymFeedbacks', JSON.stringify(feedbackEntries));
        } catch(e) {
            console.error('LocalStorage error:', e);
        }
    }

    // Initialize
    initFirebase();
    loadReviews();

    // Form submit handler - direct inline handler
    if (feedbackForm) {
        feedbackForm.onsubmit = function(e) {
            e.preventDefault();
            console.log('Form submitted');

            if (!selectedRating) {
                alert('Please select a rating');
                return false;
            }

            var submitBtn = feedbackForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Submitting...';
            }

            var newReview = {
                name: feedbackNameInput.value,
                email: feedbackEmailInput.value,
                message: feedbackMessageInput.value,
                rating: selectedRating,
                timestamp: Date.now(),
                photoBase64: feedbackCompressedPhoto || null,
                videoId: extractYouTubeId(feedbackVideoInput ? feedbackVideoInput.value.trim() : ''),
                likedBy: [],
                comments: []
            };

            function finishSubmit() {
                feedbackForm.reset();
                setRating(0);
                showAllFeedback = false;
                feedbackCompressedPhoto = null;
                if (feedbackPhotoPreview) feedbackPhotoPreview.style.display = 'none';
                loadReviews();
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Submit Feedback';
                }
                alert('Thank you for your feedback! Your review has been submitted.');
            }

            // FIX: actually write to Firestore when Firebase is configured,
            // so feedback is visible to every visitor, not just the one browser.
            if (firebaseReady && reviewsCollection) {
                reviewsCollection.add({
                    name: newReview.name,
                    email: newReview.email,
                    message: newReview.message,
                    rating: newReview.rating,
                    photoBase64: newReview.photoBase64,
                    videoId: newReview.videoId,
                    likedBy: newReview.likedBy,
                    comments: newReview.comments,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                }).then(function() {
                    finishSubmit();
                }).catch(function(error) {
                    console.error('Firebase save error:', error);
                    // fall back to localStorage if the write fails
                    feedbackEntries.push(newReview);
                    saveToLocalStorage();
                    finishSubmit();
                });
            } else {
                feedbackEntries.push(newReview);
                saveToLocalStorage();
                finishSubmit();
            }

            return false;
        };
    } else {
        console.error('Feedback form not found!');
    }

    // ==========================================
    // EVENTS FEATURE
    // Photo + countdown + registration for events
    // ==========================================
    (function initEventsFeature() {
        const ownerLoginBtn = document.getElementById('ownerLoginBtn');
        const ownerLogoutBtn = document.getElementById('ownerLogoutBtn');
        const ownerChangePasswordBtn = document.getElementById('ownerChangePasswordBtn');
        const eventOwnerLoginWrapper = document.getElementById('eventOwnerLoginWrapper');
        const ownerLoginForm = document.getElementById('ownerLoginForm');
        const ownerLoginCancelBtn = document.getElementById('ownerLoginCancelBtn');
        const ownerForgotPasswordLink = document.getElementById('ownerForgotPasswordLink');
        const ownerLoginMessage = document.getElementById('ownerLoginMessage');
        const ownerChangePasswordWrapper = document.getElementById('ownerChangePasswordWrapper');
        const ownerChangePasswordForm = document.getElementById('ownerChangePasswordForm');
        const ownerChangePasswordCancelBtn = document.getElementById('ownerChangePasswordCancelBtn');
        const ownerChangePasswordMessage = document.getElementById('ownerChangePasswordMessage');
        const adminAddEventBtn = document.getElementById('adminAddEventBtn');
        const eventAdminFormWrapper = document.getElementById('eventAdminFormWrapper');
        const eventAdminForm = document.getElementById('eventAdminForm');
        const cancelAddEventBtn = document.getElementById('cancelAddEventBtn');
        const eventPhotoInput = document.getElementById('eventPhoto');
        const eventPhotoPreview = document.getElementById('eventPhotoPreview');
        const eventsGrid = document.getElementById('eventsGrid');

        if (!eventsGrid) return; // section not present on this page

        let eventsCollection = null;
        let registrationsCollection = null;
        let events = [];
        let compressedPhotoBase64 = null;
        let countdownInterval = null;
        let authInstance = null;

        function initEventsFirebase() {
            try {
                const database = window.db;
                if (typeof firebase !== 'undefined' && database) {
                    eventsCollection = database.collection('events');
                    registrationsCollection = database.collection('eventRegistrations');
                }
                if (typeof firebase !== 'undefined' && window.auth) {
                    authInstance = window.auth;
                }
            } catch (e) {
                console.warn('Firebase not configured for events:', e.message);
            }
        }

        function escapeHtmlLocal(str) {
            const div = document.createElement('div');
            div.textContent = str == null ? '' : String(str);
            return div.innerHTML;
        }

        function setMessage(el, text, isSuccess) {
            el.textContent = text;
            el.classList.toggle('success', !!isSuccess);
        }

        function hideAllOwnerPanels() {
            eventOwnerLoginWrapper.style.display = 'none';
            ownerChangePasswordWrapper.style.display = 'none';
            eventAdminFormWrapper.style.display = 'none';
        }

        // ---- Show/hide owner controls based on real login state ----
        let isEventsOwnerLoggedIn = false;
        function applyAuthUI(user) {
            const isOwner = !!user;
            isEventsOwnerLoggedIn = isOwner;
            ownerLoginBtn.style.display = isOwner ? 'none' : 'inline-block';
            ownerChangePasswordBtn.style.display = isOwner ? 'inline-block' : 'none';
            adminAddEventBtn.style.display = isOwner ? 'inline-block' : 'none';
            ownerLogoutBtn.style.display = isOwner ? 'inline-block' : 'none';
            if (!isOwner) {
                hideAllOwnerPanels();
            }
            renderEvents();
        }

        // ---- Owner login (inline form) ----
        if (ownerLoginBtn) {
            ownerLoginBtn.addEventListener('click', function () {
                if (!authInstance) {
                    alert('Login is not available right now. Please make sure Firebase is configured.');
                    return;
                }
                setMessage(ownerLoginMessage, '', false);
                eventOwnerLoginWrapper.style.display = 'block';
                eventOwnerLoginWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }

        if (ownerLoginCancelBtn) {
            ownerLoginCancelBtn.addEventListener('click', function () {
                eventOwnerLoginWrapper.style.display = 'none';
                ownerLoginForm.reset();
                setMessage(ownerLoginMessage, '', false);
            });
        }

        if (ownerLoginForm) {
            ownerLoginForm.onsubmit = function (e) {
                e.preventDefault();
                const email = document.getElementById('ownerLoginEmail').value.trim();
                const password = document.getElementById('ownerLoginPassword').value;
                const submitBtn = ownerLoginForm.querySelector('button[type="submit"]');

                submitBtn.disabled = true;
                submitBtn.textContent = 'Logging in...';
                setMessage(ownerLoginMessage, '', false);

                authInstance.signInWithEmailAndPassword(email, password)
                    .then(function () {
                        eventOwnerLoginWrapper.style.display = 'none';
                        ownerLoginForm.reset();
                    })
                    .catch(function (error) {
                        console.error('Login error:', error);
                        setMessage(ownerLoginMessage, 'Incorrect email or password.', false);
                    })
                    .finally(function () {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Login';
                    });

                return false;
            };
        }

        // ---- Forgot password ----
        if (ownerForgotPasswordLink) {
            ownerForgotPasswordLink.addEventListener('click', function (e) {
                e.preventDefault();
                if (!authInstance) return;
                const email = document.getElementById('ownerLoginEmail').value.trim();
                if (!email) {
                    setMessage(ownerLoginMessage, 'Enter your email above first, then click "Forgot Password?" again.', false);
                    return;
                }
                authInstance.sendPasswordResetEmail(email)
                    .then(function () {
                        setMessage(ownerLoginMessage, 'Password reset link sent to ' + email + '. Check your inbox.', true);
                    })
                    .catch(function (error) {
                        console.error('Reset password error:', error);
                        setMessage(ownerLoginMessage, 'Could not send reset email. Check the email address and try again.', false);
                    });
            });
        }

        // ---- Change password (while logged in) ----
        if (ownerChangePasswordBtn) {
            ownerChangePasswordBtn.addEventListener('click', function () {
                const isOpen = ownerChangePasswordWrapper.style.display === 'block';
                ownerChangePasswordWrapper.style.display = isOpen ? 'none' : 'block';
                if (!isOpen) {
                    setMessage(ownerChangePasswordMessage, '', false);
                    ownerChangePasswordWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        }

        if (ownerChangePasswordCancelBtn) {
            ownerChangePasswordCancelBtn.addEventListener('click', function () {
                ownerChangePasswordWrapper.style.display = 'none';
                ownerChangePasswordForm.reset();
                setMessage(ownerChangePasswordMessage, '', false);
            });
        }

        if (ownerChangePasswordForm) {
            ownerChangePasswordForm.onsubmit = function (e) {
                e.preventDefault();
                const newPassword = document.getElementById('ownerNewPassword').value;
                const submitBtn = ownerChangePasswordForm.querySelector('button[type="submit"]');
                const currentUser = authInstance && authInstance.currentUser;

                if (!currentUser) {
                    setMessage(ownerChangePasswordMessage, 'You must be logged in to change your password.', false);
                    return false;
                }

                submitBtn.disabled = true;
                submitBtn.textContent = 'Updating...';

                currentUser.updatePassword(newPassword)
                    .then(function () {
                        setMessage(ownerChangePasswordMessage, 'Password updated successfully!', true);
                        ownerChangePasswordForm.reset();
                    })
                    .catch(function (error) {
                        console.error('Update password error:', error);
                        if (error.code === 'auth/requires-recent-login') {
                            setMessage(ownerChangePasswordMessage, 'For security, please logout and login again before changing your password.', false);
                        } else {
                            setMessage(ownerChangePasswordMessage, 'Could not update password. Please try again.', false);
                        }
                    })
                    .finally(function () {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Update Password';
                    });

                return false;
            };
        }

        if (ownerLogoutBtn) {
            ownerLogoutBtn.addEventListener('click', function () {
                if (authInstance) authInstance.signOut();
                hideAllOwnerPanels();
            });
        }

        if (adminAddEventBtn) {
            adminAddEventBtn.addEventListener('click', function () {
                const isOpen = eventAdminFormWrapper.style.display === 'block';
                eventAdminFormWrapper.style.display = isOpen ? 'none' : 'block';
                if (!isOpen) {
                    eventAdminFormWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        }

        if (cancelAddEventBtn) {
            cancelAddEventBtn.addEventListener('click', function () {
                eventAdminFormWrapper.style.display = 'none';
                eventAdminForm.reset();
                compressedPhotoBase64 = null;
                eventPhotoPreview.style.display = 'none';
            });
        }

        // ---- Photo compression (resize + base64) so it stays small enough
        // to store as a Firestore field (max ~1MB per document) ----
        function compressImage(file, maxWidth, quality) {
            return new Promise(function (resolve, reject) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    const img = new Image();
                    img.onload = function () {
                        let width = img.width;
                        let height = img.height;
                        if (width > maxWidth) {
                            height = Math.round(height * (maxWidth / width));
                            width = maxWidth;
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        resolve(canvas.toDataURL('image/jpeg', quality));
                    };
                    img.onerror = reject;
                    img.src = e.target.result;
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        if (eventPhotoInput) {
            eventPhotoInput.addEventListener('change', function () {
                const file = eventPhotoInput.files[0];
                if (!file) return;
                compressImage(file, 1400, 0.75).then(function (dataUrl) {
                    compressedPhotoBase64 = dataUrl;
                    eventPhotoPreview.src = dataUrl;
                    eventPhotoPreview.style.display = 'block';

                    // Rough size check (base64 length in bytes)
                    const approxBytes = Math.round((dataUrl.length * 3) / 4);
                    if (approxBytes > 900000) {
                        alert('This photo is still quite large after compression. Please choose a smaller/lighter image if the event fails to publish.');
                    }
                }).catch(function () {
                    alert('Could not read this image. Please try a different photo.');
                });
            });
        }

        // ---- Publish new event ----
        if (eventAdminForm) {
            eventAdminForm.onsubmit = function (e) {
                e.preventDefault();

                if (!compressedPhotoBase64) {
                    alert('Please choose an event photo.');
                    return false;
                }

                const title = document.getElementById('eventTitle').value.trim();
                const description = document.getElementById('eventDescription').value.trim();
                const dateTimeValue = document.getElementById('eventDateTime').value;
                const fee = document.getElementById('eventFee').value;

                if (!title || !dateTimeValue) {
                    alert('Please fill in the event title and date/time.');
                    return false;
                }

                const eventDateTimeMs = new Date(dateTimeValue).getTime();

                const newEvent = {
                    title: title,
                    description: description,
                    eventDateTime: eventDateTimeMs,
                    fee: fee ? Number(fee) : null,
                    photoBase64: compressedPhotoBase64,
                    createdAt: Date.now()
                };

                const submitBtn = eventAdminForm.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Publishing...';
                }

                function finishPublish() {
                    eventAdminForm.reset();
                    compressedPhotoBase64 = null;
                    eventPhotoPreview.style.display = 'none';
                    eventAdminFormWrapper.style.display = 'none';
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Publish Event';
                    }
                    loadEvents();
                    alert('Event published!');
                }

                if (eventsCollection) {
                    eventsCollection.add(newEvent).then(finishPublish).catch(function (error) {
                        console.error('Error publishing event to Firebase:', error);
                        alert('Could not publish to the shared database (photo may be too large, or Firebase is not fully configured). Saving on this device only instead.');
                        saveEventToLocalStorage(newEvent);
                        finishPublish();
                    });
                } else {
                    saveEventToLocalStorage(newEvent);
                    finishPublish();
                }

                return false;
            };
        }

        function saveEventToLocalStorage(newEvent) {
            try {
                const stored = localStorage.getItem('gymEvents');
                const list = stored ? JSON.parse(stored) : [];
                newEvent.id = 'local_' + Date.now();
                list.push(newEvent);
                localStorage.setItem('gymEvents', JSON.stringify(list));
            } catch (e) {
                console.error('LocalStorage error (events):', e);
            }
        }

        function loadEventsFromLocalStorage() {
            try {
                const stored = localStorage.getItem('gymEvents');
                events = stored ? JSON.parse(stored) : [];
            } catch (e) {
                events = [];
            }
            renderEvents();
        }

        function loadEvents() {
            if (eventsCollection) {
                eventsCollection.get().then(function (snapshot) {
                    events = [];
                    snapshot.forEach(function (doc) {
                        const data = doc.data();
                        events.push({
                            id: doc.id,
                            title: data.title,
                            description: data.description,
                            eventDateTime: data.eventDateTime,
                            fee: data.fee,
                            photoBase64: data.photoBase64
                        });
                    });
                    renderEvents();
                }).catch(function (error) {
                    console.error('Error loading events from Firebase:', error);
                    loadEventsFromLocalStorage();
                });
            } else {
                loadEventsFromLocalStorage();
            }
        }

        function formatDateTime(ms) {
            const d = new Date(ms);
            return d.toLocaleString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        }

        function renderEvents() {
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }

            eventsGrid.innerHTML = '';

            if (!events.length) {
                eventsGrid.innerHTML = '<p class="events-empty">No upcoming events right now. Check back soon!</p>';
                return;
            }

            // Soonest event first
            const sorted = [...events].sort((a, b) => a.eventDateTime - b.eventDateTime);

            sorted.forEach(function (evt) {
                const card = document.createElement('div');
                card.className = 'event-card';
                card.dataset.eventTime = evt.eventDateTime;
                card.dataset.eventId = evt.id;

                card.innerHTML =
                    '<img class="event-card-photo" src="' + evt.photoBase64 + '" alt="' + escapeHtmlLocal(evt.title) + '">' +
                    '<div class="event-card-body">' +
                        '<h3 class="event-card-title">' + escapeHtmlLocal(evt.title) + '</h3>' +
                        (evt.description ? '<p class="event-card-description">' + escapeHtmlLocal(evt.description) + '</p>' : '') +
                        '<p class="event-card-datetime">' + formatDateTime(evt.eventDateTime) + '</p>' +
                        (evt.fee ? '<p class="event-card-fee">Registration Fee: Rs ' + evt.fee + '</p>' : '<p class="event-card-fee">Free Entry</p>') +
                        '<div class="event-countdown-slot"></div>' +
                        '<button type="button" class="btn btn-primary event-register-btn">Register Now</button>' +
                        '<form class="event-registration-form">' +
                            '<input type="text" class="reg-name" placeholder="Your Name" required>' +
                            '<input type="tel" class="reg-phone" placeholder="Phone Number" pattern="[0-9]{10}" required>' +
                            '<input type="text" class="reg-payment" placeholder="Payment / Fee Details (e.g. UPI Txn ID)" ' + (evt.fee ? 'required' : '') + '>' +
                            '<button type="submit" class="btn btn-primary">Confirm Registration</button>' +
                            '<p class="event-registration-success" style="display:none;">Registration successful! See you at the event.</p>' +
                        '</form>' +
                        (isEventsOwnerLoggedIn ?
                            '<button type="button" class="btn btn-outline event-view-registrations-btn">View Registrations</button>' +
                            '<div class="event-registrations-panel" style="display:none;"><p class="event-registrations-loading">Loading...</p></div>' +
                            '<button type="button" class="btn btn-outline event-delete-btn">Delete Event</button>'
                        : '') +
                    '</div>';

                eventsGrid.appendChild(card);

                const registerBtn = card.querySelector('.event-register-btn');
                const regForm = card.querySelector('.event-registration-form');
                registerBtn.addEventListener('click', function () {
                    regForm.classList.toggle('open');
                });

                regForm.onsubmit = function (e) {
                    e.preventDefault();
                    const name = card.querySelector('.reg-name').value.trim();
                    const phone = card.querySelector('.reg-phone').value.trim();
                    const payment = card.querySelector('.reg-payment').value.trim();

                    const registration = {
                        eventId: evt.id,
                        eventTitle: evt.title,
                        name: name,
                        phone: phone,
                        paymentDetails: payment,
                        registeredAt: Date.now()
                    };

                    const confirmBtn = regForm.querySelector('button[type="submit"]');
                    if (confirmBtn) confirmBtn.disabled = true;

                    function finishRegistration() {
                        regForm.reset();
                        regForm.querySelector('.event-registration-success').style.display = 'block';
                        registerBtn.style.display = 'none';
                    }

                    if (registrationsCollection) {
                        registrationsCollection.add(registration).then(finishRegistration).catch(function (error) {
                            console.error('Error saving registration:', error);
                            saveRegistrationToLocalStorage(registration);
                            finishRegistration();
                        });
                    } else {
                        saveRegistrationToLocalStorage(registration);
                        finishRegistration();
                    }

                    return false;
                };

                const viewRegBtn = card.querySelector('.event-view-registrations-btn');
                const regPanel = card.querySelector('.event-registrations-panel');
                if (viewRegBtn) {
                    viewRegBtn.addEventListener('click', function () {
                        const isOpen = regPanel.style.display === 'block';
                        if (isOpen) {
                            regPanel.style.display = 'none';
                            viewRegBtn.textContent = 'View Registrations';
                            return;
                        }
                        regPanel.style.display = 'block';
                        viewRegBtn.textContent = 'Hide Registrations';
                        loadRegistrationsForEvent(evt.id, regPanel);
                    });
                }

                const deleteEventBtn = card.querySelector('.event-delete-btn');
                if (deleteEventBtn) {
                    deleteEventBtn.addEventListener('click', function () {
                        if (!confirm('Delete "' + evt.title + '"? This cannot be undone.')) return;

                        function finishDelete() {
                            events = events.filter(function (e) { return e.id !== evt.id; });
                            renderEvents();
                        }

                        if (eventsCollection && evt.id) {
                            eventsCollection.doc(evt.id).delete().then(finishDelete).catch(function (error) {
                                console.error('Error deleting event:', error);
                                alert('Could not delete this event. Please try again.');
                            });
                        } else {
                            try {
                                const stored = localStorage.getItem('gymEvents');
                                const list = stored ? JSON.parse(stored) : [];
                                localStorage.setItem('gymEvents', JSON.stringify(list.filter(e => e.id !== evt.id)));
                            } catch (e) {
                                console.error('LocalStorage error (delete event):', e);
                            }
                            finishDelete();
                        }
                    });
                }
            });

            startCountdowns();
        }

        function loadRegistrationsForEvent(eventId, panelEl) {
            panelEl.innerHTML = '<p class="event-registrations-loading">Loading...</p>';

            function renderRegList(regs) {
                if (!regs.length) {
                    panelEl.innerHTML = '<p class="event-registrations-empty">No registrations yet.</p>';
                    return;
                }
                let html = '<p class="event-registrations-count">' + regs.length + ' registration' + (regs.length === 1 ? '' : 's') + '</p>';
                regs.forEach(function (r) {
                    html += '<div class="event-registration-item">' +
                        '<span class="reg-item-name">' + escapeHtmlLocal(r.name) + '</span>' +
                        '<span class="reg-item-phone">' + escapeHtmlLocal(r.phone) + '</span>' +
                        (r.paymentDetails ? '<span class="reg-item-payment">' + escapeHtmlLocal(r.paymentDetails) + '</span>' : '') +
                        '</div>';
                });
                panelEl.innerHTML = html;
            }

            if (registrationsCollection) {
                registrationsCollection.where('eventId', '==', eventId).get().then(function (snapshot) {
                    const regs = [];
                    snapshot.forEach(function (doc) { regs.push(doc.data()); });
                    renderRegList(regs);
                }).catch(function (error) {
                    console.error('Error loading registrations:', error);
                    panelEl.innerHTML = '<p class="event-registrations-empty">Could not load registrations.</p>';
                });
            } else {
                try {
                    const stored = localStorage.getItem('gymEventRegistrations');
                    const all = stored ? JSON.parse(stored) : [];
                    renderRegList(all.filter(r => r.eventId === eventId));
                } catch (e) {
                    panelEl.innerHTML = '<p class="event-registrations-empty">Could not load registrations.</p>';
                }
            }
        }

        function saveRegistrationToLocalStorage(registration) {
            try {
                const stored = localStorage.getItem('gymEventRegistrations');
                const list = stored ? JSON.parse(stored) : [];
                list.push(registration);
                localStorage.setItem('gymEventRegistrations', JSON.stringify(list));
            } catch (e) {
                console.error('LocalStorage error (registrations):', e);
            }
        }

        function startCountdowns() {
            function tick() {
                const cards = eventsGrid.querySelectorAll('.event-card');
                cards.forEach(function (card) {
                    const slot = card.querySelector('.event-countdown-slot');
                    const targetTime = Number(card.dataset.eventTime);
                    const now = Date.now();
                    const diff = targetTime - now;

                    if (diff <= 0) {
                        // Event time has passed
                        const startedRecently = diff > -1000 * 60 * 60 * 6; // within last 6 hours
                        slot.innerHTML = startedRecently
                            ? '<div class="event-status-live">Event is Live Now!</div>'
                            : '<div class="event-status-ended">Event Ended</div>';
                        return;
                    }

                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
                    const minutes = Math.floor((diff / (1000 * 60)) % 60);
                    const seconds = Math.floor((diff / 1000) % 60);

                    slot.innerHTML =
                        '<div class="event-countdown">' +
                            '<div class="event-countdown-unit"><span class="value">' + days + '</span><span class="label">Days</span></div>' +
                            '<div class="event-countdown-unit"><span class="value">' + hours + '</span><span class="label">Hours</span></div>' +
                            '<div class="event-countdown-unit"><span class="value">' + minutes + '</span><span class="label">Mins</span></div>' +
                            '<div class="event-countdown-unit"><span class="value">' + seconds + '</span><span class="label">Secs</span></div>' +
                        '</div>';
                });
            }

            tick();
            countdownInterval = setInterval(tick, 1000);
        }

        initEventsFirebase();
        if (authInstance) {
            authInstance.onAuthStateChanged(function (user) {
                applyAuthUI(user);
            });
        } else {
            applyAuthUI(null);
        }
        loadEvents();
    })();

    // ==========================================
    // EXERCISE TUTORIALS FEATURE
    // Owner uploads a YouTube link + written instructions per exercise
    // ==========================================
    (function initTutorialsFeature() {
        const addTutorialBtn = document.getElementById('addTutorialBtn');
        const tutorialAdminFormWrapper = document.getElementById('tutorialAdminFormWrapper');
        const tutorialAdminForm = document.getElementById('tutorialAdminForm');
        const cancelAddTutorialBtn = document.getElementById('cancelAddTutorialBtn');
        const tutorialCategoryFilters = document.getElementById('tutorialCategoryFilters');
        const tutorialsGrid = document.getElementById('tutorialsGrid');

        if (!tutorialsGrid) return;

        const CATEGORIES = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio', 'Full Body'];
        let tutorialsCollection = null;
        let tutorials = [];
        let activeCategory = 'All';

        function initTutorialsFirebase() {
            try {
                const database = window.db;
                if (typeof firebase !== 'undefined' && database) {
                    tutorialsCollection = database.collection('tutorials');
                }
            } catch (e) {
                console.warn('Firebase not configured for tutorials:', e.message);
            }
        }

        function escapeHtmlLocal(str) {
            const div = document.createElement('div');
            div.textContent = str == null ? '' : String(str);
            return div.innerHTML;
        }

        onOwnerAuthChange(function (loggedIn) {
            addTutorialBtn.style.display = loggedIn ? 'inline-block' : 'none';
            if (!loggedIn) tutorialAdminFormWrapper.style.display = 'none';
        });

        if (addTutorialBtn) {
            addTutorialBtn.addEventListener('click', function () {
                const isOpen = tutorialAdminFormWrapper.style.display === 'block';
                tutorialAdminFormWrapper.style.display = isOpen ? 'none' : 'block';
                if (!isOpen) tutorialAdminFormWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }

        if (cancelAddTutorialBtn) {
            cancelAddTutorialBtn.addEventListener('click', function () {
                tutorialAdminFormWrapper.style.display = 'none';
                tutorialAdminForm.reset();
            });
        }

        if (tutorialAdminForm) {
            tutorialAdminForm.onsubmit = function (e) {
                e.preventDefault();

                const title = document.getElementById('tutorialTitle').value.trim();
                const category = document.getElementById('tutorialCategory').value;
                const videoUrl = document.getElementById('tutorialVideoUrl').value.trim();
                const instructions = document.getElementById('tutorialInstructions').value.trim();
                const videoId = extractYouTubeId(videoUrl);

                if (!title || !category || !instructions) {
                    alert('Please fill in all fields.');
                    return false;
                }
                if (!videoId) {
                    alert('Please paste a valid YouTube video link.');
                    return false;
                }

                const newTutorial = {
                    title: title,
                    category: category,
                    videoId: videoId,
                    instructions: instructions,
                    createdAt: Date.now()
                };

                const submitBtn = tutorialAdminForm.querySelector('button[type="submit"]');
                submitBtn.disabled = true;
                submitBtn.textContent = 'Publishing...';

                function finishPublish() {
                    tutorialAdminForm.reset();
                    tutorialAdminFormWrapper.style.display = 'none';
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Publish Tutorial';
                    loadTutorials();
                    alert('Tutorial published!');
                }

                if (tutorialsCollection) {
                    tutorialsCollection.add(newTutorial).then(finishPublish).catch(function (error) {
                        console.error('Error publishing tutorial:', error);
                        saveTutorialToLocalStorage(newTutorial);
                        finishPublish();
                    });
                } else {
                    saveTutorialToLocalStorage(newTutorial);
                    finishPublish();
                }

                return false;
            };
        }

        function saveTutorialToLocalStorage(tutorial) {
            try {
                const stored = localStorage.getItem('gymTutorials');
                const list = stored ? JSON.parse(stored) : [];
                tutorial.id = 'local_' + Date.now();
                list.push(tutorial);
                localStorage.setItem('gymTutorials', JSON.stringify(list));
            } catch (e) {
                console.error('LocalStorage error (tutorials):', e);
            }
        }

        function loadTutorialsFromLocalStorage() {
            try {
                const stored = localStorage.getItem('gymTutorials');
                tutorials = stored ? JSON.parse(stored) : [];
            } catch (e) {
                tutorials = [];
            }
            renderTutorials();
        }

        function loadTutorials() {
            if (tutorialsCollection) {
                tutorialsCollection.get().then(function (snapshot) {
                    tutorials = [];
                    snapshot.forEach(function (doc) {
                        const data = doc.data();
                        tutorials.push({
                            id: doc.id,
                            title: data.title,
                            category: data.category,
                            videoId: data.videoId,
                            instructions: data.instructions,
                            createdAt: data.createdAt
                        });
                    });
                    renderTutorials();
                }).catch(function (error) {
                    console.error('Error loading tutorials:', error);
                    loadTutorialsFromLocalStorage();
                });
            } else {
                loadTutorialsFromLocalStorage();
            }
        }

        function renderCategoryFilters() {
            tutorialCategoryFilters.innerHTML = '';
            CATEGORIES.forEach(function (cat) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'tutorial-category-filter-btn' + (cat === activeCategory ? ' active' : '');
                btn.textContent = cat;
                btn.addEventListener('click', function () {
                    activeCategory = cat;
                    renderCategoryFilters();
                    renderTutorials();
                });
                tutorialCategoryFilters.appendChild(btn);
            });
        }

        function renderTutorials() {
            tutorialsGrid.innerHTML = '';

            const filtered = activeCategory === 'All'
                ? tutorials
                : tutorials.filter(t => t.category === activeCategory);

            if (!filtered.length) {
                tutorialsGrid.innerHTML = '<p class="events-empty">No tutorials yet. Check back soon!</p>';
                return;
            }

            const sorted = [...filtered].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

            sorted.forEach(function (t) {
                const card = document.createElement('div');
                card.className = 'event-card';
                card.innerHTML =
                    '<div class="feedback-item-video" style="max-width:none; aspect-ratio:16/9;">' +
                        '<iframe src="https://www.youtube.com/embed/' + t.videoId + '" allowfullscreen></iframe>' +
                    '</div>' +
                    '<div class="event-card-body">' +
                        '<span class="tutorial-card-category">' + escapeHtmlLocal(t.category) + '</span>' +
                        '<h3 class="event-card-title">' + escapeHtmlLocal(t.title) + '</h3>' +
                        '<p class="tutorial-card-instructions">' + escapeHtmlLocal(t.instructions) + '</p>' +
                    '</div>';
                tutorialsGrid.appendChild(card);
            });
        }

        initTutorialsFirebase();
        renderCategoryFilters();
        loadTutorials();
    })();

    console.log('Initialization complete');
});
