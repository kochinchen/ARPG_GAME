import type { GameEventBus } from '../GameEvents';
import type { ComboCodex } from './ComboCodex';

/**
 * 監聽「連段完整施放」事件，更新 Codex；第一次發現時發出 ComboDiscovered。
 */
export class ComboDiscoverySystem {
  private sequence = 0;

  constructor(codex: ComboCodex, events: GameEventBus) {
    events.on('ComboCompleted', (e) => {
      const isNew = codex.record(
        { comboId: e.comboId, ruleId: e.ruleId, comboName: e.name, skills: e.skills, effectDescription: e.description },
        this.sequence++,
      );
      if (isNew) events.emit('ComboDiscovered', { comboId: e.comboId, name: e.name, description: e.description });
    });
  }
}
