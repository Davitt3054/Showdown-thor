// ==UserScript==
// @name         Showdown móvil v5
// @namespace    david.showdown.movil
// @version      5.0.3
// @description  Va con el estilo v5 del móvil: fondos al azar, eficacia en los ataques, % en los cambios, cartel del ataque, "Hello" + Umbreon y botón "Nuevo combate".
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
  6. Menú principal: "Hello," + tu nombre (tócalo para cambiar de usuario)
     y Umbreon de espaldas.

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
		if (!avisado && esMovil()) aviso('Script v5: no encuentro Showdown (revisa Violentmonkey)', 6000);
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
	 *  6) MENÚ PRINCIPAL: Hello + nombre, Umbreon
	 * ------------------------------------------------------------------ */
	function menu() {
		var izq = document.querySelector('.mainmenu-left');
		var caja = izq && izq.parentElement;
		if (!caja) return;
		var P = ps();
		var saludo = caja.querySelector(':scope > .v5-saludo');
		if (!saludo) {
			saludo = document.createElement('div');
			saludo.className = 'v5-saludo';
			saludo.innerHTML = '<div class="v5-saludo-hola">Hello,</div><button class="v5-saludo-nombre" data-href="options" type="button"></button>';
			caja.appendChild(saludo);
		}
		var nombre = (P && P.user && P.user.name) || 'Guest';
		var nb = saludo.querySelector('.v5-saludo-nombre');
		if (nb.textContent !== nombre) nb.textContent = nombre;

		if (!caja.querySelector(':scope > .v5-umbreon')) {
			var u = document.createElement('div');
			u.className = 'v5-umbreon';
			u.innerHTML = '<img alt="" src="https://play.pokemonshowdown.com/sprites/gen5ani-back/' + PORTADA + '.gif">';
			caja.appendChild(u);
		}
	}

	/* ------------------------------------------------------------------ *
	 *  Repaso de la pantalla (cada vez que Showdown cambia algo)
	 * ------------------------------------------------------------------ */
	function repaso() {
		if (!esMovil() || !ps()) return;
		if (!avisado) { avisado = true; aviso('Script v5 activo', 2000); }
		try { menu(); } catch (e) {}
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
