<?php
/**
 * Template Name: Payout Calculator
 *
 * APEX Whitetail Challenge payout calculator.
 *
 * Styles and script live in this child theme under assets/ and are enqueued
 * below, so the markup here stays readable and the browser can cache them.
 * The CSS covers layout only - fonts, colours and headings come from Astra.
 *
 * @package Astra Child
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$apex_calc_dir = get_stylesheet_directory_uri() . '/assets/';
$apex_calc_ver = '1.0.0';

wp_enqueue_style(
	'apex-payout-calculator',
	$apex_calc_dir . 'apex-payout-calculator.css',
	array(),
	$apex_calc_ver
);

wp_enqueue_script(
	'apex-payout-calculator',
	$apex_calc_dir . 'apex-payout-calculator.js',
	array(),
	$apex_calc_ver,
	true
);

get_header();
?>

<div class="apex-payout-calculator-page">
	<?php
	while ( have_posts() ) :
		the_post();
		the_content();
	endwhile;
	?>

	<div id="apex-payout-calculator">
		<h1>APEX Whitetail Challenge<br>
		    Payout Calculator</h1>
		
		    <div class="payout-info-container">
		        <div class="payout-info">
		            <table id="apex-payout-nums">
		                <thead>
		                    <tr>
		                        <th>Hunter Entries</th>
		                        <th>Payout Model</th>
		                    </tr>
		                    <tr>
		                        <td>2,500</td>
		                        <td>2,500</td>
		                    </tr>
		                    <tr>
		                        <th>Gross Revenue</th>
		                        <th>Hunter Payout</th>
		                    </tr>
		                    <tr>
		                        <td>$562,500</td>
		                        <td>$365,650</td>
		                    </tr>
		                </thead>
		            </table>
		
		            <h3>Gross Margin</h3>
		            <h4 id="apex-gross-margin">$196,850 (35%)</h4>
		        </div>
		    </div>
		
		    <div class="controls">
		        <form id="apex-hunter-entries" action="submit">
		            <label for="apex-hunter-entries-input">HUNTER ENTRIES</label>
		            <input type="text" inputmode="numeric" placeholder="2500" id="apex-hunter-entries-input">
		            <button>Submit</button>
		        </form>
		
		        <form id="apex-entry-fee" action="submit">
		            <label for="apex-entry-fee-input">ENTRY FEE</label>
		            <input type="text" inputmode="numeric" placeholder="225" id="apex-entry-fee-input">
		            <button>Submit</button>
		        </form>
		    </div>
		
		    <p id="apex-input-error" class="input-error" role="status" aria-live="polite"></p>
		
		    <div class="row-container">
		        <div id="apex-row">
		            <div class="leaderboard">
		                <p class="leaderboard-heading">TOP TEN</p>
		                <table class="leaderboard-table" id="apex-top-ten">
		                    <thead>
		                        <tr>
		                            <th>Place</th>
		                            <th>Payout</th>
		                        </tr>
		                    </thead>
		                    <!-- Rows are rendered by whitetailCalcV4.js -->
		                    <tbody></tbody>
		                </table>
		            </div>
		
		            <div class="leaderboard">
		                <p class="leaderboard-heading">OUTSIDE TOP 10</p>
		                <table class="leaderboard-table" id="apex-outside-top-ten">
		                    <thead>
		                        <tr>
		                            <th>Place</th>
		                            <th>Payout</th>
		                        </tr>
		                    </thead>
		                    <tbody></tbody>
		                </table>
		            </div>
		
		            <div class="leaderboard">
		                <p class="leaderboard-heading">SPECIAL HARVEST</p>
		                <table class="leaderboard-table" id="apex-special-harvest">
		                    <thead>
		                        <tr>
		                            <th>Category</th>
		                            <th>Payout</th>
		                        </tr>
		                    </thead>
		                    <tbody></tbody>
		                </table>
		            </div>
		        </div>
		    </div>
	</div>
</div>

<?php
get_footer();
