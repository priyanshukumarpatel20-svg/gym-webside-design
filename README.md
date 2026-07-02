# D'Vintage Era Gym — Website

A full-stack gym website built with vanilla HTML, CSS, and JavaScript, powered by Firebase (Firestore + Authentication) for real-time, shared data across all visitors.

## 🔗 Live Demo
> Add your GitHub Pages link here, e.g. `https://priyanshukumarpatel20-svg.github.io/gym-webside-design/`

## ✨ Features

### Member Feedback
- Star-rating feedback form with optional photo and YouTube video attachment
- Real-time shared reviews (stored in Firestore, visible to every visitor — not just the submitter's browser)
- Like / unlike system (one like per device)
- Comment threads on each review
- Owner-only delete controls (protected by Firebase Authentication)

### Events
- Owner can publish events with a full-size photo, description, date/time, and optional registration fee
- Live countdown timer (days / hours / minutes / seconds) per event
- Member registration form (name, phone, payment details) per event
- Multiple events can run concurrently

### Exercise Tutorials
- Owner can publish exercise tutorials with a YouTube video and step-by-step written instructions
- Category filters (Chest, Back, Legs, Shoulders, Arms, Core, Cardio, Full Body)

### Owner / Admin
- Secure login via Firebase Authentication (email + password)
- "Forgot password" flow (Firebase sends a reset link by email)
- In-app password change
- Only logged-in owners can publish events/tutorials or delete feedback

## 🛠️ Tech Stack
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (no frameworks)
- **Backend / Database:** Firebase Firestore (NoSQL, real-time)
- **Auth:** Firebase Authentication (Email/Password)
- **Media:** Client-side image compression (Canvas API) before storing as base64; videos handled via YouTube embeds (no video hosting cost)

## 📂 Project Structure
```
├── index.html          # Page structure & markup for all sections
├── styles.css          # Styling (custom properties / theme variables)
├── script.js           # All client-side logic (feedback, events, tutorials, auth)
└── firebase-config.js  # Firebase project configuration & initialization
```

## ⚙️ Setup / Running Locally

1. Clone the repository
   ```bash
   git clone <repo-url>
   ```
2. Create a [Firebase project](https://console.firebase.google.com/) and enable:
   - **Firestore Database** (start in production mode)
   - **Authentication → Email/Password** sign-in method
3. Replace the placeholder values in `firebase-config.js` with your Firebase project's config (found in Project Settings → Your apps).
4. Add at least one owner account under Authentication → Users.
5. Set your Firestore Security Rules (see below).
6. Open `index.html` in a browser, or deploy via GitHub Pages / Firebase Hosting.

### Firestore Security Rules
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /reviews/{reviewId} {
      allow read: if true;
      allow create: if true;
      allow update: if true;
      allow delete: if request.auth != null;
    }
    match /events/{eventId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null;
    }
    match /eventRegistrations/{regId} {
      allow read: if request.auth != null;
      allow create: if true;
      allow update, delete: if false;
    }
    match /tutorials/{tutorialId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null;
    }
  }
}
```

## 💡 Key Design Decisions
- **Base64 image storage in Firestore** instead of Firebase Storage — avoids requiring a billing-enabled (Blaze) plan while keeping the whole project on Firebase's free Spark tier. Images are compressed client-side via the Canvas API before upload.
- **YouTube embeds instead of video uploads** — for the same reason: no storage costs, and creators can manage their own video hosting.
- **Firebase Authentication over a hardcoded password** — ensures owner credentials are never exposed in client-side source code.

## 🚀 Possible Future Improvements
- Migrate images to Firebase Storage / a CDN for better performance at scale
- Add pagination for large numbers of reviews/events
- Add an admin dashboard to view event registrations in one place
- Form validation & rate-limiting to reduce spam submissions

## 👤 Author
Built by Priyanshu Kumar Patel as a personal/learning project.
