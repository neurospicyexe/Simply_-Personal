# 24h Front Heatmap Design Spec

**Date:** 2026-03-28

---

## Goal

Visualize who has been fronting over the last 24 hours (and optionally 7 or 30 days) using a swimlane timeline. Two views: a compact strip on FrontPage for at-a-glance history, and a full tab on LogsPage for deeper exploration.

---

## Architecture

### Backend

**Modified:**
- `GET /api/front/history` — add optional `?from=` and `?to=` ISO 8601 query params for date-range filtering. When absent, existing behavior is unchanged (returns all history). When present, filters `FrontStart >= from && (FrontEnd == null || FrontEnd <= to)`.

No new endpoints. No migrations.

### Frontend

**New files:**
- `src/PluralHost.Web/src/components/HeatmapStrip.tsx` — compact 5-row strip for FrontPage
- `src/PluralHost.Web/src/components/HeatmapStrip.module.css`
- `src/PluralHost.Web/src/components/FrontHeatmap.tsx` — full heatmap with time-range toggle for LogsPage
- `src/PluralHost.Web/src/components/FrontHeatmap.module.css`

**Modified:**
- `src/PluralHost.Web/src/api/front.ts` — add `from`/`to` params to `getFrontHistory`
- `src/PluralHost.Web/src/pages/FrontPage.tsx` — add `HeatmapStrip` below current fronters
- `src/PluralHost.Web/src/pages/FrontPage.module.css` — strip container styles
- `src/PluralHost.Web/src/pages/LogsPage.tsx` — add "Heatmap" third tab; render `FrontHeatmap`
- `src/PluralHost.Web/src/pages/LogsPage.module.css` — tab and toggle styles

---

## API Changes

### `GET /api/front/history`

New optional query params:

| Param | Type | Description |
|---|---|---|
| `from` | ISO 8601 string | Start of window (inclusive) |
| `to` | ISO 8601 string | End of window (inclusive for ongoing entries) |

When `to` is provided, entries where `FrontEnd == null` (currently fronting) are included — they extend to "now".

Response shape unchanged: array of `{ id, memberId, frontStart, frontEnd }`.

---

## Components

### `HeatmapStrip`

**Location:** `FrontPage.tsx`, below the current fronters cards.

**Behavior:**
- Fixed 24h window (`now - 24h` to `now`)
- Shows top 5 members sorted by total front time in the window (descending)
- Each row: colored circle dot (member color) + swimlane bar
- Swimlane bar: translucent fill (`memberColor` at 13% opacity) + solid 2px bottom bar (full member color)
- Time axis: labels at -24h, -18h, -12h, -6h, now
- "Full view →" link (lime, top-right of section heading) — navigates to `/logs?tab=heatmap`
- Section heading: "Last 24h" (small uppercase label, same style as other FrontPage labels)
- Read-only — no tap interaction on bars

**Data:**
- Fetches `GET /api/front/history?from=<now-24h>&to=<now>` + `GET /api/members` (for colors)
- Uses TanStack Query; refetches on the same 30s interval as the front page

**Position math:**
```
left  = (spanStart - windowStart) / windowMs * 100
width = Math.min((spanEnd - spanStart) / windowMs * 100, 100 - left)
```
Where `spanEnd` = `frontEnd ?? now` for ongoing entries.

---

### `FrontHeatmap`

**Location:** LogsPage — third tab "Heatmap" alongside Journal and Front History.

**Behavior:**
- Time-range toggle: **24h** / **7d** / **30d** — pill buttons, active = lime fill, inactive = dark background
- Default: 24h
- Shows all members who fronted in the selected window (at least one span overlaps the window)
- Members with no activity shown dimmed (40% opacity, no bars) at the bottom of the list
- Rows sorted: active members by total front time desc, then inactive members alpha by name
- Each row: 16px color dot + swimlane bar (same visual as HeatmapStrip but taller — 16px)
- Time axis labels adapt to window: 24h → every 6h; 7d → every day label; 30d → every 5d label
- Read-only

**Data:**
- Fetches `GET /api/front/history?from=<windowStart>&to=<now>` + `GET /api/members`
- Re-fetches when time range toggle changes
- Loading state: skeleton rows (same count as last render, or 5 if first load)

---

## Visual Design

**Swimlane bar anatomy:**
```
┌─────────────────────────────────────────────────────┐  ← track (background: #1a1a1a)
│                  ░░░░░░░░░░░░░░░░░░░                │  ← tint fill (color @ 13% opacity)
│                  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬                  │  ← solid bottom bar (2–3px, full color)
└─────────────────────────────────────────────────────┘
```

**Row gap:** 3px (compact) / 5px (full)
**Row height:** 12px (compact) / 16px (full)
**Dot size:** 14px (compact) / 16px (full)
**Track background:** `#1a1a1a`
**Track border-radius:** 3px

Members without a `color` set fall back to `var(--color-primary)` (lime).

---

## FrontPage Integration

`HeatmapStrip` sits below the fronting cards, separated by a section divider. It is always rendered (even if no front history exists — shows empty tracks with "No front activity in the last 24h" placeholder text).

---

## LogsPage Integration

LogsPage currently has two tabs: Journal and Front History. Add Heatmap as a third tab. Tab order: Journal | Front History | Heatmap.

Deep-linking via `?tab=heatmap` — `HeatmapStrip`'s "Full view →" link navigates to `/logs?tab=heatmap`.

---

## Empty States

- **No activity in window:** "No front activity in the last [24h / 7 days / 30 days]." shown centered in the heatmap area.
- **Loading:** Skeleton rows (grey placeholder bars, same layout).
- **Error fetching history:** "Couldn't load front history." with a retry link.

---

## Testing

**Backend:**
- `FrontHistoryController` or history endpoint: `from`/`to` params filter correctly
- Ongoing entries (null `FrontEnd`) included when `to` is provided
- Params absent → returns all history (existing behavior unchanged)

**Frontend:**
- `HeatmapStrip` renders top 5 members sorted by front time
- `FrontHeatmap` renders all active members + dimmed inactive
- Position math: span covering full window → `left=0, width=100`; half-window span → correct %
- Time range toggle switches window and re-fetches
- Empty state renders when no history in window
- "Full view →" navigates to `/logs?tab=heatmap`
