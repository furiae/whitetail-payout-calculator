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
    // of the purse and should add up to 1.
    //
    // The top ten used to take 74%, which is what the original spec asked for.
    // It is deliberately looser now: with a hard $25,000 cap the top ten cannot
    // absorb its old share on a full field anyway, and the money reads better
    // spread across more finishers and bigger drawings. If a board is not unlocked yet (say,
    // there are too few entries for outside-top-10 prizes) its share is handed
    // back to the boards that ARE active, so the margin still lands on target.
    purseSplit: {
        topTen: 0.55,
        outsideTopTen: 0.31,
        specialHarvest: 0.14,
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
        // normalised against however many places are actually paying.
        //
        // A smooth curve from 1st to 10th at a 3:1 ratio - each place is worth
        // about 11% more than the one below it. Earlier versions copied the old
        // live board and were far steeper (6:1), which made the gaps at the top
        // feel brutal, and had a flat 6th-10th tail that rounded to a single
        // number on small fields.
        weights: [3.0, 2.658, 2.354, 2.085, 1.847, 1.636, 1.449, 1.284, 1.137, 1.0],

        // Hard ceiling per place, in dollars. Once a big field pushes a place
        // past its cap the extra does NOT stay with the house: it first tops up
        // any top-ten place still under its own cap, and whatever is left flows
        // into the outside-top-10 and special harvest boards. The margin is
        // unchanged either way - the money just lands somewhere better.
        //
        // The ladder used to fall $2,500 a step to $2,500 at 10th, which meant
        // 9th paid double 10th and, on a full field, the ten caps could only
        // hold $137,500 of a $365,625 purse - the surplus had to pile up on the
        // milestone prizes. It now eases from $25,000 to $10,000, so the board
        // reads evenly AND holds $165,000.
        //
        // Set to null to remove the ceilings entirely.
        caps: [25000, 22500, 20500, 18500, 16500, 15000, 13500, 12500, 11000, 10000],

        // Round each prize down to a tidy number. First matching rule wins.
        // A step wider than the gap between two places merges them, so the
        // coarse steps only apply once the prizes are big enough to carry them.
        rounding: [
            { minModel: 1000, step: 250 },
            { minModel: 500, step: 100 },
            { minModel: 0, step: 50 },
        ],
    },

    outsideTopTen: {
        // No prizes outside the top 10 until this many entries.
        minModel: 100,

        // Each row is ONE finishing place, funded on its own. It used to be a
        // bracket of five paid the same amount, which meant 11th-15th had to be
        // affordable all together or none of them showed at all. Now the board
        // simply pays as far down as the money reaches.
        placesPerTier: 1,

        // One extra place paid per N hunters.
        huntersPerTier: 10,

        // 65 places = 11th through 75th, and the board never goes past 75th.
        maxTiers: 65,

        // Each place is worth this much less than the one above it, as a
        // fraction of 11th. Floored so the deepest places stay worth winning -
        // 11th pays 4x what 75th pays.
        decayPerTier: 0.0117,
        minWeightFraction: 0.25,

        rounding: [
            { minModel: 1000, step: 100 },
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
            // Hard ceiling per point class. Money over it is shared among the
            // milestone prizes rather than kept. Set to null to remove.
            cap: 5000,
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
            { minModel: 1000, step: 250 },
            { minModel: 300, step: 100 },
            { minModel: 0, step: 50 },
        ],
    },
};

// Exported for the Node test harness; ignored by the browser.
if (typeof module !== 'undefined') module.exports = { CONFIG };
