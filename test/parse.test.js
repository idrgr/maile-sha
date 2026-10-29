import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOrderText } from '../public/js/parse.js';

const TODAY = '2026-10-29';

test('识别淘宝分享文案里的商品名和平台', () => {
  const r = parseOrderText('【淘宝】https://m.tb.cn/h.abc 「Apple/苹果 iPhone 15 Pro 256GB 原色钛金属」 点击链接直接打开', { today: TODAY });
  assert.equal(r.platform, '淘宝');
  assert.equal(r.title, 'Apple/苹果 iPhone 15 Pro 256GB 原色钛金属');
  assert.equal(r.category, '数码家电');
  assert.equal(r.purchased_at, TODAY);
});

test('解析京东订单的金额、订单号、日期', () => {
  const text = `京东
罗技 MX Master 3S 鼠标
黑色
数量：1
合计：￥699.00
订单编号 258888888888
2026年09月18日`;
  const r = parseOrderText(text, { today: TODAY });
  assert.equal(r.platform, '京东');
  assert.equal(r.title, '罗技 MX Master 3S 鼠标');
  assert.equal(r.amount, 699);
  assert.equal(r.order_no, '258888888888');
  assert.equal(r.purchased_at, '2026-09-18');
  assert.equal(r.category, '数码家电');
});

test('支持拼多多券后价与数量', () => {
  const r = parseOrderText('【拼多多】纯棉短袖T恤男夏季新款\n券后价 ¥39.9\n共2件', { today: TODAY });
  assert.equal(r.platform, '拼多多');
  assert.equal(r.amount, 39.9);
  assert.equal(r.qty, 2);
  assert.equal(r.category, '服饰鞋包');
});

test('识别待收货状态与长订单号', () => {
  const text = `订单号：1234567890123456789
商品名称：小米 14 Ultra 16+512
实付款：¥5999.00
下单时间：2026-10-20 12:33
待收货`;
  const r = parseOrderText(text, { today: TODAY });
  assert.equal(r.amount, 5999);
  assert.equal(r.status, '待收货');
  assert.equal(r.order_no, '1234567890123456789');
  assert.equal(r.purchased_at, '2026-10-20');
});

test('只写月日时按今年推断', () => {
  const r = parseOrderText('订单号 123456789012\n空气炸锅\n合计 ￥299\n10月3日', { today: TODAY });
  assert.equal(r.purchased_at, '2026-10-03');
});

test('跨年时把未来月日归到去年', () => {
  const r = parseOrderText('羽绒服\n实付 ¥499\n12月31日', { today: '2026-01-05' });
  assert.equal(r.purchased_at, '2025-12-31');
});

test('空文本返回空结果', () => {
  const r = parseOrderText('   ', { today: TODAY });
  assert.equal(r.empty, true);
  assert.equal(r.title, '');
  assert.equal(r.purchased_at, TODAY);
});
