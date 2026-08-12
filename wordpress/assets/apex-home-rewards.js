/**
 * APEX home page Rewards Calculator - view layer.
 *
 * The design on page 52 is kept exactly: two columns of bars, the first five
 * rows of each running a red ramp and the rest grey, values coloured to match,
 * and the right column mirrored so the pair reads as a pyramid.
 *
 * What changes is where the numbers come from. They used to be hardcoded per
 * band in apex-competitions-controller/assets/submit-score.js, computed with
 * the OLD formula at a $100 entry fee while the contest charges $225 - the page
 * showed $15,000 for 1st against the $25,000 the current rules pay.
 *
 * Layout: the board's 51 places are split 25 on the left and 26 on the right,
 * rather than "top ten" and "11th-70th in bands of five".
 *
 * Attachment: the band dropdown (ul.show-click-btm li) is bound DIRECTLY by the
 * plugin rather than delegated, so its click handler is removed from those list
 * items alone. The same file also runs the score-submission popup, the step
 * carousel and the measurement calculator, all of which are on this page and
 * are left completely untouched. Dequeuing it was considered and rejected.
 */
(function () {
	'use strict';

	var ENTRY_FEE = 225;
	var LEFT_COUNT = 25;

	/* Exact ramp read off the live page, so the look is unchanged. */
	var RED = ['rgb(130,0,4)', 'rgb(162,0,5)', 'rgb(198,28,33)', 'rgb(223,19,28)', 'rgb(239,55,60)'];
	var GREY = 'rgb(202,202,202)';

	function colourFor(index) {
		return index < RED.length ? RED[index] : GREY;
	}

	function money(n) {
		return '$' + Math.round(n).toLocaleString('en-US');
	}

	/**
	 * Find the element that directly holds a column's rows.
	 *
	 * Derived from the rows themselves rather than by .elementor-column: an
	 * outer nested column contains BOTH lists, and clearing that wiped the top
	 * ten. Marked on first pass so it can be found again after its original
	 * rows have been replaced.
	 */
	function hostsFor(valueClass, flag) {
		[].slice.call(document.querySelectorAll('.' + valueClass)).forEach(function (v) {
			var con = v.closest ? v.closest('.progress-con') : null;
			var parent = con && con.parentElement;
			if (!parent || parent.hasAttribute(flag)) return;
			parent.setAttribute(flag, '1');
			/* Keep one pristine row as this column's markup template. */
			parent.__apexRow = con.cloneNode(true);
		});
		return [].slice.call(document.querySelectorAll('[' + flag + ']'));
	}

	function fillColumn(host, rows) {
		var template = host.__apexRow;
		if (!template) return;

		[].slice.call(host.querySelectorAll('.progress-con')).forEach(function (el) {
			el.parentNode.removeChild(el);
		});
		if (!rows.length) {
			host.style.display = 'none';
			return;
		}
		host.style.display = '';

		/* Bars scale against the biggest prize in their own column, as now. */
		var max = rows.reduce(function (m, r) { return Math.max(m, r.amount); }, 0);

		rows.forEach(function (row, i) {
			var node = template.cloneNode(true);
			var colour = colourFor(i);

			var label = node.querySelector('span');
			if (label) label.textContent = row.label;

			var bar = node.querySelector('.progress_bar');
			if (bar) {
				/* The animate class pins width to 0, and the per-row width rules
				   only exist for the original dozen, so set it directly. */
				bar.classList.remove('progress_bar_animate');
				bar.style.width = Math.max(6, Math.round(row.amount / max * 100)) + '%';
				bar.style.background = colour;
			}

			var value = node.querySelector('[class*="progress-content"]');
			if (value) {
				value.textContent = money(row.amount);
				value.style.color = colour;
			}

			host.appendChild(node);
		});
	}

	function render(entries) {
		if (!window.ApexPayouts || !window.ApexPayouts.buildBoard) return;

		var b = window.ApexPayouts.buildBoard(entries, ENTRY_FEE);
		var places = b.topRows.concat(b.outsideRows);

		hostsFor('progress-content', 'data-apex-left')
			.forEach(function (h) { fillColumn(h, places.slice(0, LEFT_COUNT)); });
		hostsFor('progress-content-2', 'data-apex-right')
			.forEach(function (h) { fillColumn(h, places.slice(LEFT_COUNT)); });

		/* Special Harvest keeps its own rows; write by key and hide what this
		   field size does not pay rather than showing $0. */
		var special = {};
		b.specialRows.forEach(function (r) { special[r.label] = r.amount; });
		[].slice.call(document.querySelectorAll(
			'[class*="progress-content-3"], [class*="progress-content-4"], [class*="progress-content-5"]'
		)).forEach(function (el) {
			var key = String(el.className).split(/\s+/).filter(function (c) {
				return c.indexOf('progress-content') !== 0;
			})[0];
			var con = el.closest ? el.closest('.progress-con') : null;
			if (key && special[key] > 0) {
				el.textContent = money(special[key]);
				if (con) con.style.display = '';
			} else if (con) {
				con.style.display = 'none';
			}
		});
	}

	function selectedBand() {
		var shown = document.querySelector('ul.new-dropdown-payout span');
		var n = shown ? parseInt(String(shown.textContent).replace(/[^\d]/g, ''), 10) : NaN;
		return isNaN(n) ? 2500 : n;
	}

	function attach() {
		var options = document.querySelectorAll('ul.show-click-btm li');
		if (!options.length || !window.ApexPayouts) return false;

		if (window.jQuery) window.jQuery(options).off('click');

		[].slice.call(options).forEach(function (li) {
			if (li.dataset.apexBound === '1') return;
			li.dataset.apexBound = '1';
			li.addEventListener('click', function () {
				var shown = document.querySelector('ul.new-dropdown-payout span');
				var value = li.textContent.trim();
				if (shown) shown.textContent = value;
				if (li.parentNode) li.parentNode.classList.remove('show-drop');
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
})();
