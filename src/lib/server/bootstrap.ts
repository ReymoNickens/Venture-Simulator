import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withRlsBypass } from "@/lib/db";
import { joinCode, newId } from "@/lib/utils";
import { AppError, loadGroupForStudent, loadOfferingForStudent, logEvent, requireStudent } from "./authz";

const PEERS: {
  name: string;
  index: string;
  programme: string;
  opportunity: {
    problem: string;
    affectedPeople: string;
    context: string;
    observedEvidence: string;
    currentAlternatives: string;
    whyItMatters: string;
    possibleSolution: string;
    potentialCustomer: string;
    revenueMechanism: string;
    uncertainties: string;
  };
  preferenceNote: string;
}[] = [
  {
    name: "Akua Mensima",
    index: "DEMO-AB-001",
    programme: "Business Administration",
    preferenceNote: "The water queues are visible every morning; the others feel thinner.",
    opportunity: {
      problem: "Hostel blocks share a few working taps, so students queue before 6am and still miss first lectures.",
      affectedPeople: "Residents of the older halls, especially those without a personal bucket storey.",
      context: "Hostel / halls",
      observedEvidence: "Timed three mornings at Hall B. Average wait 27 minutes. Two of six taps dry. Students filling 25L containers.",
      currentAlternatives: "Buying sachet water, walking to a neighbouring hall, skipping bathing.",
      whyItMatters: "Students arrive late, skip breakfast, and spend money they budgeted for food.",
      possibleSolution: "A prepaid tanker schedule plus a shared storage tank with a student-run roster.",
      potentialCustomer: "Hall residents who already buy sachets, and hall management under pressure from complaints.",
      revenueMechanism: "Small weekly contribution collected with hall dues — this is a guess.",
      uncertainties: "Who actually controls the taps? Would management allow a student-run tank? How seasonal is the shortage?",
    },
  },
  {
    name: "Kwesi Mensah",
    index: "DEMO-KM-002",
    programme: "Computer Science",
    preferenceNote: "I see the tro-tro crush every evening; I have not counted demand yet.",
    opportunity: {
      problem: "After 5pm the campus-to-Madina tro-tro queue stretches past the roundabout and students stand in the road.",
      affectedPeople: "Commuting students without residential places, especially those with evening labs.",
      context: "Transportation",
      observedEvidence: "Counted 80+ people in queue at 17:40 on a Thursday. Four vehicles in 25 minutes. Two arguments with drivers over fare.",
      currentAlternatives: "Bolt, walking to a farther stop, waiting until 8pm, sleeping on campus illegally.",
      whyItMatters: "Safety after dark, missed family obligations, extra transport cost.",
      possibleSolution: "A student-shared departure board so people cluster on full vehicles instead of scattering.",
      potentialCustomer: "Commuters who already pay tro-tro fares; maybe the GPRTU local union.",
      revenueMechanism: "Unclear. A listing fee would likely fail. Advertising at the stop is an assumption.",
      uncertainties: "Would drivers cooperate? Is the queue a peak-only problem? What happens in the rain?",
    },
  },
  {
    name: "Efua Owusu",
    index: "DEMO-EO-003",
    programme: "Agriculture",
    preferenceNote: "Food waste is visible, but I have not spoken to the kitchen contractor.",
    opportunity: {
      problem: "The dining hall throws cooked food at 20:00 while nearby hostel shops sell stale bread.",
      affectedPeople: "Students who miss dinner hours; kitchen staff; the contractor paying for waste disposal.",
      context: "University campus",
      observedEvidence: "Watched closing twice. Two full gastronorm trays scraped into a bin. Asked three late students; all had been in lab until 19:50.",
      currentAlternatives: "Buying from night kiosks, skipping dinner, begging a friend inside before closing.",
      whyItMatters: "Students go hungry after late classes; the contractor is paying to dump food.",
      possibleSolution: "A late-tray reservation so the kitchen holds a counted portion.",
      potentialCustomer: "Late-lab students; possibly the contractor if waste disposal has a fee.",
      revenueMechanism: "A small hold-fee. Entirely untested.",
      uncertainties: "Health rules around holding food. Contractor incentives. How many students would actually reserve?",
    },
  },
  {
    name: "Yaw Asante",
    index: "DEMO-YA-004",
    programme: "Economics",
    preferenceNote: "MoMo queues are real at month-end; I do not know if agents would change behaviour.",
    opportunity: {
      problem: "Mobile-money agents near campus run out of float on fee-payment weeks, so students miss portal deadlines.",
      affectedPeople: "Students paying fees or receiving family transfers; agents losing customers to a farther booth.",
      context: "Mobile money / payments",
      observedEvidence: "Visited four agents on a Friday after a fee reminder SMS. Three said 'no cash-in'. Screenshot of portal closing the same night.",
      currentAlternatives: "Walking 25 minutes to town, asking a friend with float, paying a 'special' extra.",
      whyItMatters: "Missed deadlines create registration holds. Extra unofficial fees come out of food money.",
      possibleSolution: "A float-status board students update, or a campus float pool. Both are guesses.",
      potentialCustomer: "Students needing cash-in during fee week; agents who lose volume.",
      revenueMechanism: "Unknown. Charging students to see float would probably fail.",
      uncertainties: "Telco rules. Agent willingness. Whether the shortage is only two weeks a semester.",
    },
  },
  {
    name: "Abena Sarpong",
    index: "DEMO-AS-005",
    programme: "Information Studies",
    preferenceNote: "Print-shop pricing is opaque; I only have three quotes.",
    opportunity: {
      problem: "Students cannot tell what a spiral-bind will cost until they are at the counter, so they overpay under deadline pressure.",
      affectedPeople: "Undergraduates printing assignments the night before; the two campus copy shops.",
      context: "Education services",
      observedEvidence: "Asked three shops the same job (40 pages, spiral, colour cover). Quotes: GH₵18, GH₵27, GH₵22. None displayed a list.",
      currentAlternatives: "Asking friends, walking between shops, accepting the first number.",
      whyItMatters: "Money and time disappear on deadline nights. Students feel cheated without a record.",
      possibleSolution: "A public price board the shops themselves would have to maintain — they may refuse.",
      potentialCustomer: "Students who print weekly; perhaps a shop that wants to undercut honestly.",
      revenueMechanism: "No honest model yet. Ads on a price board is an assumption.",
      uncertainties: "Would shops share prices? Do students actually compare, or do they just use the nearest shop?",
    },
  },
  {
    name: "Kojo Addo",
    index: "DEMO-KA-006",
    programme: "Mechanical Engineering",
    preferenceNote: "Laundry delays are annoying but I have only my own hall's data.",
    opportunity: {
      problem: "The hall laundry returns clothes three to five days late, and mix-ups are common.",
      affectedPeople: "Hall residents who have two or three sets of clothes.",
      context: "Hostel / halls",
      observedEvidence: "Logged my own bag for two weeks: drop Monday, return Friday missing a shirt. Four neighbours reported similar delays.",
      currentAlternatives: "Hand-washing in basins, paying a woman off-campus, wearing damp clothes.",
      whyItMatters: "Students miss labs in wet clothes or skip washing and get sick. Off-campus laundry costs more.",
      possibleSolution: "A tagged-bag log so mix-ups are traceable. Not a new laundry.",
      potentialCustomer: "Hall residents; maybe the current laundry operator if complaints threaten the contract.",
      revenueMechanism: "Unclear. A log should perhaps be free.",
      uncertainties: "Who employs the laundry workers? Is lateness a capacity problem or an incentive problem?",
    },
  },
  {
    name: "Akosua Darko",
    index: "DEMO-AD-007",
    programme: "Agriculture",
    preferenceNote: "Market spoilage is a real farm problem; I only visited one market.",
    opportunity: {
      problem: "Tomato sellers at the night market dump unsold crates because they have no cool storage overnight.",
      affectedPeople: "Women stallholders who buy from peri-urban farms; the farmers who get paid late.",
      context: "Agriculture",
      observedEvidence: "Saturday 21:30 at the night market. Two sellers showed me soft crates they said would not keep until Monday. Estimated 1.5 crates discarded.",
      currentAlternatives: "Selling at a loss after 8pm, taking stock home on a tro-tro, leaving it under a cloth.",
      whyItMatters: "Income lost every weekend. Rotten produce is dumped near the drain.",
      possibleSolution: "A shared crate-chill locker. Cost, power, and theft risk are unknown.",
      potentialCustomer: "Stallholders who already lose stock; maybe a cold-store owner in town.",
      revenueMechanism: "Nightly locker fee. Completely untested.",
      uncertainties: "Electricity reliability. Theft. Whether sellers would trust a shared lock.",
    },
  },
  {
    name: "Nana Kofi",
    index: "DEMO-NK-008",
    programme: "Mathematics",
    preferenceNote: "Lecture notes are a mess; I have not asked the lecturers.",
    opportunity: {
      problem: "Required readings for two first-year courses exist only as a photocopy the class rep controls, so half the class works from rumours.",
      affectedPeople: "First-year students in large lecture courses.",
      context: "Education services",
      observedEvidence: "Asked 12 classmates for the reading list. Seven had different page numbers. The class rep's stack was 80 copies for ~200 students.",
      currentAlternatives: "Group-chat photos of pages, skipping the reading, paying the copy shop a 'priority' fee.",
      whyItMatters: "Students fail quizzes on material they never saw. The informal copy market is chaotic.",
      possibleSolution: "A single numbered pack the department already has the right to print. This may already exist.",
      potentialCustomer: "First-years; possibly the department if complaints reach them.",
      revenueMechanism: "Cost-recovery print, not profit. If it needs profit, the idea is probably wrong.",
      uncertainties: "Copyright. Whether the lecturer already posted a PDF we failed to find. Department politics.",
    },
  },
  {
    name: "Selorm Tetteh",
    index: "DEMO-ST-009",
    programme: "Physics",
    preferenceNote: "Charging in lecture halls is a small problem; I am not sure it matters enough.",
    opportunity: {
      problem: "Lecture halls have almost no working outlets, so students lose devices mid-class during power dips.",
      affectedPeople: "Students taking notes on phones; those whose laptops die in long labs.",
      context: "University campus",
      observedEvidence: "Counted outlets in two 200-seat halls: 6 and 4, half painted over. During a dip, 9 nearby students asked to share a power bank.",
      currentAlternatives: "Power banks, sitting on the floor near a wall, switching the phone off.",
      whyItMatters: "Notes disappear. Exam recordings fail. It may be an inconvenience rather than a venture.",
      possibleSolution: "A rental power-bank rack. Theft and charging logistics are unsolved.",
      potentialCustomer: "Students who already buy power banks from the night market.",
      revenueMechanism: "Hourly rental. Likely too small. Treat as an assumption.",
      uncertainties: "Is this painful enough that anyone would pay? Would estates allow a rack?",
    },
  },
];

export const bootstrapDemoCohort = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const student = await requireStudent(context.userId);
    const offering = await loadOfferingForStudent(student.id);
    if (!offering) throw new AppError("NO_OFFERING", "Enrol in a course offering first.");
    const existing = await loadGroupForStudent(student.id);
    if (existing) {
      throw new AppError(
        "ALREADY_IN_GROUP",
        "You already have a group. Leave it before entering the demonstration cohort — or continue with that group.",
      );
    }
    const sql = await getSql();
    // Cross-group read (groups_member only grants SELECT to active members),
    // same as createGroup's group-number lookup.
    const groupNumber = await withRlsBypass(async () => {
      const nums = await sql<{ n: number }>`
        select coalesce(max(group_number), 0)::int as n
        from groups where course_offering_id = ${offering.id}
      `;
      return Number(nums[0]?.n ?? 0) + 1;
    });
    const groupId = newId();
    const code = `D${joinCode(5)}`;
    const first = student.fullName.split(" ")[0] || "Studio";
    await sql`
      insert into groups (
        id, course_offering_id, group_name, group_number, join_code, status,
        created_by_student_id, capacity
      ) values (
        ${groupId}, ${offering.id}, ${`Demo · ${first}`}, ${groupNumber}, ${code},
        'opportunity_collection', ${student.id}, ${offering.defaultGroupSize}
      )
    `;
    await withRlsBypass(() => sql`
      insert into group_members (id, group_id, student_id, membership_status)
      values (${newId()}, ${groupId}, ${student.id}, 'active')
    `);

    // Seeding synthetic peers writes rows owned by students other than the
    // caller (students_write, opportunities_write, etc. all check "your own
    // row") — this is the one place the app deliberately creates data on
    // another identity's behalf, so it runs under the escape hatch.
    const peerIds: string[] = await withRlsBypass(async () => {
      const ids: string[] = [];
      for (let i = 0; i < PEERS.length; i++) {
        const peer = PEERS[i];
        const sid = newId();
        ids.push(sid);
        const indexNumber = `${peer.index}-${groupId.slice(0, 6).toUpperCase()}`;
        await sql`
          insert into students (id, auth_user_id, full_name, index_number, programme, is_synthetic)
          values (${sid}, ${`seed:${groupId}:${i}`}, ${peer.name}, ${indexNumber}, ${peer.programme}, true)
        `;
        await sql`
          insert into course_enrolments (id, student_id, course_offering_id, status)
          values (${newId()}, ${sid}, ${offering.id}, 'active')
        `;
        await sql`
          insert into group_members (id, group_id, student_id, membership_status)
          values (${newId()}, ${groupId}, ${sid}, 'active')
        `;
        const o = peer.opportunity;
        const oid = newId();
        await sql`
          insert into opportunities (
            id, student_id, group_id, problem, affected_people, context, observed_evidence,
            current_alternatives, why_it_matters, possible_solution, potential_customer,
            revenue_mechanism, uncertainties, status, submitted_at
          ) values (
            ${oid}, ${sid}, ${groupId},
            ${o.problem}, ${o.affectedPeople}, ${o.context}, ${o.observedEvidence},
            ${o.currentAlternatives}, ${o.whyItMatters}, ${o.possibleSolution},
            ${o.potentialCustomer}, ${o.revenueMechanism}, ${o.uncertainties},
            'submitted', now()
          )
        `;
        await sql`
          insert into opportunity_preferences (id, opportunity_id, student_id, preference_rank, rationale)
          values (${newId()}, ${oid}, ${sid}, 1, ${peer.preferenceNote})
        `;
      }
      return ids;
    });

    await logEvent({
      studentId: student.id,
      groupId,
      eventType: "GROUP_CREATED",
      entityType: "group",
      entityId: groupId,
      metadata: { demo: true, peers: peerIds.length },
    });
    return { groupId, joinCode: code, peers: PEERS.length };
  });
