# Where we left off

_Paused 25 September 2026 on branch `claude/determined-keller-y1up9y`._

## Done

- The full student route for ENT 302 has 11 stops, from forming a team to the
  pitch. Long forms ask one question per screen, work offline and are set in
  Cape Coast and around UCC.
- The lecturer console is built for one lecturer to 400 students. It has three
  tabs (Groups, Activity, Course), messages with groups, feedback levels with
  ready-made wording, deadlines, announcements, market shocks and a marks sheet.
- Visual direction: sticker-collage minimalism. Sections are folded until
  tapped, each screen has one main button, and there are no cultural symbols.
  See `docs/UX-AUDIT.md`.
- Checks: typecheck, lint (2 old warnings), 101 tests and the build all pass.
  Student and lecturer walkthroughs in a browser showed no errors.

## Ideas not started yet

1. Weekly recap cards that students can share, like Spotify Wrapped.
2. A sticker book: the 11 stop stickers plus rare ones for achievements.
3. Crew streaks: a small flame counter that real fieldwork keeps alive each week.
4. Voice-note feedback from lecturers.
5. A Pitch Day live board with class votes.

## Before a real rollout

- Pilot with one lecturer and a few groups, and track the measures listed in
  `docs/UX-AUDIT.md`.
- Set the production settings: database connection, sign-in secret, staff
  access code and advisor API key (see `README.md`).
- Decide whether to keep the name "Experiential Venture Platform"
  (the `VITE_APP_NAME` setting).
