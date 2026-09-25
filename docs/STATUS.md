# Where we left off

_Paused 25 September 2026 on branch `claude/gifted-euler-jn2g54`, which continues `claude/determined-keller-y1up9y`._

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
