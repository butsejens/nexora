/**
 * CineLog — Firebase authentication adapter.
 *
 * Every export degrades gracefully when Firebase is not configured, so the app
 * can run (and be developed) against a local-only account instead.
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";

import { ENV } from "@/constants/env";

const firebaseConfig = {
  apiKey: ENV.firebase.apiKey,
  authDomain: ENV.firebase.authDomain,
  projectId: ENV.firebase.projectId,
  storageBucket: ENV.firebase.storageBucket,
  messagingSenderId: ENV.firebase.messagingSenderId,
  appId: ENV.firebase.appId,
};

function hasFirebaseConfig(): boolean {
  return Boolean(
    firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
  );
}

const firebaseApp = hasFirebaseConfig()
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;

export function isFirebaseConfigured(): boolean {
  return firebaseAuth !== null;
}

export function watchFirebaseAuth(listener: (user: User | null) => void) {
  if (!firebaseAuth) {
    listener(null);
    return () => undefined;
  }
  return onAuthStateChanged(firebaseAuth, listener);
}

export async function signInWithEmail(email: string, password: string) {
  if (!firebaseAuth) throw new Error("Sign-in is not available right now.");
  return signInWithEmailAndPassword(firebaseAuth, email, password);
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string,
) {
  if (!firebaseAuth) throw new Error("Sign-up is not available right now.");
  const credential = await createUserWithEmailAndPassword(
    firebaseAuth,
    email,
    password,
  );
  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }
  return credential;
}

export async function requestPasswordReset(email: string) {
  if (!firebaseAuth)
    throw new Error("Password reset is not available right now.");
  await sendPasswordResetEmail(firebaseAuth, email);
}

export async function signOutFirebase() {
  if (!firebaseAuth) return;
  await signOut(firebaseAuth);
}
