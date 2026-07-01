document.addEventListener('DOMContentLoaded', function () {

    console.log('Script loaded, initializing...');

    // Feedback form and star rating
    const feedbackForm = document.getElementById('feedbackForm');
    const feedbackNameInput = document.getElementById('feedbackName');
    const feedbackEmailInput = document.getElementById('feedbackEmail');
    const feedbackMessageInput = document.getElementById('feedbackMessage');
    const feedbackRatingStars = document.querySelectorAll('#feedbackRatingStars button');
    const feedbackList = document.getElementById('feedbackList');
    const averageRatingValue = document.getElementById('averageRatingValue');
    const averageRatingCount = document.getElementById('averageRatingCount');

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

        visible.forEach(entry => {
            const div = document.createElement('div');
            div.className = 'feedback-item';
            
            let starsHtml = '';
            for (let i = 1; i <= 5; i++) {
                starsHtml += '<span class="star' + (i <= entry.rating ? ' filled' : '') + '">★</span>';
            }
            
            div.innerHTML = 
                '<div class="feedback-item-header">' +
                    '<p class="feedback-item-name">' + escapeHtml(entry.name) + '</p>' +
                    '<p class="feedback-item-email">' + escapeHtml(entry.email) + '</p>' +
                '</div>' +
                '<div class="feedback-item-stars">' + starsHtml + '</div>' +
                '<p class="feedback-item-message">' + escapeHtml(entry.message) + '</p>';
            feedbackList.appendChild(div);
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
                            timestamp: data.timestamp
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
                timestamp: Date.now()
            };

            function finishSubmit() {
                feedbackForm.reset();
                setRating(0);
                showAllFeedback = false;
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
        const adminAddEventBtn = document.getElementById('adminAddEventBtn');
        const eventAdminFormWrapper = document.getElementById('eventAdminFormWrapper');
        const eventAdminForm = document.getElementById('eventAdminForm');
        const cancelAddEventBtn = document.getElementById('cancelAddEventBtn');
        const eventPhotoInput = document.getElementById('eventPhoto');
        const eventPhotoPreview = document.getElementById('eventPhotoPreview');
        const eventsGrid = document.getElementById('eventsGrid');

        if (!eventsGrid) return; // section not present on this page

        // Simple owner-only gate. NOTE: this is client-side only, so it is
        // a basic deterrent (keeps casual visitors out) not real security.
        // For real protection, add Firebase Authentication later.
        const ADMIN_PASSWORD = 'dvintage2026';

        let eventsCollection = null;
        let registrationsCollection = null;
        let events = [];
        let compressedPhotoBase64 = null;
        let countdownInterval = null;

        function initEventsFirebase() {
            try {
                const database = window.db;
                if (typeof firebase !== 'undefined' && database) {
                    eventsCollection = database.collection('events');
                    registrationsCollection = database.collection('eventRegistrations');
                    return true;
                }
            } catch (e) {
                console.warn('Firebase not configured for events:', e.message);
            }
            return false;
        }

        function escapeHtmlLocal(str) {
            const div = document.createElement('div');
            div.textContent = str == null ? '' : String(str);
            return div.innerHTML;
        }

        // ---- Admin gate ----
        if (adminAddEventBtn) {
            adminAddEventBtn.addEventListener('click', function () {
                if (eventAdminFormWrapper.style.display === 'block') {
                    eventAdminFormWrapper.style.display = 'none';
                    return;
                }
                const pass = prompt('Enter owner password to add an event:');
                if (pass === null) return;
                if (pass === ADMIN_PASSWORD) {
                    eventAdminFormWrapper.style.display = 'block';
                    eventAdminFormWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    alert('Incorrect password.');
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
            });

            startCountdowns();
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
        loadEvents();
    })();

    console.log('Initialization complete');
});
