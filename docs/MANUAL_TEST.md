# Manual end-to-end test

## Authentication

1. Open the app signed out → landing → Enter the studio.
2. Create an email account or use Google / X.
3. Confirm you land on academic-profile onboarding, not inside another student’s record.
4. Index number must be unique (try a duplicate).

## Group

1. Create a group. Note the join code and generated group number.
2. In a second account (or a second email), join with that code.
3. Join again with the same account → rejected.
4. After the group is at capacity → join is rejected.

## Demonstration cohort (single account)

1. New profile → Enter demonstration cohort.
2. Confirm 10 members (you + 9 demo peers).
3. Open opportunity. You must **not** see peer write-ups yet.
4. Save a draft while **Simulate offline** is on. Banner: saved locally.
5. Turn simulation off. Draft syncs.
6. Submit a complete opportunity.
7. Selection opens. Peer opportunities become visible.
8. Record your preference and rationale.
9. Record the group decision with a rationale that names the alternatives.
10. Rejected opportunities remain, marked rejected.
11. Log evidence (text + photo). Classify it.
12. Log a critical / low-confidence assumption.
13. Link evidence as supports or challenges.
14. Ask the advisor a question. It should challenge, not congratulate.
15. Simulate offline and confirm the advisor is blocked with the explicit offline message.
16. Log evidence offline, reconnect, confirm it syncs.

## Privacy / isolation

A student in group A must not see group B’s opportunities, evidence, or advisor log through the UI. Server functions scope every query by membership of the signed-in user.
