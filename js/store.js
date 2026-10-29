/**
 * IndexedDB 本地存储：所有数据只存在当前浏览器 / 主屏幕 App 里。
 */
import { detectCategory, STATUSES } from './parse.js';

const DB_NAME = 'maile-sha';
const DB_VERSION = 1;
const STORE = 'items';

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('这个浏览器不支持本地数据库，请用 Safari 打开'));
  }
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('purchased_at', 'purchased_at', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开本地数据库'));
    request.onblocked = () => reject(new Error('本地数据库被其他标签页占用，请关掉其他页面再试'));
  });
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function todayCN() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function normalizeDate(value) {
  const str = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(`${str}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str) return str;
  }
  return todayCN();
}

function parseTags(input) {
  let tags = input;
  if (typeof tags === 'string') {
    tags = tags.replace(/^\[|\]$/g, '').split(/[,，、;；]+/);
  }
  if (!Array.isArray(tags)) return [];
  return [...new Set(
    tags
      .map((tag) => String(tag).trim().replace(/^["'[\]]+|["'[\]]+$/g, ''))
      .filter(Boolean)
      .map((tag) => tag.slice(0, 20)),
  )].slice(0, 10);
}

export function sanitizeItem(input = {}, base = {}) {
  const title = String(input.title ?? base.title ?? '').trim().slice(0, 200);
  if (!title) {
    const err = new Error('商品名不能为空');
    err.statusCode = 400;
    throw err;
  }

  const amountRaw = Number(input.amount ?? base.amount ?? 0);
  const amount = Number.isFinite(amountRaw) ? Math.max(0, Math.round(amountRaw * 100) / 100) : 0;
  if (amount > 100_000_000) throw new Error('金额过大');

  const qtyRaw = Number(input.qty ?? base.qty ?? 1);
  const qty = Number.isFinite(qtyRaw) ? Math.min(999, Math.max(1, Math.round(qtyRaw))) : 1;

  return {
    title,
    platform: String(input.platform ?? base.platform ?? '其他').trim().slice(0, 20) || '其他',
    amount,
    qty,
    category: String(input.category ?? base.category ?? detectCategory(title)).trim().slice(0, 20) || '其他',
    tags: parseTags(input.tags ?? base.tags ?? []),
    order_no: String(input.order_no ?? base.order_no ?? '').trim().slice(0, 60),
    purchased_at: normalizeDate(input.purchased_at ?? base.purchased_at),
    status: STATUSES.includes(input.status) ? input.status
      : STATUSES.includes(base.status) ? base.status
        : '已收货',
    note: String(input.note ?? base.note ?? '').trim().slice(0, 1000),
  };
}

function normalizeRow(row) {
  return {
    ...row,
    amount: Number(row.amount) || 0,
    qty: Number(row.qty) || 1,
    tags: Array.isArray(row.tags) ? row.tags : parseTags(row.tags),
  };
}

export async function getAllItems() {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const rows = await requestToPromise(tx.objectStore(STORE).getAll());
  return rows
    .map(normalizeRow)
    .sort((a, b) => {
      if (a.purchased_at !== b.purchased_at) return a.purchased_at < b.purchased_at ? 1 : -1;
      return b.id - a.id;
    });
}

export async function getItem(id) {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const row = await requestToPromise(tx.objectStore(STORE).get(Number(id)));
  return row ? normalizeRow(row) : null;
}

function runWrite(fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    let result;
    try {
      const request = fn(store);
      if (request) request.onsuccess = () => { result = request.result; };
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export async function saveItem(input, id = null) {
  const now = new Date().toISOString();
  if (id) {
    const existing = await getItem(id);
    if (!existing) throw new Error('找不到这条记录');
    const data = sanitizeItem(input, existing);
    const record = { ...data, id: Number(id), created_at: existing.created_at || now, updated_at: now };
    await runWrite((store) => store.put(record));
    return record;
  }
  const data = sanitizeItem(input);
  const record = { ...data, created_at: now, updated_at: now };
  const newId = await runWrite((store) => store.add(record));
  return { ...record, id: newId };
}

export async function deleteItem(id) {
  await runWrite((store) => store.delete(Number(id)));
  return true;
}

export async function clearAll() {
  await runWrite((store) => store.clear());
}

export async function replaceAll(items) {
  if (!Array.isArray(items)) throw new Error('备份文件里没有记录');
  const now = new Date().toISOString();
  const records = items.map((item) => {
    const data = sanitizeItem(item);
    return {
      ...data,
      created_at: typeof item.created_at === 'string' && item.created_at ? item.created_at : now,
      updated_at: now,
    };
  });
  await runWrite((store) => {
    store.clear();
    for (const record of records) store.add(record);
  });
  return records.length;
}

export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return false;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageUsage() {
  try {
    if (!navigator.storage?.estimate) return null;
    const estimate = await navigator.storage.estimate();
    return estimate.usage || 0;
  } catch {
    return null;
  }
}
