// ---------------------------------------------------------------------------
// APEX Whitetail Challenge - payout calculator
//
// All tunable numbers live in payoutConfig.js. This file is the machinery.
//
// How a board is built:
//   1. purse            = gross revenue x the payout rate for this field size
//   2. payout model     = entries rounded down (decides how many places pay)
//   3. active boards    = which of the three boards have unlocked
//   4. shares           = CONFIG.purseSplit, renormalised over active boards
//   5. prizes           = each board's slice handed out by weight, rounded down
//   6. leftovers        = rounding remainder given back out a step at a time
//
// Because the purse is fixed up front, the house margin lands on target at any
// field size, prizes can never exceed revenue, and prizes can never
// invert (weights descend, and every prize in a board rounds to the same step).
// ---------------------------------------------------------------------------

const summaryEntries = document.querySelector('#payout-nums tr td:nth-child(1)');
const summaryModel = document.querySelector('#payout-nums tr td:nth-child(2)');
const summaryRevenue = document.querySelector('#payout-nums tr:nth-child(4) td:nth-child(1)');
const summaryPayout = document.querySelector('#payout-nums tr:nth-child(4) td:nth-child(2)');
const summaryMargin = document.getElementById('gross-margin');

const topTenBody = document.querySelector('#top-ten tbody');
const outsideBody = document.querySelector('#outside-top-ten tbody');
const specialBody = document.querySelector('#special-harvest tbody');

const entriesForm = document.getElementById('hunter-entries');
const entryFeeForm = document.getElementById('entry-fee');
const entriesInput = document.getElementById('hunter-entries-input');
const entryFeeInput = document.getElementById('entry-fee-input');
const inputError = document.getElementById('input-error');

const usd = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
});

// --- small helpers ---------------------------------------------------------

function roundDownTo(value, step) {
    if (!step) return Math.floor(value);
    return Math.floor(value / step) * step;
}

// First matching rule wins; rules are listed highest-threshold first.
// Snapped up to the increment so a config typo cannot produce an off-grid prize.
function stepFor(rules, model) {
    const rule = rules.find(r => model >= r.minModel);
    const step = rule ? rule.step : CONFIG.payoutIncrement;
    return roundUpTo(step, CONFIG.payoutIncrement);
}

function ordinalRange(start, count) {
    const end = start + count - 1;
    return count === 1 ? `${ordinal(start)}` : `${ordinal(start)}-${ordinal(end)}`;
}

function ordinal(n) {
    const rem100 = n % 100;
    if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
    switch (n % 10) {
        case 1: return `${n}st`;
        case 2: return `${n}nd`;
        case 3: return `${n}rd`;
        default: return `${n}th`;
    }
}

// Every prize is a whole multiple of this, so the only legal step sizes are its
// multiples. Coarser steps make a rounder-looking board; finer steps waste less.
const INCREMENT = CONFIG.payoutIncrement;
// Minimum step between neighbouring finishing places (see CONFIG.minPlaceGap).
const MIN_GAP = Math.max(CONFIG.minPlaceGap || INCREMENT, INCREMENT);
const STEP_LADDER = [1000, 500, 250, 100, 50, 25, 10, 5, 1]
    .filter(step => step % INCREMENT === 0 && step >= INCREMENT);

function roundUpTo(value, step) {
    if (!step) return Math.ceil(value);
    return Math.ceil(value / step) * step;
}

// How much of a pool a coarse step is allowed to strand before we drop to a
// finer one. The stranded remainder is handed back to hunters afterwards, so
// this only governs how round the board looks, not who keeps the money.
const MAX_ROUNDING_LOSS = 0.02;

// Pick the coarsest legal step that still leaves the *smallest* prize worth at
// least one step and does not strand more than MAX_ROUNDING_LOSS of the pool.
// The first rule matters because otherwise a thin pool rounds every prize to
// zero; the second keeps the board from leaning on the give-back pass.
function chooseStep(maxStep, pool, weights) {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight <= 0 || pool <= 0) return INCREMENT;
    const smallestShare = (pool * Math.min(...weights)) / totalWeight;
    const lossCeiling = Math.max(pool * MAX_ROUNDING_LOSS, INCREMENT);
    for (const step of STEP_LADDER) {
        if (step <= maxStep && smallestShare >= step && step <= lossCeiling) return step;
    }
    return INCREMENT;
}

// Hand out `pool` across `weights`, rounded down to a tidy step, then give the
// rounding remainder back one step at a time from the top down. Handing it back
// in descending order keeps the prizes non-increasing.
//
// `seats` says how many hunters each entry pays. An entry with four seats costs
// four times its prize and is raised four seats at a time, so everyone in it is
// always paid exactly the same - that is how the point classes stay level.
// Returns the per-seat prize for each entry.
function distribute(pool, weights, maxStep, seats, strict) {
    const seatCounts = seats || weights.map(() => 1);
    const totalWeight = weights.reduce((sum, w, i) => sum + w * seatCounts[i], 0);
    if (totalWeight <= 0 || pool <= 0) return weights.map(() => 0);

    const step = chooseStep(maxStep, pool, weights.map((w, i) => w * seatCounts[i]));
    const prizes = weights.map(w => roundDownTo((pool * w) / totalWeight, step));
    let leftover = pool - prizes.reduce((sum, p, i) => sum + p * seatCounts[i], 0);

    let guard = 0;
    let progress = true;
    while (leftover > 0 && progress && guard < 10000) {
        progress = false;
        for (let k = 0; k < prizes.length; k++) {
            const cost = step * seatCounts[k];
            if (cost > leftover) continue;
            // Never let an entry climb past the one above it. `strict` also
            // forbids drawing level with it - finishing places are a ladder, so
            // handing back leftovers must not merge 11th through 20th onto one
            // figure. Special Harvest passes strict = false, because the four
            // point classes are deliberately equal.
            if (k > 0) {
                const room = strict ? prizes[k - 1] - MIN_GAP : prizes[k - 1];
                if (prizes[k] + step > room) continue;
            }
            prizes[k] += step;
            leftover -= cost;
            progress = true;
        }
        guard++;
    }
    return prizes;
}

// Share out a pool, but never award a prize below `floor`. Prizes are dropped
// from the bottom up - each drop makes the survivors bigger, so this converges -
// and the whole pool is still handed out, which is what keeps the margin on
// target. Returns an array the same length as `weights`, zero-padded for the
// prizes that were dropped.
function distributeWithFloor(pool, weights, maxStep, floor, strict) {
    for (let count = weights.length; count >= 1; count--) {
        const prizes = distribute(pool, weights.slice(0, count), maxStep, null, strict);

        // Force the minimum step between places. Rounding to the $50 grid can
        // land two places on the same figure, or $50 apart, before the leftover
        // pass ever runs - so walk the ladder and hold each place at least
        // MIN_GAP below the one above. Anything that falls under the floor as a
        // result fails the check below and the count drops by one.
        if (strict) {
            let rung = Infinity;
            for (let i = 0; i < prizes.length; i++) {
                prizes[i] = Math.min(prizes[i], rung);
                rung = prizes[i] - MIN_GAP;
            }
        }

        if (prizes[count - 1] >= floor) {
            return prizes.concat(new Array(weights.length - count).fill(0));
        }
    }
    // Not even one prize clears the floor - this board cannot pay yet.
    return weights.map(() => 0);
}

// Apply per-place ceilings. Anything over a cap is first offered to places that
// are still under theirs (highest place first), and whatever still will not fit
// is returned as overflow for the other boards to absorb.
//
// Ordering is safe because the caps themselves descend: a place can never be
// topped up past the place above it.
function applyCaps(prizes, caps, step) {
    if (!caps) return { prizes, overflow: 0 };

    const capped = prizes.map((amount, i) => {
        const cap = caps[i];
        return typeof cap === 'number' ? Math.min(amount, cap) : amount;
    });
    let overflow = prizes.reduce((a, b) => a + b, 0) - capped.reduce((a, b) => a + b, 0);

    // Top up places that still have headroom, in whole steps.
    let guard = 0;
    let progress = true;
    while (overflow >= step && progress && guard < 10000) {
        progress = false;
        for (let i = 0; i < capped.length && overflow >= step; i++) {
            const cap = caps[i];
            // Only pay places that were already winning something.
            if (capped[i] <= 0) continue;
            if (typeof cap === 'number' && capped[i] + step > cap) continue;
            capped[i] += step;
            overflow -= step;
            progress = true;
        }
        guard++;
    }
    return { prizes: capped, overflow };
}

// The point-class drawings are all-or-nothing: 10PT, 9PT, 8PT and 7PT are
// unveiled together or not at all. Awarding 10PT on its own is not a thing.
//
// So the drawings are tried as one block. Milestones are individually optional
// and get trimmed from the bottom first, because they are the cheaper prizes.
// If the block still cannot be funded with every member clearing the floor, all
// four are dropped and the money goes to whatever else the board can pay.
function distributeSpecialBoard(pool, drawings, milestones, step, floor) {
    const attempt = (withDrawings, milestoneCount) => {
        const entries = (withDrawings ? drawings : [])
            .concat(milestones.slice(0, milestoneCount));
        if (!entries.length) return null;
        const seatList = entries.map(e => e.seats);
        let prizes = distribute(pool, entries.map(e => e.weight), step, seatList);

        // Anything over a per-entry ceiling is re-shared among the entries that
        // do not have one, so a capped drawing makes the milestones bigger
        // instead of handing money back to the house.
        for (let pass = 0; pass < 4; pass++) {
            let excess = 0;
            prizes = prizes.map((p, i) => {
                const cap = entries[i].cap;
                if (typeof cap === 'number' && p > cap) {
                    excess += (p - cap) * seatList[i];
                    return cap;
                }
                return p;
            });
            if (excess < step) break;
            const openWeights = entries.map((e, i) =>
                (typeof e.cap === 'number' && prizes[i] >= e.cap) ? 0 : e.weight);
            if (openWeights.every(w => w === 0)) break;
            const extra = distribute(excess, openWeights, step, seatList);
            prizes = prizes.map((p, i) => p + extra[i]);
        }

        // Final clamp: the redistribution loop above can hand out one last
        // increment on its closing pass, which is how 300th came to pay $6,250
        // against a $6,000 ceiling.
        prizes = prizes.map((p, i) => {
            const cap = entries[i].cap;
            return (typeof cap === 'number' && p > cap) ? cap : p;
        });

        if (prizes.some(p => p < floor)) return null;
        return { entries, prizes };
    };

    // Prefer the full block plus as many milestones as will clear the floor.
    for (let count = milestones.length; count >= 0; count--) {
        const result = attempt(true, count);
        if (result) return result;
    }
    // The block cannot be funded - drop all four rather than unveil a subset.
    for (let count = milestones.length; count >= 1; count--) {
        const result = attempt(false, count);
        if (result) return result;
    }
    return { entries: [], prizes: [] };
}

// Prize weights spaced evenly from 1st down to last, with 1st worth `ratio`
// times the last. ratio 1 means every place pays the same.
function gradedWeights(count, ratio) {
    if (count <= 1) return [1];
    return Array.from({ length: count },
        (_, i) => Math.pow(ratio, (count - 1 - i) / (count - 1)));
}

// What a set of places costs if the lowest one sits exactly on the floor.
//
// Closed form rather than building the weights: they are a geometric series
// with the smallest term at 1, so the total is just the sum of that series.
// This sits inside a binary search that runs for every board, and building
// arrays there cost 17ms a board.
//
// Rounded UP to the increment: funding to the exact penny leaves the lowest
// place at $449.99999999999994 in floating point, which rounds down to $400,
// fails the floor check, and silently costs someone their prize.
function costOfPlaces(count, ratio, floorAmt) {
    let sum;
    if (count <= 1) {
        sum = 1;
    } else {
        const q = Math.pow(ratio, 1 / (count - 1));
        sum = Math.abs(q - 1) < 1e-12 ? count : (Math.pow(q, count) - 1) / (q - 1);
    }
    return roundUpTo(floorAmt * sum, CONFIG.payoutIncrement);
}

// The widest gap the money can carry while still paying every place at least
// the floor. Returns null when even equal prizes will not fit.
function fitRatio(pool, count, floorAmt, maxRatio) {
    if (costOfPlaces(count, 1, floorAmt) > pool) return null;
    if (costOfPlaces(count, maxRatio, floorAmt) <= pool) return maxRatio;
    let lo = 1, hi = maxRatio;
    for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (costOfPlaces(count, mid, floorAmt) <= pool) lo = mid; else hi = mid;
    }
    return lo;
}

// Share of revenue paid back to hunters at this field size - see CONFIG.payout.
function payoutRateFor(entries) {
    const p = CONFIG.payout;
    if (entries <= p.smallField) return p.smallRate;
    if (entries >= p.fullField) return p.fullRate;
    const progress = (entries - p.smallField) / (p.fullField - p.smallField);
    return p.smallRate - (p.smallRate - p.fullRate) * progress;
}

// --- board shape -----------------------------------------------------------

function payoutModel(entries) {
    const step = entries < 400 ? CONFIG.model.roundToBelow400 : CONFIG.model.roundToFrom400;
    return roundDownTo(entries, step);
}

function topPlacesPaid(model) {
    const raw = Math.floor(model / CONFIG.topTen.huntersPerPlace);
    return Math.min(Math.max(raw, CONFIG.topTen.minPlaces), CONFIG.topTen.maxPlaces);
}

// One paid place per 10 hunters, counting straight on past 10th. The first ten
// are the top ten; everything after that lands in this column. So 11th cannot
// appear before 10th exists - the rule enforces itself rather than needing a
// magic entry threshold - and the board grows one place at a time.
function outsideTierCount(model) {
    if (model < CONFIG.outsideTopTen.minModel) return 0;
    const totalPlaces = Math.floor(model / CONFIG.outsideTopTen.huntersPerTier);
    const beyondTopTen = totalPlaces - CONFIG.topTen.maxPlaces;
    return Math.max(0, Math.min(beyondTopTen, CONFIG.outsideTopTen.maxTiers));
}

function unlockedMilestones(model) {
    return CONFIG.specialHarvest.milestones.filter(m => model >= m.minModel);
}

// --- the calculation --------------------------------------------------------

function buildBoard(entries, entryFee) {
    const revenue = entries * entryFee;
    const payoutRate = payoutRateFor(entries);
    const purse = revenue * payoutRate;
    const model = payoutModel(entries);

    const places = topPlacesPaid(model);
    let tiers = outsideTierCount(model);
    const milestones = unlockedMilestones(model);
    const drawingsOn = model >= CONFIG.specialHarvest.minModel;
    const specialOn = drawingsOn || milestones.length > 0;

    // Snapped UP to the increment: a $110 entry means a $220 minimum, which is
    // not a legal prize, so the real floor is $250.
    const floor = roundUpTo(entryFee * CONFIG.minPayoutMultiple, INCREMENT);

    // Which boards are unlocked by entry count. A board can also switch itself
    // off below, if its slice is too thin to fund even one prize at the floor -
    // in which case its money goes back to the boards that can pay, so we
    // recompute until the set of paying boards settles.
    const active = {
        topTen: true,
        outsideTopTen: tiers > 0,
        specialHarvest: specialOn,
    };

    // The four point classes are one unit paying four hunters the same amount.
    // Milestones are separate units paying one hunter each.
    const drawings = drawingsOn ? [{
        labels: CONFIG.specialHarvest.drawings.labels,
        weight: CONFIG.specialHarvest.drawings.weight,
        seats: CONFIG.specialHarvest.drawings.labels.length,
        cap: CONFIG.specialHarvest.drawings.cap,
    }] : [];
    const milestoneUnits = milestones.map(m => ({
        labels: [m.label], weight: m.weight, seats: 1, cap: m.cap,
    }));
    // Filled in below - only the prizes the board can actually fund.
    let specialEntries = [];

    const { placesPerTier, decayPerTier, minWeightFraction } = CONFIG.outsideTopTen;
    const weightsForTiers = count => {
        const out = [];
        for (let i = 0; i < count; i++) {
            out.push(Math.max(1 - i * decayPerTier, minWeightFraction));
        }
        return out;
    };
    let tierWeights = weightsForTiers(tiers);

    let topPrizes = [];
    let perSeat = [];
    let specialPrizes = [];
    let specialPool = 0;
    // Capped money with nowhere to go, because no other board has unlocked yet.
    let unallocated = 0;
    let chosenRatio = CONFIG.topTen.maxRatio;

    for (let pass = 0; pass < 4; pass++) {
        const activeTotal = Object.keys(active)
            .filter(k => active[k])
            .reduce((sum, k) => sum + CONFIG.purseSplit[k], 0);
        const shareOf = key => (active[key] && activeTotal > 0
            ? CONFIG.purseSplit[key] / activeTotal
            : 0);

        // The top ten is funded FIRST, and only borrows what it actually needs.
        //
        // This used to be all-or-nothing: if the top ten came up short, the
        // outside board switched off entirely and handed back its whole 31%.
        // One extra hunter then flipped it back on, and the board lurched -
        // at a $225 entry, going from 103 to 104 entries paid nine more
        // hunters but cut 10th place from $650 to $450.
        //
        // Now the top ten takes its share, tops up to whatever it needs to keep
        // its lowest place above the floor, and the outside board pays as far
        // down as the remainder reaches. One more hunter is always one more
        // dollar, never a cliff.
        // Keep the places, fit the gap. Rather than holding a fixed 3:1 spread
        // and dropping a place when it will not fit, we pay every place the
        // ladder calls for and use the widest gap the money can carry.
        // Set the Special Harvest block aside BEFORE the top ten widens its gap,
        // otherwise the top ten spends the money the block needed and the column
        // disappears again. Only reserved when the block is affordable once
        // every top-ten place has its minimum.
        const blockNeeds = drawings.length
            ? roundUpTo(floor * CONFIG.specialHarvest.drawings.labels.length, INCREMENT)
            : 0;
        const cheapestTopTen = costOfPlaces(places, 1, floor);
        const blockReserve = (active.specialHarvest && blockNeeds > 0
            && purse - cheapestTopTen >= blockNeeds) ? blockNeeds : 0;

        const placingsPool = Math.min(
            purse * (shareOf('topTen') + shareOf('outsideTopTen')),
            purse - blockReserve);

        let paidPlaces = places;
        let ratio = fitRatio(placingsPool, paidPlaces, floor, CONFIG.topTen.maxRatio);
        // Only if even equal prizes will not stretch that far do we pay fewer.
        while (ratio === null && paidPlaces > CONFIG.topTen.minPlaces) {
            paidPlaces -= 1;
            ratio = fitRatio(placingsPool, paidPlaces, floor, CONFIG.topTen.maxRatio);
        }
        if (ratio === null) ratio = 1;

        const topWeights = gradedWeights(paidPlaces, ratio);
        chosenRatio = ratio;
        const needForFloor = costOfPlaces(paidPlaces, ratio, floor);

        const topPool = Math.min(
            Math.max(purse * shareOf('topTen'), needForFloor),
            placingsPool);

        // Order of the waterfall: top ten, then Special Harvest, then the deep
        // placings. Special comes second because its block is all-or-nothing -
        // it either affords four prizes or shows nothing at all - whereas the
        // outside column can pay however many places the leftovers reach.
        //
        // Without this the column flickered: shown at 57-59 entries, gone from
        // 60 when the outside column opened and took its 31% back, and not seen
        // again until 87.
        // Pay the top ten first, so we know what 10th is worth.
        const topStep = stepFor(CONFIG.topTen.rounding, model);
        const firstPass = applyCaps(
            distributeWithFloor(topPool, topWeights, topStep, floor, true),
            CONFIG.topTen.caps, topStep);

        // The outside column can only hold so much: its ladder runs from one
        // increment under 10th down to the floor in $50 steps, so there is a
        // hard ceiling on what it can legally absorb. Reserving a full 31% for
        // it when it can only take a single $450 place left the surplus washing
        // into Special Harvest - which is how the point classes came to pay
        // $1,950 against a $1,650 first place.
        //
        // So measure that capacity, and hand anything beyond it back to the top
        // ten. The placings keep the money; the drawings only ever get their
        // own share.
        const firstPaid = firstPass.prizes.filter(v => v > 0);
        let rung = firstPaid.length ? Math.min(...firstPaid) - MIN_GAP : 0;
        let outsideCapacity = 0;
        for (let seats = 0; rung >= floor && seats < CONFIG.outsideTopTen.maxTiers;
             rung -= MIN_GAP, seats++) {
            outsideCapacity += rung;
        }

        const afterTopTenFirst = purse - topPool;
        const specialWanted = purse * shareOf('specialHarvest');
        const specialFirst = active.specialHarvest
            ? Math.min(Math.max(specialWanted, blockNeeds), afterTopTenFirst)
            : 0;
        const outsideWanted = Math.max(0, afterTopTenFirst - specialFirst);
        const usableOutside = Math.min(outsideWanted, outsideCapacity);
        const handedBackToTopTen = outsideWanted - usableOutside;

        let cappedOverflow = firstPass.overflow;
        topPrizes = firstPass.prizes;
        if (handedBackToTopTen > 0) {
            const boosted = applyCaps(
                distributeWithFloor(topPool + handedBackToTopTen, topWeights,
                    topStep, floor, true),
                CONFIG.topTen.caps, topStep);
            topPrizes = boosted.prizes;
            cappedOverflow = boosted.overflow;
        }

        // Money the top ten could not hold goes to the other boards rather than
        // to the house. The placings get first call on it: paying more hunters
        // who actually finished beats inflating a handful of drawings.
        //
        // No outside bracket may pass the smallest top-ten prize, so once the
        // brackets are all at that ceiling the only way to absorb more is to pay
        // DEEPER - so the board grows brackets until the money fits or it runs
        // out of room. Whatever is still left goes to special harvest.
        const paidTopCount = topPrizes.filter(v => v > 0).length;
        // 11th must be STRICTLY below 10th - never merely equal to it. So the
        // ceiling for the outside column is one increment under the smallest
        // top-ten prize. A knock-on: the column cannot open at all until 10th
        // clears the floor by an increment, which is exactly right - a board
        // showing 10th through 20th all on the same figure helps nobody.
        const outsideCeilingNow = paidTopCount
            ? Math.min(...topPrizes.filter(v => v > 0)) - MIN_GAP
            : Infinity;
        // Outside stays shut while any top-ten place is unpaid - which now
        // happens naturally, because a short top ten leaves nothing over.
        const outsideOpen = active.outsideTopTen
            && paidTopCount >= paidPlaces
            && paidTopCount >= CONFIG.topTen.maxPlaces
            // If 10th is still on the floor there is no legal room beneath it:
            // 11th would have to be below the 2x minimum, which never happens.
            && outsideCeilingNow >= floor;
        let outsidePool = outsideOpen ? usableOutside + cappedOverflow : 0;
        let leftForSpecial = outsideOpen ? 0 : cappedOverflow;

        if (outsideOpen && outsidePool > 0) {
            const outStep = stepFor(CONFIG.outsideTopTen.rounding, model);

            // Grade these the same way as the top ten: widest gap the money can
            // carry, between the floor and one increment under 10th place.
            //
            // And never pay more places than there are distinct values to give
            // them. At 115 entries 10th pays $500, so 11th can be at most $450 -
            // which is the floor - leaving exactly one legal value. Paying ten
            // places there put $450 against every one of 11th through 20th.
            const roomForDistinct = Math.max(1,
                Math.floor((outsideCeilingNow - floor) / MIN_GAP) + 1);
            const outsideMaxRatio = Math.max(1, outsideCeilingNow / floor);

            // How many places the money can actually carry. Every place must be
            // a distinct $50 step above the floor, so the cheapest possible
            // ladder of k places is 450 + 500 + 550 ... - NOT k x 450.
            //
            // Costing it as k x the floor said "eleven places at $450" on a
            // $5,000 pool; the descent then had nowhere to put nine of them and
            // zeroed them, so 200 entries paid two hunters outside the top ten
            // while $5,000 sat unspent. The ladder cost is what decides it now.
            const ladderCost = k => k * floor + MIN_GAP * (k * (k - 1)) / 2;
            let count = Math.min(tiers, CONFIG.outsideTopTen.maxTiers, roomForDistinct);
            while (count > 1 && ladderCost(count) > outsidePool) count -= 1;

            let outsideRatio = fitRatio(outsidePool, count, floor, outsideMaxRatio);
            while (outsideRatio === null && count > 1) {
                count -= 1;
                outsideRatio = fitRatio(outsidePool, count, floor, outsideMaxRatio);
            }

            let result = outsideRatio === null ? []
                : distributeWithFloor(outsidePool, gradedWeights(count, outsideRatio),
                    outStep, floor, true);

            // Clamp DOWN the ladder, not flat against the ceiling. Clamping every
            // place to the same maximum is what put $600 against 11th through
            // 14th: each place is instead held one increment below the one above.
            let rung = outsideCeilingNow;
            const clamped = result.map(v => {
                const amount = Math.min(v, rung);
                rung = amount - MIN_GAP;
                return amount < floor ? 0 : amount;
            });
            leftForSpecial = (result.reduce((a, b) => a + b, 0)
                - clamped.reduce((a, b) => a + b, 0));
            perSeat = clamped;
            tiers = count;
            tierWeights = outsideRatio === null ? [] : gradedWeights(count, outsideRatio);
        } else {
            perSeat = [];
        }
        specialPool = active.specialHarvest ? specialFirst + leftForSpecial : 0;
        if (active.specialHarvest) {
            const board = distributeSpecialBoard(
                specialPool, drawings, milestoneUnits,
                stepFor(CONFIG.specialHarvest.rounding, model),
                floor);
            specialEntries = board.entries;
            specialPrizes = board.prizes;
        } else {
            specialEntries = [];
            specialPrizes = [];
        }

        // A column that pays nothing must not hold on to its share - the money
        // belongs to the columns that CAN pay. Re-decided every pass rather than
        // latched off: with a bigger share a column may become affordable again,
        // which is what stopped Special Harvest showing at 57 entries and then
        // vanishing until 87.
        const stillPaying = {
            topTen: true,
            outsideTopTen: perSeat.some(v => v > 0),
            specialHarvest: specialPrizes.some(v => v > 0),
        };
        if (stillPaying.outsideTopTen === active.outsideTopTen
            && stillPaying.specialHarvest === active.specialHarvest) break;
        active.outsideTopTen = stillPaying.outsideTopTen;
        active.specialHarvest = stillPaying.specialHarvest;
    }

    // Finishing higher must always pay more. The outside-top-10 brackets are a
    // placing board just like the top ten, so no bracket may beat the smallest
    // top-ten prize - otherwise 11th out-earns 10th, which happens whenever the
    // outside board unlocks onto a single bracket holding its whole share.
    // Anything trimmed goes back to the top ten, up to the caps.
    const paidTop = topPrizes.filter(v => v > 0);
    if (paidTop.length && perSeat.length) {
        const ceiling = Math.min(...paidTop) - INCREMENT;
        const seats = placesPerTier;
        let reclaimed = 0;
        perSeat = perSeat.map(amount => {
            if (amount > ceiling) {
                reclaimed += (amount - ceiling) * seats;
                return ceiling;
            }
            return amount;
        });

        if (reclaimed > 0) {
            const topStep = stepFor(CONFIG.topTen.rounding, model);
            const refilled = applyCaps(
                topPrizes.map((v, i) => v + (i === 0 ? reclaimed : 0)),
                CONFIG.topTen.caps,
                topStep);
            topPrizes = refilled.prizes;

            // Whatever the top ten still cannot hold goes to special harvest.
            // Those are drawings, not finishing places, so growing them cannot
            // make anyone out-earn a hunter who finished above them.
            if (refilled.overflow > 0 && specialPrizes.length) {
                specialPool += refilled.overflow;
                // Rebuilt through the same all-or-nothing rule: a bigger pool
                // may now afford prizes the first pass could not.
                const rebuilt = distributeSpecialBoard(
                    specialPool, drawings, milestoneUnits,
                    stepFor(CONFIG.specialHarvest.rounding, model),
                    floor);
                specialEntries = rebuilt.entries;
                specialPrizes = rebuilt.prizes;
            }
        }
    }

    // Rounding every prize down to the increment always leaves money behind, and
    // that money would otherwise be a silent margin increase. Spend it: hand out
    // whole increments until the payout reaches its target, staying inside the
    // margin band and honouring every rule already established - caps, the
    // ordering between boards, and the descending shape within each board.
    //
    // Each bump goes to whichever prize sits furthest below its ideal weighted
    // share, so giving the remainder back tightens the intended shape instead of
    // distorting it.
    {
        const targetPayout = revenue * payoutRate;
        const maxPayout = revenue * (payoutRate + CONFIG.marginFlex);
        const seats = placesPerTier;

        const sumOf = () =>
            topPrizes.reduce((a, b) => a + b, 0)
            + perSeat.reduce((a, b) => a + b, 0) * seats
            + specialPrizes.reduce((sum, p, i) => sum + p * (specialEntries[i] ? specialEntries[i].seats : 1), 0);

        const idealsFor = (prizes, weights, pool) => {
            const total = weights.reduce((a, b) => a + b, 0);
            return prizes.map((_, i) => (total > 0 ? (pool * weights[i]) / total : 0));
        };
        const topIdeal = idealsFor(topPrizes, gradedWeights(topPrizes.length, chosenRatio),
            topPrizes.reduce((a, b) => a + b, 0));
        const outIdeal = idealsFor(perSeat, tierWeights,
            perSeat.reduce((a, b) => a + b, 0));
        const specIdeal = idealsFor(specialPrizes, specialEntries.map(e => e.weight),
            specialPrizes.reduce((sum, p, i) => sum + p * specialEntries[i].seats, 0));

        let payout = sumOf();
        for (let guard = 0; guard < 400 && payout < targetPayout; guard++) {
            const paidTopNow = topPrizes.filter(v => v > 0);
            const outsideCeiling = paidTopNow.length ? Math.min(...paidTopNow) - MIN_GAP : Infinity;
            const candidates = [];

            // limit = the highest this prize may legally reach.
            topPrizes.forEach((v, i) => {
                if (v <= 0) return;
                const cap = CONFIG.topTen.caps ? CONFIG.topTen.caps[i] : Infinity;
                // Stop one increment short of the place above: handing money back
                // must not flatten the ladder into a run of identical prizes.
                const limit = Math.min(cap, i > 0 ? topPrizes[i - 1] - MIN_GAP : Infinity);
                candidates.push({ v, limit, cost: INCREMENT, deficit: topIdeal[i] - v,
                    bump: k => { topPrizes[i] += k * INCREMENT; } });
            });
            perSeat.forEach((v, i) => {
                if (v <= 0) return;
                const limit = Math.min(outsideCeiling, i > 0 ? perSeat[i - 1] - MIN_GAP : Infinity);
                candidates.push({ v, limit, cost: INCREMENT * seats, deficit: outIdeal[i] - v,
                    bump: k => { perSeat[i] += k * INCREMENT; } });
            });
            specialPrizes.forEach((v, i) => {
                if (v <= 0) return;
                const unit = specialEntries[i] || {};
                const limit = Math.min(
                    i > 0 ? specialPrizes[i - 1] : Infinity,
                    typeof unit.cap === 'number' ? unit.cap : Infinity);
                const unitSeats = unit.seats || 1;
                candidates.push({ v, limit, cost: INCREMENT * unitSeats, deficit: specIdeal[i] - v,
                    bump: k => { specialPrizes[i] += k * INCREMENT; } });
            });

            // Raise the neediest prize by as many increments as it can take in
            // one go - one at a time is correct but needlessly slow.
            candidates.sort((a, b) => b.deficit - a.deficit);
            let moved = false;
            for (const c of candidates) {
                const headroom = Math.floor((c.limit - c.v) / INCREMENT);
                const toTarget = Math.floor((targetPayout - payout) / c.cost);
                const toIdeal = Math.max(1, Math.ceil(c.deficit / INCREMENT));
                let k = Math.min(headroom, toTarget, toIdeal);
                // Close the last sub-increment gap with one final step, which is
                // what the margin band is there to absorb.
                if (k < 1 && headroom >= 1 && payout + c.cost <= maxPayout) k = 1;
                if (k < 1) continue;
                c.bump(k);
                payout += k * c.cost;
                moved = true;
                break;
            }
            if (!moved) break;
        }
    }

    // Dropped prizes are omitted from the board entirely rather than shown as $0.
    const topRows = topPrizes
        .map((amount, i) => ({ label: ordinal(i + 1), amount, seats: 1 }))
        .filter(r => r.amount > 0);

    const outsideRows = [];
    let start = CONFIG.topTen.maxPlaces + 1;
    for (let i = 0; i < perSeat.length; i++) {
        if (perSeat[i] > 0) {
            outsideRows.push({
                label: ordinalRange(start, placesPerTier),
                amount: perSeat[i],
                seats: placesPerTier,
            });
        }
        start += placesPerTier;
    }

    const specialRows = [];
    specialEntries.forEach((unit, i) => {
        const amount = specialPrizes[i] || 0;
        if (amount <= 0) return;
        // One row per label; every label in a unit shows the same amount.
        for (const label of unit.labels) specialRows.push({ label, amount, seats: 1 });
    });

    const allRows = [...topRows, ...outsideRows, ...specialRows];
    const hunterPayout = allRows.reduce((sum, r) => sum + r.amount * r.seats, 0);
    const grossMargin = revenue - hunterPayout;

    // Purse money the board could not place anywhere, measured against what was
    // actually paid rather than guessed at part-way through - the give-back pass
    // usually finds a home for it, so anything counted earlier is provisional.
    unallocated = Math.max(0, purse - hunterPayout);

    // Why an empty board is empty. "Unlocks at N entries" is only true when the
    // entry count is the actual reason; more often the top ten is still
    // absorbing the whole purse, and saying otherwise reads as a bug.
    const outsideNote = outsideRows.length ? '' :
        model < CONFIG.outsideTopTen.minModel
            ? `Unlocks at ${CONFIG.outsideTopTen.minModel} entries`
            : `The top ten is funded first - a few more entries opens this up`;

    const specialNote = specialRows.length ? '' :
        model < CONFIG.specialHarvest.minModel
            ? `Unlocks at ${CONFIG.specialHarvest.minModel} entries`
            : `All four point classes must be affordable together`;

    return {
        entries, entryFee, model, revenue, hunterPayout, grossMargin,
        marginPercent: revenue > 0 ? Math.round((grossMargin / revenue) * 100) : 0,
        topRows, outsideRows, specialRows, unallocated,
        outsideNote, specialNote,
    };
}

// --- rendering --------------------------------------------------------------

function renderRows(tbody, rows, emptyMessage) {
    tbody.innerHTML = '';
    if (!rows.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 2;
        td.className = 'empty-note';
        td.textContent = emptyMessage;
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }
    for (const row of rows) {
        const tr = document.createElement('tr');
        const label = document.createElement('td');
        const amount = document.createElement('td');
        label.textContent = row.label;
        amount.textContent = usd.format(row.amount);
        tr.appendChild(label);
        tr.appendChild(amount);
        tbody.appendChild(tr);
    }
}

function render(board) {
    renderRows(topTenBody, board.topRows, 'No prizes yet');
    renderRows(outsideBody, board.outsideRows, board.outsideNote);
    renderRows(specialBody, board.specialRows, board.specialNote);

    summaryEntries.textContent = board.entries.toLocaleString('en-US');
    summaryModel.textContent = board.model.toLocaleString('en-US');
    summaryRevenue.textContent = usd.format(board.revenue);
    summaryPayout.textContent = usd.format(board.hunterPayout);
    summaryMargin.textContent = `${usd.format(board.grossMargin)} (${board.marginPercent}%)`;
    summaryMargin.classList.toggle('negative', board.grossMargin < 0);
}

// --- input handling ---------------------------------------------------------

// Tolerates commas, spaces and "$". Returns null when the field is unusable so
// the caller can keep the previous value instead of rendering NaN.
function readPositiveInt(input) {
    const raw = String(input.value).replace(/[$,\s]/g, '');
    if (raw === '') return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1) return null;
    return Math.floor(parsed);
}

// Defaults: the field sells out at 2,500 and the entry is $225.
let hEntries = 2500;
let entryFee = 225;

// Both forms behave identically: re-read BOTH fields, validate, recalculate.
// Reading both matters because a user can type a new entry fee and then press
// Enter in the entries field and expect the new fee to apply.
function handleSubmit(e) {
    e.preventDefault();

    const nextEntries = readPositiveInt(entriesInput);
    const nextFee = readPositiveInt(entryFeeInput);
    const entriesBlank = String(entriesInput.value).trim() === '';
    const feeBlank = String(entryFeeInput.value).trim() === '';

    if ((nextEntries === null && !entriesBlank) || (nextFee === null && !feeBlank)) {
        inputError.textContent = 'Enter whole numbers greater than zero for hunter entries and entry fee.';
        return;
    }

    inputError.textContent = '';
    if (nextEntries !== null) hEntries = nextEntries;
    if (nextFee !== null) entryFee = nextFee;

    render(buildBoard(hEntries, entryFee));
}

if (entriesForm) {
    entriesForm.addEventListener('submit', handleSubmit);
    entryFeeForm.addEventListener('submit', handleSubmit);
    render(buildBoard(hEntries, entryFee));
}

// Exported for the Node test harness; ignored by the browser.
if (typeof module !== 'undefined') module.exports = { buildBoard, payoutModel, distribute };
