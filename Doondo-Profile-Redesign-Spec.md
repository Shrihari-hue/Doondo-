# Doondo — Navigation & Profile Tab Redesign Spec

**Version:** 3.0
**Date:** 21 May 2026
**Owner:** Shree
**Audience:** Mobile developers and product designers
**Status:** Draft for review

---

## 1. Problem

The current Profile tab is a single flat list of 15+ menu items under one "ACTIVITY" header, followed by Resume and Account sections. Every row has identical styling — same icon size, same text weight, same chevron — so nothing signals priority. A worker who opens the tab to do one thing (for example, check an application) has to visually scan the entire list to find it.

Three specific issues:

1. **No hierarchy.** High-frequency actions (applications, earnings) sit in the same undifferentiated list as once-a-year actions (refer a friend).
2. **Wrong home.** Items a worker uses every day are buried inside a "profile" tab instead of being one tap away.
3. **Confusing copy and duplicate data.** Labels like "Skill Passport", "Your Work Rules" and "Trade buddies" are insider jargon. The profile-completion figure also appears twice with two different values (100% in the stats row, 70% lower down).

The target users are gig and blue-collar workers, some with limited digital literacy. For this audience, fewer choices per screen, plain language, and large icon-led tap targets matter more than feature density.

---

## 2. Goals and design principles

- **One screen, few choices.** No screen should present more than ~6–7 top-level choices at once.
- **Frequency drives placement.** The things workers do every day are top-level destinations in the bottom navigation bar.
- **Group, don't list.** Related items live under a clearly labelled, collapsible group so the worker scans headers, not rows.
- **Plain language.** Labels describe what the thing *is*, in words a first-time worker understands.
- **Accessible by default.** Every item is icon + text, with large tap targets and regional-language support.

---

## 3. New information architecture — 6-tab bottom navigation

The bottom bar carries six top-level destinations.

| # | Tab | Icon | Purpose |
|---|-----|------|---------|
| 1 | Home | `home` | Personalized dashboard: recommended jobs, alerts, reminders, next profile step |
| 2 | Jobs | `briefcase` | Browse, search, saved jobs, job-alert settings, and application tracking |
| 3 | Community | `users-group` | Refer a friend, find work buddies, ratings & reviews, community feed |
| 4 | Chat | `message-circle` | Direct messaging with employers and work buddies |
| 5 | Earnings | `wallet` | Wallet balance, payout history, cash advance, worker insurance |
| 6 | Profile | `user` | Identity, skills, career growth, account and settings |

**Design note — six tabs.** Six is above the 3–5 range that iOS and Android guidelines recommend for a bottom bar, so the layout must actively protect comfort and tap accuracy. This is not a free choice; it is a constraint the implementation has to manage. Mitigations are mandatory — see §8.1. If labels truncate on small devices in testing, the team should revisit reducing to five (e.g. by merging Chat into Community, or moving Profile to a top-bar avatar).

---

## 4. Tab-by-tab contents

### 4.1 Home
A glanceable dashboard, not a menu. Suggested blocks, top to bottom: a greeting with the worker's name; the single most important profile nudge (e.g. "Verify your profile to unlock more jobs"); 3–5 recommended job cards; a compact "Your applications" status strip; recent alerts. Home answers "what should I do next?" without the worker hunting.

### 4.2 Jobs
Search and browse jobs, filter by trade/location/pay, and view saved jobs. This tab also carries **application tracking** as a segmented view ("Browse" / "Applied"), since the two are closely related. The Applied view groups applications by stage: Applied → Shortlisted → Interview → Hired / Closed. Job-alert configuration lives here as a "Manage job alerts" entry.

### 4.3 Community
The social layer of Doondo: refer a friend, find work buddies (the merged *Find friends* + *Trade buddies* feature), see and respond to ratings & reviews, and any community feed content. Keeping all social and referral features in one tab gives them a clear home and removes five rows from the old Profile list.

### 4.4 Chat
Direct messaging — conversations with employers about jobs and with work buddies. A standard messaging list (conversations sorted by recency, unread indicator) opening into individual threads. The bottom-bar Chat icon carries an unread-count badge.

### 4.5 Earnings
The worker's money in one place: current balance, payout history, and entry points for Cash advance and Worker insurance. Keeping all money features together builds trust and reduces the chance a worker misses a payout or an advance they qualify for.

### 4.6 Profile
No longer a dumping ground. It now contains only a compact identity header plus two collapsible groups. See §5.

---

## 5. Profile tab — detailed layout

Top to bottom:

**A. Identity header.** Avatar, name, "Member since" line. One — and only one — profile-completion progress bar with a clear next action (e.g. "Verify your profile → 85%"). See §7.

**B. Skills summary.** The existing editable skill chips, kept near the top since skills directly affect job matching.

**C. Two collapsible groups.** Each group is a card with a tinted icon, a group name, and a chevron. Tapping the header expands/collapses the group. Group contents:

| Group | Items | Notes |
|-------|-------|-------|
| Grow your career | Training & courses; Skills hub; Interview prep | "Skills hub" merges the old *Skill tests* and *Skill Passport* into one destination. |
| Account & settings | My resume; Work preferences; Edit profile; Download center; Settings | "Work preferences" is the renamed *Your Work Rules*. |

The old "Community & rewards" group does not appear here — those items moved to the Community tab (§4.3).

**D. Sign out.** A single, visually de-emphasized row at the very bottom.

Default expand state: expand the first group ("Grow your career") on first visit; remember the worker's expand/collapse choices after that.

---

## 6. Copy and labelling changes

Replace jargon with plain descriptions of what the feature does.

| Current label | New label | Reason |
|---------------|-----------|--------|
| Skill Passport | Folded into "Skills hub" | "Passport" is a metaphor a new worker won't decode. |
| Skill tests | Folded into "Skills hub" | Tests and passport are one journey; one destination. |
| Your Work Rules | Work preferences | "Rules" sounds restrictive; this is about availability and preferences. |
| Trade buddies | Folded into "Find work buddies" | Overlaps with "Find friends"; one feature is clearer. |
| Find friends on Doondo | Find work buddies | Shorter, describes the benefit (work connections). |
| ACTIVITY (section header) | (removed) | Replaced by meaningful group names and dedicated tabs. |

General copy rules: sentence case everywhere (no ALL CAPS headers), describe the benefit not the mechanism, and keep every label translatable into the regional languages Doondo supports.

---

## 7. Fix: duplicate profile-completion figure

The current screen shows profile completion twice with conflicting values ("100% Profile" in the stats row and "70%" further down). This erodes trust.

Recommendation: keep **one** completion indicator — the progress bar in the Profile identity header — as the single source of truth. The stats row should then show genuinely different, motivating metrics (for example: jobs completed, average rating, months active). Completion should always pair the percentage with the specific next action that raises it.

---

## 8. Component specifications

### 8.1 Bottom navigation bar — 6 tabs

Because six tabs is above the recommended count, the following are **mandatory**, not optional:

- Height: 56–64 dp plus the device safe-area inset.
- 6 items, strictly equal width (each ~16.6% of bar width). The active tab must NOT widen — it is distinguished by colour only, so all tabs stay the same size.
- Each item: 22–24 dp icon above a single-word label. All six labels are single words (Home, Jobs, Community, Chat, Earnings, Profile) — keep them that way; never let a label wrap or shrink below 9 sp.
- Label sizing: 9–10 sp, sentence case, with `maxLines = 1` and ellipsis disabled (single words should fit; if "Community" clips at the smallest width, reduce label size by 0.5 sp rather than truncating).
- Minimum tap target 48×48 dp tall; accept that visual width per tab is ~53 dp on a 320 dp device — the touch target is the full tab cell.
- Badges (Chat unread, Home alert dot) overlap the icon and must NOT add to tab width.
- Test explicitly at 320 dp width (smallest common device) and with the largest supported font-scale / regional-language strings.
- The bar is persistent across the 6 top-level tabs and hidden on deeper detail screens.

### 8.2 Collapsible group (Profile tab)
- Header row: 48 dp tall; leading tinted icon (24 dp) in a soft-fill rounded square; group name at 14 sp, medium weight; trailing chevron that rotates on expand/collapse.
- Item row: 44 dp tall; leading icon 20 dp; label 14 sp regular; trailing chevron.
- Expand/collapse is animated; the chosen state persists per worker.

### 8.3 List row (general)
- Minimum height 44 dp; minimum tap target 48×48 dp.
- Always icon + text — never text alone.
- One row = one destination. No row should require the worker to guess what it does.

### 8.4 Spacing and contrast
- Generous vertical spacing between groups so each group reads as a distinct block.
- Text contrast must meet WCAG AA against its background.

---

## 9. Accessibility and low-literacy considerations

- **Regional languages:** every label must be fully translatable; design for ~30% text expansion. This is the biggest risk for the 6-tab bar — a translated label may be far longer than the English word, so test each supported language in the bar specifically.
- **Icon + text pairing:** icons never stand alone; they reinforce the label for low-literacy users.
- **Large tap targets:** 48×48 dp minimum everywhere — workers may use the app one-handed, outdoors, on small or older devices.
- **Screen readers:** every interactive element has a descriptive TalkBack/VoiceOver label.
- **Plain language:** short, concrete labels; avoid English-only metaphors.

---

## 10. Migration map — where every current item goes

| Current item | New location |
|--------------|--------------|
| My Applications | **Jobs** tab → Applied view |
| My Jobs | **Jobs** tab |
| Job Alerts | **Jobs** tab (Manage job alerts) + surfaced on Home |
| Cash advance | **Earnings** tab |
| Worker insurance | **Earnings** tab |
| My Earnings | **Earnings** tab |
| Refer a friend | **Community** tab |
| Find friends on Doondo | **Community** tab (Find work buddies) |
| Trade buddies | **Community** tab (Find work buddies) |
| Ratings & Reviews | **Community** tab |
| Training & courses | **Profile** tab → Grow your career |
| Skill tests | **Profile** tab → Grow your career (Skills hub) |
| Skill Passport | **Profile** tab → Grow your career (Skills hub) |
| Interview prep | **Profile** tab → Grow your career |
| Your Work Rules | **Profile** tab → Account & settings (Work preferences) |
| My resume | **Profile** tab → Account & settings |
| Edit Profile Details | **Profile** tab → Account & settings (Edit profile) |
| Download Center | **Profile** tab → Account & settings (Download center) |
| Settings | **Profile** tab → Account & settings |

(New) **Chat** is a new top-level tab for direct messaging; if Doondo already has employer messaging, that feature moves here.

---

## 11. Suggested rollout phasing

1. **Phase 1 — Navigation.** Ship the 6-tab bottom bar and move Jobs, Community, Chat and Earnings content out of the old Profile list. This delivers most of the decluttering benefit on its own.
2. **Phase 2 — Profile groups.** Replace the flat list with the two collapsible groups and apply the new copy.
3. **Phase 3 — Polish.** Fix the completion meter, redesign the stats row, add badges, and complete regional-language coverage.

---

## 12. Open questions for review

- After testing the 6-tab bar at 320 dp width and in every supported language, does any label truncate? If so, the fallback is to drop to five tabs (merge Chat into Community, or move Profile to a top-bar avatar).
- Should application tracking be a segmented view inside Jobs (as specified) or its own screen reached from Home?
- Does Worker insurance belong in Earnings, or in Profile → Account & settings? (Spec places it in Earnings.)
- Is "Chat" a brand-new feature, or does Doondo already have messaging to migrate?
- What three metrics should the new stats row show in place of the duplicated completion figure?
