# 0010: Leader election

**Context.** Slice D requires "the elected leader submits". There is no leader today.

**Decision.** Any active member can open an election. Each active member has one vote and can change it until the election closes. A candidate wins with a **majority of active members** (not just of votes cast). The leader can hand over to another member, who must accept. The cohort's lecturer can appoint a leader (audited) to unblock a stuck group. Until a leader exists, no simulation decision set can be submitted. Every vote, handover and appointment is an activity event (contribution evidence).

**Consequences.** Built as the "Group governance" step before Slice D, together with roles and tasks.
