// What an invite link (/join/CODE) shows before someone joins: the group,
// its leader and its class. Anyone holding the link may see this much; the
// join code is the secret, as with typed codes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { codeCheckedMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { AppError } from "./errors";
import { parseInput } from "./validate";

export interface InvitePreview {
  code: string;
  groupName: string;
  groupNumber: number;
  leaderName: string | null;
  classLabel: string;
  offeringId: string;
  members: number;
  capacity: number;
  open: boolean;
}

export const previewInvite = createServerFn({ method: "POST" })
  .middleware([codeCheckedMiddleware])
  .validator(parseInput(z.object({ code: z.string().min(4).max(20) })))
  .handler(async ({ data }): Promise<InvitePreview> => {
    const sql = await getSql();
    const code = data.code.trim().toUpperCase();
    const rows = await sql<{
      join_code: string;
      group_name: string;
      group_number: number;
      status: string;
      capacity: number;
      course_offering_id: string;
      leader: string | null;
      course_code: string;
      programme: string | null;
      level: string | null;
      members: number | string;
    }>`
      select g.join_code, g.group_name, g.group_number, g.status, g.capacity, g.course_offering_id,
             s.full_name as leader, c.course_code, o.programme, o.level,
             (select count(*) from group_members m where m.group_id = g.id and m.membership_status = 'active') as members
      from groups g
      join course_offerings o on o.id = g.course_offering_id
      join courses c on c.id = o.course_id
      left join students s on s.id = g.created_by_student_id
      where upper(g.join_code) = ${code}
      limit 1
    `;
    const g = rows[0];
    if (!g) throw new AppError("NOT_FOUND", "That invite link doesn’t match any group. Ask your group leader to send it again.");
    const members = Number(g.members);
    return {
      code: g.join_code,
      groupName: g.group_name,
      groupNumber: Number(g.group_number),
      leaderName: g.leader,
      classLabel: [g.course_code, g.programme, g.level].filter(Boolean).join(" · "),
      offeringId: g.course_offering_id,
      members,
      capacity: Number(g.capacity),
      open: g.status !== "venture_created" && members < Number(g.capacity),
    };
  });
