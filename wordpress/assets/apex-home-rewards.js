/**
 * APEX home page Rewards Calculator - view layer.
 *
 * The home page already has a design for this section and it is being kept.
 * This file only supplies the numbers, taking them from the same engine that
 * powers the standalone calculator so the two can never disagree again.
 *
 * Before this, the figures came from hardcoded branches in
 * apex-competitions-controller/assets/submit-score.js and were the OLD payout
 * formula at a $100 entry fee, while the contest charges $225 - 1st place read
 * $15,000 against the $25,000 the current rules pay.
 *
 * How it attaches:
 *   - The band dropdown (ul.show-click-btm li) is bound DIRECTLY by the plugin,
 *     not delegated, so its click handler can be removed from those list items
 *     alone. Everything else in that plugin file - the score-submission popup,
 *     the step carousel, the measurement calculator - is bound to different
 *     elements and is left completely alone. Dequeuing the file was considered
 *     and rejected for exactly that reason.
 *
 * Markup contract (unchanged, three responsive copies of the section exist and
 * all are updated):
 *   .progress-content     1st .. 10th
 *   .progress-content-2   the places outside the top ten
 *   .progress-content-3   10PT, 9PT, 8PT, 7PT
 *   .progress-content-4   100th, 200th, 300th, 400th
 *   .progress-content-5   500th, 750th, 1000th, 1250th
 */
(function () {
	'use strict';

	var ENTRY_FEE = 225;
	var SPLIT_CLASS = 'apex-outside-split';

	function money(n) {
		return '$' + Math.round(n).toLocaleString('en-US');
	}

	function keyOf(el) {
		var classes = String(el.className).split(/\s+/).filter(Boolean);
		return classes.filter(function (c) {
			return c.indexOf('progress-content') !== 0;
		})[0] || null;
	}

	/** Every prize the board pays, keyed the way the markup names it. */
	function amountsByKey(board) {
		var map = {};
		board.topRows.forEach(function (r) { map[r.label] = r.amount; });
		board.specialRows.forEach(function (r) { map[r.label] = r.amount; });
		return map;
	}

	/**
	 * Rebuild one column of outside places as two side-by-side lists.
	 * An existing row is cloned so the markup - and therefore the styling and
	 * the progress-bar animation - is exactly what the page already uses.
	 */
	function renderOutside(column, rows) {
		var template = column.querySelector('.progress-con');
		if (!template) return;

		var blank = template.cloneNode(true);
		var host = column.querySelector('.' + SPLIT_CLASS);
		if (!host) {
			host = document.createElement('div');
			host.className = SPLIT_CLASS;
			host.style.display = 'flex';
			host.style.flexWrap = 'wrap';
			host.style.gap = '0 2em';
			template.parentNode.insertBefore(host, template);
		}
		host.innerHTML = '';

		// No places outside the top ten at this field size - leave nothing behind.
		[].slice.call(column.querySelectorAll('.progress-con')).forEach(function (el) {
			if (!host.contains(el)) el.parentNode.removeChild(el);
		});
		if (!rows.length) {
			host.style.display = 'none';
			return;
		}
		host.style.display = 'flex';

		// 51 places read as 25 and 26; a shorter list still splits evenly.
		var left = Math.floor(rows.length / 2);
		var columns = [rows.slice(0, left), rows.slice(left)];

		columns.forEach(function (set) {
			if (!set.length) return;
			var col = document.createElement('div');
			col.style.flex = '1 1 45%';
			col.style.minWidth = '0';
			set.forEach(function (row) {
				var node = blank.cloneNode(true);
				var label = node.querySelector('span');
				var value = node.querySelector('[class*="progress-content"]');
				if (label) label.textContent = row.label;
				if (value) {
					value.className = row.label.replace(/\s+/g, '') + ' progress-content-2';
					value.textContent = money(row.amount);
				}
				col.appendChild(node);
			});
			host.appendChild(col);
		});
	}

	function render(entries) {
		if (!window.ApexPayouts || !window.ApexPayouts.buildBoard) return;

		var board = window.ApexPayouts.buildBoard(entries, ENTRY_FEE);
		var amounts = amountsByKey(board);

		// Top ten and special harvest: write by key, across every copy of the
		// section. A place the board does not pay at this field size is hidden
		// rather than shown as $0.
		[].slice.call(document.querySelectorAll('[class*="progress-content"]'))
			.forEach(function (el) {
				var classes = String(el.className).split(/\s+/);
				if (classes.indexOf('progress-content-2') !== -1) return;

				var key = keyOf(el);
				if (!key) return;

				var row = el.closest ? el.closest('.progress-con') : null;
				if (amounts[key] != null && amounts[key] > 0) {
					el.textContent = money(amounts[key]);
					if (row) row.style.display = '';
				} else if (row) {
					row.style.display = 'none';
				}
			});

		// Outside the top ten, one row per place, in two columns.
		[].slice.call(document.querySelectorAll('.elementor-column'))
			.filter(function (col) {
				return col.querySelector('.progress-content-2') || col.querySelector('.' + SPLIT_CLASS);
			})
			.forEach(function (col) { renderOutside(col, board.outsideRows); });
	}

	function selectedBand() {
		var shown = document.querySelector('ul.new-dropdown-payout span');
		var n = shown ? parseInt(String(shown.textContent).replace(/[^\d]/g, ''), 10) : NaN;
		return isNaN(n) ? 2500 : n;
	}

	function attach() {
		var options = document.querySelectorAll('ul.show-click-btm li');
		if (!options.length) return false;

		// Take the plugin's handler off these list items only. Its other
		// features are bound elsewhere and keep working.
		if (window.jQuery) window.jQuery(options).off('click');

		[].slice.call(options).forEach(function (li) {
			if (li.dataset.apexBound === '1') return;
			li.dataset.apexBound = '1';
			li.addEventListener('click', function () {
				var shown = document.querySelector('ul.new-dropdown-payout span');
				var value = li.textContent.trim();
				if (shown) shown.textContent = value;
				var list = li.parentNode;
				if (list) list.classList.remove('show-drop');
				render(parseInt(value.replace(/[^\d]/g, ''), 10));
			});
		});

		render(selectedBand());
		return true;
	}

	function boot() {
		if (attach()) return;
		// The section is Elementor-rendered; give it a few frames to appear.
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
	// The plugin also writes these values on load; run after it either way.
	// The plugin binds inside its own ready handler and also writes these values
	// on load, so run again afterwards: attach() strips its click handler a
	// second time (harmless if already gone) and re-renders over its output.
	window.addEventListener('load', function () {
		setTimeout(function () { attach(); render(selectedBand()); }, 400);
	});
})();
