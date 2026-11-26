/*
 * Showdown Thor · puente del mando
 *
 * En la app el mando lo lee Android (no el navegador). Este puente hace que
 * navigator.getGamepads() devuelva el mando tal y como lo veía Firefox
 * ("mapping standard": A=0, B=1, X=2, Y=3, L1=4, R1=5, L2=6, R2=7,
 * Select=8, Start=9, L3=10, R3=11, cruceta 12-15), así el script del mando
 * funciona sin cambiar ni una línea.
 *
 * También imita "Wake Lock" (pantalla encendida): cuando el script lo pide o
 * lo suelta, se lo dice a Android.
 */
(function () {
	'use strict';
	if (window.top !== window) return;          // solo en la página principal
	if (window.__thorPuente) return;
	window.__thorPuente = true;

	var nat = window.ThorPad;                   // lo pone la app (Java)
	if (!nat) return;

	var N_BOTONES = 17, N_EJES = 4;
	var buttons = [];
	for (var i = 0; i < N_BOTONES; i++) buttons.push({ pressed: false, touched: false, value: 0 });
	var axes = [0, 0, 0, 0];
	var pad = {
		id: 'Odin Controller (Showdown Thor)',
		index: 0,
		connected: true,
		mapping: 'standard',
		timestamp: 0,
		buttons: buttons,
		axes: axes,
		hapticActuators: [],
		vibrationActuator: null
	};
	var conectadoAntes = false;

	function avisar(tipo) {
		setTimeout(function () {
			var ev = new Event(tipo);
			try { ev.gamepad = pad; } catch (e) { /* nada */ }
			window.dispatchEvent(ev);
		}, 0);
	}

	function getGamepads() {
		var s;
		try { s = String(nat.read()); } catch (e) { return [null, null, null, null]; }
		var partes = s.split('|');
		var conectado = partes[0] === '1';
		if (conectado) {
			var b = (partes[1] || '').split(',');
			for (var i = 0; i < N_BOTONES; i++) {
				var v = +b[i] || 0;
				var bt = buttons[i];
				bt.value = v;
				bt.pressed = v > 0.5;
				bt.touched = bt.pressed;
			}
			var a = (partes[2] || '').split(',');
			for (var j = 0; j < N_EJES; j++) axes[j] = +a[j] || 0;
			pad.timestamp = performance.now();
		}
		pad.connected = conectado;
		if (conectado !== conectadoAntes) {
			conectadoAntes = conectado;
			avisar(conectado ? 'gamepadconnected' : 'gamepaddisconnected');
		}
		return [conectado ? pad : null, null, null, null];
	}

	try {
		Object.defineProperty(Navigator.prototype, 'getGamepads', { value: getGamepads, configurable: true, writable: true });
	} catch (e) {
		try { navigator.getGamepads = getGamepads; } catch (e2) { /* nada */ }
	}

	/* ---- Pantalla encendida (imitación de Wake Lock) ---- */
	var activos = 0;
	function nuevoLock() {
		var l = new EventTarget();
		l.type = 'screen';
		l.released = false;
		l.release = function () {
			if (!l.released) {
				l.released = true;
				activos = Math.max(0, activos - 1);
				if (!activos) { try { nat.keepScreenOn(false); } catch (e) { /* nada */ } }
				l.dispatchEvent(new Event('release'));
			}
			return Promise.resolve();
		};
		return l;
	}
	var wakeLock = {
		request: function () {
			activos++;
			try { nat.keepScreenOn(true); } catch (e) { /* nada */ }
			return Promise.resolve(nuevoLock());
		}
	};
	try {
		Object.defineProperty(Navigator.prototype, 'wakeLock', { get: function () { return wakeLock; }, configurable: true });
	} catch (e) { /* nada */ }
})();
