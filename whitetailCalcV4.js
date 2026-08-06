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
function stepFor(rules, model) {
    const rule = rules.find(r => model >= r.minModel);
    return rule ? rule.step : 1;
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

// Tidy prize amounts, largest first. Prizes round down to one of these.
const STEP_LADDER = [250, 100, 50, 25, 10, 5, 1];

// Always allow at least a $5 step once a board has a meaningful pool. Stranding
// up to $5 is worth it to avoid prizes like "$66, $65, $48, $48". Below the
// threshold $5 would be a real slice of the pool, so fall back to exact.
const MIN_TIDY_STEP = 5;
const TIDY_STEP_MIN_POOL = 250;

// Whatever cannot be divided evenly stays with the house, so the step also caps
// how far the margin can drift off target. Keep that under 1% of each pool.
const MAX_ROUNDING_LOSS = 0.01;

// Pick the largest tidy step that (a) leaves the *smallest* prize worth at least
// one step and (b) cannot strand more than MAX_ROUNDING_LOSS of the pool.
// Without (a) a small field rounds every prize to zero - a single $100 entry
// yields a $65 purse, and rounding to the nearest $50 pays 1st $50 and the rest
// nothing. Without (b) a $250 step on a modest pool quietly pushed the margin
// from 35% up to 44%.
function chooseStep(maxStep, pool, weights) {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight <= 0 || pool <= 0) return 1;
    const smallestShare = (pool * Math.min(...weights)) / totalWeight;
    const tidyFloor = pool >= TIDY_STEP_MIN_POOL ? MIN_TIDY_STEP : 0;
    const lossCeiling = Math.max(pool * MAX_ROUNDING_LOSS, tidyFloor);
    for (const step of STEP_LADDER) {
        if (step <= maxStep && smallestShare >= step && step <= lossCeiling) return step;
    }
    return 1;
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

    // Renormalise the split over whichever boards actually have prizes, so an
    // unlocked-later board never quietly costs the hunters money.
    const active = {
        topTen: true,
        outsideTopTen: tiers > 0,
        specialHarvest: specialOn,
    };
    const activeTotal = Object.keys(active)
        .filter(k => active[k])
        .reduce((sum, k) => sum + CONFIG.purseSplit[k], 0);
    const shareOf = key => (active[key] ? CONFIG.purseSplit[key] / activeTotal : 0);

    // Top ten
    const topWeights = CONFIG.topTen.weights.slice(0, places);
    const topPrizes = distribute(purse * shareOf('topTen'), topWeights,
        stepFor(CONFIG.topTen.rounding, model));
    const topRows = topPrizes.map((amount, i) => ({ label: ordinal(i + 1), amount, seats: 1 }));

    // Outside the top ten
    const outsideRows = [];
    if (tiers > 0) {
        const { placesPerTier, decayPerTier, minWeightFraction } = CONFIG.outsideTopTen;
        const weights = [];
        for (let i = 0; i < tiers; i++) {
            weights.push(Math.max(1 - i * decayPerTier, minWeightFraction));
        }
        // Every bracket pays `placesPerTier` hunters the same amount, so share
        // out a per-seat pool and let each bracket cost placesPerTier x that.
        const perSeatPool = (purse * shareOf('outsideTopTen')) / placesPerTier;
        const perSeat = distribute(perSeatPool, weights,
            stepFor(CONFIG.outsideTopTen.rounding, model));

        let start = CONFIG.topTen.maxPlaces + 1;
        for (let i = 0; i < tiers; i++) {
            outsideRows.push({
                label: ordinalRange(start, placesPerTier),
                amount: perSeat[i],
                seats: placesPerTier,
            });
            start += placesPerTier;
        }
    }

    // Special harvest
    const specialRows = [];
    if (specialOn) {
        const entriesList = []
            .concat(drawingsOn ? CONFIG.specialHarvest.drawings : [])
            .concat(milestones);
        const prizes = distribute(purse * shareOf('specialHarvest'),
            entriesList.map(e => e.weight),
            stepFor(CONFIG.specialHarvest.rounding, model));
        entriesList.forEach((e, i) => {
            specialRows.push({ label: e.label, amount: prizes[i], seats: 1 });
        });
    }

    const allRows = [...topRows, ...outsideRows, ...specialRows];
    const hunterPayout = allRows.reduce((sum, r) => sum + r.amount * r.seats, 0);
    const grossMargin = revenue - hunterPayout;

    return {
        entries, entryFee, model, revenue, hunterPayout, grossMargin,
        marginPercent: revenue > 0 ? Math.round((grossMargin / revenue) * 100) : 0,
        topRows, outsideRows, specialRows,
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

let hEntries = 2500;
let entryFee = 100;

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
