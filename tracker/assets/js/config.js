/* ==========================================================================
   EUCHARISTEO INVOICE TRACKER — Configuration
   --------------------------------------------------------------------------
   TO ENABLE SHARED CLOUD SYNC FOR YOUR 6 USERS:
   1. Go to https://console.firebase.google.com  → "Add project"
        - Name it e.g. "eucharisteo-invoices". Disable Google Analytics (optional).
   2. In the project: Build → Authentication → Get started →
        enable "Email/Password". Then add up to 6 users under the "Users" tab
        (email + password for each partner).
   3. Build → Firestore Database → Create database → Production mode →
        pick a location near you (e.g. europe-west). Then paste the security
        rules from tracker/README.md (the "Firestore rules" section).
   4. Project settings (gear icon) → "Your apps" → Web app (</>) → register →
        copy the firebaseConfig values and paste them below, replacing the
        placeholder strings. Save the file and re-deploy.

   Until you fill this in, the app runs in LOCAL MODE: data is saved only on
   this one device (great for trying it out / offline use). Once configured,
   all signed-in users share the same live data anywhere in the world.
   ========================================================================== */

export const firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_PROJECT.firebaseapp.com',
  projectId: 'PASTE_PROJECT',
  storageBucket: 'PASTE_PROJECT.appspot.com',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId: 'PASTE_APP_ID',
};

/** Shared workspace document path. All users read/write the same company data. */
export const WORKSPACE_ID = 'eucharisteo';

/** True only when the placeholders above have been replaced with real values. */
export function isFirebaseConfigured() {
  return (
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.startsWith('PASTE_') &&
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.startsWith('PASTE_')
  );
}

export const APP = {
  company: 'Eucharisteo Trading (Pty) Ltd',
  reg: '2017/337151/07',
  vatNo: '4020319580',
  location: 'Vanderbijlpark, Gauteng, South Africa',
  dueSoonDays: 7,     // "due soon" reminder window
  stalenessDays: 30,  // flag invoices with no activity for this many days
};
