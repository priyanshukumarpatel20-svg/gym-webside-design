// Firebase Configuration for D'VINTAGE ERA GYM
// ==========================================
// To set up Firebase for your website:
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project or use existing one
// 3. Enable Cloud Firestore database (start in test mode for development)
// 4. Go to Project Settings > General > Your apps
// 5. Copy your Firebase config and replace the values below

const firebaseConfig = {
    apiKey: "AIzaSyAfeNHt-VZEPX9s79vlNmmhmqf8kOJW6_U",
    authDomain: "dvintage-era-gym.firebaseapp.com",
    projectId: "dvintage-era-gym",
    storageBucket: "dvintage-era-gym.firebasestorage.app",
    messagingSenderId: "999789119042",
    appId: "1:999789119042:web:694a5920c67d2d7c38cfdb"
};

// Initialize Firebase
let db = null;
let auth = null;

(function() {
    try {
        // Check if Firebase app is already initialized
        if (firebase.apps.length === 0) {
            // Only initialize if no apps exist and config has real values
            if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
                firebase.initializeApp(firebaseConfig);
            }
        }
        
        // Get Firestore database instance if initialized
        if (firebase.apps.length > 0) {
            db = firebase.firestore();
            auth = firebase.auth();
        }
    } catch (e) {
        console.log('Firebase initialization skipped:', e.message);
    }
})();

// Export db and auth for use in other scripts
window.db = db;
window.auth = auth;
