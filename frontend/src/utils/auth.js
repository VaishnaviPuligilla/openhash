import { getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';

const PREVIEW_SESSION_KEY = 'openhash.preview.session';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasFirebaseAuthConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
].every(Boolean);

let auth = null;
let provider = null;

if (hasFirebaseAuthConfig) {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
  provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
}

const normalizeUser = (user, mode = 'firebase') => ({
  uid: user.uid,
  displayName: user.displayName || 'OpenHash User',
  email: user.email || 'unknown@openhash.app',
  photoURL: user.photoURL || '',
  createdAt: user.metadata?.creationTime || new Date().toISOString(),
  mode,
});

const readPreviewSession = () => {
  try {
    const raw = localStorage.getItem(PREVIEW_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writePreviewSession = (session) => {
  localStorage.setItem(PREVIEW_SESSION_KEY, JSON.stringify(session));
};

const createPreviewSession = () => {
  const existing = readPreviewSession();
  if (existing) return existing;

  const preview = {
    uid: 'preview-openhash-user',
    displayName: 'OpenHash User',
    email: 'preview@openhash.app',
    photoURL: '',
    createdAt: new Date().toISOString(),
    mode: 'preview',
  };

  writePreviewSession(preview);
  return preview;
};

export const isFirebaseAuthReady = hasFirebaseAuthConfig;

export const subscribeToSession = (callback) => {
  if (auth) {
    return onAuthStateChanged(auth, (user) => {
      callback(user ? normalizeUser(user) : null);
    });
  }

  callback(readPreviewSession());
  return () => {};
};

export const loginWithGoogle = async () => {
  if (auth && provider) {
    const credential = await signInWithPopup(auth, provider);
    return normalizeUser(credential.user);
  }

  return createPreviewSession();
};

export const logoutCurrentUser = async () => {
  if (auth) {
    await signOut(auth);
  }

  localStorage.removeItem(PREVIEW_SESSION_KEY);
};
