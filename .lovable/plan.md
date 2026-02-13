

# Reorganize Dashboard into Two Tabs

## Overview

Replace the current single-page dashboard layout with two tabs using Radix UI Tabs:
- **Sermon Slide Creator** tab -- centered card + "Create New Presentation" button, then "My Presentations" grid below
- **Training Creator** tab -- centered card + "Get Started" button, then "My Study Guides & Conferences" grid below

The welcome header and top bar remain unchanged above the tabs.

## Layout

```text
+----------------------------------------------------------+
| [Logo] SermonSlides                        [Log Out]      |
+----------------------------------------------------------+
| Welcome back                                              |
| user@email.com                                            |
|                                                           |
| [ Sermon Slide Creator ]  [ Training Creator ]   <-- tabs |
|                                                           |
| (Tab 1 - Sermon Slide Creator)                            |
|         +-----------------------------+                   |
|         |  [icon]                     |                   |
|         |  Sermon Slide Creator       |                   |
|         |  description...             |                   |
|         |  [Create New Presentation]  |                   |
|         +-----------------------------+                   |
|                                                           |
|  My Presentations                          [+ New]        |
|  [card] [card] [card]                                     |
|                                                           |
| (Tab 2 - Training Creator)                                |
|         +-----------------------------+                   |
|         |  [icon]                     |                   |
|         |  Study Guide & Conference   |                   |
|         |  description...             |                   |
|         |  [Get Started]              |                   |
|         +-----------------------------+                   |
|                                                           |
|  My Study Guides & Conferences             [+ New]        |
|  [card] [card] [card]                                     |
+----------------------------------------------------------+
```

## Technical Details

### File: `src/pages/Dashboard.tsx`

1. Import `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@/components/ui/tabs`
2. Wrap the tool cards and lists inside a `<Tabs defaultValue="sermons">` component placed after the welcome section
3. Add a `<TabsList>` with two triggers:
   - `<TabsTrigger value="sermons">Sermon Slide Creator</TabsTrigger>`
   - `<TabsTrigger value="training">Training Creator</TabsTrigger>`
4. **Tab 1 (`sermons`)**: Contains the Sermon Slide Creator card (centered with `max-w-lg mx-auto`) followed by the "My Presentations" section
5. **Tab 2 (`training`)**: Contains the Study Guide & Conference Builder card (centered with `max-w-lg mx-auto`) followed by the "My Study Guides & Conferences" section
6. Remove the old side-by-side grid layout for the two tool cards

No other files need to change -- this is a layout-only refactor within `Dashboard.tsx`.
