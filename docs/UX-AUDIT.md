# UX audit — every screen, every sentence

The test for each element: **does it earn its place on a phone screen, in a
UCC hall, with patchy data, in front of a student who has five other things to
do?** If not, it goes, moves behind a tap, or becomes one question later.

The benchmark isn't the look of top apps — it's their discipline. Bolt shows
one decision at a time (where to? → which ride? → confirm). Duolingo never shows
the whole course, only today's lesson and a locked glimpse of the next one.
Apple's set-up flows ask one question per screen, in plain words, with the
reason underneath. Tesla's screen has one primary action and hides the rest.

## Principles

1. **One question per screen.** Long forms are where motivation dies. Every
   form longer than three fields becomes a step flow: one question, one hint,
   a progress bar, *Next*. Answers autosave on the phone.
2. **Show today, tease tomorrow.** The student sees their next move, not the
   whole syllabus. The next stop is visible but sealed, with one line that
   makes them want to open it.
3. **Every page has one job and one primary button.** Everything else is
   secondary, collapsed, or on another screen.
4. **Earned moments.** Finishing a stop is stamped, celebrated in a beat, and
   immediately reveals what's next. Silence after effort kills momentum.
5. **Here, not anywhere.** Examples, places, prices and shocks come from Cape
   Coast and UCC — Kotokuraba, Science Market, Amamoma, Oguaa Hall, the Pedu
   trotro — so the work feels like it happens in town, not in a textbook.
6. **Words are interface.** Second person, present tense, one idea per
   sentence, no jargon before it is earned. A hint says *why*, in one line.
7. **The lecturer reads sentences, not tables.** "Group 14 interviewed six
   traders at Kotokuraba this week" beats a column of counts. Any group is one
   tap from a message.
8. **Nothing is lost, nothing is shamed.** Offline saves say so plainly.
   Flags about inactivity go to the lecturer, never to a public leaderboard.

## Page-by-page findings and decisions

### Landing
- *Found:* strong promise, but generic places ("hostel, market, lorry station").
- *Decision:* name Cape Coast. The route preview becomes a journey through
  town: each stop is set somewhere real.

### Onboarding
- *Found:* four fields on one card, fine. A course dropdown with one option is noise.
- *Decision:* hide the offering picker when there is only one. Welcome in one line: "Akwaaba."

### Today (home)
- *Found:* next-stop card is good, but the team list, answered shocks and
  announcements compete with it; the page scrolls long before anything new happens.
- *Decisions:*
  - One hero: the next move, with a single button.
  - Below it, only what changed since the last visit: new messages from the
    lecturer, an open market shock, teammates' latest actions ("Kofi logged an
    interview at Kotokuraba · 2h").
  - A sealed "next stop" teaser under the hero — the suspense.
  - The full team roster moves to Team up.

### Stop pages (all eleven)
- *Found:* each stop opens with emblem, mission, a four-line checklist,
  feedback, then the work, then a reflection, then the advisor. Too much
  before the first action; the checklist reads like homework.
- *Decisions:*
  - Header shrinks to: stop number, title, one-line mission, a progress ring
    ("2 of 4"). The checklist opens on tap.
  - The first thing below the header is the stop's primary action.
  - The reflection stays sealed until the stop is done ("Unlocks when this
    stop is complete"). Reflecting on unfinished work is noise.
  - Completing the last criterion triggers the stamp moment and reveals the next stop.

### Spot a problem
- *Found:* ten questions on one page. This is the first real task, and the
  heaviest-looking page in the app.
- *Decision:* ten screens, one question each, in field order: what you saw →
  who → where (tap a Cape Coast place) → what you counted → how they cope →
  why it matters → your hunch → who'd pay → how → what you don't know.
  Review screen at the end, then submit. Drafts autosave.

### Choose together
- *Found:* ten long cards, then forms. Good privacy rules; heavy page.
- *Decision:* cards stay collapsed to one line each; preference is a tap
  plus one sentence; the proposal form appears only when it can be used.

### What must be true? / Go and listen / Build & test
- *Found:* the interview form has fourteen fields visible at once; the
  assumption form three; the test form eight.
- *Decision:* all become step flows. Interviews: consent → who → where → their
  words → what they spend → pain → would they pay → surprise → link to an
  assumption → save. Suggested places come from a Cape Coast list.

### Model the business / Numbers / Feasibility / Pitch
- Already visual and task-shaped. Keep; tighten copy; localise examples
  (kenkey, fish from the Cape Coast beach, printing at Science).

### Notebook / Advisor
- Keep. Notebook's new entry becomes a three-step flow (what → kind → photo).

## Lecturer

- *Found:* the queue explains *who* needs attention but not *what groups are
  doing*; there is no way to talk to a group.
- *Decisions:*
  - **What's happening** feed: the cohort's notable events as sentences,
    newest first, filterable to "my groups".
  - **One-line status** per group in the queue ("At stop 5 · 6 interviews,
    3 this week · last active 2h").
  - **Messages**: a thread per group between lecturer and students. Send from
    the queue row, the group page, or to one student. Students see unread
    messages on Today and a bell in the header, and can reply.
  - Bulk message to every flagged group in one action.

## Measures to watch in the pilot

- Time from sign-up to first submitted opportunity.
- Share of students completing each stop, and the stop where groups stall.
- Interviews per student per week.
- Lecturer messages sent per week and median reply time from groups.
