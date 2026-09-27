import type { DataRegistry } from '../../data/DataRegistry';
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
}

export function emptyCharacterView(): CharacterView {
  return { level: 1, unspent: 0, pointsPerLevel: 0, attributes: [], attack: [], stats: [] };
}

/** 屬性點、等級、裝備、Support 改變時才重建 */
export function characterSignature(world: GameWorld): string {
  return `${world.progress.version}|${world.itemsVersion}|${world.loadout.supports.join(',')}`;
}

const pct = (v: number) => `${+(v * 100).toFixed(1)}%`;
const num = (v: number) => `${+v.toFixed(1)}`;

export function buildCharacterView(world: GameWorld, data: DataRegistry): CharacterView {
  const attrs = world.attributes;
  const stats = world.player.stats;
  const format = (value: number, percent: boolean) => (percent ? pct(value) : num(value));
  const mitigation = defenseMitigation(stats.get('defense'), data.balance.combat.defenseConstant);
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
      { label: '武器傷害（合計）', value: `${num(weaponMin)} – ${num(weaponMax)}` },
      ...weaponBreakdown(world, data, weaponMin, weaponMax),
      { label: '基礎法術強度', value: num(spell) },
      { label: '傷害加成', value: `+${pct(stats.get('damageBonus'))}` },
      { label: '近戰傷害加成', value: `+${pct(stats.get('meleeDamageBonus'))}` },
      { label: '遠程傷害加成', value: `+${pct(stats.get('rangedDamageBonus'))}` },
      { label: '法術傷害加成', value: `+${pct(stats.get('spellDamageBonus'))}` },
      { label: '暴擊率', value: pct(Math.min(1, stats.get('critChance'))) },
      { label: '防禦', value: `${num(stats.get('defense'))}（減傷 ${pct(mitigation)}）` },
    ],
  };
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
    const main = w.quality > 0 ? `（${raw.damageMin ?? 0}–${raw.damageMax ?? 0} +${Math.round(w.quality * 100)}%）` : '';
    rows.push({ label: `裝備武器 ${w.base.name}`, value: `${wMin} – ${wMax}${main}`, sub: true });
  }
  if (attr > 0) rows.push({ label: '攻擊屬性', value: `+${num(attr)}`, sub: true });
  if (Math.abs(otherMin) > 0.05 || Math.abs(otherMax) > 0.05) rows.push({ label: '其他裝備詞綴', value: `+${num(otherMin)} – +${num(otherMax)}`, sub: true });
  return rows;
}
