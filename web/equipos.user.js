// ==UserScript==
// @name         Showdown · ayuda del equipo
// @namespace    david.showdown.equipos
// @version      1.0.0
// @description  En el Teambuilder: resumen de debilidades, completar el equipo con los compañeros más usados y velocidades. Lo cargan solos los scripts del móvil y de la Thor.
// @match        https://play.pokemonshowdown.com/*
// @grant        none
// ==/UserScript==

/*
  AYUDA DEL EQUIPO (para formatos con equipo: OU, Monotype, Ubers, VGC…)

  Al abrir un equipo en el Teambuilder sale abajo la barra
  "Resumen · Completar · Velocidades". Cada botón abre su pantalla:

  - RESUMEN: el % de uso de cada uno en el formato, los avisos (débiles en
    común, tipos que nadie resiste, nadie quita trampas, prioridad) y la
    tabla de débiles / resisten por tipo.
  - COMPLETAR: los compañeros que más se usan con los tuyos y qué arreglan.
    "+" lo añade con su set más usado (luego lo cambias a tu gusto).
  - VELOCIDADES: tus Pokémon entre los más usados del formato, con su
    reparto más típico. Con un toque, cómo quedaría con Choice Scarf.

  Los datos de uso salen de Smogon (pkmn.github.io/smogon, del último mes).
  Los "Sample sets" de cada Pokémon ya los trae Showdown al editarlo.
*/

(function () {
	'use strict';
	if (window.__sdEquipos) return;
	window.__sdEquipos = true;

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
			if (r.deb.length >= 3) avisos.push('<b>' + r.deb.length + ' débiles a ' + r.tipo + '</b> (' + esc(r.deb.join(', ')) + ')');
			else if (r.deb.length >= 2 && !cubre) avisos.push('<b>' + r.tipo + '</b>: ' + r.deb.length + ' débiles y nadie lo resiste');
		});
		var quita = miembros.filter(function (m) { return (m.set.moves || []).some(function (mv) { return QUITA_TRAMPAS.indexOf(toId(mv)) >= 0; }); });
		if (miembros.length >= 3 && !quita.length) avisos.push('Nadie <b>quita trampas</b> (Rapid Spin / Defog)');
		var prio = miembros.filter(function (m) {
			return (m.set.moves || []).some(function (mv) { var d = Dex.moves.get(mv); return d && d.priority > 0 && d.category !== 'Status'; });
		});
		if (miembros.length >= 3) {
			if (!prio.length) avisos.push('Nadie tiene <b>prioridad</b>');
			else if (prio.length === 1) avisos.push('Solo ' + esc(prio[0].nombre) + ' tiene <b>prioridad</b>');
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
			if (arregla.length) razones.push('Resiste ' + arregla.join(' y '));
			var movs = Object.keys(u.moves || {});
			if (!an.quita && movs.slice(0, 8).some(function (m) { return QUITA_TRAMPAS.indexOf(toId(m)) >= 0; })) razones.push('quita trampas');
			if (sp.baseStats.spe >= 110) razones.push('muy rápido');
			if (!an.prio && movs.slice(0, 8).some(function (m) { var dm = Dex.moves.get(m); return dm && dm.priority > 0 && dm.category !== 'Status'; })) razones.push('tiene prioridad');
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
		if (sets.length >= 6) { aviso('El equipo ya tiene 6'); return; }
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
			aviso(nombre + ' añadido con su set más usado');
		} catch (e) { aviso('No se ha podido añadir'); }
		pintar();
	}

	/* ---------------- pantalla ---------------- */
	var panel = null, barra = null, pestana = 'resumen', scarf = false;
	function aviso(t) {
		var a = document.createElement('div');
		a.className = 'sdq-aviso';
		a.textContent = t;
		document.body.appendChild(a);
		setTimeout(function () { a.remove(); }, 2200);
	}
	function crear() {
		barra = document.createElement('div');
		barra.id = 'sdq-barra';
		barra.innerHTML = '<button type="button" data-sdq="resumen">Resumen</button><button type="button" data-sdq="completar">Completar</button><button type="button" data-sdq="velocidad">Velocidades</button>';
		panel = document.createElement('div');
		panel.id = 'sdq-panel';
		panel.hidden = true;
		document.addEventListener('click', function (e) {
			var b = e.target.closest && e.target.closest('[data-sdq]');
			if (!b) return;
			e.preventDefault(); e.stopPropagation();
			var q = b.getAttribute('data-sdq');
			if (q === 'cerrar') { panel.hidden = true; return; }
			if (q === 'scarf') { scarf = !scarf; pintar(); return; }
			if (q.indexOf('add:') === 0) { anadir(q.slice(4)); return; }
			pestana = q; panel.hidden = false; pintar();
		}, true);
		var estilo = document.createElement('style');
		estilo.textContent = CSS;
		(document.head || document.documentElement).appendChild(estilo);
	}
	function pintar() {
		var s = salaEquipo();
		if (!s || panel.hidden) return;
		var fmt = formatoDe(s);
		var sets = setsDe(s);
		var titulo = { resumen: 'RESUMEN DEL EQUIPO', completar: 'COMPLETAR EQUIPO', velocidad: 'VELOCIDADES' }[pestana];
		var cab = '<div class="sdq-cab"><button type="button" data-sdq="cerrar">‹ Equipo</button><b>' + titulo + '</b></div>';
		if (!fmt || /random/.test(fmt)) { panel.innerHTML = cab + '<p class="sdq-nota">Elige primero un formato con equipo (OU, Monotype, Ubers…).</p>'; return; }
		if (!USO[fmt] || USO[fmt] === 'cargando') {
			panel.innerHTML = cab + '<p class="sdq-nota">Cargando los datos de uso de ' + esc(fmt) + '…</p>';
			cargarUso(fmt, function () { pintar(); });
			return;
		}
		var d = USO[fmt];
		var an = analizar(sets);
		var h = cab;
		if (d.error) h += '<p class="sdq-nota">No hay datos de uso para este formato (o no hay conexión). Lo de tipos sí funciona.</p>';
		if (pestana === 'resumen') {
			h += '<div class="sdq-miembros">' + an.miembros.map(function (m) {
				var u = usoDe(d, m.nombre);
				return '<div>' + icono(m.nombre) + '<b>' + esc(m.nombre) + '</b><small>' + (u ? 'uso ' + pct(u.usage.weighted) : '') + '</small></div>';
			}).join('') + '</div>';
			h += an.avisos.length ? '<div class="sdq-avisos">' + an.avisos.map(function (a) { return '<div>⚠ ' + a + '</div>'; }).join('') + '</div>'
				: (an.miembros.length ? '<div class="sdq-bien">✓ Sin agujeros claros de tipos</div>' : '<p class="sdq-nota">El equipo está vacío.</p>');
			h += '<div class="sdq-tabla"><div class="sdq-fila sdq-th"><span>TIPO</span><span>DÉBILES</span><span>RESISTEN</span></div>' + an.tabla.map(function (r) {
				var malo = r.deb.length >= 3 || (r.deb.length >= 2 && !r.res.length && !r.inm.length);
				return '<div class="sdq-fila' + (malo ? ' sdq-malo' : '') + '"><span>' + tipoChip(r.tipo) + '</span>' +
					'<span>' + r.deb.map(function (n) { return '<i class="sdq-p d" title="' + esc(n) + '"></i>'; }).join('') + '</span>' +
					'<span>' + r.res.map(function (n) { return '<i class="sdq-p r" title="' + esc(n) + '"></i>'; }).join('') +
					r.inm.map(function (n) { return '<i class="sdq-p i" title="' + esc(n) + '"></i>'; }).join('') + '</span></div>';
			}).join('') + '</div><p class="sdq-ley"><i class="sdq-p d"></i> débil <i class="sdq-p r"></i> resiste <i class="sdq-p i"></i> inmune</p>';
		} else if (pestana === 'completar') {
			var sug = sugerencias(sets, d, an);
			h += '<p class="sdq-nota">Los que más se usan con los tuyos en ' + esc(fmt) + ' y qué arreglan. "+" lo añade con su set más usado.</p>';
			h += sug.length ? sug.map(function (x) {
				return '<div class="sdq-sug">' + icono(x.nombre) + '<div class="sdq-sug-t"><b>' + esc(x.nombre) + '</b> ' + x.tipos.map(tipoChip).join('') +
					'<small>' + (x.razones.length ? esc(x.razones.join(' · ')) : 'compañero habitual') + '</small>' +
					'<span class="sdq-barra-uso"><i style="width:' + Math.min(100, Math.round(x.junto * 100)) + '%"></i></span><small>va con los tuyos ' + pct(x.junto) + '</small></div>' +
					(sets.length < 6 ? '<button type="button" class="sdq-mas" data-sdq="add:' + esc(x.nombre) + '">+</button>' : '') + '</div>';
			}).join('') : '<p class="sdq-nota">Añade algún Pokémon y te digo con quién combina.</p>';
		} else {
			var filas = listaVelocidades(sets, d, fmt, scarf);
			h += '<div class="sdq-toggle"><button type="button" data-sdq="scarf" class="' + (scarf ? '' : 'on') + '">Normal</button><button type="button" data-sdq="scarf" class="' + (scarf ? 'on' : '') + '">Los tuyos con Choice Scarf</button></div>';
			h += filas.map(function (f) {
				return '<div class="sdq-vel' + (f.mio ? ' mio' : '') + '">' + icono(f.nombre) + '<b>' + esc(f.nombre) + (f.mio ? ' (tú)' : '') + '</b><small>' + esc(f.txt) + '</small><span>' + f.v + '</span></div>';
			}).join('');
			h += '<p class="sdq-nota">Los más usados del formato con su reparto más típico. Los tuyos, con tus EVs y naturaleza.</p>';
		}
		if (panel.__h !== h) { panel.innerHTML = h; panel.__h = h; }
	}
	function repaso() {
		var s = salaEquipo();
		if (!barra) crear();
		var el = s && document.getElementById('room-' + s.room.id);
		if (!el) { if (barra.parentNode) barra.remove(); if (panel.parentNode) { panel.remove(); panel.hidden = true; } return; }
		if (barra.parentNode !== el) el.appendChild(barra);
		if (panel.parentNode !== el) el.appendChild(panel);
		pintar();
	}
	setInterval(repaso, 1000);
	new MutationObserver(function () { if (!repaso.p) { repaso.p = true; requestAnimationFrame(function () { repaso.p = false; repaso(); }); } })
		.observe(document.body, { childList: true, subtree: false });

	var CSS = [
		'#sdq-barra{position:sticky;bottom:0;z-index:15;display:flex;gap:6px;padding:8px;background:rgba(11,13,18,.96);border-top:1px solid #2c3656}',
		'#sdq-barra button{flex:1;height:40px;border-radius:8px;border:2px solid #2a3140;background:#151a24;color:#eef1f6;font:700 14px/1 "Atkinson Hyperlegible",system-ui,sans-serif}',
		'#sdq-barra button:first-child{border-color:#f2c84b;color:#f2c84b}',
		'#sdq-panel{position:absolute;inset:0;z-index:30;overflow-y:auto;padding:0 12px 24px;background:#0b0d12;color:#eef1f6;font:14px/1.4 "Atkinson Hyperlegible",system-ui,sans-serif}',
		'#sdq-panel[hidden]{display:none}',
		'.sdq-cab{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:10px;padding:10px 0;background:#0b0d12}',
		'.sdq-cab button{padding:6px 12px;border-radius:999px;border:1px solid #2c3656;background:#151a24;color:#eef1f6;font:inherit}',
		'.sdq-cab b{font:700 17px/1 "Pixelify Sans","Atkinson Hyperlegible",sans-serif;letter-spacing:1px}',
		'.sdq-nota{color:#aab6c8;font-size:13px}',
		'.sdq-miembros{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px}',
		'.sdq-miembros div{display:flex;flex-direction:column;align-items:center;padding:6px 2px;border-radius:8px;background:#151a24;border:1px solid #2a3140;text-align:center}',
		'.sdq-miembros b{font-size:12px;line-height:1.15}.sdq-miembros small{color:#aab6c8;font-size:11px}',
		'.sdq-icono{display:inline-block;width:40px;height:30px;flex:none}',
		'.sdq-avisos{margin:8px 0;padding:8px 10px;border-radius:10px;background:#3a1418;border:1px solid #8a2a24}',
		'.sdq-avisos div{padding:2px 0}.sdq-bien{margin:8px 0;padding:8px 10px;border-radius:10px;background:#14301f;border:1px solid #1f7a3a}',
		'.sdq-tipo{display:inline-block;padding:1px 8px;border-radius:999px;border:1.5px solid var(--c);color:var(--c);font-size:11px;font-weight:700;text-transform:uppercase;margin-right:3px}',
		'.sdq-tabla{margin-top:6px}.sdq-fila{display:grid;grid-template-columns:96px 1fr 1fr;align-items:center;gap:6px;padding:3px 4px;border-radius:6px}',
		'.sdq-th{font-size:11px;font-weight:700;letter-spacing:1px;color:#aab6c8}.sdq-malo{background:rgba(196,71,62,.18)}',
		'.sdq-p{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:3px}.sdq-p.d{background:#e0574e}.sdq-p.r{background:#3fa864}.sdq-p.i{background:#8fc8ff}',
		'.sdq-ley{font-size:12px;color:#aab6c8}',
		'.sdq-sug{display:flex;align-items:center;gap:8px;margin:6px 0;padding:8px;border-radius:10px;background:#151a24;border:1px solid #2a3140}',
		'.sdq-sug-t{flex:1;min-width:0}.sdq-sug-t small{display:block;color:#aab6c8;font-size:12px}',
		'.sdq-barra-uso{display:block;height:6px;margin:4px 0 1px;border-radius:3px;background:#2a3140;overflow:hidden}.sdq-barra-uso i{display:block;height:100%;background:#f2c84b}',
		'.sdq-mas{width:44px;height:44px;border-radius:10px;border:2px solid #f2c84b;background:#2a2614;color:#f2c84b;font:700 24px/1 sans-serif;flex:none}',
		'.sdq-toggle{display:flex;gap:6px;margin:4px 0 8px}.sdq-toggle button{padding:6px 12px;border-radius:999px;border:1px solid #2c3656;background:#151a24;color:#eef1f6;font:inherit;font-size:13px}',
		'.sdq-toggle button.on{background:#f2c84b;color:#1a1a1a;border-color:#f2c84b;font-weight:700}',
		'.sdq-vel{display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:8px}.sdq-vel b{flex:1;min-width:0}.sdq-vel small{color:#aab6c8;font-size:12px}',
		'.sdq-vel span{width:44px;text-align:right;font:700 16px/1 "Pixelify Sans",sans-serif}.sdq-vel.mio{background:#2a2614;border:2px solid #f2c84b}',
		'.sdq-aviso{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:9999;padding:8px 16px;border-radius:999px;background:#1f2945;border:1px solid #56627a;color:#eef1f6;font:13px sans-serif}'
	].join('\n');
})();
