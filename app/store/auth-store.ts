/**
 * CineLog — account & session.
 *
 * Uses Firebase when it is configured; otherwise it keeps a local account on the
 * device so signing in, registering and signing out all work while CineLog is
 * run without a backend. Either way the session is persisted across restarts.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  isFirebaseConfigured,
  registerWithEmail,
  requestPasswordReset,
  signInWithEmail,
  signOutFirebase,
  watchFirebaseAuth,
} from "@/lib/firebase-auth";

const MIN_PASSWORD_LENGTH = 8;

export interface CineLogUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  /** True when the account only exists on this device. */
  isLocal: boolean;
}

export interface AuthState {
  user: CineLogUser | null;
  /** True until the persisted session has been rehydrated. */
  isRestoring: boolean;
  error: string | null;
  isSubmitting: boolean;

  signIn: (email: string, password: string) => Promise<boolean>;
  register: (
    displayName: string,
    email: string,
    password: string,
  ) => Promise<boolean>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  updateProfileDetails: (
    patch: Partial<Pick<CineLogUser, "displayName" | "avatarUrl">>,
  ) => void;
  clearError: () => void;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validate(email: string, password: string): string | null {
  if (!normalizeEmail(email).includes("@")) {
    return "Enter a valid email address.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/** Turn Firebase's error codes into copy a viewer can act on. */
function readableAuthError(error: unknown): string {
  const code = String(
    (error as { code?: string })?.code ?? (error as Error)?.message ?? "",
  );
  if (code.includes("email-already-in-use")) {
    return "That email already has a CineLog account.";
  }
  if (code.includes("invalid-credential") || code.includes("wrong-password")) {
    return "Email or password is incorrect.";
  }
  if (code.includes("user-not-found")) {
    return "We couldn't find an account for that email.";
  }
  if (code.includes("too-many-requests")) {
    return "Too many attempts. Try again in a few minutes.";
  }
  if (code.includes("network")) {
    return "You appear to be offline. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

function localUser(email: string, displayName: string): CineLogUser {
  const normalized = normalizeEmail(email);
  return {
    id: `local:${normalized}`,
    email: normalized,
    displayName: displayName.trim() || normalized.split("@")[0],
    avatarUrl: null,
    createdAt: new Date().toISOString(),
    isLocal: true,
  };
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isRestoring: true,
      error: null,
      isSubmitting: false,

      signIn: async (email, password) => {
        const invalid = validate(email, password);
        if (invalid) {
          set({ error: invalid });
          return false;
        }
        set({ isSubmitting: true, error: null });
        try {
          if (isFirebaseConfigured()) {
            const credential = await signInWithEmail(
              normalizeEmail(email),
              password,
            );
            set({
              user: {
                id: credential.user.uid,
                email: credential.user.email ?? normalizeEmail(email),
                displayName:
                  credential.user.displayName ||
                  normalizeEmail(email).split("@")[0],
                avatarUrl: credential.user.photoURL ?? null,
                createdAt: new Date().toISOString(),
                isLocal: false,
              },
            });
          } else {
            const existing = get().user;
            set({
              user:
                existing && existing.email === normalizeEmail(email)
                  ? existing
                  : localUser(email, ""),
            });
          }
          return true;
        } catch (error) {
          set({ error: readableAuthError(error) });
          return false;
        } finally {
          set({ isSubmitting: false });
        }
      },

      register: async (displayName, email, password) => {
        const invalid = validate(email, password);
        if (invalid) {
          set({ error: invalid });
          return false;
        }
        if (displayName.trim().length < 2) {
          set({ error: "Enter the name you want to use on CineLog." });
          return false;
        }
        set({ isSubmitting: true, error: null });
        try {
          if (isFirebaseConfigured()) {
            const credential = await registerWithEmail(
              normalizeEmail(email),
              password,
              displayName.trim(),
            );
            set({
              user: {
                id: credential.user.uid,
                email: credential.user.email ?? normalizeEmail(email),
                displayName: displayName.trim(),
                avatarUrl: credential.user.photoURL ?? null,
                createdAt: new Date().toISOString(),
                isLocal: false,
              },
            });
          } else {
            set({ user: localUser(email, displayName) });
          }
          return true;
        } catch (error) {
          set({ error: readableAuthError(error) });
          return false;
        } finally {
          set({ isSubmitting: false });
        }
      },

      signOut: async () => {
        try {
          await signOutFirebase();
        } catch {
          // Signing out locally is what matters; ignore transport failures.
        }
        set({ user: null, error: null });
      },

      sendPasswordReset: async (email) => {
        if (!normalizeEmail(email).includes("@")) {
          set({ error: "Enter a valid email address." });
          return false;
        }
        if (!isFirebaseConfigured()) {
          set({
            error:
              "Password reset needs an email provider. Connect Firebase to enable it.",
          });
          return false;
        }
        set({ isSubmitting: true, error: null });
        try {
          await requestPasswordReset(normalizeEmail(email));
          return true;
        } catch (error) {
          set({ error: readableAuthError(error) });
          return false;
        } finally {
          set({ isSubmitting: false });
        }
      },

      updateProfileDetails: (patch) =>
        set((state) =>
          state.user ? { user: { ...state.user, ...patch } } : state,
        ),

      clearError: () => set({ error: null }),
    }),
    {
      name: "cinelog.auth.v1",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (state) => ({ user: state.user }),
    },
  ),
);

// AsyncStorage rehydration is async, so screens wait on `isRestoring` before
// deciding whether to show the sign-in wall.
useAuth.persist.onFinishHydration(() => {
  useAuth.setState({ isRestoring: false });
});
if (useAuth.persist.hasHydrated()) {
  useAuth.setState({ isRestoring: false });
}

/**
 * Keep the store in sync with Firebase's own session so a token refresh or a
 * sign-out from another tab is reflected in the UI.
 */
export function startAuthSync(): () => void {
  if (!isFirebaseConfigured()) return () => undefined;
  return watchFirebaseAuth((firebaseUser) => {
    if (!firebaseUser) {
      const current = useAuth.getState().user;
      if (current && !current.isLocal) useAuth.setState({ user: null });
      return;
    }
    useAuth.setState({
      user: {
        id: firebaseUser.uid,
        email: firebaseUser.email ?? "",
        displayName:
          firebaseUser.displayName || (firebaseUser.email ?? "").split("@")[0],
        avatarUrl: firebaseUser.photoURL ?? null,
        createdAt: new Date().toISOString(),
        isLocal: false,
      },
    });
  });
}
