import { Platform } from "react-native";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
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

function hasFirebaseConfig() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
  );
}

const firebaseApp = hasFirebaseConfig()
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

function createFirebaseAuth() {
  if (!firebaseApp) return null;
  if (Platform.OS === "web") return getAuth(firebaseApp);
  // Native builds can differ in available Firebase RN auth entrypoints.
  // Use safe default auth init to avoid launch regressions on OTA updates.
  return getAuth(firebaseApp);
}

export const firebaseAuth = createFirebaseAuth();

export function isFirebaseAuthConfigured() {
  return Boolean(firebaseAuth);
}

export function watchAuthState(listener: (user: User | null) => void) {
  if (!firebaseAuth) {
    listener(null);
    return () => undefined;
  }
  return onAuthStateChanged(firebaseAuth, listener);
}

export async function authenticateWithGoogleIdToken(idToken: string, accessToken?: string | null) {
  if (!firebaseAuth) throw new Error("Firebase auth is not configured.");
  const credential = GoogleAuthProvider.credential(idToken, accessToken || undefined);
  return await signInWithCredential(firebaseAuth, credential);
}

export async function authenticateWithAppleToken(idToken: string, rawNonce: string) {
  if (!firebaseAuth) throw new Error("Firebase auth is not configured.");
  const provider = new OAuthProvider("apple.com");
  const credential = provider.credential({ idToken, rawNonce });
  return await signInWithCredential(firebaseAuth, credential);
}

/**
 * Sign in with email and password.
 * Never creates a new account — throws on invalid credentials.
 */
export async function authenticateWithEmail(
  email: string,
  password: string,
  mode: "signin" | "signup" = "signin",
) {
  if (!firebaseAuth) throw new Error("Firebase auth is niet geconfigureerd.");
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Voer een geldig e-mailadres in.");
  }
  if (normalizedPassword.length < 8) {
    throw new Error("Wachtwoord moet minimaal 8 tekens lang zijn.");
  }

  if (mode === "signup") {
    return await createUserWithEmailAndPassword(
      firebaseAuth,
      normalizedEmail,
      normalizedPassword,
    );
  }

  // Sign in only — never silently create accounts on auth failure.
  return await signInWithEmailAndPassword(
    firebaseAuth,
    normalizedEmail,
    normalizedPassword,
  );
}

export async function signOutFirebaseUser() {
  if (!firebaseAuth) return;
  await signOut(firebaseAuth);
}

export function getFirebaseCurrentUser() {
  return firebaseAuth?.currentUser || null;
}