# Showdown Thor · plan de la app

Maquetas: imágenes en `docs/maquetas/` (en orden de partida). Lienzo editable: https://claude.ai/artifact/BgQJmdfGqHJRyD3UZAG8ut
**Para los botones de ataque manda `04_combate_ataques.png` (estilo "etiqueta de tipo").** En 05–08 los ataques salen aún en el estilo pastel anterior: ignorar ese detalle.

## Qué es
App Android propia (.apk) para la AYN Thor (pantalla de arriba 1920×1080, abajo 1240×1080, táctil). WebView que abre play.pokemonshowdown.com con nuestro estilo y nuestro script de mando metidos. Sin Firefox ni extensiones.

## Cómo se trabaja
- Este repositorio. GitHub Actions compila el .apk y lo publica en Releases. Firma con una llave fija guardada como secreto (para instalar encima sin perder sesión).
- Estilo y script se descargan del repo al arrancar (con copia local); cambiar aspecto = editar archivo, sin reinstalar.
- David no es programador: guiarle por la web de GitHub paso a paso, sin línea de comandos. No hacer nada sin su OK. Explicar cada cambio en castellano sencillo.

## Diseño (estilo suave)
- Paneles azul marino (#1a2343 / #1f2945, borde #2c3656), texto #e9edf4.
- Barras de vida y chips en gris azulado suave (#d3dbe8 → #bcc7d8) con letra oscura: nada de blanco puro (deslumbra).
- Acento único amarillo mostaza #f2c84b para lo seleccionado / acción principal. Nada de colores chillones.
- **Ataques: estilo "etiqueta de tipo"** (como los filtros de tipo de una Pokédex): píldora con relleno de color medio del tipo, borde del mismo tono más claro, letra clara (#eeeef2), icono propio del tipo junto al nombre (dibujado por nosotros, no iconos oficiales), letra del botón en círculo oscuro con borde del color del tipo. Marcado por el cursor = aro mostaza. x2 en mostaza. En 2×2 con posiciones = botones físicos: Y arriba-izq, X arriba-dcha, B abajo-izq, A abajo-dcha.
- Botones de menú también en píldora.
- Fuentes: Barlow Condensed (títulos/botones) y Atkinson Hyperlegible (texto).
- Escenarios de combate variados (los de Showdown, rotando).
- Pantalla de título: escenario que cambia cada vez (lluvia sobre el agua, campo…), logo "POKÉMON SHOWDOWN" con la O como anillo con gota/rayo (nunca Poké Ball). Abajo: continuación del escenario y solo el usuario. Sin consejos.
- Buscando rival: lluvia sobre el lago. El avatar de Showdown de David en su roca; en la del rival, silueta con "?" que se cambia por su avatar al encontrarlo. "BUSCANDO RIVAL…" con formato y tiempo; B cancelar. Abajo: tu equipo.
- Fin del combate: SIN palabra de victoria/derrota. Lo cuenta el escenario: escampa con rayos de luz si ganas, diluvia si pierdes. Avatar de David en su roca. Etiqueta pequeña "vs [rival] · N turnos" + Elo en verde/rojo. Abajo: resumen (KOs, PS al final, Elo).
- Carátula 600×900 para el lanzador de juegos de la Thor.
- Los avatares y sprites reales salen de Showdown en la app; en las maquetas son huecos.

### Colores de tipo para los ataques (relleno / borde)
| Tipo | Relleno | Borde |
|---|---|---|
| Normal | #4a4b50 | #a2a3a8 |
| Lucha | #6e2a2a | #d0605a |
| Volador | #2f6a63 | #7fd1c4 |
| Veneno | #5e3480 | #b06fd8 |
| Tierra | #6e5428 | #d1a24c |
| Roca | #66592c | #c9b25a |
| Bicho | #56631f | #b5cf4a |
| Fantasma | #4b3f7c | #9586dc |
| Acero | #3e4664 | #8f98c0 |
| Fuego | #7a3f22 | #e07a40 |
| Agua | #26507e | #5c9be0 |
| Planta | #2f5a2f | #6fbf5a |
| Eléctrico | #6e6220 | #e3cf4a |
| Psíquico | #6e2440 | #e0507a |
| Hielo | #2a5e66 | #6fc6d1 |
| Dragón | #3b2f7a | #7c66e0 |
| Siniestro | #5a4038 | #a07a68 |
| Hada | #74275e | #e06fb8 |
(Siniestro, Fantasma, Normal y Acero son los probados en la maqueta; el resto, a ajustar viéndolos en la Thor.)

## Mapa de botones
| Botón | Acción |
|---|---|
| X / Y / A / B | Ataque directo (modo mixto) |
| Cruceta | Mueve el cursor por los ataques; con cursor visible, A confirma el marcado. La calculadora resalta el ataque marcado |
| L1 | Abrir equipo para cambiar (cruceta elige, A cambia, B vuelve). Se abre solo si cae un Pokémon |
| L3 (pulsar) | Tera |
| R1 | Saltar animación |
| R2 | Ficha / inspeccionar |
| R3 (pulsar) | Cambiar pestaña de la pantalla de abajo |
| Mantener L2 | Pestaña Rival |
| Select | Deshacer elección (mantener = restablecer calculadora) |
| Start | Inicio ⇄ combate |
| Fin de combate | **A nuevo combate** (lo más habitual) · Y revancha · X guardar repetición · B inicio |
| Inicio | A buscar combate (formato y equipo recordados) · L1/R1 cambiar formato |
| Buscando | B cancelar |
En Ajustes se puede fijar solo modo directo o solo cursor.

## Pantalla de abajo: pestañas
Calculadora (editable al tocar: set, objeto, habilidad, Tera, subidas, clima; lo cambiado a mano en amarillo) · Rival (todo su equipo visto: visto en sólido, probable en discontinuo) · Equipo · Chat (registro + chat, filtro "solo jugadores", mensajes rápidos táctiles, teclado al tocar).

## Fases
1. App básica: WebView a pantalla completa, estilo v2 + script mando 1.1 tal cual, sesión guardada, pantalla encendida, mando leído por Android y pasado al script, B no cierra la app.
2. Inicio con A = buscar, pantalla de búsqueda, modo mixto de ataques con el estilo de etiqueta, L1 equipo, L3 Tera, fin de combate con A = nuevo combate.
3. Pantalla de abajo (segunda pantalla con Presentation API): calculadora, rival, equipo, chat. Referencia: castdrian/showdown-ds (GPL) ya usa las dos pantallas en la Thor.
4. Título animado (lluvia animada), carátula, escenarios.

## Archivos de partida
- `docs/Codigo_thor_horizontal_v2.css`: estilo actual de la Thor (Stylus, cliente nuevo, horizontal).
- `docs/thor-mando.user.js`: script del mando v1.1 (Violentmonkey). Mapa de botones medido en la Thor: A=0, B=1, X=2, Y=3, L1=4, R1=5, L2=6, R2=7, Select=8, Start=9, L3=10, R3=11, cruceta 12–15 ("Odin Controller", mapping standard).
