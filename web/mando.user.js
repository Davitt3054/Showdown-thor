// ==UserScript==
// @name         Showdown Thor · mando y pantallas
// @namespace    david.thor.showdown
// @version      3.0
// @description  Juega a Pokémon Showdown con los botones de la AYN Thor: cruceta + A para atacar, B atrás, X equipo, Y Tera, R2 ficha, L1/R1 pestañas de abajo. Pantallas propias en inglés: título, inicio, buscando y fin de combate.
// @match        https://play.pokemonshowdown.com/*
// @match        https://psim.us/*
// @match        https://*.psim.us/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
  MAPA DE BOTONES (v3, el esquema sencillo acordado) — mando de tu Thor: "Odin Controller"

  EN COMBATE (cuando te toca elegir)
    Cruceta ............. moverse por los ataques (el cursor sale ya en el primero)
    A ................... usar el ataque marcado · durante la animación, la salta
    B ................... volver / deshacer la elección (también en dobles)
    X ................... POKÉMON: abrir el equipo para cambiar
    Y ................... Tera
    R2 .................. ficha del ataque o Pokémon marcado / inspeccionar
    L1 / R1 ............. pestaña anterior / siguiente de la pantalla de abajo
    Start ............... Inicio ⇄ combate
    Select .............. mantener = esta ayuda
    L2, L3, R3 .......... libres

  INICIO ................ A BATTLE! · cruceta ◀ ▶ cambia el formato ·
                          X Teambuilder · Y repeticiones · B Inicio normal ·
                          L1 / R1 pestañas de abajo (Home, Historial, Guía)
  BUSCANDO RIVAL ........ B cancelar
  FIN DE COMBATE ........ A nuevo combate · Y revancha · X guardar
                          repetición · B volver al inicio · Select ver el combate
  RESTO (equipos, chat, ventanas...): cruceta mueve, A acepta, B atrás.

  Pantalla siempre encendida mientras juegas; se suelta tras 20 min sin
  tocar nada.
*/

(function () {
	'use strict';
	if (window.__thorMando) return;
	window.__thorMando = true;

	/* ------------------------------------------------------------------ *
	 *  Ajustes que puedes tocar
	 * ------------------------------------------------------------------ */
	var BTN = {
		A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, L2: 6, R2: 7,
		SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15
	};
	/** Posición de cada botón en la cuadrícula 2×2 de ataques (1..4). */
	var ATAQUE = { Y: 1, X: 2, B: 3, A: 4 };
	var STICK_DEAD = 0.55;       // zona muerta del stick izquierdo
	var SCROLL_DEAD = 0.25;      // zona muerta del stick derecho
	var SCROLL_SPEED = 26;       // píxeles por frame a tope de stick
	var REPEAT_FIRST = 380;      // ms hasta que empieza a repetir al mantener
	var REPEAT_NEXT = 120;       // ms entre repeticiones
	var HOLD_MS = 600;           // ms para que "mantener" cuente (Select)
	var IDLE_AUTOFOCUS = 60000;  // ms sin tocar el mando y deja de auto-seleccionar
	var WAKE_IDLE = 20 * 60000;  // ms sin tocar nada y se suelta la pantalla encendida
	var FORMATO_POR_DEFECTO = 'gen9randombattle';

	/* ------------------------------------------------------------------ *
	 *  Pequeñas utilidades
	 * ------------------------------------------------------------------ */
	function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
	function toId(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
	function leer(k, def) {
		try { var v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
	}
	function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* nada */ } }
	function el(tag, cls, html) {
		var e = document.createElement(tag);
		if (cls) e.className = cls;
		if (html != null) e.innerHTML = html;
		return e;
	}
	function texto(node, t) { t = String(t == null ? '' : t); if (node && node.textContent !== t) node.textContent = t; }
	function mmss(ms) {
		var s = Math.max(0, Math.floor(ms / 1000));
		return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
	}

	/** El objeto PS del cliente nuevo de Showdown (o null). */
	function ps() {
		try { return (typeof PS !== 'undefined' && PS && PS.rooms) ? PS : null; } catch (e) { return null; }
	}
	function salaEl(room) { return room ? document.getElementById('room-' + room.id) : null; }
	function esCombate(room) { return !!(room && room.battle && /^(battle|game)-/.test(room.id)); }
	function inicioEl() { return document.getElementById('room-'); }

	/* ------------------------------------------------------------------ *
	 *  Estilo propio del mando (cursor, avisos, ayuda)
	 * ------------------------------------------------------------------ */
	var css = [
		'.tg-focus{outline:3px solid #e9b44c !important;outline-offset:2px !important;',
		'box-shadow:0 0 0 6px rgba(233, 180, 76,.25),0 0 16px 4px rgba(233, 180, 76,.4) !important;',
		'border-radius:6px;}',
		'.tg-focus.tg-big{outline-width:2px !important;box-shadow:0 0 0 4px rgba(233, 180, 76,.22) !important;}',
		'#tg-hud{position:fixed;left:50%;transform:translateX(-50%);top:8px;z-index:2147483000;max-width:calc(100vw - 16px);',
		'padding:6px 16px;border-radius:999px;background:rgba(17, 19, 23,.95);color:#eceef1;',
		'font:700 15px/1.25 "Atkinson Hyperlegible",system-ui,sans-serif;pointer-events:none;',
		'border:2px solid #e9b44c;opacity:0;transition:opacity .15s;white-space:nowrap;}',
		'#tg-hud.on{opacity:1;}',
		'#tg-help{position:fixed;inset:0;z-index:2147483001;display:none;align-items:center;justify-content:center;',
		'background:rgba(0,0,0,.6);}',
		'#tg-help.on{display:flex;}',
		'#tg-help > div{background:#191c22;color:#eceef1;border:2px solid #30353f;border-radius:16px;',
		'padding:12px 20px;font:500 14px/1.5 "Atkinson Hyperlegible",system-ui,sans-serif;max-width:94vw;max-height:92vh;overflow:auto;',
		'columns:2 300px;column-gap:28px;}',
		'#tg-help b{color:#e9b44c;display:inline-block;min-width:5.4em;}',
		'#tg-help h3{margin:0 0 4px;font:italic 700 20px/1.1 "Barlow Condensed",system-ui,sans-serif;color:#eceef1;column-span:all;}',
		'#tg-help h4{margin:8px 0 2px;font:700 13px/1.2 system-ui,sans-serif;letter-spacing:1px;color:#a2a8b3;break-after:avoid;}',
		'#tg-help small{opacity:.75;display:block;margin-top:6px;column-span:all;}'
	].join('');
	var styleEl = document.createElement('style');
	styleEl.id = 'thor-mando-estilo';
	styleEl.textContent = css;
	(document.head || document.documentElement).appendChild(styleEl);

	var hud = el('div');
	hud.id = 'tg-hud';
	var help = el('div', '', '<div><h3>🎮 Thor controls · Showdown</h3>' +
		'<h4>IN BATTLE</h4>' +
		'<b>D-pad</b> pick a move (up · right · left · down)<br>' +
		'<b>A</b> use it · during animations, skip<br>' +
		'<b>B</b> back / undo your choice<br>' +
		'<b>X</b> switch Pokémon<br>' +
		'<b>Y</b> Tera<br>' +
		'<b>R2</b> inspect<br>' +
		'<b>L1 / R1</b> bottom screen tabs<br>' +
		'<b>Start</b> home ⇄ battle<br>' +
		'<b>Select</b> hold = help<br>' +
		'<h4>HOME</h4>' +
		'<b>A</b> BATTLE!<br>' +
		'<b>◀ ▶</b> change format<br>' +
		'<b>X</b> Teambuilder · <b style="min-width:0">Y</b> replays<br>' +
		'<b>Start</b> settings · <b style="min-width:0">B</b> classic home<br>' +
		'<h4>SEARCHING · BATTLE OVER</h4>' +
		'<b>B</b> cancel the search<br>' +
		'<b>A</b> new battle · <b style="min-width:0">Y</b> rematch<br>' +
		'<b>X</b> save replay · <b style="min-width:0">B</b> home<br>' +
		'<h4>EVERYWHERE ELSE</h4>' +
		'<b>D-pad</b> move · <b style="min-width:0">A</b> OK · <b style="min-width:0">B</b> back<br>' +
		'<b>Right stick</b> scroll the chat or the guide' +
		'<small id="tg-modo"></small>' +
		'<small id="tg-info"></small>' +
		'<small id="tg-wake"></small>' +
		'<small>Hold Select (or press B) to close</small></div>');
	help.id = 'tg-help';

	function mountUI() {
		if (!document.body) return;
		if (!hud.isConnected) document.body.appendChild(hud);
		if (!help.isConnected) document.body.appendChild(help);
		capas.montar();
	}

	var hudTimer = 0;
	function toast(msg, ms) {
		mountUI();
		hud.textContent = msg;
		hud.classList.add('on');
		clearTimeout(hudTimer);
		if (ms !== 0) hudTimer = setTimeout(function () { if (!state.inspect) hud.classList.remove('on'); }, ms || 2200);
	}

	/* ------------------------------------------------------------------ *
	 *  Estado
	 * ------------------------------------------------------------------ */
	var state = {
		cur: null,          // elemento seleccionado
		curSig: null,       // firma para encontrarlo si Showdown lo vuelve a pintar
		curRect: null,
		inspect: false,
		helpOpen: false,
		lastInput: 0,
		lastActivity: Date.now(),   // última vez que tocaste algo (mando o pantalla)
		lastTabHref: null,
		cursorOn: false,    // modo mixto: ¿se ve el cursor en los ataques?
		reqVisto: null,     // última petición de Showdown vista (para saber si es turno nuevo)
		inicioOculto: false,
		finOculto: false,
		busquedaDesde: 0,
		formatoRestaurado: false,
		ultimaSalaCombate: null,
		titulo: true,       // pantalla de título al abrir la app
		modo: 'cursor',     // v3: el cursor siempre está en los ataques (cruceta + A)
		escena: null,
		ctx: 'generico'
	};

	/* ------------------------------------------------------------------ *
	 *  Utilidades de DOM
	 * ------------------------------------------------------------------ */
	var SEL = 'button, a[href], a.roomtab, input:not([type=hidden]), select, textarea, summary, ' +
		'label.megaevo, [role=button], [role=tab], [data-cmd], [data-href], .button, [tabindex]:not([tabindex="-1"])';
	var NEST_PARENT = 'button, a[href], [role=button], [role=tab]';

	function shown(e) {
		if (!e || !e.isConnected) return false;
		var r = e.getBoundingClientRect();
		if (r.width < 2 || r.height < 2) return false;
		var cs = getComputedStyle(e);
		if (cs.visibility === 'hidden' || cs.display === 'none') return false;
		return true;
	}
	function onScreen(r) {
		return r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
	}
	function ignoreHit(e) {
		return e.closest && (e.closest('#tooltipwrapper') || e.closest('#tg-hud') || e.closest('#tg-help'));
	}
	function reachable(e, r) {
		var l = Math.max(r.left, 0), t = Math.max(r.top, 0);
		var rr = Math.min(r.right, innerWidth), bb = Math.min(r.bottom, innerHeight);
		if (rr - l < 2 || bb - t < 2) return false;
		var stack = document.elementsFromPoint((l + rr) / 2, (t + bb) / 2);
		for (var i = 0; i < stack.length; i++) {
			if (ignoreHit(stack[i])) continue;
			return stack[i] === e || e.contains(stack[i]);
		}
		return false;
	}
	function isTextField(e) {
		if (!e) return false;
		var tag = e.tagName;
		if (tag === 'TEXTAREA') return true;
		if (tag === 'INPUT') {
			var t = (e.type || 'text').toLowerCase();
			return !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/.test(t);
		}
		return !!e.isContentEditable;
	}

	function popupScope() {
		var pops = document.querySelectorAll('.ps-popup');
		for (var i = pops.length - 1; i >= 0; i--) if (shown(pops[i])) return pops[i];
		return null;
	}

	/** Botones/enlaces que se pueden pulsar ahora mismo. */
	function candidates(includeOff) {
		var scope = popupScope() || document;
		var out = [];
		var all = scope.querySelectorAll(SEL);
		for (var i = 0; i < all.length; i++) {
			var e = all[i];
			if (e.id === 'tg-hud' || e.closest('#tg-help')) continue;
			if (e.disabled) continue;
			if (e.matches('input') && e.closest('label.megaevo')) continue; // el label ya vale
			var p = e.parentElement && e.parentElement.closest(NEST_PARENT);
			if (p && scope.contains(p) && p !== e) continue; // botón dentro de otro botón
			if (!shown(e)) continue;
			var r = e.getBoundingClientRect();
			if (includeOff) {
				if (!onScreen(r) && e.closest('.tablist, #header')) continue;
			} else if (!onScreen(r) || !reachable(e, r)) continue;
			out.push(e);
		}
		return out;
	}

	/** ¿Hay de verdad un Pokémon en ese hueco del campo? (Showdown pinta 6 huecos siempre) */
	function slotOccupied(e) {
		var m = /^activepokemon\|(\d+)\|(\d+)/.exec(e.getAttribute('data-tooltip') || '');
		if (!m) return true;
		try {
			var P = ps();
			var roomEl = e.closest('.ps-room');
			var id = roomEl && roomEl.id ? roomEl.id.replace(/^room-/, '') : '';
			var room = P && P.rooms[id];
			var battle = room && room.battle;
			if (!battle) return true;
			var side = battle.sides[(+battle.viewpointSwitched) ^ (+m[1])];
			var idx = +m[2];
			if (idx >= 1 && battle.sides.length > 2) side = battle.sides[side.n + 2];
			return !!(side && side.active && side.active[idx]);
		} catch (err) { return true; }
	}

	/** Pokémon / campo con ficha (tooltip) para el modo inspección. */
	function inspectables() {
		var out = [];
		var all = document.querySelectorAll('.has-tooltip[data-tooltip]');
		for (var i = 0; i < all.length; i++) {
			var e = all[i];
			var tt = e.getAttribute('data-tooltip') || '';
			if (!/^(pokemon\||activepokemon\||field)/.test(tt)) continue;
			if (e.closest('.ps-popup')) continue;
			if (!shown(e)) continue;
			var r = e.getBoundingClientRect();
			if (!onScreen(r)) continue;
			if (!slotOccupied(e)) continue;
			if (!e.hasAttribute('tabindex')) e.setAttribute('tabindex', '-1');
			out.push(e);
		}
		return out;
	}

	function rectOf(e) { return e.getBoundingClientRect(); }

	function signature(e) {
		return [e.tagName, e.getAttribute('data-cmd') || '', e.getAttribute('data-tooltip') || '',
			e.getAttribute('data-thor') || '', e.getAttribute('href') || '', (e.textContent || '').trim().slice(0, 24)].join('|');
	}

	/* ------------------------------------------------------------------ *
	 *  Navegación espacial (cruceta)
	 * ------------------------------------------------------------------ */
	// v7: con los ataques en rombo, cada dirección de la cruceta es un ataque
	// (arriba = 1, derecha = 2, izquierda = 3, abajo = 4) y A lo usa.
	var ROMBO = { up: 1, right: 2, left: 3, down: 4 };
	function enRombo(from, dir) {
		if (!from || !from.matches || !from.matches('.movemenu button.movebutton')) return null;
		var menu = from.closest('.movemenu');
		var btns = menu ? menu.querySelectorAll(':scope > button.movebutton') : [];
		if (btns.length !== 4 || !ROMBO[dir]) return null;
		var b = btns[ROMBO[dir] - 1];
		return b && b !== from && !b.classList.contains('disabled') ? b : null;
	}
	function pickDirection(from, dir, list) {
		var rombo = enRombo(from, dir);
		if (rombo) return rombo;
		var fr = rectOf(from);
		var fcx = (fr.left + fr.right) / 2, fcy = (fr.top + fr.bottom) / 2;
		var best = null, bestScore = Infinity;
		for (var i = 0; i < list.length; i++) {
			var e = list[i];
			if (e === from || from.contains(e) || e.contains(from)) continue;
			var r = rectOf(e);
			var cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
			var dx = cx - fcx, dy = cy - fcy;
			var prim, crossGap, crossCenter;
			if (dir === 'right') {
				if (dx <= 2) continue;
				prim = Math.max(0, r.left - fr.right) + dx * 0.15;
				crossGap = Math.max(0, Math.max(r.top - fr.bottom, fr.top - r.bottom));
				crossCenter = Math.abs(dy);
			} else if (dir === 'left') {
				if (dx >= -2) continue;
				prim = Math.max(0, fr.left - r.right) - dx * 0.15;
				crossGap = Math.max(0, Math.max(r.top - fr.bottom, fr.top - r.bottom));
				crossCenter = Math.abs(dy);
			} else if (dir === 'down') {
				if (dy <= 2) continue;
				prim = Math.max(0, r.top - fr.bottom) + dy * 0.15;
				crossGap = Math.max(0, Math.max(r.left - fr.right, fr.left - r.right));
				crossCenter = Math.abs(dx);
			} else {
				if (dy >= -2) continue;
				prim = Math.max(0, fr.top - r.bottom) - dy * 0.15;
				crossGap = Math.max(0, Math.max(r.left - fr.right, fr.left - r.right));
				crossCenter = Math.abs(dx);
			}
			var score = prim + crossGap * 3 + crossCenter * 0.35;
			if (score < bestScore) { bestScore = score; best = e; }
		}
		return best;
	}

	/* ------------------------------------------------------------------ *
	 *  Selección (cursor)
	 * ------------------------------------------------------------------ */
	function setCur(e) {
		if (state.cur && state.cur !== e) {
			state.cur.classList.remove('tg-focus', 'tg-big');
			if (state.cur.blur && document.activeElement === state.cur) state.cur.blur();
		}
		state.cur = e || null;
		if (!e) { state.curSig = null; return; }
		state.curSig = signature(e);
		state.curRect = rectOf(e);
		e.classList.add('tg-focus');
		if (state.curRect.width > 150 && state.curRect.height > 90) e.classList.add('tg-big');
		// Enfocar un ataque / Pokémon hace que Showdown abra su ficha sola. Fuera del
		// modo inspección no queremos eso: la ficha sale solo con R2. Los campos de
		// texto tampoco se enfocan al marcarlos (solo con A), para no abrir el teclado.
		if (state.inspect || !(isTextField(e) || e.matches('.has-tooltip[data-tooltip]'))) {
			try { e.focus({ preventScroll: true }); } catch (err) { /* nada */ }
		}
		try { e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (err) { /* nada */ }
		state.curRect = rectOf(e);
	}
	function clearCur() { setCur(null); }

	function firstVisible(sel, root) {
		var list = (root || document).querySelectorAll(sel);
		for (var i = 0; i < list.length; i++) {
			if (shown(list[i]) && !list[i].closest('.ps-popup') === !popupScope()) return list[i];
		}
		return null;
	}

	function defaultTarget(list) {
		if (popupScope()) {
			var pop = popupScope();
			var curOpt = pop.querySelector('.option.cur, .cur');
			if (curOpt && list.indexOf(curOpt) >= 0) return curOpt;
			for (var q = 0; q < list.length; q++) if (!isTextField(list[q])) return list[q];
			return list[0] || null;
		}
		var prefs = [
			'.thor-capa:not([hidden]) .thor-battle',
			'.thor-capa:not([hidden]) .thor-btn.principal',
			'.thor-capa:not([hidden]) .thor-repe',
			'.thor-capa:not([hidden]) .thor-btn',
			'button[data-cmd^="/move "]:not(.movebutton):not(.disabled)',
			'.movecontrols .movebutton:not(.disabled)',
			'.switchcontrols .switchmenu button:not(.disabled)',
			'.teamcontrols .switchmenu button:not(.disabled)',
			'.targetcontrols .switchmenu button:not(.disabled)',
			'.overlay-controls-list .move-button',
			'.overlay-controls-list button',
			'button.mainmenu1',
			'.whatdo button',
			'.switchmenu button:not(.disabled)',
			'.movemenu button:not(.disabled)'
		];
		for (var i = 0; i < prefs.length; i++) {
			var e = firstVisible(prefs[i]);
			if (e && list.indexOf(e) >= 0) return e;
		}
		// lo más cercano al centro de la pantalla, sin contar las pestañas
		var cx = innerWidth / 2, cy = innerHeight / 2, best = null, bd = Infinity;
		for (var j = 0; j < list.length; j++) {
			var c = list[j];
			if (c.classList.contains('roomtab') || c.closest('.tablist, #header')) continue;
			var r = rectOf(c);
			var d = Math.hypot((r.left + r.right) / 2 - cx, (r.top + r.bottom) / 2 - cy);
			if (d < bd) { bd = d; best = c; }
		}
		return best || list[0] || null;
	}

	function currentValid() {
		var c = state.cur;
		if (!c || !shown(c)) return false;
		if (state.inspect) return true;
		var pop = popupScope();
		if (pop && !pop.contains(c)) return false;   // se abrió una ventana: la selección debe ir dentro
		if (!pop && c.closest('.ps-popup')) return false;
		var r = rectOf(c);
		if (!reachable(c, r)) return false;          // tapado (por ejemplo, por una pantalla de la app)
		return true;
	}

	/** Si Showdown repintó el botón, busca el "mismo" botón nuevo. */
	function reacquire() {
		var list = state.inspect ? inspectables() : candidates();
		if (!list.length) { clearCur(); return; }
		var sig = state.curSig, rect = state.curRect, best = null, bd = Infinity;
		// tras elegir ataque / cambio / cancelar, el punto de partida lógico es el menú nuevo
		if (!state.inspect && sig && /^[A-Z]+\|\/(move|switch|choose|cancel|team|shift|undo)/.test(sig)) {
			sig = null; rect = null;
		}
		if (sig) {
			for (var i = 0; i < list.length; i++) {
				if (signature(list[i]) !== sig) continue;
				var r = rectOf(list[i]);
				var d = rect ? Math.hypot(r.left - rect.left, r.top - rect.top) : 0;
				if (d < bd) { bd = d; best = list[i]; }
			}
		}
		if (!best && rect && !state.inspect) {
			var cx = (rect.left + rect.right) / 2, cy = (rect.top + rect.bottom) / 2;
			for (var k = 0; k < list.length; k++) {
				var rr = rectOf(list[k]);
				var dd = Math.hypot((rr.left + rr.right) / 2 - cx, (rr.top + rr.bottom) / 2 - cy);
				if (dd < bd) { bd = dd; best = list[k]; }
			}
			// si no hay nada parecido, mejor el punto de partida lógico
			if (best && bd > 140) best = defaultTarget(list);
		}
		if (!best) best = defaultTarget(list);
		state.cur = null; // el viejo ya no existe, no hace falta limpiarlo
		setCur(best);
	}

	/** Pantallas donde el cursor solo aparece al usar la cruceta (si no, los botones actúan directamente). */
	var CURSOR_A_DEMANDA = { 'ataques': 1, 'combate': 1, 'inicio': 1, 'fin': 1, 'fin-oculto': 1, 'buscando': 1 };
	function cursorDormido() {
		if (state.ctx === 'ataques' && state.modo === 'cursor') return false;   // modo cursor: siempre a la vista
		return !!CURSOR_A_DEMANDA[state.ctx] && !state.cursorOn;
	}
	var MODOS = { mixto: 'MIXTO (X Y A B atacan, la cruceta marca)', directo: 'DIRECTO (solo X Y A B)', cursor: 'CURSOR (cruceta y A)' };
	function cambiarModo(delta) {
		var lista = Object.keys(MODOS);
		state.modo = lista[(lista.indexOf(state.modo) + delta + lista.length) % lista.length];
		guardar('thor_modo', state.modo);
		state.cursorOn = false;
		clearCur();
		textoModo();
	}
	function textoModo() {
		var m = help.querySelector('#tg-modo');
		if (m) m.textContent = '';
	}

	function ensureCur() {
		if (state.helpOpen) return;
		if (cursorDormido()) return;   // modo mixto: sin cursor hasta usar la cruceta
		if (!currentValid()) reacquire();
		else if (state.cur && !state.cur.classList.contains('tg-focus')) state.cur.classList.add('tg-focus');
	}

	function move(dir) {
		if (state.helpOpen) return;
		// Si estabas escribiendo (teclado abierto a mano), arrancamos desde ese campo:
		// al moverte se cierra el teclado y pasas a lo que haya al lado (resultados...).
		var ae = document.activeElement;
		if (!state.inspect && isTextField(ae) && ae !== state.cur && shown(ae)) setCur(ae);
		var list = state.inspect ? inspectables() : candidates();
		if (!list.length) return;
		if (!currentValid()) { setCur(state.inspect ? list[0] : defaultTarget(list)); return; }
		var next = pickDirection(state.cur, dir, list);
		if (!next && !state.inspect) {
			// nada a la vista en esa dirección: buscar más allá (y hacer scroll hasta allí)
			next = pickDirection(state.cur, dir, candidates(true));
		}
		if (next) setCur(next);
	}

	/* ------------------------------------------------------------------ *
	 *  Acciones generales (como en la 1.1)
	 * ------------------------------------------------------------------ */
	function settleSoon() {
		setTimeout(settle, 140);
		setTimeout(settle, 650);
	}
	function settle() {
		if (state.inspect) return;
		if (cursorDormido()) return;
		if (!state.cur && !state.lastInput) return;
		if (!currentValid()) reacquire();
	}

	function confirm() {
		if (state.helpOpen) { toggleHelp(false); return; }
		var e = state.cur;
		if (!currentValid()) { ensureCur(); return; }
		if (state.inspect) return;
		var tag = e.tagName;
		if (isTextField(e) || tag === 'SELECT') {
			e.focus();
			if (tag === 'SELECT') e.click();
			return;
		}
		e.click();
		settleSoon();
	}

	function closePopupIfAny() {
		var pop = popupScope();
		if (!pop) return false;
		var ov = pop.closest('.ps-overlay');
		if (ov) { ov.click(); return true; }
		try { var P = ps(); if (P && P.closePopup) { P.closePopup(); return true; } } catch (e) { /* nada */ }
		return false;
	}

	function back() {
		if (state.helpOpen) { toggleHelp(false); return; }
		var ae = document.activeElement;
		if (isTextField(ae)) { ae.blur(); return; }
		if (state.inspect) { setInspect(false); return; }
		if (closePopupIfAny()) { clearCur(); settleSoon(); return; }
		var btn = firstVisible('button[data-cmd="/cancelone"]') ||
			firstVisible('.overlay-controls-list .cur') ||
			firstVisible('button[data-cmd="/cancel"]');
		if (btn) {
			btn.click();
			state.cur = null; state.curSig = null; state.curRect = null;
			settleSoon();
			return;
		}
		// chat abierto en pantallas pequeñas: volver al combate
		var back2 = firstVisible('.battle-chat-toggle, button[name="hideChat"]');
		if (back2) { back2.click(); settleSoon(); return; }
		// en el Inicio normal de Showdown: volver a la pantalla de Inicio de la app
		var P = ps();
		if (P && P.room && P.room.id === '' && state.inicioOculto) { state.inicioOculto = false; pintar(); }
	}

	function setInspect(on) {
		if (on === state.inspect) return;
		if (on) {
			var list = inspectables();
			if (!list.length) { toast('No Pokémon to inspect here', 1600); return; }
			state.inspect = true;
			var start = null, i;
			for (i = 0; i < list.length; i++) {
				if (/^activepokemon\|1\|/.test(list[i].getAttribute('data-tooltip'))) { start = list[i]; break; }
			}
			if (!start) start = list[0];
			setCur(start);
			toast('🔍 INSPECT · D-pad: pick · B / L3: exit', 0);
		} else {
			state.inspect = false;
			hud.classList.remove('on');
			var old = state.cur;
			clearCur();
			if (old && old.blur) old.blur();
			hideTooltip();
			state.cur = null;
			if (!cursorDormido()) reacquire();
		}
	}

	/** ¿Hay una ficha (tooltip) de Showdown en pantalla ahora mismo? */
	function tooltipVisible() {
		try {
			if (typeof BattleTooltips !== 'undefined' && BattleTooltips.elem) return BattleTooltips.elem.isConnected;
		} catch (e) { /* nada */ }
		var t = document.querySelector('#tooltipwrapper .tooltip');
		return !!(t && t.isConnected);
	}

	/** Quita la ficha usando la propia función de Showdown. */
	function hideTooltip() {
		try {
			if (typeof BattleTooltips !== 'undefined' && BattleTooltips.hideTooltip) { BattleTooltips.hideTooltip(); return; }
		} catch (e) { /* nada */ }
		try {
			var ae = document.activeElement;
			if (ae && ae.matches && ae.matches('.has-tooltip')) ae.blur();
		} catch (e) { /* nada */ }
	}

	/** Quita la ficha que sacó R2 (en modo inspección la gestiona el propio modo). */
	function hideInfo() {
		if (state.inspect || !tooltipVisible()) return;
		var ae = document.activeElement;
		if (ae && ae.matches && ae.matches('.has-tooltip')) { try { ae.blur(); } catch (e) { /* nada */ } }
		hideTooltip();
	}

	/** Ficha del ataque / Pokémon marcado. Devuelve false si lo marcado no tiene ficha. */
	function toggleInfo() {
		if (state.helpOpen || state.inspect) return true;
		if (tooltipVisible()) { hideInfo(); return true; }
		if (!currentValid()) return false;
		var e = state.cur;
		var tip = e && (e.matches('.has-tooltip[data-tooltip]') ? e : e.closest('.has-tooltip[data-tooltip]'));
		if (!tip) return false;
		try {
			if (document.activeElement === tip) tip.blur();
			tip.focus({ preventScroll: true });
		} catch (err) { /* nada */ }
		return true;
	}

	/** R2: ficha de lo marcado; si no hay nada marcado con ficha, modo inspección. */
	function fichaOInspeccion() {
		if (state.helpOpen) return;
		if (state.inspect) { setInspect(false); return; }
		var cursorVisible = state.cur && !cursorDormido();
		if (cursorVisible && toggleInfo()) return;
		if (tooltipVisible()) { hideInfo(); return; }
		setInspect(true);
	}

	function tabs() {
		var all = document.querySelectorAll('a.roomtab');
		var out = [];
		for (var i = 0; i < all.length; i++) {
			if (all[i].id === 'roomtab-rooms') continue;
			if (!shown(all[i])) continue;
			out.push(all[i]);
		}
		return out;
	}
	function cycleTab(delta) {
		var list = tabs();
		if (list.length < 2) return;
		var idx = -1;
		for (var i = 0; i < list.length; i++) if (list[i].classList.contains('cur') || list[i].getAttribute('aria-selected') === 'true') idx = i;
		var next = list[(idx + delta + list.length) % list.length];
		if (state.inspect) setInspect(false);
		clearCur();
		next.click();
		settleSoon();
		toast('→ ' + (next.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40), 1400);
	}

	function skipAnimation() {
		var s = firstVisible('button[data-cmd="/ffto end"]');
		if (s) { s.click(); toast('⏩ Skipping animation', 900); return; }
		var P = ps(), room = P && P.room;
		if (esCombate(room) && !room.battle.atQueueEnd) {
			try { room.send('/ffto end'); toast('⏩ Skipping animation', 900); } catch (e) { /* nada */ }
		}
	}

	function toggleHelp(force) {
		state.helpOpen = typeof force === 'boolean' ? force : !state.helpOpen;
		mountUI();
		if (state.helpOpen) {
			hideInfo();
			var w = help.querySelector('#tg-wake');
			if (w) w.textContent = '☀ Pantalla encendida: ' + wake.text();
			textoModo();
			var inf = help.querySelector('#tg-info');
			if (inf) {
				var P = ps(), lay = '';
				try { lay = P && P.prefs ? (P.prefs.battlelayout || 'automático') : '?'; } catch (e) { lay = '?'; }
				inf.textContent = '📐 Pantalla ' + innerWidth + '×' + innerHeight + ' · densidad ' + (Math.round(devicePixelRatio * 100) / 100) +
					' · diseño de combate: ' + lay + (dos.hay ? ' · dos pantallas' : '') + (escalaInfo ? ' · ' + escalaInfo : '') +
					' · navegador ' + ((/Chrome\/(\d+)/.exec(navigator.userAgent) || [])[1] || '?');
			}
		}
		help.classList.toggle('on', state.helpOpen);
	}

	/* ------------------------------------------------------------------ *
	 *  Salas: Inicio ⇄ combate
	 * ------------------------------------------------------------------ */
	/** Combate abierto al que volver: primero uno en el que juegas y no ha acabado. */
	function combateAbierto() {
		var P = ps();
		if (!P) return null;
		var mejor = null;
		var ult = state.ultimaSalaCombate && P.rooms[state.ultimaSalaCombate];
		if (ult && esCombate(ult) && ult.side && !ult.battle.ended) return ult;
		for (var id in P.rooms) {
			var r = P.rooms[id];
			if (!esCombate(r)) continue;
			if (r.side && !r.battle.ended) return r;
			if (!mejor) mejor = r;
		}
		return ult && esCombate(ult) ? ult : mejor;
	}

	function irA(id) {
		var P = ps();
		if (!P) return;
		if (state.inspect) setInspect(false);
		clearCur();
		try { P.join(id); } catch (e) { /* nada */ }
		settleSoon();
	}

	function inicioOCombate() {
		var P = ps();
		if (!P) return;
		var room = P.room;
		if (room && room.id === '') {
			if (state.inicioOculto) { state.inicioOculto = false; pintar(); return; }
			var c = combateAbierto();
			if (c) irA(c.id);
			else irA('options');
			return;
		}
		if (esCombate(room)) state.ultimaSalaCombate = room.id;
		state.inicioOculto = false;
		irA('');
	}

	/* ------------------------------------------------------------------ *
	 *  COMBATE: ataque directo, equipo, Tera, deshacer
	 * ------------------------------------------------------------------ */
	function salaCombate() {
		var P = ps();
		var room = P && P.room;
		return esCombate(room) ? room : null;
	}

	function atacar(n) {
		var room = salaCombate();
		if (!room || !room.choices) return;
		var req = room.choices.currentMoveRequest && room.choices.currentMoveRequest();
		var mv = req && req.moves && req.moves[n - 1];
		if (!mv) { toast('No move in that spot', 1200); return; }
		if (mv.disabled) { toast(mv.name + ' no se puede usar ahora', 1500); return; }
		var cont = salaEl(room);
		var btn = cont && cont.querySelector('.movemenu button.movebutton[data-cmd^="/move ' + n + '"]');
		state.cursorOn = false;
		clearCur();
		if (btn && !btn.classList.contains('disabled')) {
			btn.click();
		} else {
			var special = '';
			try { special = room.choices.moveSpecial(room.choices.current) || ''; } catch (e) { /* nada */ }
			room.send('/move ' + n + special);
		}
		hideInfo();
		settleSoon();
	}

	/** L1: abre / cierra el equipo para cambiar. */
	function abrirEquipo() {
		var room = salaCombate();
		if (!room) return;
		if (state.ctx === 'cambio-forzado' || state.ctx === 'equipo-previo') return; // ya está abierto
		room.overlayActive = room.overlayActive === 'switch' ? (state.ctx === 'combate' ? null : 'move') : 'switch';
		try { room.update(null); } catch (e) { /* nada */ }
		state.cursorOn = room.overlayActive === 'switch';
		clearCur();
		if (state.cursorOn) setTimeout(cursorEnCambios, 80);
	}

	function cursorEnCambios() {
		var room = salaCombate();
		var cont = salaEl(room);
		if (!cont) return;
		var b = firstVisible('.switchcontrols .switchmenu button:not(.disabled), .teamcontrols .switchmenu button:not(.disabled), ' +
			'.targetcontrols .switchmenu button:not(.disabled)', cont);
		if (b) setCur(b);
	}

	function tera() {
		var room = salaCombate();
		var cont = salaEl(room);
		var box = cont && cont.querySelector('label.megaevo input[name="tera"]');
		if (!box) { toast('Ahora no puedes teracristalizar', 1400); return; }
		box.click();
		setTimeout(function () {
			toast(box.checked ? '💎 Tera on: pick a move' : 'Tera off', 1400);
		}, 30);
	}

	function deshacer() {
		var room = salaCombate();
		if (!room || !room.choices || !room.request) { toast('Nada que deshacer', 1000); return; }
		var ch = room.choices;
		try {
			if (ch.isDone()) room.send('/cancel');
			else if (!ch.isEmpty() || (ch.current && ch.current.move)) room.send('/cancelone');
			else { toast('Nada que deshacer', 1000); return; }
		} catch (e) { return; }
		state.cursorOn = false;
		clearCur();
		toast('↶ Choice undone', 1100);
	}

	/** En cuanto te toca elegir ataque, los ataques salen ya abiertos (2×2). */
	function abrirAtaquesSolos(room) {
		if (room.overlayActive) return;
		var cont = salaEl(room);
		if (!cont || !cont.querySelector('.overlay-controls-list button[data-cmd="/movemenu"]')) return; // sin "overlay controls"
		room.overlayActive = 'move';
		try { room.update(null); } catch (e) { /* nada */ }
	}

	/** Eficacia de cada ataque contra el rival (x2 en mostaza, etc.). */
	function marcarEficacias(room) {
		var cont = salaEl(room);
		if (!cont) return;
		var btns = cont.querySelectorAll('.movemenu button.movebutton[data-tooltip^="move|"]');
		if (!btns.length) return;
		var b = room.battle, ch = room.choices;
		var idx = 0;
		try { idx = ch.index(); } catch (e) { /* nada */ }
		var yo = b.nearSide && b.nearSide.active[idx];
		var rivales = (b.farSide && b.farSide.active || []).filter(function (p) { return p && !p.fainted; });
		var tt = b.scene && b.scene.tooltips;
		for (var i = 0; i < btns.length; i++) {
			var btn = btns[i];
			var etiqueta = '';
			try {
				var nombre = btn.getAttribute('data-tooltip').split('|')[1];
				var mov = b.dex.moves.get(nombre);
				var tipo = (/\btype-(\w+)/.exec(btn.className) || [])[1] || mov.type;
				if (mov.category !== 'Status' && rivales.length && yo) {
					var mejor = null;
					for (var r = 0; r < rivales.length; r++) {
						var f = null;
						try { if (tt && tt.getMoveEffectiveness) f = tt.getMoveEffectiveness(yo, mov, tipo, mov.category, rivales[r]); } catch (e) { f = null; }
						if (f === null || f === undefined) f = eficaciaPorTabla(b, tipo, rivales[r]);
						if (f !== null && (mejor === null || f > mejor)) mejor = f;
					}
					if (mejor !== null) etiqueta = mejor === 0 ? 'x0' : mejor <= 0.25 ? 'x¼' : mejor < 1 ? 'x½' : mejor >= 4 ? 'x4' : mejor > 1 ? 'x2' : 'x1';
				}
			} catch (e) { etiqueta = ''; }
			if (etiqueta) { if (btn.getAttribute('data-thor-x') !== etiqueta) btn.setAttribute('data-thor-x', etiqueta); }
			else if (btn.hasAttribute('data-thor-x')) btn.removeAttribute('data-thor-x');
		}
	}
	function eficaciaPorTabla(b, tipo, rival) {
		try {
			var tipos = rival.getTypeList();
			var f = 1;
			for (var i = 0; i < tipos.length; i++) {
				var dt = b.dex.types.get(tipos[i]).damageTaken[tipo];
				if (dt === 1) f *= 2; else if (dt === 2) f /= 2; else if (dt === 3) f = 0;
			}
			return f;
		} catch (e) { return null; }
	}

	/* ------------------------------------------------------------------ *
	 *  INICIO: formato, equipo, buscar
	 * ------------------------------------------------------------------ */
	function botonFormato() { var m = inicioEl(); return m && m.querySelector('button.formatselect'); }
	function botonEquipo() { var m = inicioEl(); return m && m.querySelector('button.teamselect'); }
	function formatoActual() {
		var b = botonFormato();
		return toId((b && b.value || '').split('@@@')[0]) || leer('thor_formato', FORMATO_POR_DEFECTO);
	}
	function datosFormato(id) {
		try { return (window.BattleFormats && window.BattleFormats[id]) || null; } catch (e) { return null; }
	}
	function nombreFormato(id) {
		var f = datosFormato(id);
		if (f && f.name) return f.name.replace(/^\[Gen \d+\]\s*/, '');
		try { if (typeof BattleLog !== 'undefined') return BattleLog.formatName(id).replace(/^\[Gen \d+\]\s*/, ''); } catch (e) { /* nada */ }
		return id;
	}
	function descFormato(id) {
		var gen = (/^gen(\d+)/.exec(id) || [])[1];
		var f = datosFormato(id);
		var partes = [];
		if (gen) partes.push('Gen ' + gen);
		if (f && f.team) partes.push(/monotype/.test(id) ? 'random monotype team' : 'random team');
		else partes.push('your team');
		if (f && f.rated === false) partes.push('unrated');
		return partes.join(' · ');
	}
	function nombreEquipo() {
		var id = formatoActual();
		var f = datosFormato(id);
		if (f && f.team) return 'Random';
		var b = botonEquipo();
		var P = ps();
		var t = b && P && P.teams && P.teams.byKey && P.teams.byKey[b.value];
		return t ? t.name : 'no team';
	}

	function listaFormatos() {
		var P = ps();
		var out = [];
		function add(id) {
			id = toId(id);
			if (!id || out.indexOf(id) >= 0) return;
			var f = datosFormato(id);
			if (window.BattleFormats && (!f || f.searchShow === false)) return;
			out.push(id);
		}
		try {
			var st = (P && P.prefs && P.prefs.starredformats) || {};
			Object.keys(st).filter(function (k) { return st[k] === true; }).reverse().forEach(add);
		} catch (e) { /* nada */ }
		leer('thor_recientes', []).forEach(add);
		add(FORMATO_POR_DEFECTO);
		['gen9randomdoublesbattle', 'gen9ou', 'gen9monotype', 'gen9ubers'].forEach(add);
		// el actual, al final: si va delante, ◀ ▶ solo saltan entre dos formatos
		add(formatoActual());
		return out;
	}

	function ponerFormato(id) {
		var b = botonFormato();
		if (!b || b.disabled) return false;
		if (toId(b.value.split('@@@')[0]) === id) return true;
		b.value = id;
		b.dispatchEvent(new Event('change'));
		// Showdown repinta el formulario un poco después con el formato viejo:
		// se le pide repintar más tarde y se comprueba que se ha quedado.
		setTimeout(refrescarInicio, 60);
		[300, 800].forEach(function (ms) {
			setTimeout(function () {
				var bt = botonFormato();
				if (bt && !bt.disabled && toId(bt.value.split('@@@')[0]) !== id) { bt.value = id; bt.dispatchEvent(new Event('change')); }
				refrescarInicio();
			}, ms);
		});
		guardar('thor_formato', id);
		setTimeout(ponerEquipoRecordado, 60);
		return true;
	}

	function ponerEquipoRecordado() {
		var b = botonEquipo();
		var P = ps();
		if (!b || b.disabled || !P || !P.teams) return;
		var key = leer('thor_equipos', {})[formatoActual()];
		if (key && key !== b.value && P.teams.byKey && P.teams.byKey[key]) {
			b.value = key;
			b.dispatchEvent(new Event('change'));
			refrescarInicio();
		}
	}
	function refrescarInicio() {
		var P = ps();
		try { if (P && P.mainmenu && P.mainmenu.update) P.mainmenu.update(null); } catch (e) { /* nada */ }
	}

	function cambiarFormato(delta) {
		var lista = listaFormatos();
		if (lista.length < 2) {
			toast('Star formats ★ in the Showdown list to change them with L1 / R1', 2600);
			return;
		}
		var i = lista.indexOf(formatoActual());
		var sig = lista[(i + delta + lista.length) % lista.length];
		if (ponerFormato(sig)) toast(nombreFormato(sig), 1200);
		pintar();
	}

	function abrirListaFormatos() {
		var b = botonFormato();
		if (b && !b.disabled) b.click();
	}

	/** Se apunta el formato y el equipo de cada búsqueda (A buscar / nuevo combate). */
	function parchearBusqueda() {
		var P = ps();
		var m = P && P.mainmenu;
		if (!m || m.__thorParche || typeof m.startSearch !== 'function') return;
		var orig = m.startSearch;
		m.startSearch = function (format, team) {
			try {
				var id = toId(String(format || '').split('@@@')[0]);
				var rec = leer('thor_recientes', []).filter(function (x) { return x !== id; });
				rec.unshift(id);
				guardar('thor_recientes', rec.slice(0, 6));
				guardar('thor_formato', id);
				if (team && team.key) {
					var eq = leer('thor_equipos', {});
					eq[id] = team.key;
					guardar('thor_equipos', eq);
				}
				state.busquedaDesde = Date.now();
			} catch (e) { /* nada */ }
			return orig.apply(this, arguments);
		};
		m.__thorParche = true;
	}

	function buscando() {
		var P = ps();
		var m = P && P.mainmenu;
		if (!m) return false;
		try { return !!(m.searchCountdown || (m.searchingFormat && m.searchingFormat())); } catch (e) { return false; }
	}

	function buscar() {
		var P = ps();
		if (!P) return;
		if (!P.user || !P.user.named) { irA('login'); toast('Primero entra con tu usuario', 1800); return; }
		var b = inicioEl() && inicioEl().querySelector('button.mainmenu1.big[type="submit"]');
		if (b && !b.disabled) { state.busquedaDesde = Date.now(); b.click(); return; }
		toast(P.isOffline ? 'Sin conexión con Showdown' : 'Conectando con Showdown…', 1600);
	}

	function cancelarBusqueda() {
		var P = ps();
		if (!P || !P.mainmenu) return;
		try {
			if (P.mainmenu.cancelSearch) P.mainmenu.cancelSearch();
			else P.send('/cancelsearch');
		} catch (e) { /* nada */ }
		toast('Search cancelled', 1200);
	}

	/* ------------------------------------------------------------------ *
	 *  FIN DE COMBATE
	 * ------------------------------------------------------------------ */
	function formatoDeSala(room) {
		var m = /^battle-([a-z0-9]+)-/.exec(room.id);
		return m ? m[1] : toId(room.battle && room.battle.tier);
	}
	function ganador(b) {
		var q = b.stepQueue || [];
		for (var i = q.length - 1; i >= 0; i--) {
			var l = q[i];
			if (typeof l !== 'string') continue;
			if (l.indexOf('|win|') === 0) return l.slice(5);
			if (l.indexOf('|tie') === 0) return '';
		}
		return null;
	}
	function cambioElo(room) {
		var P = ps();
		var q = room.battle.stepQueue || [];
		var yo = P && P.user ? P.user.name : '';
		for (var i = q.length - 1; i >= 0; i--) {
			var l = q[i];
			if (typeof l !== 'string' || l.indexOf('rating:') < 0) continue;
			if (yo && l.indexOf(yo) < 0) continue;
			var m = /rating:\s*(\d+)\s*(?:&rarr;|→)\s*(?:<strong>)?(\d+)(?:<\/strong>)?[\s\S]*?\(([+-]?\d+)/.exec(l);
			if (m) return { antes: +m[1], despues: +m[2], cambio: +m[3] };
		}
		return null;
	}

	function nuevoCombate() {
		var room = salaCombate();
		if (!room) return;
		var fmt = formatoDeSala(room);
		cerrarSala(room);
		state.inicioOculto = false;
		irA('');
		toast('Finding another battle…', 1500);
		setTimeout(function () {
			ponerFormato(fmt);
			setTimeout(buscar, 350);
		}, 350);
	}

	function revancha() {
		var room = salaCombate();
		if (!room) return;
		var cont = salaEl(room);
		var b = cont && cont.querySelector('button[data-cmd^="/closeand /challenge"]');
		if (b) { b.click(); return; }
		try { room.send('/closeand /challenge ' + room.battle.farSide.id + ',' + formatoDeSala(room)); } catch (e) { /* nada */ }
	}

	function guardarRepeticion() {
		var room = salaCombate();
		if (!room) return;
		try { room.send('/savereplay'); } catch (e) { return; }
		toast('💾 Saving the replay…', 1800);
	}

	function cerrarSala(room) {
		try { room.send('/close'); } catch (e) {
			try { ps().leave(room.id); } catch (e2) { /* nada */ }
		}
	}

	function volverAlInicio() {
		var room = salaCombate();
		if (room) cerrarSala(room);
		state.inicioOculto = false;
		irA('');
	}

	/* ------------------------------------------------------------------ *
	 *  REPETICIONES (lista de las tuyas guardadas)
	 * ------------------------------------------------------------------ */
	function abrirRepes() {
		var P = ps();
		if (!P || !P.user || !P.user.named) { toast('Entra con tu usuario para ver tus repeticiones', 1800); return; }
		capas.repes.hidden = false;
		var lista = capas.repes.querySelector('.thor-lista');
		lista.innerHTML = '<div class="thor-aviso">Cargando tus repeticiones…</div>';
		clearCur();
		var user = P.user.userid;
		var urls = [
			'https://replay.pokemonshowdown.com/search.json?user=' + encodeURIComponent(user),
			'https://play.pokemonshowdown.com/api/replays/search.json?user=' + encodeURIComponent(user)
		];
		(function probar(i) {
			if (i >= urls.length) { lista.innerHTML = '<div class="thor-aviso">No se han podido cargar ahora mismo.</div>'; return; }
			fetch(urls[i]).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (t) {
				var datos = JSON.parse(t.replace(/^\]/, ''));
				pintarRepes(Array.isArray(datos) ? datos : []);
			}).catch(function () { probar(i + 1); });
		})(0);
	}
	function pintarRepes(datos) {
		var lista = capas.repes.querySelector('.thor-lista');
		lista.innerHTML = '';
		if (!datos.length) {
			lista.innerHTML = '<div class="thor-aviso">Aún no tienes repeticiones guardadas. Al acabar un combate, X la guarda.</div>';
			return;
		}
		datos.slice(0, 20).forEach(function (d) {
			var b = el('button', 'thor-repe');
			b.setAttribute('data-thor', 'repe');
			b.setAttribute('data-id', d.id);
			var fecha = d.uploadtime ? new Date(d.uploadtime * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';
			var jug = (d.players || [d.p1, d.p2]).filter(Boolean).join(' vs ');
			b.appendChild(el('span', 'thor-tag', '')).textContent = fecha || '·';
			var t = el('span');
			t.appendChild(el('b')).textContent = jug || d.id;
			t.appendChild(el('br'));
			t.appendChild(el('small')).textContent = (d.format || '') + (d.rating ? ' · Elo ' + d.rating : '');
			b.appendChild(t);
			lista.appendChild(b);
		});
		if (state.lastInput) setTimeout(function () { var p = lista.querySelector('.thor-repe'); if (p) setCur(p); }, 30);
	}
	function cerrarRepes() { capas.repes.hidden = true; clearCur(); }

	/* ------------------------------------------------------------------ *
	 *  ESCENARIOS (fase 4): cambian cada vez que abres la app
	 * ------------------------------------------------------------------ */
	var ESCENAS = {
		lluvia: { extra: 'con-lluvia', agua: true, icono: 'gota',
			pokes: ['lapras', 'vaporeon', 'milotic', 'kingdra', 'pelipper', 'politoed', 'swampert', 'gyarados', 'quagsire', 'lanturn'] },
		campo: { extra: 'con-sol', agua: false, icono: 'rayo',
			pokes: ['venusaur', 'meganium', 'leafeon', 'sceptile', 'torterra', 'tropius', 'flygon', 'ninetales', 'eevee', 'pikachu'] },
		atardecer: { extra: '', agua: true, icono: 'rayo',
			pokes: ['charizard', 'arcanine', 'talonflame', 'houndoom', 'blaziken', 'typhlosion', 'ninetales', 'rapidash'] },
		noche: { extra: 'con-estrellas', agua: true, icono: 'gota',
			pokes: ['umbreon', 'gengar', 'absol', 'mismagius', 'noctowl', 'lunatone', 'crobat', 'sableye'] }
	};
	function elegirEscena() {
		var nombres = Object.keys(ESCENAS);
		var antes = leer('thor_escena', '');
		var opciones = nombres.filter(function (n) { return n !== antes; });
		var e = opciones[Math.floor(Math.random() * opciones.length)];
		guardar('thor_escena', e);
		return e;
	}
	function dosAlAzar(lista) {
		var a = lista[Math.floor(Math.random() * lista.length)], b = a;
		while (b === a && lista.length > 1) b = lista[Math.floor(Math.random() * lista.length)];
		return [a, b];
	}
	function sprite(id, espalda) {
		var img = el('img');
		img.alt = '';
		var rutas = espalda ? ['ani-back/' + id + '.gif', 'gen5-back/' + id + '.png'] : ['ani/' + id + '.gif', 'gen5/' + id + '.png'];
		var i = 0;
		img.onerror = function () { i++; if (i < rutas.length) img.src = 'https://play.pokemonshowdown.com/sprites/' + rutas[i]; else img.style.display = 'none'; };
		img.src = 'https://play.pokemonshowdown.com/sprites/' + rutas[0];
		return img;
	}
	/** Escenario con cielo, suelo (agua o hierba), nubes, ondas y dos Pokémon en sus rocas. */
	function escenario(nombre, conPokes) {
		var e = ESCENAS[nombre] || ESCENAS.lluvia;
		var d = el('div', 'thor-esc ' + nombre + ' ' + e.extra, '<div class="cielo"></div><div class="nube n1"></div><div class="nube n2"></div><div class="suelo"></div>' +
			(e.agua ? '<div class="linea l1"></div><div class="linea l2"></div><div class="onda o1"></div><div class="onda o2"></div><div class="onda o3"></div>' : ''));
		if (conPokes) {
			var par = dosAlAzar(e.pokes);
			var lejos = el('div', 'roca2 lejos'), cerca = el('div', 'roca2 cerca');
			lejos.appendChild(sprite(par[0], false));
			cerca.appendChild(sprite(par[1], true));
			d.appendChild(lejos);
			d.appendChild(cerca);
		}
		return d;
	}
	function marcaHTML(icono) {
		var dentro = icono === 'rayo' ? '<path d="M55 24 37 55h13l-5 21 20-32H52z" fill="#e9b44c"/>' :
			'<path d="M50 29c7 10 12.5 16.5 12.5 23a12.5 12.5 0 0 1-25 0c0-6.5 5.5-13 12.5-23z" fill="#8cc4ff"/>';
		return '<div class="pk">POKÉMON</div><div class="sd">SH<span class="anillo"><svg viewBox="0 0 100 100" aria-hidden="true">' +
			'<circle cx="50" cy="50" r="37" fill="none" stroke="#eceef1" stroke-width="15"/>' + dentro + '</svg></span>WDOWN</div>' +
			'<div class="raya"></div><div class="ed">THOR EDITION</div>';
	}

	/* Sitio del inicio: cambia cada día; la luz, según la hora (fondos de Showdown). */
	var SITIOS = [
		{ n: 'BEACH', bg: 'beach' }, { n: 'MEADOW', bg: 'meadow' }, { n: 'ROUTE', bg: 'route' },
		{ n: 'FOREST', bg: 'forest' }, { n: 'RIVER', bg: 'river' }, { n: 'CITY', bg: 'city' },
		{ n: 'DESERT', bg: 'desert' }, { n: 'MOUNTAIN', bg: 'mountain' },
		{ n: 'ICE CAVE', bg: 'icecave', cueva: true }, { n: 'CAVE', bg: 'dampcave', cueva: true }
	];
	function sitioDeHoy() {
		var d = new Date();
		return SITIOS[Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) % SITIOS.length];
	}
	function luzAhora() {
		var h = new Date().getHours();
		if (h >= 8 && h < 18) return 'dia';
		if (h >= 18 && h < 21) return 'tarde';
		if (h >= 6 && h < 8) return 'alba';
		return 'noche';
	}
	var sitioT = 0;
	function mostrarSitio() {
		var e = capas.inicio && capas.inicio.querySelector('.thor-sitio');
		if (!e) return;
		e.classList.remove('se-va');
		e.classList.add('entra');
		clearTimeout(sitioT);
		sitioT = setTimeout(function () { e.classList.add('se-va'); }, 3000);
	}

	function cerrarTitulo() {
		if (!state.titulo) return;
		state.titulo = false;
		if (capas.titulo) capas.titulo.hidden = true;
		clearCur();
		pintar();
		enviarEstado(true);
	}

	/* ------------------------------------------------------------------ *
	 *  Pantallas propias: Inicio, Buscando rival, Fin de combate
	 *  (su aspecto está en el estilo, sección 13)
	 * ------------------------------------------------------------------ */
	var capas = {
		hecho: false,
		montar: function () {
			if (!document.body) return;
			if (!capas.hecho) capas.crear();
			['inicio', 'buscando', 'fin', 'repes', 'l1', 'titulo'].forEach(function (k) {
				if (!capas[k].isConnected) document.body.appendChild(capas[k]);
			});
		},
		crear: function () {
			capas.hecho = true;
			var sitio = sitioDeHoy();
			capas.inicio = el('div', 'thor-capa thor-luz-' + (sitio.cueva ? 'cueva' : luzAhora()), '' +
				'<div class="thor-ini-escena" style="background-image:url(https://play.pokemonshowdown.com/fx/bg-' + sitio.bg + '.png)"></div>' +
				'<div class="thor-ini-tinte"></div>' +
				'<div class="thor-sitio">' + sitio.n + '</div>' +
				'<div class="thor-marca thor-ini-logo">' + marcaHTML('rayo') + '</div>' +
				'<div class="thor-compa"><img alt="" src="https://play.pokemonshowdown.com/sprites/gen5ani-back/umbreon.gif"></div>' +
				'<div class="thor-caja">' +
				'  <div class="thor-hola"><span>Welcome back,</span><button class="thor-nombre-u" data-thor="usuario"></button></div>' +
				'  <div class="thor-formato"><button class="thor-flecha" data-thor="formato-prev" aria-label="Previous format">◀</button>' +
				'  <button class="thor-chip" data-thor="formato-lista"><small>FORMAT</small><b class="thor-f-nombre"></b></button>' +
				'  <button class="thor-flecha" data-thor="formato-next" aria-label="Next format">▶</button></div>' +
				'  <button class="thor-battle" data-thor="buscar"><span class="thor-letra">A</span><span><b class="thor-buscar-t">BATTLE!</b><small class="thor-equipo"></small></span></button>' +
				'  <div class="thor-menu">' +
				'    <button data-thor="equipos"><span class="thor-letra">X</span>TEAMBUILDER</button>' +
				'    <button data-thor="ladder">▶ LADDER</button>' +
				'    <button data-thor="watch">▶ WATCH</button>' +
				'    <button data-thor="torneos">▶ TOURNAMENTS</button>' +
				'  </div>' +
				'</div>' +
				'<div class="thor-pista"><span><b>A</b> Battle!</span><span><b>◀ ▶</b> Format</span><span><b>X</b> Teambuilder</span></div>');
			capas.inicio.id = 'thor-inicio';

			capas.buscando = el('div', 'thor-capa thor-lluvia', '' +
				'<h1 class="thor-titulo">SEARCHING…</h1>' +
				'<div class="thor-pastilla"><i class="thor-giro"></i><span class="thor-b-formato"></span><span class="thor-tiempo"></span></div>' +
				'<div class="thor-roca rival"><div class="thor-figura"></div><span class="thor-nombre">searching…</span></div>' +
				'<div class="thor-roca yo"><div class="thor-figura"><img alt=""></div><span class="thor-nombre"></span></div>' +
				'<button class="thor-btn thor-cancelar" data-thor="cancelar"><span class="thor-letra">B</span>CANCEL</button>');
			capas.buscando.id = 'thor-buscando';

			capas.fin = el('div', 'thor-capa', '' +
				'<div class="thor-etiqueta"><span class="thor-vs"></span><span class="thor-elo-c"></span></div>' +
				'<div class="thor-roca yo"><div class="thor-figura"><img alt=""></div><span class="thor-nombre"></span></div>' +
				'<div class="thor-dcha">' +
				'  <button class="thor-btn principal" data-thor="nuevo"><span class="thor-letra">A</span>NEW BATTLE</button>' +
				'  <button class="thor-btn" data-thor="revancha"><span class="thor-letra">Y</span>REMATCH</button>' +
				'  <button class="thor-btn" data-thor="guardar"><span class="thor-letra">X</span>SAVE REPLAY</button>' +
				'  <button class="thor-btn" data-thor="inicio"><span class="thor-letra">B</span>HOME</button>' +
				'</div>' +
				'<div class="thor-pie"><span>Select: view the battle</span></div>');
			capas.fin.id = 'thor-fin';

			capas.repes = el('div', 'thor-capa', '' +
				'<h2>REPLAYS</h2><div class="thor-lista"></div>' +
				'<div class="thor-pie"><span>A: watch the replay · B: back</span></div>');
			capas.repes.id = 'thor-repes';

			state.escena = elegirEscena();
			capas.titulo = el('div', 'thor-capa');
			capas.titulo.id = 'thor-titulo';
			capas.titulo.appendChild(escenario(state.escena, true));
			var marca = el('div', 'thor-marca', marcaHTML(ESCENAS[state.escena].icono));
			capas.titulo.appendChild(marca);
			var emp = el('button', 'thor-btn thor-empezar', '<span class="thor-letra">A</span>PRESS TO START');
			emp.setAttribute('data-thor', 'empezar');
			capas.titulo.appendChild(emp);
			capas.titulo.setAttribute('data-thor', 'empezar');

			capas.l1 = el('button', '', '<span class="thor-letra">X</span>SWITCH');
			capas.l1.id = 'thor-l1';
			capas.l1.setAttribute('data-thor', 'equipo');
			capas.l1.setAttribute('tabindex', '-1');

			['inicio', 'buscando', 'fin', 'repes', 'l1', 'titulo'].forEach(function (k) {
				capas[k].hidden = k !== 'titulo';
				capas[k].addEventListener('click', alTocarCapa);
			});
		}
	};

	/** Lo mismo que el mando, pero tocando la pantalla. */
	function alTocarCapa(ev) {
		var b = ev.target.closest && ev.target.closest('[data-thor]');
		ev.stopPropagation();
		if (!b) return;
		ev.preventDefault();
		accion(b.getAttribute('data-thor'), b);
	}

	function accion(que, elem) {
		switch (que) {
		case 'empezar': cerrarTitulo(); break;
		case 'buscar': buscar(); break;
		case 'equipos': irA('teambuilder'); break;
		case 'repes': abrirRepes(); break;
		case 'start': inicioOCombate(); break;
		case 'formato-prev': cambiarFormato(-1); break;
		case 'formato-next': cambiarFormato(1); break;
		case 'formato-lista': abrirListaFormatos(); break;
		case 'cancelar': cancelarBusqueda(); break;
		case 'equipo': abrirEquipo(); break;
		case 'nuevo': nuevoCombate(); break;
		case 'revancha': revancha(); break;
		case 'guardar': guardarRepeticion(); break;
		case 'inicio': volverAlInicio(); break;
		case 'ladder': irA('ladder'); break;
		case 'watch': irA('battles'); break;
		case 'torneos': irA('view-tournaments-all'); break;
		case 'usuario': irA('options'); break;
		case 'repe':
			cerrarRepes();
			irA('battle-' + elem.getAttribute('data-id'));
			break;
		}
		setTimeout(pintar, 30);
	}

	function avatarUrl(av) {
		try { if (typeof Dex !== 'undefined' && Dex.resolveAvatar) return Dex.resolveAvatar(String(av)); } catch (e) { /* nada */ }
		return 'https://play.pokemonshowdown.com/sprites/trainers/' + encodeURIComponent(av || 'lucas') + '.png';
	}
	function ponerImg(img, src) { if (img && src && img.getAttribute('src') !== src) img.setAttribute('src', src); }

	function pintarInicio(P) {
		var c = capas.inicio;
		var u = P.user || {};
		texto(c.querySelector('.thor-nombre-u'), u.named ? u.name : (u.name || 'Guest'));
		var id = formatoActual();
		texto(c.querySelector('.thor-f-nombre'), nombreFormato(id));
		texto(c.querySelector('.thor-equipo'), datosFormato(id) && datosFormato(id).team ? 'Random team' : 'Team: ' + nombreEquipo());
		texto(c.querySelector('.thor-buscar-t'), !u.named ? 'SIGN IN' : P.isOffline ? 'OFFLINE' : 'BATTLE!');
		if (!state.formatoRestaurado && botonFormato() && window.BattleFormats) {
			state.formatoRestaurado = true;
			var gu = leer('thor_formato', null);
			if (gu && gu !== formatoActual() && datosFormato(gu)) ponerFormato(gu);
			else ponerEquipoRecordado();
		}
	}

	function pintarBuscando(P) {
		var c = capas.buscando;
		var m = P.mainmenu;
		var f = '';
		try { f = (m.searchCountdown && m.searchCountdown.format) || m.searchingFormat() || ''; } catch (e) { /* nada */ }
		if (!state.busquedaDesde) state.busquedaDesde = Date.now();
		texto(c.querySelector('.thor-b-formato'), nombreFormato(toId(String(f).split('@@@')[0])));
		var cuenta = m.searchCountdown && m.searchCountdown.countdown;
		texto(c.querySelector('.thor-tiempo'), cuenta ? 'in ' + cuenta + '…' : mmss(Date.now() - state.busquedaDesde));
		var u = P.user || {};
		texto(c.querySelector('.yo .thor-nombre'), u.name || '');
		ponerImg(c.querySelector('.yo img'), avatarUrl(u.avatar));
	}

	function pintarFin(P, room) {
		var c = capas.fin;
		var b = room.battle;
		var g = ganador(b);
		var yo = P.user ? P.user.name : '';
		var gana = g !== null && g !== '' && toId(g) === toId(room.side && room.side.name || yo);
		c.classList.toggle('gana', gana);
		c.classList.toggle('pierde', g !== null && g !== '' && !gana);
		var rival = b.farSide && b.farSide.name || '?';
		texto(c.querySelector('.thor-vs'), 'vs ' + rival + ' · ' + (b.turn || 0) + ' turns');
		var elo = cambioElo(room);
		var e = c.querySelector('.thor-elo-c');
		texto(e, elo ? (elo.cambio >= 0 ? '+' : '') + elo.cambio + ' Elo' : '');
		e.className = 'thor-elo-c ' + (elo ? (elo.cambio >= 0 ? 'sube' : 'baja') : '');
		texto(c.querySelector('.yo .thor-nombre'), yo);
		ponerImg(c.querySelector('.yo img'), avatarUrl(P.user && P.user.avatar));
	}

	/** Decide qué pantalla toca según lo que esté pasando. */
	function contexto() {
		if (state.helpOpen) return 'ayuda';
		if (state.titulo) return 'titulo';
		if (capas.hecho && !capas.repes.hidden) return 'repes';
		if (popupScope()) return 'popup';
		if (state.inspect) return 'inspect';
		var P = ps();
		if (!P) return 'generico';
		var room = P.room;
		if (esCombate(room)) {
			var b = room.battle;
			if (room.side && b.ended && b.atQueueEnd) return state.finOculto ? 'fin-oculto' : 'fin';
			if (room.side && room.request && room.choices && b.atQueueEnd && !room.choices.isDone()) {
				var rt = room.request.requestType;
				if (rt === 'move') {
					if (room.choices.current && room.choices.current.move) return 'objetivo';
					if (room.overlayActive === 'switch') return 'cambio';
					return 'ataques';
				}
				if (rt === 'switch') return 'cambio-forzado';
				if (rt === 'team') return 'equipo-previo';
			}
			return 'combate';
		}
		if (room && room.id === '') {
			if (buscando()) return 'buscando';
			if (!state.inicioOculto) return 'inicio';
		}
		return 'generico';
	}

	/** El estilo está hecho para "Side-by-side, overlay controls": la app lo deja siempre puesto. */
	var diseñoPuesto = false;
	function ponerDiseno(P) {
		if (diseñoPuesto || !P.prefs || !P.prefs.set) return;
		diseñoPuesto = true;
		try { if (P.prefs.battlelayout !== 'side-by-side-overlay') P.prefs.set('battlelayout', 'side-by-side-overlay'); } catch (e) { /* nada */ }
	}

	/**
	 * Tamaño de la escena de combate. El estilo lo calcula con "unidades de
	 * contenedor", pero en el WebView de Android la sala medía 0 de alto y la
	 * escena desaparecía. Aquí se mide la sala de verdad y se pone --S a mano
	 * (misma fórmula que el estilo).
	 */
	var escalaInfo = '';
	function ajustarEscena(room) {
		var html = document.documentElement;
		var cont = salaEl(room);
		if (!cont || !cont.querySelector('.scrollable-battle-container')) return;
		var r = cont.getBoundingClientRect();
		var cs = getComputedStyle(html);
		var recorte = parseFloat(cs.getPropertyValue('--recorte')) || 0;
		var chatMin = parseFloat(cs.getPropertyValue('--chat-min')) || 0;
		var ancho = r.width > 50 ? r.width : innerWidth;
		var alto = Math.max(100, innerHeight - Math.max(0, r.top));
		var S = Math.min((ancho - chatMin) / (640 - 2 * recorte), alto / 360);
		S = Math.max(0.3, Math.round(S * 1000) / 1000);
		if (html.style.getPropertyValue('--S') !== String(S)) html.style.setProperty('--S', String(S));
		if (!html.classList.contains('thor-js')) html.classList.add('thor-js');
		escalaInfo = 'sala ' + Math.round(r.width) + '×' + Math.round(r.height) + ' · escena ×' + S;
	}

	function pintar() {
		var P = ps();
		if (!P || !document.body) return;
		mountUI();
		ponerDiseno(P);
		if (esCombate(P.room)) ajustarEscena(P.room);
		parchearBusqueda();
		var antes = state.ctx;
		var ctx = contexto();
		state.ctx = ctx;
		var room = P.room;
		var base = ctx === 'popup' || ctx === 'ayuda' || ctx === 'inspect' ? state.ctxBase || 'generico' : ctx;
		if (!(ctx === 'popup' || ctx === 'ayuda' || ctx === 'inspect')) state.ctxBase = ctx;

		if (capas.titulo.hidden === state.titulo) capas.titulo.hidden = !state.titulo;
		var verInicio = base === 'inicio', verBusca = base === 'buscando', verFin = base === 'fin';
		// al pasar a Buscando o al Fin de combate, abajo se ve esa pantalla (no la guía o el historial que dejaste)
		if (base !== state.baseAntes) {
			if ((base === 'buscando' || base === 'fin') && dos.fuera !== 'vista') dos.fuera = 'vista';
			state.baseAntes = base;
		}
		if (capas.inicio.hidden === verInicio) capas.inicio.hidden = !verInicio;
		if (capas.buscando.hidden === verBusca) capas.buscando.hidden = !verBusca;
		if (capas.fin.hidden === verFin) capas.fin.hidden = !verFin;
		try { cargarAyudaEquipos(); } catch (e) { /* nada */ }
		if (verInicio && capas.inicio.__visto !== true) mostrarSitio();
		capas.inicio.__visto = verInicio;
		if (verInicio) pintarInicio(P);
		if (verBusca) pintarBuscando(P);
		if (verFin) pintarFin(P, room);
		if (!verBusca && antes === 'buscando' && ctx !== 'popup') state.busquedaDesde = 0;

		if (esCombate(room)) {
			state.ultimaSalaCombate = room.id;
			if (room.battle.ended && room.side) alAcabar(room);
			if (room.request !== state.reqVisto) {          // turno nuevo: sin cursor (ataque directo)
				state.reqVisto = room.request;
				state.cursorOn = false;
				state.finOculto = false;
				if (state.cur && !state.inspect) clearCur();
			}
			if (ctx === 'ataques') {
				abrirAtaquesSolos(room);
				marcarEficacias(room);
				// modo cursor: el cursor siempre en los ataques
				if (state.modo === 'cursor' && !state.inspect && !(state.cur && currentValid() && state.cur.closest('.movemenu, .switchmenu'))) {
					var pm = firstVisible('.movemenu button.movebutton:not(.disabled)', salaEl(room));
					if (pm) setCur(pm);
				}
			}
			colocarL1(ctx === 'ataques' ? room : null);
			campo(room);
			if ((ctx === 'cambio-forzado' || ctx === 'equipo-previo' || ctx === 'objetivo' || ctx === 'cambio') &&
				state.lastInput && Date.now() - state.lastInput < IDLE_AUTOFOCUS && !currentValid()) {
				state.cursorOn = true;
				cursorEnCambios();
			}
		}
		if (!esCombate(room)) colocarL1(null);
		if (dos.hay) enviarEstado(false);
		else if (hayAbajo()) abajoCambia(true);
		if (antes !== ctx && !(ctx === 'popup' || ctx === 'ayuda' || ctx === 'inspect' || antes === 'popup' || antes === 'ayuda' || antes === 'inspect')) {
			if (CURSOR_A_DEMANDA[ctx]) state.cursorOn = false;
			if (state.cur && (!currentValid() || cursorDormido())) clearCur();
		}
	}

	/** Píldora táctil "L1 EQUIPO" en la fila de Tera, encima de los ataques. */
	function colocarL1(room) {
		var b = capas.l1;
		var box = room && salaEl(room) && salaEl(room).querySelector('.movemenu .megaevo-box');
		var r = box && shown(box.parentNode) ? box.getBoundingClientRect() : null;
		if (!r || r.width < 50) { if (!b.hidden) b.hidden = true; return; }
		if (b.hidden) b.hidden = false;
		var left = Math.round(r.left) + 'px', top = Math.round(r.top + Math.max(0, (r.height - 26) / 2)) + 'px';
		if (b.style.left !== left) b.style.left = left;
		if (b.style.top !== top) b.style.top = top;
	}

	/* ------------------------------------------------------------------ *
	 *  ESTADO DEL CAMPO (v3): clima, terreno, Trick Room... a la izquierda
	 *  y las trampas / pantallas de cada lado junto a su Pokémon, con turnos.
	 * ------------------------------------------------------------------ */
	var TRAMPAS = { stealthrock: 1, spikes: 1, toxicspikes: 1, stickyweb: 1, gmaxsteelsurge: 1 };
	var ICONO = {
		clima: '<svg viewBox="0 0 16 16"><path d="M4.5 11a3 3 0 0 1 .3-6A4 4 0 0 1 12.5 6a2.5 2.5 0 0 1 0 5z" fill="currentColor"/></svg>',
		sol: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3.2" fill="currentColor"/><path d="M8 1v2.2M8 12.8V15M1 8h2.2M12.8 8H15M3 3l1.6 1.6M11.4 11.4 13 13M3 13l1.6-1.6M11.4 4.6 13 3" stroke="currentColor" stroke-width="1.6"/></svg>',
		campo: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
		trampa: '<svg viewBox="0 0 16 16"><path d="M1 14 6 5l3 5 2-3 4 7z" fill="currentColor"/></svg>',
		pantalla: '<svg viewBox="0 0 16 16"><path d="M8 1.5 14 4v4.2c0 3.2-2.5 5.6-6 6.3-3.5-.7-6-3.1-6-6.3V4z" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
	};
	function escH(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
	function turnosTxt(min, max) { if (!min && max) { min = max; max = 0; } return min ? ' · ' + min : ''; }
	function chipCampo(icono, t, clase) { return '<span class="sd-chip ' + clase + '">' + (ICONO[icono] || '') + '<span>' + escH(t) + '</span></span>'; }
	function campo(room) {
		var cont = salaEl(room);
		var battleEl = cont && cont.querySelector('.battle');
		if (!battleEl) return;
		var b = room.battle, izq = '', rival = '', yo = '';
		try {
			if (b.weather && !(b.abilityActive && b.abilityActive(['Air Lock', 'Cloud Nine']))) {
				var nombre = b.weather;
				try { if (window.BattleTextParser) nombre = BattleTextParser.weatherName(b.weather); } catch (e) { /* nada */ }
				izq += chipCampo(/sun|desolate/.test(b.weather) ? 'sol' : 'clima', nombre + (b.weatherMinTimeLeft ? ' · ' + b.weatherMinTimeLeft : b.weatherTimeLeft ? ' · ' + b.weatherTimeLeft : ''), 'sd-c-clima');
			}
			(b.pseudoWeather || []).forEach(function (w) {
				izq += chipCampo('campo', w[0] + turnosTxt(w[1], w[2]), /terrain/i.test(w[0]) ? 'sd-c-terreno' : 'sd-c-campo');
			});
			[b.farSide, b.nearSide].forEach(function (side, n) {
				if (!side || !side.sideConditions) return;
				var h = '';
				for (var id in side.sideConditions) {
					var c = side.sideConditions[id];
					var trampa = !!TRAMPAS[id];
					h += chipCampo(trampa ? 'trampa' : 'pantalla', c[0] + (c[1] > 1 ? ' ×' + c[1] : '') + turnosTxt(c[2], c[3]), trampa ? 'sd-c-trampa' : 'sd-c-pantalla');
				}
				if (n === 0) rival = h; else yo = h;
			});
		} catch (e) { /* nada */ }
		// clima animado sobre la escena
		var w = b.weather || '';
		var clima = /rain|primordial/.test(w) ? 'lluvia' : /sand/.test(w) ? 'arena' : /snow|hail/.test(w) ? 'nieve' : /sun|desolate/.test(w) ? 'sol' : '';
		if (clima) battleEl.setAttribute('data-sd-clima', clima); else battleEl.removeAttribute('data-sd-clima');
		if (clima && !battleEl.querySelector(':scope > .sd-clima-fx')) battleEl.appendChild(el('div', 'sd-clima-fx'));
		var cajas = { 'sd-campo': izq, 'sd-lado-rival': rival, 'sd-lado-yo': yo };
		for (var k in cajas) {
			var e2 = battleEl.querySelector(':scope > .' + k);
			if (!e2) { e2 = el('div', k); battleEl.appendChild(e2); }
			if (e2.__h !== cajas[k]) { e2.innerHTML = cajas[k]; e2.__h = cajas[k]; }
		}
	}


	/* ------------------------------------------------------------------ *
	 *  RESUMEN DEL TURNO "en una línea" (va a la pantalla de abajo)
	 * ------------------------------------------------------------------ */
	function clave(ident) { return String(ident || '').replace(/^(p\d)[a-z]?: */, '$1: '); }
	function lado(ident) { return String(ident || '').slice(0, 2); }
	function nombreDe(ident) { return String(ident || '').replace(/^p\d[a-z]?: */, ''); }
	function pctHP(txt) {
		var t = String(txt || '');
		if (/fnt/.test(t) && /^0/.test(t)) return 0;
		var m = /^(\d+)(?:\/(\d+))?/.exec(t);
		if (!m) return null;
		return m[2] ? 100 * (+m[1]) / (+m[2]) : +m[1];
	}
	function resumenTurno(room) {
		var b = room.battle;
		var q = b.stepQueue || [];
		var hasta = Math.min(q.length, typeof b.currentStep === 'number' && b.currentStep > 0 ? b.currentStep : q.length);
		var mio = (room.side && room.side.id) || (b.nearSide && b.nearSide.sideid) || 'p1';
		var turnos = [];
		for (var i = 0; i < hasta; i++) if (q[i].indexOf('|turn|') === 0) turnos.push(i);
		if (turnos.length < 2) return null;
		var desde = turnos[turnos.length - 2], fin = turnos[turnos.length - 1];
		var numero = +q[desde].split('|')[2] || 0;
		var vida = {};
		var trozos = [], accion = null;
		function cerrar() { if (accion) { trozos.push(accion); accion = null; } }
		for (var j = 0; j < fin; j++) {
			var p = q[j].split('|');
			var tipo = p[1], k = clave(p[2]);
			var enTurno = j > desde;
			if (tipo === 'switch' || tipo === 'drag' || tipo === 'replace') {
				var v = pctHP(p[4]);
				if (v !== null) vida[k] = v;
				if (enTurno && tipo !== 'replace') {
					cerrar();
					trozos.push({ cambio: true, mio: lado(p[2]) === mio, quien: nombreDe(p[2]) });
				}
				continue;
			}
			if (tipo === '-damage' || tipo === '-heal' || tipo === '-sethp') {
				var antes = vida[k], ahora = pctHP(p[3]);
				if (ahora !== null) vida[k] = ahora;
				if (enTurno && accion && tipo === '-damage' && !p[4] && antes !== undefined && ahora !== null) {
					var d = Math.round(antes - ahora);
					if (d > 0) accion.danos.push({ quien: nombreDe(p[2]), d: d, mio: lado(p[2]) === mio });
				}
				continue;
			}
			if (!enTurno) continue;
			if (tipo === 'move') {
				cerrar();
				accion = { mov: p[3], mio: lado(p[2]) === mio, quien: nombreDe(p[2]), danos: [], extra: '' };
			} else if (accion && (tipo === '-immune')) accion.extra = 'inmune';
			else if (accion && tipo === '-miss') accion.extra = 'missed';
			else if (accion && tipo === '-fail' && !accion.danos.length) accion.extra = 'failed';
			else if (tipo === 'faint' && accion) {
				accion.ko = (accion.ko || []).concat(nombreDe(p[2]));
			}
		}
		cerrar();
		if (!trozos.length) return null;
		var partes = trozos.map(function (t) {
			if (t.cambio) return t.mio ? 'you switch to <b>' + escH(t.quien) + '</b>' : 'they send out <b>' + escH(t.quien) + '</b>';
			var h = (t.mio ? 'your ' : 'their ') + '<b>' + escH(t.mov) + '</b>';
			if (t.extra === 'inmune') h += ' had no effect';
			else if (t.extra) h += ' ' + t.extra;
			else if (t.danos.length) {
				h += ' → ' + t.danos.map(function (x) {
					return escH(x.quien) + ' <em class="' + (x.mio ? 'v6-malo' : 'v6-bueno') + '">−' + x.d + '%</em>';
				}).join(', ');
			}
			if (t.ko) h += ' <em class="v6-ko">KO</em>';
			return h;
		});
		var html = partes.join(' · ');
		return { n: numero, html: html.charAt(0).toUpperCase() + html.slice(1) };
	}

	/* ------------------------------------------------------------------ *
	 *  AYUDA DEL EQUIPO: en el Teambuilder se carga web/equipos.user.js
	 *  (resumen, completar y velocidades). Igual en el móvil y en la Thor.
	 * ------------------------------------------------------------------ */
	var ayudaEquipos = { estado: 'nada' };
	function cargarAyudaEquipos() {
		var P = window.PS;
		if (window.__sdEquipos || ayudaEquipos.estado !== 'nada' || !P || !P.room) return;
		if (String(P.room.id).indexOf('team') !== 0) return;
		ayudaEquipos.estado = 'cargando';
		var url = 'https://raw.githubusercontent.com/Davitt3054/Showdown-thor/main/web/equipos.user.js?v=' + Math.floor(Date.now() / 600000);
		fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
			.then(function (t) { new Function(t)(); ayudaEquipos.estado = 'listo'; })
			.catch(function () { ayudaEquipos.estado = 'nada'; });
	}

	/* ------------------------------------------------------------------ *
	 *  Pantalla siempre encendida (Screen Wake Lock)
	 * ------------------------------------------------------------------ */
	var wake = {
		lock: null, pending: false, lastTry: 0, error: '',
		text: function () {
			if (!navigator.wakeLock) return 'no disponible en este navegador';
			if (wake.lock) return 'sí';
			if (Date.now() - state.lastActivity > WAKE_IDLE) return 'en reposo (se vuelve a activar al tocar)';
			return wake.error ? 'no (' + wake.error + ')' : 'pendiente';
		}
	};
	function wakeRequest() {
		if (!navigator.wakeLock || !navigator.wakeLock.request) return;
		if (wake.lock || wake.pending) return;
		if (document.visibilityState !== 'visible') return;
		if (Date.now() - state.lastActivity > WAKE_IDLE) return;
		if (Date.now() - wake.lastTry < 4000) return;
		wake.lastTry = Date.now();
		wake.pending = true;
		try {
			navigator.wakeLock.request('screen').then(function (l) {
				wake.pending = false;
				wake.error = '';
				wake.lock = l;
				l.addEventListener('release', function () { if (wake.lock === l) wake.lock = null; });
			}, function (err) {
				wake.pending = false;
				wake.error = (err && err.name) || 'rechazado';
			});
		} catch (e) { wake.pending = false; wake.error = 'error'; }
	}
	function wakeRelease() {
		var l = wake.lock;
		wake.lock = null;
		if (l) { try { l.release(); } catch (e) { /* nada */ } }
	}
	function activity() {
		state.lastActivity = Date.now();
		if (!wake.lock) wakeRequest();
	}
	document.addEventListener('visibilitychange', function () {
		if (document.visibilityState === 'visible') { wake.lastTry = 0; wakeRequest(); }
	});
	setInterval(function () {
		if (wake.lock && Date.now() - state.lastActivity > WAKE_IDLE) wakeRelease();
		else if (!wake.lock) wakeRequest();
	}, 30000);
	wakeRequest();

	function scrollLog(amount) {
		var target = null;
		var logs = document.querySelectorAll('.battle-log, .battle-log-add, .chat-log, .ps-room .scrollable, .pm-log, .thor-lista');
		for (var i = 0; i < logs.length; i++) {
			if (!shown(logs[i])) continue;
			if (logs[i].scrollHeight > logs[i].clientHeight + 2) { target = logs[i]; break; }
		}
		if (!target) return;
		target.scrollTop += amount;
	}

	/* ------------------------------------------------------------------ *
	 *  FASE 3: PANTALLA DE ABAJO (calculadora, rival, equipo, chat)
	 *  La app abre abajo.html en la segunda pantalla. Este script le manda
	 *  lo que pasa (una "foto" del combate) y recibe lo que tocas allí.
	 * ------------------------------------------------------------------ */
	var PESTANAS = ['calc', 'rival', 'equipo', 'chat', 'guia'];
	var dos = { hay: false, ultimo: '', enviadoEn: 0, pestana: leer('thor_pestana', 'calc'), fuera: 'vista', l2: false, reset: 0, scroll: 0, scrollEn: 0 };
	function enCombateJugando() { var P = ps(); return !!(P && esCombate(P.room) && !(state.ctxBase === 'fin' || state.ctxBase === 'fin-oculto')); }

	function hayAbajo() { try { return !!(window.ThorDos && window.ThorDos.hayAbajo()); } catch (e) { return false; } }
	function enviarAbajo(obj) { try { window.ThorDos.enviar(JSON.stringify(obj)); } catch (e) { /* nada */ } }

	function abajoCambia(hay) {
		dos.hay = !!hay;
		dos.ultimo = '';
		document.documentElement.classList.toggle('thor-dos', dos.hay);
		enviarEstado(true);
	}

	function cambiarPestana(delta) {
		if (!enCombateJugando()) {          // fuera del combate: Inicio / Buscando / Resumen → Historial → Guía
			var fuera = ['vista', 'historial', 'guia'];
			dos.fuera = fuera[(fuera.indexOf(dos.fuera) + delta + fuera.length) % fuera.length];
			enviarEstado(true);
			return;
		}
		var i = PESTANAS.indexOf(dos.pestana);
		dos.pestana = PESTANAS[(i + delta + PESTANAS.length) % PESTANAS.length];
		guardar('thor_pestana', dos.pestana);
		enviarEstado(true);
	}

	/** Mensajes que llegan de la pantalla de abajo. */
	function recibe(json) {
		var m;
		try { m = JSON.parse(json); } catch (e) { return; }
		if (!m) return;
		if (m.listo) { dos.hay = true; document.documentElement.classList.add('thor-dos'); dos.ultimo = ''; enviarEstado(true); }
		if (m.pestana === 'vista' || m.pestana === 'historial' || (m.pestana === 'guia' && !enCombateJugando())) { dos.fuera = m.pestana; enviarEstado(true); }
		else if (m.pestana && PESTANAS.indexOf(m.pestana) >= 0) { dos.pestana = m.pestana; guardar('thor_pestana', dos.pestana); enviarEstado(true); }
		if (typeof m.chat === 'string' && m.chat.trim()) {
			var P = ps();
			var room = P && P.room;
			if (room && room.send && room.id !== '') {
				try { room.send(m.chat.trim()); toast('💬 Sent', 900); } catch (e) { /* nada */ }
			} else toast('Open a battle to write in its chat', 1600);
		}
		if (m.accion) accion(m.accion);
		if (m.restablecer) { dos.reset++; enviarEstado(true); toast('Calculadora restablecida', 1200); }
		if (typeof m.nota === 'string' && m.id) { guardarNota(m.id, m.nota); dos.ultimo = ''; enviarEstado(true); }
	}

	function hpPct(p) {
		if (!p || !p.maxhp) return 0;
		return Math.max(0, Math.min(100, Math.round(p.hp / p.maxhp * 1000) / 10));
	}

	function datosCombate(room) {
		var b = room.battle;
		var req = room.request;
		var ch = room.choices;
		var mios = (req && req.side && req.side.pokemon) || b.myPokemon || [];
		var idx = 0;
		try { idx = ch ? ch.index() : 0; } catch (e) { /* nada */ }
		// (cuando ya has elegido, Showdown apunta al "siguiente" hueco, que en individuales no existe)
		var activosYo = (b.nearSide && b.nearSide.active) || [];
		var activoYo = activosYo[Math.min(idx, activosYo.length - 1)] || activosYo.filter(Boolean)[0];
		var activoRival = b.farSide && b.farSide.active.filter(Boolean)[0];
		var moveReq = null;
		try { moveReq = ch && req && req.requestType === 'move' && ch.currentMoveRequest(); } catch (e) { moveReq = null; }

		var marcado = -1;
		if (state.cursorOn && state.cur && state.cur.matches('.movebutton')) {
			var mm = /^\/move (\d)/.exec(state.cur.getAttribute('data-cmd') || '');
			if (mm) marcado = +mm[1] - 1;
		}
		var lado = function (side) {
			return (side.pokemon || []).map(function (p) {
				return {
					especie: p.speciesForme || p.species, nombre: p.name, nivel: p.level || 100,
					hp: hpPct(p), estado: p.status || '', objeto: p.item || '', habilidad: p.ability || p.baseAbility || '',
					movs: (p.moveTrack || []).map(function (t) { return t[0]; }),
					tera: p.terastallized || '', activo: side.active.indexOf(p) >= 0, debilitado: !!p.fainted,
					boosts: p.boosts || {}, tipos: (function () { try { return p.getTypeList(); } catch (e) { return []; } })()
				};
			});
		};
		var resumenT = null;
		try { resumenT = resumenTurno(room); } catch (e) { resumenT = null; }
		return {
			resumen: resumenT,
			gen: b.gen, formato: formatoDeSala(room), turno: b.turn || 0,
			clima: b.weather || '', terreno: (b.pseudoWeather || []).map(function (w) { return w[0]; }),
			eligiendo: !!(ch && req && !ch.isDone() && b.atQueueEnd),
			marcado: marcado, tera: !!(ch && ch.current && ch.current.tera),
			puedeTera: moveReq && moveReq.canTerastallize || '',
			ataques: moveReq ? moveReq.moves.map(function (m, i) {
				var md = null;
				try { md = b.dex.moves.get(m.id || m.move); } catch (e) { md = null; }
				var btn = salaEl(room) && salaEl(room).querySelector('.movemenu button.movebutton[data-cmd^="/move ' + (i + 1) + '"]');
				var visible = btn && btn.firstChild && btn.firstChild.nodeType === 3 ? btn.firstChild.nodeValue.trim() : '';
				return {
					nombre: visible || m.name || m.move, id: m.id, pp: m.pp, maxpp: m.maxpp, desactivado: !!m.disabled,
					tipo: md && md.type || '', categoria: md && md.category || '', efecto: efectoEstado(md)
				};
			}) : [],
			yo: {
				nombre: b.nearSide.name,
				equipo: mios.map(function (sp) {
					return {
						especie: sp.speciesForme, nombre: sp.name, nivel: sp.level || 100,
						hp: sp.hp, hpmax: sp.maxhp, estado: sp.status || '', debilitado: !!sp.fainted, activo: !!sp.active,
						objeto: sp.item || '', habilidad: sp.ability || sp.baseAbility || '', stats: sp.stats || {},
						movs: sp.moves || [], teraTipo: sp.teraType || '', tera: sp.terastallized || ''
					};
				}),
				boosts: activoYo && activoYo.boosts || {},
				ladoActivo: activoYo ? { especie: activoYo.speciesForme, tera: activoYo.terastallized || '' } : null
			},
			rival: {
				nombre: b.farSide.name, total: b.farSide.totalPokemon || 6,
				equipo: lado(b.farSide),
				activo: activoRival ? activoRival.speciesForme : ''
			},
			chat: lineasChat(room)
		};
	}

	var STAT_ES = { atk: 'At.', def: 'Def.', spa: 'At. Esp.', spd: 'Def. Esp.', spe: 'Vel.', accuracy: 'Prec.', evasion: 'Evas.' };
	var ESTADO_ES = { brn: 'quema', par: 'paraliza', slp: 'duerme', frz: 'congela', psn: 'envenena', tox: 'envenena mucho' };
	var STAT_EN = { 'attack': 'At.', 'defense': 'Def.', 'sp. atk': 'At. Esp.', 'sp. def': 'Def. Esp.', 'speed': 'Vel.',
		'special attack': 'At. Esp.', 'special defense': 'Def. Esp.', 'accuracy': 'Prec.', 'evasiveness': 'Evas.' };
	/** Cuando Showdown no trae los datos del ataque: se saca de su descripción corta (en inglés). */
	function efectoPorTexto(d) {
		var m;
		d = String(d || '');
		if ((m = /raises the user's (.+?) by (\d)/i.exec(d))) {
			return m[1].split(/,\s*(?:and\s+)?|\s+and\s+/).map(function (x) {
				return '+' + m[2] + ' ' + (STAT_EN[x.trim().toLowerCase()] || x.trim());
			}).join(' ');
		}
		if ((m = /lowers the target's (.+?) by (\d)/i.exec(d))) return 'rival −' + m[2] + ' ' + (STAT_EN[m[1].toLowerCase()] || m[1]);
		if ((m = /heals the user by (\d+)%/i.exec(d))) return '+' + m[1] + ' % PS';
		if (/heals the user/i.test(d)) return '+PS';
		if (/protects|prevents moves from affecting the user/i.test(d)) return 'protege';
		if (/burns/i.test(d)) return 'quema';
		if (/paralyzes/i.test(d)) return 'paraliza';
		if (/badly poisons|poisons/i.test(d)) return 'envenena';
		if (/sleep/i.test(d)) return 'duerme';
		if (/switch/i.test(d)) return 'y cambia';
		return '—';
	}

	/** Qué hace un ataque de estado ("+2 At. Esp.", "+50 % PS"...). */
	function efectoEstado(md) {
		if (!md || md.category !== 'Status') return '';
		var t = [];
		var bo = (md.target === 'self' || md.target === 'allySide' || md.target === 'adjacentAllyOrSelf') && md.boosts || (md.self && md.self.boosts);
		if (bo) for (var k in bo) t.push((bo[k] > 0 ? '+' : '') + bo[k] + ' ' + (STAT_ES[k] || k));
		else if (md.boosts) for (var k2 in md.boosts) t.push('rival ' + (md.boosts[k2] > 0 ? '+' : '') + md.boosts[k2] + ' ' + (STAT_ES[k2] || k2));
		if (md.heal) t.push('+' + Math.round(md.heal[0] / md.heal[1] * 100) + ' % PS');
		if (md.status) t.push(ESTADO_ES[md.status] || md.status);
		if (md.sideCondition) t.push(md.name);
		if (md.weather) t.push('clima');
		if (!t.length) t.push(efectoPorTexto(md.shortDesc || md.desc || ''));
		return t.join(' · ');
	}

	/** Últimas líneas del registro del combate (como las pinta Showdown). */
	function lineasChat(room) {
		var cont = salaEl(room);
		var log = cont && cont.querySelector('.battle-log .inner, .battle-log .message-log');
		if (!log) return [];
		var out = [];
		var hijos = log.children;
		var jugadores = [room.battle.nearSide && room.battle.nearSide.name, room.battle.farSide && room.battle.farSide.name].map(toId);
		var misNombres = ((room.battle.nearSide && room.battle.nearSide.pokemon) || []).map(function (p) { return p.name; }).filter(Boolean);
		for (var i = Math.max(0, hijos.length - 60); i < hijos.length; i++) {
			var h = hijos[i];
			var t = (h.textContent || '').replace(/\s+/g, ' ').trim();
			if (!t) continue;
			var tipo = 'msg', quien = '';
			if (h.matches('h2, .battle-history h2') || h.querySelector && h.querySelector('h2')) tipo = 'turno';
			if (h.classList.contains('chat') || h.querySelector('.username')) {
				tipo = 'chat';
				var u = h.querySelector('.username');
				quien = u ? (u.getAttribute('data-name') || u.textContent || '').replace(/^[\s+%@#&~*]+/, '').replace(/:$/, '') : '';
				var k = quien ? t.indexOf(quien + ':') : -1;
				if (k >= 0 && k < 4) t = t.slice(k + quien.length + 1).trim();
			}
			var lado = '';
			if (tipo === 'msg' && / (used|usó) /.test(t)) {
				if (/^(The opposing|El .* rival|La .* rival)/.test(t)) lado = 'rival';
				else if (misNombres.some(function (n) { return t.indexOf(n + ' used ') === 0 || t.indexOf(n + ' usó ') === 0; })) lado = 'mio';
			}
			out.push({ lado: lado, tipo: tipo, quien: quien, jugador: !!quien && jugadores.indexOf(toId(quien)) >= 0, texto: t.slice(0, 300) });
		}
		return out;
	}

	/** KOs de cada uno de tus Pokémon (leyendo el registro del combate). */
	function resumenFin(room) {
		var b = room.battle;
		var mi = room.side && room.side.id || (b.nearSide && b.nearSide.sideid) || 'p1';
		var kos = {}, ultimo = '';
		(b.stepQueue || []).forEach(function (l) {
			if (typeof l !== 'string') return;
			var p = l.split('|');
			if (p[1] === 'move') ultimo = p[2] || '';
			if (p[1] === 'faint' && p[2] && p[2].indexOf(mi) !== 0 && ultimo.indexOf(mi) === 0) {
				var n = ultimo.split(': ')[1];
				kos[n] = (kos[n] || 0) + 1;
			}
		});
		return (b.nearSide.pokemon || []).map(function (p) {
			return { especie: p.speciesForme, nombre: p.name, kos: kos[p.name] || 0, hp: p.fainted ? 0 : hpPct(p), debilitado: !!p.fainted };
		});
	}

	/** Se apunta cada combate acabado (para "Últimos combates" en el Inicio). */
	/** Del registro del combate: con qué salió el rival y qué Pokémon suyo te quitó más vida. */
	function analizarCombate(room) {
		var b = room.battle;
		var mi = room.side && room.side.id || 'p1';
		var especie = {}, vida = {}, dano = {}, lead = '', ultimoRival = '';
		(b.stepQueue || []).forEach(function (l) {
			if (typeof l !== 'string') return;
			var p = l.split('|');
			var quien = p[2] || '', lado = quien.slice(0, 2);
			if (p[1] === 'switch' || p[1] === 'drag' || p[1] === 'replace') {
				var esp = (p[3] || '').split(',')[0];
				especie[quien.replace(/^(p\d)[a-z]?:/, '$1:')] = esp;
				if (lado !== mi && !lead) lead = esp;
				var hp = /^(\d+)\/(\d+)/.exec(p[4] || '');
				if (hp && lado === mi) vida[quien.replace(/^(p\d)[a-z]?:/, '$1:')] = { hp: +hp[1], max: +hp[2] };
			}
			if (p[1] === 'move' && lado && lado !== mi) ultimoRival = especie[quien.replace(/^(p\d)[a-z]?:/, '$1:')] || '';
			if (p[1] === '-damage' && lado === mi && !p[4]) {           // sin "[from]": daño de un ataque
				var clave = quien.replace(/^(p\d)[a-z]?:/, '$1:');
				var v = vida[clave];
				var ahora = /^(\d+)(?:\/(\d+))?/.exec(p[3] || '');
				if (v && ahora && ultimoRival) {
					var nuevo = +ahora[1];
					var perdido = Math.max(0, (v.hp - nuevo) / v.max * 100);
					dano[ultimoRival] = (dano[ultimoRival] || 0) + perdido;
					v.hp = nuevo;
				}
			}
			if ((p[1] === '-heal' || p[1] === '-sethp') && lado === mi) {
				var vv = vida[quien.replace(/^(p\d)[a-z]?:/, '$1:')];
				var hh = /^(\d+)/.exec(p[3] || '');
				if (vv && hh) vv.hp = +hh[1];
			}
		});
		var mas = '', max = 0;
		for (var k in dano) if (dano[k] > max) { max = dano[k]; mas = k; }
		return { lead: lead, masDanino: mas };
	}

	/** Enlace a la repetición (se guarda sola al acabar; los combates normales tienen siempre este enlace). */
	function enlaceRepeticion(room) { return 'https://replay.pokemonshowdown.com/' + room.id.replace(/^battle-/, ''); }

	/** Al acabar un combate: guarda la repetición en Showdown sin ventanas y lo apunta en el historial. */
	function alAcabar(room) {
		if (!room || !room.side || !room.battle || !room.battle.ended) return;
		var guardadas = leer('thor_rep_guardadas', []);
		if (guardadas.indexOf(room.id) < 0) {
			try { room.send('/savereplay silent'); } catch (e) { /* nada */ }
			guardadas.unshift(room.id);
			guardar('thor_rep_guardadas', guardadas.slice(0, 300));
		}
		apuntarHistorial(room);
	}

	/** Se apunta cada combate acabado (Inicio: últimos combates · pestaña Historial: todos). */
	function apuntarHistorial(room) {
		var b = room.battle;
		var g = ganador(b);
		if (g === null) return;
		var h = leer('thor_historial', []);
		var e = null;
		for (var i = 0; i < h.length; i++) if (h[i].id === room.id) e = h[i];
		var elo = cambioElo(room);
		var yo = room.side && room.side.name || (ps() && ps().user.name);
		var tipoComun = function (side) {
			var cuenta = {}, n = 0;
			(side.pokemon || []).forEach(function (p) {
				n++;
				try { p.getTypeList().forEach(function (t) { cuenta[t] = (cuenta[t] || 0) + 1; }); } catch (err) { /* nada */ }
			});
			for (var t in cuenta) if (n > 1 && cuenta[t] === n) return t;
			return '';
		};
		var an = analizarCombate(room);
		var nuevo = {
			id: room.id, fecha: e ? e.fecha : Date.now(), formato: formatoDeSala(room), formatoNombre: nombreFormato(formatoDeSala(room)),
			gana: g === '' ? null : toId(g) === toId(yo), rival: b.farSide.name, turnos: b.turn || 0,
			elo: elo ? elo.cambio : (e ? e.elo : null), eloDespues: elo ? elo.despues : (e ? e.eloDespues : null),
			miTipo: tipoComun(b.nearSide), suTipo: tipoComun(b.farSide),
			leadRival: an.lead, masDanino: an.masDanino,
			replay: enlaceRepeticion(room), nota: e && e.nota || ''
		};
		if (e && JSON.stringify(e) === JSON.stringify(nuevo)) return;
		if (e) h[h.indexOf(e)] = nuevo; else h.unshift(nuevo);
		guardar('thor_historial', h.slice(0, 300));
	}

	/** La frase de "por qué ganaste o perdiste" que escribes abajo al acabar. */
	function guardarNota(id, texto) {
		var h = leer('thor_historial', []);
		for (var i = 0; i < h.length; i++) {
			if (h[i].id === id) { h[i].nota = String(texto || '').slice(0, 300); guardar('thor_historial', h); toast('📝 Note saved', 1200); return; }
		}
	}

	function equipoBuscando() {
		var P = ps();
		var f = datosFormato(formatoActual());
		if (f && f.team) return { aleatorio: true, equipo: [] };
		var b = botonEquipo();
		var t = b && P && P.teams && P.teams.byKey && P.teams.byKey[b.value];
		var especies = [];
		if (t && t.packedTeam) {
			t.packedTeam.split(']').forEach(function (pk) {
				var c = pk.split('|');
				var sp = c[1] || c[0];
				if (sp) especies.push(sp);
			});
		}
		return { aleatorio: false, nombre: t ? t.name : '', equipo: especies };
	}

	function instantanea() {
		var P = ps();
		if (!P) return null;
		var room = P.room;
		var base = state.ctxBase || state.ctx;
		if (state.titulo) {
			var ut = P.user || {};
			return { v: 1, pantalla: 'titulo', escena: state.escena, reset: dos.reset, pestana: dos.pestana,
				usuario: { nombre: ut.named ? ut.name : '', avatar: ut.named ? avatarUrl(ut.avatar) : '' } };
		}
		var pantalla = base === 'inicio' ? 'inicio' : base === 'buscando' ? 'buscando' :
			(base === 'fin' || base === 'fin-oculto') ? 'fin' : esCombate(room) && room.side ? 'combate' :
			esCombate(room) ? 'combate' : 'otro';
		var u = P.user || {};
		var foto = {
			v: 1, pantalla: pantalla, l2: dos.l2, reset: dos.reset,
			pestana: pantalla === 'combate' ? dos.pestana : (dos.fuera === 'guia' || dos.fuera === 'historial' ? dos.fuera : 'vista'),
			usuario: { nombre: u.named ? u.name : '', avatar: u.named ? avatarUrl(u.avatar) : '' }
		};
		if (pantalla === 'inicio' || pantalla === 'otro') foto.historial = leer('thor_historial', []).slice(0, 8);
		if (pantalla === 'inicio') {
			var fid = formatoActual(), fd = datosFormato(fid);
			foto.inicio = { formato: nombreFormato(fid), aleatorio: !!(fd && fd.team), equipo: nombreEquipo(),
				conectado: !P.isOffline, nombre: u.named ? u.name : (u.name || 'Guest'), registrado: !!u.named };
		}
		if (foto.pestana === 'historial') foto.historial = leer('thor_historial', []);
		if (pantalla === 'buscando') {
			var eb = equipoBuscando();
			foto.buscando = { formato: nombreFormato(formatoActual()), aleatorio: eb.aleatorio, equipo: eb.equipo, nombreEquipo: eb.nombre || '' };
		}
		if (esCombate(room)) {
			try { foto.combate = datosCombate(room); } catch (e) { foto.combate = null; }
			if (room.battle.ended) {
				var elo = cambioElo(room);
				var entrada = leer('thor_historial', []).filter(function (x) { return x.id === room.id; })[0];
				foto.fin = { resumen: resumenFin(room), elo: elo, rival: room.battle.farSide.name, turnos: room.battle.turn || 0,
					id: room.id, nota: entrada ? entrada.nota : '', replay: enlaceRepeticion(room) };
			}
		}
		return foto;
	}

	/** Manda la foto a la pantalla de abajo si ha cambiado (o si se pide a la fuerza). */
	function enviarEstado(forzar) {
		if (!dos.hay) return;
		var ahora = Date.now();
		if (!forzar && ahora - dos.enviadoEn < 300) return;
		var f = instantanea();
		if (!f) return;
		var json = JSON.stringify(f);
		if (!forzar && json === dos.ultimo) return;
		dos.ultimo = json;
		dos.enviadoEn = ahora;
		try { window.ThorDos.enviar(json); } catch (e) { /* nada */ }
	}

	/* ------------------------------------------------------------------ *
	 *  Qué hace cada botón según la pantalla
	 * ------------------------------------------------------------------ */
	var COMBATE_ELIGIENDO = { 'ataques': 1, 'cambio': 1, 'cambio-forzado': 1, 'equipo-previo': 1, 'objetivo': 1 };

	function cruceta(dir) {
		state.ctx = contexto();
		if (state.ctx === 'titulo') { cerrarTitulo(); return; }
		if (state.ctx === 'inicio' && (dir === 'left' || dir === 'right') && !(state.cursorOn && currentValid() && state.cur.closest('.thor-menu'))) {
			cambiarFormato(dir === 'left' ? -1 : 1);
			return;
		}
		if (cursorDormido()) {
			// primera pulsación: aparece el cursor (en combate, sobre el primer ataque: Y)
			state.cursorOn = true;
			if (state.ctx === 'ataques') {
				var cont = salaEl(salaCombate());
				var m = cont && firstVisible('.movemenu button.movebutton:not(.disabled)', cont);
				if (m) { setCur(m); return; }
			}
			if (!currentValid()) { var list = candidates(); if (list.length) setCur(defaultTarget(list)); return; }
		}
		state.cursorOn = true;
		move(dir);
	}

	function animando() {
		var sc = salaCombate();
		return !!(sc && sc.battle && !sc.battle.atQueueEnd);
	}

	function pulsar(nombre) {
		var ctx = state.ctx = contexto();
		if (state.helpOpen) {
			if (nombre === 'B' || nombre === 'A') toggleHelp(false);
			return;
		}
		if (ctx === 'titulo') { cerrarTitulo(); return; }
		// L1 / R1: pestañas de la pantalla de abajo (sin ella: formato en el inicio, salas en el resto)
		if (nombre === 'L1' || nombre === 'R1') {
			var d = nombre === 'L1' ? -1 : 1;
			if (ctx === 'popup' || ctx === 'inspect') return;
			if (dos.hay) cambiarPestana(d);
			else if (ctx === 'inicio') cambiarFormato(d);
			else cycleTab(d);
			return;
		}
		if (nombre === 'L2' || nombre === 'L3' || nombre === 'R3') return;   // libres
		// Ventanas de Showdown, inspección y listas: navegación normal
		if (ctx === 'popup' || ctx === 'inspect') {
			if (nombre === 'A') confirm();
			else if (nombre === 'B') back();
			else if (nombre === 'R2') fichaOInspeccion();
			return;
		}
		if (ctx === 'repes') {
			if (nombre === 'A') { if (currentValid()) confirm(); else ensureCur(); }
			else if (nombre === 'B') cerrarRepes();
			return;
		}
		if (ctx === 'inicio') {
			switch (nombre) {
			case 'A': if (state.cursorOn && currentValid() && capas.inicio.contains(state.cur)) confirm(); else buscar(); return;
			case 'X': irA('teambuilder'); return;
			case 'Y': abrirRepes(); return;
			case 'B': state.inicioOculto = true; clearCur(); pintar(); toast('Classic Showdown home · B or Start to go back', 2000); return;
			}
		}
		if (ctx === 'buscando') {
			if (nombre === 'B') cancelarBusqueda();
			return;
		}
		if (ctx === 'fin') {
			switch (nombre) {
			case 'A': if (state.cursorOn && currentValid() && capas.fin.contains(state.cur)) confirm(); else nuevoCombate(); return;
			case 'Y': revancha(); return;
			case 'X': guardarRepeticion(); return;
			case 'B': volverAlInicio(); return;
			}
		}
		if (ctx === 'fin-oculto' && nombre === 'B') { state.finOculto = false; pintar(); return; }

		var enSalaCombate = esCombate(ps() && ps().room) && ctx !== 'fin' && ctx !== 'fin-oculto';
		if (enSalaCombate) {
			// A durante la animación: la salta
			if (nombre === 'A' && animando() && !COMBATE_ELIGIENDO[ctx]) { skipAnimation(); return; }
			if (nombre === 'R2') { fichaOInspeccion(); return; }
			if (ctx === 'ataques') {
				if (nombre === 'A') { if (currentValid()) confirm(); else ensureCur(); return; }
				if (nombre === 'B') { var ch = salaCombate().choices; if (ch && !ch.isEmpty()) deshacer(); return; }
				if (nombre === 'X') { abrirEquipo(); return; }
				if (nombre === 'Y') { tera(); return; }
			}
			if (ctx === 'cambio') {
				if (nombre === 'A') { if (currentValid()) confirm(); else cursorEnCambios(); return; }
				if (nombre === 'B' || nombre === 'X') { abrirEquipo(); return; }
				return;
			}
			if (ctx === 'cambio-forzado' || ctx === 'equipo-previo' || ctx === 'objetivo') {
				if (nombre === 'A') { if (currentValid()) confirm(); else cursorEnCambios(); return; }
				if (nombre === 'B') { if (ctx !== 'cambio-forzado') deshacer(); return; }
				return;
			}
			if (ctx === 'combate') {
				var sc = salaCombate();
				if (nombre === 'X') { abrirEquipo(); return; }
				if (nombre === 'Y') { tera(); return; }
				if (nombre === 'B') {
					if (sc && sc.overlayActive && !state.cursorOn) { abrirEquipo(); return; }
					if (sc && sc.choices && sc.request && sc.choices.isDone()) { deshacer(); return; }
				}
			}
		}

		// Botones que valen igual en todas partes
		switch (nombre) {
		case 'A': confirm(); break;
		case 'B': back(); break;
		case 'R2': fichaOInspeccion(); break;
		}
	}

	function selectCorto() {
		var ctx = state.ctx = contexto();
		if (state.helpOpen) { toggleHelp(false); return; }
		if (ctx === 'titulo') { cerrarTitulo(); return; }
		if (ctx === 'fin') { state.finOculto = true; clearCur(); pintar(); toast('Select: back to the options', 1600); return; }
		if (ctx === 'fin-oculto') { state.finOculto = false; pintar(); return; }
		toast('Hold Select for help', 1400);
	}

	/* ------------------------------------------------------------------ *
	 *  Lectura del mando
	 * ------------------------------------------------------------------ */
	var prev = {};
	var held = {};
	var sel = { desde: 0, largo: false };
	function getPad() {
		var pads = navigator.getGamepads ? navigator.getGamepads() : [];
		var fallback = null;
		for (var i = 0; i < pads.length; i++) {
			var p = pads[i];
			if (!p || !p.connected) continue;
			if (p.mapping === 'standard') return p;
			if (!fallback) fallback = p;
		}
		return fallback;
	}
	function down(pad, i) {
		var b = pad.buttons[i];
		return !!b && (b.pressed || b.value > 0.6);
	}

	/** true en el instante en que se pulsa; con repetición opcional al mantener. */
	function edge(name, isDown, now, repeat) {
		if (!isDown) { prev[name] = false; held[name] = 0; return false; }
		if (!prev[name]) { prev[name] = true; held[name] = now + REPEAT_FIRST; return true; }
		if (repeat && now >= held[name]) { held[name] = now + REPEAT_NEXT; return true; }
		return false;
	}

	/** Cada pulsación del mando pasa por aquí. */
	function touched(keepInfo) {
		state.lastInput = Date.now();
		activity();
		mountUI();
		if (!keepInfo) hideInfo();
	}

	function frame(now) {
		requestAnimationFrame(frame);
		var pad = getPad();
		if (!pad) return;

		var ax0 = pad.axes[0] || 0, ax1 = pad.axes[1] || 0, ay1 = pad.axes[3] || 0;
		var up = down(pad, BTN.UP), dn = down(pad, BTN.DOWN), lf = down(pad, BTN.LEFT), rt = down(pad, BTN.RIGHT);
		if (!(up || dn || lf || rt) && Math.hypot(ax0, ax1) > STICK_DEAD) {
			if (Math.abs(ax0) > Math.abs(ax1)) { if (ax0 > 0) rt = true; else lf = true; }
			else if (ax1 > 0) dn = true; else up = true;
		}

		if (edge('up', up, now, true)) { touched(); cruceta('up'); }
		if (edge('down', dn, now, true)) { touched(); cruceta('down'); }
		if (edge('left', lf, now, true)) { touched(); cruceta('left'); }
		if (edge('right', rt, now, true)) { touched(); cruceta('right'); }

		var nombres = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'L3', 'R3'];
		for (var i = 0; i < nombres.length; i++) {
			var n = nombres[i];
			if (edge(n, down(pad, BTN[n]), now)) { touched(n === 'L3'); pulsar(n); }
		}
		if (edge('START', down(pad, BTN.START), now)) {
			touched();
			if (state.helpOpen) toggleHelp(false);
			else if (state.titulo) cerrarTitulo();
			else if (contexto() === 'repes') cerrarRepes();
			else inicioOCombate();
		}

		// Select: pulsar = deshacer · mantener = ayuda
		var s = down(pad, BTN.SELECT);
		if (s && !prev.SELECT) { sel.desde = now; sel.largo = false; touched(); }
		if (s && !sel.largo && now - sel.desde >= HOLD_MS) {
			sel.largo = true;
			toggleHelp();
		}
		if (!s && prev.SELECT && !sel.largo) selectCorto();
		prev.SELECT = s;

		if (Math.abs(ay1) > SCROLL_DEAD) {
			touched(true);
			var cuanto = Math.sign(ay1) * (Math.abs(ay1) - SCROLL_DEAD) / (1 - SCROLL_DEAD) * SCROLL_SPEED;
			if (dos.hay) {
				dos.scroll += cuanto;
				if (now - dos.scrollEn > 60 && Math.abs(dos.scroll) >= 1) {
					enviarAbajo({ scroll: Math.round(dos.scroll) });
					dos.scroll = 0; dos.scrollEn = now;
				}
			} else scrollLog(cuanto);
		}
	}

	/* Mantiene la selección viva cuando Showdown repinta, y las pantallas al día */
	setInterval(function () {
		pintar();
		if (!state.lastInput) return;
		if (Date.now() - state.lastInput > IDLE_AUTOFOCUS) return;
		ensureCur();
	}, 250);

	/* Si tocas la pantalla, quitamos la selección del mando para no estorbar */
	window.addEventListener('pointerdown', function (e) {
		activity();
		if (e.pointerType === 'touch' || e.pointerType === 'mouse') {
			if (state.cur && !state.inspect) { state.cur.classList.remove('tg-focus', 'tg-big'); state.cur = null; }
			state.lastInput = 0;
			state.cursorOn = false;
		}
	}, true);
	/* escribir con el teclado también cuenta como "estoy jugando" */
	window.addEventListener('input', activity, true);
	window.addEventListener('keydown', activity, true);

	window.addEventListener('gamepadconnected', function () {
		toast('🎮 Controller ready · hold Select = help', 2800);
	});
	window.addEventListener('gamepaddisconnected', function () {
		toast('🎮 Controller disconnected', 2000);
	});

	if (document.body) mountUI(); else document.addEventListener('DOMContentLoaded', mountUI);
	requestAnimationFrame(frame);
	window.__thorMandoState = state;
	window.__thor = { contexto: contexto, pintar: pintar, pulsar: pulsar, state: state,
		recibe: recibe, abajoCambia: abajoCambia, instantanea: instantanea, dos: dos };

	/* ------------------------------------------------------------------ *
	 *  v9) FONDOS: los 8 fondos de David (web/fondos/), uno al azar por combate,
	 *      igual que en el móvil. Sustituyen a los de Showdown.
	 * ------------------------------------------------------------------ */
	var FONDOS_V8 = ['pradera', 'mar', 'montana', 'ruinas', 'bambu', 'canon', 'coliseo', 'volcan'];
	// Al azar, como una bolsa: salen los 8 antes de repetir ninguno.
	function sacarFondoV8() {
		var n = FONDOS_V8.length, bolsa = [];
		try { bolsa = JSON.parse(localStorage.getItem('v9-bolsa-fondos') || '[]'); } catch (e) {}
		bolsa = bolsa.filter(function (x) { return typeof x === 'number' && x < n; });
		if (!bolsa.length) {
			for (var k = 0; k < n; k++) bolsa.push(k);
			for (var j = n - 1; j > 0; j--) { var r = Math.floor(Math.random() * (j + 1)), t = bolsa[j]; bolsa[j] = bolsa[r]; bolsa[r] = t; }
		}
		var i = bolsa.shift();
		try { localStorage.setItem('v9-bolsa-fondos', JSON.stringify(bolsa)); } catch (e) {}
		return i;
	}
	var FONDO_SALA_V8 = {};
	function fondoV8() {
		Array.prototype.forEach.call(document.querySelectorAll('.ps-room .battle'), function (b) {
			if (b.__v8fondo) return;
			var sala = b.closest('.ps-room'), id = sala ? sala.id : '';
			var i = (id && FONDO_SALA_V8[id] != null) ? FONDO_SALA_V8[id] : sacarFondoV8();
			if (id) FONDO_SALA_V8[id] = i;
			b.style.setProperty('--v5-fondo', 'url("https://raw.githubusercontent.com/Davitt3054/Showdown-thor/main/web/fondos/fondo-' + FONDOS_V8[i] + '.webp")');
			b.classList.add('v5-fondo');
			b.classList.toggle('v5-fondo-mar', FONDOS_V8[i] === 'mar');
			b.__v8fondo = true;
		});
	}
	setInterval(fondoV8, 700);

	/* ------------------------------------------------------------------ *
	 *  v12) SUELO: el fondo se acerca (CSS, según data-v12-fondo) para que su
	 *       suelo quede donde Showdown pone a los Pokémon; así los ataques,
	 *       Protect y los números caen en su sitio. Tus Pokémon algo más
	 *       pequeños (más en dobles) y todos con sombra ovalada.
	 * ------------------------------------------------------------------ */
	function sueloV11() {
		Array.prototype.forEach.call(document.querySelectorAll('.ps-room .battle.v5-fondo'), function (b) {
			var f = /fondo-([a-z]+)\./.exec(b.style.getPropertyValue('--v5-fondo') || '');
			if (f && b.getAttribute('data-v12-fondo') !== f[1]) b.setAttribute('data-v12-fondo', f[1]);
			var capa = null, imgs = b.querySelectorAll('.innerbattle img');
			for (var i = 0; i < imgs.length && !capa; i++) {
				if (!/\/sprites\//.test(imgs[i].src)) continue;
				var c = imgs[i].parentElement && imgs[i].parentElement.parentElement;
				if (c && c.children.length === 4) capa = c;
			}
			if (!capa) return;
			var tuyos = capa.children[3], rivales = capa.children[0];
			if (!rivales.classList.contains('v11-rival')) rivales.classList.add('v11-rival');
			if (!tuyos.classList.contains('v11-tuyo')) tuyos.classList.add('v11-tuyo');
			var vivos = 0;
			Array.prototype.forEach.call(tuyos.querySelectorAll('img'), function (im) { if (/\/sprites\//.test(im.src) && im.style.display !== 'none' && parseFloat(im.style.width) > 0) vivos++; });
			var dobles = vivos > 1 || tuyos.querySelectorAll('img[src*="/sprites/"]').length > 1;
			b.classList.toggle('v12-dobles', dobles);
			[rivales, tuyos].forEach(function (lado) {
				var tuyo = lado === tuyos, k = tuyo ? (dobles ? 0.72 : 0.85) : 1;
				Array.prototype.forEach.call(lado.querySelectorAll('img'), function (im) {
					if (!/\/sprites\//.test(im.src)) return;
					var s = im.__v11sombra;
					if (!s || !s.isConnected) {
						s = im.__v11sombra = document.createElement('div');
						s.className = 'v11-sombra';
						lado.insertBefore(s, im);
					}
					var L = parseFloat(im.style.left) || 0, T = parseFloat(im.style.top) || 0;
					var W = parseFloat(im.style.width) || im.offsetWidth, H = parseFloat(im.style.height) || im.offsetHeight;
					var op = im.style.display === 'none' ? 0 : (im.style.opacity === '' ? 1 : +im.style.opacity);
					var sw = Math.min(W * 0.8 * k, tuyo ? 130 : 110), sh = sw * 0.24;
					s.style.cssText = 'left:' + (L + W / 2 - sw / 2) + 'px;top:' + (T + H - sh * 0.6) + 'px;width:' + sw + 'px;height:' + sh + 'px;opacity:' + op;
				});
			});
		});
	}
	setInterval(sueloV11, 120);

})();
