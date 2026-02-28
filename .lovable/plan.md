
# Align Scripture Reference to Bottom-Right of Slide

## What Changes

Move the scripture reference (e.g., "— James 3:1 (ESV)") from centered to the bottom-right corner of the verse slide, in all three rendering contexts.

## File: `src/pages/SlideEditor.tsx`

### 1. Preview mode (lines 676-688)
- Wrap the scripture content in a flex column with `flex-1` so the verse text stays centered
- Position the reference line with `text-right self-end` so it sits at the bottom-right
- Add `mt-auto` to push the reference down, and `w-full` so `text-right` works across the full width

### 2. Edit mode (lines 996-1006)
- Same layout adjustment: the scripture textarea stays centered, the reference input gets `text-right` alignment instead of `text-center`
- Keep the input full-width but align text to the right

### 3. Export files (no changes needed)
- PowerPoint and ProPresenter exports already have their own positioning logic and are separate from the on-screen rendering

## Visual Result

Before:
```
    "Let not many of you be teachers..."
         — James 3:1 (ESV)
```

After:
```
    "Let not many of you be teachers..."
                        — James 3:1 (ESV)
```

The reference will be right-aligned at the bottom of the slide content area.
