# Doondo --- Theme Architecture

## Goal

Doondo supports:

``` text
System
Light
Dark
```

The same UI layout is used in all modes.

Only semantic color/elevation tokens change.

------------------------------------------------------------------------

# 1. Theme Selection

Default:

``` text
System
```

User can choose:

``` text
System
Light
Dark
```

When System is selected, follow the device appearance.

------------------------------------------------------------------------

# 2. Semantic Tokens

Application code should use semantic tokens.

Good:

``` text
colors.background.primary
colors.surface.primary
colors.text.primary
colors.text.secondary
colors.border.default
colors.brand.primary
```

Avoid:

``` text
#FFFFFF
#000000
#2563EB
```

inside individual components.

------------------------------------------------------------------------

# 3. Light Theme

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

brand.primary           #2563EB
brand.primaryLight      #3B82F6
brand.primaryDark       #1D4ED8

voice                   #F97316

success                 #16A34A
warning                 #F59E0B
error                   #EF4444
```

------------------------------------------------------------------------

# 4. Dark Theme

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

brand.primary           #60A5FA
brand.primaryLight      #93C5FD
brand.primaryDark       #3B82F6

voice                   #F97316

success                 #22C55E
warning                 #F59E0B
error                   #EF4444
```

------------------------------------------------------------------------

# 5. Theme Switching

When the user changes theme:

-   Update the theme provider.
-   Re-render components using semantic tokens.
-   Do not rebuild individual screens.
-   Do not duplicate screen components.
-   Preserve layout and spacing.

------------------------------------------------------------------------

# 6. Contrast

Primary text must be highly readable.

Secondary text should be visually weaker but readable.

Disabled content should use reduced emphasis, not an unrelated color.

Do not reduce contrast just to make a screen look softer.

------------------------------------------------------------------------

# 7. Dark Mode Rules

Dark mode is not simply:

``` text
white → black
```

Use layered dark surfaces.

Example:

``` text
background
    ↓
surface
    ↓
elevated surface
```

This creates hierarchy without heavy shadows.

Avoid pure black cards on a pure black background because boundaries
become unclear.

------------------------------------------------------------------------

# 8. Light Mode Rules

Light mode should use:

-   Soft off-white background
-   White cards
-   Light borders
-   Blue primary actions
-   Dark readable text

Avoid putting heavy shadows around every card.

------------------------------------------------------------------------

# 9. Gradient Rules

Gradients may be used for:

-   Hero areas
-   Brand banners
-   Selected promotional sections

Do not use gradients on every component.

The gradient should not reduce text readability.

------------------------------------------------------------------------

# 10. Voice Color

Voice is a special product action.

Use orange consistently:

``` text
#F97316
```

Use it for:

-   Voice navigation action
-   Voice recording state
-   Voice-specific primary actions

Do not use orange as a general replacement for the brand blue.
