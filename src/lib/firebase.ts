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
import { mergeMonthlyRecords, mergeCategories, mergeAssets, mergeSettings } from './syncMerge';

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
  deletedRecordMonths?: string[];
  updatedAt?: any;
}

/**
 * Recursively removes all keys with `undefined` values from objects and arrays.
 * This is required because Firestore throws:
 * "Unsupported field value: undefined" if any field or nested field in an object or array has the value `undefined`.
 */
export function deepCleanFirestoreData<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Preserve Firestore Sentinels (serverTimestamp, FieldValue, etc.)
  if (typeof obj === 'object' && obj !== null && (obj as any)._methodName !== undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => deepCleanFirestoreData(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = deepCleanFirestoreData(value);
      }
    }
    return cleaned as unknown as T;
  }

  return obj;
}

export const syncDataToCloud = async (
  userId: string,
  localData: {
    categories: Category[];
    assets: Asset[];
    records: MonthlyRecord[];
    settings: AppSettings;
    deletedRecordMonths?: string[];
  }
): Promise<{
  categories: Category[];
  assets: Asset[];
  records: MonthlyRecord[];
  settings: AppSettings;
  deletedRecordMonths: string[];
} | null> => {
  if (!userId) return null;
  const userRef = doc(db, 'users', userId);

  try {
    const snapshot = await getDoc(userRef);
    let finalCategories = localData.categories || [];
    let finalAssets = localData.assets || [];
    let finalRecords = localData.records || [];
    let finalSettings = localData.settings;
    let finalDeletedMonths = localData.deletedRecordMonths || [];

    if (snapshot.exists()) {
      const cloudData = snapshot.data();
      const cloudRecords: MonthlyRecord[] = cloudData.monthlyRecords || [];
      const cloudCategories: Category[] = cloudData.categories || [];
      const cloudAssets: Asset[] = cloudData.assets || [];
      const cloudSettings: AppSettings = cloudData.settings;
      const cloudDeletedMonths: string[] = cloudData.deletedRecordMonths || [];

      // Union of tombstoned deleted months
      finalDeletedMonths = Array.from(new Set([...cloudDeletedMonths, ...finalDeletedMonths]));

      // Union Guard: (Sync Data + Data on Device - (Sync Data ∩ Data on Device))
      const recordMerge = mergeMonthlyRecords(cloudRecords, localData.records, finalDeletedMonths);
      finalRecords = recordMerge.merged;
      finalCategories = mergeCategories(cloudCategories, localData.categories);
      finalAssets = mergeAssets(cloudAssets, localData.assets);
      finalSettings = mergeSettings(cloudSettings, localData.settings);
    }

    const cleanedCategories = deepCleanFirestoreData(finalCategories);
    const cleanedAssets = deepCleanFirestoreData(finalAssets);
    const cleanedRecords = deepCleanFirestoreData(finalRecords);
    const cleanedSettings = deepCleanFirestoreData(finalSettings || {
      currencySymbol: 'NT$',
      stealthMode: false,
      defaultChartType: 'all',
      defaultGroupMode: 'category',
    });
    const cleanedDeletedMonths = deepCleanFirestoreData(finalDeletedMonths);

    await setDoc(userRef, {
      categories: cleanedCategories,
      assets: cleanedAssets,
      monthlyRecords: cleanedRecords,
      settings: cleanedSettings,
      deletedRecordMonths: cleanedDeletedMonths,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return {
      categories: finalCategories,
      assets: finalAssets,
      records: finalRecords,
      settings: finalSettings,
      deletedRecordMonths: finalDeletedMonths,
    };
  } catch (error) {
    console.error("Error in syncDataToCloud:", error);
    throw error;
  }
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
      deletedRecordMonths: data.deletedRecordMonths || [],
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
        deletedRecordMonths: data.deletedRecordMonths || [],
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
        },
        deletedRecordMonths: [],
      });
    }
  }, (err) => {
    console.error("Firestore snapshot error:", err);
    if (onError) onError(err);
  });
};

export { onAuthStateChanged };
export type { User };
