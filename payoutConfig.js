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

    // Share of gross revenue paid back to hunters, by field size.
    //
    // A thin field pays out more so the board can actually fill: at or below
    // `smallField` entries the house takes 30%, and that eases evenly up to the
    // full 35% by `fullField` entries. It costs very little - about $500 at 50
    // entries and near nothing above that, because on a small board the extra
    // money often cannot be spent anyway once prizes have to land on $50 and
    // clear the floor. What it buys is Special Harvest appearing at 57 entries
    // instead of 88.
    payout: {
        smallRate: 0.70,   // 30% margin
        smallField: 50,
        fullRate: 0.65,    // 35% margin
        fullField: 100,
    },

    // How far below the target margin we may go to make prizes land on the
    // increment. Rounding down always strands money; this is the allowance to
    // hand it back rather than quietly keep it.
    marginFlex: 0.02,

    // Smallest allowed step between two finishing places, 1st through 75th.
    // Prizes still land on payoutIncrement, but neighbouring places must differ
    // by at least this, so the board never reads as a run of near-identical
    // figures.
    //
    // Not free: a wider minimum step makes each extra place cost more, so fewer
    // places fit the same purse.
    //
    // Does not apply to Special Harvest - the four point classes are meant to
    // be equal to each other.
    minPlaceGap: 100,

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
        // Must match outsideTopTen.huntersPerTier - the outside column simply
        // continues this same ladder past 10th.
        huntersPerPlace: 5,
        minPlaces: 3,
        maxPlaces: 10,

        // How much more 1st wins than 10th, at most. 3 means 1st takes three
        // times what 10th takes, with the places in between spaced evenly.
        //
        // This is a CEILING, not a fixed shape. When a field is too small to
        // spread the prizes that wide without dropping someone below the floor,
        // the gaps tighten instead - every place still gets paid, just closer
        // together. As the field grows the gaps open back out to this figure.
        // The old behaviour was the reverse: hold the gap and pay fewer places,
        // which is why 50 entries used to pay nine places instead of ten.
        maxRatio: 3,

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
        // No ceiling on the top ten. Special Harvest is capped per prize
        // instead, so a big field lifts the places hunters actually competed
        // for rather than piling into the drawings.
        caps: null,

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
        // No hard entry threshold. The board funds the top ten first and pays
        // out here with whatever is left, so this column appears on its own
        // once there is money spare - no cliff at a magic number.
        minModel: 0,

        // Each row is ONE finishing place, funded on its own. It used to be a
        // bracket of five paid the same amount, which meant 11th-15th had to be
        // affordable all together or none of them showed at all. Now the board
        // simply pays as far down as the money reaches.
        placesPerTier: 1,

        // One extra place paid per N hunters. Keep in step with
        // topTen.huntersPerPlace: this is one continuous ladder.
        huntersPerTier: 5,

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
            { label: '100th', minModel: 300, weight: 2, cap: 4500 },
            { label: '200th', minModel: 500, weight: 2, cap: 4000 },
            { label: '300th', minModel: 800, weight: 0.6, cap: 3500 },
            { label: '400th', minModel: 1000, weight: 0.6, cap: 3000 },
            { label: '500th', minModel: 1200, weight: 0.6, cap: 2500 },
            { label: '750th', minModel: 1750, weight: 0.6, cap: 2000 },
            { label: '1000th', minModel: 2000, weight: 0.6, cap: 1500 },
            { label: '1250th', minModel: 2500, weight: 0.6, cap: 1000 },
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
