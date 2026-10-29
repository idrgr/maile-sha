/**
 * 订单文本解析：把从淘宝/京东/拼多多等 App 复制出来的文字，
 * 尽可能还原成一条购物记录。
 */

export const PLATFORMS = [
  '淘宝', '天猫', '京东', '拼多多', '抖音', '小红书', '得物',
  '唯品会', '苏宁', '美团', '饿了么', '盒马', '山姆', '亚马逊', '其他',
];

export const CATEGORIES = [
  '数码家电', '服饰鞋包', '食品生鲜', '美妆个护', '家居日用',
  '母婴宠物', '图书文具', '运动户外', '虚拟服务', '其他',
];

export const STATUSES = ['待收货', '已收货', '已用完', '已退货'];

const PLATFORM_RULES = [
  { name: '天猫', re: /天猫|tmall/i },
  { name: '淘宝', re: /淘宝|taobao|淘特|一淘/i },
  { name: '京东', re: /京东|jd\.com|京喜/i },
  { name: '拼多多', re: /拼多多|拼夕夕|pinduoduo|\bpdd\b/i },
  { name: '抖音', re: /抖音|抖店|douyin/i },
  { name: '小红书', re: /小红书|xiaohongshu/i },
  { name: '得物', re: /得物|poizon/i },
  { name: '唯品会', re: /唯品会|vip\.com/i },
  { name: '苏宁', re: /苏宁|suning/i },
  { name: '美团', re: /美团|meituan/i },
  { name: '饿了么', re: /饿了么|ele\.me/i },
  { name: '盒马', re: /盒马|freshippo/i },
  { name: '山姆', re: /山姆|sam'?s club/i },
  { name: '亚马逊', re: /亚马逊|amazon/i },
];

const CATEGORY_RULES = [
  ['数码家电', /手机|iphone|ipad|macbook|imac|电脑|笔记本|耳机|音箱|键盘|鼠标|显示器|平板|相机|镜头|充电|数据线|移动电源|路由器|电视|冰箱|洗衣机|空调|电饭煲|吹风机|剃须刀|扫地机|投影|switch|ps5|xbox|显卡|cpu|硬盘|手表|手环|小米|华为|荣耀|oppo|vivo|三星|一加|魅族|红米|realme|索尼|sony|bose|airpods|thinkpad|联想|戴尔|dell|惠普/i],
  ['服饰鞋包', /T恤|衬衫|卫衣|外套|羽绒服|大衣|裤|裙|内衣|内裤|袜|鞋|靴|包|背包|钱包|帽|围巾|手套|眼镜|饰品|项链|手链|戒指|泳衣|睡衣/i],
  ['食品生鲜', /零食|饼干|巧克力|坚果|牛奶|酸奶|咖啡|茶叶|饮料|矿泉水|水果|苹果|橙|香蕉|葡萄|草莓|大米|面粉|面条|食用油|牛肉|猪肉|鸡肉|海鲜|虾|蟹|鸡蛋|面包|蛋糕|速食|螺蛳粉|火锅/i],
  ['美妆个护', /面膜|护肤|精华|面霜|乳液|洗面奶|洗发水|护发素|沐浴露|牙膏|牙刷|口红|唇膏|香水|粉底|眼影|防晒|卸妆|剃须|卫生巾|纸巾?|湿巾/i],
  ['家居日用', /收纳|锅|碗|盘|筷|杯|床|枕|被|床垫|四件套|毛巾|浴巾|垃圾桶|拖把|扫把|清洁|洗衣液|洗衣凝珠|柔顺剂|衣架|台灯|灯泡|插线板|家具|沙发|桌|椅|柜|窗帘|地垫/i],
  ['母婴宠物', /奶粉|尿不湿|纸尿裤|奶瓶|婴儿|宝宝|儿童|玩具|绘本|猫粮|狗粮|猫砂|猫|狗|宠物|驱虫|疫苗/i],
  ['图书文具', /图书|书籍|小说|教材|辅导|笔记本|钢笔|中性笔|铅笔|文具|本子|便签|打印纸|墨盒/i],
  ['运动户外', /跑步|跑鞋|健身|瑜伽|哑铃|球拍|篮球|足球|羽毛球|帐篷|睡袋|户外|露营|登山|自行车|骑行|泳镜|泳帽|钓鱼/i],
  ['虚拟服务', /会员|充值|话费|流量|课程|网课|软件|订阅|点卡|加速器|云盘|音乐会员|视频会员/i],
];

const NOISE_LINE = /^(?:订单|下单|支付|付款|实付|合计|总计|小计|优惠|运费|店铺|收货|查看|确认|退款|售后|评价|再次|加入|联系|发票|配送|物流|服务|共\s*\d|颜色分类|规格|尺码|型号|版本|套餐|款式|￥|¥)/;
const NOISE_WORD = /订单号|订单编号|订单号码|交易号|交易编号|下单时间|支付时间|付款时间|收货地址|支付方式|配送方式|发票信息|优惠券|店铺名|商品总额|实付款|实付金额|应付总额|运费险/;

function cleanNumber(raw) {
  return Number(String(raw).replace(/,/g, ''));
}

function todayShanghai() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function normalizeDate(y, m, d) {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function detectPlatform(text) {
  for (const rule of PLATFORM_RULES) {
    if (rule.re.test(text)) return rule.name;
  }
  return '其他';
}

export function detectCategory(title) {
  for (const [name, re] of CATEGORY_RULES) {
    if (re.test(title)) return name;
  }
  return '其他';
}

function detectStatus(text) {
  if (/退款成功|已退款|退货退款|已退货|退款完成/.test(text)) return '已退货';
  if (/待收货|待发货|运输中|派送中|已发货|待揽收/.test(text)) return '待收货';
  if (/已签收|交易成功|已完成|已收货|确认收货/.test(text)) return '已收货';
  return '';
}

function extractAmount(text) {
  const patterns = [
    /(?:实付款|实付金额|实付|付款金额|支付金额|订单金额|应付总额|应付金额|合计|总计|商品总额|券后价|到手价)\s*[:：]?\s*[¥￥]?\s*([\d,]+(?:\.\d{1,2})?)/,
    /[¥￥]\s*([\d,]+(?:\.\d{1,2})?)/g,
    /([\d,]+(?:\.\d{1,2})?)\s*元/g,
  ];

  const keyword = text.match(patterns[0]);
  if (keyword) {
    const n = cleanNumber(keyword[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }

  for (const re of patterns.slice(1)) {
    const matches = [...text.matchAll(re)];
    if (!matches.length) continue;
    const values = matches
      .map((m) => cleanNumber(m[1]))
      .filter((n) => Number.isFinite(n) && n > 0 && n < 10_000_000);
    if (values.length) return values[values.length - 1];
  }
  return 0;
}

function extractOrderNo(text) {
  const labeled = text.match(/(?:订单号|订单编号|订单号码|交易号|交易编号|订单ID)\s*[:：]?\s*([A-Za-z0-9_-]{5,})/);
  if (labeled) return labeled[1];

  const longDigit = text.match(/(?<!\d)(\d{15,24})(?!\d)/);
  if (longDigit) return longDigit[1];

  return '';
}

function extractDate(text) {
  const full = text.match(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (full) {
    const d = normalizeDate(full[1], full[2], full[3]);
    if (d) return d;
  }

  const compact = text.match(/(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/);
  if (compact) {
    const d = normalizeDate(compact[1], compact[2], compact[3]);
    if (d) return d;
  }

  const monthDay = text.match(/(?<![\d年])(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (monthDay) {
    const today = todayShanghai();
    const year = Number(today.slice(0, 4));
    let d = normalizeDate(year, monthDay[1], monthDay[2]);
    if (!d) return '';
    // 只写了月日且算出来是未来日期，通常是去年的订单（例如 1 月看到「12月31日」）
    if (d > today) d = normalizeDate(year - 1, monthDay[1], monthDay[2]) || d;
    return d;
  }

  return '';
}

function extractQty(text) {
  const patterns = [
    /(?:数量|件数)\s*[:：]?\s*(\d{1,3})/,
    /[x×]\s*(\d{1,3})(?!\d)/,
    /共\s*(\d{1,3})\s*件/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n > 0 && n < 1000) return n;
    }
  }
  return 1;
}

function stripUrls(text) {
  return text.replace(/https?:\/\/\S+/gi, ' ').replace(/[a-z0-9-]+\.(?:cn|com|net)\/\S*/gi, ' ');
}

function cleanTitle(raw) {
  let title = String(raw)
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[¥￥]\s*[\d,]+(?:\.\d{1,2})?/g, ' ')
    .replace(/(?:包邮|官方正品|正品保障|七天无理由|极速退款)/g, ' ')
    .replace(/^(?:商品|商品名称|宝贝|名称)\s*[:：]\s*/, '')
    .replace(/^[【\[]?(?:淘宝|天猫|京东|拼多多|抖音|小红书|得物|唯品会|苏宁|美团|饿了么|盒马|山姆)\s*[】\]]?\s*[:：]?\s*/, '')
    .replace(/\s*(?:券后价|到手价|活动价|实付款|实付|合计|总计|共\s*\d+\s*件|数量\s*[:：]\s*\d+).*$/, '')
    .replace(/\s+/g, ' ')
    .replace(/^[-—·\s:：]+|[-—·\s:：]+$/g, '')
    .trim();
  if (title.length > 80) title = title.slice(0, 80).trim();
  return title;
}

function titleFromBrackets(text) {
  const candidates = [];
  for (const m of text.matchAll(/[「『“"]([^」』”"]{2,80})[」』”"]/g)) {
    candidates.push({ raw: m[1], bonus: 30 });
  }
  for (const m of text.matchAll(/【([^】]{2,80})】/g)) {
    if (PLATFORM_RULES.some((r) => r.re.test(m[1]))) continue;
    if (/^(?:订单|优惠|活动|公告|店铺)/.test(m[1])) continue;
    candidates.push({ raw: m[1], bonus: 10 });
  }
  if (!candidates.length) return '';
  candidates.sort((a, b) => b.bonus + b.raw.length - (a.bonus + a.raw.length));
  return cleanTitle(candidates[0].raw);
}

function scoreTitleLine(line) {
  const text = line.trim();
  if (text.length < 3 || text.length > 100) return -1;
  if (NOISE_WORD.test(text) || NOISE_LINE.test(text)) return -1;
  if (/^[\d\s:：.,¥￥+\-/]+$/.test(text)) return -1;
  const letters = (text.match(/[A-Za-z\u4e00-\u9fa5]/g) || []).length;
  if (letters < 2) return -1;
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const digits = (text.match(/\d/g) || []).length;
  if (digits > letters * 2) return -1;
  if (PLATFORM_RULES.some((r) => r.re.test(text)) && text.length < 8) return -1;
  return letters + cjk * 0.6 - (text.match(/[，。！？!?]/g) || []).length * 2;
}

function extractTitle(text) {
  const bracket = titleFromBrackets(text);
  if (bracket) return bracket;

  const lines = stripUrls(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let best = '';
  let bestScore = 0;
  for (const line of lines) {
    const score = scoreTitleLine(line);
    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  }

  if (best) return cleanTitle(best);

  // 单行分享文案：去掉平台名/链接后，取最长的中文片段
  const cleaned = stripUrls(text).replace(/[^\u4e00-\u9fa5A-Za-z0-9\s/+\-.()（）]/g, ' ').trim();
  return cleanTitle(cleaned.slice(0, 80));
}

/**
 * @param {string} raw
 * @param {{today?: string}} [opts]
 */
export function parseOrderText(raw, opts = {}) {
  const text = String(raw || '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
  const today = opts.today || todayShanghai();
  if (!text) {
    return {
      title: '', platform: '其他', amount: 0, qty: 1, category: '其他',
      status: '已收货', order_no: '', purchased_at: today, tags: [], note: '',
      found: [], empty: true,
    };
  }

  const platform = detectPlatform(text);
  const title = extractTitle(text);
  const amount = extractAmount(text);
  const qty = extractQty(text);
  const category = detectCategory(title);
  const status = detectStatus(text) || '已收货';
  const orderNo = extractOrderNo(text);
  const date = extractDate(text) || today;

  const found = [];
  if (title) found.push('title');
  if (platform !== '其他') found.push('platform');
  if (amount > 0) found.push('amount');
  if (orderNo) found.push('order_no');
  if (date !== today) found.push('purchased_at');

  return {
    title,
    platform,
    amount,
    qty,
    category,
    status,
    order_no: orderNo,
    purchased_at: date,
    tags: [],
    note: '',
    found,
    empty: false,
  };
}
