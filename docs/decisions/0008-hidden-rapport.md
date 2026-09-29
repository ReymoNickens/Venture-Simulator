# 0008: Hidden rapport mechanic

**Context.** The brief keeps a permanently hidden soft-skills and rapport mechanic "as previously decided", but nothing of that decision is recorded in the repo. A hidden factor that changes assessed results is a fairness risk, especially if it could depend on who a student is rather than what they do.

**Decision.**
1. **Input is only what the group writes** in the simulation's communication moments: a loan application, a supplier negotiation message, a pitch to an investor. It is scored on observable qualities (completeness, politeness markers, formality, a clear ask, correct figures). It **never reads identity** (name, gender, programme, index number, language background) and never uses an AI "impression" of the writer.
2. **"Persona" means a venture persona** chosen by the scenario (e.g. a first-time market trader vs a registered campus business), not a student demographic.
3. **Effect is bounded**: at most ±10% on process outcomes only (loan decision time, loan approval threshold, supplier credit terms, negotiated price within the band). It never changes customer demand directly.
4. **Excluded from the graded financial component.** Competency and financial scores are computed on rapport-neutral figures, which the engine produces alongside the actual ones.
5. Visible only in lecturer/audit views (explanation lines with `visibility: "lecturer"`), filtered out of every student API response, with a test.

**Consequences.** The mechanic can teach "how you ask matters" without letting a hidden factor move a student's mark. Built in Slice C.
