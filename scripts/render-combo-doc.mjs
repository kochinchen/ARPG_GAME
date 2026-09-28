/**
 * 產生「組合技圖鑑」設計文件：用遊戲的 ComboResolver 判定所有三招排列，把結果嵌進頁面。
 *
 *   npm run docs:combos                                   → release/設計文件/組合技圖鑑.html（完整 HTML，瀏覽器直接開）
 *   node scripts/render-combo-doc.mjs <輸出檔> [--fragment] → --fragment 只輸出頁面內容（發布線上 Artifact 用，外框由平台加上）
 *
 * 技能、Combo 標籤或 Combo 規則有改動時重新執行（頁面樣式在 scripts/combo-doc.template.html）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const outFile = resolve(args.find((a) => !a.startsWith('--')) ?? join(root, 'release', '設計文件', '組合技圖鑑.html'));

/** 與其他本機設計文件相同的外框（線上 Artifact 發布時由平台加上） */
const SHELL_HEAD =
  '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}' +
  'html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}' +
  'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n';
const SHELL_TAIL = '\n</body></html>\n';

const TAG_LABELS = {
  Fast: '快速', Heavy: '重擊', MultiHit: '多段', Projectile: '投射物', AoE: '範圍', Channel: '持續', Impact: '衝擊',
  Guard: '防禦', Counter: '反擊', Execute: '處決', Pierce: '穿透', Burst: '爆發',
  Physical: '物理', Fire: '火焰', Ice: '冰霜', Lightning: '雷電',
  Advance: '突進', Retreat: '後撤', Roll: '翻滾', Reposition: '換位', Dash: '衝刺',
  Slow: '緩速', Freeze: '冰凍', Stun: '暈眩', Knockback: '擊退', ArmorBreak: '破甲', Mark: '標記', Shield: '護盾', Launch: '浮空',
};
const RANGE_LABELS = { Near: '近', Mid: '中', Far: '遠' };
const ROLE_LABELS = { Starter: '起手', Setup: '鋪墊', Bridge: '銜接', Amplifier: '增幅', Finisher: '終結', Defense: '防禦' };
const STATUS_LABELS = { slow: '緩速', freeze: '冰凍', weakPoint: '弱點', marked: '標記', stun: '暈眩', burn: '燃燒', airborne: '浮空' };
const MOD_LABELS = {
  damage: ['傷害', 'pct'], crit: ['暴擊率', 'pct'], aoeRadius: ['範圍', 'pct'], projectileSize: ['投射物大小', 'pct'],
  projectileSpeed: ['投射物速度', 'pct'], projectileCount: ['投射物數量', 'count'], pierce: ['穿透', 'count'],
  armorPenetration: ['穿甲', 'pct'], knockback: ['擊退距離', 'pct'], stagger: ['硬直（未實作）', 'pct'],
  attackSpeed: ['攻擊速度', 'pct'], castSpeed: ['施法速度', 'pct'], animationSpeed: ['動作速度', 'pct'], burn: ['燃燒', 'pct'],
  freezeChance: ['冰凍機率', 'pct'], freezeDuration: ['冰凍時間', 'pct'], statusChance: ['狀態觸發機率', 'pct'],
  chainCount: ['連鎖次數', 'count'], hitCount: ['命中次數', 'count'], mp: ['魔力消耗', 'pct'], movementSpeed: ['位移距離', 'pct'],
};
const STEP_NAMES = { step1: '第一招', step2: '第二招', step3: '第三招', allSteps: '每一招' };
const ELEMENT_SOURCE = { fromStep1: '第一招的元素', fromStep2: '第二招的元素', fire: '火焰', ice: '冰霜', lightning: '雷電' };

const or = (tags) => tags.map((t) => TAG_LABELS[t] ?? t).join(' 或 ');
const fmt = (v, unit) => (unit === 'count' ? `+${v}` : `${v >= 0 ? '+' : ''}${Math.round(v * 1000) / 10}%`);

/** 規則每一招的條件（玩家看得懂的說法） */
function stepText(m) {
  const parts = [];
  if (m.hasElement) parts.push('元素技能');
  if (m.anyTags) parts.push(`${or(m.anyTags)}`);
  if (m.allTags) parts.push(m.allTags.map((t) => TAG_LABELS[t]).join(' + '));
  if (m.range) parts.push(`${m.range.map((r) => RANGE_LABELS[r]).join('/')}距離`);
  if (m.role) parts.push(`${m.role.map((r) => ROLE_LABELS[r]).join('/')}型`);
  if (m.hasDamage) parts.push('有傷害');
  return parts.join('、') || '任意';
}

function conditionText(rule, skillName) {
  const m = rule.match;
  if (m.kind === 'exact') return { steps: m.skills.map(skillName), extra: [] };
  const extra = [];
  if (m.distinctSkills) extra.push('三招都不同');
  if (m.distinctElements) extra.push('元素互不相同');
  if (m.sameElement) extra.push(`三招都是${TAG_LABELS[m.sameElement]}`);
  if (m.rangePattern) extra.push(`距離 ${m.rangePattern.map((r) => RANGE_LABELS[r]).join(' → ')}`);
  return { steps: m.steps.map(stepText), extra };
}

/** 規則的加成（Lv1 基準），條件寫在後面 */
function effectText(rule) {
  return rule.modifiers.map((mod) => {
    const who = STEP_NAMES[mod.target] ?? '施放者';
    let text;
    if (mod.type === 'knockbackResist') text = '整組連段期間免疫擊退';
    else if (mod.type === 'elementDamage') text = `${who}追加${ELEMENT_SOURCE[mod.element ?? 'fromStep1']}傷害 ${fmt(mod.value, 'pct')}`;
    else {
      const [label, unit] = MOD_LABELS[mod.type];
      text = `${who}${label} ${fmt(mod.value, unit)}`;
    }
    const w = mod.when;
    if (w?.stepHasTag) text += `（第${'一二三'[w.stepHasTag.step - 1]}招帶${TAG_LABELS[w.stepHasTag.tag]}時）`;
    if (w?.stepLacksTag) text += `（第${'一二三'[w.stepLacksTag.step - 1]}招不帶${TAG_LABELS[w.stepLacksTag.tag]}時）`;
    if (w?.hitsAtLeast) text += `（第${w.hitsAtLeast.steps.map((s) => '一二三'[s - 1]).join('、')}招合計命中 ≥ ${w.hitsAtLeast.hits} 次時）`;
    if (w?.targetHasStatus) text += `（命中${w.targetHasStatus.map((s) => STATUS_LABELS[s] ?? s).join(' / ')}目標時）`;
    return text;
  });
}

// 用 Vite 載入 TypeScript 原始碼（不啟動 HTTP 伺服器）
const vite = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { gameData } = await vite.ssrLoadModule('/src/data/index.ts');
  const { DataRegistry } = await vite.ssrLoadModule('/src/data/DataRegistry.ts');
  const { ComboResolver } = await vite.ssrLoadModule('/src/game/combo/ComboResolver.ts');
  const { ComboSkillIndex } = await vite.ssrLoadModule('/src/game/combo/ComboSkillIndex.ts');
  const { SKILL_CATEGORY_LABELS, SKILL_ROUTE_LABELS } = await vite.ssrLoadModule('/src/data/skillTree.ts');

  const data = DataRegistry.load(gameData);
  const index = new ComboSkillIndex(data.skills);
  const resolver = new ComboResolver(data.comboRules, index, data.balance.combo.nearNearFarBonus);
  const tierLevels = data.balance.tierLevelReq;
  const categoryOrder = ['melee', 'ranged', 'magic'];

  const skillDefs = data.skills.all
    .filter((s) => index.get(s.id))
    .sort((a, b) => categoryOrder.indexOf(a.tree.category) - categoryOrder.indexOf(b.tree.category) || a.tree.branch.localeCompare(b.tree.branch) || a.tree.tier - b.tree.tier);
  const skillIdx = new Map(skillDefs.map((s, i) => [s.id, i]));
  const skills = skillDefs.map((s) => {
    const p = index.get(s.id);
    return {
      id: s.id,
      name: s.name,
      category: SKILL_CATEGORY_LABELS[s.tree.category],
      route: SKILL_ROUTE_LABELS[s.tree.category][s.tree.branch],
      tier: s.tree.tier,
      level: tierLevels[s.tree.tier - 1],
      range: p.range,
      role: ROLE_LABELS[p.role],
      tags: [...p.tags].map((t) => TAG_LABELS[t] ?? t),
      element: p.elementTags.map((t) => TAG_LABELS[t]),
    };
  });
  const skillName = (id) => data.skills.get(id).name;

  // 所有排列：[規則索引, 第一招, 第二招, 第三招, 說明索引, 近身回報]
  const rules = data.comboRules.all;
  const ruleIdx = new Map(rules.map((r, i) => [r.id, i]));
  const texts = [];
  const textIdx = new Map();
  const textOf = (t) => {
    if (!textIdx.has(t)) {
      textIdx.set(t, texts.length);
      texts.push(t);
    }
    return textIdx.get(t);
  };
  const rows = [];
  for (const a of skillDefs) for (const b of skillDefs) for (const c of skillDefs) {
    const r = resolver.resolve([a.id, b.id, c.id], () => 1);
    if (r.status !== 'combo') continue;
    const nearNearFar = r.description.some((d) => d.startsWith('近身'));
    const desc = r.description.filter((d) => !d.startsWith('近身')).join('；');
    const shown = r.displayName !== r.rule.name ? `〔${r.displayName}〕` : '';
    rows.push([ruleIdx.get(r.rule.id), skillIdx.get(a.id), skillIdx.get(b.id), skillIdx.get(c.id), textOf(shown + desc), nearNearFar ? 1 : 0]);
  }

  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    tierLevels,
    nearNearFar: data.balance.combo.nearNearFarBonus,
    skills,
    rules: rules.map((r) => ({
      id: r.id,
      name: r.name,
      tier: r.tier,
      description: r.description,
      exact: r.match.kind === 'exact',
      condition: conditionText(r, skillName),
      effects: effectText(r),
      displayNames: r.displayNames.map((d) => ({ skill: skillName(d.finalSkill), name: d.name })),
    })),
    texts,
    rows,
  };

  const template = readFileSync(join(root, 'scripts', 'combo-doc.template.html'), 'utf8');
  const page = template.replace('__COMBO_DATA__', () => JSON.stringify(payload));
  const html = fragment ? page : SHELL_HEAD + page + SHELL_TAIL;
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, html);
  console.log(`組合技圖鑑：${rules.length} 條規則、${rows.length} 組排列 → ${outFile}`);
} finally {
  await vite.close();
}
