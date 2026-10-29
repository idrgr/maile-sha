/**
 * 买了啥 · 前端
 * 无框架，单文件渲染；数据全部保存在本机 IndexedDB。
 */
import { parseOrderText } from './js/parse.js';
import {
  buildMeta, buildStats, filterItems, toCsv, todayCN, currentMonth,
} from './js/stats.js';
import {
  clearAll, deleteItem, getAllItems, openDb, replaceAll, requestPersistence,
  saveItem, storageUsage,
} from './js/store.js';

const viewEl = document.getElementById('view');
const fab = document.getElementById('fab');

const state = {
  view: 'home',
  month: null,
  platform: '全部',
  category: '全部',
  status: '全部',
  q: '',
  allItems: [],
  items: [],
  stats: null,
  meta: null,
  lastPlatform: localStorage.getItem('lastPlatform') || '淘宝',
  canReadClipboard: Boolean(window.isSecureContext && navigator.clipboard?.readText),
};

const PLATFORM_COLORS = {
  淘宝: '#ff5000', 天猫: '#ff0036', 京东: '#e1251b', 拼多多: '#e02e24',
  抖音: '#161823', 小红书: '#ff2442', 得物: '#00b7a6', 唯品会: '#e4007f',
  苏宁: '#ff9f00', 美团: '#ffc300', 饿了么: '#0085ff', 盒马: '#00a6e2',
  山姆: '#0067b1', 亚马逊: '#ff9900', 其他: '#8b8175',
};

const PLATFORM_SHORT = {
  淘宝: '淘', 天猫: '猫', 京东: '京', 拼多多: '拼', 抖音: '抖',
  小红书: '红', 得物: '得', 唯品会: '唯', 苏宁: '苏', 美团: '美',
  饿了么: '饿', 盒马: '盒', 山姆: '山', 亚马逊: '亚', 其他: '其',
};

const CATEGORY_EMOJI = {
  数码家电: '📱', 服饰鞋包: '👕', 食品生鲜: '🍎', 美妆个护: '💄',
  家居日用: '🏠', 母婴宠物: '🐱', 图书文具: '📚', 运动户外: '🏃',
  虚拟服务: '🎫', 其他: '📦',
};

const CATEGORY_COLORS = ['#e8562f', '#f2a03d', '#6d7a4f', '#c98a6b', '#8f9bb3', '#b58a9e', '#cdbb9f'];

const ICONS = {
  calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16.2 16.2 4 4"/>',
  close: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
  chevronLeft: '<path d="m14.5 6-6 6 6 6"/>',
  chevronRight: '<path d="m9.5 6 6 6-6 6"/>',
  filter: '<path d="M4 7h16M7 12h10M10 17h4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  download: '<path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14"/>',
  upload: '<path d="M12 20V9m0 0 4 4m-4-4-4 4M5 4h14"/>',
  trash: '<path d="M4.5 7h15M9 7V4.5h6V7M7 7l1 13h8l1-13"/>',
  edit: '<path d="M4 20h4L19.2 8.8a2.2 2.2 0 0 0-3.1-3.1L5 17z"/>',
  bag: '<path d="M6 8h12l1 12H5L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  bolt: '<path d="M13 2 5 14h6l-1 8 8-12h-6z"/>',
  database: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.66 3.13 3 7 3s7-1.34 7-3V6"/>',
  spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 7.6 7 9 4-1.4 7-4.5 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtAmount(n) {
  const value = Number(n) || 0;
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function amountParts(n) {
  const fixed = (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
  const [int, dec] = fixed.split('.');
  return { int: Number(int).toLocaleString('zh-CN'), dec: dec === '00' ? '' : dec };
}

function dateBits(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return { label: iso || '', weekday: '' };
  const dt = new Date(y, m - 1, d, 12);
  return {
    label: `${m}月${d}日`,
    weekday: `周${'日一二三四五六'[dt.getDay()]}`,
  };
}

function platformColor(name) {
  return PLATFORM_COLORS[name] || PLATFORM_COLORS.其他;
}

function platformShort(name) {
  return PLATFORM_SHORT[name] || String(name || '其').slice(0, 1);
}

function categoryEmoji(name) {
  return CATEGORY_EMOJI[name] || '📦';
}

/* ---------------- 通用 UI ---------------- */

let toastTimer = null;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-show'), 2400);
}

let currentSheet = null;
let sheetTimer = null;
let escHandler = null;

function openSheet(html, { tall = false } = {}) {
  closeSheet(true);
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = `<div class="sheet${tall ? ' is-tall' : ''}" role="dialog" aria-modal="true">
    <div class="sheet-grab"></div>${html}</div>`;
  document.getElementById('sheet-root').appendChild(wrap);
  currentSheet = wrap;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => wrap.classList.add('is-open'));

  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) closeSheet();
  });
  escHandler = (e) => { if (e.key === 'Escape') closeSheet(); };
  document.addEventListener('keydown', escHandler);
  return wrap;
}

function closeSheet(immediate = false) {
  if (!currentSheet) return;
  const wrap = currentSheet;
  currentSheet = null;
  document.body.style.overflow = '';
  if (escHandler) document.removeEventListener('keydown', escHandler);
  escHandler = null;
  wrap.classList.remove('is-open');
  clearTimeout(sheetTimer);
  if (immediate) {
    wrap.remove();
    return;
  }
  sheetTimer = setTimeout(() => wrap.remove(), 280);
}

async function copyText(text, successMessage = '已复制') {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      toast(successMessage);
      return;
    } catch { /* 继续用下面的兜底方案 */ }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, ta.value.length);
  try {
    document.execCommand('copy');
    toast(successMessage);
  } catch {
    toast('复制失败，请长按手动复制');
  }
  ta.remove();
}

/* ---------------- 首页 ---------------- */

function brandHTML() {
  return `<div class="brand">
    <div class="brand-mark">买</div>
    <div><h1>买了啥</h1><p>跨平台购物账本</p></div>
  </div>`;
}

function spendCardHTML(stats) {
  const parts = amountParts(stats.total);
  let meta = `${stats.count} 笔记录`;
  if (stats.month === 'all') {
    meta = stats.count ? `从开始到现在，共 ${stats.count} 笔` : '还没有记录';
  } else if (stats.prevTotal > 0 && stats.delta !== null) {
    const diff = Math.round((stats.total - stats.prevTotal) * 100) / 100;
    meta += `<span class="dot"></span><span>比上月${diff > 0 ? '多' : diff < 0 ? '少' : '持平'}${diff ? ` ¥${fmtAmount(Math.abs(diff))}` : ''}</span>`;
  } else if (stats.count > 0) {
    meta += '<span class="dot"></span><span>上月没有记录</span>';
  }

  return `<section class="spend-card">
    <div class="spend-label">${stats.month === 'all' ? '累计支出' : `${esc(stats.label)}支出`}</div>
    <div class="spend-value${stats.total ? '' : ' is-empty'}">
      <span class="cny">¥</span>${stats.total ? parts.int : '0'}${parts.dec ? `<span class="cents">.${parts.dec}</span>` : ''}
    </div>
    <div class="spend-meta">${meta}</div>
  </section>`;
}

function searchHTML() {
  return `<div class="search">
    ${icon('search')}
    <input id="search-input" type="search" inputmode="search" placeholder="搜商品、订单号、备注…" value="${esc(state.q)}" autocomplete="off" enterkeyhint="search">
    ${state.q ? '<button class="clear" type="button" data-action="clear-search" aria-label="清空搜索">✕</button>' : ''}
  </div>`;
}

function chipsHTML() {
  const platforms = ['全部', ...(state.meta?.platforms || []).filter((p) => p !== '其他' && p !== '全部')];
  if ((state.meta?.platforms || []).includes('其他')) platforms.push('其他');
  const filters = (state.category !== '全部' ? 1 : 0) + (state.status !== '全部' ? 1 : 0);
  return `<div class="chips-row">
    <div class="chips">
      ${platforms.map((p) => `<button class="chip${state.platform === p ? ' is-active' : ''}" type="button" data-action="pick-platform" data-value="${esc(p)}">${esc(p)}</button>`).join('')}
    </div>
    <button class="filter-btn${filters ? ' has-filter' : ''}" type="button" data-action="open-filter" aria-label="筛选">
      ${icon('filter')}${filters ? `<span class="badge">${filters}</span>` : ''}
    </button>
  </div>`;
}

function emptyHTML() {
  if (state.q) {
    return `<div class="empty">
      <div class="empty-art">${icon('search')}</div>
      <h3>没找到「${esc(state.q)}」</h3>
      <p>换个关键词试试，或者清空搜索看看全部记录。</p>
      <button class="btn btn-ghost" type="button" data-action="clear-search">清空搜索</button>
    </div>`;
  }
  const filtered = state.platform !== '全部' || state.category !== '全部' || state.status !== '全部';
  if (filtered) {
    return `<div class="empty">
      <div class="empty-art">${icon('filter')}</div>
      <h3>这个条件下还没有记录</h3>
      <p>换一个平台或分类，也可以直接记一笔新的。</p>
      <button class="btn btn-ghost" type="button" data-action="reset-filters">重置筛选</button>
    </div>`;
  }
  if (state.month !== 'all') {
    return `<div class="empty">
      <div class="empty-art">${icon('bag')}</div>
      <h3>这个月还没有记录</h3>
      <p>把订单文字粘进来，或者点右下角的 + 记一笔。</p>
      <button class="btn btn-accent" type="button" data-action="add">${icon('plus')}记一笔</button>
    </div>`;
  }
  return `<div class="empty">
    <div class="empty-art">${icon('bag')}</div>
    <h3>账本还是空的</h3>
    <p>把淘宝、京东、拼多多的订单文字粘进来，<br>以后就不怕忘了买过什么。</p>
    <button class="btn btn-accent" type="button" data-action="add">${icon('plus')}记下第一笔</button>
  </div>`;
}

function itemCardHTML(item) {
  const color = platformColor(item.platform);
  const tags = item.tags.slice(0, 2).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  let status = '';
  if (item.status === '待收货') status = '<span class="item-status pending">待收货</span>';
  else if (item.status === '已退货') status = '<span class="item-status returned">已退货</span>';
  else if (item.status === '已用完') status = '<span class="item-status used">已用完</span>';

  return `<button class="item-card" type="button" data-action="detail" data-id="${item.id}" style="--pc:${color}">
    <span class="plat-icon">${esc(platformShort(item.platform))}</span>
    <span class="item-body">
      <span class="item-title">${esc(item.title)}</span>
      <span class="item-meta">
        <span>${esc(item.platform)}</span>
        <span class="sep"></span>
        <span>${esc(item.category)}</span>
        ${item.qty > 1 ? `<span class="sep"></span><span>×${item.qty}</span>` : ''}
        ${tags}
      </span>
    </span>
    <span class="item-right">
      <span class="item-amount"><span class="sym">¥</span>${fmtAmount(item.amount)}</span>
      ${status}
    </span>
  </button>`;
}

function listHTML() {
  const items = state.items || [];
  if (!items.length) return emptyHTML();

  const groups = new Map();
  for (const item of items) {
    const key = item.purchased_at || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const filtered = state.q || state.platform !== '全部' || state.category !== '全部' || state.status !== '全部';
  const sum = items.reduce((s, it) => (it.status === '已退货' ? s : s + it.amount), 0);

  let html = '';
  if (filtered) {
    html += `<div class="list-summary"><span>筛选结果</span><strong>${items.length} 笔 · ¥${fmtAmount(sum)}</strong></div>`;
  }

  for (const [date, list] of groups) {
    const { label, weekday } = dateBits(date);
    const daySum = list.reduce((s, it) => (it.status === '已退货' ? s : s + it.amount), 0);
    html += `<section class="day-group">
      <div class="day-head">
        <span class="day-date">${esc(label)}<em>${weekday}</em></span>
        <span>¥${fmtAmount(daySum)}</span>
      </div>
      ${list.map(itemCardHTML).join('')}
    </section>`;
  }
  return html;
}

function homeHTML() {
  const s = state.stats;
  return `<header>
      <div class="topline">
        ${brandHTML()}
        <button class="month-pill" type="button" data-action="open-month">${icon('calendar')} ${esc(s.label)}</button>
      </div>
      ${spendCardHTML(s)}
    </header>
    ${searchHTML()}
    ${chipsHTML()}
    <div class="list-region" id="list-region">${listHTML()}</div>`;
}

function applyFilters() {
  return filterItems(state.allItems, {
    month: state.month,
    platform: state.platform,
    category: state.category,
    status: state.status,
    q: state.q,
  });
}

function loadHome() {
  if (state.view !== 'home') return;
  state.items = applyFilters();
  state.stats = buildStats(state.allItems, state.month);
  viewEl.innerHTML = homeHTML();
}

function refreshItems() {
  state.items = applyFilters();
  const region = document.getElementById('list-region');
  if (region) region.innerHTML = listHTML();
  updateFilterBadge();
}

function updateFilterBadge() {
  const btn = document.querySelector('.filter-btn');
  if (!btn) return;
  const filters = (state.category !== '全部' ? 1 : 0) + (state.status !== '全部' ? 1 : 0);
  btn.classList.toggle('has-filter', filters > 0);
  const old = btn.querySelector('.badge');
  if (old) old.remove();
  if (filters) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = String(filters);
    btn.appendChild(badge);
  }
}

/* ---------------- 统计 ---------------- */

function statsHTML() {
  const s = state.stats;
  const allMode = s.month === 'all';
  const maxTrend = Math.max(...s.trend.map((t) => t.total), 1);
  const maxPlatform = Math.max(...s.byPlatform.map((p) => p.total), 1);
  const categories = s.byCategory.slice(0, 5);
  const restTotal = s.byCategory.slice(5).reduce((sum, c) => sum + c.total, 0);
  const donutItems = restTotal > 0 ? [...categories, { name: '其他', total: restTotal }] : categories;
  const currentBarMonth = allMode ? currentMonth() : s.month;

  const deltaHTML = s.delta === null
    ? '<div><strong>—</strong><span>环比上月</span></div>'
    : `<div><strong>${s.delta >= 0 ? '+' : ''}${s.delta.toFixed(1).replace('.0', '')}%</strong><span>环比上月</span></div>`;

  return `<header class="page-head">
      <div><h1>统计</h1><p class="sub">${allMode ? '全部时间' : esc(s.label)} · 按实付金额计算</p></div>
      <button class="month-pill" type="button" data-action="open-month">${icon('calendar')} ${esc(s.label)}</button>
    </header>

    <section class="stat-summary">
      <div class="label">${allMode ? '累计支出' : '本月支出'}</div>
      <div class="value"><span class="sym">¥</span>${fmtAmount(s.total)}</div>
      <div class="stat-mini">
        <div><strong>${s.count}</strong><span>记录笔数</span></div>
        <div><strong>${allMode ? s.byPlatform.length : `¥${fmtAmount(s.avgPerDay)}`}</strong><span>${allMode ? '购买平台' : '日均支出'}</span></div>
        ${allMode ? `<div><strong>${s.byCategory.length}</strong><span>商品分类</span></div>` : deltaHTML}
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>近 6 个月</h2><span>单位：元</span></div>
      ${s.trend.every((t) => !t.total) ? '<div class="panel-empty">这几个月还没有支出记录</div>' : `<div class="trend">
        ${s.trend.map((t) => `<div class="trend-col${t.month === currentBarMonth ? ' is-current' : ''}">
          <span class="trend-val">${t.total ? `¥${fmtAmount(t.total)}` : ''}</span>
          <div class="trend-bar" style="height:${Math.max(3, Math.round((t.total / maxTrend) * 88))}px"></div>
          <span class="trend-label">${t.label}</span>
        </div>`).join('')}
      </div>`}
    </section>

    <section class="panel">
      <div class="panel-head"><h2>平台分布</h2><span>${s.byPlatform.length} 个平台</span></div>
      ${s.byPlatform.length ? `<div class="bar-list">
        ${s.byPlatform.map((p) => `<div class="bar-row" style="--pc:${platformColor(p.name)}">
          <div class="bar-top">
            <span class="bar-name"><i></i>${esc(p.name)}</span>
            <span class="bar-amount"><b>¥${fmtAmount(p.total)}</b> · ${p.count} 笔</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, (p.total / maxPlatform) * 100)}%"></div></div>
        </div>`).join('')}
      </div>` : '<div class="panel-empty">这个月还没有记录</div>'}
    </section>

    <section class="panel">
      <div class="panel-head"><h2>分类占比</h2><span>${s.byCategory.length} 个分类</span></div>
      ${s.byCategory.length ? `<div class="donut-wrap">
        <div class="donut" style="background:${donutGradient(donutItems, s.total)}">
          <div class="donut-center"><strong>${s.byCategory.length}</strong><span>个分类</span></div>
        </div>
        <div class="donut-legend">
          ${donutItems.map((c, i) => `<div class="legend-row">
            <i style="background:${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}"></i>
            <span class="legend-name">${esc(c.name)}</span>
            <span class="legend-pct">${s.total ? Math.round((c.total / s.total) * 100) : 0}%</span>
            <span class="legend-amount">¥${fmtAmount(c.total)}</span>
          </div>`).join('')}
        </div>
      </div>` : '<div class="panel-empty">这个月还没有记录</div>'}
    </section>

    <section class="panel">
      <div class="panel-head"><h2>${allMode ? '花得最多的' : '本月最贵'}</h2><span>Top 5</span></div>
      ${s.top.length ? `<div class="top-list">
        ${s.top.map((it, i) => `<button class="top-row" type="button" data-action="detail" data-id="${it.id}">
          <span class="top-rank">${i + 1}</span>
          <span class="top-title">${esc(it.title)}</span>
          <span class="top-amt">¥${fmtAmount(it.amount)}</span>
        </button>`).join('')}
      </div>` : '<div class="panel-empty">这个月还没有记录</div>'}
    </section>`;
}

function donutGradient(items, total) {
  if (!total) return '#eee4d6';
  let acc = 0;
  const stops = [];
  items.forEach((item, i) => {
    const start = acc;
    acc += (item.total / total) * 360;
    stops.push(`${CATEGORY_COLORS[i % CATEGORY_COLORS.length]} ${start.toFixed(2)}deg ${acc.toFixed(2)}deg`);
  });
  if (acc < 359.99) stops.push(`#e7dccb ${acc.toFixed(2)}deg 360deg`);
  return `conic-gradient(${stops.join(',')})`;
}

async function loadStats() {
  if (state.view !== 'stats') return;
  state.stats = buildStats(state.allItems, state.month);
  viewEl.innerHTML = statsHTML();
}

/* ---------------- 我的 ---------------- */

function appURL() {
  return new URL('.', location.href).href;
}

function formatBytes(bytes) {
  if (bytes == null) return '未知';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function meHTML() {
  const meta = state.meta;
  const o = meta.overview;
  const first = o.earliest ? `${o.earliest.slice(0, 4)}年${Number(o.earliest.slice(5, 7))}月` : '还没有记录';

  return `<header class="page-head">
      <div><h1>我的</h1><p class="sub">账本设置与数据</p></div>
    </header>

    <section class="profile-card">
      <div class="profile-top">
        <div class="profile-avatar">买</div>
        <div><h2>我的购物账本</h2><p>数据只存在这台设备的浏览器里</p></div>
      </div>
      <div class="profile-stats">
        <div><strong>${o.count}</strong><span>总记录</span></div>
        <div><strong>¥${fmtAmount(o.total)}</strong><span>累计花费</span></div>
        <div><strong style="font-size:13px">${esc(first)}</strong><span>最早记录</span></div>
      </div>
    </section>

    <section class="menu-card">
      <div class="menu-title"><span class="emoji">⚡</span>两下记一笔</div>
      <div class="menu-body">
        <p class="menu-desc">在订单页复制商品文字，打开「买了啥」，点 +，再点弹层里的「读剪贴板」。商品、价格、平台、订单号会自动填好，检查后保存即可。</p>
        <div class="code-box">
          <code>${esc(appURL())}</code>
          <button class="copy-btn" type="button" data-action="copy" data-copy="${esc(appURL())}">复制</button>
        </div>
        <details class="steps">
          <summary>装到 iPhone 主屏幕</summary>
          <ol>
            <li>用 <b>Safari</b> 打开上面的地址。</li>
            <li>点底部「分享」按钮。</li>
            <li>选择「<b>添加到主屏幕</b>」。</li>
            <li>以后固定从主屏幕图标打开，断网也能用。</li>
          </ol>
          <p class="menu-desc" style="margin-top:8px">Safari 和主屏幕 App 的本地数据是分开的。装好后请固定用主屏幕图标，别在两个入口之间来回切换。</p>
        </details>
      </div>
    </section>

    <section class="menu-card">
      <div class="menu-title"><span class="emoji">📦</span>数据</div>
      <button class="menu-row" type="button" data-action="export-csv">
        <span class="icon">${icon('download')}</span>
        <span class="grow">导出 CSV<small>用 Excel、Numbers 打开，方便核对</small></span>
        <span class="arrow">›</span>
      </button>
      <button class="menu-row" type="button" data-action="export-json">
        <span class="icon">${icon('database')}</span>
        <span class="grow">备份 JSON<small>完整数据，建议定期存一份</small></span>
        <span class="arrow">›</span>
      </button>
      <button class="menu-row" type="button" data-action="import-backup">
        <span class="icon">${icon('upload')}</span>
        <span class="grow">从备份恢复<small>导入会覆盖当前全部记录</small></span>
        <span class="arrow">›</span>
      </button>
      <button class="menu-row" type="button" data-action="clear-data">
        <span class="icon">${icon('trash')}</span>
        <span class="grow" style="color:var(--red)">清空所有记录<small>删除前请先导出备份</small></span>
        <span class="arrow">›</span>
      </button>
      <div class="menu-row">
        <span class="icon">${icon('shield')}</span>
        <span class="grow">本机存储<small>记录不会上传到任何服务器</small></span>
        <span class="arrow" id="storage-usage">计算中…</span>
      </div>
      <input type="file" id="import-file" accept=".json,application/json" hidden>
    </section>

    <p class="footnote">买了啥 v${esc(meta.version)} · 离线可用<br>账本记录 ${o.count} 笔 · 覆盖 ${o.platformCount} 个平台</p>`;
}

function loadMe() {
  if (state.view !== 'me') return;
  viewEl.innerHTML = meHTML();
  storageUsage().then((bytes) => {
    const el = document.getElementById('storage-usage');
    if (el) el.textContent = formatBytes(bytes);
  });
}

/* ---------------- 弹层：记一笔 / 详情 / 月份 / 筛选 ---------------- */

function optionsHTML(list, selected) {
  return list.map((v) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');
}

function openAddSheet(item = null, { text = '' } = {}) {
  const meta = state.meta;
  const editing = Boolean(item);
  const defaultPlatform = item?.platform || (meta.platforms.includes(state.lastPlatform) ? state.lastPlatform : '淘宝');
  const defaultCategory = item?.category || '其他';
  const date = item?.purchased_at || todayCN();
  const tags = item?.tags?.join('，') || '';

  const wrap = openSheet(`<div class="sheet-head">
      <h2>${editing ? '编辑记录' : '记一笔'}</h2>
      <div class="sheet-tools">
        <button class="sheet-save" type="button" data-action="submit-form">保存</button>
        <button class="close" type="button" data-action="close-sheet" aria-label="关闭">${icon('close')}</button>
      </div>
    </div>

    ${editing ? '' : `<div class="paste-box">
      <textarea id="paste-text" placeholder="把订单页复制的文字粘到这里，例如：&#10;【淘宝】纯棉短袖T恤 实付 ¥39.9&#10;订单号 1234567890123"></textarea>
      <div class="paste-actions">
        <span class="hint">${state.canReadClipboard ? '复制了订单文字，直接点右边' : '长按输入框，选「粘贴」'}</span>
        ${state.canReadClipboard ? '<button class="btn btn-accent btn-sm" type="button" data-action="clipboard">读剪贴板</button>' : ''}
        <button class="btn ${state.canReadClipboard ? 'btn-ghost' : 'btn-accent'} btn-sm" type="button" data-action="parse">${icon('spark')}识别</button>
      </div>
    </div>
    <div id="parse-note"></div>`}

    <form class="form" id="item-form" data-id="${editing ? item.id : ''}">
      <div class="field">
        <label for="f-title">商品名<span class="req">*</span></label>
        <input class="input" id="f-title" name="title" required maxlength="200" placeholder="例如：Sony WH-1000XM5 降噪耳机" value="${esc(item?.title || '')}" autocomplete="off">
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-amount">实付金额</label>
          <div class="money-input"><span class="sym">¥</span><input class="input" id="f-amount" name="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${item ? item.amount : ''}"></div>
        </div>
        <div class="field">
          <label for="f-date">购买日期</label>
          <input class="input" id="f-date" name="purchased_at" type="date" value="${esc(date)}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-platform">平台</label>
          <select class="select" id="f-platform" name="platform">${optionsHTML(meta.platforms, defaultPlatform)}</select>
        </div>
        <div class="field">
          <label for="f-category">分类</label>
          <select class="select" id="f-category" name="category">${optionsHTML(meta.categories, defaultCategory)}</select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-qty">数量</label>
          <input class="input" id="f-qty" name="qty" type="number" min="1" max="999" inputmode="numeric" value="${item?.qty || 1}">
        </div>
        <div class="field">
          <label for="f-status">状态</label>
          <select class="select" id="f-status" name="status">${optionsHTML(meta.statuses, item?.status || '已收货')}</select>
        </div>
      </div>
      <div class="field">
        <label for="f-tags">标签</label>
        <input class="input" id="f-tags" name="tags" placeholder="用逗号隔开，如：通勤，数码" value="${esc(tags)}">
      </div>
      <div class="field">
        <label for="f-order">订单号</label>
        <input class="input" id="f-order" name="order_no" maxlength="60" placeholder="选填，方便以后查订单" value="${esc(item?.order_no || '')}">
      </div>
      <div class="field">
        <label for="f-note">备注</label>
        <textarea class="textarea" id="f-note" name="note" maxlength="1000" placeholder="选填，比如放在哪、保修到什么时候">${esc(item?.note || '')}</textarea>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" type="button" data-action="close-sheet">取消</button>
        <button class="btn btn-primary" type="submit">${editing ? '保存修改' : '保存'}</button>
      </div>
    </form>`, { tall: true });

  if (text && !editing) {
    const ta = wrap.querySelector('#paste-text');
    if (ta) {
      ta.value = text;
      parsePastedText(true);
    }
  } else if (!editing) {
    setTimeout(() => document.getElementById('paste-text')?.focus(), 340);
  }
  return wrap;
}

function openDetailSheet(item) {
  const color = platformColor(item.platform);
  const { label, weekday } = dateBits(item.purchased_at);
  const pending = item.status === '待收货';
  const rows = [
    ['平台', item.platform],
    ['分类', item.category],
    ['购买日期', `${item.purchased_at}（${weekday}）`],
    ['数量', `×${item.qty}`],
    ['状态', item.status],
    item.tags.length ? ['标签', item.tags.join('、')] : null,
    item.order_no ? ['订单号', item.order_no, true] : null,
  ].filter(Boolean);

  openSheet(`<div class="sheet-head">
      <h2>记录详情</h2>
      <button class="close" type="button" data-action="close-sheet" aria-label="关闭">${icon('close')}</button>
    </div>

    <div class="detail-hero">
      <div class="detail-amount"><span class="sym">¥</span>${fmtAmount(item.amount)}</div>
      <div class="detail-title">${esc(item.title)}</div>
      <div class="detail-badges">
        <span class="badge plat" style="--pc:${color}">${esc(item.platform)}</span>
        <span class="badge">${categoryEmoji(item.category)} ${esc(item.category)}</span>
        <span class="badge${pending ? ' pending' : ''}">${esc(item.status)}</span>
        <span class="badge">${label} ${weekday}</span>
      </div>
    </div>

    <div class="detail-list">
      ${rows.map(([k, v, mono]) => `<div class="detail-row"><span class="k">${esc(k)}</span><span class="v${mono ? ' mono' : ''}">${esc(v)}</span></div>`).join('')}
    </div>

    ${item.note ? `<div class="detail-note">${esc(item.note)}</div>` : ''}

    <div class="form-actions">
      <button class="btn btn-danger" type="button" data-action="delete-item" data-id="${item.id}">${icon('trash')}删除</button>
      <button class="btn btn-primary" type="button" data-action="edit-item" data-id="${item.id}">${icon('edit')}编辑</button>
    </div>`);
}

let monthViewYear = null;

function renderMonthEditor(year, selected) {
  const cells = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    return `<button class="month-cell${selected === m ? ' is-active' : ''}" type="button" data-action="pick-month" data-month="${m}">${i + 1} 月</button>`;
  }).join('');
  return `<div class="month-nav">
      <button type="button" data-action="shift-year" data-delta="-1" aria-label="上一年">${icon('chevronLeft')}</button>
      <strong>${year} 年</strong>
      <button type="button" data-action="shift-year" data-delta="1" aria-label="下一年">${icon('chevronRight')}</button>
    </div>
    <div class="month-grid">${cells}</div>
    <button class="month-all${selected === 'all' ? ' is-active' : ''}" type="button" data-action="pick-month" data-month="all">全部时间</button>`;
}

function openMonthSheet() {
  const selected = state.month;
  const base = selected === 'all' ? todayCN().slice(0, 7) : selected;
  monthViewYear = Number(base.slice(0, 4));
  const wrap = openSheet(`<div class="sheet-head">
      <h2>选择时间</h2>
      <button class="close" type="button" data-action="close-sheet" aria-label="关闭">${icon('close')}</button>
    </div>
    <div id="month-editor">${renderMonthEditor(monthViewYear, selected)}</div>`);

  wrap.addEventListener('click', async (e) => {
    const shift = e.target.closest('[data-action="shift-year"]');
    if (shift) {
      monthViewYear += Number(shift.dataset.delta);
      const editor = wrap.querySelector('#month-editor');
      if (editor) editor.innerHTML = renderMonthEditor(monthViewYear, state.month);
      return;
    }
    const pick = e.target.closest('[data-action="pick-month"]');
    if (pick) {
      const month = pick.dataset.month;
      state.month = month;
      state.stats = null;
      state.items = null;
      closeSheet();
      if (state.view === 'stats') await loadStats();
      else await loadHome();
    }
  });
}

function filterChipsHTML(kind, values, selected) {
  return `<div class="filter-chips">
    ${['全部', ...values].map((v) => `<button class="chip${selected === v ? ' is-active' : ''}" type="button" data-action="pick-filter" data-kind="${kind}" data-value="${esc(v)}">${esc(v)}</button>`).join('')}
  </div>`;
}

function openFilterSheet() {
  const wrap = openSheet(`<div class="sheet-head">
      <h2>筛选</h2>
      <button class="close" type="button" data-action="close-sheet" aria-label="关闭">${icon('close')}</button>
    </div>
    <div class="filter-group">
      <h3>分类</h3>
      ${filterChipsHTML('category', state.meta.categories, state.category)}
    </div>
    <div class="filter-group">
      <h3>状态</h3>
      ${filterChipsHTML('status', state.meta.statuses, state.status)}
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" type="button" data-action="reset-filters">重置</button>
      <button class="btn btn-primary" type="button" data-action="close-sheet">查看结果</button>
    </div>`);

  wrap.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-action="pick-filter"]');
    if (!chip) return;
    const kind = chip.dataset.kind;
    const value = chip.dataset.value;
    state[kind] = value;
    wrap.querySelectorAll(`[data-kind="${kind}"]`).forEach((el) => {
      el.classList.toggle('is-active', el.dataset.value === value);
    });
    refreshItems();
  });
}

async function resetFilters() {
  state.platform = '全部';
  state.category = '全部';
  state.status = '全部';
  const wrap = currentSheet;
  if (wrap) {
    wrap.querySelectorAll('[data-action="pick-filter"]').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.value === '全部');
    });
  }
  await loadHome();
  toast('已重置筛选');
}

/* ---------------- 交互 ---------------- */

let searchTimer = null;

async function reloadData() {
  state.allItems = await getAllItems();
  state.meta = buildMeta(state.allItems);
}

async function saveForm(form) {
  const fd = new FormData(form);
  const id = form.dataset.id;
  const payload = {
    title: fd.get('title'),
    amount: fd.get('amount') ? Number(fd.get('amount')) : 0,
    qty: fd.get('qty') ? Number(fd.get('qty')) : 1,
    platform: fd.get('platform'),
    category: fd.get('category'),
    status: fd.get('status'),
    purchased_at: fd.get('purchased_at'),
    tags: String(fd.get('tags') || '').split(/[,，、]+/).map((s) => s.trim()).filter(Boolean),
    order_no: fd.get('order_no'),
    note: fd.get('note'),
  };
  if (!String(payload.title || '').trim()) {
    toast('商品名还没填');
    return;
  }

  const buttons = form.querySelectorAll('button');
  buttons.forEach((b) => { b.disabled = true; });
  try {
    await saveItem(payload, id ? Number(id) : null);
    localStorage.setItem('lastPlatform', payload.platform);
    state.lastPlatform = payload.platform;
    await reloadData();
    closeSheet();
    toast(id ? '已保存修改' : '记好了');
    if (state.view === 'stats') loadStats();
    else if (state.view === 'me') loadMe();
    else loadHome();
  } catch (err) {
    toast(err.message);
    buttons.forEach((b) => { b.disabled = false; });
  }
}

function parsePastedText(quiet = false) {
  const ta = document.getElementById('paste-text');
  const note = document.getElementById('parse-note');
  if (!ta) return;
  const text = ta.value.trim();
  if (!text) {
    if (!quiet) toast('先把订单文字粘进来');
    ta.focus();
    return;
  }

  const data = parseOrderText(text);
  const form = document.getElementById('item-form');
  if (!form) return;
  const set = (name, value) => {
    const field = form.elements.namedItem(name);
    if (field) field.value = value;
  };
  set('title', data.title || '');
  set('amount', data.amount || '');
  set('platform', data.platform || '其他');
  set('category', data.category || '其他');
  set('purchased_at', data.purchased_at || todayCN());
  set('qty', data.qty || 1);
  set('status', data.status || '已收货');
  set('order_no', data.order_no || '');

  const labels = { title: '商品名', platform: '平台', amount: '金额', order_no: '订单号', purchased_at: '日期' };
  const found = (data.found || []).map((key) => labels[key]).filter(Boolean);
  if (note) {
    if (!data.title) {
      note.innerHTML = `<div class="parse-note is-warn">${icon('spark')}<span>没识别出商品名，手动补一下就可以保存。</span></div>`;
    } else if (!data.amount) {
      note.innerHTML = `<div class="parse-note is-warn">${icon('spark')}<span>识别到：${found.join('、')}。没找到金额，记得补上再保存。</span></div>`;
    } else {
      note.innerHTML = `<div class="parse-note">${icon('check')}<span>识别到：${found.join('、')}。检查一下，没问题就保存。</span></div>`;
    }
  }
  if (!data.title) document.getElementById('f-title')?.focus();
  else if (!quiet) toast('识别好了，核对一下');
}

async function pasteFromClipboard() {
  const ta = document.getElementById('paste-text');
  if (!ta) return;
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      toast('剪贴板是空的');
      return;
    }
    ta.value = text;
    parsePastedText(true);
    toast('已从剪贴板识别，检查一下');
  } catch {
    ta.focus();
    toast('读不到剪贴板，请长按输入框选「粘贴」');
  }
}

async function deleteRecord(id) {
  if (!window.confirm('删除后不能恢复，确定删除这条记录吗？')) return;
  try {
    await deleteItem(id);
    await reloadData();
    closeSheet();
    toast('已删除');
    if (state.view === 'stats') loadStats();
    else if (state.view === 'me') loadMe();
    else loadHome();
  } catch (err) {
    toast(err.message);
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function exportData(kind) {
  const date = todayCN();
  if (kind === 'csv') {
    downloadBlob(new Blob([toCsv(state.allItems)], { type: 'text/csv;charset=utf-8' }), `买了啥-${date}.csv`);
    toast('正在导出 CSV…');
    return;
  }
  const data = {
    app: '买了啥',
    version: 2,
    exportedAt: new Date().toISOString(),
    items: state.allItems,
  };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }), `买了啥-${date}.json`);
  toast('正在备份 JSON…');
}

async function importBackupFile(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const items = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(items) || !items.length) throw new Error('这个备份里没有记录');
    const current = state.meta?.overview?.count || 0;
    if (!window.confirm(`导入 ${items.length} 条记录，会覆盖当前的 ${current} 条记录。继续吗？`)) return;
    const count = await replaceAll(items);
    await reloadData();
    loadMe();
    toast(`已导入 ${count} 条记录`);
  } catch (err) {
    toast(err.message || '备份文件读不了');
  }
}

async function clearData() {
  const count = state.meta?.overview?.count || 0;
  if (count === 0) {
    toast('现在没有记录');
    return;
  }
  if (!window.confirm(`确定清空全部 ${count} 条记录吗？删除后只能从备份恢复。`)) return;
  try {
    await clearAll();
    await reloadData();
    loadMe();
    toast('已清空');
  } catch (err) {
    toast(err.message);
  }
}

function renderError(err) {
  viewEl.innerHTML = `<div class="error-box">
    <h3>出了点问题</h3>
    <p>${esc(err.message || '请稍后再试')}</p>
    <button class="btn btn-primary" type="button" data-action="retry">重试</button>
  </div>`;
}

async function go(view) {
  state.view = view;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === view));
  fab.classList.toggle('is-hidden', view !== 'home');
  if (history.replaceState) history.replaceState(null, '', `#${view}`);
  window.scrollTo({ top: 0 });
  const scroller = document.querySelector('.view');
  if (scroller) scroller.scrollTop = 0;
  if (view === 'home') await loadHome();
  else if (view === 'stats') await loadStats();
  else await loadMe();
}

async function handleAction(action, el, e) {
  switch (action) {
    case 'add':
      openAddSheet();
      break;
    case 'close-sheet':
      closeSheet();
      break;
    case 'detail': {
      const id = Number(el.dataset.id);
      const item = (state.items || []).find((it) => it.id === id)
        || (state.stats?.top || []).find((it) => it.id === id);
      if (item) openDetailSheet(item);
      else toast('记录不存在，刷新一下');
      break;
    }
    case 'edit-item': {
      const id = Number(el.dataset.id);
      const item = (state.items || []).find((it) => it.id === id)
        || (state.stats?.top || []).find((it) => it.id === id);
      closeSheet(true);
      if (item) setTimeout(() => openAddSheet(item), 60);
      break;
    }
    case 'delete-item':
      await deleteRecord(Number(el.dataset.id));
      break;
    case 'parse':
      parsePastedText();
      break;
    case 'submit-form':
      document.getElementById('item-form')?.requestSubmit();
      break;
    case 'clipboard':
      await pasteFromClipboard();
      break;
    case 'clear-search': {
      state.q = '';
      const input = document.getElementById('search-input');
      if (input) input.value = '';
      const clear = document.querySelector('.search .clear');
      if (clear) clear.remove();
      await refreshItems();
      break;
    }
    case 'pick-platform':
      state.platform = el.dataset.value;
      await loadHome();
      break;
    case 'open-filter':
      openFilterSheet();
      break;
    case 'reset-filters':
      await resetFilters();
      break;
    case 'open-month':
      openMonthSheet();
      break;
    case 'copy':
      await copyText(el.dataset.copy || '', '已复制');
      break;
    case 'export-csv':
      await exportData('csv');
      break;
    case 'export-json':
      await exportData('json');
      break;
    case 'import-backup':
      document.getElementById('import-file')?.click();
      break;
    case 'clear-data':
      await clearData();
      break;
    case 'retry':
      await boot();
      break;
    default:
      break;
  }
}

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    go(tab.dataset.tab);
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  e.preventDefault();
  handleAction(el.dataset.action, el, e).catch((err) => toast(err.message));
});

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'item-form') return;
  e.preventDefault();
  saveForm(e.target).catch((err) => toast(err.message));
});

document.addEventListener('input', (e) => {
  if (e.target.id !== 'search-input') return;
  state.q = e.target.value;
  const search = e.target.closest('.search');
  if (search) {
    let clear = search.querySelector('.clear');
    if (state.q && !clear) {
      clear = document.createElement('button');
      clear.className = 'clear';
      clear.type = 'button';
      clear.dataset.action = 'clear-search';
      clear.setAttribute('aria-label', '清空搜索');
      clear.textContent = '✕';
      search.appendChild(clear);
    } else if (!state.q && clear) {
      clear.remove();
    }
  }
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => refreshItems(), 120);
});

document.addEventListener('change', (e) => {
  if (e.target.id !== 'import-file') return;
  const file = e.target.files?.[0];
  e.target.value = '';
  importBackupFile(file);
});

fab.addEventListener('click', () => openAddSheet());

async function boot() {
  try {
    await openDb();
    state.allItems = await getAllItems();
    state.month = currentMonth();
    state.meta = buildMeta(state.allItems);
    requestPersistence();
    const initial = location.hash.replace('#', '');
    await go(['home', 'stats', 'me'].includes(initial) ? initial : 'home');
  } catch (err) {
    viewEl.innerHTML = `<div class="error-box">
      <h3>账本打不开</h3>
      <p>${esc(err.message)}<br>如果是在无痕模式，请换普通模式再试。</p>
      <button class="btn btn-primary" type="button" data-action="retry">重试</button>
    </div>`;
  }
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

boot();
