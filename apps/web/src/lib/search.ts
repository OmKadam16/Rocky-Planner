// ⌘K search: filter helper (pure, tested). Items are built from Supabase
// rows in SearchPalette — local title match only, no server search.

export interface SearchItem {
  id: string;
  title: string;
  sub: string | null;
  path: string;
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

/** Title-prefix matches first, then substring; caps at `limit`. */
export function filterSearchItems(items: SearchItem[], query: string, limit = 8): SearchItem[] {
  const q = norm(query);
  if (!q) return [];
  const starts: SearchItem[] = [];
  const contains: SearchItem[] = [];
  for (const item of items) {
    const title = norm(item.title);
    const sub = norm(item.sub ?? '');
    if (title.startsWith(q)) starts.push(item);
    else if (title.includes(q) || sub.includes(q)) contains.push(item);
    if (starts.length + contains.length >= limit * 2) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
