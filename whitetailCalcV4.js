// ---------------------------------------------------------------------------
// APEX Whitetail Challenge - payout calculator
//
// All tunable numbers live in payoutConfig.js. This file is the machinery.
//
// How a board is built:
//   1. purse            = gross revenue x CONFIG.payoutRate
//   2. payout model     = entries rounded down (decides how many places pay)
//   3. active boards    = which of the three boards have unlocked
//   4. shares           = CONFIG.purseSplit, renormalised over active boards
//   5. prizes           = each board's slice handed out by weight, rounded down
//   6. leftovers        = rounding remainder given back out a step at a time
//
// Because the purse is fixed up front, the house margin is CONFIG.payoutRate no
// matter the field size, prizes can never exceed revenue, and prizes can never
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
function distribute(pool, weights, maxStep) {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight <= 0 || pool <= 0) return weights.map(() => 0);

    const step = chooseStep(maxStep, pool, weights);
    const prizes = weights.map(w => roundDownTo((pool * w) / totalWeight, step));
    let leftover = pool - prizes.reduce((a, b) => a + b, 0);

    let i = 0;
    let guard = 0;
    while (leftover >= step && guard < 10000) {
        prizes[i % prizes.length] += step;
        leftover -= step;
        i++;
        guard++;
    }
    return prizes;
}

// Share out a pool, but never award a prize below `floor`. Prizes are dropped
// from the bottom up - each drop makes the survivors bigger, so this converges -
// and the whole pool is still handed out, which is what keeps the margin on
// target. Returns an array the same length as `weights`, zero-padded for the
// prizes that were dropped.
function distributeWithFloor(pool, weights, maxStep, floor) {
    for (let count = weights.length; count >= 1; count--) {
        const prizes = distribute(pool, weights.slice(0, count), maxStep);
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
        const prizes = distribute(pool, entries.map(e => e.weight), step);
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

// --- board shape -----------------------------------------------------------

function payoutModel(entries) {
    const step = entries < 400 ? CONFIG.model.roundToBelow400 : CONFIG.model.roundToFrom400;
    return roundDownTo(entries, step);
}

function topPlacesPaid(model) {
    const raw = Math.floor(model / CONFIG.topTen.huntersPerPlace);
    return Math.min(Math.max(raw, CONFIG.topTen.minPlaces), CONFIG.topTen.maxPlaces);
}

function outsideTierCount(model) {
    if (model < CONFIG.outsideTopTen.minModel) return 0;
    const raw = Math.floor(model / CONFIG.outsideTopTen.huntersPerTier) + 1;
    return Math.min(raw, CONFIG.outsideTopTen.maxTiers);
}

function unlockedMilestones(model) {
    return CONFIG.specialHarvest.milestones.filter(m => model >= m.minModel);
}

// --- the calculation --------------------------------------------------------

function buildBoard(entries, entryFee) {
    const revenue = entries * entryFee;
    const purse = revenue * CONFIG.payoutRate;
    const model = payoutModel(entries);

    const places = topPlacesPaid(model);
    const tiers = outsideTierCount(model);
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

    const drawings = drawingsOn ? CONFIG.specialHarvest.drawings : [];
    // Filled in below - only the prizes the board can actually fund.
    let specialEntries = [];

    const { placesPerTier, decayPerTier, minWeightFraction } = CONFIG.outsideTopTen;
    const tierWeights = [];
    for (let i = 0; i < tiers; i++) {
        tierWeights.push(Math.max(1 - i * decayPerTier, minWeightFraction));
    }

    let topPrizes = [];
    let perSeat = [];
    let specialPrizes = [];
    let specialPool = 0;
    // Capped money with nowhere to go, because no other board has unlocked yet.
    let unallocated = 0;

    for (let pass = 0; pass < 4; pass++) {
        const activeTotal = Object.keys(active)
            .filter(k => active[k])
            .reduce((sum, k) => sum + CONFIG.purseSplit[k], 0);
        const shareOf = key => (active[key] && activeTotal > 0
            ? CONFIG.purseSplit[key] / activeTotal
            : 0);

        const topStep = stepFor(CONFIG.topTen.rounding, model);
        const uncapped = distributeWithFloor(
            purse * shareOf('topTen'),
            CONFIG.topTen.weights.slice(0, places),
            topStep,
            floor);
        const capped = applyCaps(uncapped, CONFIG.topTen.caps, topStep);
        topPrizes = capped.prizes;

        // Money the top ten could not hold is shared between the other boards in
        // proportion to their normal split, so the caps make those prizes bigger
        // rather than making the house richer.
        const otherShare = shareOf('outsideTopTen') + shareOf('specialHarvest');
        const overflowFor = key => (otherShare > 0
            ? capped.overflow * (shareOf(key) / otherShare)
            : 0);
        unallocated = otherShare > 0 ? 0 : capped.overflow;

        // Every bracket pays `placesPerTier` hunters the same amount, so share
        // out a per-seat pool and let each bracket cost placesPerTier x that.
        perSeat = active.outsideTopTen
            ? distributeWithFloor(
                (purse * shareOf('outsideTopTen') + overflowFor('outsideTopTen')) / placesPerTier,
                tierWeights,
                stepFor(CONFIG.outsideTopTen.rounding, model),
                floor)
            : [];

        specialPool = active.specialHarvest
            ? purse * shareOf('specialHarvest') + overflowFor('specialHarvest')
            : 0;
        if (active.specialHarvest) {
            const board = distributeSpecialBoard(
                specialPool, drawings, milestones,
                stepFor(CONFIG.specialHarvest.rounding, model),
                floor);
            specialEntries = board.entries;
            specialPrizes = board.prizes;
        } else {
            specialEntries = [];
            specialPrizes = [];
        }

        const stillPaying = {
            topTen: true,
            outsideTopTen: perSeat.some(v => v > 0),
            specialHarvest: specialPrizes.some(v => v > 0),
        };
        if (stillPaying.outsideTopTen === active.outsideTopTen
            && stillPaying.specialHarvest === active.specialHarvest) break;
        active.outsideTopTen = active.outsideTopTen && stillPaying.outsideTopTen;
        active.specialHarvest = active.specialHarvest && stillPaying.specialHarvest;
    }

    // Finishing higher must always pay more. The outside-top-10 brackets are a
    // placing board just like the top ten, so no bracket may beat the smallest
    // top-ten prize - otherwise 11th out-earns 10th, which happens whenever the
    // outside board unlocks onto a single bracket holding its whole share.
    // Anything trimmed goes back to the top ten, up to the caps.
    const paidTop = topPrizes.filter(v => v > 0);
    if (paidTop.length && perSeat.length) {
        const ceiling = Math.min(...paidTop);
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
                    specialPool, drawings, milestones,
                    stepFor(CONFIG.specialHarvest.rounding, model),
                    floor);
                specialEntries = rebuilt.entries;
                specialPrizes = rebuilt.prizes;
            } else {
                unallocated += refilled.overflow;
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
        const targetPayout = revenue * (1 - CONFIG.marginBand.max);
        const maxPayout = revenue * (1 - CONFIG.marginBand.min);
        const seats = placesPerTier;

        const sumOf = () =>
            topPrizes.reduce((a, b) => a + b, 0)
            + perSeat.reduce((a, b) => a + b, 0) * seats
            + specialPrizes.reduce((a, b) => a + b, 0);

        const idealsFor = (prizes, weights, pool) => {
            const total = weights.reduce((a, b) => a + b, 0);
            return prizes.map((_, i) => (total > 0 ? (pool * weights[i]) / total : 0));
        };
        const topIdeal = idealsFor(topPrizes, CONFIG.topTen.weights.slice(0, places),
            topPrizes.reduce((a, b) => a + b, 0));
        const outIdeal = idealsFor(perSeat, tierWeights,
            perSeat.reduce((a, b) => a + b, 0));
        const specIdeal = idealsFor(specialPrizes, specialEntries.map(e => e.weight),
            specialPrizes.reduce((a, b) => a + b, 0));

        let payout = sumOf();
        for (let guard = 0; guard < 5000 && payout < targetPayout; guard++) {
            const paidTopNow = topPrizes.filter(v => v > 0);
            const outsideCeiling = paidTopNow.length ? Math.min(...paidTopNow) : Infinity;
            const candidates = [];

            topPrizes.forEach((v, i) => {
                if (v <= 0) return;
                const cap = CONFIG.topTen.caps ? CONFIG.topTen.caps[i] : Infinity;
                const above = i > 0 ? topPrizes[i - 1] : Infinity;
                if (v + INCREMENT > cap || v + INCREMENT > above) return;
                candidates.push({ cost: INCREMENT, deficit: topIdeal[i] - v,
                    apply: () => { topPrizes[i] += INCREMENT; } });
            });
            perSeat.forEach((v, i) => {
                if (v <= 0) return;
                const above = i > 0 ? perSeat[i - 1] : Infinity;
                if (v + INCREMENT > outsideCeiling || v + INCREMENT > above) return;
                candidates.push({ cost: INCREMENT * seats, deficit: outIdeal[i] - v,
                    apply: () => { perSeat[i] += INCREMENT; } });
            });
            specialPrizes.forEach((v, i) => {
                if (v <= 0) return;
                const above = i > 0 ? specialPrizes[i - 1] : Infinity;
                if (v + INCREMENT > above) return;
                candidates.push({ cost: INCREMENT, deficit: specIdeal[i] - v,
                    apply: () => { specialPrizes[i] += INCREMENT; } });
            });

            const affordable = candidates.filter(c => payout + c.cost <= maxPayout);
            if (!affordable.length) break;
            affordable.sort((a, b) => b.deficit - a.deficit);
            affordable[0].apply();
            payout += affordable[0].cost;
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

    const specialRows = specialEntries
        .map((e, i) => ({ label: e.label, amount: specialPrizes[i] || 0, seats: 1 }))
        .filter(r => r.amount > 0);

    const allRows = [...topRows, ...outsideRows, ...specialRows];
    const hunterPayout = allRows.reduce((sum, r) => sum + r.amount * r.seats, 0);
    const grossMargin = revenue - hunterPayout;

    return {
        entries, entryFee, model, revenue, hunterPayout, grossMargin,
        marginPercent: revenue > 0 ? Math.round((grossMargin / revenue) * 100) : 0,
        topRows, outsideRows, specialRows, unallocated,
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
    renderRows(outsideBody, board.outsideRows,
        `Unlocks at ${CONFIG.outsideTopTen.minModel} entries`);
    renderRows(specialBody, board.specialRows,
        `Unlocks at ${CONFIG.specialHarvest.minModel} entries`);

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
