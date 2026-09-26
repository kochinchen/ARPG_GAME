import type { DataTable } from '../../data/DataRegistry';
import type { ComboRole, ComboTag, ElementTag, RangeType } from '../../data/schema/combo';
import type { SkillDef } from '../../data/schema/skill';
import { countHits } from '../../data/skillAnalysis';

/** 技能在 Combo 判定時需要的資訊 */
export interface ComboProfile {
  id: string;
  range: RangeType;
  /** Action / Damage / Movement / Control 標籤聯集 */
  tags: ReadonlySet<ComboTag>;
  damageTags: readonly string[];
  elementTags: readonly ElementTag[];
  role: ComboRole;
  hits: number;
}

/** 由技能資料建立一次，之後只查詢 */
export class ComboSkillIndex {
  private readonly profiles = new Map<string, ComboProfile>();

  constructor(skills: DataTable<SkillDef>) {
    for (const skill of skills.all) {
      const c = skill.combo;
      if (!c) continue;
      this.profiles.set(skill.id, {
        id: skill.id,
        range: c.range,
        tags: new Set<ComboTag>([...c.action, ...c.damage, ...c.movement, ...c.control]),
        damageTags: c.damage,
        elementTags: c.element,
        role: c.role,
        hits: countHits(skill.effects),
      });
    }
  }

  get(id: string): ComboProfile | undefined {
    return this.profiles.get(id);
  }
}
