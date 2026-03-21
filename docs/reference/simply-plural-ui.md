# Simply Plural UI Reference

Visual and UX reference for Plural-Host design decisions. Documents what SP looks like and what to keep vs. change.

---

## Opinions — What to Change

### Dislikes (don't replicate these)

- **Not built for a webapp.** SP is a phone app ported to web without adaptation — narrow centered column, no use of horizontal space, everything stacks like a mobile list. Plural-Host should be designed desktop-first with proper use of screen width (sidebars, multi-column layouts, panels).
- **Color-starved.** The entire UI is near-black with one gold accent. Member colors exist but barely surface — just a thin left-edge bar. The design feels flat and monotonous. Plural-Host should let member colors breathe more and use color as a real organizational tool, not a decorative afterthought.
- **No per-alter theming.** No way to set a background, theme, or distinct visual identity per member. A self-hosted app should allow full per-alter customization — background image/color, accent color, etc.
- **Privacy bucket assignment is alter-by-alter only.** The bucket concept itself is good — named permission groups with custom emoji/color assigned to specific friends. The problem is the flow: you assign buckets from inside each individual alter's profile. There is no way to go bucket→alters (assign a bucket to many alters at once), no batch-select, no group-level assignment. With 500+ alters this is completely unusable. **Plural-Host fix:** manage bucket membership from the bucket side — open a bucket, pick which alters/groups belong to it. Batch and group-level assignment required.
- **Mobile web is an afterthought.** SP's web version on mobile is bad. Plural-Host should be responsive — designed desktop-first but actually good on mobile web too, not just tolerable.

### Likes (keep or improve on these)

- **Tabs on the member profile.** Profile / Message board / History / Notes / Options — good separation of concerns, easy to navigate.
- **All the customization features exist.** Custom fields, privacy controls, groups, color per member, emoji, notes, message board, front history — the feature set is right, the execution needs work.
- **The feature scope in general.** Don't cut things down — build on what SP has. The features are the reason it gets used despite the aesthetic shortcomings.

### Core Design Philosophy for Plural-Host

- **Aesthetics are the main complaint, not features.** The layout feels sad from a graphic design perspective — not because it's minimal, but because minimal wasn't a choice, it was a limit. Minimal *can* look great; SP just looks unfinished.
- **Richness should be opt-in, not forced.** Don't overload every page — but give users the tools to make it feel like *theirs*. Per-alter theming, layout density options, color everywhere it makes sense.
- **Mobile-first responsive, not mobile-only.** Friends will view this on mobile web. It must work and look good there. But it should also use screen real estate well on desktop. Design responsive from the start, not as a port.
- **Don't sacrifice features for aesthetics.** The goal is "all of SP's features, but actually beautiful and customizable."

---

## Visual Design Language

### Color Palette
- **Background:** Very dark navy/charcoal (~#1a1d2e)
- **Cards/elevated surfaces:** Slightly lighter dark (~#252836)
- **Gold accent:** Active states, section headers, FABs, selected items, color pickers (~#C9A84C)
- **Text primary:** White
- **Text secondary:** Medium gray
- **Danger/destructive:** Red (~#E05252)
- **Member color accent:** Left-edge bar on member cards, color assigned per-member

### Typography
- Section headers: gold/amber, slightly larger, hairline separator below
- Body: white/light gray
- Secondary info (pronouns, timestamps): dimmer gray
- Inline hyperlinks: gold (matches accent)

### Interaction Patterns
- **Fields:** Dark card background, gold bottom-border when active, inline edit icon (pencil or paste-format)
- **Toggles:** Standard pill, gold = ON
- **Buttons:** Rounded rectangle, dark fill
- **FABs:** Gold circle, fixed bottom-right
- **Bottom sheets:** Overlay context menus with icon + label rows
- **Segmented controls:** Gold highlight on selected segment
- **Privacy icons:** Small circular icon button, top-right of each field label row
- **Empty states:** Centered plain text only, no illustrations, FAB still present

---

## Screens

### Members / Front (main list)

**Top bar:** hamburger (left), search (right)
**Toolbar row:** groups-toggle, add-member (+person), list-view, grid-view icons; new-folder (+) below

**List structure:**
- "Root" label at top
- Groups/folders: folder icon or custom avatar, name, left color-accent bar, privacy icon, member count badge (+N)
- Members: avatar (square), left color-accent bar, name + emoji, pronouns, fronting indicator (crescent moon icon — gold when active)

**Two view modes:**
- Card view: avatar + name + pronouns + icons
- Compact list: name + emoji only, no avatar, no pronouns

**Front context menu (bottom sheet on member tap):**
- + Add to front
- ↑ Set as front
- × No action
  *(gold border = currently selected default action)*

---

### Side Drawer Navigation

- System avatar + system name + gear icon at top
- **Quick Actions:** Add Member, Add Front Entry, Add Custom Front Status, Add Poll
- **Pages:** Members/Front, Front History, Chat, Analytics, Polls, Friends, Privacy Buckets, Useful Links, App Reminders
- Active page: gold/brown fill highlight
- App version string in footer

---

### Add New Group (modal)

- Floppy save icon + "Add new group" title, × close
- Fields: Name (pencil), Description (paste), Custom Emoji (pencil)
- Full-width color bar → "Select your color" tooltip
- Privacy Settings → Base Permissions chip

---

### Add Member (modal)

- Dialog only: Name field + Confirm button
- No other fields at creation time — everything else set post-creation

---

### Settings (top-level)

Full-width tappable rows: Account, App settings, Integrations, Support, Info, Join Discord, Logout

---

### App Settings / Options

Sections with gold headers + hairline dividers:

| Section | Settings |
|---|---|
| Default Page | Dropdown picker |
| General Settings | Spoiler URLs toggle |
| Timeline Settings | Hide shadows, Hide contrasting front color |
| Privacy Buckets Settings | Hide privacy icons in members list / custom fields / friends list |
| Fronter Settings | Hide fronters in list, Hide fronting duration, Collapse friend front status |
| Group Settings | Hide grouped members from root |
| Default member action | Segmented: None / Add to front / Set as front / Sync |
| Advanced | (further options, not fully captured) |

---

### Account Settings (sub-menu)

Tappable rows: Account Settings, Privacy Buckets, Custom Fields, User Report, Generated Reports, Tokens, Notification History, Export your data, Security logs

**Account Settings detail:**
- Profile: large centered avatar (gold edit overlay), Username (char counter N/35), Description, Account color bar
- Email (editable), Change Password button
- "This account is a system" toggle
- Info: User ID (copy button), Member count (hidden → click to reveal)
- Danger zone: Delete Account (red + trash icon)

---

### Member Profile (full-screen sheet)

**Header:** floppy save (top-left), member name, × close (top-right)

**6-tab icon-only nav bar:**

| # | Icon | Tab name |
|---|---|---|
| 1 | ≡ lines | Groups |
| 2 | person | Profile / Info |
| 3 | speech bubble | Message board |
| 4 | trend line | History |
| 5 | document | Notes |
| 6 | sliders | Options |

---

#### Tab 2 — Profile

- Large centered avatar, gold edit overlay
- Fields: Name (pencil), Pronouns (pencil), Description (paste/format icon)
- Full-width color bar "Select your color"
- Groups section: colored underlined tag chips (e.g. "TV", "R - Undefined/Unknown")

---

#### Profile — Info (custom fields)

Custom fields are a separate scrollable section, also under the profile/info tab. Each field:
- Label row: field name (left) + privacy icon button (top-right)
- Value: text content in a slightly-elevated card
- Edit control: paste/format icon inside card
- Privacy icon states: moon (private), shield (public), eye-slash (hidden from specific buckets), moon+N (multi-bucket)

Example fields seen in practice:
- Age, Physical Attributes, System Role, Role Details, Emoji
- System Relationship (multi-line, lists members + external contacts)
- Likes, Food Dislikes, Dislikes
- Angel/Star/Supernatural status, Sexuality
- Person to contact if there's an issue

**Bottom-right:** "Edit fields info" gold FAB + "?" help button

---

#### Tab 3 — Message board

- Empty state: "No messages found on this member's board"
- Gold FAB (+) to add

---

#### Tab 4 — History

Front history entries (cards):
- Start date (left) + time / End date (right) + time
- Duration on second line (verbose: Days, Hours, Minutes, Seconds)
- Optional custom status tag in gold text (e.g. "Co-con")
- Comment bubble icon (right edge)
- "Load More" ↓ button at bottom

---

#### Tab 5 — Notes

- Empty state: "This member has no notes."
- Gold FAB (+) to add

---

#### Tab 6 — Options

**Privacy Settings:**
- Base Permissions chip/button
- "Assign privacy buckets" pencil link

**Settings:**
- Prevent notifications on front change (toggle)
- Receive board message notifications (toggle, ON by default)
- Archived (toggle) — keeps data, hides from search + count; inline gold hyperlink in description

**Info:**
- Simply Plural member ID (copy button)
- Simply Plural creation date (hidden → "Click to see")

**Danger zone:**
- Delete member (red text + trash icon)

---

### Privacy Bucket Assignment (per-alter, current SP flow)

Accessed from member Options tab → "Assign privacy buckets":
- Search bar at top
- List of buckets: each has custom icon (moon/eye-slash/etc.), name in gold, "Assigned to N friends" subtitle, colored bottom border, checkbox (left), "?" help icon (right)
- Checking a box assigns that bucket to THIS alter only
- No way to go the other direction (bucket → select alters)

Create new privacy bucket form:
- Name (0/150), Description (0/500), Custom Privacy Emoji Icon (0/3), Color picker
- "Assigned friends" section with search + friend list checkboxes
- Friends are assigned at bucket creation but alters are not — you still have to go alter-by-alter

---

## Notes on What's Missing / Not Captured

- Dashboard page (not shown)
- Front History page (global, not per-member)
- Chat page
- Analytics page
- Polls page
- Friends page
- Privacy Buckets management page
- Custom Fields management page
- Share/public profile view
