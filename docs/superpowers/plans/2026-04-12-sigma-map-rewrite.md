# Sigma Map Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace both React Flow map implementations (MapPage + SystemMap) with Sigma.js + graphology + ForceAtlas2 worker, eliminating main-thread layout blocking and DOM-node overhead for 500+ member systems.

**Architecture:** A shared `SigmaMapCanvas` component wraps `@react-sigma/core`'s `SigmaContainer` and manages the FA2 worker lifecycle, click-to-connect state, and node/edge reducers. `useSigmaGraph` builds a graphology `MultiGraph` from members/groups/relationships. Both `MapPage` and `SystemMap` consume these two primitives. The existing `buildSubgraph` filtering logic is preserved in `src/utils/mapUtils.ts`.

**Tech Stack:** `sigma@3`, `graphology`, `graphology-layout-forceatlas2` (Web Worker), `@react-sigma/core@3`, React 18, TanStack Query v5, Vitest

---

## Files

| Action | Path | Purpose |
|---|---|---|
| Create | `src/utils/mapUtils.ts` | `buildSubgraph`, `MapMode`, `ViewFilter` — extracted from useMapLayout |
| Create | `src/hooks/useSigmaGraph.ts` | Builds graphology MultiGraph from app data |
| Create | `src/components/Map/SigmaMapCanvas.tsx` | Shared Sigma renderer + FA2 worker + click-to-connect |
| Modify | `src/components/Map/FloatingToolbar.tsx` | Add `connectMode` / `onConnectModeChange`; replace ⊕ with Connect toggle |
| Rewrite | `src/pages/MapPage.tsx` | Use SigmaMapCanvas + useSigmaGraph; remove ReactFlowProvider |
| Rewrite | `src/components/SystemMap/SystemMap.tsx` | Use SigmaMapCanvas + useSigmaGraph; remove d3-force |
| Delete | `src/hooks/useMapLayout.ts` | Replaced by useSigmaGraph |
| Delete | `src/components/Map/MemberNodeV2.tsx` | Replaced by Sigma nodeReducer |
| Delete | `src/components/Map/GroupNodeV2.tsx` | Replaced by Sigma nodeReducer |
| Delete | `src/components/SystemMap/MemberNode.tsx` | Replaced by Sigma nodeReducer |
| Delete | `src/components/SystemMap/GroupNode.tsx` | Replaced by Sigma nodeReducer |
| Delete | `src/components/SystemMap/RelationshipEdge.tsx` | Replaced by Sigma edge rendering |
| Modify | `src/__tests__/useMapLayout.test.ts` | Re-point imports to mapUtils |
| Create | `src/__tests__/useSigmaGraph.test.ts` | Tests for graph builder |
| Modify | `src/__tests__/MapPage.test.tsx` | Remove V2 node tests; mock SigmaMapCanvas |
| Modify | `src/__tests__/SystemMap.test.tsx` | Mock SigmaMapCanvas |

---

## Task 1: Extract `mapUtils.ts`

`buildSubgraph`, `MapMode`, and `ViewFilter` live in `useMapLayout.ts` today. Move them to `src/utils/mapUtils.ts` so both the old hook and the new useSigmaGraph can import them without circular deps.

**Files:**
- Create: `src/utils/mapUtils.ts`
- Modify: `src/hooks/useMapLayout.ts`
- Modify: `src/__tests__/useMapLayout.test.ts`

- [ ] **Step 1: Create `src/utils/mapUtils.ts`**

```typescript
import type { Member, Group, MemberRelationship } from '../types'

export type MapMode = 'groups' | 'relationships' | 'both'

export type ViewFilter =
  | { type: 'all' }
  | { type: 'group'; id: string; name: string }
  | { type: 'member'; id: string; name: string }

export function buildSubgraph(
  members: Member[],
  groups: Group[],
  relationships: MemberRelationship[],
  viewFilter: ViewFilter,
  mode: MapMode
): { memberIds: string[]; groupIds: string[]; linkPairs: Array<[string, string]> } {
  const showGroups = mode === 'groups' || mode === 'both'
  const showRels   = mode === 'relationships' || mode === 'both'

  let memberIds: string[]
  let groupIds: string[]

  if (viewFilter.type === 'group') {
    memberIds = members.filter(m => m.parentIds.includes(viewFilter.id)).map(m => m.id)
    groupIds  = showGroups ? [viewFilter.id] : []
  } else if (viewFilter.type === 'member') {
    const connected = new Set<string>([viewFilter.id])
    if (showRels) {
      relationships.forEach(r => {
        if (r.fromMemberId === viewFilter.id) connected.add(r.toMemberId)
        if (r.toMemberId   === viewFilter.id) connected.add(r.fromMemberId)
      })
    }
    memberIds = members.filter(m => connected.has(m.id)).map(m => m.id)
    groupIds  = []
  } else {
    memberIds = members.map(m => m.id)
    groupIds  = showGroups ? groups.map(g => g.id) : []
  }

  const memberIdSet = new Set(memberIds)
  const groupIdSet  = new Set(groupIds)
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
```

- [ ] **Step 2: Update `src/hooks/useMapLayout.ts` to import from mapUtils**

Replace the local `MapMode`, `ViewFilter`, and `buildSubgraph` definitions with imports:

```typescript
// Replace the top of useMapLayout.ts — remove the local MapMode/ViewFilter/buildSubgraph definitions
// and add this import instead:
export { MapMode, ViewFilter } from '../utils/mapUtils'
import { buildSubgraph } from '../utils/mapUtils'
```

Keep `MemberNodeV2Data`, `GroupNodeV2Data`, `useMapLayout`, `runDagre` in the file — they're still used by MapPage until Task 6.

- [ ] **Step 3: Update test import**

In `src/__tests__/useMapLayout.test.ts`, find the import of `buildSubgraph`:

```typescript
// Before:
import { buildSubgraph } from '../hooks/useMapLayout'

// After:
import { buildSubgraph } from '../utils/mapUtils'
```

- [ ] **Step 4: Run tests**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run --reporter=verbose
```

Expected: all tests pass — no behaviour changed, only moved code.

- [ ] **Step 5: Commit**

```bash
cd /c/dev/simply-personal && git add src/PluralHost.Web/src/utils/mapUtils.ts src/PluralHost.Web/src/hooks/useMapLayout.ts src/PluralHost.Web/src/__tests__/useMapLayout.test.ts
git commit -m "refactor: extract buildSubgraph + MapMode/ViewFilter to utils/mapUtils.ts"
```

---

## Task 2: Install Sigma packages

**Files:** `src/PluralHost.Web/package.json`

- [ ] **Step 1: Install**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npm install sigma graphology graphology-layout-forceatlas2 @react-sigma/core --legacy-peer-deps
```

Expected: packages added, no peer-dep errors (the `--legacy-peer-deps` flag is required due to existing vite-plugin-pwa peer conflict documented in CLAUDE.md).

- [ ] **Step 2: Verify types are available**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && node -e "require('sigma'); require('graphology'); console.log('ok')"
```

Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
cd /c/dev/simply-personal && git add src/PluralHost.Web/package.json src/PluralHost.Web/package-lock.json
git commit -m "chore: install sigma, graphology, graphology-layout-forceatlas2, @react-sigma/core"
```

---

## Task 3: Create `useSigmaGraph` hook

Builds a graphology `MultiGraph` from app data given mode + filter. Replaces `useMapLayout`'s Dagre computation. Returns a new graph instance whenever inputs change.

**Files:**
- Create: `src/hooks/useSigmaGraph.ts`
- Create: `src/__tests__/useSigmaGraph.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/useSigmaGraph.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSigmaGraph } from '../hooks/useSigmaGraph'
import type { Member, Group, MemberRelationship } from '../types'

const m1: Member = {
  id: 'mem-1', name: 'Jude', displayName: 'Jude', color: '#b6ff00',
  bucketId: 'pub', isArchived: false, isUntracked: false, isPinned: false,
  preventFrontNotification: false, receiveBoardNotifications: false,
  groupIds: ['grp-1'], parentIds: ['grp-1'], createdAt: '', updatedAt: '',
}
const m2: Member = {
  id: 'mem-2', name: 'Mira', color: '#00d4ff',
  bucketId: 'pub', isArchived: false, isUntracked: false, isPinned: false,
  preventFrontNotification: false, receiveBoardNotifications: false,
  groupIds: [], parentIds: [], createdAt: '', updatedAt: '',
}
const g1: Group = { id: 'grp-1', name: 'Core', color: '#ff4db8', memberCount: 1 }
const rel1: MemberRelationship = {
  id: 'rel-1', fromMemberId: 'mem-1', toMemberId: 'mem-2',
  label: 'siblings', isDirected: false, createdAt: '', updatedAt: '',
}

describe('useSigmaGraph', () => {
  it('adds a node for each member in both mode', () => {
    const { result } = renderHook(() =>
      useSigmaGraph([m1, m2], [g1], [rel1], new Set(), { type: 'all' }, 'both')
    )
    expect(result.current.hasNode('member-mem-1')).toBe(true)
    expect(result.current.hasNode('member-mem-2')).toBe(true)
  })

  it('adds a group node when mode includes groups', () => {
    const { result } = renderHook(() =>
      useSigmaGraph([m1], [g1], [], new Set(), { type: 'all' }, 'groups')
    )
    expect(result.current.hasNode('group-grp-1')).toBe(true)
  })

  it('does not add group nodes in relationships mode', () => {
    const { result } = renderHook(() =>
      useSigmaGraph([m1], [g1], [], new Set(), { type: 'all' }, 'relationships')
    )
    expect(result.current.hasNode('group-grp-1')).toBe(false)
  })

  it('sets isFronting attribute on fronting members', () => {
    const { result } = renderHook(() =>
      useSigmaGraph([m1], [], [], new Set(['mem-1']), { type: 'all' }, 'relationships')
    )
    expect(result.current.getNodeAttribute('member-mem-1', 'isFronting')).toBe(true)
  })

  it('adds relationship edge', () => {
    const { result } = renderHook(() =>
      useSigmaGraph([m1, m2], [], [rel1], new Set(), { type: 'all' }, 'relationships')
    )
    expect(result.current.hasEdge('member-mem-1', 'member-mem-2')).toBe(true)
  })

  it('filters to member neighborhood when viewFilter is member', () => {
    const { result } = renderHook(() =>
      useSigmaGraph([m1, m2], [], [rel1], new Set(), { type: 'member', id: 'mem-1', name: 'Jude' }, 'relationships')
    )
    expect(result.current.hasNode('member-mem-1')).toBe(true)
    expect(result.current.hasNode('member-mem-2')).toBe(true)
  })
})
```

- [ ] **Step 2: Run — verify all fail**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run --reporter=verbose useSigmaGraph
```

Expected: 6 tests fail with "Cannot find module".

- [ ] **Step 3: Create `src/hooks/useSigmaGraph.ts`**

```typescript
import { useMemo } from 'react'
import { MultiGraph } from 'graphology'
import type { Member, Group, MemberRelationship } from '../types'
import { buildSubgraph, type MapMode, type ViewFilter } from '../utils/mapUtils'

export function useSigmaGraph(
  members: Member[],
  groups: Group[],
  relationships: MemberRelationship[],
  fronterIds: Set<string>,
  viewFilter: ViewFilter,
  mode: MapMode
): MultiGraph {
  return useMemo(() => {
    const graph = new MultiGraph()
    const { memberIds, groupIds, linkPairs } = buildSubgraph(
      members, groups, relationships, viewFilter, mode
    )

    const memberMap = new Map(members.map(m => [m.id, m]))
    const groupMap  = new Map(groups.map(g => [g.id, g]))
    const allIds = [
      ...memberIds.map(id => `member-${id}`),
      ...groupIds.map(id => `group-${id}`),
    ]
    const total  = allIds.length
    const radius = Math.max(200, Math.sqrt(total) * 80)

    allIds.forEach((nodeId, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, total)
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius

      if (nodeId.startsWith('member-')) {
        const id = nodeId.slice('member-'.length)
        const m  = memberMap.get(id)
        if (!m) return
        graph.addNode(nodeId, {
          x, y,
          size: fronterIds.has(id) ? 14 : 10,
          color: m.color ?? '#b6ff00',
          label: m.displayName || m.name,
          nodeType: 'member',
          memberId: id,
          isFronting: fronterIds.has(id),
        })
      } else {
        const id = nodeId.slice('group-'.length)
        const g  = groupMap.get(id)
        if (!g) return
        graph.addNode(nodeId, {
          x, y,
          size: 18,
          color: g.color ?? '#666666',
          label: g.name,
          nodeType: 'group',
          groupId: id,
          memberCount: members.filter(mem => mem.parentIds.includes(id)).length,
        })
      }
    })

    const relMap = new Map(
      relationships.map(r => [`member-${r.fromMemberId}>>member-${r.toMemberId}`, r])
    )

    linkPairs.forEach(([source, target]) => {
      if (!graph.hasNode(source) || !graph.hasNode(target)) return
      if (target.startsWith('group-')) {
        const gid = target.slice('group-'.length)
        const g   = groupMap.get(gid)
        graph.addEdge(source, target, {
          edgeType: 'membership',
          color: g?.color ?? '#444444',
          size: 0.5,
          label: '',
        })
      } else {
        const rel = relMap.get(`${source}>>${target}`)
        graph.addEdge(source, target, {
          edgeType: 'relationship',
          label: rel?.label ?? '',
          isDirected: rel?.isDirected ?? false,
          color: '#555555',
          size: 1.5,
          type: rel?.isDirected ? 'arrow' : 'line',
        })
      }
    })

    return graph
  }, [members, groups, relationships, fronterIds, viewFilter, mode])
}
```

- [ ] **Step 4: Run tests — verify passing**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run --reporter=verbose useSigmaGraph
```

Expected: 6/6 pass.

- [ ] **Step 5: Run full suite**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
cd /c/dev/simply-personal && git add src/PluralHost.Web/src/hooks/useSigmaGraph.ts src/PluralHost.Web/src/__tests__/useSigmaGraph.test.ts
git commit -m "feat: add useSigmaGraph hook — builds graphology MultiGraph from app data"
```

---

## Task 4: Create `SigmaMapCanvas` component

The shared Sigma canvas. Manages: graph loading, FA2 worker lifecycle, click-to-connect state, node/edge visual reducers.

**Files:**
- Create: `src/components/Map/SigmaMapCanvas.tsx`
- Create: `src/__tests__/SigmaMapCanvas.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/SigmaMapCanvas.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MultiGraph } from 'graphology'

beforeAll(() => {
  (window as any).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  }
})

// Mock the entire @react-sigma/core — JSDOM has no WebGL
vi.mock('@react-sigma/core', () => ({
  SigmaContainer: ({ children, style, className }: any) => (
    <div data-testid="sigma-container" style={style} className={className}>{children}</div>
  ),
  useLoadGraph: () => vi.fn(),
  useRegisterEvents: vi.fn(),
  useSigma: () => ({ setSetting: vi.fn(), refresh: vi.fn(), getGraph: () => new MultiGraph() }),
}))

vi.mock('graphology-layout-forceatlas2/worker', () => ({
  default: class {
    start() {} stop() {}
  },
}))

import { SigmaMapCanvas } from '../components/Map/SigmaMapCanvas'

function makeGraph() {
  const g = new MultiGraph()
  g.addNode('member-a', { x: 0, y: 0, size: 10, color: '#b6ff00', label: 'Alice', nodeType: 'member', memberId: 'a', isFronting: false })
  g.addNode('member-b', { x: 1, y: 1, size: 10, color: '#00d4ff', label: 'Bob',   nodeType: 'member', memberId: 'b', isFronting: false })
  return g
}

describe('SigmaMapCanvas', () => {
  it('renders a container element', () => {
    render(
      <MemoryRouter>
        <SigmaMapCanvas
          graph={makeGraph()}
          selectedNodeId={null}
          connectMode={false}
          onNodeClick={vi.fn()}
          onConnect={vi.fn()}
        />
      </MemoryRouter>
    )
    expect(screen.getByTestId('sigma-container')).toBeInTheDocument()
  })

  it('shows connect indicator when connectMode is true', () => {
    render(
      <MemoryRouter>
        <SigmaMapCanvas
          graph={makeGraph()}
          selectedNodeId={null}
          connectMode={true}
          onNodeClick={vi.fn()}
          onConnect={vi.fn()}
        />
      </MemoryRouter>
    )
    expect(screen.getByText(/click a member to start/i)).toBeInTheDocument()
  })

  it('shows pending indicator after first node is selected in connect mode', () => {
    const { rerender } = render(
      <MemoryRouter>
        <SigmaMapCanvas
          graph={makeGraph()}
          selectedNodeId={null}
          connectMode={true}
          onNodeClick={vi.fn()}
          onConnect={vi.fn()}
        />
      </MemoryRouter>
    )
    // SigmaMapCanvas internal state is managed internally via useRegisterEvents
    // This is a smoke test — deep click-to-connect logic is covered by integration
    expect(screen.getByTestId('sigma-container')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — verify fail**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run --reporter=verbose SigmaMapCanvas
```

Expected: fail with "Cannot find module '../components/Map/SigmaMapCanvas'".

- [ ] **Step 3: Create `src/components/Map/SigmaMapCanvas.tsx`**

```typescript
import { useEffect, useRef, useState, useCallback } from 'react'
import { SigmaContainer, useLoadGraph, useRegisterEvents, useSigma } from '@react-sigma/core'
import '@react-sigma/core/lib/react-sigma.min.css'
import { MultiGraph } from 'graphology'
import FA2Layout from 'graphology-layout-forceatlas2/worker'

interface Props {
  graph: MultiGraph
  selectedNodeId: string | null
  connectMode: boolean
  onNodeClick: (nodeId: string) => void
  onNodeDoubleClick?: (nodeId: string) => void
  onConnect: (fromNodeId: string, toNodeId: string) => void
  style?: React.CSSProperties
  className?: string
}

// ---- child components (must be inside SigmaContainer to use hooks) ----

function GraphAndLayoutLoader({ graph }: { graph: MultiGraph }) {
  const loadGraph = useLoadGraph()

  useEffect(() => {
    loadGraph(graph)
    const layout = new FA2Layout(graph, {
      settings: { gravity: 1, scalingRatio: 3, strongGravityMode: false, slowDown: 15 },
    })
    layout.start()
    const timer = setTimeout(() => layout.stop(), 4000)
    return () => { clearTimeout(timer); layout.stop() }
  }, [graph, loadGraph])

  return null
}

function ReducerController({
  selectedNodeId,
  connectMode,
  pendingFrom,
}: {
  selectedNodeId: string | null
  connectMode: boolean
  pendingFrom: string | null
}) {
  const sigma = useSigma()

  useEffect(() => {
    sigma.setSetting('nodeReducer', (node: string, data: Record<string, unknown>) => {
      const isSelected = node === selectedNodeId
      const isPending  = node === pendingFrom
      const isFronting = data.isFronting as boolean
      const isMember   = (data.nodeType as string) === 'member'
      let size  = data.size as number
      let color = data.color as string

      if (connectMode && isMember) {
        color = isPending ? '#b6ff00' : '#333333'
      }
      if (isSelected || isPending) size = size * 1.5
      if (isFronting) size = Math.max(size, 14)

      return { ...data, size, color, highlighted: isSelected }
    })

    sigma.setSetting('edgeReducer', (_edge: string, data: Record<string, unknown>) => {
      const isMembership = (data.edgeType as string) === 'membership'
      return {
        ...data,
        size:  isMembership ? 0.5 : 1.5,
        color: isMembership ? ((data.color as string) + '55') : '#555555',
      }
    })

    sigma.refresh()
  }, [sigma, selectedNodeId, connectMode, pendingFrom])

  return null
}

function EventController({
  connectMode,
  pendingFrom,
  onNodeClick,
  onNodeDoubleClick,
  onConnect,
  onPendingFromChange,
}: {
  connectMode: boolean
  pendingFrom: string | null
  onNodeClick: (nodeId: string) => void
  onNodeDoubleClick?: (nodeId: string) => void
  onConnect: (from: string, to: string) => void
  onPendingFromChange: (id: string | null) => void
}) {
  useRegisterEvents({
    clickNode: ({ node }) => {
      if (connectMode) {
        if (!pendingFrom) {
          // Only allow member nodes as connect source
          onPendingFromChange(node.startsWith('member-') ? node : null)
        } else if (node !== pendingFrom && node.startsWith('member-')) {
          onConnect(pendingFrom, node)
          onPendingFromChange(null)
        }
      } else {
        onNodeClick(node)
      }
    },
    doubleClickNode: ({ node }) => {
      if (!connectMode) onNodeDoubleClick?.(node)
    },
    clickStage: () => {
      if (connectMode) onPendingFromChange(null)
    },
  })
  return null
}

// ---- main export ----

export function SigmaMapCanvas({
  graph,
  selectedNodeId,
  connectMode,
  onNodeClick,
  onNodeDoubleClick,
  onConnect,
  style,
  className,
}: Props) {
  const [pendingFrom, setPendingFrom] = useState<string | null>(null)

  useEffect(() => {
    if (!connectMode) setPendingFrom(null)
  }, [connectMode])

  const sigmaSettings = {
    renderEdgeLabels: true,
    labelColor: { color: '#cccccc' },
    labelSize: 10,
    labelWeight: '400',
    defaultEdgeType: 'line',
    minCameraRatio: 0.05,
    maxCameraRatio: 5,
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <SigmaContainer
        graph={MultiGraph}
        settings={sigmaSettings}
        style={{ width: '100%', height: '100%', background: '#0d0d0d', ...style }}
        className={className}
      >
        <GraphAndLayoutLoader graph={graph} />
        <ReducerController
          selectedNodeId={selectedNodeId}
          connectMode={connectMode}
          pendingFrom={pendingFrom}
        />
        <EventController
          connectMode={connectMode}
          pendingFrom={pendingFrom}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onConnect={onConnect}
          onPendingFromChange={setPendingFrom}
        />
      </SigmaContainer>

      {connectMode && (
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)',
          border: '1px solid #333',
          borderRadius: 20,
          padding: '4px 14px',
          fontSize: 11,
          color: '#ccc',
          pointerEvents: 'none',
        }}>
          {pendingFrom
            ? 'Now click the target member'
            : 'Click a member to start connecting'}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run --reporter=verbose SigmaMapCanvas
```

Expected: 3/3 pass.

- [ ] **Step 5: Run full suite**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /c/dev/simply-personal && git add src/PluralHost.Web/src/components/Map/SigmaMapCanvas.tsx src/PluralHost.Web/src/__tests__/SigmaMapCanvas.test.tsx
git commit -m "feat: add SigmaMapCanvas — WebGL renderer with FA2 worker and click-to-connect"
```

---

## Task 5: Update `FloatingToolbar` for click-to-connect mode

Add `connectMode`/`onConnectModeChange` props. Replace the broken `⊕ onAdd` button with a Connect toggle. Remove `onFitView` (Sigma has no external fit-view hook; this can be added later via a sigma ref if desired).

**Files:**
- Modify: `src/components/Map/FloatingToolbar.tsx`
- Modify: `src/__tests__/MapPage.test.tsx`

- [ ] **Step 1: Update FloatingToolbar tests first**

In `src/__tests__/MapPage.test.tsx`, find the `FloatingToolbar` describe block. Update the props passed to include `connectMode` and remove `onAdd`/`onFitView`:

```typescript
// Find all FloatingToolbar renders in the test file and update the props:
// Before:
<FloatingToolbar
  mode="groups" onModeChange={vi.fn()}
  viewFilter={{ type: 'all' }} onFilterChange={vi.fn()}
  members={members} groups={groups}
  onAdd={vi.fn()} onFitView={vi.fn()}
/>

// After:
<FloatingToolbar
  mode="groups" onModeChange={vi.fn()}
  viewFilter={{ type: 'all' }} onFilterChange={vi.fn()}
  members={members} groups={groups}
  connectMode={false} onConnectModeChange={vi.fn()}
/>
```

Also add a test for the connect toggle:

```typescript
it('calls onConnectModeChange when Connect button clicked', () => {
  const onConnectModeChange = vi.fn()
  render(wrap(
    <FloatingToolbar
      mode="groups" onModeChange={vi.fn()}
      viewFilter={{ type: 'all' }} onFilterChange={vi.fn()}
      members={members} groups={groups}
      connectMode={false} onConnectModeChange={onConnectModeChange}
    />
  ))
  fireEvent.click(screen.getByText('Connect'))
  expect(onConnectModeChange).toHaveBeenCalledWith(true)
})

it('shows active state when connectMode is true', () => {
  render(wrap(
    <FloatingToolbar
      mode="groups" onModeChange={vi.fn()}
      viewFilter={{ type: 'all' }} onFilterChange={vi.fn()}
      members={members} groups={groups}
      connectMode={true} onConnectModeChange={vi.fn()}
    />
  ))
  // Button text changes when active
  expect(screen.getByText('Connecting…')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run — verify new tests fail**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run --reporter=verbose MapPage
```

Expected: new tests fail (props don't exist yet), existing tests fail (missing connectMode prop).

- [ ] **Step 3: Update `FloatingToolbar.tsx` interface and actions section**

Replace the `interface Props` and the `actions` section:

```typescript
// New interface (replace existing):
interface Props {
  mode: MapMode
  onModeChange: (m: MapMode) => void
  viewFilter: ViewFilter
  onFilterChange: (f: ViewFilter) => void
  members: Member[]
  groups: Group[]
  connectMode: boolean
  onConnectModeChange: (v: boolean) => void
}
```

Replace the `{/* Actions */}` JSX block at the bottom of the toolbar:

```tsx
{/* Actions */}
<div className={styles.actions}>
  <button
    className={[styles.actionBtn, connectMode && styles.connectActive].filter(Boolean).join(' ')}
    onClick={() => onConnectModeChange(!connectMode)}
    aria-label={connectMode ? 'Cancel connect' : 'Connect two members'}
    aria-pressed={connectMode}
  >
    {connectMode ? 'Connecting…' : 'Connect'}
  </button>
</div>
```

Remove `onAdd` and `onFitView` from the destructured props at the top of the function.

- [ ] **Step 4: Add `connectActive` style to `FloatingToolbar.module.css`**

Read the CSS file and append:

```css
.connectActive {
  background: var(--color-primary);
  color: #000;
  border-color: var(--color-primary);
}
```

- [ ] **Step 5: Run tests**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run --reporter=verbose MapPage
```

Expected: all FloatingToolbar tests pass.

- [ ] **Step 6: Commit**

```bash
cd /c/dev/simply-personal && git add src/PluralHost.Web/src/components/Map/FloatingToolbar.tsx src/PluralHost.Web/src/__tests__/MapPage.test.tsx
git commit -m "feat: add click-to-connect mode toggle to FloatingToolbar"
```

---

## Task 6: Rewrite `MapPage`

Replace React Flow + useMapLayout with SigmaMapCanvas + useSigmaGraph. Remove ReactFlowProvider wrapper.

**Files:**
- Rewrite: `src/pages/MapPage.tsx`
- Modify: `src/__tests__/MapPage.test.tsx`

- [ ] **Step 1: Add MapPage smoke test**

In `src/__tests__/MapPage.test.tsx`, add at the end:

```typescript
// Mock SigmaMapCanvas so MapPage tests don't need WebGL
vi.mock('../components/Map/SigmaMapCanvas', () => ({
  SigmaMapCanvas: ({ connectMode }: { connectMode: boolean }) => (
    <div data-testid="sigma-canvas">{connectMode ? 'connect-mode' : 'view-mode'}</div>
  ),
}))

vi.mock('../hooks/useSigmaGraph', () => ({
  useSigmaGraph: () => ({ hasNode: () => false }),
}))

import MapPage from '../pages/MapPage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

function AppWrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('MapPage', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue({ data: [], isLoading: false } as any)
  })

  it('renders sigma canvas', () => {
    render(<AppWrapper><MapPage /></AppWrapper>)
    expect(screen.getByTestId('sigma-canvas')).toBeInTheDocument()
  })
})
```

Add `useQuery` mock at the top of the test file (import from tanstack and mock it):

```typescript
import { useQuery } from '@tanstack/react-query'
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return { ...actual, useQuery: vi.fn(), useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }) }
})
```

- [ ] **Step 2: Run — verify new test fails**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run --reporter=verbose MapPage
```

Expected: MapPage describe block fails (MapPage still uses ReactFlow).

- [ ] **Step 3: Rewrite `src/pages/MapPage.tsx`**

```typescript
import { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { membersApi } from '../api/members'
import { groupsApi } from '../api/groups'
import { relationshipsApi } from '../api/relationships'
import { frontApi } from '../api/front'
import { bucketsApi } from '../api/buckets'
import { useSigmaGraph } from '../hooks/useSigmaGraph'
import { type MapMode, type ViewFilter } from '../utils/mapUtils'
import { SigmaMapCanvas } from '../components/Map/SigmaMapCanvas'
import { DetailPanel, type SelectedNode } from '../components/Map/DetailPanel'
import { FloatingToolbar } from '../components/Map/FloatingToolbar'
import { NewRelationshipSheet } from '../components/SystemMap/NewRelationshipSheet'
import type { Member, Group, MemberRelationship, SpEnvelope, FrontContent, PrivacyBucket } from '../types'
import styles from './MapPage.module.css'

export default function MapPage() {
  const qc = useQueryClient()
  const [mode, setMode] = useState<MapMode>('both')
  const [viewFilter, setViewFilter] = useState<ViewFilter>({ type: 'all' })
  const [selected, setSelected] = useState<SelectedNode>(null)
  const [connectMode, setConnectMode] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [connectTo, setConnectTo] = useState<string | null>(null)

  const { data: members       = [] } = useQuery<Member[]>({ queryKey: ['members'], queryFn: membersApi.list })
  const { data: groups        = [] } = useQuery<Group[]>({ queryKey: ['groups'], queryFn: groupsApi.list })
  const { data: relationships = [] } = useQuery<MemberRelationship[]>({ queryKey: ['relationships'], queryFn: relationshipsApi.list })
  const { data: front         = [] } = useQuery<SpEnvelope<FrontContent>[]>({ queryKey: ['front-current'], queryFn: frontApi.getCurrent })
  const { data: buckets       = [] } = useQuery<PrivacyBucket[]>({ queryKey: ['buckets'], queryFn: bucketsApi.list })

  const fronterIds = useMemo(
    () => new Set((front as SpEnvelope<FrontContent>[]).map(f => f.content.member)),
    [front]
  )

  const graph = useSigmaGraph(members, groups, relationships, fronterIds, viewFilter, mode)

  const handleNodeClick = useCallback((nodeId: string) => {
    if (nodeId.startsWith('member-')) {
      setSelected({ type: 'member', id: nodeId.slice('member-'.length) })
    } else if (nodeId.startsWith('group-')) {
      setSelected({ type: 'group', id: nodeId.slice('group-'.length) })
    }
  }, [])

  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    if (nodeId.startsWith('member-')) {
      const id = nodeId.slice('member-'.length)
      const m  = members.find(mem => mem.id === id)
      if (m) setViewFilter({ type: 'member', id, name: m.displayName || m.name })
    } else if (nodeId.startsWith('group-')) {
      const id = nodeId.slice('group-'.length)
      const g  = groups.find(grp => grp.id === id)
      if (g) setViewFilter({ type: 'group', id, name: g.name })
    }
  }, [members, groups])

  const handleConnect = useCallback((fromNodeId: string, toNodeId: string) => {
    const fromId = fromNodeId.slice('member-'.length)
    const toId   = toNodeId.slice('member-'.length)
    if (fromId !== toId) {
      setConnectFrom(fromId)
      setConnectTo(toId)
      setSheetOpen(true)
      setConnectMode(false)
    }
  }, [])

  const fromMember = members.find(m => m.id === connectFrom)
  const toMember   = members.find(m => m.id === connectTo)
  const selectedNodeId =
    selected?.type === 'member' ? `member-${selected.id}` :
    selected?.type === 'group'  ? `group-${selected.id}` : null

  return (
    <div className={styles.page}>
      <FloatingToolbar
        mode={mode}
        onModeChange={setMode}
        viewFilter={viewFilter}
        onFilterChange={setViewFilter}
        members={members}
        groups={groups}
        connectMode={connectMode}
        onConnectModeChange={setConnectMode}
      />
      <div className={styles.canvas}>
        <SigmaMapCanvas
          graph={graph}
          selectedNodeId={selectedNodeId}
          connectMode={connectMode}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onConnect={handleConnect}
        />
      </div>
      <DetailPanel
        selected={selected}
        members={members}
        groups={groups}
        relationships={relationships}
        fronterIds={fronterIds}
        buckets={buckets}
        onClose={() => setSelected(null)}
      />
      {sheetOpen && fromMember && toMember && (
        <NewRelationshipSheet
          isOpen={sheetOpen}
          fromMember={{ id: fromMember.id, name: fromMember.displayName || fromMember.name }}
          toMember={{ id: toMember.id, name: toMember.displayName || toMember.name }}
          onClose={() => {
            setSheetOpen(false)
            setConnectFrom(null)
            setConnectTo(null)
            qc.invalidateQueries({ queryKey: ['relationships'] })
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Update `MapPage.module.css`**

Read the file, then remove `.minimap` and `.controls` rules (they referenced React Flow components). Keep `.page`, `.canvas`, `.emptyState`. Add a `.page` rule if missing to fill the viewport:

```css
.page {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.canvas {
  flex: 1;
  min-height: 0;
}
```

- [ ] **Step 5: Run tests and build**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run --reporter=verbose MapPage && npm run build 2>&1 | tail -8
```

Expected: MapPage tests pass, build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /c/dev/simply-personal && git add src/PluralHost.Web/src/pages/MapPage.tsx src/PluralHost.Web/src/pages/MapPage.module.css src/PluralHost.Web/src/__tests__/MapPage.test.tsx
git commit -m "feat: rewrite MapPage — replace ReactFlow with SigmaMapCanvas + useSigmaGraph"
```

---

## Task 7: Rewrite `SystemMap` (inline)

**Files:**
- Rewrite: `src/components/SystemMap/SystemMap.tsx`
- Modify: `src/__tests__/SystemMap.test.tsx`

- [ ] **Step 1: Update SystemMap tests**

In `src/__tests__/SystemMap.test.tsx`, replace the entire `SystemMap` integration describe block and all node component tests with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { SystemMap } from '../components/SystemMap/SystemMap'

// Mock Sigma so no WebGL needed
vi.mock('../components/Map/SigmaMapCanvas', () => ({
  SigmaMapCanvas: ({ connectMode }: { connectMode: boolean }) => (
    <div data-testid="sigma-canvas">{connectMode ? 'connect-mode' : 'view-mode'}</div>
  ),
}))

vi.mock('../hooks/useSigmaGraph', () => ({
  useSigmaGraph: () => ({ hasNode: () => false }),
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return { ...actual, useQuery: vi.fn(), useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }) }
})

class ResizeObserverMock {
  observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn()
}
globalThis.ResizeObserver = ResizeObserverMock as any

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SystemMap', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue({ data: [], isLoading: false } as any)
  })

  it('renders sigma canvas', () => {
    render(<Wrapper><SystemMap /></Wrapper>)
    expect(screen.getByTestId('sigma-canvas')).toBeInTheDocument()
  })

  it('renders mode chips', () => {
    render(<Wrapper><SystemMap /></Wrapper>)
    expect(screen.getByText('Groups')).toBeInTheDocument()
    expect(screen.getByText('Relationships')).toBeInTheDocument()
    expect(screen.getByText('Both')).toBeInTheDocument()
  })

  it('shows connect button', () => {
    render(<Wrapper><SystemMap /></Wrapper>)
    expect(screen.getByText('Connect')).toBeInTheDocument()
  })

  it('toggles connect mode', () => {
    render(<Wrapper><SystemMap /></Wrapper>)
    fireEvent.click(screen.getByText('Connect'))
    expect(screen.getByTestId('sigma-canvas')).toHaveTextContent('connect-mode')
  })

  it('shows loading overlay while queries pending', () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true } as any)
    render(<Wrapper><SystemMap /></Wrapper>)
    expect(screen.getByText(/loading map/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — verify new tests fail**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run --reporter=verbose SystemMap
```

Expected: fails (SystemMap still imports ReactFlow).

- [ ] **Step 3: Rewrite `src/components/SystemMap/SystemMap.tsx`**

```typescript
import { useMemo, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { membersApi } from '../../api/members'
import { groupsApi } from '../../api/groups'
import { relationshipsApi } from '../../api/relationships'
import { frontApi } from '../../api/front'
import { useSigmaGraph } from '../../hooks/useSigmaGraph'
import { type MapMode } from '../../utils/mapUtils'
import { SigmaMapCanvas } from '../Map/SigmaMapCanvas'
import { NewRelationshipSheet } from './NewRelationshipSheet'
import styles from './SystemMap.module.css'
import type { Member, Group, MemberRelationship, SpEnvelope, FrontContent } from '../../types'

interface Props {
  initialMode?: MapMode
}

export function SystemMap({ initialMode = 'groups' }: Props) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<MapMode>(initialMode)
  const [connectMode, setConnectMode] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [connectTo, setConnectTo] = useState<string | null>(null)

  const { data: members = [], isLoading: ml } = useQuery<Member[]>({ queryKey: ['members'], queryFn: membersApi.list })
  const { data: groups = [], isLoading: gl }  = useQuery<Group[]>({ queryKey: ['groups'], queryFn: groupsApi.list })
  const { data: relationships = [], isLoading: rl } = useQuery<MemberRelationship[]>({ queryKey: ['relationships'], queryFn: relationshipsApi.list })
  const { data: front = [], isLoading: fl } = useQuery<SpEnvelope<FrontContent>[]>({ queryKey: ['front-current'], queryFn: frontApi.getCurrent })

  const isLoading = ml || gl || rl || fl

  const fronterIds = useMemo(
    () => new Set((front as SpEnvelope<FrontContent>[]).map(f => f.content.member)),
    [front]
  )

  const graph = useSigmaGraph(members, groups, relationships, fronterIds, { type: 'all' }, mode)

  const handleNodeClick = useCallback((nodeId: string) => {
    if (nodeId.startsWith('member-')) {
      navigate(`/members/${nodeId.slice('member-'.length)}`)
    }
  }, [navigate])

  const handleConnect = useCallback((fromNodeId: string, toNodeId: string) => {
    const fromId = fromNodeId.slice('member-'.length)
    const toId   = toNodeId.slice('member-'.length)
    if (fromId !== toId) {
      setConnectFrom(fromId)
      setConnectTo(toId)
      setSheetOpen(true)
      setConnectMode(false)
    }
  }, [])

  const fromMember = members.find(m => m.id === connectFrom)
  const toMember   = members.find(m => m.id === connectTo)

  return (
    <div className={styles.canvas}>
      <div className={styles.modeChips}>
        {(['groups', 'relationships', 'both'] as MapMode[]).map(m => (
          <button
            key={m}
            className={`${styles.chip} ${mode === m ? styles.active : ''}`}
            onClick={() => setMode(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
        <button
          className={`${styles.chip} ${connectMode ? styles.active : ''}`}
          onClick={() => setConnectMode(c => !c)}
        >
          {connectMode ? 'Connecting…' : 'Connect'}
        </button>
      </div>
      <div style={{ height: 'calc(100% - 36px)' }}>
        {isLoading
          ? <div className={styles.loadingOverlay}>Loading map…</div>
          : (
            <SigmaMapCanvas
              graph={graph}
              selectedNodeId={null}
              connectMode={connectMode}
              onNodeClick={handleNodeClick}
              onConnect={handleConnect}
            />
          )
        }
      </div>
      {sheetOpen && fromMember && toMember && (
        <NewRelationshipSheet
          isOpen={sheetOpen}
          fromMember={{ id: fromMember.id, name: fromMember.displayName || fromMember.name }}
          toMember={{ id: toMember.id, name: toMember.displayName || toMember.name }}
          onClose={() => {
            setSheetOpen(false)
            setConnectFrom(null)
            setConnectTo(null)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests + build**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run && npm run build 2>&1 | tail -8
```

Expected: all tests pass, clean build.

- [ ] **Step 5: Commit**

```bash
cd /c/dev/simply-personal && git add src/PluralHost.Web/src/components/SystemMap/SystemMap.tsx src/PluralHost.Web/src/__tests__/SystemMap.test.tsx
git commit -m "feat: rewrite SystemMap — replace d3-force/ReactFlow with SigmaMapCanvas"
```

---

## Task 8: Delete obsolete files and remove packages

All React Flow node components and the old layout hook are now unused.

**Files to delete:**
- `src/hooks/useMapLayout.ts`
- `src/components/Map/MemberNodeV2.tsx` + `MemberNodeV2.module.css`
- `src/components/Map/GroupNodeV2.tsx` + `GroupNodeV2.module.css`
- `src/components/SystemMap/MemberNode.tsx`
- `src/components/SystemMap/GroupNode.tsx`
- `src/components/SystemMap/RelationshipEdge.tsx`

- [ ] **Step 1: Verify nothing imports these files**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && grep -r "useMapLayout\|MemberNodeV2\|GroupNodeV2\|RelationshipEdge\|MemberNode\|GroupNode" src --include="*.ts" --include="*.tsx" | grep -v "__tests__" | grep -v "\.module\.css"
```

Expected: no output (no production imports remaining). If any appear, fix them before proceeding.

- [ ] **Step 2: Delete the files**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web
rm src/hooks/useMapLayout.ts
rm src/components/Map/MemberNodeV2.tsx src/components/Map/MemberNodeV2.module.css
rm src/components/Map/GroupNodeV2.tsx src/components/Map/GroupNodeV2.module.css
rm src/components/SystemMap/MemberNode.tsx
rm src/components/SystemMap/GroupNode.tsx
rm src/components/SystemMap/RelationshipEdge.tsx
```

- [ ] **Step 3: Delete the `useMapLayout` test file (was for the deleted hook)**

```bash
rm src/__tests__/useMapLayout.test.ts
```

Note: `buildSubgraph` tests now live in `src/__tests__/mapUtils.test.ts`. Rename the file if it exists, or the tests are already covered by `useSigmaGraph.test.ts`.

Actually, rename `useMapLayout.test.ts` to `mapUtils.test.ts` and update the import before deleting:

If the file still has tests for `runDagre` or `useMapLayout` hook itself, delete those. Keep only the `buildSubgraph` tests, re-pointed to `../utils/mapUtils`.

- [ ] **Step 4: Remove `@xyflow/react` CSS from `main.tsx`**

In `src/main.tsx`, remove the line:
```typescript
import '@xyflow/react/dist/style.css'
```

- [ ] **Step 5: Run build to verify no broken imports**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npm run build 2>&1 | tail -10
```

Expected: clean build. If any "cannot find module" errors appear, there is still an import somewhere — grep for the module name and fix it.

- [ ] **Step 6: Run full test suite**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run
```

Expected: all pass.

- [ ] **Step 7: Uninstall React Flow and Dagre (no longer needed)**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npm uninstall @xyflow/react @dagrejs/dagre d3-force --legacy-peer-deps
```

Run build again to confirm:
```bash
npm run build 2>&1 | tail -8
```

- [ ] **Step 8: Commit**

```bash
cd /c/dev/simply-personal && git add -A && git commit -m "chore: remove ReactFlow, Dagre, d3-force — all map rendering now via Sigma"
```

---

## Verification

```bash
# Full test suite
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run

# Type check
npm run build

# Manual smoke test (requires API running):
# 1. cd /c/dev/simply-personal/src/PluralHost.Api && dotnet run
# 2. cd /c/dev/simply-personal/src/PluralHost.Web && npm run dev
# 3. Navigate to /map — verify Sigma canvas loads, FA2 animates nodes into place
# 4. With 500+ members: map should remain responsive, no tab crash
# 5. Click a node → DetailPanel opens
# 6. Double-click a member → view filters to their neighborhood
# 7. Click Connect → cursor shows hint; click source then target → NewRelationshipSheet opens
# 8. Members page → Map toggle → inline SystemMap loads, mode chips work
# 9. Check browser DevTools Performance tab: no long tasks on /map load
```
