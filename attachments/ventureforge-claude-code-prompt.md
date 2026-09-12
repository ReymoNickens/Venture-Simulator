# Claude Code Build Prompt — VentureForge Core Loop (MVP Slice 1)

Copy everything below into Claude Code as the initial project prompt.

---

## Project Context

You are building **VentureForge**, a Progressive Web App for university entrepreneurship education in Ghana. Students work in groups of 10 to move a real business idea through discovery, validation, feasibility, and pitching. The pedagogical philosophy is: **the platform gives students uncertainty, not a business.** Every claim a student makes must be backed by evidence; the AI advisor challenges assumptions rather than validating them.

This prompt scopes **only the first vertical slice** — one complete user journey through every architectural layer, not the full platform. Do not build features outside this scope. The goal is a working, testable slice we can put in front of real students before expanding.

## Scope of This Slice

Build the following user journey end to end:

1. Student registers (name, programme, index number, course code)
2. Student joins or creates a group (group name, group number)
3. Student submits an individual **Opportunity** (a real problem/gap they've identified)
4. Once all group members have submitted, the group enters a **selection phase** where they compare submitted opportunities and select one to pursue as their **Venture**
5. The AI advisor engages the group during selection, asking challenging questions about the chosen opportunity (not validating it)
6. Once a venture is selected, students can log **Evidence Items** against it (interview notes, survey data, observations, quotations — text and photo upload), each classified as Fact / Evidence / Assumption / Inference / Opinion / Unknown
7. Evidence items can be linked to **Assumptions** the group has logged, each with an importance rating and a confidence level

Do not build: feasibility analysis, financial modeling, business plan generation, prototype submission, resource marshalling, simulation events, lecturer dashboard, or contribution scoring. Those are later slices.

## Tech Stack (fixed — do not substitute)

- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS
- **PWA:** next-pwa or equivalent, with a service worker supporting offline drafts (see Offline Requirements below)
- **Backend/DB:** Supabase (Postgres + Row Level Security + Auth + Storage for evidence photos)
- **AI:** Claude API (Anthropic), called server-side only via Next.js API routes / server actions — never expose the API key or prompt logic to the client
- **Hosting target:** Vercel (frontend) + Supabase managed (backend) — structure the project so it deploys cleanly to both with no custom server

## Data Model

Implement this schema in Supabase (Postgres). Use UUIDs for primary keys. Add `created_at` / `updated_at` timestamps on every table.

```
students
  id, auth_user_id, full_name, index_number, programme, course_code

groups
  id, course_code, group_name, group_number

group_members
  id, group_id, student_id, role (nullable — assigned later, not in this slice), joined_at

opportunities
  id, student_id, group_id, problem, affected_people, context,
  observed_evidence, current_alternatives, why_it_matters,
  possible_solution, potential_customer, revenue_mechanism,
  uncertainties, status (submitted / rejected / selected)

ventures
  id, group_id, opportunity_id (the selected one), name, status (active / killed / pivoted),
  selection_rationale (why this over the alternatives — required field)

evidence_items
  id, venture_id, student_id, content, source_type (interview / survey / observation /
  quotation / photo / other), classification (fact / evidence / assumption / inference /
  opinion / unknown), photo_url (nullable, Supabase Storage), created_at

assumptions
  id, venture_id, statement, importance (critical / high / medium / low),
  confidence (high / medium / low), linked_evidence_ids (array or join table — your call
  on which is cleaner in Postgres)

ai_advisor_messages
  id, venture_id, group_id, role (advisor / student), content, created_at
  (log of the challenge conversation during selection and evidence logging, per venture)
```

Use a proper join table for `evidence_items` <-> `assumptions` rather than an array column if you judge that cleaner for querying — make the call and note why in your summary.

## Row Level Security

Implement RLS policies so that:

- A student can only read/write rows belonging to their own group (`group_members` lookup)
- A student cannot read another group's opportunities, ventures, evidence, or assumptions
- No role beyond "student" exists in this slice — lecturer/admin roles come in a later slice, but design the policies so adding a `lecturer` role later doesn't require restructuring existing tables (e.g. don't hardcode assumptions that only students exist)

Write the RLS policies as SQL migrations, not just describe them.

## AI Advisor Behavior

The advisor's job is to challenge, not encourage. Implement this as a system prompt for the Claude API calls, roughly:

- Never affirm a claim as sound; ask what evidence supports it
- When a group selects an opportunity, ask about the alternatives they rejected and why
- When a student logs an evidence item, if it reads as an assumption dressed as evidence (e.g. "everyone wants this"), the advisor should press on it before it gets accepted
- Keep responses short — this is a chat-style back-and-forth, not essays
- The advisor should never write the student's answers for them or supply the "correct" opportunity to pick

Store the conversation in `ai_advisor_messages` so it's part of the group's record.

## Offline Requirements

This is a hard constraint, not optional polish. Ghanaian campus/hostel connectivity is inconsistent.

- Opportunity submission, evidence logging, and assumption logging must work offline: queue writes locally (IndexedDB or equivalent) and sync to Supabase when connectivity returns
- Show the student a clear "saved locally, will sync" state — do not let them think a submission failed when it's actually just queued
- AI advisor conversations require connectivity by nature (they need the API); make this explicit in the UI rather than letting a student try to chat offline and get silent failures

## UX Principles

- Mobile-first. Assume most students are on phones, not laptops.
- Keep forms simple and low-friction — this is for students with a wide range of digital literacy, not a developer audience.
- Every AI challenge should feel like a real question, not a rejection. Tone matters.

## What I Need From You

1. Propose the folder/repo structure before writing code, and briefly confirm the data model above works as designed or flag anything you'd change and why.
2. Set up the Next.js + Supabase project scaffold, including the SQL migrations for the schema and RLS policies.
3. Build the journey in this order: student registration/auth → group creation/joining → opportunity submission → group selection phase with AI advisor → evidence logging with classification → assumption logging with evidence linking.
4. Implement the offline queue and sync behavior as part of the initial build, not as an afterthought.
5. Write basic seed data / a test script so the full journey can be walked through manually without 10 real student accounts.
6. At the end, give me a short summary of what was built, any deviations from this spec and why, and what's needed from me (API keys, Supabase project setup, etc.) before this can run.

Ask me clarifying questions before you start if anything here is ambiguous — don't guess silently on anything that affects the data model or RLS policies, since those are expensive to change later.
