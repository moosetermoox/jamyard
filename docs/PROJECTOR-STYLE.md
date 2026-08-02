# Projector Style Rules

How in-activity screens format content (teacher's ask, 2026-08-02:
"it says Lanyard on almost everything… all centered text… awkward").

1. **Content owns the projector.** Once an activity starts, the brand
   shrinks to a faint corner mark (`body.in-activity h1`). Branding
   belongs to the lobby (join moment) only.
2. **First line = headline.** An announce message's first line, when
   short (≤60 chars), renders big, uppercase, centered. Everything
   after renders as body.
3. **Body text is never a centered blob.** Left-aligned, line breaks
   preserved (`white-space: pre-line`), max measure ~34ch, Nunito.
   Centering is reserved for short single "moments" (room code, a
   one-line reveal, a question).
4. **Lists are lists.** Response lists should render as rows, not
   inline blobs (future: style `.list` output as cards).
5. Implementation: `renderProjectorMessage()` in host.js (textContent
   only — all message text is untrusted) + `.msg-*` rules in
   host/styles.css. Extend to reveal/player surfaces next.
