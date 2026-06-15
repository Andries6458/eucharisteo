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
  apiKey: 'AIzaSyAnNnE3KrrY-jT7EpLC1eD-Z_s_xSFOm0Q',
  authDomain: 'invoice-tracker-eucharisteo.firebaseapp.com',
  projectId: 'invoice-tracker-eucharisteo',
  storageBucket: 'invoice-tracker-eucharisteo.firebasestorage.app',
  messagingSenderId: '717886349824',
  appId: '1:717886349824:web:e8e8846e7026d6d24faee5',
};

/** Shared workspace document path. All users read/write the same company data. */
export const WORKSPACE_ID = 'eucharisteo';

/**
 * The Eucharisteo legal entities that issue / receive invoices.
 *  - Invoices TO Vulcan Mozambique are issued by EC Trading LDA (Mozambique).
 *  - AMSA Vanderbijlpark invoices Eucharisteo Trading (Pty) Ltd (South Africa).
 * Fill in the blank EC Trading LDA fields (NUIT, reg, address) when you have
 * them — they appear on the Vulcan invoice PDFs.
 */
export const ENTITIES = {
  ECT_LDA: {
    name: 'EC Trading LDA',
    country: 'Mozambique',
    reg: '',     // commercial registration (NUEL) — fill in
    taxNo: '',   // NUIT (Mozambique tax number) — fill in
    address: '', // Mozambique address — fill in
  },
  EUCHARISTEO_SA: {
    name: 'Eucharisteo Trading (Pty) Ltd',
    country: 'South Africa',
    reg: '2017/337151/07',
    vatNo: '4020319580',
    address: 'Vanderbijlpark, Gauteng, South Africa',
  },
};

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
  brand: 'Eucharisteo · EC Trading',
  reg: '2017/337151/07',
  vatNo: '4020319580',
  location: 'Vanderbijlpark, Gauteng, South Africa',

  // ----- reminder rules -----
  leadTimeDays: [7, 3, 1],       // nudge this many days BEFORE the due date
  overdueTiers: [7, 14, 30, 60], // escalating overdue alerts; top tier = CRITICAL
  stalenessDays: 30,             // flag invoices with no payment activity for this long
  weeklySummaryDay: 1,           // 0=Sun … 1=Mon: send the weekly outstanding summary
};
