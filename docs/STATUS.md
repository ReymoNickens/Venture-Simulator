# Where we left off

_Updated 28 September 2026 on branch `claude/vigilant-johnson-9lkcia`, which continues `claude/gifted-euler-jn2g54` (itself a continuation of `claude/determined-keller-y1up9y`). This is the line to merge into `main`._

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
- Weekly recap cards (`/studio/recap`): each crew gets a card for each week,
  from Monday to Sunday. It shows interviews, places, tests and notes, a
  persona ("The Street Team", "The Makers"…), one interview quote given with
  consent, and the week's big moments. Share makes a 1080×1920 status image
  and opens the phone's share sheet, or saves the image when the phone can't
  share files. The card shows crew totals only: no names, no rankings. Today
  offers last week's card until it has been opened, and has a "See your week"
  link under the team feed.
- Sign-in: students activate a roster row (email + index number) and then
  sign in with either; lecturers create an account with STAFF_ACCESS_CODE.
  See README "Sign-in". No Grok code or services remain.
- Checks: typecheck, lint (2 old warnings), tests and the build all pass.
  Student and lecturer walkthroughs in a browser showed no errors.

- Offline and integrity fixes (28 Sep): an opportunity is sealed once the group
  can see every idea; a late offline edit is kept in `sync_conflicts` instead of
  being stuck or overwriting; failed syncs back off and retry in the background;
  evidence and assumption forms autosave drafts on the device. See
  `docs/ARCHITECTURE.md` → Offline.

## Known gaps

- Evidence photos are stored as data URLs in Postgres, not in private object
  storage (see `docs/DEVIATIONS.md` §3). Fine for a pilot; move to a storage
  bucket before a full cohort.
- `sync_conflicts` rows are recorded but nothing in the UI shows or resolves
  them yet. A lecturer view of them is the natural next step.
- Two migrations share the number 0006 (`0006_roster`, `0006_group_governance`).
  They are independent and must not be renamed; a test blocks any new clash.
- `claude/studio-ux-lecturer` and `claude/beautiful-keller-pz2pts` hold
  competing redesigns that were never merged. Cherry-pick from them if needed;
  do not merge them wholesale.

## Ideas not started yet

1. A sticker book: the 11 stop stickers plus rare ones for achievements.
2. Crew streaks: a small flame counter that real fieldwork keeps alive each week.
3. Voice-note feedback from lecturers.
4. A Pitch Day live board with class votes.

## Before a real rollout

- Pilot with one lecturer and a few groups, and track the measures listed in
  `docs/UX-AUDIT.md`.
- Set the production settings: database connection, BETTER_AUTH_URL and
  secret, staff access code and ANTHROPIC_API_KEY (see `README.md`), and load
  the student roster with `scripts/roster-import.mjs`.
- Decide whether to keep the name "Experiential Venture Platform"
  (the `VITE_APP_NAME` setting).
