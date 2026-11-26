/*
 * Showdown · preparar Showdown (Thor y móvil)
 *
 * 1) La primera vez deja puestos los ajustes que necesita cada estilo. Si
 *    luego los cambias a mano en Showdown, se respeta lo tuyo (esto solo se
 *    hace una vez en cada aparato):
 *    - Thor: tema oscuro y "Side-by-side, overlay controls".
 *    - Móvil: tema oscuro y sprites 2D (los de Blanco/Negro).
 * 2) El estilo y el script son para el cliente NUEVO de Showdown. Showdown
 *    elige cliente con la cookie "preactalpha" (la app ya la pone). Si aun así
 *    sale el cliente viejo, se pasa al nuevo (una sola vez por sesión).
 */
(function () {
	'use strict';
	if (window.top !== window) return;
	if (location.hostname !== 'play.pokemonshowdown.com') return;

	var app = window.__showdownApp || {};
	var movil = app.modo === 'movil';

	try {
		var clave = movil ? 'movil_preparado' : 'thor_preparado';
		if (!localStorage.getItem(clave)) {
			var prefs = {};
			try { prefs = JSON.parse(localStorage.getItem('showdown_prefs') || '{}') || {}; } catch (e) { prefs = {}; }
			if (!('theme' in prefs)) prefs.theme = 'dark';
			if (movil) {
				if (!('bwgfx' in prefs)) prefs.bwgfx = true;
			} else {
				if (!('battlelayout' in prefs)) prefs.battlelayout = 'side-by-side-overlay';
			}
			localStorage.setItem('showdown_prefs', JSON.stringify(prefs));
			localStorage.setItem(clave, '1');
		}
	} catch (e) { /* sin almacenamiento: nada */ }

	function comprobarCliente() {
		var nuevo = typeof PS !== 'undefined';
		var viejo = !nuevo && typeof window.app !== 'undefined';
		if (!viejo) return;
		try {
			if (sessionStorage.getItem('thor_a_nuevo')) return;
			sessionStorage.setItem('thor_a_nuevo', '1');
		} catch (e) { return; }
		document.cookie = 'preactalpha=1; max-age=31536000; path=/; secure';
		location.replace('/newclient');
	}
	if (document.readyState === 'complete') setTimeout(comprobarCliente, 2500);
	else window.addEventListener('load', function () { setTimeout(comprobarCliente, 2500); });
})();
