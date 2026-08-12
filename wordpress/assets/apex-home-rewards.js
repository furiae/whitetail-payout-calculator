/**
 * APEX home page Rewards Calculator (page 52) - view layer.
 *
 * The numbers used to be hardcoded per band inside
 * apex-competitions-controller/assets/js/submit-score.js, computed with the OLD
 * formula at a $100 entry fee while the contest charges $225 - the page showed
 * $22,500 for 1st against the $25,000 the current rules pay. This drives the
 * same markup from window.ApexPayouts.buildBoard instead.
 *
 * The approved design:
 *   - two columns, 1st-25th left and 26th onwards right, not "top ten" vs
 *     "11th-70th in bands of five";
 *   - the right column mirrored, value on the left and bar filling from the
 *     right (the page's own CSS already lays it out that way);
 *   - the first five rows of EACH column on the red ramp, the rest grey, with
 *     the value text matching its bar;
 *   - bar width is decorative, not a chart of the money: it tapers evenly by
 *     rank from 100% on the top row to 33% on the last, per column, so the
 *     shortest bar does not crowd its value;
 *   - Special Harvest keeps full-width bars in three groups of four.
 *
 * How it touches the page - read this before changing the selectors.
 *
 * Every row is its own Elementor HTML widget: .elementor-widget-html >
 * .elementor-widget-container > .progress-con. A column is therefore the
 * .elementor-widget-wrap holding a run of those widgets, and it is found as the
 * lowest common ancestor of the rows carrying that column's value class. It is
 * NOT found by .elementor-column: an outer nested column holds both lists, and
 * clearing that is what wiped the top ten on the live page once already.
 *
 * Nothing is ever cleared. Existing row widgets are repainted in place, extra
 * ones are cloned from the last row when a band pays more places than the page
 * was built with, and leftovers are hidden. If a container ever comes back
 * holding both columns' rows, the render bails out rather than touch it.
 *
 * Three copies of the section exist and all are handled: f3d97df (paid,
 * .free-challenge-hidden), fe96e71 (.free-challenge-ui, no band dropdown) and
 * 48fb42b2 (hidden at every breakpoint). Which one shows depends on the user's
 * challenge state, not on screen width.
 *
 * The band dropdown is bound DIRECTLY by the plugin rather than delegated, so
 * its click handler is removed from those list items alone. The same file also
 * runs the score-submission popup, the step carousel, the measurement
 * calculator and the video widget, all of which are on this page and are left
 * untouched. Dequeuing it was considered and rejected.
 *
 * Two things outside the rows are written, and nothing else is:
 *   - the column headings, which Chris asked to follow the band, because the
 *     places a column holds change with it - 1st-25th and 26th-51st at a
 *     sellout, 1st-8th and 9th-15th at 250 hunters;
 *   - .apex_payout_number, "Rewards based on N Hunters", because the plugin's
 *     dropdown handler kept that in step and that handler is now gone.
 * Every other heading, caption and widget is left exactly as it is.
 */
(function () {
	'use strict';

	var ENTRY_FEE = 225;

	/* Where the left column stops. The approved mockup is 1st-25th | 26th-51st,
	   which is a 2,500 sellout paying 51 places.

	   Smaller bands pay fewer: 25 places at 500 hunters, 15 at 250, 7 at 50.
	   Capping the left column at 25 would give those bands nothing to put on
	   the right, leaving a lone half-width column beside a gap for six of the
	   ten bands. Chris chose to halve the places below the cap instead, so the
	   section stays two columns at every band - 1st-8th | 9th-15th at 250
	   hunters, 1st-4th | 5th-7th at 50. At a sellout it is still exactly
	   25 | 26.

	   Set BALANCE_SMALL_BANDS to false to fill the left column to 25 first. */
	var LEFT_COUNT = 25;
	var BALANCE_SMALL_BANDS = true;

	function splitAt(total) {
		if (!BALANCE_SMALL_BANDS) return LEFT_COUNT;
		return Math.min(LEFT_COUNT, Math.ceil(total / 2));
	}

	/* The decorative taper, in per cent of the bar track. */
	var BAR_TOP = 100;
	var BAR_BOTTOM = 33;

	/* Exact ramp read off the live page, so the look is unchanged. */
	var RED = ['rgb(130,0,4)', 'rgb(162,0,5)', 'rgb(198,28,33)', 'rgb(223,19,28)', 'rgb(239,55,60)'];
	var GREY = 'rgb(202,202,202)';

	/**
	 * Column headings, which follow the band.
	 *
	 * The page carries two heading widgets per column and they are worded
	 * differently on purpose: the large one says "Top Ten ScoreS" / "Scores 11th
	 * - 70th", the `.text-small` one just "TOP TEN" / "11th - 70th". Each keeps
	 * its own style - whichever template it started closer to is the one it gets
	 * from then on. {a} and {b} are the first and last place in the column.
	 *
	 * Reword these two lines to change the headings; nothing else reads them.
	 */
	var HEADING_LONG = 'Scores {a} - {b}';
	var HEADING_SHORT = '{a} - {b}';

	/**
	 * Special Harvest: three groups of four, each its own flat colour.
	 *
	 * `key` is the engine's row label, which is also the page's key class.
	 * `text` is what the row reads on screen. The slots are listed in the order
	 * the page lays them out.
	 *
	 * The wording is written from here rather than left to the page because the
	 * page's own was inconsistent - the paid copy read "100th Place" and "200th
	 * Place" but then just "300th" and "400th", and "1,000 Place" for 1,000th,
	 * while the free copy had "9-Point Harvest Place" sitting in a milestone
	 * slot. Chris asked for the missing "Place"; doing it here fixes all three
	 * copies at once and keeps them from drifting apart again.
	 *
	 * The catch, and it is worth knowing: this now OVERRIDES whatever the
	 * heading text says in Elementor. To reword a Special Harvest row, change it
	 * here - editing it on the page will not survive the next render.
	 */
	var SPECIAL_GROUPS = [
		{
			valueClass: 'progress-content-3',
			colour: 'rgb(161,0,4)',
			slots: [
				{ key: '10PT', text: '10-Point Harvest' },
				{ key: '9PT', text: '9-Point Harvest' },
				{ key: '8PT', text: '8-Point Harvest' },
				{ key: '7PT', text: '7-Point Harvest' }
			]
		},
		{
			valueClass: 'progress-content-4',
			colour: 'rgb(223,19,28)',
			slots: [
				{ key: '100th', text: '100th Place' },
				{ key: '200th', text: '200th Place' },
				{ key: '300th', text: '300th Place' },
				{ key: '400th', text: '400th Place' }
			]
		},
		{
			valueClass: 'progress-content-5',
			colour: 'rgb(241,72,72)',
			slots: [
				{ key: '500th', text: '500th Place' },
				{ key: '750th', text: '750th Place' },
				{ key: '1000th', text: '1,000th Place' },
				{ key: '1250th', text: '1,250th Place' }
			]
		}
	];

	function money(n) {
		return '$' + Math.round(n).toLocaleString('en-US');
	}

	function colourFor(index) {
		return index < RED.length ? RED[index] : GREY;
	}

	/** Even taper by rank, independent of the amounts. */
	function barWidth(index, count) {
		if (count <= 1) return BAR_TOP;
		return BAR_TOP - index * (BAR_TOP - BAR_BOTTOM) / (count - 1);
	}

	function list(nodes) {
		return [].slice.call(nodes);
	}

	/** The .progress-con rows in `root` whose value element carries `valueClass`. */
	function rowsWith(root, valueClass) {
		return list(root.querySelectorAll('.progress-con')).filter(function (con) {
			return !!con.querySelector('.' + valueClass);
		});
	}

	/** Lowest common ancestor, which for a column is its .elementor-widget-wrap. */
	function commonAncestor(nodes) {
		var anc = nodes[0].parentElement;
		while (anc && !nodes.every(function (n) { return anc.contains(n); })) anc = anc.parentElement;
		return anc;
	}

	/**
	 * The heading widgets belonging to a column. They sit in the same inner
	 * .elementor-column as its rows, above them, so walking up from the row
	 * container finds them and nothing else's.
	 */
	function headingsFor(host) {
		var col = host;
		while (col && !(col.classList && col.classList.contains('elementor-column'))) {
			col = col.parentElement;
		}
		return col ? list(col.querySelectorAll('.elementor-heading-title small')) : [];
	}

	function setHeadings(host, rows) {
		if (!rows.length) return;
		headingsFor(host).forEach(function (el) {
			/* Decided once, off the wording the page shipped with, so it
			   survives every later render. */
			if (!el.getAttribute('data-apex-heading')) {
				el.setAttribute('data-apex-heading', /scores/i.test(el.textContent) ? 'long' : 'short');
			}
			var template = el.getAttribute('data-apex-heading') === 'long' ? HEADING_LONG : HEADING_SHORT;
			el.textContent = template
				.replace('{a}', rows[0].label)
				.replace('{b}', rows[rows.length - 1].label);
		});
	}

	/**
	 * The direct child of `host` that contains `node` - the row's Elementor
	 * widget, which is what gets shown, hidden or cloned.
	 */
	function widgetFor(host, node) {
		var n = node;
		while (n && n.parentElement !== host) n = n.parentElement;
		return n;
	}

	/**
	 * Resolve a column to { host, widgets }, or null if it cannot be done
	 * safely. Cached on the host so it survives repainting.
	 */
	function column(section, valueClass, otherClass) {
		var rows = rowsWith(section, valueClass);
		if (!rows.length) return null;

		var host = commonAncestor(rows);
		if (!host) return null;

		/* Refuse to touch a container that also holds the other column. */
		if (rowsWith(host, otherClass).length) return null;

		if (!host.__apexColumn) {
			host.__apexColumn = {
				host: host,
				widgets: rows.map(function (r) { return widgetFor(host, r); }).filter(Boolean)
			};
		}
		return host.__apexColumn;
	}

	/**
	 * Repaint one row. `colour` and `width` are supplied because the two
	 * columns and the three Special Harvest groups compute them differently.
	 *
	 * `row.label` is the wording the row reads on screen: the place for the two
	 * columns, and the text from SPECIAL_GROUPS for Special Harvest. Passing
	 * null leaves whatever the page says in place; nothing does that any more.
	 */
	function paint(con, row, colour, width) {
		if (!con) return;

		con.classList.remove('dim_down_bar');

		var wrapper = con.firstElementChild;
		var label = wrapper && wrapper.querySelector('span');
		if (label) {
			if (row.label !== null) label.textContent = row.label;
			/* The stylesheet hides these until submit-score.js shows them. */
			label.style.display = 'block';
		}

		var bar = con.querySelector('.progress_bar');
		if (bar) {
			/* Each original row has its own .progress-value-N-a rule pinning
			   width to 0 and animating to a fixed per cent. Dropping the
			   animate class disables that rule, so the inline width applies. */
			bar.classList.remove('progress_bar_animate');
			bar.classList.add('apex-bar');
			bar.style.background = colour;
			bar.style.width = width.toFixed(1) + '%';
		}

		var value = con.querySelector('[class*="progress-content"]');
		if (value) {
			/* apex_payout_calculator() runs a 3s jQuery count-up on these; stop
			   it before writing or it keeps overwriting the new figure. */
			if (window.jQuery) window.jQuery(value).stop(true, false);
			value.textContent = money(row.amount);
			value.style.color = colour;
			value.style.display = 'block';
		}
	}

	/**
	 * Fill a column with `rows`. Rows are repainted in place; the widget list
	 * is grown by cloning the last row when a band pays more places than the
	 * page was built with, and shrunk by hiding the surplus.
	 */
	function fillColumn(col, rows) {
		if (!col) return;
		var widgets = col.widgets;

		/* Clones go directly after the last row, NOT at the end of the widget
		   wrap: the wrap also holds the "Winning Gross Scores are Validated"
		   and "Rewards based on N Hunters" notes, which sit below the rows and
		   would otherwise end up in the middle of the column. */
		while (widgets.length && widgets.length < rows.length) {
			var last = widgets[widgets.length - 1];
			var clone = last.cloneNode(true);
			clone.removeAttribute('data-id');
			col.host.insertBefore(clone, last.nextSibling);
			widgets.push(clone);
		}

		widgets.forEach(function (widget, i) {
			if (i >= rows.length) {
				widget.style.display = 'none';
				return;
			}
			widget.style.display = '';
			paint(widget.querySelector('.progress-con'), rows[i], colourFor(i), barWidth(i, rows.length));
		});

		setHeadings(col.host, rows);
	}

	/**
	 * Bring one Special Harvest group to exactly `want` boxes and return them.
	 *
	 * The box is the row's Elementor widget, so growing clones the widget and
	 * shrinking hides it - the same trick fillColumn uses, and equally safe:
	 * nothing is removed. A group is only ever short or long in the free copy,
	 * whose markup was built wrong; the paid one already has four everywhere.
	 */
	function fitGroup(rows, want) {
		var widgetOf = function (con) { return con.parentElement && con.parentElement.parentElement; };

		while (rows.length && rows.length < want) {
			var last = widgetOf(rows[rows.length - 1]);
			if (!last) break;
			var clone = last.cloneNode(true);
			clone.removeAttribute('data-id');
			last.parentNode.insertBefore(clone, last.nextSibling);
			rows.push(clone.querySelector('.progress-con'));
		}

		rows.forEach(function (con, i) {
			var widget = widgetOf(con);
			var show = i < want;
			if (widget) widget.style.display = show ? '' : 'none';
			con.style.display = show ? '' : 'none';
		});

		return rows.slice(0, want);
	}

	/**
	 * Special Harvest. Twelve boxes, four to a group, in every copy of the
	 * section; only the figures change with the band.
	 */
	function fillSpecial(section, specialRows) {
		var byLabel = {};
		specialRows.forEach(function (r) { byLabel[r.label] = r; });

		SPECIAL_GROUPS.forEach(function (group) {
			var rows = rowsWith(section, group.valueClass);
			if (!rows.length) return;

			/* Every group is four boxes in every copy. The paid section already
			   is; the free one (fe96e71) is not - its markup has two point-class
			   boxes and six for the four 100th-400th milestones. Short groups
			   are grown by cloning the last box, surplus ones are hidden, so all
			   three copies read the same. */
			rows = fitGroup(rows, group.slots.length);

			/* All twelve boxes always show and only the figures change - Chris's
			   call, and how the page behaved before any of this. A field size
			   that does not fund a milestone shows $0 on a dimmed bar, which is
			   what dim_down_bar is for and what the plugin used to do.

			   Slot i takes the prize named by slot i, so a figure always sits
			   beside the prize it belongs to. A copy with more slots than there
			   are prizes - fe96e71 has six for the four 100th-400th milestones
			   - leaves the surplus blank at $0. */
			rows.forEach(function (con, i) {
				var slot = group.slots[i];
				var prize = byLabel[slot.key];
				var amount = prize ? prize.amount : 0;

				paint(con, { label: slot.text, amount: amount }, group.colour, 100);
				if (!amount) con.classList.add('dim_down_bar');
			});
		});
	}

	function render(entries) {
		if (!window.ApexPayouts || !window.ApexPayouts.buildBoard) return;

		var board = window.ApexPayouts.buildBoard(entries, ENTRY_FEE);
		var places = board.topRows.concat(board.outsideRows);
		var cut = splitAt(places.length);
		var left = places.slice(0, cut);
		var right = places.slice(cut);

		list(document.querySelectorAll('.elementor-top-section.payout-calculator')).forEach(function (section) {
			fillColumn(column(section, 'progress-content', 'progress-content-2'), left);
			fillColumn(column(section, 'progress-content-2', 'progress-content'), right);
			fillSpecial(section, board.specialRows);
		});

		list(document.querySelectorAll('.apex_payout_number')).forEach(function (el) {
			el.textContent = entries.toLocaleString('en-US');
		});
	}

	function selectedBand() {
		var shown = document.querySelector('ul.new-dropdown-payout span');
		var n = shown ? parseInt(String(shown.textContent).replace(/[^\d]/g, ''), 10) : NaN;
		return isNaN(n) ? 2500 : n;
	}

	function attach() {
		if (!window.ApexPayouts) return false;
		if (!document.querySelector('.elementor-top-section.payout-calculator')) return false;

		var options = document.querySelectorAll('ul.show-click-btm li');
		if (window.jQuery && options.length) window.jQuery(options).off('click');

		list(options).forEach(function (li) {
			if (li.getAttribute('data-apex-bound') === '1') return;
			li.setAttribute('data-apex-bound', '1');
			li.addEventListener('click', function (e) {
				e.preventDefault();
				var value = li.textContent.trim();
				var shown = document.querySelector('ul.new-dropdown-payout span');
				if (shown) shown.textContent = value;
				if (li.parentNode) li.parentNode.style.display = 'none';
				render(parseInt(value.replace(/[^\d]/g, ''), 10));
			});
		});

		render(selectedBand());
		return true;
	}

	function boot() {
		if (attach()) return;
		var tries = 0;
		var timer = setInterval(function () {
			if (attach() || ++tries > 40) clearInterval(timer);
		}, 250);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}

	/* The plugin writes these values on load too, so run again afterwards. */
	window.addEventListener('load', function () {
		setTimeout(function () { attach(); render(selectedBand()); }, 400);
	});

	window.ApexHomeRewards = { render: render, buildAt: selectedBand };
})();
