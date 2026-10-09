# Conversion Workflow Notes

File export (PowerPoint, ProPresenter, PDF) was removed in October 2026. Sermon Slide Pro now presents sermons itself; see `docs/presenter.md`. The export notes that used to be here are in git history.

## Value Metrics

Value metrics live in `src/lib/value-metrics.ts` so dashboard cards and editor copy use the same calculation:

- Base estimate: 20 minutes saved
- 1 minute per generated slide
- 3 minutes per scripture passage inserted

Metrics are display-only.

## Creator Preferences

The creator stores lightweight preferences inside existing sermon `formData`:

- `slideStyle`
- `themeStyle`
- `proPresenterMode` (legacy: there is no longer a control for it, but older sermons keep the value, and the presenter still honors its "no quotation marks" setting)

No migration is required. These preferences only influence generated slide defaults and chunking.

## Weekly Shortcut

The dashboard shortcut creates a new presentation from the most recent completed sermon form, updates the date to today, regenerates slides, and opens the editor. It does not change the original sermon.

## QA Focus

Verify create, review, editor, Present from the editor, the Services builder, the presenter (operator and projector windows), dashboard draft open, and the weekly shortcut after changes.
