import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import firebaseConfig from './firebase-applet-config.json'

const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

export const initAuth = (
  onAuthSuccess?: (user: User) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) { if (onAuthSuccess) onAuthSuccess(user) }
    else { if (onAuthFailure) onAuthFailure() }
  })
}

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider)
    return { user: result.user }
  } catch (error: any) {
    if (error?.code === 'auth/cancelled-popup-request' || error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/popup-blocked') {
      console.warn('Sign-in popup closed by user or blocked.')
      return null
    }
    console.error('Error signing in with Google', error)
    throw error
  }
}

export const logout = async () => {
  try { await signOut(auth) } catch (error) { console.error('Error signing out', error) }
}
