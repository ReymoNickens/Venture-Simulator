-- The course this platform serves at the University of Cape Coast is ENT 302.
-- Safe to run twice: only renames the seeded course if it still has its old code.
update courses set course_code = 'ENT 302', updated_at = now()
where id = 'course_entr201' and course_code = 'ENTR 201';
