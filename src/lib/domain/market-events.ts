/**
 * Market shocks a lecturer can release to the cohort.
 *
 * Real ventures do not run in a vacuum, and a classroom business plan never
 * meets the cedi, dumsor, or the hall master. These are drawn from the
 * conditions Ghanaian student ventures actually face. Each asks every student
 * to say, individually, what it changes — the shock is a prompt for
 * reasoning, not a number that silently rewrites their model.
 */
export interface MarketEventTemplate {
  key: string;
  title: string;
  body: string;
  prompt: string;
}

export const MARKET_EVENTS: MarketEventTemplate[] = [
  {
    key: "cedi_depreciation",
    title: "The cedi has fallen 15% this month",
    body: "Imported inputs — packaging, phone data bundles, electronics, fuel — are repricing across the market. Suppliers are quoting higher from next week.",
    prompt: "Which of your costs rise, by roughly how much, and does your break-even still hold? What will you do — absorb it, raise prices, or change supplier?",
  },
  {
    key: "dumsor",
    title: "Dumsor is back: 12-hour power cuts for two weeks",
    body: "ECG has announced load-shedding across your area. Evening and morning outages will run for at least two weeks.",
    prompt: "What part of your venture depends on power or charging? What is your fallback, and what does it cost?",
  },
  {
    key: "copycat",
    title: "A competitor has copied you — and is GH₵2 cheaper",
    body: "Someone on the next hall’s WhatsApp status is now advertising almost exactly your offer, slightly cheaper.",
    prompt: "Why would your customer stay with you? Point to evidence of what they actually value, not what you hope they value.",
  },
  {
    key: "hall_ban",
    title: "Hall management bans commercial activity in rooms",
    body: "A notice from the hall master: no selling, storing stock, or running services from student rooms, effective Monday.",
    prompt: "Who do you now need permission from, and what is your plan B for location and storage?",
  },
  {
    key: "exams",
    title: "Mid-semester exams start in 10 days",
    body: "Your customers — and your team — are about to disappear into revision for two weeks.",
    prompt: "What happens to demand and to your team’s capacity? How will you keep the venture running, or pause it cleanly?",
  },
  {
    key: "momo_levy",
    title: "A new levy on mobile money transfers",
    body: "Government has announced a new charge on electronic transfers. Customers are grumbling and some are switching back to cash.",
    prompt: "How do your customers pay you today? What does the levy do to your price, your margin, and your record-keeping?",
  },
  {
    key: "fuel_price",
    title: "Fuel prices up — tro-tro fares rising",
    body: "Transport unions have announced a fare increase after the latest fuel price hike.",
    prompt: "Where does transport sit in your costs — deliveries, buying stock, reaching customers? Rework the numbers that depend on it.",
  },
  {
    key: "supplier_stockout",
    title: "Your main supplier is out of stock for a month",
    body: "The market trader you buy from says the next consignment is delayed at the port.",
    prompt: "Do you have a second supplier? What did you learn about your key partners from this?",
  },
  {
    key: "influencer",
    title: "A campus influencer offers to promote you — for a fee",
    body: "A student with 40,000 followers offers a post for GH₵300. Their audience is mostly first-years.",
    prompt: "Is that audience your customer segment? How many sales would the post need to pay for itself — and what evidence do you have that it would get them?",
  },
  {
    key: "grant",
    title: "A GH₵2,000 innovation grant is open — deadline Friday",
    body: "The university enterprise office is funding student ventures that can show evidence of customer demand.",
    prompt: "What is the strongest evidence of demand you could submit today? What is still missing?",
  },
];

export const MARKET_EVENT_BY_KEY = Object.fromEntries(MARKET_EVENTS.map((e) => [e.key, e]));
