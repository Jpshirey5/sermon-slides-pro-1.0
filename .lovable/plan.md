

# Remove "Create through Sermon Outline" Feature

## What Will Be Removed

1. **Dashboard button** -- The "Create through Sermon Outline" button and its `<Link>` wrapper in `src/pages/Dashboard.tsx` (lines 138-143)
2. **Route** -- The `/dashboard/outline-upload` route in `src/App.tsx` (line 42) and its import (line 19)
3. **Page component** -- Delete `src/pages/OutlineUpload.tsx`
4. **Parser library** -- Delete `src/lib/outline-parser.ts`

## What Will NOT Be Touched

- All other dashboard functionality (Sermon Slide Creator card, Training Creator tab, presentations list, study guides list)
- All other routes and pages
- No other components, libraries, or styles

## Technical Details

### `src/pages/Dashboard.tsx`
- Remove lines 138-143 (the `<Link to="/dashboard/outline-upload">` block containing the "Create through Sermon Outline" button)
- No other changes to this file

### `src/App.tsx`
- Remove the `import OutlineUpload` line (line 19)
- Remove the `<Route path="/dashboard/outline-upload" ...>` line (line 42)

### Deleted Files
- `src/pages/OutlineUpload.tsx`
- `src/lib/outline-parser.ts`

