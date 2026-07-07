# PicShield — EAS Verification Checklist

- [ ] **Bootstrap & smoke test** — `npx create-expo-app picshield -t expo-template-blank-typescript && cd picshield && npx expo install expo-image-picker expo-file-system`, drop in `App.tsx` + `app.json`, then `npx expo start` and verify the pick → scan → strip flow on a device via Expo Go.
- [ ] **Build stores** — `npm i -g eas-cli && eas login && eas build:configure`, set the real `extra.eas.projectId`, then `eas build --platform ios --profile production` and `eas build --platform android --profile production` (Windows distribution ships the PWA: `npx expo export --platform web`, package with `eas build` web output or PWABuilder for the Microsoft Store).
- [ ] **Submit & verify** — `eas submit --platform ios` / `eas submit --platform android`, confirm the photo-library permission strings render in the store review builds, and re-run the strip flow on TestFlight/Internal Testing before promoting to production.
