# Doondo --- Global Design System

## 1. Purpose

This is the **global design system** for the Doondo mobile app.

Use this file for **every screen**. The screenshots supplied with this
project are visual references for the design language, not separate page
designs.

The goal is to keep every screen consistent in:

-   Alignment
-   Spacing
-   Typography
-   Colors
-   Cards
-   Buttons
-   Inputs
-   Icons
-   Navigation
-   Light/dark themes
-   Safe areas
-   Visual hierarchy

A new screen may have a different layout, but it must still feel like
the same Doondo product.

------------------------------------------------------------------------

# 2. Design Direction

Doondo should feel:

-   Modern
-   Clean
-   Professional
-   Simple
-   Friendly
-   Mobile-first
-   Easy to scan
-   High readability

Use a strong blue as the main brand/action color.

Use orange only for the Voice action/highlight where required.

Do not introduce random colors or unrelated visual styles.

------------------------------------------------------------------------

# 3. Theme System

The app supports three appearance modes:

``` text
System
Light
Dark
```

## System

When the user selects **System**, follow the device operating-system
appearance.

``` text
System light → Light theme
System dark  → Dark theme
```

Do not hard-code the theme based on the current device.

## User Selection

The user can explicitly choose:

-   Light
-   Dark
-   System

The selected preference must be stored and restored when the app opens
again.

## Important

Do not create separate component designs for light and dark mode.

Use the same component structure and spacing.

Only the **design tokens** change.

------------------------------------------------------------------------

# 4. Color Tokens

Never scatter raw colors throughout the application.

Create semantic color tokens.

## Brand

``` text
brand.primary       #2563EB
brand.primaryLight  #3B82F6
brand.primaryDark   #1D4ED8
brand.orange        #F97316
```

## Light Theme

``` text
background.primary      #F7F9FC
background.secondary    #FFFFFF
background.tertiary     #EEF3FA

surface.primary         #FFFFFF
surface.secondary       #F3F6FB
surface.elevated        #FFFFFF

text.primary            #111827
text.secondary          #64748B
text.tertiary           #94A3B8
text.inverse            #FFFFFF

border.default          #E2E8F0
border.strong           #CBD5E1

icon.primary            #2563EB
icon.secondary          #64748B

success                 #16A34A
warning                 #F59E0B
error                   #EF4444
```

## Dark Theme

``` text
background.primary      #090B10
background.secondary    #0F1219
background.tertiary     #151A24

surface.primary         #11151D
surface.secondary       #151A24
surface.elevated        #1A202B

text.primary            #F8FAFC
text.secondary          #A1A8B3
text.tertiary           #737B88
text.inverse            #0B0F16

border.default          #252B36
border.strong           #343C49

icon.primary            #60A5FA
icon.secondary          #94A3B8

success                 #22C55E
warning                 #F59E0B
error                   #EF4444
```

## Rules

-   Blue is the primary interactive color.
-   Orange is reserved mainly for Voice.
-   Red is for errors/destructive actions.
-   Green is for success/verified states.
-   Do not use pure black backgrounds everywhere.
-   Do not use pure white text for every secondary element in dark mode.
-   Secondary text must have lower contrast than primary text.

------------------------------------------------------------------------

# 5. Typography

Use the platform/system sans-serif font unless the product explicitly
includes a custom font.

Recommended hierarchy:

``` text
Display       32px / 700
Heading 1     28px / 700
Heading 2     24px / 700
Heading 3     20px / 600
Body Large    18px / 400
Body          16px / 400
Body Medium   14px / 500
Caption       12px / 400
Label         13px / 600
```

Use a consistent line height:

``` text
Display       1.15
Headings      1.2
Body          1.45
Caption       1.35
```

Do not make every heading bold.

Use font weight to create hierarchy.

------------------------------------------------------------------------

# 6. Spacing System

Use an 8-point spacing system.

Allowed base values:

``` text
4
8
12
16
20
24
32
40
48
56
64
72
```

## Default screen padding

``` text
Left: 16px
Right: 16px
```

For important hero content:

``` text
16–24px
```

Do not use different left margins for different sections unless the
design specifically requires it.

### Critical alignment rule

All major screen content should share the same left and right content
edges.

For example:

``` text
Screen edge
│
│  16px
│  ┌─────────────────────────┐
│  │ Header                  │
│  │                         │
│  │ Card                    │
│  │                         │
│  │ Section                 │
│  └─────────────────────────┘
│
```

A heading, card, list, banner and button should normally align to the
same content grid.

------------------------------------------------------------------------

# 7. Grid and Alignment

Use a responsive grid.

## Mobile

``` text
Screen width
- 16px left inset
- 16px right inset
= content width
```

For a 360px screen:

``` text
360 - 16 - 16 = 328px
```

For a 390px screen:

``` text
390 - 16 - 16 = 358px
```

Never design around one physical phone width.

## Internal card padding

Default:

``` text
16px
```

Large cards:

``` text
20px
```

Hero cards:

``` text
24px
```

## Horizontal alignment

Prefer:

``` text
alignItems: flex-start
```

for text-heavy content.

Use center alignment only for:

-   Empty states
-   Avatars
-   Hero sections
-   Navigation icons
-   Buttons where appropriate

------------------------------------------------------------------------

# 8. Safe Areas

Every screen must respect:

-   Status bar
-   Display cutouts
-   Gesture/navigation area
-   Bottom navigation

Use platform safe-area APIs.

Do not manually add status-bar heights.

Do not position content underneath system navigation.

------------------------------------------------------------------------

# 9. Screen Structure

Most Doondo screens should follow:

``` text
Safe Area
│
├── Header
│
├── Main content
│
│   ├── Section
│   ├── Section
│   └── Section
│
└── Bottom Navigation
```

When content is long:

``` text
Safe Area
│
├── Header
├── ScrollView
│   └── Content
└── Bottom Navigation
```

The bottom navigation should remain fixed.

Content must have enough bottom padding so the final item is never
hidden behind navigation.

------------------------------------------------------------------------

# 10. Cards

Cards are used to group related information.

## Light

``` text
Background: #FFFFFF
Border: #E2E8F0
Radius: 20px
Shadow: subtle
Padding: 16–20px
```

## Dark

``` text
Background: #11151D
Border: #252B36
Radius: 20px
Shadow: minimal/subtle
Padding: 16–20px
```

Avoid excessive shadows in dark mode.

Cards should not look like floating glass everywhere.

------------------------------------------------------------------------

# 11. Buttons

## Primary

``` text
Background: brand.primary
Text: text.inverse
Height: 52–56px
Radius: 16px
Horizontal padding: 20px
```

## Secondary

``` text
Background: transparent or surface.secondary
Border: border.default
Text: text.primary
Height: 52–56px
Radius: 16px
```

## Text Button

Use for low-priority actions.

``` text
No background
No heavy border
Brand color
```

## Pressed State

Do not completely change the design.

Use a subtle:

-   Opacity reduction
-   Color darkening/lightening
-   Scale change only if appropriate

------------------------------------------------------------------------

# 12. Inputs

Default:

``` text
Height: 52–56px
Radius: 14–16px
Padding horizontal: 16px
Border: 1px
```

Light:

``` text
Background: #FFFFFF
Border: #E2E8F0
```

Dark:

``` text
Background: #11151D
Border: #252B36
```

Focused:

``` text
Border: brand.primary
```

Error:

``` text
Border: error
Helper text: error
```

Placeholder text must be visibly weaker than entered text.

------------------------------------------------------------------------

# 13. Banners

Banners should use the same screen grid as cards.

Do not make banners wider or narrower than the main content without a
deliberate reason.

Recommended:

``` text
Radius: 20px
Padding: 16–20px
```

Use:

-   Primary blue for important actions
-   Soft semantic backgrounds for information
-   Orange only when related to Voice or attention

------------------------------------------------------------------------

# 14. Chips and Tags

``` text
Height: 32–36px
Horizontal padding: 12–14px
Radius: 999px
```

Chips should be compact.

Do not use large pills for every piece of information.

------------------------------------------------------------------------

# 15. Icons

Use one consistent icon family.

Recommended style:

``` text
2px approximately
Rounded line icons
```

Icons should have consistent:

-   Stroke width
-   Size
-   Visual weight

Typical sizes:

``` text
16px — inline
20px — list item
24px — navigation
28–32px — feature/action
```

Do not mix random emoji, filled icons and outline icons unless the
design intentionally calls for it.

------------------------------------------------------------------------

# 16. Avatar

Default avatar:

``` text
Circular
```

Common sizes:

``` text
32px
40px
48px
64px
96px
```

Profile hero avatars may be larger.

Use a consistent camera/edit control when editing the profile image.

------------------------------------------------------------------------

# 17. Bottom Navigation

The supplied screens show a persistent navigation system.

Navigation items:

``` text
Home
Jobs
Community
Voice
Chat
Earnings
Profile
```

## Layout

Use equal-width navigation items.

Do not manually position each item.

``` text
| Home | Jobs | Community | Voice | Chat | Earnings | Profile |
```

Each item should use:

``` text
Icon
Label
```

The label may truncate where the screen is too narrow, but icons must
remain aligned.

## Active state

Active navigation:

``` text
Brand blue
```

Voice:

``` text
Orange
```

Inactive:

``` text
Light theme → text.tertiary
Dark theme  → text.secondary
```

## Voice button

The Voice action is visually emphasized.

Use:

``` text
Circular button
Orange
Elevated
Centered on its navigation position
```

Do not allow the floating Voice button to change the alignment of the
other navigation items.

------------------------------------------------------------------------

# 18. Home Screen Style

The Home screenshot demonstrates:

-   Doondo brand header
-   Location selector
-   Segmented time filter
-   Trade categories
-   Job cards
-   Strong blue actions
-   Persistent navigation

All these components must use the global tokens.

Job cards should align to the same 16px screen inset.

------------------------------------------------------------------------

# 19. Community Screen Style

Community uses:

-   Page title
-   Subtitle
-   Composer card
-   Profile/avatar
-   Media actions
-   Bottom navigation

The composer card must align with the page title and other screen
content.

Do not allow its internal controls to drift horizontally.

------------------------------------------------------------------------

# 20. Profile Screen Style

Profile uses:

-   Blue hero area
-   Centered avatar
-   Profile completion
-   Information cards
-   Statistics
-   Salary section
-   Skills
-   Bottom navigation

## Statistics card

The three values must be evenly distributed.

For:

``` text
0 Applications
0 Saved jobs
— Rating
```

use a three-column flex layout.

Each column:

``` text
flex: 1
alignItems: center
```

Use equal-width columns and equal internal spacing.

Dividers must be vertically aligned.

Do not position the three numbers independently.

------------------------------------------------------------------------

# 21. Jobs Screen Style

Jobs empty state uses:

-   Small section label
-   Large page title
-   Subtitle
-   Centered illustration
-   Empty-state label
-   Main message
-   Supporting text
-   Primary action

The empty state should be centered within the available content area,
not the entire device including the bottom navigation.

------------------------------------------------------------------------

# 22. Login Screen Style

Login uses:

-   Dark background in the supplied design
-   Branded welcome card
-   Role selector
-   Inputs
-   Remember me
-   Password recovery
-   Primary sign-in button
-   Divider
-   Google button
-   Account creation link

The same spacing and typography tokens must be used.

------------------------------------------------------------------------

# 23. Light/Dark Component Rules

Every component must define semantic tokens, not separate hard-coded
designs.

Example:

``` text
Card background = surface.primary
Card border     = border.default
Primary text    = text.primary
Secondary text  = text.secondary
```

Never do:

``` text
backgroundColor: "#FFFFFF"
```

inside a reusable component when the component should support dark mode.

Instead use:

``` text
colors.surface.primary
```

This is critical for correct theme switching.

------------------------------------------------------------------------

# 24. Responsive Rules

The design must work on:

-   Small phones
-   Standard phones
-   Large phones
-   Different aspect ratios
-   Android gesture navigation
-   Android 3-button navigation

Do not use screen-width-specific magic numbers unless necessary.

Use:

-   Flexbox
-   Percentage/flex sizing
-   `maxWidth`
-   Responsive typography where needed
-   Safe-area insets
-   Scroll containers

------------------------------------------------------------------------

# 25. Vertical Rhythm

A screen should feel balanced.

Recommended section spacing:

``` text
Small:       8–12px
Normal:      16px
Sections:    24–32px
Major:       40–48px
```

Avoid random gaps such as:

``` text
17px
23px
31px
37px
```

unless a measured design requirement exists.

------------------------------------------------------------------------

# 26. Visual Hierarchy

Every screen should answer:

1.  What screen am I on?
2.  What is important?
3.  What can I do?
4.  What happens next?

Use:

``` text
Title
↓
Supporting information
↓
Primary content
↓
Primary action
```

Do not make secondary text visually compete with the primary action.

------------------------------------------------------------------------

# 27. Empty States

Empty states should be intentional.

Structure:

``` text
Illustration/Icon
Label
Title
Description
Primary action
```

Keep the content centered horizontally.

Do not push empty-state content randomly toward the top or bottom.

------------------------------------------------------------------------

# 28. Loading and Error States

Use the same layout as the final state.

Loading:

-   Skeletons where useful
-   Avoid flashing blank screens

Error:

-   Clear message
-   Recovery action
-   Use semantic error color only where needed

------------------------------------------------------------------------

# 29. General Alignment Rules

These rules are mandatory.

### Rule 1

All main screen sections use the same horizontal content inset.

### Rule 2

Cards align to the same left and right edges.

### Rule 3

Repeated items use equal spacing.

### Rule 4

Columns use flex/equal widths instead of manually calculated positions.

### Rule 5

Text baselines should align where elements appear in rows.

### Rule 6

Icons have fixed consistent dimensions.

### Rule 7

Buttons inside similar cards use consistent height.

### Rule 8

Bottom navigation items are distributed evenly.

### Rule 9

Never solve alignment problems with arbitrary negative margins.

### Rule 10

Never use absolute positioning for normal page layout.

------------------------------------------------------------------------

# 30. Implementation Rules for Claude

Before creating or modifying a screen:

1.  Read this `design.md`.
2.  Inspect the existing components.
3.  Reuse existing components whenever possible.
4.  Use semantic theme tokens.
5.  Use the 8px spacing system.
6.  Use 16px default screen margins.
7.  Align all major content to the same grid.
8.  Support System / Light / Dark appearance.
9.  Keep bottom navigation consistent.
10. Test the screen at multiple widths.
11. Do not introduce a new color without adding it to the design tokens.
12. Do not introduce a new radius without a reason.
13. Do not create a new button style when an existing style works.
14. Do not use hard-coded positions for alignment.
15. Match the supplied screenshots' overall visual language, not their
    exact pixel dimensions.

------------------------------------------------------------------------

# 31. Source of Truth

Priority order:

``` text
1. Product requirements
2. This design.md
3. Existing reusable components
4. Supplied reference screenshots
5. Platform accessibility requirements
```

When a screenshot and responsive requirements conflict, preserve the
design language and use responsive layout.

The goal is **one consistent Doondo product**, not five unrelated
screens.
