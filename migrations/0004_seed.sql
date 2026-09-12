-- Catalogue seed only — no student accounts. Academic identities are created
-- at onboarding. Demonstration peers are generated per signed-in student.

insert into courses (id, course_code, course_name)
values ('course_entr201', 'ENTR 201', 'Experiential Venture Studio')
on conflict (id) do nothing;

insert into course_offerings (
  id, course_id, semester, academic_year,
  default_group_size, selection_requires_all_active, max_photo_bytes
) values (
  'offering_entr201_2026s1',
  'course_entr201',
  'Semester 1',
  '2026/2027',
  10, true, 800000
) on conflict (id) do nothing;
