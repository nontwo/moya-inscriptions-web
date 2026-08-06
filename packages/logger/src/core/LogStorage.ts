// ============================================================
// IndexedDB 持久化存储
// 保留30天，使用 requestIdleCallback 异步写入
// ============================================================

import { openDB, type IDBPDatabase } from 'idb';
import type { LogEntry } from '@moya/contracts';
import { logCollector } from './LogCollector';

const DB_NAME = 'moya_logs';
const STORE_NAME = 'log_entries';
const RETENTION_DAYS = 30;
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('level', 'level');
      },
    });
  }
  return dbPromise;
}

/** 异步写入日志到 IndexedDB */
export async function persistLog(entry: LogEntry): Promise<void> {
  const writeToDB = async () => {
    const db = await getDB();
    await db.put(STORE_NAME, entry);
  };

  if (typeof requestIdleCallback !== 'undefined') {
    return new Promise<void>((resolve, reject) => {
      requestIdleCallback(
        () => { writeToDB().then(resolve).catch(reject); },
        { timeout: 2000 }
      );
    });
  } else {
    return new Promise<void>((resolve, reject) => {
      setTimeout(() => { writeToDB().then(resolve).catch(reject); }, 0);
    });
  }
}

/** 清理30天前的旧日志 */
export async function cleanOldLogs(): Promise<void> {
  const db = await getDB();
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const index = tx.store.index('timestamp');
  let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff));
  while (cursor) {
    cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

/** 从 IndexedDB 加载历史日志 */
export async function loadPersistedLogs(): Promise<LogEntry[]> {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

/** 启动自动持久化 */
export function startPersistence(): () => void {
  const unsubscribe = logCollector.subscribe((entry) => {
    persistLog(entry);
  });

  // 首次清理旧数据
  cleanOldLogs();

  return unsubscribe;
}
