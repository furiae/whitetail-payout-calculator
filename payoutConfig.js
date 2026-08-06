// ---------------------------------------------------------------------------
// APEX Whitetail Challenge - payout configuration
//
// Everything you are likely to want to change lives in this file. The maths in
// whitetailCalcV4.js reads these numbers and does not hardcode any of them.
//
// The model is "purse first": we take a fixed share of gross revenue, then hand
// it out by weight. That is what keeps the house margin steady no matter how
// many hunters enter - the old version calculated each prize on its own and let
// the total land wherever it happened to land (anywhere from 26% to 65%).
// ---------------------------------------------------------------------------

const CONFIG = {

    // Share of gross revenue paid back to hunters, before the increment is
    // applied. 0.65 => a 35% house margin, which is what the spec asked for.
    // See marginBand below for how far this is allowed to move.
    payoutRate: 0.65,

    // Every prize lands on a whole multiple of this. No $510, no $225.
    // Caps and floors are snapped to it too, so nothing can sneak past.
    payoutIncrement: 50,

    // The house margin may sit anywhere in this band. We aim at the top of it
    // and give back whatever the increment strands, so the flex is spent on
    // hunters rather than kept: a rounder board costs a little margin, never
    // the other way round.
    marginBand: { min: 0.33, max: 0.35 },

    // No prize may be worth less than this many entry fees. A $100 entry means
    // nothing pays under $200.
    //
    // A prize that cannot reach the floor is REMOVED, not topped up, and its
    // money is shared out among the prizes that remain. Topping up would mean
    // inventing money the purse does not have, which is exactly how the old
    // version ended up paying out more than it collected on small fields.
    // So a thin field pays fewer, bigger prizes rather than a long list of
    // token ones.
    minPayoutMultiple: 2,

    // How the hunter purse is split between the three boards. These are shares
    // of the purse and should add up to 1. If a board is not unlocked yet (say,
    // there are too few entries for outside-top-10 prizes) its share is handed
    // back to the boards that ARE active, so the margin still lands on target.
    purseSplit: {
        topTen: 0.740,
        outsideTopTen: 0.225,
        specialHarvest: 0.035,
    },

    // Entries are rounded DOWN to a "payout model" before deciding how many
    // places pay. This is deliberately conservative - it protects against
    // no-shows. It no longer affects the size of the purse, only its shape.
    model: {
        roundToBelow400: 10,
        roundToFrom400: 50,
    },

    topTen: {
        // One paid place per N hunters, clamped to [minPlaces, maxPlaces].
        huntersPerPlace: 10,
        minPlaces: 3,
        maxPlaces: 10,

        // Relative size of each place. Only the ratios matter - they are
        // normalised against however many places are actually paying. These
        // reproduce the shape of the current live board (1st is a bit over 4x
        // 10th), so the prize list still "feels" the same.
        weights: [6, 5, 4, 3.5, 2, 1.6, 1.55, 1.5, 1.45, 1.4],

        // Hard ceiling per place, in dollars. Once a big field pushes a place
        // past its cap the extra does NOT stay with the house: it first tops up
        // any top-ten place still under its own cap, and whatever is left flows
        // into the outside-top-10 and special harvest boards. The margin is
        // unchanged either way - the money just lands somewhere better.
        //
        // Set to null to remove the ceilings entirely.
        caps: [25000, 22500, 20000, 17500, 15000, 12500, 10000, 7500, 5000, 2500],

        // Round each prize down to a tidy number. First matching rule wins.
        rounding: [
            { minModel: 350, step: 250 },
            { minModel: 100, step: 100 },
            { minModel: 0, step: 50 },
        ],
    },

    outsideTopTen: {
        // No prizes outside the top 10 until this many entries.
        minModel: 100,
        // One extra bracket per N hunters...
        huntersPerTier: 200,
        // ...each bracket covering this many finishing places...
        placesPerTier: 5,
        // ...up to this many brackets. The old code capped at 13 and silently
        // threw away anything past it; raise this and the extra brackets now
        // appear on the board and count against the purse properly.
        maxTiers: 20,

        // Each bracket is worth this much less than the one above it, as a
        // fraction of the first bracket. Floored so deep brackets stay worth
        // showing up for.
        decayPerTier: 0.08,
        minWeightFraction: 0.25,

        rounding: [
            { minModel: 350, step: 100 },
            { minModel: 0, step: 50 },
        ],
    },

    specialHarvest: {
        // The spec always said 20 entries; the code had drifted to 40.
        minModel: 20,

        // Point-class drawings. All four ALWAYS pay the same amount, so they
        // share a single weight and are handed out as one block - that is what
        // stops rounding from pulling them apart by an increment or two.
        // They are also all-or-nothing: four prizes or none.
        drawings: {
            labels: ['10PT', '9PT', '8PT', '7PT'],
            weight: 3.5,
        },

        // "Lucky placing" prizes, each unlocked by its own entry threshold.
        milestones: [
            { label: '100th', minModel: 300, weight: 2 },
            { label: '200th', minModel: 500, weight: 2 },
            { label: '300th', minModel: 800, weight: 0.6 },
            { label: '400th', minModel: 1000, weight: 0.6 },
            { label: '500th', minModel: 1200, weight: 0.6 },
            { label: '750th', minModel: 1750, weight: 0.6 },
            { label: '1000th', minModel: 2000, weight: 0.6 },
            { label: '1250th', minModel: 2500, weight: 0.6 },
        ],

        rounding: [
            { minModel: 200, step: 250 },
            { minModel: 0, step: 100 },
        ],
    },
};

// Exported for the Node test harness; ignored by the browser.
if (typeof module !== 'undefined') module.exports = { CONFIG };
