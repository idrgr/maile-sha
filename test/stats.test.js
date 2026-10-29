import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMeta, buildStats, filterItems, getOverview, monthLabel, shiftMonth, toCsv,
} from '../public/js/stats.js';

const items = [
  { id: 1, title: '纯棉 T 恤', platform: '淘宝', category: '服饰鞋包', amount: 39.9, qty: 2, status: '已收货', purchased_at: '2026-10-20', tags: ['夏装'], order_no: '', note: '' },
  { id: 2, title: 'Sony 降噪耳机', platform: '京东', category: '数码家电', amount: 1999, qty: 1, status: '已收货', purchased_at: '2026-10-12', tags: ['通勤'], order_no: '258888', note: '书房' },
  { id: 3, title: '咖啡豆', platform: '拼多多', category: '食品生鲜', amount: 88, qty: 1, status: '已收货', purchased_at: '2026-10-22', tags: [], order_no: '', note: '' },
  { id: 4, title: '退款的风衣', platform: '淘宝', category: '服饰鞋包', amount: 500, qty: 1, status: '已退货', purchased_at: '2026-10-21', tags: [], order_no: '', note: '' },
  { id: 5, title: '跑步鞋', platform: '得物', category: '运动户外', amount: 499, qty: 1, status: '已收货', purchased_at: '2026-09-15', tags: [], order_no: '', note: '' },
  { id: 6, title: '机械键盘', platform: '京东', category: '数码家电', amount: 699, qty: 1, status: '已收货', purchased_at: '2026-08-18', tags: [], order_no: '', note: '' },
];

test('月份切换与显示', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(monthLabel('2026-10'), '2026年10月');
  assert.equal(monthLabel('all'), '全部时间');
});

test('筛选按月份、平台、状态和关键词', () => {
  assert.equal(filterItems(items, { month: '2026-10' }).length, 4);
  assert.equal(filterItems(items, { month: '2026-10', platform: '淘宝' }).length, 2);
  assert.equal(filterItems(items, { month: '2026-10', platform: '淘宝', status: '已收货' }).length, 1);
  const found = filterItems(items, { q: '纯棉' });
  assert.equal(found.length, 1);
  assert.equal(found[0].title, '纯棉 T 恤');
  assert.equal(filterItems(items, { q: '书房' }).length, 1);
  assert.equal(filterItems(items, { q: '258888' }).length, 1);
});

test('月度统计排除已退货', () => {
  const stats = buildStats(items, '2026-10');
  assert.equal(stats.total, 2126.9);
  assert.equal(stats.count, 3);
  assert.equal(stats.prevTotal, 499);
  assert.equal(stats.byPlatform[0].name, '京东');
  assert.equal(stats.byPlatform.find((p) => p.name === '淘宝').total, 39.9);
  assert.equal(stats.byCategory.find((c) => c.name === '服饰鞋包').count, 1);
  assert.equal(stats.top[0].title, 'Sony 降噪耳机');
  assert.equal(stats.trend.length, 6);
  assert.equal(stats.trend.at(-1).month, '2026-10');
});

test('全部时间统计与概览', () => {
  const stats = buildStats(items, 'all');
  assert.equal(stats.month, 'all');
  assert.equal(stats.total, 3324.9);
  assert.equal(stats.count, 5);

  const overview = getOverview(items);
  assert.equal(overview.count, 6);
  assert.equal(overview.total, 3324.9);
  assert.equal(overview.earliest, '2026-08-18');
  assert.equal(overview.platformCount, 4);
});

test('元数据包含预设与自定义平台/分类', () => {
  const meta = buildMeta(items);
  assert.ok(meta.platforms.includes('淘宝'));
  assert.ok(meta.platforms.includes('得物'));
  assert.ok(meta.categories.includes('数码家电'));
  assert.equal(meta.overview.count, 6);
});

test('CSV 带 BOM、转义引号并防止公式注入', () => {
  const csv = toCsv([
    { ...items[0], title: '=SUM(A1:A2)', note: '包含,逗号"和引号' },
  ]);
  assert.ok(csv.startsWith('\uFEFF购买日期'));
  assert.ok(csv.includes("'=SUM(A1:A2)"));
  assert.ok(csv.includes('"包含,逗号""和引号"'));
});
