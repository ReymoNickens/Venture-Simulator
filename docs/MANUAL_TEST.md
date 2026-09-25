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

## Practice team (single account)

1. New student profile → Team → **Join a practice team**. Home shows "Spot a real problem".
2. Idea wizard: five steps. Close the tab midway and reopen — answers are still there. Seal it (confetti).
3. Decide: ten ideas are visible. Vote for one with a reason → votes are revealed (the practice classmates have voted).
4. Propose a venture with a ≥60-character rationale. Practice classmates respond (two object with reasons) → venture agreed; "How your group agreed" lists everyone's stance.
5. Venture → Evidence: log one (try a photo; the list shows a thumbnail, "Load full photo" fetches the original).
6. Assumptions: add a critical / low-confidence one → it appears in "Test first" on the Board.
7. Test it → pick a method, set "we're right if", save. Record the result with evidence → assumption becomes Held up / Challenged; home suggests the next step.
8. Advisor: the idea-stage tab says "Only you can see this chat"; the evidence tab is shared. Offline blocks it with the explicit message.
9. Account menu → Practise working offline: log evidence, go back online, confirm it syncs.

## Lecturer

1. Second account → onboarding → I'm a lecturer → code `DEMO-LECTURER` (preview) → cohort dashboard.
2. Groups show stage, ideas sealed, votes, evidence, tests; "Needs a nudge" lists quiet/stuck groups.
3. Open a group: contribution table per student, ideas with vote reasons, proposals and responses, evidence, tests, advisor log (including private idea chats), timeline.
4. Send a note → it appears at the top of each member's home.
5. For a group still writing ideas with ≥2 sealed: "Open comparison now" → only submitters vote.

## Privacy / isolation

A student in group A must not see group B’s opportunities, evidence, or advisor log through the UI. Server functions scope every query by membership of the signed-in user.

A lecturer sees only the groups in offerings they joined as lecturer. Try opening a group URL from another course → "You don't teach this group".
