import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import firebaseConfig from './firebase-applet-config.json'

// Access to this module is already gated by NextAuth's /admin login
// (ADMIN_USER/ADMIN_PASSWORD). Firebase Auth here only exists to satisfy
// Firestore's security rules (request.auth != null) — no user-facing
// sign-in step is needed, so we sign in anonymously and silently.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
// This project uses Firestore's multi-database feature — the finanzapro
// data lives in a named database, not "(default)". Passing the id here is
// required or every read/write silently targets a database that doesn't
// have this data (or doesn't exist), which looked like a stuck spinner.
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId)
export const auth = getAuth(app)

export const initAuth = (
  onAuthSuccess?: (user: User) => void,
  onAuthFailure?: (error?: unknown) => void
) => {
  const unsub = onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user)
    } else {
      signInAnonymously(auth).catch(err => {
        console.error('Anonymous sign-in failed', err)
        if (onAuthFailure) onAuthFailure(err)
      })
    }
  }, err => {
    console.error('onAuthStateChanged error', err)
    if (onAuthFailure) onAuthFailure(err)
  })
  return unsub
}
