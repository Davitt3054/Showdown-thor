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

  INICIO ................ A buscar combate · cruceta ◀ ▶ cambia el formato ·
                          X equipos · Y repeticiones · B Inicio normal ·
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
		'.battle .has-tooltip.tg-focus{outline:none !important;box-shadow:none !important;background:radial-gradient(ellipse 42% 16% at 50% 90%, rgba(233,180,76,.6), transparent 72%) !important;}',
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
		'<b>D-pad</b> move through your moves<br>' +
		'<b>A</b> use the selected move · during animations, skip<br>' +
		'<b>B</b> back / undo your choice<br>' +
		'<b>X</b> team (switch)<br>' +
		'<b>Y</b> Tera<br>' +
		'<b>R2</b> info / inspect<br>' +
		'<b>L1 / R1</b> bottom screen tabs<br>' +
		'<b>Start</b> Home ⇄ battle<br>' +
		'<b>Select</b> hold = help<br>' +
		'<h4>HOME</h4>' +
		'<b>A</b> battle · D-pad: buttons<br>' +
		'<b>◀ ▶</b> change format<br>' +
		'<b>X</b> teams · <b style="min-width:0">Y</b> replays<br>' +
		'<b>Start</b> settings · <b style="min-width:0">B</b> classic Home<br>' +
		'<h4>SEARCHING · BATTLE END</h4>' +
		'<b>B</b> cancel search<br>' +
		'<b>A</b> new battle · <b style="min-width:0">Y</b> rematch<br>' +
		'<b>X</b> save replay · <b style="min-width:0">B</b> home<br>' +
		'<h4>ELSEWHERE</h4>' +
		'<b>D-pad</b> move · <b style="min-width:0">A</b> OK · <b style="min-width:0">B</b> back<br>' +
		'<b>Right stick</b> scroll chat / guide' +
		'<small id="tg-modo"></small>' +
		'<small id="tg-info"></small>' +
		'<small id="tg-wake"></small>' +
		'<small>Hold Select (or press B) to close</small></div>');
	help.id = 'tg-help';

	function mountUI() {
		if (!document.body) return;
		if (!hud.isConnected) document.body.appendChild(hud);
		if (!help.isConnected) document.body.appendChild(help);
		if (!document.documentElement.classList.contains('thor-app')) document.documentElement.classList.add('thor-app');
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
			if (!/^(pokemon\||activepokemon\||field|move\|)/.test(tt)) continue;
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
	function pickDirection(from, dir, list) {
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
			if (!list.length) { toast('Nothing to inspect here', 1600); return; }
			state.inspect = true;
			var start = null, i;
			if (state.cur && list.indexOf(state.cur) >= 0 && !cursorDormido()) start = state.cur;
			for (i = 0; !start && i < list.length; i++) {
				if (/^activepokemon\|1\|/.test(list[i].getAttribute('data-tooltip'))) { start = list[i]; break; }
			}
			if (!start) start = list[0];
			setCur(start);
			toast('🔍 INSPECT · D-pad: moves and Pokémon · B / R2: exit', 0);
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

	/** La ficha de Showdown se salía por abajo: se mete entera en la pantalla. */
	function fichaDentro() {
		var w = document.getElementById('tooltipwrapper');
		var t = w && w.querySelector('.tooltip');
		if (!t) return;
		var r = t.getBoundingClientRect();
		if (!r.height) return;
		var dy = 0, dx = 0;
		if (r.bottom > innerHeight - 6) dy = innerHeight - 6 - r.bottom;
		if (r.top + dy < 6) dy = 6 - r.top;
		if (r.right > innerWidth - 6) dx = innerWidth - 6 - r.right;
		if (r.left + dx < 6) dx = 6 - r.left;
		if (dy) w.style.top = Math.round((parseFloat(w.style.top) || 0) + dy) + 'px';
		if (dx) w.style.left = Math.round((parseFloat(w.style.left) || 0) + dx) + 'px';
	}
	setInterval(fichaDentro, 120);

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
		if (tooltipVisible()) hideInfo();
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
			if (w) w.textContent = '☀ Keep screen on: ' + wake.text();
			textoModo();
			var inf = help.querySelector('#tg-info');
			if (inf) {
				var P = ps(), lay = '';
				try { lay = P && P.prefs ? (P.prefs.battlelayout || 'auto') : '?'; } catch (e) { lay = '?'; }
				inf.textContent = '📐 Screen ' + innerWidth + '×' + innerHeight + ' · density ' + (Math.round(devicePixelRatio * 100) / 100) +
					' · battle layout: ' + lay + (dos.hay ? ' · dual screen' : '') + (escalaInfo ? ' · ' + escalaInfo : '') +
					' · browser ' + ((/Chrome\/(\d+)/.exec(navigator.userAgent) || [])[1] || '?');
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
		if (!mv) { toast('No move there', 1200); return; }
		if (mv.disabled) { toast(mv.name + ' can\'t be used now', 1500); return; }
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
		if (!box) { toast('You can\'t Terastallize now', 1400); return; }
		box.click();
		setTimeout(function () {
			toast(box.checked ? '💎 Tera on: pick a move' : 'Tera off', 1400);
		}, 30);
	}

	function deshacer() {
		var room = salaCombate();
		if (!room || !room.choices || !room.request) { toast('Nothing to undo', 1000); return; }
		var ch = room.choices;
		try {
			if (ch.isDone()) room.send('/cancel');
			else if (!ch.isEmpty() || (ch.current && ch.current.move)) room.send('/cancelone');
			else { toast('Nothing to undo', 1000); return; }
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
			// daño calculado abajo ("45–53%", "KO"): debajo de la eficacia
			var nm = /^\/move (\d)/.exec(btn.getAttribute('data-cmd') || '');
			var dano = nm && dos.danos ? dos.danos[+nm[1] - 1] || '' : '';
			if (dano) { if (btn.getAttribute('data-thor-d') !== dano) btn.setAttribute('data-thor-d', dano); }
			else if (btn.hasAttribute('data-thor-d')) btn.removeAttribute('data-thor-d');
		}
	}
	/* ------------------------------------------------------------------ *
	 *  CARTEL DEL ATAQUE: durante la animación, «Calyrex · Protect» en la
	 *  escena, con el color del tipo, en el lado de quien ataca.
	 * ------------------------------------------------------------------ */
	var COLOR_TIPO = { Normal: '#a2a3a8', Fire: '#f08a4b', Water: '#5aa0ff', Electric: '#f2d04b', Grass: '#6cc56c', Ice: '#7fd8e8',
		Fighting: '#d0605a', Poison: '#b06fd8', Ground: '#d8b060', Flying: '#7fd1c4', Psychic: '#f070a0', Bug: '#a8c040',
		Rock: '#c0a860', Ghost: '#8a78d0', Dragon: '#7a70f0', Dark: '#a08878', Steel: '#a8b8c8', Fairy: '#f0a0d8', Stellar: '#e9b44c' };
	var cartel = { el: null, paso: -1, sala: null, hasta: 0 };
	function cartelAtaque() {
		var room = salaCombate();
		var b = room && room.battle;
		var cont = room && salaEl(room);
		var battleEl = cont && cont.querySelector('.battle');
		if (!battleEl) return;
		if (!cartel.el || cartel.el.parentNode !== battleEl) {
			cartel.el = el('div', 'thor-cartel');
			battleEl.appendChild(cartel.el);
		}
		var paso = typeof b.currentStep === 'number' ? b.currentStep : -1;
		if (room.id !== cartel.sala) { cartel.sala = room.id; cartel.paso = paso; }
		if (paso !== cartel.paso && !b.atQueueEnd && !b.seeking) {
			var q = b.stepQueue || [];
			for (var i = Math.max(cartel.paso + 1, paso - 2, 0); i <= paso && i < q.length; i++) {
				var p = String(q[i]).split('|');
				if (p[1] !== 'move') continue;
				var mio = (room.side && room.side.id) || 'p1';
				var esMio = String(p[2] || '').slice(0, 2) === mio;
				var tipo = '';
				try { tipo = b.dex.moves.get(p[3]).type; } catch (e) { tipo = ''; }
				cartel.el.innerHTML = '<b>' + escH(String(p[2] || '').replace(/^p\d[a-z]?: */, '')) + '</b> · ' + escH(p[3]);
				cartel.el.style.setProperty('--c', COLOR_TIPO[tipo] || '#e9b44c');
				cartel.el.className = 'thor-cartel on ' + (esMio ? 'mio' : 'rival');
				cartel.hasta = Date.now() + 1600;
			}
			cartel.paso = paso;
		}
		if (cartel.hasta && Date.now() > cartel.hasta) { cartel.el.classList.remove('on'); cartel.hasta = 0; }
	}
	setInterval(function () { try { cartelAtaque(); } catch (e) { /* nada */ } }, 100);

	/** Dobles: al elegir a quién atacar, la eficacia en grande sobre cada Pokémon (x2, x½, x0...). */
	function eficaciaObjetivos(room, eligiendo) {
		var cont = salaEl(room);
		if (!cont) return;
		var btns = cont.querySelectorAll('.switchmenu button[data-tooltip^="activepokemon|"]');
		var tipo = null, b = room.battle;
		if (eligiendo) {
			try {
				var cur = room.choices && room.choices.current;
				var req = room.choices.currentMoveRequest();
				var mv = cur && cur.move && req && req.moves[cur.move - 1];
				var mov = mv && b.dex.moves.get(mv.id || mv.move);
				if (mov && mov.category !== 'Status') tipo = mov.type;
			} catch (e) { tipo = null; }
		}
		for (var i = 0; i < btns.length; i++) {
			var et = '';
			if (tipo) {
				var t = btns[i].getAttribute('data-tooltip').split('|');
				var lado = t[1] === '1' ? b.farSide : b.nearSide;
				var poke = lado && lado.active[+t[2]];
				if (poke && !poke.fainted) {
					var f = eficaciaPorTabla(b, tipo, poke);
					if (f !== null) et = f === 0 ? 'x0' : f <= 0.25 ? 'x¼' : f < 1 ? 'x½' : f >= 4 ? 'x4' : f > 1 ? 'x2' : 'x1';
				}
			}
			if (et) { if (btns[i].getAttribute('data-thor-ef') !== et) btns[i].setAttribute('data-thor-ef', et); }
			else if (btns[i].hasAttribute('data-thor-ef')) btns[i].removeAttribute('data-thor-ef');
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
			toast('Star (★) formats in Showdown\'s list to switch between them', 2600);
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
		if (!P.user || !P.user.named) { irA('login'); toast('Log in first', 1800); return; }
		var b = inicioEl() && inicioEl().querySelector('button.mainmenu1.big[type="submit"]');
		if (b && !b.disabled) { state.busquedaDesde = Date.now(); b.click(); return; }
		toast(P.isOffline ? 'Not connected to Showdown' : 'Connecting to Showdown…', 1600);
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
		toast('Searching for another battle…', 1500);
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
		toast('💾 Saving replay…', 1800);
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
		if (!P || !P.user || !P.user.named) { toast('Log in to see your replays', 1800); return; }
		capas.repes.hidden = false;
		var lista = capas.repes.querySelector('.thor-lista');
		lista.innerHTML = '<div class="thor-aviso">Loading your replays…</div>';
		clearCur();
		var user = P.user.userid;
		var urls = [
			'https://replay.pokemonshowdown.com/search.json?user=' + encodeURIComponent(user),
			'https://play.pokemonshowdown.com/api/replays/search.json?user=' + encodeURIComponent(user)
		];
		(function probar(i) {
			if (i >= urls.length) { lista.innerHTML = '<div class="thor-aviso">Couldn\'t load them right now.</div>'; return; }
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
			lista.innerHTML = '<div class="thor-aviso">No saved replays yet. At the end of a battle, X saves it.</div>';
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
			capas.inicio = el('div', 'thor-capa', '' +
				'<div class="thor-usuario"><span class="thor-avatar"></span><span class="thor-nombre-u"></span><span class="thor-elo"></span></div>' +
				'<div class="thor-izq">' +
				'  <div><h1 class="thor-logo">SHOWDOWN</h1><div class="thor-edicion">THOR EDITION</div></div>' +
				'  <div class="thor-reto" hidden><span class="thor-reto-t"></span>' +
				'    <span class="thor-reto-b"><button data-thor="reto-ver">VIEW</button><button class="sec" data-thor="reto-no">DECLINE</button></span></div>' +
				'  <div><div class="thor-et">FORMAT · ◀ ▶ to change</div>' +
				'  <div class="thor-formato"><button class="thor-flecha" data-thor="formato-prev" aria-label="Previous format">◀</button>' +
				'  <button class="thor-chip" data-thor="formato-lista"><b class="thor-f-nombre"></b><small class="thor-f-desc"></small></button>' +
				'  <button class="thor-flecha" data-thor="formato-next" aria-label="Next format">▶</button></div></div>' +
				'</div>' +
				'<div class="thor-dcha">' +
				'  <button class="thor-btn principal" data-thor="buscar"><span class="thor-letra">A</span><span class="thor-buscar-t">BATTLE!</span></button>' +
				'  <button class="thor-btn" data-thor="equipos"><span class="thor-letra">X</span>TEAMBUILDER</button>' +
				'  <button class="thor-btn" data-thor="repes"><span class="thor-letra">Y</span>REPLAYS</button>' +
				'  <button class="thor-btn" data-thor="start"><span class="thor-letra">START</span><span class="thor-start-t">SETTINGS</span></button>' +
				'  <div class="thor-mas thor-menu">' +
				'    <button data-thor="ladder">LADDER</button>' +
				'    <button data-thor="usuarios">FIND A USER</button>' +
				'    <button data-thor="amigos">FRIENDS</button>' +
				'  </div>' +
				'</div>' +
				'<div class="thor-pie">Team: <span class="thor-tag thor-equipo"></span> <span>A battle · D-pad to move between buttons · B: classic Showdown home</span></div>');
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
				'<div class="thor-pie"><span>A: watch replay · B: back</span></div>');
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
		case 'usuarios': irA('users'); break;
		case 'amigos': irA('view-friends-all'); break;
		case 'reto-ver': verReto(); break;
		case 'reto-no': rechazarReto(); break;
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
		texto(c.querySelector('.thor-nombre-u'), u.named ? u.name : 'Guest');
		var av = c.querySelector('.thor-avatar');
		var url = u.named ? 'url("' + avatarUrl(u.avatar) + '")' : '';
		if (av.style.backgroundImage !== url) av.style.backgroundImage = url;
		var id = formatoActual();
		texto(c.querySelector('.thor-f-nombre'), nombreFormato(id));
		texto(c.querySelector('.thor-f-desc'), descFormato(id));
		texto(c.querySelector('.thor-equipo'), nombreEquipo());
		var hay = combateAbierto();
		texto(c.querySelector('.thor-start-t'), hay ? 'BACK TO BATTLE' : 'SETTINGS');
		texto(c.querySelector('.thor-buscar-t'), !u.named ? 'LOG IN' : P.isOffline ? 'OFFLINE' : 'BATTLE!');
		pintarReto(P);
		if (!state.formatoRestaurado && botonFormato() && window.BattleFormats) {
			state.formatoRestaurado = true;
			var gu = leer('thor_formato', null);
			if (gu && gu !== formatoActual() && datosFormato(gu)) ponerFormato(gu);
			else ponerEquipoRecordado();
		}
	}

	/* ------------------------------------------------------------------ *
	 *  RETOS: si alguien te reta (o tú retas a alguien) sale en el Inicio.
	 *  Showdown los guarda en las salas de mensajes privados (dm-…):
	 *  room.challenged = te retan · room.challenging = retas tú.
	 * ------------------------------------------------------------------ */
	function retoActual(P) {
		var rooms = P && P.rooms;
		if (!rooms) return null;
		var fuera = null;
		for (var id in rooms) {
			var r = rooms[id];
			if (!r || !r.pmTarget) continue;
			if (r.challenged && !r.teamSent) return { sala: r, entrante: true, reto: r.challenged };
			if (r.challenging && !fuera) fuera = { sala: r, entrante: false, reto: r.challenging };
			else if (r.challengeMenuOpen && !r.teamSent && !fuera) fuera = { sala: r, entrante: false, preparando: true, reto: { formatName: formatoActual() } };
		}
		return fuera;
	}
	function formatoAleatorio(nombre) {
		var f = datosFormato(toId(String(nombre || '').split('@@@')[0]));
		return !!(f && f.team);
	}
	function pintarReto(P) {
		var caja = capas.inicio.querySelector('.thor-reto');
		var r = retoActual(P);
		var firma = r ? (r.entrante ? 'in|' : r.preparando ? 'prep|' + nombreEquipo() + '|' : 'out|') + r.sala.pmTarget + '|' + r.reto.formatName : '';
		if (caja.__firma === firma) return;
		caja.__firma = firma;
		caja.hidden = !r;
		capas.inicio.classList.toggle('con-reto', !!r);
		if (!r) return;
		var fid = toId(String(r.reto.formatName || '').split('@@@')[0]);
		var formato = nombreFormato(fid) || r.reto.formatName || '';
		var desc = descFormato(fid);
		var t = caja.querySelector('.thor-reto-t');
		var bSi = caja.querySelector('[data-thor="reto-ver"]');
		var bNo = caja.querySelector('[data-thor="reto-no"]');
		if (r.entrante) {
			var aleat = formatoAleatorio(r.reto.formatName);
			t.innerHTML = '⚔ <b>' + escH(r.sala.pmTarget) + '</b> challenges you' +
				'<big>' + escH(formato) + '</big><small>' + escH(desc) + (aleat ? '' : ' · pick your team to accept') + '</small>';
			texto(bSi, aleat ? 'ACCEPT' : 'PICK TEAM');
			texto(bNo, 'DECLINE');
			bSi.hidden = false;
			if (!state.retoAvisado || state.retoAvisado !== firma) { state.retoAvisado = firma; toast('⚔ ' + r.sala.pmTarget + ' challenges you · ' + formato, 3000); }
		} else if (r.preparando) {
			t.innerHTML = '⚔ Challenge <b>' + escH(r.sala.pmTarget) + '</b>' +
				'<big>' + escH(formato) + '</big><small>' + escH(desc) + ' · team: ' + escH(nombreEquipo()) + ' · ◀ ▶ change format</small>';
			texto(bSi, 'CHALLENGE');
			texto(bNo, 'CANCEL');
			bSi.hidden = false;
		} else {
			t.innerHTML = 'Challenging <b>' + escH(r.sala.pmTarget) + '</b>…<big>' + escH(formato) + '</big><small>' + escH(desc) + ' · waiting for an answer</small>';
			bSi.hidden = true;
			texto(bNo, 'CANCEL');
		}
	}
	/** Fuera del Inicio (en combate, en el Teambuilder...): solo un aviso. */
	function avisoReto(P) {
		var r = retoActual(P);
		if (!r || !r.entrante) return;
		var firma = 'in|' + r.sala.pmTarget + '|' + r.reto.formatName;
		if (state.retoAvisado === firma) return;
		state.retoAvisado = firma;
		toast('⚔ ' + r.sala.pmTarget + ' challenges you · go Home (Start) to see it', 3500);
	}
	/** Aceptar (formatos aleatorios) o abrir el reto de Showdown para elegir equipo. */
	function verReto() {
		var P = ps();
		var r = retoActual(P);
		if (r && r.preparando) { mandarReto(P, r.sala); return; }
		if (!r || !r.entrante) return;
		if (formatoAleatorio(r.reto.formatName)) {
			try {
				P.send('/utm ');
				r.sala.send('/accept');
				r.sala.teamSent = r.reto.formatName || '-';
				if (r.sala.update) r.sala.update(null);
				toast('Challenge accepted', 1500);
			} catch (e) { /* nada */ }
			return;
		}
		// formato con equipo: se ve el reto de Showdown (Inicio normal) para elegir equipo y aceptar
		state.inicioOculto = true;
		clearCur();
		try { if (P.focusRoom) P.focusRoom(r.sala.id); else P.join(r.sala.id); } catch (e) { /* nada */ }
		toast('Pick your team and press Accept · Start to go back', 2500);
		settleSoon();
	}
	/** Manda el reto con el formato y el equipo del Inicio (lo mismo que hace Showdown). */
	function mandarReto(P, sala) {
		var fid = formatoActual();
		var f = datosFormato(fid);
		var packed = '';
		if (!(f && f.team)) {
			var b = botonEquipo();
			var t = b && P.teams && P.teams.byKey && P.teams.byKey[b.value];
			if (!t) { toast('Pick a team for this format first (X: teambuilder)', 2200); return; }
			packed = t.packedTeam || '';
		}
		try {
			P.send('/utm ' + packed);
			P.send('/challenge ' + sala.pmTarget + ', ' + fid);
			sala.teamSent = fid || '-';
			if (sala.update) sala.update(null);
			toast('⚔ Challenge sent to ' + sala.pmTarget, 1600);
		} catch (e) { toast('Couldn\'t send the challenge', 1500); }
	}

	/** Al abrir un reto (Buscar usuario → Challenge) se vuelve al Inicio de la app para prepararlo ahí. */
	function vigilarRetoNuevo(P) {
		var rooms = P && P.rooms;
		if (!rooms) return;
		for (var id in rooms) {
			var r = rooms[id];
			if (!r || !r.pmTarget) continue;
			var abierto = !!r.challengeMenuOpen && !r.teamSent;
			if (abierto && !r.__thorReto) {
				r.__thorReto = true;
				state.inicioOculto = false;
				if (P.room && P.room.id !== '' && !esCombate(P.room)) irA('');
			}
			if (!abierto) r.__thorReto = false;
		}
	}

	function rechazarReto() {
		var P = ps();
		var r = retoActual(P);
		if (!r) return;
		if (r.preparando) {
			try { r.sala.challengeMenuOpen = false; if (r.sala.update) r.sala.update(null); } catch (e) { /* nada */ }
			toast('Challenge cancelled', 1500);
			return;
		}
		try { r.sala.send(r.entrante ? '/reject' : '/cancelchallenge'); } catch (e) { /* nada */ }
		toast(r.entrante ? 'Challenge declined' : 'Challenge cancelled', 1500);
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
		escalaInfo = 'room ' + Math.round(r.width) + '×' + Math.round(r.height) + ' · scene ×' + S;
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
		try { vigilarRetoNuevo(P); } catch (e) { /* nada */ }
		if (verInicio) pintarInicio(P);
		else avisoReto(P);
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
			eficaciaObjetivos(room, ctx === 'objetivo');
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
	 *  RESUMEN DEL TURNO en filas, una por acción (va a la pantalla de abajo)
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
			else if (accion && tipo === '-miss') accion.extra = 'falla';
			else if (accion && tipo === '-fail' && !accion.danos.length) accion.extra = 'falla';
			else if (tipo === 'faint' && accion) {
				accion.ko = (accion.ko || []).concat(nombreDe(p[2]));
			}
		}
		cerrar();
		if (!trozos.length) return null;
		// una fila por acción: punto azul (tuya) o rojo (del rival), quién, qué y a quién con cuánto daño
		var filas = trozos.map(function (t) {
			var h;
			if (t.cambio) h = '<b>' + escH(t.quien) + '</b> ' + (t.mio ? 'switched in (you)' : 'switched in (opponent)');
			else {
				h = '<b>' + escH(t.quien) + '</b> · ' + escH(t.mov);
				if (t.extra === 'inmune') h += ' → no effect';
				else if (t.extra === 'falla') h += ' → missed';
				else if (t.danos.length) {
					var suma = {};
					t.danos.forEach(function (x) {
						var k = x.quien + '|' + x.mio;
						if (!suma[k]) suma[k] = { quien: x.quien, mio: x.mio, d: 0, n: 0 };
						suma[k].d += x.d; suma[k].n++;
					});
					h += ' → ' + Object.keys(suma).map(function (k) {
						var x = suma[k];
						return escH(x.quien) + ' <em class="' + (x.mio ? 'v6-malo' : 'v6-bueno') + '">−' + x.d + '%</em>' + (x.n > 1 ? ' <small>(' + x.n + ' hits)</small>' : '');
					}).join(', ');
				}
				if (t.ko) h += ' <em class="v6-ko">KO</em>';
			}
			return '<div class="rt-fila ' + (t.mio ? 'mio' : 'rival') + '"><i></i><span>' + h + '</span></div>';
		});
		var MAX = 6;
		var html = filas.slice(0, MAX).join('') + (filas.length > MAX ? '<div class="rt-mas">+' + (filas.length - MAX) + ' more (see chat)</div>' : '');
		return { n: numero, html: html };
	}



	/* ------------------------------------------------------------------ *
	 *  Pantalla siempre encendida (Screen Wake Lock)
	 * ------------------------------------------------------------------ */
	var wake = {
		lock: null, pending: false, lastTry: 0, error: '',
		text: function () {
			if (!navigator.wakeLock) return 'not available in this browser';
			if (wake.lock) return 'yes';
			if (Date.now() - state.lastActivity > WAKE_IDLE) return 'idle (comes back when you touch)';
			return wake.error ? 'no (' + wake.error + ')' : 'pending';
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
	var dos = { hay: false, ultimo: '', enviadoEn: 0, pestana: leer('thor_pestana', 'calc'), fuera: 'vista', eq: { p: 'resumen', scarf: false }, l2: false, reset: 0, scroll: 0, scrollEn: 0 };
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
			} else toast('Open a battle to chat in it', 1600);
		}
		if (typeof m.sdq === 'string' && window.__thorEquipo) {
			if (m.sdq === 'scarf') dos.eq.scarf = !dos.eq.scarf;
			else if (m.sdq.indexOf('add:') === 0) __thorEquipo.anadir(m.sdq.slice(4));
			else dos.eq.p = m.sdq;
			enviarEstado(true);
		}
		if (m.accion) accion(m.accion);
		if (Array.isArray(m.danos)) dos.danos = m.danos;
		if (m.restablecer) { dos.reset++; enviarEstado(true); toast('Calculator reset', 1200); }
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
			yoActual: activoYo ? (activoYo.speciesForme || activoYo.species || '') : '',
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

	var STAT_ES = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Acc', evasion: 'Eva' };
	var ESTADO_ES = { brn: 'burns', par: 'paralyzes', slp: 'sleep', frz: 'freezes', psn: 'poisons', tox: 'badly poisons' };
	var STAT_EN = { 'attack': 'Atk', 'defense': 'Def', 'sp. atk': 'SpA', 'sp. def': 'SpD', 'speed': 'Spe',
		'special attack': 'SpA', 'special defense': 'SpD', 'accuracy': 'Acc', 'evasiveness': 'Eva' };
	/** Cuando Showdown no trae los datos del ataque: se saca de su descripción corta (en inglés). */
	function efectoPorTexto(d) {
		var m;
		d = String(d || '');
		if ((m = /raises the user's (.+?) by (\d)/i.exec(d))) {
			return m[1].split(/,\s*(?:and\s+)?|\s+and\s+/).map(function (x) {
				return '+' + m[2] + ' ' + (STAT_EN[x.trim().toLowerCase()] || x.trim());
			}).join(' ');
		}
		if ((m = /lowers the target's (.+?) by (\d)/i.exec(d))) return 'foe −' + m[2] + ' ' + (STAT_EN[m[1].toLowerCase()] || m[1]);
		if ((m = /heals the user by (\d+)%/i.exec(d))) return '+' + m[1] + '% HP';
		if (/heals the user/i.test(d)) return '+HP';
		if (/protects|prevents moves from affecting the user/i.test(d)) return 'protects';
		if (/burns/i.test(d)) return 'burns';
		if (/paralyzes/i.test(d)) return 'paralyzes';
		if (/badly poisons|poisons/i.test(d)) return 'poisons';
		if (/sleep/i.test(d)) return 'sleep';
		if (/switch/i.test(d)) return 'and switches';
		return '—';
	}

	/** Qué hace un ataque de estado ("+2 At. Esp.", "+50 % PS"...). */
	function efectoEstado(md) {
		if (!md || md.category !== 'Status') return '';
		var t = [];
		var bo = (md.target === 'self' || md.target === 'allySide' || md.target === 'adjacentAllyOrSelf') && md.boosts || (md.self && md.self.boosts);
		if (bo) for (var k in bo) t.push((bo[k] > 0 ? '+' : '') + bo[k] + ' ' + (STAT_ES[k] || k));
		else if (md.boosts) for (var k2 in md.boosts) t.push('foe ' + (md.boosts[k2] > 0 ? '+' : '') + md.boosts[k2] + ' ' + (STAT_ES[k2] || k2));
		if (md.heal) t.push('+' + Math.round(md.heal[0] / md.heal[1] * 100) + '% HP');
		if (md.status) t.push(ESTADO_ES[md.status] || md.status);
		if (md.sideCondition) t.push(md.name);
		if (md.weather) t.push('weather');
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
				else lado = 'rival';
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
			replay: enlaceRepeticion(room), nota: e && e.nota || '',
			momentos: momentosClave(room)
		};
		if (e && JSON.stringify(e) === JSON.stringify(nuevo)) return;
		if (e) h[h.indexOf(e)] = nuevo; else h.unshift(nuevo);
		guardar('thor_historial', h.slice(0, 300));
	}

	/** Momentos clave del combate: KOs, críticos, Tera y el golpe más fuerte (para el Historial). */
	function momentosClave(room) {
		var b = room.battle, q = b.stepQueue || [];
		var mio = (room.side && room.side.id) || 'p1';
		var vida = {}, turno = 0, ult = null, out = [], mayor = null;
		for (var i = 0; i < q.length; i++) {
			var p = String(q[i]).split('|'), tipo = p[1], k = clave(p[2]);
			if (tipo === 'turn') { turno = +p[2]; continue; }
			if (tipo === 'switch' || tipo === 'drag' || tipo === 'replace') { var v = pctHP(p[4]); if (v !== null) vida[k] = v; continue; }
			if (tipo === 'move') { ult = { quien: nombreDe(p[2]), mio: lado(p[2]) === mio, mov: p[3] }; continue; }
			if (tipo === '-damage' || tipo === '-heal' || tipo === '-sethp') {
				var antes = vida[k], ahora = pctHP(p[3]);
				if (ahora !== null) vida[k] = ahora;
				if (tipo === '-damage' && !p[4] && ult && antes !== undefined && ahora !== null) {
					var d = Math.round(antes - ahora);
					if (d > 0 && (!mayor || d > mayor.d)) mayor = { d: d, t: turno, txt: (ult.mio ? 'Your ' : 'Their ') + ult.mov + ' → ' + nombreDe(p[2]) + ' −' + d + '%', mio: ult.mio };
				}
				continue;
			}
			if (tipo === 'faint') { out.push({ t: turno, txt: nombreDe(p[2]) + ' KO' + (ult ? ' (' + ult.mov + ')' : ''), bueno: lado(p[2]) !== mio }); continue; }
			if (tipo === '-crit') { out.push({ t: turno, txt: 'Critical hit' + (ult ? (ult.mio ? ' by your ' : ' by their ') + ult.mov : ''), bueno: lado(p[2]) !== mio }); continue; }
			if (tipo === '-terastallize') { out.push({ t: turno, txt: nombreDe(p[2]) + ' Tera ' + p[3], bueno: lado(p[2]) === mio }); continue; }
		}
		if (mayor) out.push({ t: mayor.t, txt: 'Biggest hit: ' + mayor.txt, bueno: mayor.mio });
		out.sort(function (a, z) { return a.t - z.t; });
		return out.slice(0, 14);
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
		// en el Teambuilder con un equipo abierto: la ayuda del equipo va abajo (pestaña TU EQUIPO)
		if (pantalla === 'otro' && window.__thorEquipo && __thorEquipo.hay()) {
			try { foto.equipoAyuda = __thorEquipo.html(dos.eq.p, dos.eq.scarf); } catch (e) { foto.equipoAyuda = null; }
		}
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
		if (state.ctx === 'inicio' && (dir === 'left' || dir === 'right') && !(state.cursorOn && currentValid() && state.cur.closest('.thor-menu, .thor-reto'))) {
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
			case 'A':
				if (state.cursorOn && currentValid() && capas.inicio.contains(state.cur)) confirm();
				else { var rp = retoActual(ps()); if (rp && rp.preparando) mandarReto(ps(), rp.sala); else buscar(); }
				return;
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
		toast('🎮 Controller ready · hold Select for help', 2800);
	});
	window.addEventListener('gamepaddisconnected', function () {
		toast('🎮 Controller disconnected', 2000);
	});

	if (document.body) mountUI(); else document.addEventListener('DOMContentLoaded', mountUI);
	requestAnimationFrame(frame);
	window.__thorMandoState = state;
	window.__thor = { contexto: contexto, pintar: pintar, pulsar: pulsar, state: state,
		recibe: recibe, abajoCambia: abajoCambia, instantanea: instantanea, dos: dos, toast: toast };
	setTimeout(function () { if (window.__thorEquipo) __thorEquipo.cambio = function () { enviarEstado(true); }; }, 0);
})();


/* ====================================================================== *
 *  AYUDA DEL EQUIPO para la pantalla de abajo (Thor): resumen de tipos,
 *  compañeros que combinan y velocidades. Adaptado de equipos.user.js
 *  (el del móvil); aquí no pinta nada arriba: da el HTML a mando.user.js,
 *  que lo manda a la pantalla de abajo para no tapar el editor.
 * ====================================================================== */
(function () {
	'use strict';
	if (window.__thorEquipo) return;
	window.__thorEquipo = {};
	var DATOS = 'https://pkmn.github.io/smogon/data/stats/';
	var QUITA_TRAMPAS = ['rapidspin', 'defog', 'mortalspin', 'tidyup', 'courtchange'];
	var TIPOS = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying',
		'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
	var TONO = {
		Normal: [215, 8], Fighting: [3, 55], Flying: [255, 38], Poison: [300, 40], Ground: [44, 42], Rock: [49, 38],
		Bug: [66, 50], Ghost: [262, 36], Steel: [240, 12], Fire: [25, 60], Water: [222, 48], Grass: [100, 42],
		Electric: [48, 58], Psychic: [342, 50], Ice: [180, 35], Dragon: [257, 52], Dark: [24, 22], Fairy: [310, 50]
	};
	var NAT_MAS = { Timid: 1, Jolly: 1, Hasty: 1, Naive: 1 };
	var NAT_MENOS = { Brave: 1, Relaxed: 1, Quiet: 1, Sassy: 1 };

	function ps() { return window.PS || null; }
	function toId(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
	function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
	function tipoChip(t) { var h = TONO[t] || [215, 8]; return '<span class="sdq-tipo" style="--c:hsl(' + h[0] + ' ' + h[1] + '% 58%)">' + esc(t) + '</span>'; }
	function icono(especie) {
		try { if (window.Dex && Dex.getPokemonIcon) return '<span class="sdq-icono" style="' + Dex.getPokemonIcon(especie) + '"></span>'; } catch (e) { /* nada */ }
		return '';
	}
	function especie(n) { try { return Dex.species.get(n); } catch (e) { return null; } }

	/* ---------------- la sala del equipo abierto ---------------- */
	function salaEquipo() {
		var P = ps();
		if (!P || !P.room || String(P.room.id).indexOf('team-') !== 0) return null;
		var r = P.room;
		var team = r.getTeam ? r.getTeam() : r.team;
		if (!team) return null;
		return { room: r, team: team };
	}
	function setsDe(s) {
		if (s.room.editor && s.room.editor.sets) return s.room.editor.sets;
		try { return Teams.unpack(s.team.packedTeam) || []; } catch (e) { return []; }
	}
	function formatoDe(s) { return toId(String(s.team.format || '').split('@@@')[0]); }

	/* ---------------- datos de uso (se bajan una vez por formato) ---------------- */
	var USO = {};
	function cargarUso(fmt, luego) {
		if (USO[fmt] && USO[fmt] !== 'cargando') { luego(USO[fmt]); return; }
		if (USO[fmt] === 'cargando') { setTimeout(function () { cargarUso(fmt, luego); }, 400); return; }
		USO[fmt] = 'cargando';
		fetch(DATOS + fmt + '.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
			.then(function (d) { USO[fmt] = d; luego(d); })
			.catch(function () { USO[fmt] = { pokemon: {}, error: true }; luego(USO[fmt]); });
	}
	function usoDe(d, nombre) {
		var p = d && d.pokemon || {};
		if (p[nombre]) return p[nombre];
		var id = toId(nombre);
		for (var k in p) if (toId(k) === id) return p[k];
		var base = especie(nombre);
		return base && base.baseSpecies && p[base.baseSpecies] || null;
	}
	function pct(x) { return Math.round((x || 0) * 1000) / 10 + '%'; }

	/* ---------------- tipos ---------------- */
	function factor(tipoAtq, tiposDef, habilidad) {
		var f = 1;
		if (tipoAtq === 'Ground' && /^(Levitate|Earth Eater)$/.test(habilidad || '')) return 0;
		if (tipoAtq === 'Water' && /^(Water Absorb|Storm Drain|Dry Skin)$/.test(habilidad || '')) return 0;
		if (tipoAtq === 'Electric' && /^(Volt Absorb|Lightning Rod|Motor Drive)$/.test(habilidad || '')) return 0;
		if (tipoAtq === 'Fire' && /^(Flash Fire|Well-Baked Body)$/.test(habilidad || '')) return 0;
		if (tipoAtq === 'Grass' && /^(Sap Sipper)$/.test(habilidad || '')) return 0;
		tiposDef.forEach(function (t) {
			var d = 0;
			try { d = Dex.types.get(t).damageTaken[tipoAtq]; } catch (e) { d = 0; }
			f *= [1, 2, 0.5, 0][d || 0];
		});
		return f;
	}
	function analizar(sets) {
		var miembros = sets.filter(function (s) { return s && s.species; }).map(function (s) {
			var sp = especie(s.species);
			return { set: s, nombre: sp ? sp.name : s.species, tipos: sp ? sp.types : [], hab: s.ability || '' };
		});
		var tabla = TIPOS.map(function (t) {
			var deb = [], res = [], inm = [];
			miembros.forEach(function (m) {
				var f = factor(t, m.tipos, m.hab);
				if (f === 0) inm.push(m.nombre); else if (f > 1) deb.push(m.nombre); else if (f < 1) res.push(m.nombre);
			});
			return { tipo: t, deb: deb, res: res, inm: inm };
		});
		var avisos = [];
		tabla.forEach(function (r) {
			var cubre = r.res.length + r.inm.length;
			if (r.deb.length >= 3) avisos.push('<b>' + r.deb.length + ' weak to ' + r.tipo + '</b> (' + esc(r.deb.join(', ')) + ')');
			else if (r.deb.length >= 2 && !cubre) avisos.push('<b>' + r.tipo + '</b>: ' + r.deb.length + ' weak and nobody resists it');
		});
		var quita = miembros.filter(function (m) { return (m.set.moves || []).some(function (mv) { return QUITA_TRAMPAS.indexOf(toId(mv)) >= 0; }); });
		if (miembros.length >= 3 && !quita.length) avisos.push('No <b>hazard removal</b> (Rapid Spin / Defog)');
		var prio = miembros.filter(function (m) {
			return (m.set.moves || []).some(function (mv) { var d = Dex.moves.get(mv); return d && d.priority > 0 && d.category !== 'Status'; });
		});
		if (miembros.length >= 3) {
			if (!prio.length) avisos.push('Nobody has <b>priority</b>');
			else if (prio.length === 1) avisos.push('Only ' + esc(prio[0].nombre) + ' has <b>priority</b>');
		}
		return { miembros: miembros, tabla: tabla, avisos: avisos, quita: quita.length > 0, prio: prio.length };
	}

	/* ---------------- velocidad ---------------- */
	function velocidad(base, ev, iv, nivel, nat) {
		var mod = NAT_MAS[nat] ? 1.1 : NAT_MENOS[nat] ? 0.9 : 1;
		return Math.floor(Math.floor((2 * base + iv + Math.floor(ev / 4)) * nivel / 100 + 5) * mod);
	}
	function nivelFormato(fmt) { return /vgc|bss|battlestadium/.test(fmt) ? 50 : 100; }
	function repartoTipico(u) {
		var sp = u && u.spreads || {};
		var mejor = null, max = -1;
		for (var k in sp) if (sp[k] > max) { max = sp[k]; mejor = k; }
		if (!mejor) return null;
		var m = /^(\w+):(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)$/.exec(mejor);
		return m ? { nat: m[1], evs: { hp: +m[2], atk: +m[3], def: +m[4], spa: +m[5], spd: +m[6], spe: +m[7] } } : null;
	}
	function listaVelocidades(sets, d, fmt, scarf) {
		var nivel = nivelFormato(fmt);
		var filas = [];
		sets.forEach(function (s) {
			var sp = especie(s.species);
			if (!sp || !sp.exists) return;
			var ev = (s.evs && s.evs.spe) || 0, iv = s.ivs && s.ivs.spe !== undefined ? s.ivs.spe : 31;
			var v = velocidad(sp.baseStats.spe, ev, iv, s.level || nivel, s.nature);
			var lleva = toId(s.item) === 'choicescarf';
			if (scarf && !lleva) v = Math.floor(v * 1.5);
			filas.push({ nombre: sp.name, v: v, mio: true, txt: (s.nature || 'Serious') + ' ' + ev + (lleva ? ' · Scarf' : scarf ? ' · +Scarf' : '') });
		});
		var p = d && d.pokemon || {};
		var top = Object.keys(p).sort(function (a, b) { return p[b].usage.weighted - p[a].usage.weighted; }).slice(0, 16);
		top.forEach(function (n) {
			if (filas.some(function (f) { return f.mio && toId(f.nombre) === toId(n); })) return;
			var sp = especie(n);
			if (!sp || !sp.exists) return;
			var r = repartoTipico(p[n]) || { nat: 'Serious', evs: { spe: 0 } };
			filas.push({ nombre: sp.name, v: velocidad(sp.baseStats.spe, r.evs.spe, 31, nivel, r.nat), mio: false, txt: r.nat + ' ' + r.evs.spe });
		});
		filas.sort(function (a, b) { return b.v - a.v; });
		return filas;
	}

	/* ---------------- completar ---------------- */
	function sugerencias(sets, d, an) {
		var p = d && d.pokemon || {};
		var mios = sets.map(function (s) { return toId(s.species); });
		var puntos = {};
		an.miembros.forEach(function (m) {
			var u = usoDe(d, m.nombre);
			var tm = u && u.teammates || {};
			for (var k in tm) {
				if (mios.indexOf(toId(k)) >= 0 || tm[k] <= 0) continue;
				puntos[k] = (puntos[k] || 0) + tm[k];
			}
		});
		var n = Math.max(1, an.miembros.length);
		var fallos = an.tabla.filter(function (r) { return r.deb.length >= 2 && r.deb.length > r.res.length + r.inm.length; }).map(function (r) { return r.tipo; });
		var lista = Object.keys(puntos).map(function (k) {
			var sp = especie(k);
			if (!sp || !sp.exists || !p[k]) return null;
			var u = p[k];
			var razones = [];
			var hab = Object.keys(u.abilities || {})[0] || '';
			var arregla = fallos.filter(function (t) { return factor(t, sp.types, hab) < 1; });
			if (arregla.length) razones.push('Resists ' + arregla.join(' and '));
			var movs = Object.keys(u.moves || {});
			if (!an.quita && movs.slice(0, 8).some(function (m) { return QUITA_TRAMPAS.indexOf(toId(m)) >= 0; })) razones.push('quita trampas');
			if (sp.baseStats.spe >= 110) razones.push('very fast');
			if (!an.prio && movs.slice(0, 8).some(function (m) { var dm = Dex.moves.get(m); return dm && dm.priority > 0 && dm.category !== 'Status'; })) razones.push('has priority');
			var junto = puntos[k] / n;
			return { nombre: sp.name, tipos: sp.types, junto: junto, razones: razones, nota: junto + arregla.length * 0.05 + razones.length * 0.02 };
		}).filter(Boolean);
		lista.sort(function (a, b) { return b.nota - a.nota; });
		return lista.slice(0, 8);
	}
	function setMasUsado(u, nombre) {
		function mejor(o) { var m = null, x = -1; for (var k in o || {}) if (o[k] > x && k !== 'Nothing' && k !== '') { x = o[k]; m = k; } return m; }
		var movs = Object.keys(u.moves || {}).filter(function (m) { return m && m !== 'Nothing'; })
			.sort(function (a, b) { return u.moves[b] - u.moves[a]; }).slice(0, 4);
		var r = repartoTipico(u);
		var set = { name: '', species: nombre, item: mejor(u.items) || '', ability: mejor(u.abilities) || '', moves: movs.map(function (m) { var d = Dex.moves.get(m); return d && d.exists ? d.name : m; }) };
		var it = Dex.items.get(set.item); if (it && it.exists) set.item = it.name;
		var ab = Dex.abilities.get(set.ability); if (ab && ab.exists) set.ability = ab.name;
		if (r) { set.nature = r.nat; set.evs = r.evs; }
		var tera = mejor(u.teraTypes);
		if (tera) set.teraType = tera;
		return set;
	}
	function anadir(nombre) {
		var s = salaEquipo();
		if (!s) return;
		var fmt = formatoDe(s);
		var sets = setsDe(s);
		if (sets.length >= 6) { aviso('The team already has 6'); return; }
		var u = usoDe(USO[fmt], nombre);
		if (!u) return;
		var set = setMasUsado(u, nombre);
		try {
			if (s.room.editor && s.room.editor.sets) {
				s.room.editor.sets.push(set);
				s.room.editor.save();
			} else {
				var lista = Teams.unpack(s.team.packedTeam) || [];
				lista.push(set);
				s.team.packedTeam = Teams.pack(lista);
			}
			ps().teams.save();
			s.room.update(null);
			aviso(nombre + ' added with its most used set');
		} catch (e) { aviso('Couldn\'t add it'); }
		if (window.__thorEquipo.cambio) window.__thorEquipo.cambio();
	}


	function aviso(t) {
		try { if (window.__thor && __thor.toast) { __thor.toast(t, 2000); return; } } catch (e) { /* nada */ }
	}

	/** HTML de la ayuda para el equipo abierto (null si no estás editando un equipo). */
	function html(pestana, scarf) {
		var s = salaEquipo();
		if (!s) return null;
		var fmt = formatoDe(s);
		var sets = setsDe(s);
		var h = '<div class="sdq-pest">' + [['resumen', 'SUMMARY'], ['completar', 'COMPLETE'], ['velocidad', 'SPEED']].map(function (p) {
			return '<button type="button" data-sdq="' + p[0] + '"' + (pestana === p[0] ? ' class="on"' : '') + '>' + p[1] + '</button>';
		}).join('') + '</div>';
		h += '<div class="sdq-equipo"><b>' + esc(s.team.name || 'Team') + '</b> <small>' + esc(fmt || 'no format') + '</small></div>';
		if (!fmt || /random/.test(fmt)) return h + '<p class="sdq-nota">Pick a format with teams first (OU, Monotype, Ubers…).</p>';
		if (!USO[fmt] || USO[fmt] === 'cargando') {
			cargarUso(fmt, function () { if (window.__thorEquipo.cambio) window.__thorEquipo.cambio(); });
			return h + '<p class="sdq-nota">Loading usage stats for ' + esc(fmt) + '…</p>';
		}
		var d = USO[fmt];
		var an = analizar(sets);
		if (d.error) h += '<p class="sdq-nota">No usage stats for this format (or no connection). Type coverage still works.</p>';
		if (pestana === 'completar') {
			var sug = sugerencias(sets, d, an);
			h += '<p class="sdq-nota">Most common partners of your Pokémon in ' + esc(fmt) + ' and what they fix. «+» adds one with its most used set.</p>';
			h += sug.length ? sug.map(function (x) {
				return '<div class="sdq-sug">' + icono(x.nombre) + '<div class="sdq-sug-t"><b>' + esc(x.nombre) + '</b> ' + x.tipos.map(tipoChip).join('') +
					'<small>' + (x.razones.length ? esc(x.razones.join(' · ')) : 'common teammate') + '</small>' +
					'<span class="sdq-barra-uso"><i style="width:' + Math.min(100, Math.round(x.junto * 100)) + '%"></i></span><small>paired with yours ' + pct(x.junto) + '</small></div>' +
					(sets.length < 6 ? '<button type="button" class="sdq-mas" data-sdq="add:' + esc(x.nombre) + '">+</button>' : '') + '</div>';
			}).join('') : '<p class="sdq-nota">Add some Pokémon and I\'ll suggest partners.</p>';
		} else if (pestana === 'velocidad') {
			var filas = listaVelocidades(sets, d, fmt, scarf);
			h += '<div class="sdq-toggle"><button type="button" data-sdq="scarf" class="' + (scarf ? '' : 'on') + '">Normal</button><button type="button" data-sdq="scarf" class="' + (scarf ? 'on' : '') + '">Yours with Choice Scarf</button></div>';
			h += filas.map(function (f) {
				return '<div class="sdq-vel' + (f.mio ? ' mio' : '') + '">' + icono(f.nombre) + '<b>' + esc(f.nombre) + (f.mio ? ' (you)' : '') + '</b><small>' + esc(f.txt) + '</small><span>' + f.v + '</span></div>';
			}).join('');
			h += '<p class="sdq-nota">The format\'s most used Pokémon with their usual spread. Yours, with your EVs and nature.</p>';
		} else {
			h += '<div class="sdq-miembros">' + an.miembros.map(function (m) {
				var u = usoDe(d, m.nombre);
				return '<div>' + icono(m.nombre) + '<b>' + esc(m.nombre) + '</b><small>' + (u ? 'usage ' + pct(u.usage.weighted) : '') + '</small></div>';
			}).join('') + '</div>';
			h += an.avisos.length ? '<div class="sdq-avisos">' + an.avisos.map(function (a) { return '<div>⚠ ' + a + '</div>'; }).join('') + '</div>'
				: (an.miembros.length ? '<div class="sdq-bien">✓ No obvious type holes</div>' : '<p class="sdq-nota">The team is empty.</p>');
			h += '<div class="sdq-tabla"><div class="sdq-fila sdq-th"><span>TYPE</span><span>WEAK</span><span>RESIST</span></div>' + an.tabla.map(function (r) {
				var malo = r.deb.length >= 3 || (r.deb.length >= 2 && !r.res.length && !r.inm.length);
				return '<div class="sdq-fila' + (malo ? ' sdq-malo' : '') + '"><span>' + tipoChip(r.tipo) + '</span>' +
					'<span>' + r.deb.map(function () { return '<i class="sdq-p d"></i>'; }).join('') + '</span>' +
					'<span>' + r.res.map(function () { return '<i class="sdq-p r"></i>'; }).join('') +
					r.inm.map(function () { return '<i class="sdq-p i"></i>'; }).join('') + '</span></div>';
			}).join('') + '</div><p class="sdq-ley"><i class="sdq-p d"></i> weak <i class="sdq-p r"></i> resists <i class="sdq-p i"></i> immune</p>';
		}
		return h;
	}

	window.__thorEquipo.html = html;
	window.__thorEquipo.anadir = anadir;
	window.__thorEquipo.hay = function () { return !!salaEquipo(); };
})();
