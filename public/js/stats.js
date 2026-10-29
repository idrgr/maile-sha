/**
 * 纯客户端的筛选与统计逻辑。
 * 不依赖浏览器，方便在 Node 里跑单元测试。
 */
import { CATEGORIES, PLATFORMS, STATUSES } from './parse.js';

export { CATEGORIES, PLATFORMS, STATUSES };

export function todayCN() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

export function currentMonth() {
  return todayCN().slice(0, 7);
}

export function shiftMonth(month, delta) {
  const [y, m] = String(month).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month) {
  if (!month || month === 'all') return '全部时间';
  const [y, m] = String(month).split('-');
  return `${y}年${Number(m)}月`;
}

function amountOf(item) {
  const n = Number(item.amount);
  return Number.isFinite(n) ? n : 0;
}

export function isReturned(item) {
  return item.status === '已退货';
}

export function sumItems(items) {
  let total = 0;
  let count = 0;
  for (const item of items) {
    if (isReturned(item)) continue;
    total += amountOf(item);
    count += 1;
  }
  return { total: Math.round(total * 100) / 100, count };
}

export function filterItems(items, { month = 'all', platform = '全部', category = '全部', status = '全部', q = '' } = {}) {
  const keyword = String(q || '').trim().toLowerCase();
  return items.filter((item) => {
    if (month && month !== 'all' && String(item.purchased_at).slice(0, 7) !== month) return false;
    if (platform && platform !== '全部' && item.platform !== platform) return false;
    if (category && category !== '全部' && item.category !== category) return false;
    if (status && status !== '全部' && item.status !== status) return false;
    if (keyword) {
      const haystack = [
        item.title, item.note, item.platform, item.order_no, item.category,
        ...(Array.isArray(item.tags) ? item.tags : []),
      ].join(' ').toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

function groupBy(items, key) {
  const map = new Map();
  for (const item of items) {
    if (isReturned(item)) continue;
    const name = item[key] || '其他';
    const entry = map.get(name) || { name, total: 0, count: 0 };
    entry.total += amountOf(item);
    entry.count += 1;
    map.set(name, entry);
  }
  return [...map.values()]
    .map((entry) => ({ ...entry, total: Math.round(entry.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
}

export function buildStats(items, month = currentMonth()) {
  const isAll = month === 'all';
  const targetMonth = isAll ? currentMonth() : month;
  const monthItems = isAll
    ? items
    : items.filter((item) => String(item.purchased_at).slice(0, 7) === targetMonth);
  const { total, count } = sumItems(monthItems);

  const prevMonth = shiftMonth(targetMonth, -1);
  const prevItems = items.filter((item) => String(item.purchased_at).slice(0, 7) === prevMonth);
  const prev = sumItems(prevItems);

  const trend = [];
  for (let i = 5; i >= 0; i -= 1) {
    const m = shiftMonth(targetMonth, -i);
    const rows = items.filter((item) => String(item.purchased_at).slice(0, 7) === m);
    const s = sumItems(rows);
    trend.push({ month: m, label: `${Number(m.slice(5, 7))}月`, total: s.total, count: s.count });
  }

  const [year, mon] = targetMonth.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const today = todayCN();
  const elapsed = isAll ? 1 : (today.slice(0, 7) === targetMonth ? Number(today.slice(8, 10)) : daysInMonth);

  const top = [...monthItems]
    .filter((item) => !isReturned(item))
    .sort((a, b) => amountOf(b) - amountOf(a))
    .slice(0, 5);

  const delta = prev.total > 0 ? Math.round(((total - prev.total) / prev.total) * 1000) / 10 : null;

  return {
    month: isAll ? 'all' : targetMonth,
    label: isAll ? '全部时间' : monthLabel(targetMonth),
    total,
    count,
    prevTotal: prev.total,
    prevCount: prev.count,
    delta,
    avgPerDay: isAll ? 0 : Math.round((total / Math.max(elapsed, 1)) * 100) / 100,
    byPlatform: groupBy(monthItems, 'platform'),
    byCategory: groupBy(monthItems, 'category'),
    trend,
    top,
    daysInMonth,
  };
}

export function getOverview(items) {
  const { total, count } = sumItems(items);
  const dates = items.map((item) => item.purchased_at).filter(Boolean).sort();
  return {
    count: items.length,
    total,
    earliest: dates[0] || null,
    platformCount: new Set(items.map((item) => item.platform).filter(Boolean)).size,
    categories: [...new Set(items.map((item) => item.category).filter(Boolean))],
  };
}

export function buildMeta(items, extra = {}) {
  const platforms = [...new Set([...PLATFORMS, ...items.map((item) => item.platform).filter(Boolean)])];
  const categories = [...new Set([...CATEGORIES, ...items.map((item) => item.category).filter(Boolean)])];
  return {
    platforms,
    categories,
    statuses: STATUSES,
    overview: getOverview(items),
    version: '2.0.0',
    ...extra,
  };
}

function csvCell(value) {
  let str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCsv(items) {
  const header = ['购买日期', '商品', '平台', '分类', '金额', '数量', '状态', '标签', '订单号', '备注'];
  const lines = [header.join(',')];
  for (const item of items) {
    lines.push([
      item.purchased_at, item.title, item.platform, item.category, amountOf(item).toFixed(2),
      item.qty, item.status, Array.isArray(item.tags) ? item.tags.join('、') : '', item.order_no, item.note,
    ].map(csvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}
