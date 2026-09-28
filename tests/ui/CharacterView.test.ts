import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/core/CommandQueue';
import { EventBus } from '../../src/core/EventBus';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import type { GameCommand } from '../../src/game/Commands';
import type { GameEvents } from '../../src/game/GameEvents';
import { GameWorld } from '../../src/game/GameWorld';
import { buildCharacterView } from '../../src/ui/bridge/CharacterView';

const data = DataRegistry.load(gameData);
const newWorld = () => new GameWorld({ data, floor: 1, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed: 3 });
const rowOf = (view: ReturnType<typeof buildCharacterView>, label: string) => view.groups.flatMap((g) => g.rows).find((r) => r.label === label)!;

describe('角色面板：抗性與特殊屬性', () => {
  it('新角色的四種元素抗性都顯示 0%（變暗）', () => {
    const view = buildCharacterView(newWorld(), data);
    for (const label of ['火焰抗性', '冰寒抗性', '閃電抗性', '毒素抗性']) expect(rowOf(view, label)).toEqual({ label, value: '0%', zero: true });
  });

  it('超過上限時顯示實際生效值與原始值', () => {
    const world = newWorld();
    world.player.stats.addModifier({ stat: 'fireResist', kind: 'flat', value: 0.88, source: 'test' });
    world.player.stats.addModifier({ stat: 'coldResist', kind: 'flat', value: 0.3, source: 'test' });
    const view = buildCharacterView(world, data);
    expect(rowOf(view, '火焰抗性').value).toBe('75%（88%，上限 75%）');
    expect(rowOf(view, '冰寒抗性')).toMatchObject({ value: '30%', zero: false });
  });

  it('負的傷害加成顯示為「-20%」而不是「+-20%」', () => {
    const world = newWorld();
    world.player.stats.addModifier({ stat: 'spellDamageBonus', kind: 'flat', value: -0.2, source: 'test' });
    const view = buildCharacterView(world, data);
    expect(view.stats.find((s) => s.label === '法術傷害加成')!.value).toBe('-20%');
    expect(view.stats.find((s) => s.label === '近戰傷害加成')!.value).toBe('+0%');
  });
});
