import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc,
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Category, Asset, MonthlyRecord, AppSettings } from '../types';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const db = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export const signInWithGoogle = async (): Promise<User> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Google Sign-In Error:", error);
    throw error;
  }
};

export const signOutUser = async (): Promise<void> => {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error("Sign-Out Error:", error);
    throw error;
  }
};

export interface UserCloudData {
  categories: Category[];
  assets: Asset[];
  records: MonthlyRecord[];
  settings: AppSettings;
  updatedAt?: any;
}

export const syncDataToCloud = async (
  userId: string,
  data: {
    categories: Category[];
    assets: Asset[];
    records: MonthlyRecord[];
    settings: AppSettings;
  }
) => {
  if (!userId) return;
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, {
    categories: data.categories,
    assets: data.assets,
    monthlyRecords: data.records,
    settings: data.settings,
    updatedAt: serverTimestamp(),
  }, { merge: true });
};

export const fetchUserCloudData = async (
  userId: string
): Promise<UserCloudData | null> => {
  if (!userId) return null;
  const userRef = doc(db, 'users', userId);
  const snapshot = await getDoc(userRef);
  if (snapshot.exists()) {
    const data = snapshot.data();
    return {
      categories: data.categories || [],
      assets: data.assets || [],
      records: data.monthlyRecords || [],
      settings: data.settings || {
        currencySymbol: 'NT$',
        stealthMode: false,
        defaultChartType: 'all',
        defaultGroupMode: 'category'
      },
      updatedAt: data.updatedAt
    };
  }
  return null;
};

export const subscribeToUserData = (
  userId: string,
  onData: (data: UserCloudData) => void,
  onError?: (err: any) => void
) => {
  const userRef = doc(db, 'users', userId);
  return onSnapshot(userRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      onData({
        categories: data.categories || [],
        assets: data.assets || [],
        records: data.monthlyRecords || [],
        settings: data.settings || {
          currencySymbol: 'NT$',
          stealthMode: false,
          defaultChartType: 'all',
          defaultGroupMode: 'category'
        },
        updatedAt: data.updatedAt
      });
    } else {
      onData({
        categories: [],
        assets: [],
        records: [],
        settings: {
          currencySymbol: 'NT$',
          stealthMode: false,
          defaultChartType: 'all',
          defaultGroupMode: 'category'
        }
      });
    }
  }, (err) => {
    console.error("Firestore snapshot error:", err);
    if (onError) onError(err);
  });
};

export { onAuthStateChanged };
export type { User };
