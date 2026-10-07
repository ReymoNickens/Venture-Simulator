-- The simulation runs each group's own venture, built from numbers the group
-- enters (src/sim/scenarios/own-venture.ts), instead of the shared food stall.
--
-- ventures.sim_inputs holds the group's numbers (what they sell, what one
-- costs, what customers say they'd pay, alternatives, people per week, ...)
-- and where each key number came from. Group members edit it under the
-- existing ventures_member policy until the simulation starts.
--
-- simulations.scenario freezes the market built from those numbers when the
-- simulation starts, so later edits never change a running simulation. Null
-- means the class's scenario (simulations started before this change).
--
-- Safe to run twice.

alter table ventures add column if not exists sim_inputs jsonb;
alter table ventures add column if not exists sim_inputs_updated_at timestamptz;
alter table ventures add column if not exists sim_inputs_updated_by text references students(id);

alter table simulations add column if not exists scenario jsonb;
