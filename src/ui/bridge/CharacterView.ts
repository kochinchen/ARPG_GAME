import type { DataRegistry } from '../../data/DataRegistry';
import { defenseMitigation } from '../../game/combat/DamagePipeline';
import type { GameWorld } from '../../game/GameWorld';

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
  /** 目前的最終屬性（含裝備、Support、屬性點） */
  stats: { label: string; value: string }[];
}

export function emptyCharacterView(): CharacterView {
  return { level: 1, unspent: 0, pointsPerLevel: 0, attributes: [], stats: [] };
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
        effects: def.effects.map((e) => ({
          total: `+${format(points * e.perPoint, e.percent)} ${e.label}`,
          perPoint: `每點 +${format(e.perPoint, e.percent)}`,
        })),
        canAdd: attrs.check(def.id).ok,
      };
    }),
    stats: [
      { label: '生命', value: `${Math.round(world.player.maxHp)}` },
      { label: '魔力', value: `${Math.round(world.player.maxMana)}` },
      { label: '武器傷害', value: `${num(stats.get('damageMin'))} – ${num(stats.get('damageMax'))}` },
      { label: '法術強度', value: num(stats.get('spellPower')) },
      { label: '傷害加成', value: `+${pct(stats.get('damageBonus'))}` },
      { label: '近戰傷害加成', value: `+${pct(stats.get('meleeDamageBonus'))}（與傷害加成相乘）` },
      { label: '暴擊率', value: pct(Math.min(1, stats.get('critChance'))) },
      { label: '防禦', value: `${num(stats.get('defense'))}（減傷 ${pct(mitigation)}）` },
    ],
  };
}
