# Builder storage contract

The builder saves authored source documents synchronously in browser `localStorage` under the dedicated key `pickleballpark-builder-v1`. It does not store playback samples, playhead state, camera preferences, theme preference, or service-worker cache data. Incomplete documents are valid storage inputs when the document validator accepts them.

The stored value is one versioned JSON envelope:

```json
{
  "schemaVersion": 1,
  "drafts": [],
  "lastId": null
}
```

Writing the complete envelope with one `setItem` call is the commit point. A quota or storage failure leaves the previously committed envelope intact. Malformed or unsupported stored data is reported and kept verbatim for recovery; the module never silently deletes it. Version 1 is the only supported storage-envelope version. A future envelope requires an explicit migration before it can be opened.

`DraftStore` receives the play document's `validateDocument` function through its constructor. This keeps persistence independent of the compiler while making every save, open, import, and export pass the production schema validator. The store additionally rejects cyclic or non-plain values, dangerous prototype keys, non-finite numbers, documents without bounded string identity/title fields, JSON over 512 KiB, and libraries over 50 drafts. The document validator owns the complete schema, including schema version 1, the 99-shot maximum, enums, coordinate bounds, plain-text policy, and rejection of URL/HTML-shaped fields.

JSON import only returns a validated detached document; callers choose whether to save it. JSON export emits only the validated source document. Browser storage remains local to the current browser profile and origin and is not an absolute backup, so export is the durable manual backup path.

Untouched lesson copies and New Play previews remain in memory until an actual authored edit. Playback, no-op edits and opening an existing saved play do not create new library entries. Save As, import and accepted Random Rally results explicitly create saved copies; the candidate is committed before replacing the visible document, so failed capacity or quota writes preserve the current document and history.

My Plays remains accessible when all 50 slots are occupied. Its Delete action confirms removal of the saved copy, preserves the current court and checks for changes from another tab before deleting. Deleting the currently open saved play leaves an unsaved preview; it is saved again only on an edit or explicit save. A capacity-only error permits opening an existing play when the current document has no unsaved edits. Dirty work must first be saved or retained as a copy; users can delete a different saved play and retry, or export a backup without losing the visible work.

`EditHistory` stores detached source snapshots. `commit` drops the redo branch, `undo` and `redo` return clones, and the configured limit bounds retained undo transitions. Playback frames and derived compiler output must never be committed. The integrating session decides which user operations form a single authored edit and separately marks dependent later shots for review.

## Intermediate movement paths

Version 1 retains imported `movement.waypoints` verbatim but only animates the final destination. The controller requires a session-only **Preview destination only** acknowledgement before advancing such a document. Affected path changes invalidate that acknowledgement; reload asks again. This does not migrate or rewrite source data. See [usability verification](COURT_CENTERED_BUILDER.md).

The iPhone continuation checks a draft against the last version observed by this tab before saving it. A conflict preserves the in-memory edit and the other tab's saved version; **Save a copy** gives the local work a new identity. Unrelated draft saves do not conflict. Imports are explicitly new copies, never identity-based replacements. Completed fields commit synchronously on change or background completion; there is no playback-frame autosave. Local browser storage remains a convenience, not a backup or cloud synchronization service.
