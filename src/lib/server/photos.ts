import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { AppError } from "./authz";

/**
 * One evidence photo, on demand. Photos used to ride along inside every
 * workspace refresh — every image, every time, on students' mobile data.
 * Now the snapshot only says `hasPhoto`; the image loads when it is actually
 * shown and is then kept on the device (see EvidencePhoto). evidence_member
 * RLS limits this to photos from the caller's own group.
 */
export const getEvidencePhoto = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<{ photo_data: string | null; photo_mime: string | null }>`
      select photo_data, photo_mime from evidence_items where id = ${data.id} limit 1
    `;
    if (!rows[0]?.photo_data) throw new AppError("NOT_FOUND", "Photo not found.");
    return { dataUrl: rows[0].photo_data, mime: rows[0].photo_mime };
  });
