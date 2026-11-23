// ==UserScript==
// @name         Showdown móvil v6
// @namespace    david.showdown.movil
// @version      6.0.0
// @description  Va con el estilo v6 del móvil: inicio nuevo en inglés, estado del campo, resumen del turno, ficha del rival, eficacia en los ataques, % en los cambios, cartel del ataque y "Nuevo combate".
// @match        https://play.pokemonshowdown.com/*
// @match        https://psim.us/*
// @match        https://*.psim.us/*
// @run-at       document-idle
// @grant        none
// @inject-into  page
// @downloadURL  https://raw.githubusercontent.com/Davitt3054/Showdown-thor/main/web/movil.user.js
// @updateURL    https://raw.githubusercontent.com/Davitt3054/Showdown-thor/main/web/movil.user.js
// ==/UserScript==

/*
  Sirve igual en la app Showdown (modo móvil) que en Firefox con Violentmonkey.

  QUÉ HACE (solo en pantallas de menos de 600 px, o sea, el móvil en vertical)

  1. Fondos: cada combate sale uno de tus 6 fondos. (En esta versión ligera
     la lista está vacía: se añaden cuando estén subidos a GitHub.)
  2. Cartel del ataque: mientras se anima, sale arriba a la izquierda de la
     escena quién lo usa y el ataque con el color de su tipo.
  3. Eficacia: cada ataque lleva x4 / x2 / x1 / x½ / x0 contra el rival
     (en dobles, contra cada uno). Solo mira los tipos, no habilidades.
  4. Cambios: % de vida de cada Pokémon y "KO" si está debilitado.
     En dobles, al elegir a quién atacar, sale su vida y la eficacia.
  5. Fin del combate: botón grande "Nuevo combate" (en formatos aleatorios
     busca otro directamente; en los de equipo te lleva al menú).
  6. INICIO NUEVO (v6, en inglés como Showdown): la escena del sitio de hoy
     con la luz de la hora, el cartel del sitio (se va a los 3 s), tu
     compañero (tócalo y suelta su grito), "Hello," + tu usuario (tócalo para
     cambiar de usuario), el formato con ◀ ▶, BATTLE!, TEAMBUILDER, LADDER,
     WATCH, TOURNAMENTS y Friends · Find a user · Options.
  7. ESTADO DEL CAMPO (v6): clima, terreno, Trick Room... a la izquierda; las
     trampas y pantallas de cada lado junto a su Pokémon, con sus turnos.
  8. RESUMEN DEL TURNO (v6): lo que pasó en el último turno en una línea,
     entre la escena y el registro.
  9. FICHA DEL RIVAL (v6): botón "Rival ›" bajo su barra: tipos, habilidad,
     objeto, velocidad, ataques vistos y los posibles de Random Battle.

  *** LO QUE PUEDES TOCAR ***
  PORTADA       : el Pokémon del menú. Cambia "umbreon" por otro (en inglés,
                  minúsculas, sin espacios: "gengar", "lucario"...).
  CARTEL_MS     : cuánto dura el cartel del ataque (milisegundos).
*/

(function () {
	'use strict';
	if (window.__v5movil) return;
	window.__v5movil = true;

	var PORTADA = 'umbreon';
	var CARTEL_MS = 1700;

	// Los fondos se añadirán aquí como enlaces (cuando estén subidos a GitHub).
	// Mientras la lista esté vacía, se ven los fondos normales de Showdown.
	var FONDOS = [
	];

	// tono y saturación de cada tipo (los mismos que los botones del estilo)
	var TIPO = {
		Normal: [215, 8], Fighting: [3, 55], Flying: [255, 38], Poison: [300, 40], Ground: [44, 42],
		Rock: [49, 38], Bug: [66, 50], Ghost: [262, 36], Steel: [240, 12], Fire: [25, 60],
		Water: [222, 48], Grass: [100, 42], Electric: [48, 58], Psychic: [342, 50], Ice: [180, 35],
		Dragon: [257, 52], Dark: [24, 22], Fairy: [310, 50], Stellar: [200, 40], '???': [215, 8]
	};

	// dentro de la app no hacen falta los avisos de "script activo"
	var enApp = !!window.__showdownApp;

	function esMovil() { return window.innerWidth <= 600; }
	function ps() { return window.PS || null; }

	// aviso pequeño para saber que el script está funcionando
	function aviso(texto, ms) {
		if (enApp) return;
		var t = document.createElement('div');
		t.textContent = texto;
		t.style.cssText = 'position:fixed;left:50%;bottom:70px;transform:translateX(-50%);z-index:9999;' +
			'padding:6px 14px;border-radius:999px;background:#1f2945;border:1px solid #56627a;color:#eef1f6;' +
			'font:13px sans-serif;pointer-events:none;transition:opacity .4s';
		document.body.appendChild(t);
		setTimeout(function () { t.style.opacity = '0'; }, ms || 2500);
		setTimeout(function () { t.remove(); }, (ms || 2500) + 600);
	}
	var avisado = false;
	setTimeout(function () {
		if (!avisado && esMovil()) aviso('Script v6: no encuentro Showdown (revisa Violentmonkey)', 6000);
	}, 12000);

	function salaDe(el) {
		var r = el && el.closest ? el.closest('.ps-room') : null;
		var P = ps();
		if (!r || !P || !r.id || r.id.indexOf('room-') !== 0) return null;
		return P.rooms[r.id.slice(5)] || null;
	}

	function hash(s) {
		var h = 0;
		for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
		return Math.abs(h);
	}

	function ponAttr(el, nombre, valor) {
		if (valor === null || valor === undefined) {
			if (el.hasAttribute(nombre)) el.removeAttribute(nombre);
		} else if (el.getAttribute(nombre) !== valor) {
			el.setAttribute(nombre, valor);
		}
	}

	/* ------------------------------------------------------------------ *
	 *  1) FONDOS
	 * ------------------------------------------------------------------ */
	function fondo(battleEl, room) {
		if (!FONDOS.length) return;
		if (!battleEl.classList.contains('v5-fondo')) battleEl.classList.add('v5-fondo');
		if (battleEl.__v5fondo) return;
		var i = hash(room ? String(room.id) : String(Math.random())) % FONDOS.length;
		battleEl.style.setProperty('--v5-fondo', 'url("' + FONDOS[i] + '")');
		battleEl.__v5fondo = true;
	}

	/* ------------------------------------------------------------------ *
	 *  2) CARTEL DEL ATAQUE
	 * ------------------------------------------------------------------ */
	function engancharEscena(room, battleEl) {
		var battle = room.battle;
		var scene = battle && battle.scene;
		if (!scene || scene.__v5 || typeof scene.runMoveAnim !== 'function') return;
		scene.__v5 = true;
		var original = scene.runMoveAnim;
		scene.runMoveAnim = function (moveid, participants) {
			try {
				if (this.animating && battle.seeking === null && esMovil()) cartel(battle, battleEl, moveid, participants);
			} catch (e) { /* nunca romper la animación */ }
			return original.apply(this, arguments);
		};
	}

	function cartel(battle, battleEl, moveid, participants) {
		var user = participants && participants[0];
		if (!user) return;
		var dex = battle.dex || window.Dex;
		var move = dex.moves.get(moveid);
		if (!move || !move.exists) return;
		var tipo = move.type || 'Normal';
		var hs = TIPO[tipo] || TIPO.Normal;
		var rival = user.side === battle.farSide;

		var el = battleEl.querySelector(':scope > .v5-cartel');
		if (!el) {
			el = document.createElement('div');
			el.className = 'v5-cartel v5-oculto';
			el.innerHTML = '<div class="v5-cartel-quien"></div><div class="v5-cartel-ataque"><span class="v5-cartel-tipo"></span><span class="v5-cartel-nombre"></span></div>';
			battleEl.appendChild(el);
		}
		el.style.setProperty('--h', hs[0]);
		el.style.setProperty('--s', hs[1] + '%');
		el.querySelector('.v5-cartel-quien').textContent = (user.name || user.speciesForme || '') + (rival ? ' rival' : '');
		el.querySelector('.v5-cartel-tipo').textContent = tipo;
		el.querySelector('.v5-cartel-nombre').textContent = move.name;
		el.classList.remove('v5-oculto');
		clearTimeout(el.__t);
		var acc = (battle.scene && battle.scene.acceleration) || 1;
		el.__t = setTimeout(function () { el.classList.add('v5-oculto'); }, CARTEL_MS / acc);
	}

	/* ------------------------------------------------------------------ *
	 *  3) EFICACIA
	 * ------------------------------------------------------------------ */
	function factor(dex, tipoAtaque, defensor) {
		var tipos;
		try { tipos = defensor.getTypeList(); } catch (e) { return 1; }
		var f = 1;
		for (var i = 0; i < tipos.length; i++) {
			var t = dex.types.get(tipos[i]);
			var d = t && t.damageTaken ? t.damageTaken[tipoAtaque] : 0;
			f *= [1, 2, 0.5, 0][d || 0];
		}
		return f;
	}
	function textoFactor(f) {
		if (f === 0) return 'x0';
		if (f >= 4) return 'x4';
		if (f >= 2) return 'x2';
		if (f === 1) return 'x1';
		if (f >= 0.5) return 'x½';
		return 'x¼';
	}
	function nivelDe(fs) {
		var max = Math.max.apply(null, fs);
		if (max >= 2) return 'fuerte';
		if (max === 0) return 'nulo';
		if (max < 1) return 'debil';
		return 'normal';
	}
	function rivalesVivos(battle) {
		var out = [];
		var act = battle.farSide ? battle.farSide.active : [];
		for (var i = 0; i < act.length; i++) if (act[i] && !act[i].fainted) out.push({ p: act[i], i: i });
		return out;
	}
	function corto(p) {
		return String(p.name || p.speciesForme || '?').slice(0, 3);
	}

	var ultimoAtaque = {};   // por sala: { nombre, tipo }

	function eficaciaAtaques(room, cont) {
		var battle = room.battle;
		if (!battle || !battle.farSide) return;
		var dex = battle.dex || window.Dex;
		var botones = cont.querySelectorAll('.movemenu button.movebutton[data-tooltip]');
		var rivales = rivalesVivos(battle);
		for (var b = 0; b < botones.length; b++) {
			var btn = botones[b];
			var partes = btn.getAttribute('data-tooltip').split('|');
			var move = dex.moves.get(partes[1]);
			var m = /\btype-(\S+)/.exec(btn.className);
			if (!move || !move.exists || move.category === 'Status' || !m || !rivales.length) {
				ponAttr(btn, 'data-v5-ef', null); ponAttr(btn, 'data-v5-nivel', null);
				continue;
			}
			var tipo = m[1];
			var cero = /×/.test((btn.querySelector('.effectiveness-icon') || {}).textContent || '');
			var fs = [], txt = [];
			for (var r = 0; r < rivales.length; r++) {
				var f = cero ? 0 : factor(dex, tipo, rivales[r].p);
				fs.push(f);
				txt.push((rivales.length > 1 ? corto(rivales[r].p) + ' ' : '') + textoFactor(f));
			}
			ponAttr(btn, 'data-v5-ef', txt.join(' · '));
			ponAttr(btn, 'data-v5-nivel', nivelDe(fs));
		}
	}

	/* ------------------------------------------------------------------ *
	 *  4) CAMBIOS: % de vida, KO; objetivos en dobles
	 * ------------------------------------------------------------------ */
	function pctDe(cond) {
		if (!cond) return null;
		if (/fnt/.test(cond)) return 'KO';
		var m = /^(\d+)\/(\d+)/.exec(cond);
		if (!m) return null;
		return Math.max(1, Math.round(100 * (+m[1]) / (+m[2]))) + '%';
	}

	function vidaCambios(room, cont) {
		var req = room.request;
		var equipo = req && req.side && req.side.pokemon;
		var botones = cont.querySelectorAll('.switchmenu button[data-tooltip^="switchpokemon|"]');
		for (var b = 0; b < botones.length; b++) {
			var i = +botones[b].getAttribute('data-tooltip').split('|')[1];
			var p = equipo && equipo[i];
			ponAttr(botones[b], 'data-v5-hp', p ? pctDe(p.condition) : null);
		}
		// dobles: elegir a quién
		var battle = room.battle;
		var objetivos = cont.querySelectorAll('.switchmenu button[data-tooltip^="activepokemon|"]');
		for (var o = 0; o < objetivos.length; o++) {
			var t = objetivos[o].getAttribute('data-tooltip').split('|');
			var lado = t[1] === '1' ? battle.farSide : battle.nearSide;
			var poke = lado && lado.active[+t[2]];
			if (!poke || poke.fainted) { ponAttr(objetivos[o], 'data-v5-hp', null); ponAttr(objetivos[o], 'data-v5-nivel', null); continue; }
			var pct = Math.round(100 * poke.hp / (poke.maxhp || 1)) + '%';
			var ua = ultimoAtaque[room.id];
			if (t[1] === '1' && ua && ua.tipo) {
				var f = factor(battle.dex || window.Dex, ua.tipo, poke);
				ponAttr(objetivos[o], 'data-v5-hp', pct + ' · ' + textoFactor(f));
				ponAttr(objetivos[o], 'data-v5-nivel', nivelDe([f]));
			} else {
				ponAttr(objetivos[o], 'data-v5-hp', pct);
				ponAttr(objetivos[o], 'data-v5-nivel', null);
			}
		}
	}

	// recordar qué ataque tocaste (para la eficacia al elegir objetivo en dobles)
	document.addEventListener('click', function (e) {
		var btn = e.target.closest && e.target.closest('.movemenu button.movebutton');
		if (!btn) return;
		var room = salaDe(btn);
		var m = /\btype-(\S+)/.exec(btn.className);
		if (room && m) {
			var dex = (room.battle && room.battle.dex) || window.Dex;
			var move = dex.moves.get((btn.getAttribute('data-tooltip') || '').split('|')[1]);
			ultimoAtaque[room.id] = { tipo: move && move.category === 'Status' ? null : m[1] };
		}
	}, true);

	/* ------------------------------------------------------------------ *
	 *  5) FIN DEL COMBATE: "Nuevo combate"
	 * ------------------------------------------------------------------ */
	function finCombate(room, cont) {
		var controles = cont.querySelector('.battle-controls');
		if (!controles) return;
		var acabado = !!controles.querySelector('.replayDownloadButton');
		var boton = controles.querySelector(':scope > .v5-nuevo');
		if (!acabado || !room.side) {
			if (boton) boton.remove();
			return;
		}
		if (boton) return;
		var formato = String(room.id).split('-')[1] || '';
		var aleatorio = /random/.test(formato);
		var battle = room.battle;
		boton = document.createElement('button');
		boton.className = 'v5-nuevo';
		boton.type = 'button';
		boton.innerHTML = 'Nuevo combate<small></small>';
		boton.querySelector('small').textContent =
			(battle && battle.farSide ? 'vs ' + battle.farSide.name + ' · ' + battle.turn + ' turnos · ' : '') +
			(aleatorio ? 'buscar otro igual' : 'elige equipo en el menú');
		boton.addEventListener('click', function (e) {
			e.preventDefault(); e.stopPropagation();
			var P = ps();
			if (!P) return;
			if (aleatorio) {
				P.send('/utm ');
				P.send('/search ' + formato);
			}
			P.leave(room.id);
		});
		controles.appendChild(boton);
	}

	/* ------------------------------------------------------------------ *
	 *  6) INICIO NUEVO (en inglés, como Showdown)
	 *     Escena del sitio de hoy con la luz de la hora, cartel del sitio
	 *     (como al entrar en una ruta en los juegos), tu compañero, y la caja:
	 *     Hello + usuario, formato ◀ ▶, BATTLE!, menú y enlaces.
	 *     Debajo sigue el menú de Showdown (oculto): la caja usa sus botones.
	 * ------------------------------------------------------------------ */
	var SITIOS = [
		{ n: 'BEACH', bg: 'beach' }, { n: 'MEADOW', bg: 'meadow' }, { n: 'ROUTE', bg: 'route' },
		{ n: 'FOREST', bg: 'forest' }, { n: 'RIVER', bg: 'river' }, { n: 'CITY', bg: 'city' },
		{ n: 'DESERT', bg: 'desert' }, { n: 'MOUNTAIN', bg: 'mountain' },
		{ n: 'ICE CAVE', bg: 'icecave', cueva: true }, { n: 'CAVE', bg: 'dampcave', cueva: true }
	];
	var FORMATOS_BASE = ['gen9randombattle', 'gen9randomdoublesbattle', 'gen9ou', 'gen9monotype', 'gen9ubers', 'gen9vgc2026regf'];
	var SITIO_MS = 3000;

	function toId(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
	function leer(k, def) { try { var v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
	function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* nada */ } }
	function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
	function poner(el, t) { t = String(t == null ? '' : t); if (el && el.textContent !== t) el.textContent = t; }

	function sitioDeHoy() {
		var d = new Date();
		var dia = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
		return SITIOS[dia % SITIOS.length];
	}
	function luzAhora() {
		var h = new Date().getHours();
		if (h >= 8 && h < 18) return 'dia';
		if (h >= 18 && h < 21) return 'tarde';
		if (h >= 6 && h < 8) return 'alba';
		return 'noche';
	}

	function inicioEl() { return document.getElementById('room-'); }
	function botonFormato() { var m = inicioEl(); return m && m.querySelector('button.formatselect'); }
	function botonEquipo() { var m = inicioEl(); return m && m.querySelector('button.teamselect'); }
	function botonBuscar() { var m = inicioEl(); return m && m.querySelector('button.mainmenu1.big[type="submit"], button.mainmenu1.big'); }
	function datosFormato(id) { try { return (window.BattleFormats && window.BattleFormats[id]) || null; } catch (e) { return null; } }
	function formatoActual() {
		var b = botonFormato();
		return toId((b && b.value || '').split('@@@')[0]) || leer('v6_formato', 'gen9randombattle');
	}
	function nombreFormato(id) {
		var f = datosFormato(id);
		if (f && f.name) return f.name.replace(/^\[Gen \d+\]\s*/, '');
		try { if (window.BattleLog) return BattleLog.formatName(id).replace(/^\[Gen \d+\]\s*/, ''); } catch (e) { /* nada */ }
		return id;
	}
	function listaFormatos() {
		var P = ps(), out = [];
		function add(id) {
			id = toId(id);
			if (!id || out.indexOf(id) >= 0) return;
			var f = datosFormato(id);
			if (window.BattleFormats && (!f || f.searchShow === false)) return;
			out.push(id);
		}
		try {
			var st = (P && P.prefs && P.prefs.starredformats) || {};
			Object.keys(st).filter(function (k) { return st[k] === true; }).forEach(add);
		} catch (e) { /* nada */ }
		leer('v6_recientes', []).forEach(add);
		add(formatoActual());
		FORMATOS_BASE.forEach(add);
		return out;
	}
	function ponerFormato(id) {
		var b = botonFormato();
		if (!b || b.disabled) return false;
		if (toId(b.value.split('@@@')[0]) !== id) {
			b.value = id;
			b.dispatchEvent(new Event('change'));
			try { var P = ps(); if (P.mainmenu && P.mainmenu.update) P.mainmenu.update(null); } catch (e) { /* nada */ }
		}
		guardar('v6_formato', id);
		return true;
	}
	function cambiarFormato(delta) {
		var lista = listaFormatos();
		if (lista.length < 2) return;
		var i = lista.indexOf(formatoActual());
		ponerFormato(lista[(i + delta + lista.length) % lista.length]);
		pintarInicio();
	}
	/** Se apunta el formato de cada búsqueda (para tenerlo a mano con ◀ ▶). */
	function parchearBusqueda() {
		var P = ps(), m = P && P.mainmenu;
		if (!m || m.__v6 || typeof m.startSearch !== 'function') return;
		var orig = m.startSearch;
		m.startSearch = function (format) {
			try {
				var id = toId(String(format || '').split('@@@')[0]);
				var rec = leer('v6_recientes', []).filter(function (x) { return x !== id; });
				rec.unshift(id);
				guardar('v6_recientes', rec.slice(0, 6));
				guardar('v6_formato', id);
			} catch (e) { /* nada */ }
			return orig.apply(this, arguments);
		};
		m.__v6 = true;
	}
	function buscandoFormato() {
		var P = ps(), m = P && P.mainmenu;
		try { return m ? (m.searchingFormat && m.searchingFormat()) || '' : ''; } catch (e) { return ''; }
	}
	function battle() {
		var P = ps();
		if (!P) return;
		if (buscandoFormato()) {
			try { if (P.mainmenu.searchCountdown && P.mainmenu.cancelSearch) P.mainmenu.cancelSearch(); else P.send('/cancelsearch'); } catch (e) { /* nada */ }
			return;
		}
		var b = botonBuscar();
		if (b && !b.disabled) b.click();
		else if (!P.user || !P.user.named) P.join('login');
	}
	function grito() {
		try {
			var P = ps();
			if (P && P.prefs && P.prefs.mute) return;
			var a = new Audio('https://play.pokemonshowdown.com/audio/cries/' + PORTADA + '.mp3');
			a.volume = 0.5;
			a.play().catch(function () { /* nada */ });
		} catch (e) { /* nada */ }
	}

	var inicio = { el: null, visto: false, sitioT: 0 };
	function crearInicio() {
		var s = sitioDeHoy();
		var d = document.createElement('div');
		d.id = 'v6-inicio';
		d.className = 'v6-luz-' + (s.cueva ? 'cueva' : luzAhora());
		d.innerHTML =
			'<div class="v6-escena" style="background-image:url(https://play.pokemonshowdown.com/fx/bg-' + s.bg + '.png)"></div>' +
			'<div class="v6-tinte"></div>' +
			'<div class="v6-sitio">' + esc(s.n) + '</div>' +
			'<button type="button" class="v6-compa" data-v6="compa" aria-label="' + PORTADA + '"><img alt="" src="https://play.pokemonshowdown.com/sprites/gen5ani-back/' + PORTADA + '.gif"></button>' +
			'<div class="v6-caja">' +
			'  <div class="v6-hola"><span>Hello,</span><button type="button" class="v6-nombre" data-href="options"><b></b><small>▾</small></button></div>' +
			'  <div class="v6-reto" hidden><button type="button" data-v6="clasico"></button></div>' +
			'  <div class="v6-formato"><button type="button" class="v6-flecha" data-v6="prev" aria-label="Previous format">◀</button>' +
			'    <button type="button" class="v6-fnombre" data-v6="lista"><small>FORMAT</small><b></b></button>' +
			'    <button type="button" class="v6-flecha" data-v6="next" aria-label="Next format">▶</button></div>' +
			'  <button type="button" class="v6-equipo" data-v6="equipo" hidden><small>TEAM</small><b></b><i>▸</i></button>' +
			'  <button type="button" class="v6-battle" data-v6="battle"><i>▶</i><span><b>BATTLE!</b><small></small></span></button>' +
			'  <div class="v6-menu">' +
			'    <button type="button" data-href="teambuilder"><i>▶</i>TEAMBUILDER</button>' +
			'    <button type="button" data-href="ladder"><i>▶</i>LADDER</button>' +
			'    <button type="button" data-href="battles"><i>▶</i>WATCH</button>' +
			'    <button type="button" data-href="view-tournaments-all"><i>▶</i>TOURNAMENTS</button>' +
			'  </div>' +
			'  <div class="v6-pie"><button type="button" data-href="view-friends-all">Friends</button><button type="button" data-href="users">Find a user</button><button type="button" data-href="options">Options</button></div>' +
			'</div>';
		d.addEventListener('click', function (e) {
			var b = e.target.closest && e.target.closest('[data-v6]');
			if (!b) return;   // los data-href los lleva Showdown
			e.preventDefault();
			switch (b.getAttribute('data-v6')) {
			case 'prev': cambiarFormato(-1); break;
			case 'next': cambiarFormato(1); break;
			case 'lista': var f = botonFormato(); if (f && !f.disabled) f.click(); break;
			case 'equipo': var t = botonEquipo(); if (t && !t.disabled) t.click(); break;
			case 'battle': battle(); setTimeout(pintarInicio, 60); break;
			case 'compa': grito(); b.classList.remove('v6-salta'); void b.offsetWidth; b.classList.add('v6-salta'); break;
			case 'clasico': d.classList.add('v6-fuera'); break;
			}
		});
		inicio.el = d;
	}
	function mostrarSitio() {
		var s = inicio.el && inicio.el.querySelector('.v6-sitio');
		if (!s) return;
		s.classList.remove('v6-se-va');
		s.classList.add('v6-entra');
		clearTimeout(inicio.sitioT);
		inicio.sitioT = setTimeout(function () { s.classList.add('v6-se-va'); }, SITIO_MS);
	}
	function pintarInicio() {
		var P = ps(), m = inicioEl();
		if (!P || !m || !m.querySelector('.mainmenu-left, .mainmenu')) return;
		if (!inicio.el) crearInicio();
		if (inicio.el.parentNode !== m) m.appendChild(inicio.el);
		var c = inicio.el;
		var enInicio = P.room && P.room.id === '';
		if (enInicio && !inicio.visto) mostrarSitio();
		inicio.visto = enInicio;

		var u = P.user || {};
		poner(c.querySelector('.v6-nombre b'), u.named ? u.name : (u.name || 'Guest'));
		var id = formatoActual();
		poner(c.querySelector('.v6-fnombre b'), nombreFormato(id));
		var f = datosFormato(id);
		var conEquipo = !!(f && !f.team) || (!f && !/random/.test(id));
		var eq = c.querySelector('.v6-equipo');
		if (eq.hidden === conEquipo) eq.hidden = !conEquipo;
		var tb = botonEquipo();
		if (conEquipo) poner(eq.querySelector('b'), tb ? (tb.textContent || '').replace(/\s+/g, ' ').trim() || 'Choose a team' : 'Choose a team');
		var busca = buscandoFormato();
		var bt = c.querySelector('.v6-battle');
		bt.classList.toggle('v6-buscando', !!busca);
		var real = botonBuscar();
		poner(bt.querySelector('b'), busca ? 'SEARCHING…' : 'BATTLE!');
		poner(bt.querySelector('small'), busca ? nombreFormato(toId(String(busca).split('@@@')[0])) + ' · tap to cancel' :
			!u.named ? 'choose a name first' : P.isOffline ? 'offline' : f && f.team ? 'Random team' : 'with your team');
		bt.classList.toggle('v6-apagado', !busca && !!(real && real.disabled) && !!u.named);
	}

	/* ------------------------------------------------------------------ *
	 *  7) ESTADO DEL CAMPO: clima, terreno, Trick Room... y lo de cada lado
	 *     (trampas en rojo, pantallas y viento a favor en verde) con turnos.
	 * ------------------------------------------------------------------ */
	var TRAMPAS = { stealthrock: 1, spikes: 1, toxicspikes: 1, stickyweb: 1, gmaxsteelsurge: 1 };
	var ICONO = {
		clima: '<svg viewBox="0 0 16 16"><path d="M4.5 11a3 3 0 0 1 .3-6A4 4 0 0 1 12.5 6a2.5 2.5 0 0 1 0 5z" fill="currentColor"/></svg>',
		sol: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3.2" fill="currentColor"/><path d="M8 1v2.2M8 12.8V15M1 8h2.2M12.8 8H15M3 3l1.6 1.6M11.4 11.4 13 13M3 13l1.6-1.6M11.4 4.6 13 3" stroke="currentColor" stroke-width="1.6"/></svg>',
		campo: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
		trampa: '<svg viewBox="0 0 16 16"><path d="M1 14 6 5l3 5 2-3 4 7z" fill="currentColor"/></svg>',
		pantalla: '<svg viewBox="0 0 16 16"><path d="M8 1.5 14 4v4.2c0 3.2-2.5 5.6-6 6.3-3.5-.7-6-3.1-6-6.3V4z" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
	};
	function turnosTxt(min, max) {
		if (!min && max) { min = max; max = 0; }
		return min ? ' · ' + min : '';
	}
	function nombreClima(id) {
		try { if (window.BattleTextParser && BattleTextParser.weatherName) return BattleTextParser.weatherName(id); } catch (e) { /* nada */ }
		return id;
	}
	function chip(icono, texto, clase) {
		return '<span class="v6-chip ' + clase + '">' + (ICONO[icono] || '') + '<span>' + esc(texto) + '</span></span>';
	}
	function campo(room, battleEl) {
		var b = room.battle;
		var izq = '', rival = '', yo = '';
		try {
			if (b.weather && !(b.abilityActive && b.abilityActive(['Air Lock', 'Cloud Nine']))) {
				var sol = /sun|desolate/.test(b.weather);
				izq += chip(sol ? 'sol' : 'clima', nombreClima(b.weather) + (b.weatherMinTimeLeft ? ' · ' + b.weatherMinTimeLeft : b.weatherTimeLeft ? ' · ' + b.weatherTimeLeft : ''), 'v6-c-clima');
			}
			(b.pseudoWeather || []).forEach(function (w) {
				izq += chip('campo', w[0] + turnosTxt(w[1], w[2]), /terrain/i.test(w[0]) ? 'v6-c-terreno' : 'v6-c-campo');
			});
			[b.farSide, b.nearSide].forEach(function (side, n) {
				if (!side || !side.sideConditions) return;
				var h = '';
				for (var id in side.sideConditions) {
					var c = side.sideConditions[id];
					var trampa = !!TRAMPAS[id];
					h += chip(trampa ? 'trampa' : 'pantalla', c[0] + (c[1] > 1 ? ' ×' + c[1] : '') + turnosTxt(c[2], c[3]), trampa ? 'v6-c-trampa' : 'v6-c-pantalla');
				}
				if (n === 0) rival = h; else yo = h;
			});
		} catch (e) { /* nada */ }
		var cajas = { 'v6-campo': izq, 'v6-lado-rival': rival, 'v6-lado-yo': yo };
		for (var k in cajas) {
			var el = battleEl.querySelector(':scope > .' + k);
			if (!el) { el = document.createElement('div'); el.className = k; battleEl.appendChild(el); }
			if (el.__h !== cajas[k]) { el.innerHTML = cajas[k]; el.__h = cajas[k]; }
		}
		battleEl.classList.toggle('v6-hay-campo', !!izq);
		battleEl.style.setProperty('--v6-campo-n', String((izq.match(/v6-chip /g) || []).length));
	}

	/* ------------------------------------------------------------------ *
	 *  8) RESUMEN DEL TURNO "en una línea" entre la escena y el registro
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
		var partes = trozos.map(function (t) {
			if (t.cambio) return t.mio ? 'cambias a <b>' + esc(t.quien) + '</b>' : 'saca a <b>' + esc(t.quien) + '</b>';
			var h = (t.mio ? 'Tu ' : 'su ') + '<b>' + esc(t.mov) + '</b>';
			if (t.extra === 'inmune') h += ' → ' + (t.mio ? 'no le afecta' : 'no te afecta');
			else if (t.extra === 'falla') h += ' → falla';
			else if (t.danos.length) {
				h += ' → ' + t.danos.map(function (x) {
					return esc(x.quien) + ' <em class="' + (x.mio ? 'v6-malo' : 'v6-bueno') + '">−' + x.d + '%</em>';
				}).join(', ');
			}
			if (t.ko) h += ' <em class="v6-ko">KO</em>';
			return h;
		});
		var html = partes.join(' · ');
		return { n: numero, html: html.charAt(0).toUpperCase() + html.slice(1) };
	}
	function resumen(room, cont) {
		var b = room.battle;
		var firma = room.id + '|' + (b.stepQueue || []).length + '|' + b.currentStep;
		var el = cont.querySelector(':scope > .v6-resumen');
		if (el && el.__firma === firma) return;
		var r = null;
		try { r = resumenTurno(room); } catch (e) { r = null; }
		if (!el) { el = document.createElement('div'); el.className = 'v6-resumen'; cont.appendChild(el); }
		el.__firma = firma;
		if (!r) { cont.classList.remove('v6-resumen-on'); el.hidden = true; return; }
		var h = '<small>TURNO ' + r.n + ' · EN UNA LÍNEA</small><div>' + r.html + '</div>';
		if (el.__h !== h) { el.innerHTML = h; el.__h = h; }
		el.hidden = false;
		cont.classList.add('v6-resumen-on');
		cont.style.setProperty('--v6-resumen-h', el.offsetHeight + 'px');
	}

	/* ------------------------------------------------------------------ *
	 *  9) FICHA DEL RIVAL: tocando "Rival ›" (lo visto, lo probable y su
	 *     velocidad). Los sets probables salen de data.pkmn.cc.
	 * ------------------------------------------------------------------ */
	var SETS = {};
	function cargarSets(formato) {
		if (!formato || SETS[formato] !== undefined) return;
		SETS[formato] = null;
		if (!/random/.test(formato)) return;
		var urls = ['https://data.pkmn.cc/randbats/' + formato + '.json', 'https://pkmn.github.io/randbats/data/' + formato + '.json'];
		(function probar(i) {
			if (i >= urls.length) return;
			fetch(urls[i]).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
				.then(function (d) { SETS[formato] = d; })
				.catch(function () { probar(i + 1); });
		})(0);
	}
	function setDe(formato, especie) {
		var d = SETS[formato];
		if (!d) return null;
		var s = d[especie] || d[String(especie).replace(/-.*$/, '')];
		if (!s) { var id = toId(especie); for (var k in d) if (toId(k) === id) { s = d[k]; break; } }
		if (!s) return null;
		var movs = [], objs = [], habs = [];
		function suma(lista, a) { (a || []).forEach(function (x) { if (lista.indexOf(x) < 0) lista.push(x); }); }
		if (s.roles) for (var r in s.roles) { suma(movs, s.roles[r].moves); suma(objs, s.roles[r].items); suma(habs, s.roles[r].abilities); }
		suma(movs, s.moves); suma(objs, s.items); suma(habs, s.abilities);
		return { level: s.level, moves: movs, items: objs, abilities: habs };
	}
	function formatoDeSala(room) { var m = /^battle-([a-z0-9]+)-/.exec(room.id); return m ? m[1] : ''; }
	function colorTipo(t) { var hs = TIPO[t] || TIPO.Normal; return 'hsl(' + hs[0] + ' ' + hs[1] + '% 58%)'; }
	function velocidad(base, nivel, aleatorio) {
		function st(ev, nat) { return Math.floor(Math.floor((2 * base + 31 + Math.floor(ev / 4)) * nivel / 100 + 5) * nat); }
		return aleatorio ? { a: st(84, 1) } : { a: st(0, 1), b: st(252, 1.1) };
	}
	function fichaRival(room) {
		var b = room.battle, dex = b.dex || window.Dex;
		var fmt = formatoDeSala(room);
		var aleatorio = /random/.test(fmt);
		cargarSets(fmt);
		var mia = null;
		try {
			var req = room.request && room.request.side && room.request.side.pokemon;
			for (var i = 0; req && i < req.length; i++) if (req[i].active) { mia = req[i]; break; }
		} catch (e) { mia = null; }
		var rivales = (b.farSide.active || []).filter(function (p) { return p && !p.fainted; });
		if (!rivales.length) return '<div class="v6-ficha-p">No hay rival en el campo.</div>';
		return rivales.map(function (p) {
			var sp = dex.species.get(p.speciesForme);
			var set = setDe(fmt, p.speciesForme);
			var nivel = p.level || (set && set.level) || 100;
			var tipos = []; try { tipos = p.getTypeList(); } catch (e) { tipos = sp.types || []; }
			var hp = p.maxhp ? Math.round(100 * p.hp / p.maxhp) : 0;
			var hab = p.ability || p.baseAbility;
			var habTxt = hab ? '<b>' + esc(hab) + '</b>' :
				'<span class="v6-prob">' + esc(((set && set.abilities.length ? set.abilities : Object.keys(sp.abilities || {}).map(function (k) { return sp.abilities[k]; })) || []).join(' / ') || '?') + '</span>';
			var objTxt = p.item ? '<b>' + esc(p.item) + '</b>' : p.prevItem ? 'sin objeto <small>(perdió ' + esc(p.prevItem) + ')</small>' :
				'<b>sin revelar</b>' + (set && set.items.length ? ' <small class="v6-prob">' + esc(set.items.slice(0, 3).join(' / ')) + '</small>' : '');
			var v = velocidad(sp.baseStats.spe, nivel, aleatorio);
			var velTxt = '<b>' + v.a + (v.b ? '–' + v.b : '') + '</b>' + (aleatorio ? ' <small>(' + Math.floor(v.a * 1.5) + ' con Scarf)</small>' : '') +
				(mia && mia.stats ? ' · tú ' + mia.stats.spe : '');
			var vistos = (p.moveTrack || []).map(function (t) { return t[0]; });
			var movHTML = function (n, prob) {
				var m = dex.moves.get(n);
				return '<span class="v6-mov' + (prob ? ' v6-prob' : '') + '" style="--c:' + colorTipo(m && m.type) + '">' + (prob ? '' : '✓ ') + esc(m && m.exists ? m.name : n) + '</span>';
			};
			var posibles = set ? set.moves.map(function (n) { return dex.moves.get(n).name || n; })
				.filter(function (n) { return vistos.map(toId).indexOf(toId(n)) < 0; }) : [];
			return '<div class="v6-ficha-p">' +
				'<div class="v6-ficha-cab"><b>' + esc(p.name || sp.name) + '</b><span>Lv' + nivel + ' · ' + hp + '%</span><i>' +
				tipos.map(function (t) { return '<span class="v6-tipo" style="--c:' + colorTipo(t) + '">' + esc(t) + '</span>'; }).join('') +
				(p.terastallized ? '<span class="v6-tipo" style="--c:' + colorTipo(p.terastallized) + '">TERA</span>' : '') + '</i></div>' +
				'<div class="v6-ficha-fila"><span>Habilidad ' + habTxt + '</span><span>Objeto ' + objTxt + '</span></div>' +
				'<div class="v6-ficha-fila"><span>Velocidad ' + velTxt + '</span></div>' +
				'<h4>ATAQUES VISTOS</h4><div class="v6-movs">' + (vistos.length ? vistos.map(function (n) { return movHTML(n, false); }).join('') : '<small>todavía ninguno</small>') + '</div>' +
				(aleatorio ? '<h4>POSIBLES (SETS DE RANDOM BATTLE)</h4><div class="v6-movs">' +
					(set ? (posibles.length ? posibles.map(function (n) { return movHTML(n, true); }).join('') : '<small>ya los has visto todos</small>') : '<small>cargando…</small>') + '</div>' : '') +
				'</div>';
		}).join('');
	}
	function botonRival(room, battleEl, cont) {
		var b = battleEl.querySelector(':scope > .v6-rival-btn');
		if (!b) {
			b = document.createElement('button');
			b.type = 'button';
			b.className = 'v6-rival-btn';
			b.textContent = 'Rival ›';
			b.addEventListener('click', function (e) {
				e.preventDefault(); e.stopPropagation();
				var r = salaDe(battleEl);
				if (r) abrirFicha(r, cont);
			});
			battleEl.appendChild(b);
			// tocar la barra de vida del rival también abre su ficha
			battleEl.addEventListener('click', function (e) {
				if (!e.target.closest || !e.target.closest('.statbar.lstatbar')) return;
				var r = salaDe(battleEl);
				if (r) abrirFicha(r, cont);
			});
		}
		cargarSets(formatoDeSala(room));
		var f = cont.querySelector(':scope > .v6-ficha');
		if (f && !f.hidden) {
			var h = fichaRival(room);
			if (f.__h !== h) { f.firstChild.innerHTML = h; f.__h = h; }
		}
	}
	function abrirFicha(room, cont) {
		var f = cont.querySelector(':scope > .v6-ficha');
		if (!f) {
			f = document.createElement('div');
			f.className = 'v6-ficha';
			f.innerHTML = '<div class="v6-ficha-caja"></div>';
			f.addEventListener('click', function () { f.hidden = true; });
			cont.appendChild(f);
		}
		var h = fichaRival(room);
		f.firstChild.innerHTML = h; f.__h = h;
		f.hidden = false;
	}

	/* ------------------------------------------------------------------ *
	 *  Repaso de la pantalla (cada vez que Showdown cambia algo)
	 * ------------------------------------------------------------------ */
	function repaso() {
		if (!esMovil() || !ps()) return;
		if (!avisado) { avisado = true; aviso('Script v6 activo', 2000); }
		try { parchearBusqueda(); pintarInicio(); } catch (e) {}
		var batallas = document.querySelectorAll('.ps-room .battle');
		for (var i = 0; i < batallas.length; i++) {
			var bEl = batallas[i];
			var room = salaDe(bEl);
			if (!room || !room.battle) continue;
			var cont = bEl.closest('.ps-room');
			try { fondo(bEl, room); } catch (e) {}
			try { engancharEscena(room, bEl); } catch (e) {}
			try { eficaciaAtaques(room, cont); } catch (e) {}
			try { vidaCambios(room, cont); } catch (e) {}
			try { finCombate(room, cont); } catch (e) {}
			try { campo(room, bEl); } catch (e) {}
			try { resumen(room, cont); } catch (e) {}
			try { botonRival(room, bEl, cont); } catch (e) {}
		}
	}

	var pendiente = false;
	function pedirRepaso() {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(function () { pendiente = false; repaso(); });
	}
	new MutationObserver(pedirRepaso).observe(document.body, { childList: true, subtree: true });
	window.addEventListener('resize', pedirRepaso);
	setInterval(repaso, 1500);
	repaso();
})();
