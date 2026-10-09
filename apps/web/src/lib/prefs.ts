import { useCallback, useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

const THEME_KEY = 'rocky-theme';
const SPEAK_KEY = 'rocky-speak-replies';
const LATENCY_KEY = 'rocky-show-latency';

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLS(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref;
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(pref: ThemePref): void {
  document.documentElement.dataset.theme = resolveTheme(pref);
}

function readThemePref(): ThemePref {
  const v = readLS(THEME_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'dark';
}

/** Theme preference shared by the laptop toggle and the phone settings sheet. */
export function useThemePref(): [ThemePref, (p: ThemePref) => void, 'light' | 'dark'] {
  const [pref, setPrefState] = useState<ThemePref>(() => readThemePref());
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(readThemePref()));

  useEffect(() => {
    applyTheme(pref);
    setResolved(resolveTheme(pref));
  }, [pref]);

  useEffect(() => {
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      applyTheme('system');
      setResolved(resolveTheme('system'));
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    writeLS(THEME_KEY, p);
    setPrefState(p);
  }, []);

  return [pref, setPref, resolved];
}

function useBoolPref(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => {
    const raw = readLS(key);
    return raw == null ? fallback : raw === '1';
  });
  const set = useCallback(
    (v: boolean) => {
      writeLS(key, v ? '1' : '0');
      setValue(v);
    },
    [key],
  );
  return [value, set];
}

/** Speak replies + results aloud on this device (speechSynthesis, local). */
export function useSpeakReplies(): [boolean, (v: boolean) => void] {
  return useBoolPref(SPEAK_KEY, true);
}

/** Show the latency debug HUD on the phone home screen. */
export function useShowLatency(): [boolean, (v: boolean) => void] {
  return useBoolPref(LATENCY_KEY, false);
}

/** Speak text on this device. No cloud TTS — browser speechSynthesis only. */
export function speakLocal(text: string, enabled: boolean, rate = 1): void {
  if (!enabled) return;
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    synth.speak(u);
  } catch {
    /* ignore */
  }
}
