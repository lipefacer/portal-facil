
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged as fbOnAuthStateChanged, 
  signInWithEmailAndPassword as fbSignInWithEmailAndPassword, 
  createUserWithEmailAndPassword as fbCreateUserWithEmailAndPassword, 
  signOut as fbSignOut, 
  sendPasswordResetEmail as fbSendPasswordResetEmail 
} from "firebase/auth";
import { 
  getFirestore, 
  doc as fbDoc, 
  getDoc as fbGetDoc, 
  setDoc as fbSetDoc,
  updateDoc as fbUpdateDoc,
  deleteDoc as fbDeleteDoc,
  collection as fbCollection,
  addDoc as fbAddDoc,
  onSnapshot as fbOnSnapshot,
  query as fbQuery,
  where as fbWhere,
  orderBy as fbOrderBy,
  limit as fbLimit
} from "firebase/firestore";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyBFgChv2LW3kspfnae_WUl-0NRbIqp_8aM",
  authDomain: "portalfacil-a3adb.firebaseapp.com",
  projectId: "portalfacil-a3adb",
  storageBucket: "portalfacil-a3adb.firebasestorage.app",
  messagingSenderId: "722034138930",
  appId: "1:722034138930:web:1f1940735d76aeaed7c12b",
  measurementId: "G-N1C7JYJG9R"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Inicialização segura do Messaging
let messagingInstance: any = null;
const initMessaging = async () => {
  if (typeof window !== 'undefined' && await isSupported()) {
    try {
      messagingInstance = getMessaging(app);
      return messagingInstance;
    } catch (e) {
      console.warn("Firebase Messaging failed to initialize:", e);
      return null;
    }
  }
  return null;
};

// Exportamos uma função para obter a instância e a flag de suporte
export const getMessagingSafe = async () => {
  if (messagingInstance) return messagingInstance;
  return await initMessaging();
};

export const isMessagingSupported = isSupported;

// Auth Wrappers
export const onAuthStateChanged = fbOnAuthStateChanged;
export const signInWithEmailAndPassword = fbSignInWithEmailAndPassword;
export const createUserWithEmailAndPassword = fbCreateUserWithEmailAndPassword;
export const signOut = fbSignOut;
export const sendPasswordResetEmail = fbSendPasswordResetEmail;

// Firestore Exports
export const doc = fbDoc;
export const getDoc = fbGetDoc;
export const setDoc = fbSetDoc;
export const updateDoc = fbUpdateDoc;
export const deleteDoc = fbDeleteDoc;
export const collection = fbCollection;
export const addDoc = fbAddDoc;
export const onSnapshot = fbOnSnapshot;
export const query = fbQuery;
export const where = fbWhere;
export const orderBy = fbOrderBy;
export const limit = fbLimit;

// Messaging Exports
export { getToken, onMessage };
