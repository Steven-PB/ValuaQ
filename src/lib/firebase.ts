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
  getDocFromServer,
  runTransaction,
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Category, Asset, MonthlyRecord, AppSettings, LedgerTransaction, MonthlyPriceMap, MonthlyNotesMap } from '../types';
import { DeletedIdsMap } from './storage';
import { 
  mergeMonthlyRecords, 
  mergeCategories, 
  mergeAssets, 
  mergeSettings, 
  mergeTransactions, 
  mergeMonthlyPrices,
  mergeMonthlyNotes,
  mergeDeletedIds 
} from './syncMerge';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export const db = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export const signInWithGoogle = async (): Promise<User> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Google Sign-In Error:', error);
    throw error;
  }
};

export const signOutUser = async (): Promise<void> => {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('Sign-Out Error:', error);
    throw error;
  }
};

export interface UserCloudData {
  categories: Category[];
  assets: Asset[];
  records: MonthlyRecord[];
  transactions?: LedgerTransaction[];
  monthlyPrices?: MonthlyPriceMap;
  monthlyNotes?: MonthlyNotesMap;
  settings: AppSettings;
  deletedRecordMonths?: string[];
  deletedIds?: DeletedIdsMap;
  updatedAt?: any;
}

/**
 * Recursively removes all keys with `undefined` values from objects and arrays.
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
    transactions?: LedgerTransaction[];
    monthlyPrices?: MonthlyPriceMap;
    monthlyNotes?: MonthlyNotesMap;
    settings: AppSettings;
    deletedRecordMonths?: string[];
    deletedIds?: DeletedIdsMap;
  },
  options?: { overwrite?: boolean }
): Promise<{
  categories: Category[];
  assets: Asset[];
  records: MonthlyRecord[];
  transactions: LedgerTransaction[];
  monthlyPrices: MonthlyPriceMap;
  monthlyNotes: MonthlyNotesMap;
  settings: AppSettings;
  deletedRecordMonths: string[];
  deletedIds: DeletedIdsMap;
} | null> => {
  if (!userId) return null;
  const path = `users/${userId}`;
  const userRef = doc(db, 'users', userId);

  try {
    // Execute atomic read-merge-write transaction in Firestore so Ledger transactions, Assets, and Categories
    // are committed in a single serializable atomic operation without race conditions.
    return await runTransaction(db, async (tx) => {
      const snapshot = await tx.get(userRef);

      let finalCategories = localData.categories || [];
      let finalAssets = localData.assets || [];
      let finalRecords = localData.records || [];
      let finalTransactions = localData.transactions || [];
      let finalMonthlyPrices = localData.monthlyPrices || {};
      let finalMonthlyNotes = localData.monthlyNotes || {};
      let finalSettings = localData.settings;
      let finalDeletedMonths = localData.deletedRecordMonths || [];
      let finalDeletedIds: DeletedIdsMap = localData.deletedIds || {
        categories: [],
        assets: [],
        transactions: [],
      };

      if (snapshot.exists() && !options?.overwrite) {
        const cloudData = snapshot.data();
        const cloudRecords: MonthlyRecord[] = cloudData.monthlyRecords || [];
        const cloudCategories: Category[] = cloudData.categories || [];
        const cloudAssets: Asset[] = cloudData.assets || [];
        const cloudTransactions: LedgerTransaction[] = cloudData.transactions || [];
        const cloudMonthlyPrices: MonthlyPriceMap =
          cloudData.monthlyAssetPrices || cloudData.monthlyPrices || {};
        const cloudMonthlyNotes: MonthlyNotesMap = cloudData.monthlyNotes || {};
        const cloudSettings: AppSettings = cloudData.settings;
        const cloudDeletedMonths: string[] = cloudData.deletedRecordMonths || [];
        const cloudDeletedIds: Partial<DeletedIdsMap> = cloudData.deletedIds || {};

        // 1. Union of tombstoned deleted months and deleted entity IDs
        finalDeletedMonths = Array.from(new Set([...cloudDeletedMonths, ...finalDeletedMonths]));
        finalDeletedIds = mergeDeletedIds(cloudDeletedIds, finalDeletedIds);

        // 2. Merge Transactions first so we know every assetId actively referenced by the ledger
        finalTransactions = mergeTransactions(
          cloudTransactions,
          localData.transactions,
          finalDeletedIds.transactions
        );

        // 3. Merge Assets with referential integrity guard against finalTransactions
        finalAssets = mergeAssets(
          cloudAssets,
          localData.assets,
          finalDeletedIds.assets,
          finalTransactions
        );

        // 4. Merge Categories with referential integrity guard against finalAssets
        finalCategories = mergeCategories(
          cloudCategories,
          localData.categories,
          finalDeletedIds.categories,
          finalAssets
        );

        // 5. Merge Monthly Records, Prices, Notes, and Settings
        const recordMerge = mergeMonthlyRecords(cloudRecords, localData.records, finalDeletedMonths);
        finalRecords = recordMerge.merged;
        finalMonthlyPrices = mergeMonthlyPrices(cloudMonthlyPrices, localData.monthlyPrices);
        finalMonthlyNotes = mergeMonthlyNotes(cloudMonthlyNotes, localData.monthlyNotes);
        finalSettings = mergeSettings(cloudSettings, localData.settings);
      }

      const cleanedCategories = deepCleanFirestoreData(finalCategories);
      const cleanedAssets = deepCleanFirestoreData(finalAssets);
      const cleanedRecords = deepCleanFirestoreData(finalRecords);
      const cleanedTransactions = deepCleanFirestoreData(finalTransactions);
      const cleanedMonthlyPrices = deepCleanFirestoreData(finalMonthlyPrices);
      const cleanedMonthlyNotes = deepCleanFirestoreData(finalMonthlyNotes);
      const cleanedSettings = deepCleanFirestoreData(
        finalSettings || {
          currencySymbol: 'NT$',
          stealthMode: false,
          defaultChartType: 'all',
          defaultGroupMode: 'category',
        }
      );
      const cleanedDeletedMonths = deepCleanFirestoreData(finalDeletedMonths);
      const cleanedDeletedIds = deepCleanFirestoreData(finalDeletedIds);

      tx.set(userRef, {
        categories: cleanedCategories,
        assets: cleanedAssets,
        monthlyRecords: cleanedRecords,
        transactions: cleanedTransactions,
        monthlyAssetPrices: cleanedMonthlyPrices,
        monthlyNotes: cleanedMonthlyNotes,
        settings: cleanedSettings,
        deletedRecordMonths: cleanedDeletedMonths,
        deletedIds: cleanedDeletedIds,
        updatedAt: serverTimestamp(),
      });

      return {
        categories: finalCategories,
        assets: finalAssets,
        records: finalRecords,
        transactions: finalTransactions,
        monthlyPrices: finalMonthlyPrices,
        monthlyNotes: finalMonthlyNotes,
        settings: finalSettings,
        deletedRecordMonths: finalDeletedMonths,
        deletedIds: finalDeletedIds,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const fetchUserCloudData = async (
  userId: string,
  options?: { fromServer?: boolean }
): Promise<UserCloudData | null> => {
  if (!userId) return null;
  const path = `users/${userId}`;
  const userRef = doc(db, 'users', userId);
  try {
    let snapshot;
    if (options?.fromServer) {
      try {
        snapshot = await getDocFromServer(userRef);
      } catch (_serverErr) {
        snapshot = await getDoc(userRef);
      }
    } else {
      snapshot = await getDoc(userRef);
    }

    if (snapshot.exists()) {
      const data = snapshot.data();
      return {
        categories: data.categories || [],
        assets: data.assets || [],
        records: data.monthlyRecords || [],
        transactions: data.transactions || [],
        monthlyPrices: data.monthlyAssetPrices || data.monthlyPrices || {},
        monthlyNotes: data.monthlyNotes || {},
        settings: data.settings || {
          currencySymbol: 'NT$',
          stealthMode: false,
          defaultChartType: 'all',
          defaultGroupMode: 'category',
        },
        deletedRecordMonths: data.deletedRecordMonths || [],
        deletedIds: {
          categories: Array.isArray(data.deletedIds?.categories) ? data.deletedIds.categories : [],
          assets: Array.isArray(data.deletedIds?.assets) ? data.deletedIds.assets : [],
          transactions: Array.isArray(data.deletedIds?.transactions)
            ? data.deletedIds.transactions
            : [],
        },
        updatedAt: data.updatedAt,
      };
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
};

export const subscribeToUserData = (
  userId: string,
  onData: (data: UserCloudData) => void,
  onError?: (err: any) => void
) => {
  const path = `users/${userId}`;
  const userRef = doc(db, 'users', userId);
  return onSnapshot(
    userRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        onData({
          categories: data.categories || [],
          assets: data.assets || [],
          records: data.monthlyRecords || [],
          transactions: data.transactions || [],
          monthlyPrices: data.monthlyAssetPrices || data.monthlyPrices || {},
          monthlyNotes: data.monthlyNotes || {},
          settings: data.settings || {
            currencySymbol: 'NT$',
            stealthMode: false,
            defaultChartType: 'all',
            defaultGroupMode: 'category',
          },
          deletedRecordMonths: data.deletedRecordMonths || [],
          deletedIds: {
            categories: Array.isArray(data.deletedIds?.categories)
              ? data.deletedIds.categories
              : [],
            assets: Array.isArray(data.deletedIds?.assets) ? data.deletedIds.assets : [],
            transactions: Array.isArray(data.deletedIds?.transactions)
              ? data.deletedIds.transactions
              : [],
          },
          updatedAt: data.updatedAt,
        });
      }
    },
    (err) => {
      console.error('Firestore snapshot error:', err);
      if (onError) onError(err);
      try {
        handleFirestoreError(err, OperationType.GET, path);
      } catch (_ignored) {
        // Error logged with full FirestoreErrorInfo context
      }
    }
  );
};

export { onAuthStateChanged };
export type { User };
