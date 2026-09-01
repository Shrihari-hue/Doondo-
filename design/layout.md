# Doondo --- Layout & Alignment Specification

## 1. Main Grid

Default mobile layout:

``` text
┌───────────────────────────────┐
│  16px                         │
│  ┌─────────────────────────┐  │
│  │                         │  │
│  │      CONTENT            │  │
│  │                         │  │
│  └─────────────────────────┘  │
│                         16px  │
└───────────────────────────────┘
```

Every major section should use the same content width.

------------------------------------------------------------------------

## 2. 8px Grid

Use:

``` text
4px
8px
12px
16px
20px
24px
32px
40px
48px
56px
64px
72px
```

The most common values are:

``` text
16px — screen padding
16px — card padding
24px — section spacing
32px — major spacing
```

------------------------------------------------------------------------

## 3. Alignment

### Horizontal

All of these normally share the same left edge:

``` text
Page title
Subtitle
Section heading
Cards
Lists
Banners
Inputs
Buttons
```

### Vertical

Repeated components must use consistent vertical gaps.

Example:

``` text
Heading
↓ 8px
Subtitle
↓ 24px
Card
↓ 24px
Next section
```

------------------------------------------------------------------------

## 4. Rows

For a row:

``` text
Icon | Text | Optional action
```

Use:

``` text
flexDirection: row
alignItems: center
```

Text area:

``` text
flex: 1
```

Action:

``` text
fixed content width
```

Do not use absolute x/y coordinates.

------------------------------------------------------------------------

## 5. Equal Columns

For three values:

``` text
A | B | C
```

Use:

``` text
A = flex: 1
B = flex: 1
C = flex: 1
```

This specifically applies to:

-   Profile statistics
-   Job information
-   Pricing options
-   Navigation where appropriate

------------------------------------------------------------------------

## 6. Cards

Cards should normally have:

``` text
width: 100%
```

inside the screen container.

Do not calculate card width manually from the device width.

------------------------------------------------------------------------

## 7. Bottom Navigation

Navigation is full width.

Content above it must reserve bottom space.

Recommended:

``` text
Bottom content padding =
navigation height + 16–24px
```

Voice action may extend upward visually but must not change the layout
width of the navigation items.

------------------------------------------------------------------------

## 8. Profile Screen Alignment

The profile statistics are especially important.

Correct:

``` text
┌─────────────────────────────────┐
│       0       │       0       │ — │
│ Applications  │ Saved jobs    │Rating
└─────────────────────────────────┘
```

The numbers must have:

-   Equal column widths
-   Equal center points
-   Same font size
-   Same baseline
-   Same distance to labels

The divider lines must be aligned vertically.

------------------------------------------------------------------------

## 9. Home Job Card Alignment

For job cards:

``` text
┌─────────────────────────────────┐
│ [icon]  Job title               │
│         Location · distance     │
├─────────────────────────────────┤
│   Pay      Schedule      Date   │
├─────────────────────────────────┤
│ Tag                             │
├─────────────────────────────────┤
│          View details           │
└─────────────────────────────────┘
```

The three information columns must be equal width.

------------------------------------------------------------------------

## 10. Responsive Behavior

Never assume:

``` text
729px
864px
360px
390px
```

are the only sizes.

Use:

``` text
width: 100%
maxWidth where appropriate
flex: 1
padding
gap
```

Text must wrap naturally.

------------------------------------------------------------------------

## 11. Absolute Positioning

Allowed only for:

-   Camera button over avatar
-   Floating Voice action
-   Small badges
-   Decorative elements

Not allowed for:

-   Main page sections
-   Cards
-   Text blocks
-   Navigation layout
-   Form fields
-   Repeated columns

------------------------------------------------------------------------

## 12. Safe Area

Use safe-area handling for:

``` text
top
bottom
left
right
```

Never manually guess device status-bar height.

------------------------------------------------------------------------

## 13. Scroll

Long screens must scroll.

The fixed bottom navigation must remain visible.

Use bottom content inset so:

``` text
last content
↓
safe spacing
↓
navigation
```

The final card must never disappear underneath navigation.
