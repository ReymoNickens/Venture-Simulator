/**
 * Where the work happens. Students at the University of Cape Coast should see
 * their own town in every example and suggestion — Science Market, not "a
 * market"; the Pedu trotro, not "public transport".
 *
 * These are places, not claims about them: the platform never says a place
 * has a problem. Students go and find out.
 */
export const PLACES = {
  campus: [
    "Science Market",
    "Old Site",
    "New Site",
    "Sam Jonah Library",
    "Oguaa Hall",
    "Atlantic Hall",
    "Adehye Hall",
    "Casely-Hayford Hall",
    "Valco Hall",
    "Kwame Nkrumah Hall",
    "SRC Hall",
    "Campus shuttle stop",
  ],
  aroundCampus: ["Amamoma", "Kwaprow", "Apewosika", "Ayensu", "Private hostels"],
  town: [
    "Kotokuraba Market",
    "Pedu Junction",
    "Abura",
    "London Bridge",
    "Victoria Park",
    "Cape Coast Castle",
    "Cape Coast beach landing site",
    "Elmina fish market",
    "Cape Coast Stadium",
  ],
} as const;

export const ALL_PLACES: string[] = [...PLACES.campus, ...PLACES.aroundCampus, ...PLACES.town];

/** Who students can realistically go and talk to, this week, in Cape Coast. */
export const PEOPLE_TO_ASK = [
  "Hall residents",
  "Level 100 students",
  "Students in private hostels",
  "Science Market traders",
  "Kotokuraba market women",
  "Taxi and trotro drivers",
  "Fishmongers",
  "Hostel managers",
  "Printing shop owners",
  "Food vendors",
  "Tour guides",
] as const;

export const TOWN_NAME = "Cape Coast";
export const UNIVERSITY = "University of Cape Coast";

/** A short, mixed list for tap-to-fill: campus, around campus, and town. */
export const SUGGESTED_PLACES = [
  "Science Market",
  "Kotokuraba Market",
  "Campus shuttle stop",
  "Amamoma",
  "Kwaprow",
  "Pedu Junction",
  "Cape Coast beach landing site",
  "Cape Coast Castle",
] as const;
