// ==UserScript==
// @name         Showdown Thor · mando y pantallas
// @namespace    david.thor.showdown
// @version      2.0
// @description  Juega a Pokémon Showdown con los botones de la AYN Thor: ataque directo con X/Y/A/B, cruceta, equipo con L1, Tera con L3, pantallas propias de Inicio, Buscando rival y Fin de combate.
// @match        https://play.pokemonshowdown.com/*
// @match        https://psim.us/*
// @match        https://*.psim.us/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
  MAPA DE BOTONES (fase 2) — medido en tu Thor: "Odin Controller", mapping standard

  EN COMBATE (cuando te toca elegir)
    Y X / B A ........... ATAQUE DIRECTO: los 4 ataques están en 2×2 en la
                          misma posición que los botones (Y arriba-izq,
                          X arriba-dcha, B abajo-izq, A abajo-dcha)
    Cruceta ............. mueve un cursor por los ataques; con el cursor
                          visible, A confirma el marcado (modo mixto)
    L1 .................. abrir el EQUIPO para cambiar (cruceta elige,
                          A cambia, B vuelve). Si cae un Pokémon se abre solo
    L3 (pulsar stick) ... TERA (activar / desactivar)
    R1 .................. saltar animación
    R2 .................. ficha del marcado / modo inspección
    R3 (pulsar stick) ... pestaña siguiente
    Select .............. deshacer la elección   ·   MANTENER = esta ayuda
    Start ............... Inicio ⇄ combate

  INICIO ................ A buscar combate · L1 / R1 cambiar formato ·
                          Y equipos · X repeticiones · Start ajustes ·
                          B ver el Inicio normal de Showdown
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
		'.tg-focus{outline:3px solid #f2c84b !important;outline-offset:2px !important;',
		'box-shadow:0 0 0 6px rgba(242,200,75,.25),0 0 16px 4px rgba(242,200,75,.4) !important;',
		'border-radius:6px;}',
		'.tg-focus.tg-big{outline-width:2px !important;box-shadow:0 0 0 4px rgba(242,200,75,.22) !important;}',
		'#tg-hud{position:fixed;left:50%;transform:translateX(-50%);top:8px;z-index:2147483000;max-width:calc(100vw - 16px);',
		'padding:6px 16px;border-radius:999px;background:rgba(20,26,48,.95);color:#e9edf4;',
		'font:700 15px/1.25 "Atkinson Hyperlegible",system-ui,sans-serif;pointer-events:none;',
		'border:2px solid #f2c84b;opacity:0;transition:opacity .15s;white-space:nowrap;}',
		'#tg-hud.on{opacity:1;}',
		'#tg-help{position:fixed;inset:0;z-index:2147483001;display:none;align-items:center;justify-content:center;',
		'background:rgba(0,0,0,.6);}',
		'#tg-help.on{display:flex;}',
		'#tg-help > div{background:#1a2343;color:#e9edf4;border:2px solid #2c3656;border-radius:16px;',
		'padding:12px 20px;font:500 14px/1.5 "Atkinson Hyperlegible",system-ui,sans-serif;max-width:94vw;max-height:92vh;overflow:auto;',
		'columns:2 300px;column-gap:28px;}',
		'#tg-help b{color:#f2c84b;display:inline-block;min-width:5.4em;}',
		'#tg-help h3{margin:0 0 4px;font:italic 700 20px/1.1 "Barlow Condensed",system-ui,sans-serif;color:#e9edf4;column-span:all;}',
		'#tg-help h4{margin:8px 0 2px;font:700 13px/1.2 system-ui,sans-serif;letter-spacing:1px;color:#a9b3c7;break-after:avoid;}',
		'#tg-help small{opacity:.75;display:block;margin-top:6px;column-span:all;}'
	].join('');
	var styleEl = document.createElement('style');
	styleEl.id = 'thor-mando-estilo';
	styleEl.textContent = css;
	(document.head || document.documentElement).appendChild(styleEl);

	var hud = el('div');
	hud.id = 'tg-hud';
	var help = el('div', '', '<div><h3>🎮 Mando Thor · Showdown</h3>' +
		'<h4>EN COMBATE</h4>' +
		'<b>Y X / B A</b> ataque directo (2×2)<br>' +
		'<b>Cruceta</b> cursor · A confirma el marcado<br>' +
		'<b>L1</b> equipo para cambiar<br>' +
		'<b>L3</b> Tera<br>' +
		'<b>R1</b> saltar animación<br>' +
		'<b>R2</b> ficha / inspeccionar<br>' +
		'<b>R3</b> pestaña siguiente<br>' +
		'<b>Select</b> deshacer elección<br>' +
		'<b>Start</b> Inicio ⇄ combate<br>' +
		'<h4>INICIO</h4>' +
		'<b>A</b> buscar combate<br>' +
		'<b>L1 / R1</b> cambiar formato<br>' +
		'<b>Y</b> equipos · <b style="min-width:0">X</b> repeticiones<br>' +
		'<b>Start</b> ajustes · <b style="min-width:0">B</b> Inicio normal<br>' +
		'<h4>BUSCANDO · FIN DE COMBATE</h4>' +
		'<b>B</b> cancelar la búsqueda<br>' +
		'<b>A</b> nuevo combate · <b style="min-width:0">Y</b> revancha<br>' +
		'<b>X</b> guardar repetición · <b style="min-width:0">B</b> inicio<br>' +
		'<h4>EN EL RESTO</h4>' +
		'<b>Cruceta</b> mover · <b style="min-width:0">A</b> aceptar · <b style="min-width:0">B</b> atrás<br>' +
		'<b>Stick der.</b> subir / bajar el chat' +
		'<small id="tg-wake"></small>' +
		'<small>Mantén Select (o pulsa B) para cerrar</small></div>');
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
	function cursorDormido() { return !!CURSOR_A_DEMANDA[state.ctx] && !state.cursorOn; }

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
			if (!list.length) { toast('No hay Pokémon que inspeccionar aquí', 1600); return; }
			state.inspect = true;
			var start = null, i;
			for (i = 0; i < list.length; i++) {
				if (/^activepokemon\|1\|/.test(list[i].getAttribute('data-tooltip'))) { start = list[i]; break; }
			}
			if (!start) start = list[0];
			setCur(start);
			toast('🔍 INSPECCIÓN · cruceta: elegir · B / R2: salir', 0);
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
		if (s) { s.click(); toast('⏩ Saltando animación', 900); return; }
		var P = ps(), room = P && P.room;
		if (esCombate(room) && !room.battle.atQueueEnd) {
			try { room.send('/ffto end'); toast('⏩ Saltando animación', 900); } catch (e) { /* nada */ }
		}
	}

	function toggleHelp(force) {
		state.helpOpen = typeof force === 'boolean' ? force : !state.helpOpen;
		mountUI();
		if (state.helpOpen) {
			hideInfo();
			var w = help.querySelector('#tg-wake');
			if (w) w.textContent = '☀ Pantalla encendida: ' + wake.text();
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
		if (!mv) { toast('No hay ataque en esa posición', 1200); return; }
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
			toast(box.checked ? '💎 Tera activado: elige ataque' : 'Tera desactivado', 1400);
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
		toast('↶ Elección deshecha', 1100);
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
		if (f && f.team) partes.push(/monotype/.test(id) ? 'equipo aleatorio de un solo tipo' : 'equipo aleatorio');
		else partes.push('con tu equipo');
		if (f && f.rated === false) partes.push('sin Elo');
		return partes.join(' · ');
	}
	function nombreEquipo() {
		var id = formatoActual();
		var f = datosFormato(id);
		if (f && f.team) return 'Aleatorio';
		var b = botonEquipo();
		var P = ps();
		var t = b && P && P.teams && P.teams.byKey && P.teams.byKey[b.value];
		return t ? t.name : 'sin equipo';
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
		add(formatoActual());
		add(FORMATO_POR_DEFECTO);
		return out;
	}

	function ponerFormato(id) {
		var b = botonFormato();
		if (!b || b.disabled) return false;
		if (toId(b.value.split('@@@')[0]) === id) return true;
		b.value = id;
		b.dispatchEvent(new Event('change'));
		refrescarInicio();
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
			toast('Marca formatos con ★ en la lista de Showdown para cambiar con L1 / R1', 2600);
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
		toast('Búsqueda cancelada', 1200);
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
		toast('Buscando otro combate…', 1500);
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
		toast('💾 Guardando la repetición…', 1800);
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
	 *  Pantallas propias: Inicio, Buscando rival, Fin de combate
	 *  (su aspecto está en el estilo, sección 13)
	 * ------------------------------------------------------------------ */
	var capas = {
		hecho: false,
		montar: function () {
			if (!document.body) return;
			if (!capas.hecho) capas.crear();
			['inicio', 'buscando', 'fin', 'repes', 'l1'].forEach(function (k) {
				if (!capas[k].isConnected) document.body.appendChild(capas[k]);
			});
		},
		crear: function () {
			capas.hecho = true;
			capas.inicio = el('div', 'thor-capa', '' +
				'<div class="thor-usuario"><span class="thor-avatar"></span><span class="thor-nombre-u"></span><span class="thor-elo"></span></div>' +
				'<div class="thor-izq">' +
				'  <div><h1 class="thor-logo">SHOWDOWN</h1><div class="thor-edicion">EDICIÓN THOR</div></div>' +
				'  <div><div class="thor-et">FORMATO · L1 / R1 para cambiar</div>' +
				'  <div class="thor-formato"><button class="thor-flecha" data-thor="formato-prev" aria-label="Formato anterior">◀</button>' +
				'  <button class="thor-chip" data-thor="formato-lista"><b class="thor-f-nombre"></b><small class="thor-f-desc"></small></button>' +
				'  <button class="thor-flecha" data-thor="formato-next" aria-label="Formato siguiente">▶</button></div></div>' +
				'</div>' +
				'<div class="thor-dcha">' +
				'  <button class="thor-btn principal" data-thor="buscar"><span class="thor-letra">A</span><span class="thor-buscar-t">BUSCAR COMBATE</span></button>' +
				'  <button class="thor-btn" data-thor="equipos"><span class="thor-letra">Y</span>EQUIPOS</button>' +
				'  <button class="thor-btn" data-thor="repes"><span class="thor-letra">X</span>REPETICIONES</button>' +
				'  <button class="thor-btn" data-thor="start"><span class="thor-letra">START</span><span class="thor-start-t">AJUSTES</span></button>' +
				'</div>' +
				'<div class="thor-pie">Equipo: <span class="thor-tag thor-equipo"></span> <span>Pulsa A y buscas partida al momento · B: Inicio normal de Showdown</span></div>');
			capas.inicio.id = 'thor-inicio';

			capas.buscando = el('div', 'thor-capa thor-lluvia', '' +
				'<h1 class="thor-titulo">BUSCANDO RIVAL…</h1>' +
				'<div class="thor-pastilla"><i class="thor-giro"></i><span class="thor-b-formato"></span><span class="thor-tiempo"></span></div>' +
				'<div class="thor-roca rival"><div class="thor-figura"></div><span class="thor-nombre">buscando…</span></div>' +
				'<div class="thor-roca yo"><div class="thor-figura"><img alt=""></div><span class="thor-nombre"></span></div>' +
				'<button class="thor-btn thor-cancelar" data-thor="cancelar"><span class="thor-letra">B</span>CANCELAR</button>');
			capas.buscando.id = 'thor-buscando';

			capas.fin = el('div', 'thor-capa', '' +
				'<div class="thor-etiqueta"><span class="thor-vs"></span><span class="thor-elo-c"></span></div>' +
				'<div class="thor-roca yo"><div class="thor-figura"><img alt=""></div><span class="thor-nombre"></span></div>' +
				'<div class="thor-dcha">' +
				'  <button class="thor-btn principal" data-thor="nuevo"><span class="thor-letra">A</span>NUEVO COMBATE</button>' +
				'  <button class="thor-btn" data-thor="revancha"><span class="thor-letra">Y</span>REVANCHA</button>' +
				'  <button class="thor-btn" data-thor="guardar"><span class="thor-letra">X</span>GUARDAR REPETICIÓN</button>' +
				'  <button class="thor-btn" data-thor="inicio"><span class="thor-letra">B</span>VOLVER AL INICIO</button>' +
				'</div>' +
				'<div class="thor-pie"><span>Select: ver el combate</span></div>');
			capas.fin.id = 'thor-fin';

			capas.repes = el('div', 'thor-capa', '' +
				'<h2>REPETICIONES</h2><div class="thor-lista"></div>' +
				'<div class="thor-pie"><span>A: ver la repetición · B: volver</span></div>');
			capas.repes.id = 'thor-repes';

			capas.l1 = el('button', '', '<span class="thor-letra">L1</span>EQUIPO');
			capas.l1.id = 'thor-l1';
			capas.l1.setAttribute('data-thor', 'equipo');
			capas.l1.setAttribute('tabindex', '-1');

			['inicio', 'buscando', 'fin', 'repes', 'l1'].forEach(function (k) {
				capas[k].hidden = true;
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
		texto(c.querySelector('.thor-nombre-u'), u.named ? u.name : 'Sin usuario');
		var av = c.querySelector('.thor-avatar');
		var url = u.named ? 'url("' + avatarUrl(u.avatar) + '")' : '';
		if (av.style.backgroundImage !== url) av.style.backgroundImage = url;
		var id = formatoActual();
		texto(c.querySelector('.thor-f-nombre'), nombreFormato(id));
		texto(c.querySelector('.thor-f-desc'), descFormato(id));
		texto(c.querySelector('.thor-equipo'), nombreEquipo());
		var hay = combateAbierto();
		texto(c.querySelector('.thor-start-t'), hay ? 'VOLVER AL COMBATE' : 'AJUSTES');
		var bt = c.querySelector('.thor-buscar-t');
		texto(bt, !u.named ? 'ENTRAR' : P.isOffline ? 'SIN CONEXIÓN' : 'BUSCAR COMBATE');
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
		texto(c.querySelector('.thor-tiempo'), cuenta ? 'en ' + cuenta + '…' : mmss(Date.now() - state.busquedaDesde));
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
		texto(c.querySelector('.thor-vs'), 'vs ' + rival + ' · ' + (b.turn || 0) + ' turnos');
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

	function pintar() {
		var P = ps();
		if (!P || !document.body) return;
		mountUI();
		parchearBusqueda();
		var antes = state.ctx;
		var ctx = contexto();
		state.ctx = ctx;
		var room = P.room;
		var base = ctx === 'popup' || ctx === 'ayuda' || ctx === 'inspect' ? state.ctxBase || 'generico' : ctx;
		if (!(ctx === 'popup' || ctx === 'ayuda' || ctx === 'inspect')) state.ctxBase = ctx;

		var verInicio = base === 'inicio', verBusca = base === 'buscando', verFin = base === 'fin';
		if (capas.inicio.hidden === verInicio) capas.inicio.hidden = !verInicio;
		if (capas.buscando.hidden === verBusca) capas.buscando.hidden = !verBusca;
		if (capas.fin.hidden === verFin) capas.fin.hidden = !verFin;
		if (verInicio) pintarInicio(P);
		if (verBusca) pintarBuscando(P);
		if (verFin) pintarFin(P, room);
		if (!verBusca && antes === 'buscando' && ctx !== 'popup') state.busquedaDesde = 0;

		if (esCombate(room)) {
			state.ultimaSalaCombate = room.id;
			if (room.request !== state.reqVisto) {          // turno nuevo: sin cursor (ataque directo)
				state.reqVisto = room.request;
				state.cursorOn = false;
				state.finOculto = false;
				if (state.cur && !state.inspect) clearCur();
			}
			if (ctx === 'ataques') { abrirAtaquesSolos(room); marcarEficacias(room); }
			colocarL1(ctx === 'ataques' ? room : null);
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
	var PESTANAS = ['calc', 'rival', 'equipo', 'chat'];
	var dos = { hay: false, ultimo: '', enviadoEn: 0, pestana: leer('thor_pestana', 'calc'), l2: false, reset: 0 };

	function hayAbajo() { try { return !!(window.ThorDos && window.ThorDos.hayAbajo()); } catch (e) { return false; } }
	function enviarAbajo(obj) { try { window.ThorDos.enviar(JSON.stringify(obj)); } catch (e) { /* nada */ } }

	function abajoCambia(hay) {
		dos.hay = !!hay;
		dos.ultimo = '';
		document.documentElement.classList.toggle('thor-dos', dos.hay);
		enviarEstado(true);
	}

	function cambiarPestana(delta) {
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
		if (m.pestana && PESTANAS.indexOf(m.pestana) >= 0) { dos.pestana = m.pestana; guardar('thor_pestana', dos.pestana); enviarEstado(true); }
		if (typeof m.chat === 'string' && m.chat.trim()) {
			var P = ps();
			var room = P && P.room;
			if (room && room.send && room.id !== '') {
				try { room.send(m.chat.trim()); toast('💬 Enviado', 900); } catch (e) { /* nada */ }
			} else toast('Abre un combate para escribir en su chat', 1600);
		}
		if (m.accion) accion(m.accion);
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
		var activoYo = b.nearSide && b.nearSide.active[idx];
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
		return {
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
		return t.join(' · ') || md.name;
	}

	/** Últimas líneas del registro del combate (como las pinta Showdown). */
	function lineasChat(room) {
		var cont = salaEl(room);
		var log = cont && cont.querySelector('.battle-log .inner, .battle-log .message-log');
		if (!log) return [];
		var out = [];
		var hijos = log.children;
		var jugadores = [room.battle.nearSide && room.battle.nearSide.name, room.battle.farSide && room.battle.farSide.name].map(toId);
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
			out.push({ tipo: tipo, quien: quien, jugador: !!quien && jugadores.indexOf(toId(quien)) >= 0, texto: t.slice(0, 300) });
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
	function apuntarHistorial(room) {
		var b = room.battle;
		var g = ganador(b);
		if (g === null) return;
		var h = leer('thor_historial', []);
		var e = null;
		for (var i = 0; i < h.length; i++) if (h[i].id === room.id) e = h[i];
		var elo = cambioElo(room);
		if (e && (e.elo !== null || !elo)) return;
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
		var nuevo = {
			id: room.id, fecha: Date.now(), formato: formatoDeSala(room),
			gana: g === '' ? null : toId(g) === toId(yo), rival: b.farSide.name, turnos: b.turn || 0,
			elo: elo ? elo.cambio : null, eloDespues: elo ? elo.despues : null,
			miTipo: tipoComun(b.nearSide), suTipo: tipoComun(b.farSide)
		};
		if (e) h[h.indexOf(e)] = nuevo; else h.unshift(nuevo);
		guardar('thor_historial', h.slice(0, 30));
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
		var pantalla = base === 'inicio' ? 'inicio' : base === 'buscando' ? 'buscando' :
			(base === 'fin' || base === 'fin-oculto') ? 'fin' : esCombate(room) && room.side ? 'combate' :
			esCombate(room) ? 'combate' : 'otro';
		var u = P.user || {};
		var foto = {
			v: 1, pantalla: pantalla, pestana: dos.l2 ? 'rival' : dos.pestana, l2: dos.l2, reset: dos.reset,
			usuario: { nombre: u.named ? u.name : '', avatar: u.named ? avatarUrl(u.avatar) : '' }
		};
		if (pantalla === 'inicio' || pantalla === 'otro') foto.historial = leer('thor_historial', []).slice(0, 8);
		if (pantalla === 'buscando') {
			var eb = equipoBuscando();
			foto.buscando = { formato: nombreFormato(formatoActual()), aleatorio: eb.aleatorio, equipo: eb.equipo, nombreEquipo: eb.nombre || '' };
		}
		if (esCombate(room)) {
			try { foto.combate = datosCombate(room); } catch (e) { foto.combate = null; }
			if (room.battle.ended) {
				try { apuntarHistorial(room); } catch (e) { /* nada */ }
				var elo = cambioElo(room);
				foto.fin = { resumen: resumenFin(room), elo: elo, rival: room.battle.farSide.name, turnos: room.battle.turn || 0 };
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

	function pulsar(nombre) {
		var ctx = state.ctx = contexto();
		if (state.helpOpen) {
			if (nombre === 'B' || nombre === 'A') toggleHelp(false);
			return;
		}
		if (nombre === 'R3' && dos.hay) { cambiarPestana(1); return; }
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
			case 'Y': irA('teambuilder'); return;
			case 'X': abrirRepes(); return;
			case 'B': state.inicioOculto = true; clearCur(); pintar(); toast('Inicio normal de Showdown · B o Start para volver', 2000); return;
			case 'L1': cambiarFormato(-1); return;
			case 'R1': cambiarFormato(1); return;
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

		if (ctx === 'ataques') {
			if (nombre === 'A' && state.cursorOn && currentValid()) { confirm(); return; }
			if (ATAQUE[nombre]) { atacar(ATAQUE[nombre]); return; }
			if (nombre === 'L1') { abrirEquipo(); return; }
			if (nombre === 'L3') { tera(); return; }
		}
		if (ctx === 'cambio') {
			if (nombre === 'A') { if (currentValid()) confirm(); else cursorEnCambios(); return; }
			if (nombre === 'B' || nombre === 'L1') { abrirEquipo(); return; }
			if (nombre === 'X' || nombre === 'Y') return;
		}
		if (ctx === 'cambio-forzado' || ctx === 'equipo-previo' || ctx === 'objetivo') {
			if (nombre === 'A') { if (currentValid()) confirm(); else cursorEnCambios(); return; }
			if (nombre === 'B') { if (ctx !== 'cambio-forzado') deshacer(); return; }
			if (nombre === 'X' || nombre === 'Y' || nombre === 'L1') return;
		}
		if (ctx === 'combate') {
			var sc = salaCombate();
			if (nombre === 'L1') { abrirEquipo(); return; }
			// B cierra el equipo si lo abriste con L1; si no, no hace nada (para deshacer: Select)
			if (nombre === 'B' && sc && sc.overlayActive && !state.cursorOn) { abrirEquipo(); return; }
			if (ATAQUE[nombre] && !(nombre === 'A' && state.cursorOn)) {
				if (sc && sc.request && sc.choices && !sc.choices.isDone() && !sc.battle.atQueueEnd) {
					toast('Espera a que acabe la animación (R1 la salta)', 1500);
				}
				if (nombre !== 'B' || !state.cursorOn) return;
			}
		}
		if (nombre === 'L3' && esCombate(ps() && ps().room)) { tera(); return; }

		// Botones que valen igual en todas partes
		switch (nombre) {
		case 'A': confirm(); break;
		case 'B': back(); break;
		case 'R1': skipAnimation(); break;
		case 'R2': fichaOInspeccion(); break;
		case 'L3': cycleTab(-1); break;
		case 'R3': if (dos.hay) cambiarPestana(1); else cycleTab(1); break;
		}
	}

	function selectCorto() {
		var ctx = state.ctx = contexto();
		if (state.helpOpen) { toggleHelp(false); return; }
		if (ctx === 'fin') { state.finOculto = true; clearCur(); pintar(); toast('Select: volver a las opciones', 1600); return; }
		if (ctx === 'fin-oculto') { state.finOculto = false; pintar(); return; }
		if (COMBATE_ELIGIENDO[ctx] || ctx === 'combate') { deshacer(); return; }
		toast('Mantén Select para ver la ayuda', 1400);
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

		var nombres = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'R2', 'L3', 'R3'];
		for (var i = 0; i < nombres.length; i++) {
			var n = nombres[i];
			if (edge(n, down(pad, BTN[n]), now)) { touched(n === 'R2'); pulsar(n); }
		}
		if (edge('START', down(pad, BTN.START), now)) {
			touched();
			if (state.helpOpen) toggleHelp(false);
			else if (contexto() === 'repes') cerrarRepes();
			else inicioOCombate();
		}

		// mantener L2 = pestaña Rival abajo (mientras lo mantienes)
		var l2 = down(pad, BTN.L2);
		if (l2 !== dos.l2) { dos.l2 = l2; if (l2) touched(true); enviarEstado(true); }

		// Select: pulsar = deshacer · mantener = ayuda
		var s = down(pad, BTN.SELECT);
		if (s && !prev.SELECT) { sel.desde = now; sel.largo = false; touched(); }
		if (s && !sel.largo && now - sel.desde >= HOLD_MS) {
			sel.largo = true;
			if (dos.hay && esCombate(ps() && ps().room) && !state.helpOpen) {
				dos.reset++; enviarEstado(true); toast('Calculadora restablecida', 1200);
			} else toggleHelp();
		}
		if (!s && prev.SELECT && !sel.largo) selectCorto();
		prev.SELECT = s;

		if (Math.abs(ay1) > SCROLL_DEAD) {
			touched(true);
			scrollLog(Math.sign(ay1) * (Math.abs(ay1) - SCROLL_DEAD) / (1 - SCROLL_DEAD) * SCROLL_SPEED);
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
		toast('🎮 Mando listo · mantén Select = ayuda', 2800);
	});
	window.addEventListener('gamepaddisconnected', function () {
		toast('🎮 Mando desconectado', 2000);
	});

	if (document.body) mountUI(); else document.addEventListener('DOMContentLoaded', mountUI);
	requestAnimationFrame(frame);
	window.__thorMandoState = state;
	window.__thor = { contexto: contexto, pintar: pintar, pulsar: pulsar, state: state,
		recibe: recibe, abajoCambia: abajoCambia, instantanea: instantanea, dos: dos };
})();
