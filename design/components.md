# Doondo --- Component Design Rules

This file defines reusable components shared across all screens.

## Component principle

Build components once and reuse them.

Examples:

``` text
ScreenContainer
PageHeader
PrimaryButton
SecondaryButton
TextButton
TextInput
SearchInput
Card
Banner
Chip
Avatar
StatCard
SectionHeader
EmptyState
BottomNavigation
VoiceAction
```

------------------------------------------------------------------------

## ScreenContainer

Default:

``` text
Horizontal padding: 16px
```

Content must stay inside the same left/right edges.

Do not create different margins for each section.

------------------------------------------------------------------------

## PageHeader

Typical:

``` text
Title
Subtitle
Optional action
```

Title:

``` text
28px / 700
```

Subtitle:

``` text
16–18px / 400
```

Use left alignment unless the screen is a hero/empty state.

------------------------------------------------------------------------

## Card

``` text
Radius: 20px
Padding: 16–20px
Border: 1px
```

Use semantic surface/border tokens.

------------------------------------------------------------------------

## StatCard

For three statistics:

``` text
┌──────────┬──────────┬──────────┐
│    0     │    0     │    —     │
│Applications│Saved jobs│ Rating │
└──────────┴──────────┴──────────┘
```

Implementation:

``` text
display: flex
flexDirection: row

Each statistic:
flex: 1
alignItems: center
```

Dividers:

``` text
width: 1px
height: 60–70%
alignSelf: center
```

Never use separate absolute coordinates for the three columns.

------------------------------------------------------------------------

## PrimaryButton

``` text
height: 52–56px
radius: 16px
horizontal padding: 20px
```

Use brand primary.

Text is centered vertically and horizontally.

Icon + text:

``` text
Icon — 8px gap — Text
```

------------------------------------------------------------------------

## TextInput

``` text
height: 52–56px
radius: 14–16px
horizontal padding: 16px
```

Label should sit above the field.

Use consistent spacing:

``` text
Label → 8px → Input
```

------------------------------------------------------------------------

## SectionHeader

Use:

``` text
Section title
Optional action
```

Keep title and action on the same baseline when they belong to the same
row.

------------------------------------------------------------------------

## JobCard

Suggested structure:

``` text
JobCard
├── Job icon
├── Title
├── Location
├── Distance
├── Job information
│   ├── Pay
│   ├── Schedule
│   └── Date
├── Tag
└── Action
```

All internal columns should use equal/flex widths.

------------------------------------------------------------------------

## BottomNavigation

All items have equal width.

Do not manually assign x coordinates.

Each item:

``` text
icon
8px
label
```

Voice uses the emphasized orange circular action.

------------------------------------------------------------------------

## Theme

Components must never directly depend on light/dark mode.

Use:

``` text
theme.colors.background.primary
theme.colors.surface.primary
theme.colors.text.primary
theme.colors.border.default
```

This allows System / Light / Dark to work automatically.
