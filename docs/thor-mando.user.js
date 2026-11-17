// ==UserScript==
// @name         Showdown · Mando para AYN Thor
// @namespace    david.thor.showdown
// @version      1.1
// @description  Juega a Pokémon Showdown con los botones de la AYN Thor: cruceta/stick para moverte, A/B, ataques, cambios y ver stats.
// @match        https://play.pokemonshowdown.com/*
// @match        https://psim.us/*
// @match        https://*.psim.us/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
  MAPEO (medido en tu Thor: "Odin Controller", mapping standard)

    Cruceta / stick izq. ... mover la selección (se mueve "hacia donde apuntas")
    A ...................... aceptar / pulsar el botón seleccionado
    B ...................... atrás / cancelar / cerrar ventana
    X ...................... abrir ATAQUES (Battle)
    Y ...................... abrir CAMBIOS (Switch)
    L1 ..................... FICHA de lo marcado (ataque o Pokémon): sale al
                             pulsarlo y se quita al mover o al pulsar otra vez
    R1 ..................... saltar animación del combate (Skip)
    R2 ..................... MODO INSPECCIÓN: cruceta salta entre Pokémon y
                             sale su ficha (stats, habilidad, tipos, velocidad...)
                             B o R2 otra vez para salir
    L2 ..................... libre
    L3 / R3 (clic de stick)  pestaña anterior / siguiente
    Stick derecho ↑↓ ....... subir / bajar el chat del combate

    Pantalla siempre encendida (Wake Lock) mientras juegas; se suelta tras
    20 min sin tocar nada.
    Start .................. ir a Inicio y volver al combate
    Select ................. mostrar / ocultar esta ayuda
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
	var STICK_DEAD = 0.55;       // zona muerta del stick izquierdo
	var SCROLL_DEAD = 0.25;      // zona muerta del stick derecho
	var SCROLL_SPEED = 26;       // píxeles por frame a tope de stick
	var REPEAT_FIRST = 380;      // ms hasta que empieza a repetir al mantener
	var REPEAT_NEXT = 120;       // ms entre repeticiones
	var IDLE_AUTOFOCUS = 60000;  // ms sin tocar el mando y deja de auto-seleccionar
	var WAKE_IDLE = 20 * 60000;  // ms sin tocar nada y se suelta la pantalla encendida

	/* ------------------------------------------------------------------ *
	 *  Estilo
	 * ------------------------------------------------------------------ */
	var css = [
		'.tg-focus{outline:3px solid #ffe14a !important;outline-offset:2px !important;',
		'box-shadow:0 0 0 6px rgba(255,225,74,.30),0 0 18px 6px rgba(255,225,74,.55) !important;',
		'border-radius:6px;}',
		'.tg-focus.tg-big{outline-width:2px !important;box-shadow:0 0 0 4px rgba(255,225,74,.25) !important;}',
		'#tg-hud{position:fixed;left:8px;top:8px;z-index:2147483000;max-width:calc(100vw - 16px);',
		'padding:6px 12px;border-radius:999px;background:rgba(18,18,24,.92);color:#fff;',
		'font:600 14px/1.25 system-ui,"Atkinson Hyperlegible",sans-serif;pointer-events:none;',
		'border:2px solid #ffe14a;opacity:0;transition:opacity .15s;white-space:nowrap;}',
		'#tg-hud.on{opacity:1;}',
		'#tg-help{position:fixed;inset:0;z-index:2147483001;display:none;align-items:center;justify-content:center;',
		'background:rgba(0,0,0,.55);}',
		'#tg-help.on{display:flex;}',
		'#tg-help div{background:#15161c;color:#f2f2f2;border:2px solid #ffe14a;border-radius:14px;',
		'padding:14px 20px;font:500 15px/1.55 system-ui,"Atkinson Hyperlegible",sans-serif;max-width:92vw;max-height:92vh;overflow:auto;}',
		'#tg-help b{color:#ffe14a;display:inline-block;min-width:5.2em;}',
		'#tg-help h3{margin:0 0 6px;font-size:17px;color:#ffe14a;}',
		'#tg-help small{opacity:.7;display:block;margin-top:6px;}'
	].join('');
	var styleEl = document.createElement('style');
	styleEl.textContent = css;
	(document.head || document.documentElement).appendChild(styleEl);

	var hud = document.createElement('div');
	hud.id = 'tg-hud';
	var help = document.createElement('div');
	help.id = 'tg-help';
	help.innerHTML = '<div><h3>🎮 Mando Thor · Showdown</h3>' +
		'<b>Cruceta</b> mover la selección<br>' +
		'<b>A</b> aceptar &nbsp; <b>B</b> atrás / cerrar<br>' +
		'<b>X</b> ataques &nbsp; <b>Y</b> cambios<br>' +
		'<b>L1</b> ficha de lo marcado (ataque / Pokémon)<br>' +
		'<b>R1</b> saltar animación<br>' +
		'<b>R2</b> inspeccionar Pokémon (ver stats)<br>' +
		'<b>L3 / R3</b> pestaña anterior / siguiente<br>' +
		'<b>Stick der.</b> subir / bajar el chat<br>' +
		'<b>Start</b> Inicio ⇄ combate<br>' +
		'<b>Select</b> esta ayuda' +
		'<small id="tg-wake"></small>' +
		'<small>Pulsa Select o B para cerrar</small></div>';
	function mountUI() {
		if (!hud.isConnected) document.body.appendChild(hud);
		if (!help.isConnected) document.body.appendChild(help);
	}
	if (document.body) mountUI(); else document.addEventListener('DOMContentLoaded', mountUI);

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
		lastTabHref: null
	};

	/* ------------------------------------------------------------------ *
	 *  Utilidades de DOM
	 * ------------------------------------------------------------------ */
	var SEL = 'button, a[href], a.roomtab, input:not([type=hidden]), select, textarea, summary, ' +
		'label.megaevo, [role=button], [role=tab], [data-cmd], [data-href], .button, [tabindex]:not([tabindex="-1"])';
	var NEST_PARENT = 'button, a[href], [role=button], [role=tab]';

	function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

	function shown(el) {
		if (!el || !el.isConnected) return false;
		var r = el.getBoundingClientRect();
		if (r.width < 2 || r.height < 2) return false;
		var cs = getComputedStyle(el);
		if (cs.visibility === 'hidden' || cs.display === 'none') return false;
		return true;
	}
	function onScreen(r) {
		return r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
	}
	function ignoreHit(e) {
		return e.closest && (e.closest('#tooltipwrapper') || e.closest('#tg-hud') || e.closest('#tg-help'));
	}
	function reachable(el, r) {
		var l = Math.max(r.left, 0), t = Math.max(r.top, 0);
		var rr = Math.min(r.right, innerWidth), bb = Math.min(r.bottom, innerHeight);
		if (rr - l < 2 || bb - t < 2) return false;
		var stack = document.elementsFromPoint((l + rr) / 2, (t + bb) / 2);
		for (var i = 0; i < stack.length; i++) {
			if (ignoreHit(stack[i])) continue;
			return stack[i] === el || el.contains(stack[i]);
		}
		return false;
	}
	function isTextField(el) {
		if (!el) return false;
		var tag = el.tagName;
		if (tag === 'TEXTAREA') return true;
		if (tag === 'INPUT') {
			var t = (el.type || 'text').toLowerCase();
			return !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/.test(t);
		}
		return !!el.isContentEditable;
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
			var el = all[i];
			if (el.id === 'tg-hud' || el.closest('#tg-help')) continue;
			if (el.disabled) continue;
			if (el.matches('input') && el.closest('label.megaevo')) continue; // el label ya vale
			var p = el.parentElement && el.parentElement.closest(NEST_PARENT);
			if (p && scope.contains(p) && p !== el) continue; // botón dentro de otro botón
			if (!shown(el)) continue;
			var r = el.getBoundingClientRect();
			if (includeOff) {
				if (!onScreen(r) && el.closest('.tablist, #header')) continue;
			} else if (!onScreen(r) || !reachable(el, r)) continue;
			out.push(el);
		}
		return out;
	}

	/** ¿Hay de verdad un Pokémon en ese hueco del campo? (Showdown pinta 6 huecos siempre) */
	function slotOccupied(el) {
		var m = /^activepokemon\|(\d+)\|(\d+)/.exec(el.getAttribute('data-tooltip') || '');
		if (!m) return true;
		try {
			var roomEl = el.closest('.ps-room');
			var id = roomEl && roomEl.id ? roomEl.id.replace(/^room-/, '') : '';
			var room = window.PS && PS.rooms && PS.rooms[id];
			var battle = room && room.battle;
			if (!battle) return true;
			var side = battle.sides[(+battle.viewpointSwitched) ^ (+m[1])];
			var idx = +m[2];
			if (idx >= 1 && battle.sides.length > 2) side = battle.sides[side.n + 2];
			return !!(side && side.active && side.active[idx]);
		} catch (e) { return true; }
	}

	/** Pokémon / campo con ficha (tooltip) para el modo inspección. */
	function inspectables() {
		var out = [];
		var all = document.querySelectorAll('.has-tooltip[data-tooltip]');
		for (var i = 0; i < all.length; i++) {
			var el = all[i];
			var tt = el.getAttribute('data-tooltip') || '';
			if (!/^(pokemon\||activepokemon\||field)/.test(tt)) continue;
			if (el.closest('.ps-popup')) continue;
			if (!shown(el)) continue;
			var r = el.getBoundingClientRect();
			if (!onScreen(r)) continue;
			if (!slotOccupied(el)) continue;
			if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
			out.push(el);
		}
		return out;
	}

	function rectOf(el) { return el.getBoundingClientRect(); }

	function signature(el) {
		return [el.tagName, el.getAttribute('data-cmd') || '', el.getAttribute('data-tooltip') || '',
			el.getAttribute('href') || '', (el.textContent || '').trim().slice(0, 24)].join('|');
	}

	/* ------------------------------------------------------------------ *
	 *  Navegación espacial
	 * ------------------------------------------------------------------ */
	function pickDirection(from, dir, list) {
		var fr = rectOf(from);
		var fcx = (fr.left + fr.right) / 2, fcy = (fr.top + fr.bottom) / 2;
		var best = null, bestScore = Infinity;
		for (var i = 0; i < list.length; i++) {
			var el = list[i];
			if (el === from || from.contains(el) || el.contains(from)) continue;
			var r = rectOf(el);
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
			if (score < bestScore) { bestScore = score; best = el; }
		}
		return best;
	}

	/* ------------------------------------------------------------------ *
	 *  Selección
	 * ------------------------------------------------------------------ */
	function setCur(el) {
		if (state.cur && state.cur !== el) {
			state.cur.classList.remove('tg-focus', 'tg-big');
			if (state.cur.blur && document.activeElement === state.cur) state.cur.blur();
		}
		state.cur = el || null;
		if (!el) { state.curSig = null; return; }
		state.curSig = signature(el);
		state.curRect = rectOf(el);
		el.classList.add('tg-focus');
		if (state.curRect.width > 150 && state.curRect.height > 90) el.classList.add('tg-big');
		// Enfocar un ataque / Pokémon hace que Showdown abra su ficha sola. Fuera del
		// modo inspección no queremos eso: la ficha sale solo con L1. Los campos de
		// texto tampoco se enfocan al marcarlos (solo con A), para no abrir el teclado.
		if (state.inspect || !(isTextField(el) || el.matches('.has-tooltip[data-tooltip]'))) {
			try { el.focus({ preventScroll: true }); } catch (e) { /* nada */ }
		}
		try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* nada */ }
		state.curRect = rectOf(el);
	}
	function clearCur() { setCur(null); }

	function firstVisible(sel) {
		var list = document.querySelectorAll(sel);
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
			'button[data-cmd^="/move "]:not(.movebutton):not(.disabled)',
			'.movecontrols .movebutton:not(.disabled)',
			'.switchcontrols .switchmenu button:not(.disabled)',
			'.overlay-controls-list .move-button',
			'.overlay-controls-list button',
			'button.mainmenu1',
			'.whatdo button',
			'.switchmenu button:not(.disabled)',
			'.movemenu button:not(.disabled)'
		];
		for (var i = 0; i < prefs.length; i++) {
			var el = firstVisible(prefs[i]);
			if (el && list.indexOf(el) >= 0) return el;
		}
		// lo más cercano al centro de la pantalla, sin contar las pestañas
		var cx = innerWidth / 2, cy = innerHeight / 2, best = null, bd = Infinity;
		for (var j = 0; j < list.length; j++) {
			var e = list[j];
			if (e.classList.contains('roomtab') || e.closest('.tablist, #header')) continue;
			var r = rectOf(e);
			var d = Math.hypot((r.left + r.right) / 2 - cx, (r.top + r.bottom) / 2 - cy);
			if (d < bd) { bd = d; best = e; }
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

	function ensureCur() {
		if (state.helpOpen) return;
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
	 *  Acciones
	 * ------------------------------------------------------------------ */
	function settleSoon() {
		setTimeout(settle, 140);
		setTimeout(settle, 650);
	}
	function settle() {
		if (state.inspect) return;
		var c = state.cur;
		// Tras abrir "Battle" / "Switch", saltar directamente al primer ataque / Pokémon
		if (c && c.isConnected) {
			var cmd = c.getAttribute && c.getAttribute('data-cmd');
			if (cmd === '/movemenu') {
				var mv = firstVisible('.movecontrols .movebutton:not(.disabled)');
				if (mv) { setCur(mv); return; }
			} else if (cmd === '/switchmenu') {
				var sw = firstVisible('.switchcontrols .switchmenu button:not(.disabled)');
				if (sw) { setCur(sw); return; }
			}
		}
		if (!currentValid()) reacquire();
	}

	function confirm() {
		if (state.helpOpen) { toggleHelp(false); return; }
		var el = state.cur;
		if (!currentValid()) { ensureCur(); return; }
		if (state.inspect) return;
		var tag = el.tagName;
		if (isTextField(el) || tag === 'SELECT') {
			el.focus();
			if (tag === 'SELECT') el.click();
			return;
		}
		el.click();
		settleSoon();
	}

	function closePopupIfAny() {
		var pop = popupScope();
		if (!pop) return false;
		var ov = pop.closest('.ps-overlay');
		if (ov) { ov.click(); return true; }
		try { if (window.PS && PS.closePopup) { PS.closePopup(); return true; } } catch (e) { /* nada */ }
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
		if (back2) { back2.click(); settleSoon(); }
	}

	function openMenu(cmd, itemSel) {
		if (state.helpOpen) return;
		if (state.inspect) setInspect(false);
		var btn = firstVisible('.overlay-controls-list button[data-cmd="' + cmd + '"]') ||
			firstVisible('button[data-cmd="' + cmd + '"]');
		if (!btn) { toast('Ahora no se puede', 1200); return; }
		if (!btn.classList.contains('cur')) btn.click();
		setCur(btn);
		settleSoon();
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
			reacquire();
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

	/**
	 * Quita la ficha usando la propia función de Showdown. (En la 1.0 yo vaciaba y
	 * ocultaba #tooltipwrapper a mano y Showdown ya no volvía a mostrarlo: ese era el
	 * fallo de "ya no veo ni ataques ni Pokémon".)
	 */
	function hideTooltip() {
		try {
			if (typeof BattleTooltips !== 'undefined' && BattleTooltips.hideTooltip) { BattleTooltips.hideTooltip(); return; }
		} catch (e) { /* nada */ }
		try {
			var ae = document.activeElement;
			if (ae && ae.matches && ae.matches('.has-tooltip')) ae.blur();
		} catch (e) { /* nada */ }
	}

	/** Quita la ficha que sacó L1 (en modo inspección la gestiona el propio modo). */
	function hideInfo() {
		if (state.inspect || !tooltipVisible()) return;
		var ae = document.activeElement;
		if (ae && ae.matches && ae.matches('.has-tooltip')) { try { ae.blur(); } catch (e) { /* nada */ } }
		hideTooltip();
	}

	/** L1: ficha del ataque / Pokémon marcado. Otra pulsación (o mover) la quita. */
	function toggleInfo() {
		if (state.helpOpen || state.inspect) return;
		if (tooltipVisible()) { hideInfo(); return; }
		if (!currentValid()) ensureCur();
		var el = state.cur;
		var tip = el && (el.matches('.has-tooltip[data-tooltip]') ? el : el.closest('.has-tooltip[data-tooltip]'));
		if (!tip) { toast('Esto no tiene ficha', 1100); return; }
		try {
			if (document.activeElement === tip) tip.blur();
			tip.focus({ preventScroll: true });
		} catch (e) { /* nada */ }
		if (!tooltipVisible()) toast('Esto no tiene ficha', 1100);
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

	function goHome() {
		var home = document.getElementById('roomtab-');
		if (!home) return;
		var isHome = home.classList.contains('cur') || home.getAttribute('aria-selected') === 'true';
		if (state.inspect) setInspect(false);
		clearCur();
		if (!isHome) {
			var cur = document.querySelector('a.roomtab.cur, a.roomtab[aria-selected="true"]');
			state.lastTabHref = cur ? cur.getAttribute('id') : null;
			home.click();
		} else if (state.lastTabHref) {
			var back = document.getElementById(state.lastTabHref);
			if (back && shown(back)) back.click(); else {
				var t = tabs(); if (t.length > 1) t[t.length - 1].click();
			}
		} else {
			var t2 = tabs(); if (t2.length > 1) t2[t2.length - 1].click();
		}
		settleSoon();
	}

	function skipAnimation() {
		var s = firstVisible('button[data-cmd="/ffto end"]');
		if (s) { s.click(); toast('⏩ Saltando animación', 900); }
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
	 *  Pantalla siempre encendida (Screen Wake Lock)
	 *  Se pide mientras juegas y se suelta tras WAKE_IDLE sin tocar nada.
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
		var logs = document.querySelectorAll('.battle-log, .battle-log-add, .chat-log, .ps-room .scrollable, .pm-log');
		for (var i = 0; i < logs.length; i++) {
			if (!shown(logs[i])) continue;
			if (logs[i].scrollHeight > logs[i].clientHeight + 2) { target = logs[i]; break; }
		}
		if (!target) return;
		target.scrollTop += amount;
	}

	/* ------------------------------------------------------------------ *
	 *  Lectura del mando
	 * ------------------------------------------------------------------ */
	var prev = {};
	var held = {};
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

	/** Cada pulsación del mando pasa por aquí. keepInfo = no quitar la ficha abierta (solo L1). */
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

		var any = up || dn || lf || rt;
		var fired = false;

		if (edge('up', up, now, true)) { touched(); move('up'); fired = true; }
		if (edge('down', dn, now, true)) { touched(); move('down'); fired = true; }
		if (edge('left', lf, now, true)) { touched(); move('left'); fired = true; }
		if (edge('right', rt, now, true)) { touched(); move('right'); fired = true; }

		if (edge('A', down(pad, BTN.A), now)) { touched(); confirm(); fired = true; }
		if (edge('B', down(pad, BTN.B), now)) { touched(); back(); fired = true; }
		if (edge('X', down(pad, BTN.X), now)) { touched(); openMenu('/movemenu'); fired = true; }
		if (edge('Y', down(pad, BTN.Y), now)) { touched(); openMenu('/switchmenu'); fired = true; }
		if (edge('L1', down(pad, BTN.L1), now)) { touched(true); toggleInfo(); fired = true; }
		if (edge('R1', down(pad, BTN.R1), now)) { touched(); skipAnimation(); fired = true; }
		if (edge('R2', down(pad, BTN.R2), now)) { touched(); if (!state.helpOpen) setInspect(!state.inspect); fired = true; }
		if (edge('L3', down(pad, BTN.L3), now)) { touched(); cycleTab(-1); fired = true; }
		if (edge('R3', down(pad, BTN.R3), now)) { touched(); cycleTab(1); fired = true; }
		if (edge('START', down(pad, BTN.START), now)) { touched(); goHome(); fired = true; }
		if (edge('SELECT', down(pad, BTN.SELECT), now)) { touched(); toggleHelp(); fired = true; }

		if (Math.abs(ay1) > SCROLL_DEAD) {
			touched();
			scrollLog(Math.sign(ay1) * (Math.abs(ay1) - SCROLL_DEAD) / (1 - SCROLL_DEAD) * SCROLL_SPEED);
		}
		if (!fired && !any) { /* nada */ }
	}

	/* Mantiene la selección viva cuando Showdown repinta */
	setInterval(function () {
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
		}
	}, true);
	/* escribir con el teclado también cuenta como "estoy jugando" */
	window.addEventListener('input', activity, true);
	window.addEventListener('keydown', activity, true);

	window.addEventListener('gamepadconnected', function (e) {
		toast('🎮 Mando conectado · Select = ayuda', 2800);
	});
	window.addEventListener('gamepaddisconnected', function () {
		toast('🎮 Mando desconectado', 2000);
	});

	requestAnimationFrame(frame);
	window.__thorMandoState = state;
})();
