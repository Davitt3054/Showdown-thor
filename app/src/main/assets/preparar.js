/*
 * Showdown Thor · preparar Showdown
 *
 * 1) La primera vez deja puestos los ajustes que necesita el estilo v2:
 *    tema oscuro y "Side-by-side, overlay controls". Si luego los cambias a
 *    mano en Showdown, se respeta lo tuyo (esto solo se hace una vez).
 * 2) El estilo y el script son para el cliente NUEVO de Showdown. Showdown
 *    elige cliente con la cookie "preactalpha" (la app ya la pone). Si aun así
 *    sale el cliente viejo, se pasa al nuevo (una sola vez por sesión).
 */
(function () {
	'use strict';
	if (window.top !== window) return;
	if (location.hostname !== 'play.pokemonshowdown.com') return;

	try {
		if (!localStorage.getItem('thor_preparado')) {
			var prefs = {};
			try { prefs = JSON.parse(localStorage.getItem('showdown_prefs') || '{}') || {}; } catch (e) { prefs = {}; }
			if (!('theme' in prefs)) prefs.theme = 'dark';
			if (!('battlelayout' in prefs)) prefs.battlelayout = 'side-by-side-overlay';
			localStorage.setItem('showdown_prefs', JSON.stringify(prefs));
			localStorage.setItem('thor_preparado', '1');
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
