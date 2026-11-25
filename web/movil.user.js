// ==UserScript==
// @name         Showdown móvil v6
// @namespace    david.showdown.movil
// @version      7.0.0
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
 10. DAÑO ESTIMADO (v6.1): en individuales, cada ataque dice cuánto quita
     ("45–53%", "KO" o "KO?"), con @smogon/calc.
 12. ASPECTO DE JUEGO (v6.2): presentación VS al empezar, clima animado,
     el panel con el color del escenario, sombras y letra de juego en las
     barras de vida.
 11. HISTORIAL (v6.1): "History" en el inicio: hoy, total, por formato, por
     equipo y cada combate con sus momentos clave y su repetición.

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

	// v8: nuestros 8 fondos de píxel (web/fondos/). Se turnan solo estos: uno por combate.
	var FONDOS = ['pradera', 'mar', 'montana', 'ruinas', 'bambu', 'canon', 'coliseo', 'volcan'].map(function (n) {
		return 'https://raw.githubusercontent.com/Davitt3054/Showdown-thor/main/web/fondos/fondo-' + n + '.webp';
	});

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
	// Al azar, como una bolsa: salen los 8 antes de repetir ninguno.
	var FONDO_SALA = {};
	function sacarFondo(n) {
		var bolsa = [];
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
	function fondo(battleEl, room) {
		if (!FONDOS.length) return;
		if (!battleEl.classList.contains('v5-fondo')) battleEl.classList.add('v5-fondo');
		if (battleEl.__v5fondo) return;
		var id = room ? String(room.id) : '';
		var i = (id && FONDO_SALA[id] != null) ? FONDO_SALA[id] : sacarFondo(FONDOS.length);
		if (id) FONDO_SALA[id] = i;
		battleEl.style.setProperty('--v5-fondo', 'url("' + FONDOS[i] + '")');
		battleEl.classList.toggle('v5-fondo-mar', /fondo-mar/.test(FONDOS[i]));
		battleEl.__v5fondo = true;
	}

	/* ------------------------------------------------------------------ *
	 *  v12) SUELO: el fondo se acerca (CSS, según data-v12-fondo) para que su
	 *       suelo quede donde Showdown pone a los Pokémon; así los ataques,
	 *       Protect y los números caen en su sitio. Tus Pokémon algo más
	 *       pequeños (más en dobles) y todos con sombra ovalada.
	 * ------------------------------------------------------------------ */
	// el cartelito flotante de subidas/bajadas de stats (ya sale bajo la barra de vida)
	function sinCartelStats(raiz) {
		Array.prototype.forEach.call((raiz || document).querySelectorAll('.ps-room .battle .result'), function (r) {
			if (r.__v14 === undefined) r.__v14 = /\b(Atk|Def|SpA|SpD|Spe|Accuracy|Evasion|accuracy|evasion|evasiveness)\b/.test(r.textContent || '');
			if (r.__v14 && r.style.display !== 'none') r.style.display = 'none';
		});
	}
	function sueloV11() {
		try { sinCartelStats(); } catch (e) {}
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
					var sw = Math.min(W * 0.9 * k, tuyo ? 140 : 120), sh = sw * 0.26;
					s.style.cssText = 'left:' + (L + W / 2 - sw / 2) + 'px;top:' + (T + H - sh * 0.6) + 'px;width:' + sw + 'px;height:' + sh + 'px;opacity:' + op;
				});
			});
		});
	}
	setInterval(sueloV11, 120);

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
				ponAttr(btn, 'data-v7-dano', null); ponAttr(btn, 'data-v7-ko', null);
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
			var nivel = nivelDe(fs);
			var dn = rivales.length === 1 && fs[0] !== 0 && danoCache[room.id] && danoCache[room.id][partes[1]];
			if (dn && dn.ko) nivel = 'fuerte';
			ponAttr(btn, 'data-v5-ef', txt.join(' · '));
			ponAttr(btn, 'data-v5-nivel', nivel);
			// v7: el daño en su propia etiqueta (abajo a la derecha)
			ponAttr(btn, 'data-v7-dano', dn ? (dn.t === 'KO' ? 'Sure KO' : dn.t === 'KO?' ? 'Maybe KO' : dn.t) : null);
			ponAttr(btn, 'data-v7-ko', dn && dn.ko ? (dn.t === 'KO' ? 'si' : 'quizas') : null);
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
			if (!poke || poke.fainted) { ponAttr(objetivos[o], 'data-v5-hp', null); ponAttr(objetivos[o], 'data-v5-nivel', null); ponAttr(objetivos[o], 'data-v12-ef', null); continue; }
			var pct = Math.round(100 * poke.hp / (poke.maxhp || 1)) + '%';
			var ua = ultimoAtaque[room.id];
			ponAttr(objetivos[o], 'data-v5-hp', pct);
			if (ua && ua.tipo) {
				var f = factor(battle.dex || window.Dex, ua.tipo, poke);
				ponAttr(objetivos[o], 'data-v12-ef', textoFactor(f));
				ponAttr(objetivos[o], 'data-v5-nivel', nivelDe([f]));
			} else {
				ponAttr(objetivos[o], 'data-v12-ef', null);
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
		if (acabado) { try { apuntarCombate(room); } catch (e) { /* nada */ } }
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
		boton.innerHTML = 'New battle<small></small>';
		boton.querySelector('small').textContent =
			(battle && battle.farSide ? 'vs ' + battle.farSide.name + ' · ' + battle.turn + ' turns · ' : '') +
			(aleatorio ? 'find another one' : 'pick a team on the home screen');
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
	// Los mismos 8 fondos de los combates (nítidos y con su propia luz).
	var SITIOS = [
		{ n: 'MEADOW', bg: 'pradera' }, { n: 'OPEN SEA', bg: 'mar' }, { n: 'MOUNTAIN PASS', bg: 'montana' },
		{ n: 'FOREST RUINS', bg: 'ruinas' }, { n: 'BAMBOO GROVE', bg: 'bambu' }, { n: 'CANYON', bg: 'canon' },
		{ n: 'COLOSSEUM', bg: 'coliseo' }, { n: 'VOLCANO', bg: 'volcan' }
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
	var pedido = { id: '', hasta: 0 };   // formato que acabas de elegir (mientras Showdown lo asienta)
	function formatoActual() {
		if (pedido.id && Date.now() < pedido.hasta) return pedido.id;
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
		FORMATOS_BASE.forEach(add);
		// el actual, al final: si va delante, ◀ ▶ solo saltan entre dos formatos
		add(formatoActual());
		return out;
	}
	/*
	 * Showdown cambia el formato en dos pasos: el botón cambia al momento, pero
	 * el formulario se vuelve a pintar un poco después con el formato viejo y lo
	 * deshace. Por eso se cambia, se le pide que se repinte un poco más tarde y se
	 * comprueba que se ha quedado (si no, se vuelve a poner).
	 */
	function ponerFormato(id) {
		var b = botonFormato();
		if (!b || b.disabled) return false;
		pedido = { id: id, hasta: Date.now() + 900 };
		function aplicar() {
			var bt = botonFormato();
			if (!bt || bt.disabled) return;
			if (toId(bt.value.split('@@@')[0]) !== id) {
				bt.value = id;
				bt.dispatchEvent(new Event('change'));
			}
		}
		function repintar() {
			try { var P = ps(); if (P.mainmenu && P.mainmenu.update) P.mainmenu.update(null); } catch (e) { /* nada */ }
		}
		aplicar();
		setTimeout(function () { repintar(); }, 60);
		setTimeout(function () { aplicar(); repintar(); pintarInicio(); }, 300);
		setTimeout(function () { aplicar(); repintar(); pintarInicio(); }, 800);
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
				var tb = botonEquipo();
				guardar('v6_equipo_busqueda', { f: id, n: tb ? (tb.textContent || '').replace(/\s+/g, ' ').trim() : '' });
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

	// v7: el Pokémon "salvaje" de frente en la escena (cambia cada día)
	var SALVAJES = ['garchomp', 'tyranitar', 'dragonite', 'lucario', 'gengar', 'salamence', 'metagross', 'hydreigon', 'volcarona', 'haxorus', 'gyarados', 'scizor'];
	function salvajeDeHoy() {
		var d = new Date();
		return SALVAJES[hash(d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate()) % SALVAJES.length];
	}
	var ICONO_MENU = {
		teams: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="7" width="14" height="14" rx="4"/><path d="M9 7V5.5a3 3 0 0 1 6 0V7"/><rect x="8.5" y="13" width="7" height="5" rx="1.5"/><path d="M5 12h14"/></svg>',
		ladder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20v-8h4.5v8zM9.75 20V4.5h4.5V20zM15.5 20v-5.5H20V20z" fill="currentColor"/><path d="M3 21h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
		watch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C6.5 5 2.7 9.2 1.5 12c1.2 2.8 5 7 10.5 7s9.3-4.2 10.5-7C21.3 9.2 17.5 5 12 5z" fill="currentColor"/><circle cx="12" cy="12" r="4" fill="#1c2231"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/></svg>',
		torneos: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10v5a5 5 0 0 1-10 0z" fill="currentColor"/><path d="M7 5.5H4.2a3.3 3.3 0 0 0 3.3 4.2M17 5.5h2.8a3.3 3.3 0 0 1-3.3 4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10.8 13h2.4v4h-2.4zM8 17.5h8l1 3H7z" fill="currentColor"/></svg>'
	};
	var ENGRANAJE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

	var inicio = { el: null, visto: false, sitioT: 0 };
	function crearInicio() {
		var s = sitioDeHoy();
		var d = document.createElement('div');
		d.id = 'v6-inicio';
		d.className = 'v7 v6-luz-propia';
		d.innerHTML =
			'<div class="v7-arriba"><button type="button" class="v7-usuario" data-href="options"><i></i><b></b>' + ENGRANAJE + '</button></div>' +
			'<div class="v7-escena">' +
			'  <div class="v6-escena" style="background-image:url(https://raw.githubusercontent.com/Davitt3054/Showdown-thor/main/web/fondos/fondo-' + s.bg + '.webp)"></div>' +
			'  <div class="v6-tinte"></div>' +
			'  <div class="v6-sitio">' + esc(s.n) + '</div>' +
			'  <img class="v7-salvaje" alt="" src="https://play.pokemonshowdown.com/sprites/gen5ani/' + salvajeDeHoy() + '.gif">' +
			'  <button type="button" class="v6-compa" data-v6="compa" aria-label="' + PORTADA + '"><img alt="" src="https://play.pokemonshowdown.com/sprites/gen5ani-back/' + PORTADA + '.gif"></button>' +
			'  <div class="v7-hola">Welcome back,<br><b></b></div>' +
			'</div>' +
			'<div class="v7-pastilla">' +
			'  <button type="button" class="v7-formato" data-v6="lista"><small>Format</small><b></b></button>' +
			'  <button type="button" class="v7-equipo" data-v6="equipo"><small>Team</small><b></b></button>' +
			'</div>' +
			'<button type="button" class="v7-battle" data-v6="battle"><b>BATTLE!</b><small>Find opponent</small></button>' +
			'<div class="v7-menu">' +
			'  <button type="button" data-href="teambuilder">' + ICONO_MENU.teams + '<span>Teams</span></button>' +
			'  <button type="button" data-href="ladder">' + ICONO_MENU.ladder + '<span>Ladder</span></button>' +
			'  <button type="button" data-href="battles">' + ICONO_MENU.watch + '<span>Watch</span></button>' +
			'  <button type="button" data-href="view-tournaments-all">' + ICONO_MENU.torneos + '<span>Tournaments</span></button>' +
			'</div>' +
			'<div class="v7-pie"><button type="button" data-href="view-friends-all">Friends</button><button type="button" data-href="users">Find a user</button><button type="button" data-v6="historial">History</button></div>';
		d.addEventListener('click', function (e) {
			var b = e.target.closest && e.target.closest('[data-v6]');
			if (!b) return;   // los data-href los lleva Showdown
			e.preventDefault();
			// que este toque no llegue a Showdown: si no, cierra al momento la lista que abrimos
			e.stopPropagation();
			switch (b.getAttribute('data-v6')) {
			case 'prev': cambiarFormato(-1); break;
			case 'next': cambiarFormato(1); break;
			case 'lista': setTimeout(function () { var f = botonFormato(); if (f && !f.disabled) f.click(); }, 0); break;
			case 'equipo': setTimeout(function () { var t = botonEquipo(); if (t && !t.disabled) t.click(); }, 0); break;
			case 'battle': battle(); setTimeout(pintarInicio, 60); break;
			case 'compa': grito(); b.classList.remove('v6-salta'); void b.offsetWidth; b.classList.add('v6-salta'); break;
			case 'historial': abrirHistorial(); break;
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
		var nombre = u.named ? u.name : (u.name || 'Guest');
		poner(c.querySelector('.v7-usuario b'), nombre);
		c.querySelector('.v7-usuario').classList.toggle('v7-sin-nombre', !u.named);
		poner(c.querySelector('.v7-hola b'), nombre);
		var id = formatoActual();
		poner(c.querySelector('.v7-formato b'), nombreFormato(id));
		var f = datosFormato(id);
		var conEquipo = !!(f && !f.team) || (!f && !/random/.test(id));
		var eq = c.querySelector('.v7-equipo');
		eq.classList.toggle('v7-sin-equipo', !conEquipo);
		var tb = botonEquipo();
		poner(eq.querySelector('b'), !conEquipo ? 'Random' :
			tb ? (tb.textContent || '').replace(/\s+/g, ' ').trim() || 'Choose a team' : 'Choose a team');
		var busca = buscandoFormato();
		var bt = c.querySelector('.v7-battle');
		bt.classList.toggle('v6-buscando', !!busca);
		var real = botonBuscar();
		poner(bt.querySelector('b'), busca ? 'SEARCHING…' : 'BATTLE!');
		poner(bt.querySelector('small'), busca ? nombreFormato(toId(String(busca).split('@@@')[0])) + ' · tap to cancel' :
			!u.named ? 'Choose a name first' : P.isOffline ? 'Offline' : 'Find opponent');
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
			else if (accion && tipo === '-miss') accion.extra = 'missed';
			else if (accion && tipo === '-fail' && !accion.danos.length) accion.extra = 'failed';
			else if (tipo === 'faint' && accion) {
				accion.ko = (accion.ko || []).concat(nombreDe(p[2]));
			}
		}
		cerrar();
		if (!trozos.length) return null;
		// una fila por acción: ● quién · ataque → a quién y cuánto (los golpes al mismo se suman)
		var filas = trozos.map(function (t) {
			var punto = '<i class="v13-punto ' + (t.mio ? 'v13-tuyo' : 'v13-suyo') + '"></i>';
			if (t.cambio) return '<div class="v13-fila">' + punto + '<span class="v13-quien">' + esc(t.quien) + '</span> <span class="v13-gris">' + (t.mio ? 'comes in' : 'comes in') + '</span></div>';
			var h = punto + '<span class="v13-quien">' + esc(t.quien) + '</span> <b>' + esc(t.mov) + '</b>';
			if (t.extra === 'inmune') h += ' <span class="v13-gris">no effect</span>';
			else if (t.extra) h += ' <span class="v13-gris">' + t.extra + '</span>';
			else if (t.danos.length) {
				var suma = {}, orden = [];
				t.danos.forEach(function (x) {
					if (!suma[x.quien]) { suma[x.quien] = { d: 0, n: 0, mio: x.mio }; orden.push(x.quien); }
					suma[x.quien].d += x.d; suma[x.quien].n++;
				});
				h += ' <span class="v13-gris">→</span> ' + orden.map(function (q) {
					var x = suma[q];
					return esc(q) + ' <em class="' + (x.mio ? 'v6-malo' : 'v6-bueno') + '">−' + x.d + '%</em>' + (x.n > 1 ? ' <span class="v13-gris">(' + x.n + ' hits)</span>' : '');
				}).join(', ');
			}
			if (t.ko) h += ' <em class="v6-ko">KO</em>';
			return '<div class="v13-fila">' + h + '</div>';
		});
		var MAX = 4, html = filas.slice(0, MAX).join('');
		if (filas.length > MAX) html += '<div class="v13-mas">+' + (filas.length - MAX) + ' more · tap to see all</div>';
		return { n: numero, html: html };
	}
	function resumen(room, cont) {
		var b = room.battle;
		var firma = room.id + '|' + (b.stepQueue || []).length + '|' + b.currentStep;
		var el = cont.querySelector(':scope > .v6-resumen');
		if (el && el.__firma === firma) return;
		var r = null;
		try { r = resumenTurno(room); } catch (e) { r = null; }
		if (!el) {
			el = document.createElement('div'); el.className = 'v6-resumen';
			el.setAttribute('role', 'button'); el.setAttribute('aria-label', 'Show the whole battle log');
			el.addEventListener('click', function (e) { e.stopPropagation(); abrirRegistro(cont); });
			cont.appendChild(el);
		}
		el.__firma = firma;
		if (!r) { cont.classList.remove('v6-resumen-on'); el.hidden = true; return; }
		var h = '<div class="v7-turno">TURN ' + r.n + '</div>' + r.html;
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
		var mias = [];
		try {
			var req = room.request && room.request.side && room.request.side.pokemon;
			for (var i = 0; req && i < req.length; i++) if (req[i].active && !/ fnt$/.test(req[i].condition || '') && req[i].stats) mias.push(req[i]);
		} catch (e) { mias = []; }
		var rivales = (b.farSide.active || []).filter(function (p) { return p && !p.fainted; });
		if (!rivales.length) return '<div class="v6-ficha-p">No opponent on the field.</div>';
		return rivales.map(function (p) {
			var sp = dex.species.get(p.speciesForme);
			var set = setDe(fmt, p.speciesForme);
			var nivel = p.level || (set && set.level) || 100;
			var tipos = []; try { tipos = p.getTypeList(); } catch (e) { tipos = sp.types || []; }
			var hp = p.maxhp ? Math.round(100 * p.hp / p.maxhp) : 0;
			var hab = p.ability || p.baseAbility;
			var habTxt = hab ? '<b>' + esc(hab) + '</b>' :
				'<span class="v6-prob">' + esc(((set && set.abilities.length ? set.abilities : Object.keys(sp.abilities || {}).map(function (k) { return sp.abilities[k]; })) || []).join(' / ') || '?') + '</span>';
			var objTxt = p.item ? '<b>' + esc(p.item) + '</b>' : p.prevItem ? 'none <small>(lost ' + esc(p.prevItem) + ')</small>' :
				'<b>unknown</b>' + (set && set.items.length ? ' <small class="v6-prob">' + esc(set.items.slice(0, 3).join(' / ')) + '</small>' : '');
			var v = velocidad(sp.baseStats.spe, nivel, aleatorio);
			var velTxt = '<b>' + v.a + (v.b ? '–' + v.b : '') + '</b>' + (aleatorio ? ' <small>(' + Math.floor(v.a * 1.5) + ' with Scarf)</small>' : '') +
				'';
			// contra cada uno de los tuyos: ▲ te adelanta, ▼ vas tú antes, ≈ depende
			var contra = mias.map(function (m) {
				var tuya = m.stats.spe, alto = v.b || v.a;
				var signo = v.a > tuya ? '<span class="v12-rapido">▲ faster than</span>' : alto < tuya ? '<span class="v12-lento">▼ slower than</span>' : '<span class="v12-igual">≈ close to</span>';
				return '<div class="v12-vs">' + signo + ' ' + esc(String(m.ident || '').replace(/^p\d+[a-z]?: /, '')) + ' <b>' + tuya + '</b></div>';
			}).join('');
			velTxt += contra;
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
				'<div class="v6-ficha-fila"><span>Ability ' + habTxt + '</span><span>Item ' + objTxt + '</span></div>' +
				'<div class="v6-ficha-fila"><span>Speed ' + velTxt + '</span></div>' +
				'<h4>MOVES SEEN</h4><div class="v6-movs">' + (vistos.length ? vistos.map(function (n) { return movHTML(n, false); }).join('') : '<small>none yet</small>') + '</div>' +
				(aleatorio ? '<h4>POSSIBLE (RANDOM BATTLE SETS)</h4><div class="v6-movs">' +
					(set ? (posibles.length ? posibles.map(function (n) { return movHTML(n, true); }).join('') : '<small>you have seen them all</small>') : '<small>loading…</small>') + '</div>' : '') +
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
	 *  10) DAÑO ESTIMADO en los botones de ataque (individuales)
	 *      Con @smogon/calc (licencia MIT), la misma calculadora de la Thor.
	 *      Tus stats exactas; el rival con su set probable de Random Battle.
	 * ------------------------------------------------------------------ */
	var CALC = { estado: 'nada' };
	var CALC_CDN = 'https://cdn.jsdelivr.net/gh/Davitt3054/Showdown-thor@main/app/src/main/assets/calc/';
	function cargarCalc() {
		if (CALC.estado !== 'nada') return;
		if (window.calc && window.calc.calculate && window.calc.Generations) { CALC.estado = 'listo'; return; }
		CALC.estado = 'cargando';
		function script(n, luego) {
			var s = document.createElement('script');
			s.src = CALC_CDN + n;
			s.onload = luego;
			s.onerror = function () { CALC.estado = 'error'; };
			(document.head || document.documentElement).appendChild(s);
		}
		script('datos.min.js', function () {
			script('calc.min.js', function () {
				var c = window.calc;
				if (!c || !c.calculate || !c.Generations) { CALC.estado = 'error'; return; }
				// la calculadora rehace el Pokémon por dentro: que no pierda tus stats exactas
				if (c.Pokemon && !c.Pokemon.prototype.__v6) {
					var clonar = c.Pokemon.prototype.clone;
					c.Pokemon.prototype.clone = function () {
						var p = clonar.call(this);
						if (this.__fijas) { p.rawStats = Object.assign({}, this.rawStats); p.__fijas = true; p.originalCurHP = this.originalCurHP; }
						return p;
					};
					c.Pokemon.prototype.__v6 = true;
				}
				CALC.estado = 'listo';
			});
		});
	}
	var CLIMA_CALC = { raindance: 'Rain', primordialsea: 'Heavy Rain', sunnyday: 'Sun', desolateland: 'Harsh Sunshine',
		sandstorm: 'Sand', hail: 'Hail', snow: 'Snow', snowscape: 'Snow', deltastream: 'Strong Winds' };
	var EVS84 = { hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84 };
	function pokeCalc(gen, nombre, opc) {
		try { return new calc.Pokemon(gen, nombre, opc); } catch (e) {
			try { return new calc.Pokemon(gen, String(nombre).replace(/-.*$/, ''), opc); } catch (e2) { return null; }
		}
	}
	function nombreDato(gen, tabla, valor) {
		if (!valor) return undefined;
		try { var d = gen[tabla].get(toId(valor)); if (d && d.name) return d.name; } catch (e) { /* nada */ }
		return valor;
	}
	var danoCache = {};
	function danoBotones(room, cont) {
		var b = room.battle;
		danoCache[room.id] = null;
		var rivales = rivalesVivos(b);
		if (rivales.length !== 1 || !(b.nearSide && b.nearSide.active)) return;
		cargarCalc();
		if (CALC.estado !== 'listo') return;
		var req = room.request, mia = null;
		var lista = req && req.side && req.side.pokemon;
		for (var i = 0; lista && i < lista.length; i++) if (lista[i].active) { mia = lista[i]; break; }
		var miaBatalla = b.nearSide.active[0];
		if (!mia || !mia.stats || !miaBatalla) return;
		var df = rivales[0].p;
		var fmt = formatoDeSala(room);
		var firma = [b.turn, b.weather, JSON.stringify(b.pseudoWeather), mia.condition, mia.ident, df.speciesForme, df.hp, df.item, df.ability,
			df.terastallized, JSON.stringify(df.boosts), JSON.stringify(miaBatalla.boosts), JSON.stringify(b.farSide.sideConditions),
			SETS[fmt] ? 1 : 0, (room.choices && room.choices.current && room.choices.current.tera) ? 1 : 0].join('|');
		var guardado = cont.__v6dano;
		if (guardado && guardado.firma === firma) { danoCache[room.id] = guardado.porMov; return; }
		var gen;
		try { gen = calc.Generations.get(b.gen || 9); } catch (e) { return; }
		var nivel = +((/, L(\d+)/.exec(mia.details || '') || [])[1] || 100);
		var especie = String(mia.details || mia.ident).split(',')[0].replace(/^p\d[a-z]?: */, '');
		var tera = room.choices && room.choices.current && room.choices.current.tera ? mia.teraType : (miaBatalla.terastallized || undefined);
		var at = pokeCalc(gen, especie, {
			level: nivel, item: nombreDato(gen, 'items', mia.item), ability: nombreDato(gen, 'abilities', mia.ability || mia.baseAbility),
			evs: EVS84, boosts: miaBatalla.boosts || {}, status: (/ (\w+)$/.exec(mia.condition || '') || [])[1] || '', teraType: tera
		});
		if (!at) return;
		var hp = /^(\d+)\/(\d+)/.exec(mia.condition || '');
		at.rawStats = { hp: hp ? +hp[2] : at.rawStats.hp, atk: mia.stats.atk, def: mia.stats.def, spa: mia.stats.spa, spd: mia.stats.spd, spe: mia.stats.spe };
		at.__fijas = true;
		at.originalCurHP = hp ? +hp[1] : at.rawStats.hp;
		var set = setDe(fmt, df.speciesForme);
		var opc = { level: df.level || (set && set.level) || 100, evs: EVS84, boosts: df.boosts || {}, status: df.status || '' };
		var obj = df.item || (df.prevItem ? '' : set && set.items[0]);
		if (obj) opc.item = nombreDato(gen, 'items', obj);
		var hab = df.ability || df.baseAbility || (set && set.abilities[0]);
		if (hab) opc.ability = nombreDato(gen, 'abilities', hab);
		if (df.terastallized) opc.teraType = df.terastallized;
		var de = pokeCalc(gen, df.speciesForme, opc);
		if (!de) return;
		var pctVida = df.maxhp ? df.hp / df.maxhp : 1;
		de.originalCurHP = Math.max(1, Math.round(de.rawStats.hp * pctVida));
		var campoOpc = {};
		if (b.weather && CLIMA_CALC[b.weather]) campoOpc.weather = CLIMA_CALC[b.weather];
		(b.pseudoWeather || []).forEach(function (w) { var m = /^(Electric|Grassy|Misty|Psychic) Terrain$/.exec(w[0]); if (m) campoOpc.terrain = m[1]; });
		var sc = b.farSide.sideConditions || {};
		campoOpc.defenderSide = { isReflect: !!sc.reflect, isLightScreen: !!sc.lightscreen, isAuroraVeil: !!sc.auroraveil };
		var campo;
		try { campo = new calc.Field(campoOpc); } catch (e) { campo = new calc.Field(); }
		var porMov = {};
		(cont.querySelectorAll('.movemenu button.movebutton[data-tooltip]') || []).forEach(function (btn) {
			var nombre = btn.getAttribute('data-tooltip').split('|')[1];
			try {
				var mov = new calc.Move(gen, nombre);
				if (mov.category === 'Status') return;
				var r = calc.calculate(gen, at, de, mov, campo).range();
				var min = r[0], max = r[1];
				if (Array.isArray(min)) { min = min[0]; max = max[max.length - 1]; }
				if (!max) { porMov[nombre] = { t: '0%', ko: false }; return; }
				var total = de.maxHP();
				var t = min >= de.originalCurHP ? 'KO' : max >= de.originalCurHP ? 'KO?' :
					Math.round(min / total * 100) + '–' + Math.round(max / total * 100) + '%';
				porMov[nombre] = { t: t, ko: min >= de.originalCurHP || max >= de.originalCurHP };
			} catch (e) { /* nada */ }
		});
		cont.__v6dano = { firma: firma, porMov: porMov };
		danoCache[room.id] = porMov;
	}

	/* ------------------------------------------------------------------ *
	 *  11) HISTORIAL DE COMBATES (en este móvil): victorias, por formato,
	 *      por equipo y los momentos clave de cada combate.
	 *      Al acabar, la repetición se guarda en Showdown sin ventanas.
	 * ------------------------------------------------------------------ */
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
		var P = ps(), q = room.battle.stepQueue || [];
		var yo = P && P.user ? P.user.name : '';
		for (var i = q.length - 1; i >= 0; i--) {
			var l = q[i];
			if (typeof l !== 'string' || l.indexOf('rating:') < 0 || (yo && l.indexOf(yo) < 0)) continue;
			var m = /rating:\s*(\d+)\s*(?:&rarr;|→)\s*(?:<strong>)?(\d+)(?:<\/strong>)?[\s\S]*?\(([+-]?\d+)/.exec(l);
			if (m) return { despues: +m[2], cambio: +m[3] };
		}
		return null;
	}
	/** Momentos clave: KOs (turno y con qué), críticos, el golpe más fuerte y la Tera. */
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
					if (d > 0 && (!mayor || d > mayor.d)) mayor = { d: d, t: turno, txt: (ult.mio ? 'Tu ' : 'Su ') + ult.mov + ' → ' + nombreDe(p[2]) + ' −' + d + '%', mio: ult.mio };
				}
				continue;
			}
			if (tipo === 'faint') {
				var suyo = lado(p[2]) !== mio;
				out.push({ t: turno, txt: nombreDe(p[2]) + ' KO' + (ult ? ' (' + ult.mov + ')' : ''), bueno: suyo });
				continue;
			}
			if (tipo === '-crit') { out.push({ t: turno, txt: 'Critical hit' + (ult ? (ult.mio ? ' by your ' : ' by their ') + ult.mov : ''), bueno: lado(p[2]) !== mio }); continue; }
			if (tipo === '-terastallize') { out.push({ t: turno, txt: nombreDe(p[2]) + ' Tera ' + p[3], bueno: lado(p[2]) === mio }); continue; }
		}
		if (mayor) out.push({ t: mayor.t, txt: 'Biggest hit: ' + mayor.txt, bueno: mayor.mio });
		out.sort(function (a, z) { return a.t - z.t; });
		return out.slice(0, 14);
	}
	function apuntarCombate(room) {
		var b = room.battle;
		if (!room.side || !b || !b.ended) return;
		var g = ganador(b);
		if (g === null) return;
		var h = leer('v6_historial', []);
		for (var i = 0; i < h.length; i++) if (h[i].id === room.id) return;
		try { room.send('/savereplay silent'); } catch (e) { /* nada */ }
		var P = ps(), yo = (room.side && room.side.name) || (P && P.user.name) || '';
		var especies = function (side) { return (side.pokemon || []).map(function (x) { return x.speciesForme; }); };
		var fmt = formatoDeSala(room);
		var eb = leer('v6_equipo_busqueda', {});
		var equipo = !/random/.test(fmt) && eb.f === fmt ? eb.n || '' : '';
		var elo = cambioElo(room);
		h.unshift({
			id: room.id, fecha: Date.now(), formato: fmt, formatoNombre: nombreFormato(fmt),
			gana: g === '' ? null : toId(g) === toId(yo), rival: b.farSide.name, turnos: b.turn || 0,
			elo: elo ? elo.cambio : null, eloDespues: elo ? elo.despues : null,
			mios: especies(b.nearSide), suyos: especies(b.farSide), equipo: equipo,
			momentos: momentosClave(room)
		});
		guardar('v6_historial', h.slice(0, 200));
	}
	function iconoPoke(especie) {
		try { if (window.Dex && Dex.getPokemonIcon) return '<span class="v6-icono" style="' + Dex.getPokemonIcon(especie) + '"></span>'; } catch (e) { /* nada */ }
		return '';
	}
	function pintarHistorial(caja) {
		var h = leer('v6_historial', []);
		var hoy = new Date().toDateString(), vh = 0, dh = 0, v = 0, d = 0;
		var porFormato = {}, porEquipo = {};
		h.forEach(function (x) {
			if (x.gana === true) v++; else if (x.gana === false) d++;
			if (new Date(x.fecha).toDateString() === hoy) { if (x.gana === true) vh++; else if (x.gana === false) dh++; }
			var f = porFormato[x.formatoNombre] || (porFormato[x.formatoNombre] = { v: 0, d: 0 });
			if (x.gana === true) f.v++; else if (x.gana === false) f.d++;
			if (!/random/.test(x.formato)) {
				var clave2 = x.equipo || (x.mios || []).slice().sort().join(' · ');
				var e = porEquipo[clave2] || (porEquipo[clave2] = { v: 0, d: 0, mios: x.mios, nombre: x.equipo });
				if (x.gana === true) e.v++; else if (x.gana === false) e.d++;
			}
		});
		function fila(nombre, o) {
			var n = o.v + o.d;
			return '<div class="v6-h-fila"><span>' + nombre + '</span><b>' + o.v + '–' + o.d + '</b><i>' + (n ? Math.round(100 * o.v / n) : 0) + '%</i></div>';
		}
		var html = '<div class="v6-h-cab"><b>HISTORY</b><button type="button" data-v6h="cerrar">✕</button></div>';
		if (!h.length) {
			html += '<p class="v6-h-vacio">No battles on this phone yet. Each one is saved here when it ends.</p>';
		} else {
			html += '<div class="v6-h-resumen"><div><small>TODAY</small><b>' + vh + '–' + dh + '</b></div><div><small>TOTAL</small><b>' + v + '–' + d + '</b></div>' +
				'<div><small>WIN RATE</small><b>' + (v + d ? Math.round(100 * v / (v + d)) : 0) + '%</b></div></div>';
			html += '<h4>BY FORMAT</h4>' + Object.keys(porFormato).map(function (k) { return fila(esc(k), porFormato[k]); }).join('');
			var eqs = Object.keys(porEquipo).filter(function (k) { return porEquipo[k].v + porEquipo[k].d >= 1; });
			if (eqs.length) html += '<h4>BY TEAM</h4>' + eqs.map(function (k) {
				var e = porEquipo[k];
				return fila((e.nombre ? esc(e.nombre) + ' ' : '') + (e.mios || []).map(iconoPoke).join(''), e);
			}).join('');
			html += '<h4>LAST BATTLES</h4>' + h.slice(0, 40).map(function (x, i) {
				var res = x.gana === true ? 'v' : x.gana === false ? 'd' : 'e';
				var fecha = new Date(x.fecha);
				return '<details class="v6-h-combate"><summary><span class="v6-h-res ' + res + '">' + (res === 'v' ? 'W' : res === 'd' ? 'L' : '=') + '</span>' +
					'<span class="v6-h-quien">vs ' + esc(x.rival) + '<small>' + esc(x.formatoNombre) + ' · ' + x.turnos + ' turns · ' +
					fecha.toLocaleDateString() + ' ' + fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</small></span>' +
					(x.elo !== null && x.elo !== undefined ? '<span class="v6-h-elo ' + (x.elo >= 0 ? 'v' : 'd') + '">' + (x.elo >= 0 ? '+' : '') + x.elo + '</span>' : '') +
					'</summary><div class="v6-h-det">' +
					'<div class="v6-h-equipos">' + (x.mios || []).map(iconoPoke).join('') + '<i>vs</i>' + (x.suyos || []).map(iconoPoke).join('') + '</div>' +
					'<h5>KEY MOMENTS</h5>' + ((x.momentos || []).length ? (x.momentos || []).map(function (m) {
						return '<div class="v6-h-mom ' + (m.bueno ? 'v' : 'd') + '"><small>T' + m.t + '</small>' + esc(m.txt) + '</div>';
					}).join('') : '<small>—</small>') +
					'<a class="v6-h-rep" href="https://replay.pokemonshowdown.com/' + esc(String(x.id).replace(/^battle-/, '')) + '" target="_blank" rel="noopener">Watch replay</a>' +
					'</div></details>';
			}).join('');
		}
		caja.innerHTML = html;
	}
	function abrirHistorial() {
		var m = inicioEl();
		if (!m) return;
		var p = m.querySelector(':scope > #v6-historial');
		if (!p) {
			p = document.createElement('div');
			p.id = 'v6-historial';
			p.addEventListener('click', function (e) {
				if (e.target.closest('[data-v6h="cerrar"]')) { e.stopPropagation(); p.hidden = true; }
			});
			m.appendChild(p);
		}
		pintarHistorial(p);
		p.hidden = false;
	}

	/* ------------------------------------------------------------------ *
	 *  12) ASPECTO DE JUEGO
	 *      - Presentación VS al empezar un combate tuyo (tócala para saltar).
	 *      - Clima animado sobre la escena (lluvia, arena, nieve, sol).
	 *      - El panel de abajo coge el color del escenario.
	 * ------------------------------------------------------------------ */
	var VS_MS = 2300;
	function avatarDe(side) {
		try { if (side && side.avatar && window.Dex && Dex.resolveAvatar) return Dex.resolveAvatar(side.avatar); } catch (e) { /* nada */ }
		return '';
	}
	function presentacion(room, cont) {
		var b = room.battle;
		if (cont.__v6vs) return;
		if (!b.farSide || !b.farSide.name || !b.nearSide || !b.nearSide.name) return;
		cont.__v6vs = true;
		if (!room.side || (b.turn || 0) > 1 || b.ended) return;   // solo al empezar uno tuyo
		var v = document.createElement('div');
		v.className = 'v6-vs';
		var av = function (side) { var u = avatarDe(side); return u ? '<img alt="" src="' + esc(u) + '">' : ''; };
		v.innerHTML =
			'<div class="v6-vs-rival"><div class="v6-vs-av">' + av(b.farSide) + '</div><div><small>RIVAL</small><b>' + esc(b.farSide.name) + '</b></div></div>' +
			'<div class="v6-vs-letras">VS</div>' +
			'<div class="v6-vs-yo"><div><small>YOU</small><b>' + esc(b.nearSide.name) + '</b></div><div class="v6-vs-av">' + av(b.nearSide) + '</div></div>' +
			'<div class="v6-vs-formato">' + esc(nombreFormato(formatoDeSala(room))) + '</div>';
		v.addEventListener('click', function () { v.remove(); });
		cont.appendChild(v);
		setTimeout(function () { v.classList.add('v6-vs-fuera'); }, VS_MS);
		setTimeout(function () { v.remove(); }, VS_MS + 500);
	}

	// color del panel según el escenario (por el nombre del fondo de Showdown)
	var TINTES = [
		[/fondo-pradera/, 110, 30], [/fondo-mar/, 205, 36], [/fondo-montana/, 250, 22], [/fondo-ruinas/, 30, 26],
		[/fondo-bambu/, 120, 26], [/fondo-canon/, 15, 30], [/fondo-coliseo/, 265, 22], [/fondo-volcan/, 8, 34],
		[/forest|meadow|route|grass|jungle/, 112, 22], [/desert|mountain|canyon|sand|volcano/, 28, 26],
		[/beach|river|sea|aqua|ocean|water|deepsea/, 205, 30], [/ice|snow|frost/, 190, 26],
		[/cave|earthy|damp/, 25, 14], [/city|town|dark/, 225, 18], [/thunder|plains/, 48, 22], [/sky|pillar|space/, 262, 24]
	];
	function ambiente(room, battleEl, cont) {
		var w = room.battle.weather || '';
		var clima = /rain|primordial/.test(w) ? 'lluvia' : /sand/.test(w) ? 'arena' : /snow|hail/.test(w) ? 'nieve' : /sun|desolate/.test(w) ? 'sol' : '';
		ponAttr(battleEl, 'data-v6-clima', clima || null);
		if (clima && !battleEl.querySelector(':scope > .v6-clima-fx')) {
			var fx = document.createElement('div');
			fx.className = 'v6-clima-fx';
			battleEl.appendChild(fx);
		}
		var bd = battleEl.querySelector('.backdrop');
		var url = battleEl.style.getPropertyValue('--v5-fondo') || (bd ? (bd.style.backgroundImage || getComputedStyle(bd).backgroundImage || '') : '');
		if (cont.__v6bg === url) return;
		cont.__v6bg = url;
		var t = null;
		for (var i = 0; i < TINTES.length; i++) if (TINTES[i][0].test(url)) { t = TINTES[i]; break; }
		if (t) {
			cont.style.setProperty('--panel', 'hsl(' + t[1] + ' ' + t[2] + '% 13%)');
			cont.style.setProperty('--v6-log', 'hsl(' + t[1] + ' ' + t[2] + '% 8%)');
			cont.style.setProperty('--v6-borde', 'hsl(' + t[1] + ' ' + t[2] + '% 24%)');
		} else {
			cont.style.removeProperty('--panel'); cont.style.removeProperty('--v6-log'); cont.style.removeProperty('--v6-borde');
		}
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
	 *  Repaso de la pantalla (cada vez que Showdown cambia algo)
	 * ------------------------------------------------------------------ */
	/* ------------------------------------------------------------------ *
	 *  v7) REGISTRO ENTERO al tocar el resumen, y el tiempo en rojo solo
	 *      cuando quedan menos de 30 segundos.
	 * ------------------------------------------------------------------ */
	function abrirRegistro(cont) {
		var hoja = cont.querySelector(':scope > .v7-registro');
		if (!hoja) {
			hoja = document.createElement('div');
			hoja.className = 'v7-registro';
			hoja.innerHTML = '<div class="v7-registro-caja"><div class="v7-registro-cab"><span>Battle log</span><button type="button">Close</button></div><div class="v7-registro-texto"></div></div>';
			hoja.addEventListener('click', function (e) {
				e.stopPropagation();
				if (e.target === hoja || e.target.closest('.v7-registro-cab button')) hoja.hidden = true;
			});
			cont.appendChild(hoja);
		}
		var texto = hoja.querySelector('.v7-registro-texto');
		var log = cont.querySelector('.battle-log');
		texto.innerHTML = log ? Array.prototype.filter.call(log.children, function (c) {
			return !c.classList.contains('controls') && !c.classList.contains('battle-options');
		}).map(function (c) { return c.innerHTML; }).join('') : '';
		Array.prototype.forEach.call(texto.querySelectorAll('button, input, form, .chat-log-add'), function (x) { x.remove(); });
		hoja.hidden = false;
		texto.scrollTop = texto.scrollHeight;
	}
	function tiempo(cont) {
		var t = cont.querySelector(':scope > button.button[role="timer"], :scope > .button[data-href="battletimer"]');
		if (!t) return;
		var txt = t.textContent || '', seg = null;
		var m = /(\d+):(\d\d)/.exec(txt);
		if (m) seg = (+m[1]) * 60 + (+m[2]);
		else if ((m = /(\d+)\s*(s|sec)\b/i.exec(txt))) seg = +m[1];
		ponAttr(t, 'data-v7-poco', seg !== null && seg < 30 ? '1' : null);
	}

	function repaso() {
		if (!esMovil() || !ps()) return;
		if (!avisado) { avisado = true; aviso('Script v6 activo', 2000); }
		try { parchearBusqueda(); pintarInicio(); } catch (e) {}
		try { sinCartelStats(); } catch (e) {}
		try {
			// barra de arriba: el título no se mete bajo tu nombre (se corta con …)
			Array.prototype.forEach.call(document.querySelectorAll('.mini-header'), function (h) {
				var der = h.querySelector('.mini-header-right');
				var pad = der ? (der.offsetWidth + 10) + 'px' : '';
				if (h.style.paddingRight !== pad) h.style.paddingRight = pad;
			});
		} catch (e) {}
		try { cargarAyudaEquipos(); } catch (e) {}
		var batallas = document.querySelectorAll('.ps-room .battle');
		for (var i = 0; i < batallas.length; i++) {
			var bEl = batallas[i];
			var room = salaDe(bEl);
			if (!room || !room.battle) continue;
			var cont = bEl.closest('.ps-room');
			try { fondo(bEl, room); } catch (e) {}
			try { engancharEscena(room, bEl); } catch (e) {}
			try { danoBotones(room, cont); } catch (e) {}
			try { eficaciaAtaques(room, cont); } catch (e) {}
			try { vidaCambios(room, cont); } catch (e) {}
			try { finCombate(room, cont); } catch (e) {}
			try { campo(room, bEl); } catch (e) {}
			try { ambiente(room, bEl, cont); } catch (e) {}
			try { presentacion(room, cont); } catch (e) {}
			try { resumen(room, cont); } catch (e) {}
			try { botonRival(room, bEl, cont); } catch (e) {}
			try { tiempo(cont); } catch (e) {}
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
