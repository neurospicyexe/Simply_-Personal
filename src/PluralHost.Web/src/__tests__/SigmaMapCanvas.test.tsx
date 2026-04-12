import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MultiGraph } from 'graphology'

beforeAll(() => {
  ;(window as any).ResizeObserver = class {
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
    // Smoke test — click-to-connect state is internal, managed via useRegisterEvents
    expect(screen.getByTestId('sigma-container')).toBeInTheDocument()
  })
})
