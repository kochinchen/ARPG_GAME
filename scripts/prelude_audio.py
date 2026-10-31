"""
過場影片的英文旁白與背景低語（macOS 的 say + afconvert + sips，訊號處理用 numpy）。

  python3 scripts/prelude_audio.py [media，例如 f1 f35；預設全部]

旁白：Daniel（英國腔）念 src/data/cutscenes.json 的英文，降調放慢、加一點低八度的疊音與殘響
      → art/prelude/<media>-<幅>-<句>.m4a（原始檔）
低語：Whisper 聲音念幾句咒語般的短句，部分倒放、左右散開、大量殘響，底下墊低頻嗡鳴與風聲，
      頭尾交叉淡化成可循環的 → art/prelude/whispers.m4a
最後把 art/prelude/ 的圖（ChatGPT 生成的 <media>-<幅>.jpg）與聲音壓成遊戲用的大小
      → src/ui/cutscene/media/（圖 1280 寬；旁白 64 kbps；低語 80 kbps）
"""
import json
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np
from scipy.signal import lfilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art', 'prelude')
GAME_MEDIA = os.path.join(ROOT, 'src', 'ui', 'cutscene', 'media')
GAME_IMAGE_WIDTH = 1280
SR = 44100
rng = np.random.default_rng(7)

NARRATOR = 'Daniel'
NARRATOR_RATE = 150      # say 的字 / 分；之後放慢 PITCH 倍
PITCH = 0.84             # < 1：降調並放慢（約低 3 個半音）
SUB_OCTAVE = 0.16        # 低八度疊音的音量，讓聲音更厚重
WHISPERS = [
    'come below', 'the well hungers', 'it watches', 'one more', 'descend', 'deeper',
    'we were guardians', 'let none pass', 'it remembers', 'stay with us',
]
BED_SECONDS = 48
FADE = 4.0


def say(text: str, voice: str, rate: int) -> np.ndarray:
    with tempfile.TemporaryDirectory() as tmp:
        aiff, wav = os.path.join(tmp, 'a.aiff'), os.path.join(tmp, 'a.wav')
        subprocess.run(['say', '-v', voice, '-r', str(rate), '-o', aiff, text], check=True)
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', f'LEI16@{SR}', '-c', '1', aiff, wav], check=True)
        with wave.open(wav) as w:
            data = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float64) / 32768
    return data


def resample(x: np.ndarray, factor: float) -> np.ndarray:
    """factor < 1：拉長並降調（像唱盤放慢）"""
    n = int(len(x) / factor)
    return np.interp(np.arange(n) * factor, np.arange(len(x)), x)


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    """一階低通"""
    a = np.exp(-2 * np.pi * cutoff / SR)
    return lfilter([1 - a], [1, -a], x)


def highpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    return x - lowpass(x, cutoff)


def impulse(seconds: float, damp: float) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t * 6.9 / seconds)
    ir = lowpass(ir, damp)
    return ir / np.sqrt(np.sum(ir ** 2))


def convolve(x: np.ndarray, ir: np.ndarray) -> np.ndarray:
    n = len(x) + len(ir) - 1
    size = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:n]


def reverb(x: np.ndarray, seconds: float, wet: float, damp: float = 3500) -> np.ndarray:
    tail = convolve(x, impulse(seconds, damp))
    dry = np.pad(x, (0, len(tail) - len(x)))
    return dry * (1 - wet) + tail * wet * 0.6


def normalize(x: np.ndarray, peak: float) -> np.ndarray:
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


def write_m4a(path: str, stereo: np.ndarray) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'o.wav')
        pcm = (np.clip(stereo, -1, 1) * 32767).astype('<i2')
        with wave.open(wav, 'wb') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.reshape(-1).tobytes())
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '128000', wav, path], check=True)


def narration(text: str) -> np.ndarray:
    voice = resample(say(text, NARRATOR, NARRATOR_RATE), PITCH)
    voice = voice + resample(voice, 0.5)[: len(voice)] * SUB_OCTAVE
    voice = lowpass(voice, 6500)
    voice = reverb(np.pad(voice, (int(0.15 * SR), 0)), 2.4, 0.22, 3000)
    mono = normalize(voice, 0.89)
    return np.stack([mono, mono], axis=1)


def whisper_bed() -> np.ndarray:
    n = int((BED_SECONDS + FADE) * SR)
    left, right = np.zeros(n), np.zeros(n)
    t = np.arange(n) / SR
    # 低頻嗡鳴：三個低音緩慢起伏
    for freq, amp, lfo in ((49.0, 0.10, 0.05), (73.5, 0.06, 0.031), (98.0, 0.035, 0.022)):
        drone = np.sin(2 * np.pi * freq * t) * amp * (0.6 + 0.4 * np.sin(2 * np.pi * lfo * t + rng.uniform(0, 6)))
        left += drone
        right += drone
    # 風聲：低通的噪音，慢慢起伏
    for ch in (left, right):
        wind = lowpass(lowpass(rng.standard_normal(n), 380), 380)
        ch += normalize(wind, 0.07) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.04 * t + rng.uniform(0, 6)))
    # 低語：散在時間軸上，部分倒放、降調，左右隨機
    clips = [say(text, 'Whisper', 150) for text in WHISPERS]
    at = 0.8
    while at < BED_SECONDS:
        clip = clips[rng.integers(len(clips))]
        clip = resample(clip, rng.choice([0.72, 0.8, 0.9, 1.0]))
        if rng.random() < 0.4:
            clip = clip[::-1]
        clip = highpass(clip, 260)
        clip = normalize(clip, rng.uniform(0.05, 0.11))
        clip = reverb(clip, 4.0, 0.65, 2600)
        start = int(at * SR)
        end = min(n, start + len(clip))
        pan = rng.uniform(-0.9, 0.9)
        left[start:end] += clip[: end - start] * np.sqrt((1 - pan) / 2)
        right[start:end] += clip[: end - start] * np.sqrt((1 + pan) / 2)
        at += rng.uniform(1.4, 3.6)
    # 頭尾交叉淡化 → 可無縫循環
    body, f = int(BED_SECONDS * SR), int(FADE * SR)
    ramp = np.linspace(0, 1, f)
    out = []
    for ch in (left, right):
        loop = ch[:body].copy()
        loop[:f] = loop[:f] * ramp + ch[body: body + f] * (1 - ramp)
        out.append(loop)
    stereo = np.stack(out, axis=1)
    return stereo * (0.8 / np.max(np.abs(stereo)))


def export_game_media() -> None:
    """art/prelude/ → src/ui/cutscene/media/：遊戲包是單一 HTML，圖與聲音都要內嵌，所以壓小"""
    os.makedirs(GAME_MEDIA, exist_ok=True)
    for name in sorted(os.listdir(OUT)):
        src, dst = os.path.join(OUT, name), os.path.join(GAME_MEDIA, name)
        if name.endswith('.jpg'):
            subprocess.run(['sips', '-Z', str(GAME_IMAGE_WIDTH), '-s', 'format', 'jpeg', '-s', 'formatOptions', '60', src, '--out', dst],
                           check=True, capture_output=True)
        elif name.endswith('.m4a'):
            # afconvert 不能直接把 AAC 混成單聲道：維持雙聲道，降低位元率
            subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '80000' if name == 'whispers.m4a' else '64000', src, dst], check=True)
    print(GAME_MEDIA)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(ROOT, 'src', 'data', 'cutscenes.json'), encoding='utf-8') as fp:
        preludes = {c['media']: c['panels'] for c in json.load(fp)}
    keys = sys.argv[1:] or list(preludes)
    for key in keys:
        for p, panel in enumerate(preludes[key], 1):
            for l, line in enumerate(panel['lines'], 1):
                path = os.path.join(OUT, f'{key}-{p}-{l}.m4a')
                write_m4a(path, narration(line['en']))
                print(path)
    # 低語只在沒指定樓層、或還沒有檔案時重做（只補某幾層的旁白時，不換掉已經聽過的低語）
    path = os.path.join(OUT, 'whispers.m4a')
    if not sys.argv[1:] or not os.path.exists(path):
        write_m4a(path, whisper_bed())
        print(path)
    export_game_media()


if __name__ == '__main__':
    main()
