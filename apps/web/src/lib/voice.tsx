// Laptop voice bar state (top-bar pill + bottom overlay).
//
// Local-only until the brain lands (Phase 2/3): Space or the mic opens a
// listening visual, a second press "thinks" for a beat, then an honest note
// says voice commands arrive with the brain. Nothing is recorded or sent.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type LaptopVoicePhase = 'idle' | 'listening' | 'thinking' | 'unwired';

interface VoiceBarState {
  phase: LaptopVoicePhase;
  elapsedMs: number;
  toggle: () => void;
  dismiss: () => void;
}

const VoiceBarContext = createContext<VoiceBarState>({
  phase: 'idle',
  elapsedMs: 0,
  toggle: () => {},
  dismiss: () => {},
});

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof (el as HTMLElement).tagName !== 'string') return false;
  const tag = (el as HTMLElement).tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return Boolean((el as HTMLElement).isContentEditable);
}

export function VoiceBarProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<LaptopVoicePhase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const dismiss = useCallback(() => {
    clearTimers();
    setPhase('idle');
    setElapsedMs(0);
  }, [clearTimers]);

  const toggle = useCallback(() => {
    if (phase === 'listening') {
      // Second press: a beat of "thinking", then the honest not-yet state.
      setPhase('thinking');
      timers.current.push(
        window.setTimeout(() => {
          setPhase('unwired');
          setElapsedMs(0);
        }, 1200),
      );
      return;
    }
    if (phase !== 'idle') return;
    clearTimers();
    setElapsedMs(0);
    setPhase('listening');
  }, [phase, clearTimers]);

  // Listening stopwatch.
  useEffect(() => {
    if (phase !== 'listening' && phase !== 'thinking') return;
    const started = Date.now() - elapsedMs;
    const id = window.setInterval(() => setElapsedMs(Date.now() - started), 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Space toggles (outside text fields), Escape dismisses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismiss();
        return;
      }
      if (e.code !== 'Space' || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, dismiss]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const value = useMemo(
    () => ({ phase, elapsedMs, toggle, dismiss }),
    [phase, elapsedMs, toggle, dismiss],
  );
  return <VoiceBarContext.Provider value={value}>{children}</VoiceBarContext.Provider>;
}

export function useVoiceBar(): VoiceBarState {
  return useContext(VoiceBarContext);
}
