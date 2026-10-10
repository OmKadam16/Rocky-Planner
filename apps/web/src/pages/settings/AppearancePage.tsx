// Settings → Appearance: light / dark / system, the same preference the
// header toggle flips between light and dark.

import { useThemePref, type ThemePref } from '../../lib/prefs';
import { Card, CardTitle } from '../../components/Page';
import { ThemeToggle } from '../../components/ThemeToggle';

const OPTIONS: { id: ThemePref; label: string; hint: string }[] = [
  { id: 'light', label: 'Light', hint: 'Bright surfaces, always.' },
  { id: 'dark', label: 'Dark', hint: 'Easy on the eyes, always.' },
  { id: 'system', label: 'System', hint: 'Follows your operating system.' },
];

export function AppearancePage() {
  const [pref, setPref] = useThemePref();

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Card labelledBy="appearance-theme">
        <CardTitle id="appearance-theme">Theme</CardTitle>
        <div role="radiogroup" aria-label="Theme" className="flex flex-col gap-1">
          {OPTIONS.map((o) => {
            const on = pref === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPref(o.id)}
                className="flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left"
                style={{ borderColor: on ? 'var(--accent)' : 'var(--line)' }}
              >
                <span
                  aria-hidden
                  className="grid h-5 w-5 flex-none place-items-center rounded-full border-[1.5px]"
                  style={{ borderColor: on ? 'var(--accent)' : 'var(--ink4)' }}
                >
                  {on && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                </span>
                <span className="flex flex-col">
                  <span className="text-[15px] font-semibold">{o.label}</span>
                  <span className="text-sm text-ink2">{o.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-surface2 px-3.5 py-3">
          <ThemeToggle />
          <span className="text-sm text-ink2">
            The header button flips quickly between light and dark.
          </span>
        </div>
      </Card>
    </div>
  );
}
