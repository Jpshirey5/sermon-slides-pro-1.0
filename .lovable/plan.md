

# Dashboard, Login, and Manuscript Study Guide Generator (with Conference/Training Mode)

## Overview

This adds four major capabilities to SermonSlides:

1. **Login page and authentication UI** (localStorage-based for now, ready for Supabase later)
2. **Dashboard** where logged-in users manage saved sermons and access tools
3. **Manuscript Study Guide Generator** that converts uploaded sermon documents into multi-week study guides
4. **Multi-Session Conference/Training Builder** within the manuscript generator for creating breakout session agendas and teaching materials for leadership events

The existing "Get Started" flow (pay-per-export, no login) remains untouched.

---

## New Pages and Routes

| Route | Page | Purpose |
|-------|------|---------|
| `/login` | `Login.tsx` | Email/password login form (UI only, no backend yet) |
| `/dashboard` | `Dashboard.tsx` | User's home: saved sermons list + two tool buttons |
| `/dashboard/create` | Reuses `CreateSermon.tsx` | Same sermon form, "Back" goes to dashboard |
| `/manuscript` | `ManuscriptGenerator.tsx` | Upload document, choose output type, generate content |

---

## 1. Homepage Changes

### Header
- Add a **"Login"** button next to "Get Started" in desktop and mobile nav

### Hero
- Keep **"Get Started Free"** button (links to `/create`)
- Replace "Watch Demo" with a **"Login"** button linking to `/login`

### Pricing
- Add a **monthly subscription** card next to the existing pay-per-export card
- Highlights: dashboard, unlimited exports, manuscript generator, conference builder, saved presentations

### CTA Section
- Add a secondary "Login" button next to "Get Started Free"

---

## 2. Login Page

A clean form with email, password, "Log In" button, and placeholder links for signup and forgot password. On submit, stores a `logged_in` flag in localStorage and navigates to `/dashboard`. No real auth yet -- ready for Supabase integration later.

---

## 3. Dashboard Page

### Layout

Top bar with logo and "Log Out" button, then two large tool cards side by side:

```text
+----------------------------------+----------------------------------+
|  Sermon Slide Creator            |  Manuscript Study Guide          |
|                                  |  & Conference Builder            |
|  Create sermon presentations     |                                  |
|  with auto scripture lookup      |  Upload a manuscript and         |
|  and export to PowerPoint        |  generate study guides,          |
|  & ProPresenter.                 |  training materials, or          |
|                                  |  multi-session conference        |
|  [Create New Presentation]       |  breakout agendas.               |
|                                  |                                  |
|                                  |  [Get Started]                   |
+----------------------------------+----------------------------------+
```

### Saved Items Section (below the cards)

- **My Presentations** -- grid of saved sermon presentations (click to open in editor, delete, or "Create Study Guide" from slides)
- **My Study Guides and Conferences** -- grid of saved study guides and conference plans

---

## 4. Manuscript Study Guide Generator (the big new feature)

### Step 1: Input

- **Document upload** (drag-and-drop or file picker) for `.txt` files, or a **text area** for pasting content directly
- OR pre-loaded from a saved presentation (via `?fromPresentation=:id`)
- **Title input** for the output name

### Step 2: Choose Output Type

This is the key addition. After uploading/pasting content, the user picks one of two modes:

```text
+--------------------------------------+--------------------------------------+
|  Study Guide                         |  Conference / Training Event         |
|                                      |                                      |
|  Break the manuscript into a         |  Turn the manuscript into a          |
|  multi-week study guide with         |  multi-session conference or         |
|  discussion questions, key           |  training event with breakout        |
|  points, and scripture refs.         |  sessions, teaching outlines,        |
|                                      |  and facilitator notes.              |
|  Ideal for small groups,             |  Ideal for leadership retreats,      |
|  Bible studies, and Sunday           |  pastor conferences, and             |
|  school classes.                     |  training workshops.                 |
|                                      |                                      |
|  [Select]                            |  [Select]                            |
+--------------------------------------+--------------------------------------+
```

### Study Guide Mode (existing plan)

- **Number of weeks**: 1-12, default 4
- Output per week: title, key points, discussion questions, scripture references, raw content section
- Uses structured text splitting (paragraph/heading-based distribution across weeks)

### Conference / Training Mode (new addition)

- **Number of sessions**: 1-12, default 3
- **Event title** and optional **event description**
- **Session duration** selector: 30 min, 45 min, 60 min, 90 min
- Output per session:
  - **Session title** (derived from content themes)
  - **Session type label**: "Breakout Session", "Main Session", "Workshop" (user can edit)
  - **Teaching outline** with 3-5 bullet points
  - **Key takeaways** (2-3 per session)
  - **Discussion/activity prompts** for audience engagement
  - **Scripture references** found in that section
  - **Facilitator notes** (practical tips for the session leader)
- An **event overview page** at the top summarizing all sessions, their order, and the overall theme

### Processing Logic

Since there is no AI backend yet, both modes use structured text splitting:
- Parse document into sections by paragraphs or line breaks
- Distribute sections evenly across the chosen number of weeks/sessions
- Generate templated titles, questions, and outlines based on content keywords
- When AI is added later, this logic gets replaced with real generation

### Output Preview

- Tabbed or accordion view showing each week/session
- **Export**: Download as formatted text or copy to clipboard
- **Save to dashboard**: Persists in localStorage

---

## 5. Data Models

### Study Guide (in `src/lib/study-guides.ts`)

```text
StudyGuide {
  id, title, sourceType, sourceId?,
  outputType: 'study-guide' | 'conference',
  
  // For study guides:
  weeks?, content[]  (week number, title, key points, discussion questions, scripture refs, raw content)
  
  // For conferences:
  eventTitle?, eventDescription?, sessionDuration?,
  sessions[]  (session number, title, type label, teaching outline, key takeaways,
               discussion prompts, scripture refs, facilitator notes, raw content)
  
  createdAt, lastModified
}
```

### Manuscript Parser (in `src/lib/manuscript-parser.ts`)

Two exported functions:
- `generateStudyGuide(text, title, weeks)` -- returns study guide content array
- `generateConference(text, title, sessions, duration)` -- returns conference sessions array

Both use the same text-splitting foundation but format output differently.

---

## 6. Navigation Flow

```text
Homepage
  |
  +-- "Get Started Free" --> /create --> /editor/:id  (existing pay-per-export flow)
  |
  +-- "Login" --> /login --> /dashboard
                                |
                                +-- "Sermon Slide Creator" --> /dashboard/create --> /editor/:id
                                |
                                +-- "Manuscript Study Guide & Conference" --> /manuscript
                                |     +-- Study Guide mode --> preview --> save
                                |     +-- Conference mode --> preview --> save
                                |
                                +-- Click saved presentation --> /editor/:id
                                |
                                +-- "Create Study Guide" on a presentation --> /manuscript?fromPresentation=:id
```

---

## 7. Context-Aware Navigation

When `CreateSermon` or `SlideEditor` is accessed from the dashboard (detected via location state or query param), back buttons say "Back to Dashboard" and navigate to `/dashboard` instead of `/`.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/pages/Login.tsx` | Login page UI |
| `src/pages/Dashboard.tsx` | Dashboard with tool cards and saved items |
| `src/pages/ManuscriptGenerator.tsx` | Upload, mode selection, preview, and save for both study guides and conferences |
| `src/lib/study-guides.ts` | Data types and localStorage utilities for study guides and conferences |
| `src/lib/manuscript-parser.ts` | Text parsing, splitting, and templated content generation for both modes |

## Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add routes: `/login`, `/dashboard`, `/dashboard/create`, `/manuscript` |
| `src/components/landing/Header.tsx` | Add "Login" button |
| `src/components/landing/Hero.tsx` | Replace "Watch Demo" with "Login" button |
| `src/components/landing/Pricing.tsx` | Add subscription pricing card |
| `src/components/landing/CTA.tsx` | Add "Login" button |
| `src/pages/CreateSermon.tsx` | Context-aware back navigation |
| `src/pages/SlideEditor.tsx` | Add "Create Study Guide" action |

## What This Does NOT Include (deferred)

- Real authentication (Supabase) -- login is localStorage-based placeholder
- AI-powered content generation -- uses structured text splitting for now
- Payment/subscription integration -- pricing card is informational
- Signup page -- placeholder "coming soon" toast
- PDF/DOCX file parsing -- starts with plain text and paste; richer formats added later

