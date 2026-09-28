import { describe, expect, it } from 'vitest';
import { DataRegistry } from '../../src/data/DataRegistry';
import { gameData } from '../../src/data';
import { DEFAULT_VOLUME, musicTierForFloor, parseVolume } from '../../src/audio/AudioSettings';
import { composeMelody, scaleNote, SONGS, type MusicId } from '../../src/audio/Music';
import { SFX_NAMES } from '../../src/audio/Sfx';
import { skillSound } from '../../src/audio/SkillSounds';

const data = DataRegistry.load(gameData);
const active = data.skills.all.filter((s) => s.kind === 'active');

describe('技能音效', () => {
  it('每一個主動技能（含怪物與魔王）都有聲音', () => {
    for (const skill of active) {
      const s = skillSound(skill);
      const all = [s.windup, ...s.release, s.impact].filter((n) => n !== undefined);
      expect(all.length, skill.id).toBeGreaterThan(0);
      for (const name of all) expect(SFX_NAMES, skill.id).toContain(name);
    }
  });

  it('依技能種類選擇音效', () => {
    const sound = (id: string) => skillSound(data.skills.get(id));
    expect(sound('melee.heavy_slash').release).toEqual(['swingHeavy']);
    expect(sound('melee.quick_slash').release).toEqual(['swingQuick']);
    expect(sound('melee.dash_slash').release).toContain('dash');
    expect(sound('melee.earth_break').impact).toBe('quake');
    expect(sound('ranged.quick_shot').release).toEqual(['bow']);
    expect(sound('ranged.spread_shot').release).toEqual(['bowMulti']);
    expect(sound('ranged.rain_of_arrows').impact).toBe('arrowRain');
    expect(sound('magic.fireball')).toEqual({ release: ['fireBolt'], impact: 'fireBurst' });
    expect(sound('magic.frost_nova').impact).toBe('coldBurst');
    expect(sound('magic.chain_lightning').impact).toBe('zap');
    expect(sound('magic.firewall').release).toEqual(['fireBurst']);
    expect(sound('enemy.knight_fire_strike').release).toEqual(['swing', 'fireBolt']);
    expect(sound('enemy.queen_eggs').release).toEqual(['summon']);
    expect(sound('enemy.knight_parry').release).toEqual(['parry']);
    expect(sound('enemy.acid_spray').impact).toBe('poisonBurst');
  });
});

describe('背景音樂', () => {
  it('每 5 層換一首，與樓層主題的區間一致', () => {
    expect([1, 4, 5, 9, 10, 15, 20, 25, 29, 30, 34, 35].map(musicTierForFloor)).toEqual([0, 0, 1, 1, 2, 3, 4, 5, 5, 6, 6, 7]);
    for (const f of data.floors.all) {
      const [from, to] = f.floors;
      // 同一個主題區間內音樂相同（王座廳是神殿主題，但有自己的曲子）
      if (f.id !== 'floor.throne') expect(musicTierForFloor(from), f.id).toBe(musicTierForFloor(to));
    }
  });

  it('每一首樂曲都存在，旋律可重現且在音域內', () => {
    const ids: MusicId[] = ['title', 0, 1, 2, 3, 4, 5, 6, 7];
    for (const id of ids) {
      const song = SONGS[id];
      expect(song.scale).toHaveLength(7);
      const a = composeMelody(song, 0);
      expect(a).toEqual(composeMelody(song, 0));
      expect(a).toHaveLength(song.progression.length * song.chordBars * 16);
      for (const d of a) if (d !== null) expect(d).toBeGreaterThanOrEqual(3);
      if (song.melody) expect(a.some((d) => d !== null), String(id)).toBe(true);
      for (const p of [song.bass?.pattern, song.arp?.pattern, song.drums?.kick, song.drums?.snare, song.drums?.hat, song.drums?.taiko, song.drums?.tom]) {
        if (p) expect(p, String(id)).toMatch(/^[xX-]{16}$/);
      }
    }
  });

  it('音階換算', () => {
    const song = { root: 57, scale: [0, 2, 3, 5, 7, 8, 10] };
    expect(scaleNote(song, 0)).toBe(57);
    expect(scaleNote(song, 2)).toBe(60);
    expect(scaleNote(song, 7)).toBe(69);
    expect(scaleNote(song, -1)).toBe(55);
  });
});

describe('音量設定', () => {
  it('壞掉或缺少的欄位用預設值，數值限制在 0～1', () => {
    expect(parseVolume(null)).toEqual(DEFAULT_VOLUME);
    expect(parseVolume('not json')).toEqual(DEFAULT_VOLUME);
    expect(parseVolume(JSON.stringify({ master: 2, music: -1, sfx: 0.3, muted: true }))).toEqual({ master: 1, music: 0, sfx: 0.3, muted: true });
  });
});
