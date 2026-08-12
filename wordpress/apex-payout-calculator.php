<?php
/**
 * APEX payout calculator assets.
 *
 * Loaded from functions.php. Kept in its own file so the calculator can be
 * removed or updated without touching anything else in the child theme.
 *
 * @package Astra Child
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Put the payout engine and the home page view layer on the front page.
 *
 * The standalone page template enqueues what it needs itself; this covers the
 * REWARDS CALCULATOR section on the home page, whose figures used to come from
 * hardcoded values in the apex-competitions-controller plugin.
 *
 * jQuery is a dependency because the view layer removes the plugin's click
 * handler from the band dropdown - and only from those list items, so the
 * score-submission popup and step carousel in that same plugin file keep
 * working.
 */
function apex_payout_calculator_enqueue() {
	if ( ! is_front_page() && ! is_home() ) {
		return;
	}

	$dir = get_stylesheet_directory_uri() . '/assets/';
	$ver = '1.0.5';

	/* Restores the bar's height, which the view layer takes away when it drops
	   the plugin's progress_bar_animate class to set its own tapered width. */
	wp_enqueue_style(
		'apex-home-rewards',
		$dir . 'apex-home-rewards.css',
		array(),
		$ver
	);

	wp_enqueue_script(
		'apex-payout-engine',
		$dir . 'apex-payout-calculator.js',
		array(),
		$ver,
		true
	);

	wp_enqueue_script(
		'apex-home-rewards',
		$dir . 'apex-home-rewards.js',
		array( 'apex-payout-engine', 'jquery' ),
		$ver,
		true
	);
}
add_action( 'wp_enqueue_scripts', 'apex_payout_calculator_enqueue', 100 );
