# 0009: The advisor is named per cohort and says it is an AI

**Context.** The brief says the advisor is named after the students' lecturer "using the existing mechanism". No mechanism exists.

**Decision.** `course_offerings.advisor_display_name` (e.g. "Dr Mensah"), edited by the cohort's lecturer. The UI shows "Dr Mensah's advisor (AI)", and the system prompt tells the model it speaks *for* the lecturer's course but is not the lecturer. Students must never believe a real person wrote a challenge, and a lecturer must not be quoted as having said something they did not.

**Consequences.** Built in Slice D with the advisor rework. Default when unset: "Course advisor (AI)".
