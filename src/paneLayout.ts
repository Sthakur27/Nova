export type PaneEdge = "left" | "right" | "top" | "bottom";
export type Pane = { kind: "pane"; id: string; tabs: string[]; selected: string | null };
export type PaneSplit = { kind: "split"; id: string; axis: "horizontal" | "vertical"; ratio: number; first: PaneNode; second: PaneNode };
export type PaneNode = Pane | PaneSplit;
export const initialPane = (): Pane => ({ kind: "pane", id: "main", tabs: [], selected: null });
export const paneLeaves = (node: PaneNode): Pane[] => node.kind === "pane" ? [node] : [...paneLeaves(node.first), ...paneLeaves(node.second)];
export function mapPane(node: PaneNode, id: string, change: (node: PaneNode) => PaneNode): PaneNode {
  if (node.id === id) return change(node);
  return node.kind === "pane" ? node : { ...node, first: mapPane(node.first, id, change), second: mapPane(node.second, id, change) };
}
function prune(node: PaneNode): PaneNode | null {
  if (node.kind === "pane") return node.tabs.length ? node : null;
  const first = prune(node.first), second = prune(node.second);
  return first && second ? { ...node, first, second } : first ?? second;
}
/** Keep each document in exactly one group, removing empty groups after close/move. */
export function reconcilePanes(node: PaneNode, tabs: string[], activePane: string): PaneNode {
  const seen = new Set<string>();
  function visit(item: PaneNode): PaneNode {
    if (item.kind === "split") return { ...item, first: visit(item.first), second: visit(item.second) };
    const kept = item.tabs.filter(id => tabs.includes(id) && !seen.has(id) && !!seen.add(id));
    return { ...item, tabs: kept, selected: kept.includes(item.selected ?? "") ? item.selected : kept[0] ?? null };
  }
  let next = visit(node);
  const target = paneLeaves(next).find(p => p.id === activePane) ?? paneLeaves(next)[0];
  next = mapPane(next, target.id, n => {
    const pane = n as Pane, added = tabs.filter(id => !seen.has(id));
    return { ...pane, tabs: [...pane.tabs, ...added], selected: pane.selected ?? added[0] ?? null };
  });
  return prune(next) ?? initialPane();
}
export function selectPaneTab(node: PaneNode, paneId: string, tab: string): PaneNode {
  return mapPane(node, paneId, n => n.kind === "pane" && n.tabs.includes(tab) ? { ...n, selected: tab } : n);
}
export function movePaneTab(node: PaneNode, tab: string, targetId: string, edge?: PaneEdge, before: string | null = null, newId: string = crypto.randomUUID()): PaneNode {
  const leaves = paneLeaves(node), source = leaves.find(p => p.tabs.includes(tab)), target = leaves.find(p => p.id === targetId);
  if (!source || !target || (edge && source.id === targetId && source.tabs.length === 1) || (!edge && before === tab)) return node;
  let next = mapPane(node, source.id, n => {
    const p = n as Pane, tabs = p.tabs.filter(id => id !== tab);
    return { ...p, tabs, selected: p.selected === tab ? tabs[Math.min(p.tabs.indexOf(tab), tabs.length - 1)] ?? null : p.selected };
  });
  next = mapPane(next, targetId, n => {
    const p = n as Pane;
    if (!edge) {
      const tabs = [...p.tabs], at = before ? tabs.indexOf(before) : -1;
      tabs.splice(at < 0 ? tabs.length : at, 0, tab);
      return { ...p, tabs, selected: tab };
    }
    const added: Pane = { kind: "pane", id: newId, tabs: [tab], selected: tab };
    const leading = edge === "left" || edge === "top";
    return { kind: "split", id: `split-${newId}`, axis: edge === "left" || edge === "right" ? "horizontal" : "vertical", ratio: .5, first: leading ? added : p, second: leading ? p : added };
  });
  return prune(next) ?? initialPane();
}

/** Session files are untrusted and may predate editor groups. */
export function parsePaneLayout(value: unknown, tabs: string[]): PaneNode | undefined {
  const ids = new Set<string>();
  function parse(value: unknown, depth: number): PaneNode | null {
    if (!value || typeof value !== "object" || depth > 12) return null;
    const n = value as Partial<Pane & Omit<PaneSplit, "kind">>;
    if (typeof n.id !== "string" || ids.has(n.id)) return null;
    ids.add(n.id);
    if (n.kind === "pane" && Array.isArray(n.tabs)) return { kind: "pane", id: n.id, tabs: n.tabs.filter((id): id is string => typeof id === "string"), selected: typeof n.selected === "string" ? n.selected : null };
    const split = value as Partial<PaneSplit>;
    if (split.kind !== "split" || !["horizontal", "vertical"].includes(split.axis ?? "")) return null;
    const first = parse(split.first, depth + 1), second = parse(split.second, depth + 1);
    return first && second ? { kind: "split", id: n.id, first, second, axis: split.axis!, ratio: typeof split.ratio === "number" && Number.isFinite(split.ratio) ? Math.max(.15, Math.min(.85, split.ratio)) : .5 } : null;
  }
  const parsed = parse(value, 0);
  return parsed ? reconcilePanes(parsed, tabs, paneLeaves(parsed)[0].id) : undefined;
}
