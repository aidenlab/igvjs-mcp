# The Viewer's own settings are kept beside the Session, not in it

Whether the Controls are shown (#37) is the first thing the Viewer needs to remember that igv.js's Session has no field for. igv.js reads `showNavigation` only when it creates the Navigation bar; its Session neither records nor restores it. The natural home is the Session, and juicebox-mcp put the same kind of setting there (its ADR-0009, "page-wide state crosses the Room and rides in the Session", with juicebox.js adding the field). Here that would mean changing igv.js, and changes to igv.js are hard to land. So the Viewer keeps it itself, as pragmatism rather than preference.

The Session stays exactly as igv.js defines it. Beside it the Viewer keeps its **Viewer settings**, today only whether the Controls are shown. They travel the way the Session does: the Viewer sends them to the Room after every change, by hand or by a Command; the Room keeps the latest; a Viewer that joins or reloads restores them from there. The Session summary reports them, so the model sees one account of what igv-bot shows.

## Considered Options

- **A field in igv.js's Session**, as juicebox did. Rejected: it needs igv.js to record and restore it.
- **An extra field the Viewer adds to the Session JSON**, as it already does for the crosshairs and centre line. Rejected: those are igv.js's own options, which igv.js reads back on restore; this one igv.js would ignore, and it would ride into the Shareable URL, which opens igv-webapp for someone else.
- **Kept nowhere**, as before #37. Rejected: the Controls now start hidden, so a reload or a late joiner would hide what the person had shown.

## Consequences

- The Shareable URL is made from the Session alone, so it never carries the Viewer settings, and igv-webapp opens with its navigation bar.
- The Viewer settings always record an explicit value. A Room with none, a new one or one from before #37, means the Controls are hidden.
- As with every other hand change, a click does not reach the other Viewers in the Room; a Command does. Keeping Viewers in step with each other's hand changes is still not attempted.
- The next Viewer-only setting joins the Viewer settings rather than the Session. If igv.js later gains a field for one, that one moves into the Session.
