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
    name: "Efua Mensah",
    index: "DEMO-EM-001",
    programme: "Business Administration",
    preferenceNote: "The shuttle queue is something I can count every morning; the others feel thinner.",
    opportunity: {
      problem: "Before 8am lectures the campus shuttle queue at Science is so long that students give up and pay for dropping taxis, or arrive late.",
      affectedPeople: "Students living at Old Site and in the hostels near it who have 7:30 and 8:00 lectures at New Site.",
      context: "Campus shuttle stop",
      observedEvidence: "Stood at the stop on Tuesday and Thursday from 6:50 to 7:40. Counted 60+ people at peak both days and 4 shuttles in 50 minutes. Asked 6 people — 4 said they had paid for a taxi at least once that week.",
      currentAlternatives: "Walk, share a dropping taxi (GH₵ cost split), leave home before 6:30, or skip the first lecture.",
      whyItMatters: "Lateness costs attendance marks, taxi fares eat into feeding money, and early departures mean no breakfast.",
      possibleSolution: "A shared WhatsApp departure board so students cluster onto full taxis, or a booked early-morning bus.",
      potentialCustomer: "Students with early lectures; maybe the transport unit.",
      revenueMechanism: "Unclear — a small per-ride fee is a guess.",
      uncertainties: "Is it every day or only certain weeks? Does the transport unit already plan to add buses? Would students book ahead?",
    },
  },
  {
    name: "Kwesi Arthur",
    index: "DEMO-KA-002",
    programme: "Computer Science",
    preferenceNote: "Printing queues before deadlines are real, but they are seasonal.",
    opportunity: {
      problem: "The night before assignment deadlines, the printing shops at Science have long queues and some run out of paper or toner.",
      affectedPeople: "Students submitting printed assignments, especially Level 100 and 200.",
      context: "Science Market",
      observedEvidence: "Visited three print shops at 9pm the night before a big deadline. Longest wait was about 50 minutes. One shop turned people away at 10pm.",
      currentAlternatives: "Print days early, go to shops in town, borrow a friend’s printer, or submit late.",
      whyItMatters: "Late submissions lose marks; students lose sleep and study time.",
      possibleSolution: "Order-ahead printing: send the file on WhatsApp, pick up at a set time.",
      potentialCustomer: "Students with deadlines; print shop owners who want steadier work.",
      revenueMechanism: "Small booking fee on top of the print price — a guess.",
      uncertainties: "Do shops want this? Is it only a few nights a semester?",
    },
  },
  {
    name: "Araba Quansah",
    index: "DEMO-AQ-003",
    programme: "Agriculture",
    preferenceNote: "Fish spoilage is a real livelihood problem, but I spoke to only two traders.",
    opportunity: {
      problem: "Fish sellers at Kotokuraba lose part of their stock to spoilage on hot afternoons because they have little or no cold storage.",
      affectedPeople: "Market women selling fresh fish at Kotokuraba.",
      context: "Kotokuraba Market",
      observedEvidence: "Spent two afternoons at the fish section. Two sellers said they sell off the last of their fish cheaply after 3pm or smoke it at a loss. Saw ice being bought in small blocks.",
      currentAlternatives: "Buying ice blocks, selling cheap late in the day, smoking unsold fish.",
      whyItMatters: "Lost stock is lost income for families that depend on daily sales.",
      possibleSolution: "Shared, rentable cold boxes or an ice delivery round.",
      potentialCustomer: "Fish sellers; possibly the market association.",
      revenueMechanism: "Daily rental fee per cold box.",
      uncertainties: "How much do they lose in cedis? Who would they trust to run it?",
    },
  },
  {
    name: "Kobina Eshun",
    index: "DEMO-KE-004",
    programme: "Economics",
    preferenceNote: "Upfront rent is a painful problem, but hard for students to solve.",
    opportunity: {
      problem: "Private hostels around Kwaprow and Amamoma ask for a full year’s rent upfront, which many students cannot raise at once.",
      affectedPeople: "Continuing students who move out of the halls into private hostels.",
      context: "Around campus (Amamoma, Kwaprow, Apewosika…)",
      observedEvidence: "Asked 8 hostel residents: 6 paid a year upfront, 3 borrowed from relatives to do it. Two hostel managers said instalments are ‘too risky’.",
      currentAlternatives: "Borrowing from family, sharing rooms beyond capacity, cheaper hostels further away.",
      whyItMatters: "Students start the year in debt or live far from campus.",
      possibleSolution: "A savings-and-instalment scheme that guarantees landlords their money.",
      potentialCustomer: "Students and parents; possibly hostel managers.",
      revenueMechanism: "Small service fee — a guess.",
      uncertainties: "Would landlords accept it? Who carries the risk if a student defaults?",
    },
  },
  {
    name: "Esi Ansah",
    index: "DEMO-EA-005",
    programme: "Tourism Management",
    preferenceNote: "Tourist demand is seasonal; I only observed on two weekends.",
    opportunity: {
      problem: "Visitors leaving Cape Coast Castle struggle to find trustworthy local food and short guided walks nearby, so most leave town straight away.",
      affectedPeople: "Day visitors and small tour groups at the Castle.",
      context: "Tourism — the Castle, Elmina, Kakum",
      observedEvidence: "Watched the Castle exit for two Saturday afternoons. Asked 10 visitors where they were going next: 7 were leaving Cape Coast immediately; 4 said they wanted food but didn’t know where.",
      currentAlternatives: "Asking drivers, eating on the road, going back to Accra.",
      whyItMatters: "Money that could stay in Cape Coast leaves with the visitors.",
      possibleSolution: "Student-led food-and-history walks from the Castle.",
      potentialCustomer: "Visitors; tour operators.",
      revenueMechanism: "Per-person walk fee.",
      uncertainties: "Do tour operators already offer this? Would visitors trust students?",
    },
  },
  {
    name: "Ekow Baidoo",
    index: "DEMO-EB-006",
    programme: "Mechanical Engineering",
    preferenceNote: "Laundry is annoying but I only have data from my own hostel.",
    opportunity: {
      problem: "Students in private hostels at Amamoma lose hours every weekend hand-washing clothes, especially when water flow is low.",
      affectedPeople: "Hostel residents without washing machines.",
      context: "In a hall or hostel",
      observedEvidence: "Asked 12 residents in my hostel: average 3 hours a week on laundry. Two pay a neighbour to wash for them.",
      currentAlternatives: "Hand-washing, paying neighbours, taking clothes home at mid-sem.",
      whyItMatters: "Lost study time, especially close to exams.",
      possibleSolution: "Pick-up-and-return laundry service by weight.",
      potentialCustomer: "Hostel residents.",
      revenueMechanism: "Price per bag.",
      uncertainties: "Would they trust someone with their clothes? Is water a bigger problem than time?",
    },
  },
  {
    name: "Adjoa Amoah",
    index: "DEMO-AA-007",
    programme: "Fisheries",
    preferenceNote: "Smoke exposure matters a lot, but it is far from what a student group can fix fast.",
    opportunity: {
      problem: "Women smoking fish near the Cape Coast beach landing site work over open fires for hours, breathing heavy smoke.",
      affectedPeople: "Fish processors, mostly women, and the children around them.",
      context: "The beach and fishing community",
      observedEvidence: "Visited one morning. Counted 9 smoking ovens in use. Three women said their eyes hurt ‘every day’.",
      currentAlternatives: "Traditional ovens; a few improved ovens bought through NGOs.",
      whyItMatters: "Health costs, firewood costs, and lost income on bad days.",
      possibleSolution: "Rent-to-own improved smoking ovens.",
      potentialCustomer: "Fish processors; possibly NGOs as funders.",
      revenueMechanism: "Weekly instalments.",
      uncertainties: "Cost of improved ovens? Would processors change a practice they know?",
    },
  },
  {
    name: "Kweku Ghartey",
    index: "DEMO-KG-008",
    programme: "Mathematics",
    preferenceNote: "Phone repair is a real frustration but I haven’t checked the shops yet.",
    opportunity: {
      problem: "When a phone breaks, students wait days for repairs in town and are cut off from class WhatsApp groups in the meantime.",
      affectedPeople: "Students whose only device is their phone.",
      context: "On campus",
      observedEvidence: "Asked 9 classmates: 5 had a phone repaired this semester; average wait was 4 days. Two missed assignment announcements.",
      currentAlternatives: "Repair shops in town, borrowing phones, going without.",
      whyItMatters: "Missed deadlines and information; repair trips cost transport.",
      possibleSolution: "Campus pick-up and loan phone while yours is fixed.",
      potentialCustomer: "Students.",
      revenueMechanism: "Commission from repairers plus a loan fee.",
      uncertainties: "Would repair shops share commission? Loan-phone theft risk?",
    },
  },
  {
    name: "Aba Sam",
    index: "DEMO-AS-009",
    programme: "Physics",
    preferenceNote: "Charging during power cuts matters, but only when there are outages.",
    opportunity: {
      problem: "During power outages students crowd the few working sockets in lecture halls and libraries to charge phones and laptops.",
      affectedPeople: "Students who study on laptops and phones.",
      context: "On campus",
      observedEvidence: "During last week’s outage, counted 23 people around 4 sockets at the library entrance.",
      currentAlternatives: "Power banks, charging at shops in town, waiting.",
      whyItMatters: "Lost study time before exams; dead phones mean missed messages.",
      possibleSolution: "Rentable power banks with pick-up points.",
      potentialCustomer: "Students.",
      revenueMechanism: "Per-rental fee.",
      uncertainties: "How often are outages? Would power banks come back?",
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
    await sql`
      insert into group_members (id, group_id, student_id, membership_status)
      values (${newId()}, ${groupId}, ${student.id}, 'active')
    `;

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
