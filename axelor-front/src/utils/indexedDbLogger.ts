/**
 * IndexedDB logger with buffered writes for better performance
 * Logs are buffered and written in batches to avoid blocking the main thread
 */

interface LogEntry {
  timestamp: string;
  args: any[];
}

const DB_NAME = 'dxGridLogsDB';
const STORE_NAME = 'logs';
const DB_VERSION = 1;
const MAX_LOG_ENTRIES = 1000;
const FLUSH_INTERVAL_MS = 500; // Flush logs every 500ms
const MAX_BUFFER_SIZE = 50; // Flush if buffer reaches 50 entries

let db: IDBDatabase | null = null;
let logBuffer: LogEntry[] = [];
let flushTimeout: number | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = (event) => {
      db = (event.target as IDBOpenDBRequest).result;
      resolve(db);
    };

    request.onerror = (event) => {
      console.error('[IndexedDB] Error opening DB:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * Flush buffered logs to IndexedDB
 * Called automatically after FLUSH_INTERVAL_MS or when buffer reaches MAX_BUFFER_SIZE
 */
async function flushLogs(): Promise<void> {
  if (logBuffer.length === 0) {
    flushTimeout = null;
    return;
  }

  const logsToFlush = [...logBuffer];
  logBuffer = []; // Clear buffer immediately
  flushTimeout = null;

  try {
    const database = await openDb();

    // Write all buffered logs in a single transaction (no durability: 'strict')
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    for (const entry of logsToFlush) {
      store.add(entry);
    }

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => {
        console.error('[IndexedDB] Transaction error:', (e.target as IDBTransaction).error);
        reject((e.target as IDBTransaction).error);
      };
    });

    // Rotation after flush
    await rotateLogsIfNeeded(database);
  } catch (error) {
    console.error('[IndexedDB] Failed to flush logs:', error);
  }
}

/**
 * Add a log entry to the buffer
 * Will be flushed to IndexedDB automatically
 */
async function addLogEntry(entry: LogEntry): Promise<void> {
  logBuffer.push(entry);

  // Flush immediately if buffer is full
  if (logBuffer.length >= MAX_BUFFER_SIZE) {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
    }
    await flushLogs();
    return;
  }

  // Schedule a flush if not already scheduled
  if (!flushTimeout) {
    flushTimeout = window.setTimeout(() => {
      flushLogs();
    }, FLUSH_INTERVAL_MS);
  }
}

async function rotateLogsIfNeeded(database: IDBDatabase): Promise<void> {
  try {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const countRequest = store.count();

    const count = await new Promise<number>((resolve, reject) => {
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = (e) => reject(e);
    });

    if (count > MAX_LOG_ENTRIES) {
      const deleteTransaction = database.transaction([STORE_NAME], 'readwrite');
      const deleteStore = deleteTransaction.objectStore(STORE_NAME);
      const cursorRequest = deleteStore.openCursor();
      let deletedCount = 0;
      const toDelete = count - MAX_LOG_ENTRIES;

      await new Promise<void>((resolve, reject) => {
        cursorRequest.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor && deletedCount < toDelete) {
            cursor.delete();
            deletedCount++;
            cursor.continue();
          } else {
            resolve();
          }
        };
        cursorRequest.onerror = (e) => reject(e);
      });

      // Attendre la fin de la transaction de suppression
      await new Promise<void>((resolve, reject) => {
        deleteTransaction.oncomplete = () => resolve();
        deleteTransaction.onerror = (e) => reject(e);
      });
    }
  } catch (error) {
    console.error('[IndexedDB] Failed to rotate logs:', error);
  }
}

async function getLogEntries(): Promise<LogEntry[]> {
  try {
    const database = await openDb();
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as LogEntry[]);
      request.onerror = (event) => {
        console.error('[IndexedDB] Error getting logs:', (event.target as IDBRequest).error);
        reject((event.target as IDBRequest).error);
      };
    });
  } catch (error) {
    console.error('[IndexedDB] Failed to get log entries:', error);
    return [];
  }
}

async function clearLogEntries(): Promise<void> {
  try {
    const database = await openDb();
    const transaction = database.transaction([STORE_NAME], 'readwrite', {
      durability: 'strict'
    });
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('✅ IndexedDB logs cleared');
        resolve();
      };
      request.onerror = (event) => {
        console.error('[IndexedDB] Error clearing logs:', (event.target as IDBRequest).error);
        reject((event.target as IDBRequest).error);
      };
    });
  } catch (error) {
    console.error('[IndexedDB] Failed to clear log entries:', error);
  }
}

export { addLogEntry, getLogEntries, clearLogEntries };
export type { LogEntry };
