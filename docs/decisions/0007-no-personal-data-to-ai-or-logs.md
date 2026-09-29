# 0007: No personal data in AI context or logs

**Context.** The advisor sent students' full names to the external model provider. The brief asks for logging "without unnecessary personal data".

**Decision.** The advisor brief (`src/lib/server/advisor-context.ts`) refers to students as "Member 1..n", numbered by internal id. Structured logs (`src/lib/server/log.ts`) write only allow-listed fields; others are dropped, and only their names are recorded. Stored advisor messages stay in our own database under RLS, as before.

**Consequences.** Student-authored free text (an opportunity description) still goes to the model, because the advisor must read it to challenge it. Students are told the advisor is an AI service (ADR 0009).
