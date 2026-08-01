import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
} from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: "AIzaSyD43nyoKrMr-NcgYosODsjojAdIWWDH340",
  authDomain: "sistema-navegacao.firebaseapp.com",
  projectId: "sistema-navegacao",
  storageBucket: "sistema-navegacao.firebasestorage.app",
  messagingSenderId: "105733878321",
  appId: "1:105733878321:web:b1771e07d889357e74db10",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let dbInstance;
try {
  dbInstance = getFirestore(app);
} catch (e) {
  dbInstance = initializeFirestore(app, {
    localCache: memoryLocalCache(),
  });
}

export const db = dbInstance;

let firebaseAuth;
if (Platform.OS === "web") {
  firebaseAuth = getAuth(app);
} else {
  try {
    firebaseAuth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e) {
    firebaseAuth = getAuth(app);
  }
}

export const auth = firebaseAuth;
export const storage = getStorage(app);
export default app;
