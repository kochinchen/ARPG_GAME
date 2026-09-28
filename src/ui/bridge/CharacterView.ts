import type { DataRegistry } from '../../data/DataRegistry';
import type { StatId } from '../../data/schema/common';
import { defenseMitigation } from '../../game/combat/DamagePipeline';
import { itemStats } from '../../game/items/ItemStats';
import type { GameWorld } from '../../game/GameWorld';
import { SPELL_SPREAD } from '../../game/skills/effects/DamageEffect';

export interface AttributeRowView {
  id: string;
  name: string;
  points: number;
  maxPoints: number | null;
  /** 每項效果：目前總加成與每點加成，例如 { total: '+12% 傷害', perPoint: '每點 +1%' } */
  effects: { total: string; perPoint: string }[];
  canAdd: boolean;
}

export interface CharacterView {
  level: number;
  unspent: number;
  pointsPerLevel: number;
  attributes: AttributeRowView[];
  /** 實際攻擊力：每一擊的傷害範圍（已套用所有加成，技能倍率 100% 時） */
  attack: { label: string; value: string }[];
  /** 目前的最終屬性（含裝備、Support、屬性點）；sub = 縮排的明細列 */
  stats: { label: string; value: string; sub?: boolean }[];
  /** 抗性與特殊屬性（分組）；zero = 目前沒有加成（畫面上變暗，但仍顯示，讓玩家知道有這項屬性） */
  groups: { title: string; rows: { label: string; value: string; zero: boolean }[] }[];
}

export function emptyCharacterView(): CharacterView {
  return { level: 1, unspent: 0, pointsPerLevel: 0, attributes: [], attack: [], stats: [], groups: [] };
}

/** 屬性點、等級、裝備、Support 改變時才重建 */
export function characterSignature(world: GameWorld): string {
  return `${world.progress.version}|${world.itemsVersion}|${world.loadout.supports.join(',')}`;
}

const pct = (v: number) => `${+(v * 100).toFixed(1)}%`;
/** 帶正負號的百分比（負值不要顯示成「+-4%」） */
const signedPct = (v: number) => `${v >= 0 ? '+' : ''}${pct(v)}`;
const num = (v: number) => `${+v.toFixed(1)}`;
const signedNum = (v: number) => `${v >= 0 ? '+' : ''}${num(v)}`;

export function buildCharacterView(world: GameWorld, data: DataRegistry): CharacterView {
  const attrs = world.attributes;
  const stats = world.player.stats;
  const format = (value: number, percent: boolean) => (percent ? pct(value) : num(value));
  const mitigation = defenseMitigation(stats.get('defense'), data.balance.combat.defenseConstant);
  const outOfCombat = data.balance.player.outOfCombatRegen;
  const weaponMin = stats.get('damageMin');
  const weaponMax = stats.get('damageMax');
  const spell = stats.get('spellPower');
  const all = 1 + stats.get('damageBonus');
  const melee = 1 + stats.get('meleeDamageBonus');
  const ranged = 1 + stats.get('rangedDamageBonus');
  const magic = 1 + stats.get('spellDamageBonus');
  const range = (min: number, max: number) => `${Math.round(min)} – ${Math.round(max)}`;
  return {
    level: world.progress.level,
    unspent: world.progress.attributePoints,
    pointsPerLevel: data.balance.attributes.pointsPerLevel,
    attributes: attrs.defs.map((def) => {
      const points = attrs.points(def.id);
      return {
        id: def.id,
        name: def.name,
        points,
        maxPoints: def.maxPoints ?? null,
        // 同一個說明（例如武器最小 / 最大值與法術強度）只顯示一行
        effects: def.effects
          .filter((e, i) => def.effects.findIndex((o) => o.label === e.label) === i)
          .map((e) => ({
            total: `+${format(points * e.perPoint, e.percent)} ${e.label}`,
            perPoint: `每點 +${format(e.perPoint, e.percent)}`,
          })),
        canAdd: attrs.check(def.id).ok,
      };
    }),
    attack: [
      { label: '近戰', value: range(weaponMin * all * melee, weaponMax * all * melee) },
      { label: '遠程', value: range(weaponMin * all * ranged, weaponMax * all * ranged) },
      { label: '法術', value: range(spell * (1 - SPELL_SPREAD) * all * magic, spell * (1 + SPELL_SPREAD) * all * magic) },
    ],
    stats: [
      { label: '生命', value: `${Math.round(world.player.maxHp)}` },
      { label: '魔力', value: `${Math.round(world.player.maxMana)}` },
      {
        label: '生命回復',
        value: `${(world.player.maxHp * stats.get('hpRegenPct')).toFixed(1)} / 秒；脫戰 ${(world.player.maxHp * stats.get('hpRegenPct') * outOfCombat.multiplier).toFixed(1)} / 秒`,
      },
      {
        label: '魔力回復',
        value: `${(stats.get('manaRegen') + world.player.maxMana * stats.get('manaRegenPct')).toFixed(1)} / 秒`,
      },
      { label: '武器傷害（合計）', value: `${num(weaponMin)} – ${num(weaponMax)}` },
      ...weaponBreakdown(world, data, weaponMin, weaponMax),
      { label: '基礎法術強度', value: num(spell) },
      { label: '傷害加成', value: signedPct(stats.get('damageBonus')) },
      { label: '近戰傷害加成', value: signedPct(stats.get('meleeDamageBonus')) },
      { label: '遠程傷害加成', value: signedPct(stats.get('rangedDamageBonus')) },
      { label: '法術傷害加成', value: signedPct(stats.get('spellDamageBonus')) },
      { label: '暴擊率', value: pct(Math.min(1, stats.get('critChance'))) },
      { label: '防禦', value: `${num(stats.get('defense'))}（減傷 ${pct(mitigation)}）` },
    ],
    groups: specialGroups(world, data),
  };
}

/**
 * 抗性與特殊屬性。有上限的屬性顯示實際生效值，超過上限時標出原始值（例如「75%（88%，上限 75%）」）。
 */
function specialGroups(world: GameWorld, data: DataRegistry): CharacterView['groups'] {
  const stats = world.player.stats;
  const { maxResist, maxDodge, maxControlResist, critMultiplier } = data.balance.combat;
  const capped = (v: number, cap: number) => (v > cap ? `${pct(cap)}（${pct(v)}，上限 ${pct(cap)}）` : pct(v));
  const row = (label: string, v: number, text = pct(v)) => ({ label, value: text, zero: Math.abs(v) < 1e-9 });
  const resistRow = (label: string, stat: StatId, cap: number) => row(label, stats.get(stat), capped(stats.get(stat), cap));
  const resist = (label: string, stat: StatId) => resistRow(label, stat, maxResist);
  const baseSpeed = data.balance.player.moveSpeed;
  return [
    {
      title: `抗性（上限 ${pct(maxResist)}）`,
      rows: [
        resist('火焰抗性', 'fireResist'),
        resist('冰寒抗性', 'coldResist'),
        resist('閃電抗性', 'lightningResist'),
        resist('毒素抗性', 'poisonResist'),
        resist('物理減傷', 'physicalResist'),
      ],
    },
    {
      title: `控制抗性（上限 ${pct(maxControlResist)}）`,
      rows: [
        resistRow('緩速抗性', 'slowResist', maxControlResist),
        resistRow('擊退抗性', 'knockbackResist', maxControlResist),
        resistRow('暈眩時間減少', 'stunResist', maxControlResist),
      ],
    },
    {
      title: '防禦',
      rows: [
        row('受到傷害減免', stats.get('damageReduction'), capped(stats.get('damageReduction'), 0.9)),
        row('閃避', stats.get('dodgeChance'), capped(stats.get('dodgeChance'), maxDodge)),
        row('荊棘傷害', stats.get('thorns'), num(stats.get('thorns'))),
        row('藥水效果', stats.get('potionEffect'), signedPct(stats.get('potionEffect'))),
      ],
    },
    {
      title: '攻擊',
      rows: [
        { label: '攻擊速度', value: `${num(stats.get('attackSpeed'))} / 秒`, zero: false },
        row('施法速度', stats.get('castSpeed'), signedPct(stats.get('castSpeed'))),
        { label: '暴擊傷害', value: `×${+(critMultiplier + stats.get('critDamageBonus')).toFixed(2)}`, zero: false },
        row('附加火焰傷害', stats.get('fireDamagePct'), signedPct(stats.get('fireDamagePct'))),
        row('附加冰寒傷害', stats.get('coldDamagePct'), signedPct(stats.get('coldDamagePct'))),
        row('附加閃電傷害', stats.get('lightningDamagePct'), signedPct(stats.get('lightningDamagePct'))),
        row('附加毒素傷害', stats.get('poisonDamagePct'), signedPct(stats.get('poisonDamagePct'))),
      ],
    },
    {
      title: '吸取與資源',
      rows: [
        row('生命吸取', stats.get('lifeSteal')),
        row('魔力吸取', stats.get('manaSteal')),
        row('命中回復魔力', stats.get('manaOnHit'), num(stats.get('manaOnHit'))),
        row('魔力消耗降低', stats.get('manaCostReduction'), capped(stats.get('manaCostReduction'), 0.9)),
        { label: '移動速度', value: `${num(stats.get('moveSpeed'))}（${signedPct(stats.get('moveSpeed') / baseSpeed - 1)}）`, zero: false },
      ],
    },
  ];
}

/**
 * 武器傷害的組成：角色基礎 + 裝備武器（已含主倍率）+ 攻擊屬性 + 其他裝備詞綴。
 * 讓玩家看得出武器的主倍率確實算進去了。
 */
function weaponBreakdown(world: GameWorld, data: DataRegistry, totalMin: number, totalMax: number): CharacterView['stats'] {
  const [baseMin, baseMax] = data.balance.player.baseDamage;
  const weapon = world.equipment.get('weapon');
  const w = weapon ? itemStats(weapon, data) : null;
  const wMin = w?.baseStats.damageMin ?? 0;
  const wMax = w?.baseStats.damageMax ?? 0;
  const attack = data.balance.attributes.list.find((a) => a.effects.some((e) => e.stat === 'damageMin'));
  const perPoint = attack?.effects.find((e) => e.stat === 'damageMin')?.perPoint ?? 0;
  const attr = attack ? world.attributes.points(attack.id) * perPoint : 0;
  const otherMin = totalMin - baseMin - wMin - attr;
  const otherMax = totalMax - baseMax - wMax - attr;
  const rows: CharacterView['stats'] = [{ label: '角色基礎', value: `${num(baseMin)} – ${num(baseMax)}`, sub: true }];
  if (w) {
    const raw = w.base.baseStats;
    // 法杖的主倍率在法術強度上，武器傷害沒有放大
    const main = w.quality > 0 && w.mainTarget === 'damage' ? `（${raw.damageMin ?? 0}–${raw.damageMax ?? 0} +${Math.round(w.quality * 100)}%）` : '';
    rows.push({ label: `裝備武器 ${w.base.name}`, value: `${wMin} – ${wMax}${main}`, sub: true });
  }
  if (attr > 0) rows.push({ label: '攻擊屬性', value: `+${num(attr)}`, sub: true });
  if (Math.abs(otherMin) > 0.05 || Math.abs(otherMax) > 0.05) rows.push({ label: '其他裝備詞綴', value: `${signedNum(otherMin)} – ${signedNum(otherMax)}`, sub: true });
  return rows;
}
