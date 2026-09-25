# UX design notes

Who this is for: undergraduate entrepreneurship students on Ghanaian campuses, mostly on mid-range Android phones with prepaid data and patchy signal in halls, and the lecturers who run the course. The design goal is a studio students *want* to open between lectures, and a view lecturers trust when marking group work.

## What we borrowed, and from where

| Pattern | Borrowed from | Here |
|---|---|---|
| One obvious next step on the home screen | Duolingo's path and "continue" button | `nextStep()` in [`story.ts`](../src/lib/domain/story.ts) drives the dark hero card on `/studio` |
| A visible path with chapters, including the ones still ahead | Duolingo units, Coursera module lists | Journey map + "Later in the course" chips |
| Test card / learning card | Strategyzer *Testing Business Ideas* | `PlanTestForm` / `RecordResultForm` (we believe · we'll check by · we're right if) |
| Riskiest-assumption map (importance × certainty) | Assumption mapping (David Bland) | Board tab quadrant map |
| Sealed individual work before group discussion | Nominal group technique; Delphi | Sealed ideas and sealed votes |
| Share-to-WhatsApp invites | How Ghanaian classes actually coordinate | `wa.me` links for join codes and nudges |
| Bottom sheets for "add" forms, big tap targets instead of dropdowns | Material 3, mobile money apps | `Sheet`, `ChoiceGrid` |
| Teacher dashboard with "needs attention" first | Google Classroom, Khan Academy teacher view | `/teach` cohort, flags, contribution table |

## Principles

1. **Phone first.** Every screen is designed at 320–412 px first; forms are one question at a time (the idea wizard), inputs are 16 px (no iOS zoom), tap targets ≥ 44 px, and add-forms open as bottom sheets so the list stays in view.
2. **Low data.** Photos are compressed on the phone; lists carry a 240 px thumbnail and the full photo loads only on request. Fonts are two families with `display=swap`; nothing else is fetched from third parties.
3. **Offline is normal, not an error.** Idea drafts save to the phone on every keystroke; evidence, assumptions and test plans go to an outbox. The connection pill says what is happening in plain words.
4. **Fair by design.** Ideas and votes are sealed until everyone is in; objections need a reason; starting a group doesn't make you leader. The interface explains *why* each rule exists at the point it applies.
5. **Celebrate real milestones only.** Confetti when an idea is sealed, the venture is agreed, and the first test is finished — not for every tap. A failed test is framed as a finding ("it just saved you time and money").
6. **Local texture without costume.** A kente-inspired stripe, warm paper palette, "Akwaaba", GH₵ and campus examples (Hall B, tro-tro, MoMo) — the product still reads as a serious academic tool.
7. **Colour means chapter.** Each journey chapter has one colour used on its badge, progress and journey dot, so students always know where they are.

## Lecturer view

Lecturers need to answer three questions fast: *where is each group, who is doing the work, and who needs me?* The cohort page leads with a stage chart and a "needs a nudge" list (quiet ≥ 7 days, members not submitting, no evidence, no tests), then filterable group cards. The group page leads with contribution per student — explicitly "a reason to ask, not a verdict" — and keeps the raw record (ideas, vote reasons, proposals, evidence, tests, advisor log, timeline) one tab away. Lecturers can leave a note that appears at the top of every member's home, and can open comparison early when absent members are blocking a group.

## Accessibility

Semantic headings and landmarks, labelled controls (inputs sit inside their `<label>`), `role="radio"`/`aria-checked` on choice cards, `aria-pressed` on toggles, visible focus rings, `prefers-reduced-motion` respected (confetti and animations are skipped), and colour is never the only signal (status badges carry text).
