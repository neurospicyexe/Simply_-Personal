# System Map v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated `/map` page with Dagre layout, focus/filter modes, upgraded nodes, and a slide-in detail panel.

**Architecture:** New `MapPage` at `/map` owns all state. `useMapLayout` hook encapsulates Dagre and subgraph logic. `MemberNodeV2`/`GroupNodeV2`/`DetailPanel`/`FloatingToolbar` are isolated components under `src/components/Map/`. Old `SystemMap` component is untouched.

**Tech Stack:** `@dagrejs/dagre`, `@xyflow/react` v12, TanStack Query, CSS Modules, Vitest + Testing Library

---

## File Map

**New files:**
- `src/hooks/useMapLayout.ts` — Dagre layout + subgraph computation
- `src/pages/MapPage.tsx` — page shell, all state + queries
- `src/pages/MapPage.module.css`
- `src/components/Map/MemberNodeV2.tsx`
- `src/components/Map/MemberNodeV2.module.css`
- `src/components/Map/GroupNodeV2.tsx`
- `src/components/Map/GroupNodeV2.module.css`
- `src/components/Map/DetailPanel.tsx`
- `src/components/Map/DetailPanel.module.css`
- `src/components/Map/FloatingToolbar.tsx`
- `src/components/Map/FloatingToolbar.module.css`
- `src/__tests__/useMapLayout.test.ts`
- `src/__tests__/MapPage.test.tsx`
- `src/__tests__/DetailPanel.test.tsx`

**Modified files:**
- `src/App.tsx` — add `/map` lazy route
- `src/components/BottomNav.tsx` — add Map nav entry

---

## Task 1: Install `@dagrejs/dagre` and add `/map` route + nav entry

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/BottomNav.tsx`

- [ ] **Step 1: Install the dependency**

```bash
cd src/PluralHost.Web
npm install @dagrejs/dagre --legacy-peer-deps
npm install --save-dev @types/dagre --legacy-peer-deps
```

Expected: no errors, `@dagrejs/dagre` appears in `package.json` dependencies.

- [ ] **Step 2: Create an empty MapPage placeholder**

Create `src/pages/MapPage.tsx`:

```tsx
export default function MapPage() {
  return <div style={{ padding: '2rem', color: 'var(--color-text)' }}>Map coming soon</div>
}
```

- [ ] **Step 3: Add the `/map` route to `App.tsx`**

At the top of `App.tsx`, add the lazy import after the existing ones:

```tsx
const MapPage = lazy(() => import('./pages/MapPage'))
```

Inside the `<Routes>` block, after the `/logs` route:

```tsx
<Route path="/map" element={<Protected><MapPage /></Protected>} />
```

- [ ] **Step 4: Add Map to BottomNav**

Replace the contents of `src/components/BottomNav.tsx`:

```tsx
import { Radio, Users, Layers, BookOpen, Settings, Network } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import styles from './BottomNav.module.css'

const TABS = [
  { to: '/front',    label: 'Front',    Icon: Radio },
  { to: '/members',  label: 'Members',  Icon: Users },
  { to: '/map',      label: 'Map',      Icon: Network },
  { to: '/system',   label: 'System',   Icon: Layers },
  { to: '/logs',     label: 'Logs',     Icon: BookOpen },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

export default function BottomNav() {
  return (
    <nav className={styles.nav} aria-label="Main navigation">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            [styles.tab, isActive && styles.active].filter(Boolean).join(' ')
          }
        >
          <Icon size={20} aria-hidden="true" className={styles.icon} />
          <span className={styles.label}>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 5: Verify the page loads**

```bash
npx vitest run --reporter=verbose 2>&1 | tail -5
```

Expected: existing tests still pass. Navigate to `http://localhost:5173/map` — should show "Map coming soon".

- [ ] **Step 6: Commit**

```bash
git add src/pages/MapPage.tsx src/App.tsx src/components/BottomNav.tsx package.json package-lock.json
git commit -m "feat: add /map route, BottomNav entry, @dagrejs/dagre dependency"
```

---

## Task 2: `useMapLayout` hook (TDD)

**Files:**
- Create: `src/hooks/useMapLayout.ts`
- Create: `src/__tests__/useMapLayout.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/useMapLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSubgraph } from '../hooks/useMapLayout'
import type { Member, Group, MemberRelationship } from '../types'

const makeMember = (id: string, parentIds: string[] = []): Member => ({
  id, name: id, displayName: null, pronouns: null, color: '#ff0000',
  role: null, description: null, avatarPath: null, backgroundImagePath: null,
  bucketId: 'bucket-1', allowsBoardPosting: true, isFronting: false,
  isPinned: false, isArchived: false, isUntracked: false,
  preventFrontNotification: false, receivesBoardNotifications: false,
  parentIds, spMemberId: null, status: null, extraImages: [],
})

const makeGroup = (id: string): Group => ({
  id, name: id, color: '#00ff00', emoji: null, parentId: null, memberCount: 0,
})

const makeRel = (id: string, from: string, to: string): MemberRelationship => ({
  id, fromMemberId: from, toMemberId: to, label: 'friends', isDirected: false,
})

describe('buildSubgraph', () => {
  const members = [makeMember('a', ['g1']), makeMember('b', ['g1']), makeMember('c')]
  const groups = [makeGroup('g1')]
  const rels = [makeRel('r1', 'a', 'c')]

  it('all mode includes every member and group', () => {
    const result = buildSubgraph(members, groups, rels, { type: 'all' }, 'both')
    expect(result.memberIds).toEqual(['a', 'b', 'c'])
    expect(result.groupIds).toEqual(['g1'])
  })

  it('group focus only includes members in that group', () => {
    const result = buildSubgraph(members, groups, rels, { type: 'group', id: 'g1', name: 'g1' }, 'both')
    expect(result.memberIds).toEqual(['a', 'b'])
    expect(result.groupIds).toEqual(['g1'])
  })

  it('member focus includes focal member and directly connected members', () => {
    const result = buildSubgraph(members, groups, rels, { type: 'member', id: 'a', name: 'a' }, 'relationships')
    expect(result.memberIds).toContain('a')
    expect(result.memberIds).toContain('c')
    expect(result.memberIds).not.toContain('b')
  })

  it('member focus with relationships mode off returns only focal member', () => {
    const result = buildSubgraph(members, groups, rels, { type: 'member', id: 'a', name: 'a' }, 'groups')
    expect(result.memberIds).toEqual(['a'])
  })

  it('isolated member has no link pairs', () => {
    const result = buildSubgraph(members, groups, rels, { type: 'all' }, 'relationships')
    const bNodeId = 'member-b'
    const bIsConnected = result.linkPairs.some(([s, t]) => s === bNodeId || t === bNodeId)
    expect(bIsConnected).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/useMapLayout.test.ts
```

Expected: FAIL — `buildSubgraph` not found.

- [ ] **Step 3: Implement `useMapLayout`**

Create `src/hooks/useMapLayout.ts`:

```ts
import dagre from '@dagrejs/dagre'
import { useMemo } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { Member, Group, MemberRelationship } from '../types'

export type MapMode = 'groups' | 'relationships' | 'both'

export type ViewFilter =
  | { type: 'all' }
  | { type: 'group'; id: string; name: string }
  | { type: 'member'; id: string; name: string }

export type MemberNodeV2Data = {
  id: string
  name: string
  color?: string
  pronouns?: string | null
  isFronting: boolean
  isIsolated: boolean
}

export type GroupNodeV2Data = {
  id: string
  name: string
  color?: string | null
  memberCount: number
}

const NODE_W = 80
const NODE_H = 70

export function buildSubgraph(
  members: Member[],
  groups: Group[],
  relationships: MemberRelationship[],
  viewFilter: ViewFilter,
  mode: MapMode
): { memberIds: string[]; groupIds: string[]; linkPairs: Array<[string, string]> } {
  const showGroups = mode === 'groups' || mode === 'both'
  const showRels = mode === 'relationships' || mode === 'both'

  let memberIds: string[]
  let groupIds: string[]

  if (viewFilter.type === 'group') {
    memberIds = members.filter(m => m.parentIds.includes(viewFilter.id)).map(m => m.id)
    groupIds = showGroups ? [viewFilter.id] : []
  } else if (viewFilter.type === 'member') {
    const connected = new Set<string>([viewFilter.id])
    if (showRels) {
      relationships.forEach(r => {
        if (r.fromMemberId === viewFilter.id) connected.add(r.toMemberId)
        if (r.toMemberId === viewFilter.id) connected.add(r.fromMemberId)
      })
    }
    memberIds = members.filter(m => connected.has(m.id)).map(m => m.id)
    groupIds = []
  } else {
    memberIds = members.map(m => m.id)
    groupIds = showGroups ? groups.map(g => g.id) : []
  }

  const memberIdSet = new Set(memberIds)
  const groupIdSet = new Set(groupIds)
  const linkPairs: Array<[string, string]> = []

  if (showGroups) {
    members.forEach(m => {
      if (!memberIdSet.has(m.id)) return
      m.parentIds.forEach(gid => {
        if (groupIdSet.has(gid)) linkPairs.push([`member-${m.id}`, `group-${gid}`])
      })
    })
  }
  if (showRels) {
    relationships.forEach(r => {
      if (memberIdSet.has(r.fromMemberId) && memberIdSet.has(r.toMemberId)) {
        linkPairs.push([`member-${r.fromMemberId}`, `member-${r.toMemberId}`])
      }
    })
  }

  return { memberIds, groupIds, linkPairs }
}

function runDagre(
  nodeIds: string[],
  linkPairs: Array<[string, string]>,
  rankdir: 'TB' | 'LR'
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir, ranksep: rankdir === 'LR' ? 100 : 80, nodesep: rankdir === 'LR' ? 50 : 60 })
  nodeIds.forEach(id => g.setNode(id, { width: NODE_W, height: NODE_H }))
  linkPairs.forEach(([s, t]) => { if (nodeIds.includes(s) && nodeIds.includes(t)) g.setEdge(s, t) })
  dagre.layout(g)
  return new Map(nodeIds.map(id => {
    const pos = g.node(id)
    return [id, { x: (pos?.x ?? 0) - NODE_W / 2, y: (pos?.y ?? 0) - NODE_H / 2 }]
  }))
}

export function useMapLayout(
  members: Member[],
  groups: Group[],
  relationships: MemberRelationship[],
  fronterIds: Set<string>,
  viewFilter: ViewFilter,
  mode: MapMode
): { nodes: Node[]; edges: Edge[] } {
  return useMemo(() => {
    const { memberIds, groupIds, linkPairs } = buildSubgraph(members, groups, relationships, viewFilter, mode)
    const rankdir = viewFilter.type === 'member' ? 'LR' : 'TB'
    const allNodeIds = [
      ...memberIds.map(id => `member-${id}`),
      ...groupIds.map(id => `group-${id}`),
    ]
    const posMap = runDagre(allNodeIds, linkPairs, rankdir)
    const connectedNodeIds = new Set(linkPairs.flatMap(([s, t]) => [s, t]))
    const showGroups = mode === 'groups' || mode === 'both'
    const showRels = mode === 'relationships' || mode === 'both'

    const nodes: Node[] = memberIds.map(id => {
      const m = members.find(mem => mem.id === id)!
      const pos = posMap.get(`member-${id}`) ?? { x: 0, y: 0 }
      return {
        id: `member-${id}`,
        type: 'memberV2',
        position: pos,
        data: {
          id,
          name: m.displayName || m.name,
          color: m.color ?? undefined,
          pronouns: m.pronouns,
          isFronting: fronterIds.has(id),
          isIsolated: !connectedNodeIds.has(`member-${id}`),
        } satisfies MemberNodeV2Data,
      }
    })

    groupIds.forEach(id => {
      const g = groups.find(grp => grp.id === id)!
      const pos = posMap.get(`group-${id}`) ?? { x: 0, y: 0 }
      nodes.push({
        id: `group-${id}`,
        type: 'groupV2',
        position: pos,
        data: {
          id,
          name: g.name,
          color: g.color,
          memberCount: members.filter(m => m.parentIds.includes(id)).length,
        } satisfies GroupNodeV2Data,
      })
    })

    const edges: Edge[] = []
    if (showGroups) {
      members.forEach(m => {
        if (!memberIds.includes(m.id)) return
        m.parentIds.forEach(gid => {
          if (!groupIds.includes(gid)) return
          const grp = groups.find(g => g.id === gid)!
          edges.push({
            id: `membership-${m.id}-${gid}`,
            source: `member-${m.id}`,
            target: `group-${gid}`,
            style: { stroke: grp.color ?? '#666', strokeWidth: 1, strokeOpacity: 0.35 },
          })
        })
      })
    }
    if (showRels) {
      relationships.forEach(r => {
        if (!memberIds.includes(r.fromMemberId) || !memberIds.includes(r.toMemberId)) return
        edges.push({
          id: `rel-${r.id}`,
          source: `member-${r.fromMemberId}`,
          target: `member-${r.toMemberId}`,
          type: 'relationship',
          data: { label: r.label, isDirected: r.isDirected },
        })
      })
    }

    return { nodes, edges }
  }, [members, groups, relationships, fronterIds, viewFilter, mode])
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run src/__tests__/useMapLayout.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useMapLayout.ts src/__tests__/useMapLayout.test.ts
git commit -m "feat: add useMapLayout hook with Dagre layout and subgraph filtering"
```

---

## Task 3: `MemberNodeV2` component (TDD)

**Files:**
- Create: `src/components/Map/MemberNodeV2.tsx`
- Create: `src/components/Map/MemberNodeV2.module.css`
- Create test section in: `src/__tests__/MapPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/MapPage.test.tsx` (member node section only for now — Task 6 will append more tests):

```tsx
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemberNodeV2 } from '../components/Map/MemberNodeV2'
import type { MemberNodeV2Data } from '../hooks/useMapLayout'
import type { Member, Group } from '../types'
import type { Node } from '@xyflow/react'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>
)

// React Flow requires ResizeObserver
beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react')
  return {
    ...actual,
    useViewport: () => ({ zoom: 1, x: 0, y: 0 }),
    Handle: () => null,
  }
})

const baseData: MemberNodeV2Data = {
  id: 'member-1',
  name: 'Mira',
  color: '#ff4db8',
  pronouns: 'she/her',
  isFronting: false,
  isIsolated: false,
}

type MemberNodeProps = Parameters<typeof MemberNodeV2>[0]

function makeProps(overrides: Partial<MemberNodeV2Data> = {}): MemberNodeProps {
  return {
    id: 'member-member-1',
    data: { ...baseData, ...overrides },
    selected: false,
    type: 'memberV2',
    zIndex: 0,
    isConnectable: true,
    dragging: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  } as MemberNodeProps
}

describe('MemberNodeV2', () => {
  it('renders name and initial', () => {
    render(<MemoryRouter><MemberNodeV2 {...makeProps()} /></MemoryRouter>)
    expect(screen.getByText('Mira')).toBeInTheDocument()
    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('renders pronouns when zoom >= 0.5', () => {
    render(<MemoryRouter><MemberNodeV2 {...makeProps()} /></MemoryRouter>)
    expect(screen.getByText('she/her')).toBeInTheDocument()
  })

  it('does not render pronouns when zoom < 0.5', async () => {
    const { useViewport } = await import('@xyflow/react')
    vi.mocked(useViewport).mockReturnValue({ zoom: 0.4, x: 0, y: 0 })
    render(<MemoryRouter><MemberNodeV2 {...makeProps()} /></MemoryRouter>)
    expect(screen.queryByText('she/her')).not.toBeInTheDocument()
    vi.mocked(useViewport).mockReturnValue({ zoom: 1, x: 0, y: 0 })
  })

  it('skips pronouns when not set', () => {
    render(<MemoryRouter><MemberNodeV2 {...makeProps({ pronouns: null })} /></MemoryRouter>)
    expect(screen.queryByText('she/her')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
npx vitest run src/__tests__/MapPage.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `MemberNodeV2`**

Create `src/components/Map/MemberNodeV2.tsx`:

```tsx
import { Handle, Position, useViewport, type NodeProps, type Node } from '@xyflow/react'
import type { MemberNodeV2Data } from '../../hooks/useMapLayout'
import styles from './MemberNodeV2.module.css'

export type MemberNodeV2Type = Node<MemberNodeV2Data, 'memberV2'>

export function MemberNodeV2({ data, selected }: NodeProps<MemberNodeV2Type>) {
  const { zoom } = useViewport()
  const color = data.color ?? 'var(--color-primary)'
  const initial = (data.name[0] ?? '?').toUpperCase()

  return (
    <div
      className={[
        styles.node,
        data.isFronting && styles.fronting,
        data.isIsolated && styles.isolated,
        selected && styles.selected,
      ].filter(Boolean).join(' ')}
      style={{ '--node-color': color } as React.CSSProperties}
    >
      <Handle type="source" position={Position.Top} className={styles.handle} />
      <Handle type="target" position={Position.Top} className={styles.handle} id="target" />
      <div className={styles.circle}>
        <span className={styles.initial}>{initial}</span>
      </div>
      <span className={styles.name}>{data.name}</span>
      {zoom >= 0.5 && data.pronouns && (
        <span className={styles.pronouns}>{data.pronouns}</span>
      )}
    </div>
  )
}
```

Create `src/components/Map/MemberNodeV2.module.css`:

```css
.node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  width: 80px;
}

.circle {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--node-color);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid transparent;
  transition: box-shadow 200ms, border-color 200ms, transform 150ms;
}

.initial {
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  font-family: var(--font-display, sans-serif);
  line-height: 1;
  mix-blend-mode: overlay;
}

.name {
  color: var(--color-text, #fff);
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pronouns {
  color: var(--color-muted, #888);
  font-size: 9px;
  text-align: center;
}

.fronting .circle {
  border-color: var(--node-color);
  box-shadow: 0 0 16px color-mix(in srgb, var(--node-color) 60%, transparent);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 12px color-mix(in srgb, var(--node-color) 40%, transparent); }
  50%       { box-shadow: 0 0 28px color-mix(in srgb, var(--node-color) 70%, transparent); }
}

@media (prefers-reduced-motion: reduce) {
  .fronting .circle {
    animation: none;
    box-shadow: 0 0 16px color-mix(in srgb, var(--node-color) 60%, transparent);
  }
}

.isolated { opacity: 0.4; }

.selected .circle {
  border-color: var(--node-color);
  transform: scale(1.05);
}

.handle {
  opacity: 0;
  width: 8px;
  height: 8px;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run src/__tests__/MapPage.test.tsx
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/Map/MemberNodeV2.tsx src/components/Map/MemberNodeV2.module.css src/__tests__/MapPage.test.tsx
git commit -m "feat: add MemberNodeV2 component with pronouns and fronting states"
```

---

## Task 4: `GroupNodeV2` component

**Files:**
- Create: `src/components/Map/GroupNodeV2.tsx`
- Create: `src/components/Map/GroupNodeV2.module.css`
- Modify: `src/__tests__/MapPage.test.tsx` (append tests)

- [ ] **Step 1: Append group node tests to `src/__tests__/MapPage.test.tsx`**

```tsx
import { GroupNodeV2 } from '../components/Map/GroupNodeV2'
import type { GroupNodeV2Data } from '../hooks/useMapLayout'

type GroupNodeProps = Parameters<typeof GroupNodeV2>[0]

function makeGroupProps(overrides: Partial<GroupNodeV2Data> = {}): GroupNodeProps {
  return {
    id: 'group-g1',
    data: { id: 'g1', name: 'Protectors', color: '#00d4ff', memberCount: 4, ...overrides },
    selected: false,
    type: 'groupV2',
    zIndex: 0,
    isConnectable: true,
    dragging: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  } as GroupNodeProps
}

describe('GroupNodeV2', () => {
  it('renders group name', () => {
    render(<MemoryRouter><GroupNodeV2 {...makeGroupProps()} /></MemoryRouter>)
    expect(screen.getByText('Protectors')).toBeInTheDocument()
  })

  it('renders member count badge', () => {
    render(<MemoryRouter><GroupNodeV2 {...makeGroupProps()} /></MemoryRouter>)
    expect(screen.getByText('4')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
npx vitest run src/__tests__/MapPage.test.tsx
```

Expected: FAIL on GroupNodeV2 tests.

- [ ] **Step 3: Implement `GroupNodeV2`**

Create `src/components/Map/GroupNodeV2.tsx`:

```tsx
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { GroupNodeV2Data } from '../../hooks/useMapLayout'
import styles from './GroupNodeV2.module.css'

export type GroupNodeV2Type = Node<GroupNodeV2Data, 'groupV2'>

export function GroupNodeV2({ data, selected }: NodeProps<GroupNodeV2Type>) {
  const color = data.color ?? '#666'
  return (
    <div
      className={[styles.node, selected && styles.selected].filter(Boolean).join(' ')}
      style={{ '--group-color': color } as React.CSSProperties}
    >
      <Handle type="source" position={Position.Top} className={styles.handle} />
      <Handle type="target" position={Position.Top} className={styles.handle} id="target" />
      <span className={styles.name}>{data.name}</span>
      <span className={styles.badge}>{data.memberCount}</span>
    </div>
  )
}
```

Create `src/components/Map/GroupNodeV2.module.css`:

```css
.node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px 6px 12px;
  border-radius: 999px;
  border: 1.5px solid var(--group-color);
  background: color-mix(in srgb, var(--group-color) 8%, transparent);
  cursor: pointer;
  transition: box-shadow 150ms;
  min-width: 80px;
}

.node:hover, .selected {
  box-shadow: 0 0 12px color-mix(in srgb, var(--group-color) 40%, transparent);
}

.name {
  color: var(--color-text, #fff);
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-display, sans-serif);
  white-space: nowrap;
}

.badge {
  background: color-mix(in srgb, var(--group-color) 20%, transparent);
  color: var(--group-color);
  font-size: 9px;
  font-weight: 700;
  border-radius: 999px;
  padding: 1px 5px;
  min-width: 16px;
  text-align: center;
}

.handle {
  opacity: 0;
  width: 8px;
  height: 8px;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run src/__tests__/MapPage.test.tsx
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/Map/GroupNodeV2.tsx src/components/Map/GroupNodeV2.module.css src/__tests__/MapPage.test.tsx
git commit -m "feat: add GroupNodeV2 pill component"
```

---

## Task 5: `DetailPanel` component (TDD)

**Files:**
- Create: `src/components/Map/DetailPanel.tsx`
- Create: `src/components/Map/DetailPanel.module.css`
- Create: `src/__tests__/DetailPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/DetailPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DetailPanel } from '../components/Map/DetailPanel'
import type { Member, Group, MemberRelationship, PrivacyBucket } from '../types'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>
)

const bucket: PrivacyBucket = {
  id: 'b1', name: 'Public', description: null, emoji: '🌍',
  sortOrder: 0, isDefault: true, color: null,
}

const member: Member = {
  id: 'm1', name: 'Mira', displayName: 'Mira', pronouns: 'she/her',
  color: '#ff4db8', role: null, description: null, avatarPath: null,
  backgroundImagePath: null, bucketId: 'b1', allowsBoardPosting: true,
  isFronting: false, isPinned: false, isArchived: false, isUntracked: false,
  preventFrontNotification: false, receivesBoardNotifications: false,
  parentIds: [], spMemberId: null, status: null, extraImages: [],
}

const group: Group = {
  id: 'g1', name: 'Protectors', color: '#00d4ff', emoji: null,
  parentId: null, memberCount: 2,
}

const rels: MemberRelationship[] = [
  { id: 'r1', fromMemberId: 'm1', toMemberId: 'm2', label: 'partners', isDirected: true },
]

describe('DetailPanel', () => {
  it('renders nothing when selected is null', () => {
    const { container } = render(wrap(
      <DetailPanel selected={null} members={[member]} groups={[]} relationships={[]} fronterIds={new Set()} buckets={[bucket]} onClose={vi.fn()} />
    ))
    expect(container.firstChild).toBeNull()
  })

  it('renders member name and pronouns', () => {
    render(wrap(
      <DetailPanel selected={{ type: 'member', id: 'm1' }} members={[member]} groups={[]} relationships={rels} fronterIds={new Set()} buckets={[bucket]} onClose={vi.fn()} />
    ))
    expect(screen.getByText('Mira')).toBeInTheDocument()
    expect(screen.getByText('she/her')).toBeInTheDocument()
  })

  it('shows fronting badge when member is fronting', () => {
    render(wrap(
      <DetailPanel selected={{ type: 'member', id: 'm1' }} members={[member]} groups={[]} relationships={[]} fronterIds={new Set(['m1'])} buckets={[bucket]} onClose={vi.fn()} />
    ))
    expect(screen.getByText(/fronting/i)).toBeInTheDocument()
  })

  it('renders group name and member count', () => {
    render(wrap(
      <DetailPanel selected={{ type: 'group', id: 'g1' }} members={[member]} groups={[group]} relationships={[]} fronterIds={new Set()} buckets={[bucket]} onClose={vi.fn()} />
    ))
    expect(screen.getByText('Protectors')).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(wrap(
      <DetailPanel selected={{ type: 'member', id: 'm1' }} members={[member]} groups={[]} relationships={[]} fronterIds={new Set()} buckets={[bucket]} onClose={onClose} />
    ))
    fireEvent.click(screen.getByLabelText('Close panel'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn()
    render(wrap(
      <DetailPanel selected={{ type: 'member', id: 'm1' }} members={[member]} groups={[]} relationships={[]} fronterIds={new Set()} buckets={[bucket]} onClose={onClose} />
    ))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
npx vitest run src/__tests__/DetailPanel.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `DetailPanel`**

Create `src/components/Map/DetailPanel.tsx`:

```tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Member, Group, MemberRelationship, PrivacyBucket } from '../../types'
import styles from './DetailPanel.module.css'

export type SelectedNode =
  | { type: 'member'; id: string }
  | { type: 'group'; id: string }
  | null

interface Props {
  selected: SelectedNode
  members: Member[]
  groups: Group[]
  relationships: MemberRelationship[]
  fronterIds: Set<string>
  buckets: PrivacyBucket[]
  onClose: () => void
}

export function DetailPanel({ selected, members, groups, relationships, fronterIds, buckets, onClose }: Props) {
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!selected) return null

  return (
    <div className={styles.panel} role="complementary" aria-label="Node details">
      <button className={styles.closeBtn} onClick={onClose} aria-label="Close panel">✕</button>

      {selected.type === 'member' && (() => {
        const member = members.find(m => m.id === selected.id)
        if (!member) return null
        const bucket = buckets.find(b => b.id === member.bucketId)
        const isFronting = fronterIds.has(member.id)
        const memberRels = relationships.filter(
          r => r.fromMemberId === member.id || r.toMemberId === member.id
        )

        return (
          <>
            <div className={styles.colorDot} style={{ background: member.color ?? '#888' }} />
            <div className={styles.name}>{member.displayName || member.name}</div>
            {member.pronouns && <div className={styles.pronouns}>{member.pronouns}</div>}
            {isFronting && <div className={styles.frontingBadge}>● Fronting</div>}
            {bucket && (
              <div className={styles.bucketChip}>
                {bucket.emoji && <span>{bucket.emoji}</span>}
                {bucket.name}
              </div>
            )}
            {memberRels.length > 0 && (
              <div className={styles.relsList}>
                <div className={styles.relsLabel}>Relationships</div>
                {memberRels.map(r => {
                  const otherId = r.fromMemberId === member.id ? r.toMemberId : r.fromMemberId
                  const other = members.find(m => m.id === otherId)
                  const arrow = r.isDirected
                    ? (r.fromMemberId === member.id ? '→' : '←')
                    : '↔'
                  return (
                    <div key={r.id} className={styles.relRow}>
                      <span className={styles.relArrow}>{arrow}</span>
                      <span className={styles.relName}>{other?.displayName || other?.name || '?'}</span>
                      <span className={styles.relLabel}>{r.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <button
              className={styles.profileBtn}
              onClick={() => navigate(`/members/${member.id}`)}
            >
              Open Profile →
            </button>
          </>
        )
      })()}

      {selected.type === 'group' && (() => {
        const group = groups.find(g => g.id === selected.id)
        if (!group) return null
        const groupMembers = members.filter(m => m.parentIds.includes(group.id))

        return (
          <>
            <div className={styles.colorDot} style={{ background: group.color ?? '#888' }} />
            <div className={styles.name}>{group.name}</div>
            <div className={styles.pronouns}>{group.memberCount} members</div>
            <div className={styles.memberChips}>
              {groupMembers.slice(0, 8).map(m => (
                <div key={m.id} className={styles.memberChip}>
                  <span className={styles.chipDot} style={{ background: m.color ?? '#888' }} />
                  {m.displayName || m.name}
                </div>
              ))}
              {groupMembers.length > 8 && (
                <div className={styles.memberChip}>+{groupMembers.length - 8} more</div>
              )}
            </div>
          </>
        )
      })()}
    </div>
  )
}
```

Create `src/components/Map/DetailPanel.module.css`:

```css
.panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 220px;
  background: var(--color-bg, #0d0d0d);
  border-left: 1px solid var(--color-border, #222);
  padding: 20px 16px 32px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 20;
  animation: slideIn 200ms ease-out;
  overflow-y: auto;
}

@keyframes slideIn {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}

@media (max-width: 479px) {
  .panel {
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    max-height: 50vh;
    border-left: none;
    border-top: 1px solid var(--color-border, #222);
    animation: slideUp 200ms ease-out;
  }
  @keyframes slideUp {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
}

.closeBtn {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  color: var(--color-muted, #888);
  cursor: pointer;
  font-size: 14px;
  padding: 4px;
  line-height: 1;
}

.colorDot {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  margin: 0 auto;
  flex-shrink: 0;
}

.name {
  font-family: var(--font-display, sans-serif);
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text, #fff);
  text-align: center;
}

.pronouns {
  font-size: 12px;
  color: var(--color-muted, #888);
  text-align: center;
}

.frontingBadge {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary, #b6ff00);
  text-align: center;
}

.bucketChip {
  align-self: center;
  background: var(--color-surface, #1a1a1a);
  border: 1px solid var(--color-border, #222);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 11px;
  color: var(--color-text, #fff);
  display: flex;
  gap: 4px;
  align-items: center;
}

.relsList {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.relsLabel {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--color-muted, #888);
  letter-spacing: 0.05em;
  margin-bottom: 2px;
}

.relRow {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
}

.relArrow { color: var(--color-muted, #888); flex-shrink: 0; }
.relName  { color: var(--color-text, #fff); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.relLabel { color: var(--color-muted, #888); font-size: 9px; }

.profileBtn {
  margin-top: auto;
  background: var(--color-primary, #b6ff00);
  color: #000;
  border: none;
  border-radius: var(--radius-md, 6px);
  padding: 8px 12px;
  font-family: var(--font-display, sans-serif);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  width: 100%;
}

.memberChips {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.memberChip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-text, #fff);
}

.chipDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run src/__tests__/DetailPanel.test.tsx
```

Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/Map/DetailPanel.tsx src/components/Map/DetailPanel.module.css src/__tests__/DetailPanel.test.tsx
git commit -m "feat: add DetailPanel overlay with member/group content and mobile bottom-sheet"
```

---

## Task 6: `FloatingToolbar` component

**Files:**
- Create: `src/components/Map/FloatingToolbar.tsx`
- Create: `src/components/Map/FloatingToolbar.module.css`
- Modify: `src/__tests__/MapPage.test.tsx` (append tests)

- [ ] **Step 1: Add missing imports at the top of `src/__tests__/MapPage.test.tsx`**

After the existing imports, add:
```tsx
import { FloatingToolbar } from '../components/Map/FloatingToolbar'
import type { MapMode, ViewFilter } from '../hooks/useMapLayout'
```

- [ ] **Step 2: Append toolbar tests to `src/__tests__/MapPage.test.tsx`**

```tsx

describe('FloatingToolbar', () => {
  const members = [{ id: 'm1', name: 'Mira', displayName: 'Mira' } as Member]
  const groups = [{ id: 'g1', name: 'Protectors' } as Group]

  it('renders mode chips', () => {
    render(wrap(
      <FloatingToolbar
        mode="groups" onModeChange={vi.fn()}
        viewFilter={{ type: 'all' }} onFilterChange={vi.fn()}
        members={members} groups={groups}
        onAdd={vi.fn()} onFitView={vi.fn()}
      />
    ))
    expect(screen.getByText('Groups')).toBeInTheDocument()
    expect(screen.getByText('Relationships')).toBeInTheDocument()
    expect(screen.getByText('Both')).toBeInTheDocument()
  })

  it('calls onModeChange when chip clicked', () => {
    const onModeChange = vi.fn()
    render(wrap(
      <FloatingToolbar
        mode="groups" onModeChange={onModeChange}
        viewFilter={{ type: 'all' }} onFilterChange={vi.fn()}
        members={members} groups={groups}
        onAdd={vi.fn()} onFitView={vi.fn()}
      />
    ))
    fireEvent.click(screen.getByText('Relationships'))
    expect(onModeChange).toHaveBeenCalledWith('relationships')
  })

  it('shows breadcrumb when filter is active', () => {
    render(wrap(
      <FloatingToolbar
        mode="groups" onModeChange={vi.fn()}
        viewFilter={{ type: 'member', id: 'm1', name: 'Mira' }} onFilterChange={vi.fn()}
        members={members} groups={groups}
        onAdd={vi.fn()} onFitView={vi.fn()}
      />
    ))
    expect(screen.getByText(/Mira/)).toBeInTheDocument()
  })

  it('calls onFilterChange with all when breadcrumb X clicked', () => {
    const onFilterChange = vi.fn()
    render(wrap(
      <FloatingToolbar
        mode="groups" onModeChange={vi.fn()}
        viewFilter={{ type: 'member', id: 'm1', name: 'Mira' }} onFilterChange={onFilterChange}
        members={members} groups={groups}
        onAdd={vi.fn()} onFitView={vi.fn()}
      />
    ))
    fireEvent.click(screen.getByLabelText('Clear filter'))
    expect(onFilterChange).toHaveBeenCalledWith({ type: 'all' })
  })
})
```

- [ ] **Step 3: Run — expect failure**

```bash
npx vitest run src/__tests__/MapPage.test.tsx
```

Expected: FAIL on FloatingToolbar tests.

- [ ] **Step 4: Implement `FloatingToolbar`**

Create `src/components/Map/FloatingToolbar.tsx`:

```tsx
import { useState } from 'react'
import type { Member, Group } from '../../types'
import type { MapMode, ViewFilter } from '../../hooks/useMapLayout'
import styles from './FloatingToolbar.module.css'

interface Props {
  mode: MapMode
  onModeChange: (m: MapMode) => void
  viewFilter: ViewFilter
  onFilterChange: (f: ViewFilter) => void
  members: Member[]
  groups: Group[]
  onAdd: () => void
  onFitView: () => void
}

const MODES: { id: MapMode; label: string }[] = [
  { id: 'groups', label: 'Groups' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'both', label: 'Both' },
]

export function FloatingToolbar({
  mode, onModeChange, viewFilter, onFilterChange, members, groups, onAdd, onFitView,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')

  const isFiltered = viewFilter.type !== 'all'
  const filterLabel = viewFilter.type === 'group'
    ? `${viewFilter.name}`
    : viewFilter.type === 'member'
    ? `${viewFilter.name}'s connections`
    : 'All'

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase())
  )
  const filteredMembers = members.filter(m =>
    (m.displayName || m.name).toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className={styles.toolbar}>
      {/* Viewing picker / breadcrumb */}
      <div className={styles.viewingSection}>
        {isFiltered ? (
          <div className={styles.breadcrumb}>
            <span className={styles.breadcrumbText}>{filterLabel}</span>
            <button
              className={styles.clearBtn}
              onClick={() => onFilterChange({ type: 'all' })}
              aria-label="Clear filter"
            >✕</button>
          </div>
        ) : (
          <div className={styles.viewingWrapper}>
            <button
              className={styles.viewingBtn}
              onClick={() => setPickerOpen(p => !p)}
              aria-expanded={pickerOpen}
            >
              Viewing: All ▾
            </button>
            {pickerOpen && (
              <div className={styles.picker}>
                <input
                  className={styles.pickerSearch}
                  placeholder="Search…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                  aria-label="Search groups and members"
                />
                {filteredGroups.length > 0 && (
                  <>
                    <div className={styles.pickerSection}>Groups</div>
                    {filteredGroups.map(g => (
                      <button
                        key={g.id}
                        className={styles.pickerItem}
                        onClick={() => {
                          onFilterChange({ type: 'group', id: g.id, name: g.name })
                          setPickerOpen(false)
                          setSearch('')
                        }}
                      >
                        {g.name}
                      </button>
                    ))}
                  </>
                )}
                {filteredMembers.length > 0 && (
                  <>
                    <div className={styles.pickerSection}>Members</div>
                    {filteredMembers.map(m => {
                      const name = m.displayName || m.name
                      return (
                        <button
                          key={m.id}
                          className={styles.pickerItem}
                          onClick={() => {
                            onFilterChange({ type: 'member', id: m.id, name })
                            setPickerOpen(false)
                            setSearch('')
                          }}
                        >
                          {name}
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mode chips */}
      <div className={styles.modeChips}>
        {MODES.map(({ id, label }) => (
          <button
            key={id}
            className={[styles.chip, mode === id && styles.active].filter(Boolean).join(' ')}
            onClick={() => onModeChange(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button className={styles.actionBtn} onClick={onAdd} aria-label="Add relationship">⊕</button>
        <button className={styles.actionBtn} onClick={onFitView} aria-label="Fit view">⤢</button>
      </div>
    </div>
  )
}
```

Create `src/components/Map/FloatingToolbar.module.css`:

```css
.toolbar {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 10;
  background: rgba(13, 13, 13, 0.85);
  border: 1px solid var(--color-border, #222);
  border-radius: 24px;
  padding: 6px 10px;
  backdrop-filter: blur(8px);
  white-space: nowrap;
}

.viewingSection { position: relative; }

.viewingWrapper { position: relative; }

.viewingBtn {
  background: var(--color-surface, #1a1a1a);
  border: 1px solid var(--color-border, #333);
  border-radius: 999px;
  padding: 4px 12px;
  color: var(--color-text, #fff);
  font-size: 11px;
  cursor: pointer;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  background: color-mix(in srgb, var(--color-primary, #b6ff00) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary, #b6ff00) 30%, transparent);
  border-radius: 999px;
  padding: 4px 8px 4px 12px;
}

.breadcrumbText {
  font-size: 11px;
  color: var(--color-primary, #b6ff00);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clearBtn {
  background: none;
  border: none;
  color: var(--color-muted, #888);
  cursor: pointer;
  font-size: 11px;
  padding: 0;
  line-height: 1;
}

.picker {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  background: var(--color-bg, #0d0d0d);
  border: 1px solid var(--color-border, #333);
  border-radius: 10px;
  width: 200px;
  max-height: 280px;
  overflow-y: auto;
  padding: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.6);
  z-index: 30;
}

.pickerSearch {
  width: 100%;
  background: var(--color-surface, #1a1a1a);
  border: 1px solid var(--color-border, #333);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--color-text, #fff);
  font-size: 11px;
  margin-bottom: 4px;
  box-sizing: border-box;
}

.pickerSection {
  font-size: 9px;
  text-transform: uppercase;
  color: var(--color-muted, #888);
  padding: 4px 6px 2px;
  letter-spacing: 0.05em;
}

.pickerItem {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--color-text, #fff);
  font-size: 12px;
  cursor: pointer;
}

.pickerItem:hover { background: var(--color-surface, #1a1a1a); }

.modeChips { display: flex; gap: 4px; }

.chip {
  background: none;
  border: 1px solid var(--color-border, #333);
  border-radius: 999px;
  padding: 4px 12px;
  color: var(--color-muted, #888);
  font-size: 11px;
  cursor: pointer;
  transition: background 150ms, color 150ms, border-color 150ms;
}

.chip.active {
  background: color-mix(in srgb, var(--color-primary, #b6ff00) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-primary, #b6ff00) 40%, transparent);
  color: var(--color-primary, #b6ff00);
}

.actions { display: flex; gap: 4px; }

.actionBtn {
  background: var(--color-surface, #1a1a1a);
  border: 1px solid var(--color-border, #333);
  border-radius: 8px;
  padding: 4px 8px;
  color: var(--color-muted, #888);
  font-size: 13px;
  cursor: pointer;
  line-height: 1;
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npx vitest run src/__tests__/MapPage.test.tsx
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add src/components/Map/FloatingToolbar.tsx src/components/Map/FloatingToolbar.module.css src/__tests__/MapPage.test.tsx
git commit -m "feat: add FloatingToolbar with mode chips, filter picker, and breadcrumb"
```

---

## Task 7: `MapPage` — wire everything together

**Files:**
- Modify: `src/pages/MapPage.tsx`
- Create: `src/pages/MapPage.module.css`

- [ ] **Step 1: Replace the placeholder `MapPage`**

Replace `src/pages/MapPage.tsx`:

```tsx
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  useReactFlow,
  ReactFlowProvider,
  type OnConnect,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { membersApi } from '../api/members'
import { groupsApi } from '../api/groups'
import { relationshipsApi } from '../api/relationships'
import { frontApi } from '../api/front'
import { bucketsApi } from '../api/buckets'
import { useMapLayout, type MapMode, type ViewFilter } from '../hooks/useMapLayout'
import { MemberNodeV2 } from '../components/Map/MemberNodeV2'
import { GroupNodeV2 } from '../components/Map/GroupNodeV2'
import { DetailPanel, type SelectedNode } from '../components/Map/DetailPanel'
import { FloatingToolbar } from '../components/Map/FloatingToolbar'
import { RelationshipEdge } from '../components/SystemMap/RelationshipEdge'
import { NewRelationshipSheet } from '../components/SystemMap/NewRelationshipSheet'
import type { Member } from '../types'
import styles from './MapPage.module.css'

const nodeTypes = { memberV2: MemberNodeV2, groupV2: GroupNodeV2 }
const edgeTypes = { relationship: RelationshipEdge }
const EMPTY: never[] = []

function MapCanvas() {
  const { fitView } = useReactFlow()
  const qc = useQueryClient()

  const [mode, setMode] = useState<MapMode>('both')
  const [viewFilter, setViewFilter] = useState<ViewFilter>({ type: 'all' })
  const [selected, setSelected] = useState<SelectedNode>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [connectTo, setConnectTo] = useState<string | null>(null)

  const { data: members = EMPTY }       = useQuery({ queryKey: ['members'],       queryFn: membersApi.list })
  const { data: groups = EMPTY }        = useQuery({ queryKey: ['groups'],        queryFn: groupsApi.list })
  const { data: relationships = EMPTY } = useQuery({ queryKey: ['relationships'], queryFn: relationshipsApi.list })
  const { data: front = EMPTY }         = useQuery({ queryKey: ['front-current'], queryFn: frontApi.getCurrent })
  const { data: buckets = EMPTY }       = useQuery({ queryKey: ['buckets'],       queryFn: bucketsApi.list })

  const fronterIds = useMemo(
    () => new Set((front as typeof front).map(f => f.content.member)),
    [front]
  )

  const { nodes: rfNodes, edges: rfEdges } = useMapLayout(
    members as Member[],
    groups as never,
    relationships as never,
    fronterIds,
    viewFilter,
    mode
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

  useEffect(() => { setNodes(rfNodes) }, [rfNodes, setNodes])
  useEffect(() => { setEdges(rfEdges) }, [rfEdges, setEdges])

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    if (node.id.startsWith('member-')) {
      setSelected({ type: 'member', id: node.id.replace('member-', '') })
    } else if (node.id.startsWith('group-')) {
      setSelected({ type: 'group', id: node.id.replace('group-', '') })
    }
  }, [])

  const onNodeDoubleClick: NodeMouseHandler = useCallback((_, node) => {
    const allMembers = members as Member[]
    if (node.id.startsWith('member-')) {
      const id = node.id.replace('member-', '')
      const m = allMembers.find(mem => mem.id === id)
      if (m) setViewFilter({ type: 'member', id, name: m.displayName || m.name })
    } else if (node.id.startsWith('group-')) {
      const id = node.id.replace('group-', '')
      const g = (groups as typeof groups).find((grp: { id: string; name: string }) => grp.id === id)
      if (g) setViewFilter({ type: 'group', id, name: (g as { name: string }).name })
    }
  }, [members, groups])

  const onConnect: OnConnect = useCallback((connection) => {
    if (!connection.source || !connection.target) return
    if (!connection.source.startsWith('member-') || !connection.target.startsWith('member-')) return
    const fromId = connection.source.replace('member-', '')
    const toId = connection.target.replace('member-', '')
    if (fromId !== toId) {
      setConnectFrom(fromId)
      setConnectTo(toId)
      setSheetOpen(true)
    }
  }, [])

  const fromMember = (members as Member[]).find(m => m.id === connectFrom)
  const toMember   = (members as Member[]).find(m => m.id === connectTo)

  const isEmpty = rfNodes.length === 0
  const emptyMessage = viewFilter.type !== 'all'
    ? `No connections found for ${viewFilter.name}`
    : 'No members yet — add one to get started'

  return (
    <div className={styles.canvas} onClick={e => {
      if ((e.target as HTMLElement).closest('.react-flow__node')) return
      setSelected(null)
    }}>
      <FloatingToolbar
        mode={mode}
        onModeChange={setMode}
        viewFilter={viewFilter}
        onFilterChange={setViewFilter}
        members={members as Member[]}
        groups={groups as never}
        onAdd={() => setSheetOpen(true)}
        onFitView={() => fitView({ padding: 0.2 })}
      />

      {isEmpty && (
        <div className={styles.emptyState}>
          <p>{emptyMessage}</p>
          {viewFilter.type !== 'all' && (
            <button onClick={() => setViewFilter({ type: 'all' })}>Clear filter</button>
          )}
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1a1a1a" variant={BackgroundVariant.Dots} gap={20} size={1} />
        <MiniMap
          style={{ background: '#111' }}
          maskColor="rgba(0,0,0,0.6)"
          className={styles.minimap}
        />
        <Controls className={styles.controls} showInteractive={false} />
      </ReactFlow>

      <DetailPanel
        selected={selected}
        members={members as Member[]}
        groups={groups as never}
        relationships={relationships as never}
        fronterIds={fronterIds}
        buckets={buckets as never}
        onClose={() => setSelected(null)}
      />

      {sheetOpen && fromMember && toMember && (
        <NewRelationshipSheet
          isOpen={sheetOpen}
          fromMember={{ id: fromMember.id, name: fromMember.displayName || fromMember.name }}
          toMember={{ id: toMember.id, name: toMember.displayName || toMember.name }}
          onClose={() => {
            setSheetOpen(false)
            qc.invalidateQueries({ queryKey: ['relationships'] })
          }}
        />
      )}
    </div>
  )
}

export default function MapPage() {
  return (
    <ReactFlowProvider>
      <MapCanvas />
    </ReactFlowProvider>
  )
}
```

Create `src/pages/MapPage.module.css`:

```css
.canvas {
  position: relative;
  width: 100%;
  height: calc(100dvh - 64px); /* subtract BottomNav height */
  background: var(--color-bg);
}

.minimap {
  bottom: 12px !important;
  left: 12px !important;
}

.controls {
  bottom: 12px !important;
  right: 12px !important;
}

.emptyState {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-muted);
  font-size: 14px;
  pointer-events: none;
  z-index: 5;
}

.emptyState button {
  pointer-events: all;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 4px 16px;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 12px;
}
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all existing tests pass + new tests pass. Fix any TypeScript errors:

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```

Fix any type errors reported before proceeding.

- [ ] **Step 3: Manual smoke test**

Start the dev server:
```bash
npm run dev
```

1. Navigate to `http://localhost:5173/map`
2. Verify the map renders with member nodes (colored circles, initials, names)
3. Verify group nodes appear as pills when mode is "Groups" or "Both"
4. Click a member node — detail panel should slide in from the right
5. Press Escape — panel should close
6. Double-click a member — map should filter to their connections; breadcrumb appears
7. Click ✕ on breadcrumb — returns to all members
8. Click "Viewing: All" — picker opens, search works, selecting a group filters map
9. Click "⤢ Fit" — map fits to current nodes
10. Minimap visible bottom-left, zoom controls bottom-right

- [ ] **Step 4: Commit**

```bash
git add src/pages/MapPage.tsx src/pages/MapPage.module.css
git commit -m "feat: complete MapPage with Dagre layout, focus modes, detail panel, and floating toolbar"
```

---

## Task 8: Final checks + cleanup

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass. Note the count.

- [ ] **Step 2: Run TypeScript build**

```bash
npm run build
```

Expected: `✓ built in Xs` with no TypeScript errors.

- [ ] **Step 3: Run backend tests**

```bash
cd ../../ && dotnet test --logger "console;verbosity=minimal"
```

Expected: all backend tests still pass (no backend changes in this plan).

- [ ] **Step 4: Final commit**

```bash
cd src/PluralHost.Web
git add -A
git commit -m "feat: System Map v2 — dedicated /map page, Dagre layout, focus modes, detail panel"
```
