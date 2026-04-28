# Conversion Workflow Upgrade Notes

This pass positions Sermon Slide Pro as the fastest way to build a complete sermon slide deck before exporting to PowerPoint or ProPresenter.

## Value Metrics

Value metrics live in `src/lib/value-metrics.ts` so dashboard cards, editor copy, and export modals use the same calculation:

- Base estimate: 20 minutes saved
- 1 minute per generated slide
- 3 minutes per scripture passage inserted

Metrics are display-only and do not affect export files.

## Export Modals

Guest export still uses the existing one-time Stripe checkout flow. The modal now frames the deck as ready and shows time saved, slide count, scripture count, and export formats before the user unlocks export.

Subscribed users are not blocked. Their export modal stays lightweight and continues to offer PowerPoint and ProPresenter choices.

## Creator Preferences

The creator stores three lightweight preferences inside existing sermon `formData`:

- `proPresenterMode`
- `slideStyle`
- `themeStyle`

No migration is required. These preferences are intentionally conservative and only influence generated slide defaults/chunking.

## Weekly Shortcut

The dashboard shortcut creates a new presentation from the most recent completed sermon form, updates the date to today, regenerates slides, and opens the editor. It does not mutate the original sermon.

## QA Focus

Verify create, review, editor, PowerPoint export, ProPresenter export, guest checkout, subscribed export, dashboard draft open, and weekly shortcut flows after changes.
