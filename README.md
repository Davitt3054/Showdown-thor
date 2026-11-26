# Showdown Thor (y Showdown Móvil)

En este repositorio hay **dos apps Android separadas** para jugar a Pokémon Showdown:

| App | Para qué | Archivo que se descarga | Carpetas |
|---|---|---|---|
| **Showdown Thor** | La AYN Thor, con sus dos pantallas y el mando | `Showdown-Thor.apk` | `app/` y `web/` |
| **Showdown Móvil** | El móvil (S23), en vertical y táctil | `Showdown-Movil.apk` | `movil/` (y `movil/web/`) |

Cada app tiene sus propios archivos: lo que se cambie en una no toca la otra.
Las dos salen juntas en cada versión de *Releases*. Instala cada `.apk` en su aparato.

Todo el plan de la Thor está en [`docs/Showdown_Thor_app_plan.md`](docs/Showdown_Thor_app_plan.md) y las maquetas en [`docs/maquetas/`](docs/maquetas/).

## Qué hay en el repositorio

| Carpeta / archivo | Qué es |
|---|---|
| `web/estilo.css` | Thor: el estilo que se pone sobre Showdown. |
| `web/mando.user.js` | Thor: el script del mando. |
| `web/abajo.html` | Thor: la pantalla de abajo (calculadora, rival, equipo, chat, historial, guía). |
| `app/` | Thor: el código de la app Android. |
| `movil/` | Móvil: la app entera (código, y en `movil/web/` su estilo, script, ayuda del equipo y fondos). |
| `.github/workflows/apk.yml` | La receta con la que GitHub fabrica los dos `.apk` y los publica en *Releases*. |
| `docs/` | Plan, maquetas, lista de pendientes y archivos originales de partida. |

La explicación de abajo es de la app de la **Thor**.

## Botones de la Thor (lo que vale ahora)

| Botón | En combate |
|---|---|
| Cruceta | moverse por los ataques |
| A | usar el ataque marcado · durante la animación, la salta |
| B | volver / deshacer la elección |
| X | equipo para cambiar |
| Y | Tera |
| R2 | ficha / inspeccionar |
| L1 / R1 | pestañas de la pantalla de abajo |
| Start | Inicio ⇄ combate |
| Select | mantener = ayuda |

**Inicio:** A buscar combate · ◀ ▶ formato · X equipos · Y repeticiones · Start ajustes · cruceta arriba/abajo para Ladder, Buscar usuario y Amigos.
Si alguien te reta, sale en el Inicio (Aceptar / Elegir equipo / Rechazar). Si te retan en otra pantalla, sale un aviso.

(Lo de las fases de más abajo es la historia de cómo se hizo; algunos botones de entonces han cambiado.)

## Cómo funciona (fase 1)

- La app abre `play.pokemonshowdown.com` a pantalla completa.
- Al arrancar intenta bajar `web/estilo.css` y `web/mando.user.js` de la rama `main`. Si no puede (sin internet o repositorio privado), usa la última copia que bajó o la que lleva dentro.
- El mando lo lee Android y se lo pasa al script con un "puente" (`app/src/main/assets/puente.js`), así el script funciona igual que en Firefox.
- B (y el gesto de atrás) nunca cierran la app. Para salir: botón de inicio de Android.
- La pantalla se queda encendida; el script la deja apagarse tras 20 min sin tocar nada.
- La sesión (usuario, ajustes, equipos) se guarda.
- Siempre abre el **cliente nuevo** de Showdown (para el que están hechos el estilo y el script). La primera vez deja puestos el tema oscuro y "Side-by-side, overlay controls"; si luego los cambias, se respeta.
- Entrar con usuario y contraseña funciona. Las cuentas que solo entran "con Google" no: Google no deja iniciar sesión dentro de apps.

## Fase 2: pantallas propias y ataque directo

Todo esto vive en `web/` (se descarga solo al abrir la app, sin reinstalar):

- **Inicio** (maqueta 02): logo, formato con L1 / R1, **A = buscar combate**, Y equipos, X repeticiones, Start ajustes (o volver al combate si tienes uno abierto). B enseña el Inicio normal de Showdown.
- **Buscando rival** (maqueta 03): formato y tiempo, tu avatar en su roca y el "?" del rival. **B cancela.**
- **Combate** (maqueta 04): los 4 ataques salen solos en 2×2 con estilo *etiqueta de tipo* (colores de la tabla del plan, icono propio de cada tipo, letra del botón en un círculo, x2 en mostaza). **Y X / B A atacan directamente**; con la cruceta aparece un cursor y A confirma el marcado. L1 equipo, **R1 Tera**, **R2 saltar animación**, **L2 deshacer la elección** (también la del primero en dobles), L3 ficha / inspeccionar, Select deshacer.
- **Fin de combate** (maquetas 09/10, sin el escenario animado, que es de la fase 4): sin palabra de victoria/derrota; el cielo se aclara si ganas y se oscurece si pierdes. "vs rival · N turnos" y el Elo. **A nuevo combate** (mismo formato y equipo), Y revancha, X guardar repetición, B inicio. Select esconde la pantalla para ver el combate.
- **Ayuda**: mantener Select. Dentro de la ayuda, **L1 / R1 cambian el modo de ataque**: *mixto* (X Y A B atacan y la cruceta marca), *directo* (solo X Y A B) o *cursor* (cruceta y A).

Mientras el chat siga en la pantalla de arriba (hasta la fase 3) los ataques ocupan todo el ancho de la escena para que se lean los nombres.

## Fase 3: la pantalla de abajo

La app abre `web/abajo.html` en la pantalla pequeña de la Thor (la de 1240×1080). Si no la encuentra, todo sigue arriba como en la fase 2.

- **En combate**, pestañas (R3 cambia):
  - **Calculadora** (maquetas 04/05): cuánto quita cada uno de tus ataques (el marcado con la cruceta se resalta) y cuánto te puede quitar el rival, con "LO DEBILITA", "a veces", "N golpes", "PELIGRO". Toca para ajustar el set, objeto, habilidad, Tera, subidas y clima del rival: lo cambiado sale en amarillo. **Mantener Select = restablecer.** Usa @smogon/calc (va dentro de la app) y los sets de Random Battle de data.pkmn.cc para lo "probable".
  - **Rival** (maqueta 06): todo lo visto en sólido y lo probable en discontinuo, quién es más rápido y cuántos quedan sin ver.
  - **Equipo**: tus Pokémon con vida, objeto, habilidad, ataques, stats y Tera.
  - **Chat** (maqueta 07): registro y chat, filtro "solo jugadores", mensajes rápidos y teclado al tocar.
- **Inicio**: últimos combates (V/D, rival, turnos, Elo) y cuántos llevas hoy.
- **Historial** (fuera del combate, con R3): todos tus combates con fecha, tipo del rival, resultado, Elo, con qué salió el rival, qué Pokémon suyo te hizo más daño, tu frase y el enlace a la repetición. La repetición se guarda sola en Showdown al acabar. El botón **«Copiar para la hoja»** lo copia todo con las columnas de tu guía para pegarlo en Google Sheets.
- **Guía**: tu guía de Monotype Volador.
- **Buscando**: tu equipo.
- **Fin**: resumen con KOs y PS al final de cada Pokémon y el Elo, y un recuadro para escribir por qué ganaste o perdiste.
- Arriba, con dos pantallas, el chat pasa abajo y el combate ocupa toda la escena.

## Fase 4: título, carátula y escenarios

- **Pantalla de título** (maqueta 01) cada vez que abres la app: el escenario cambia cada vez (lluvia sobre el agua, campo, atardecer o noche) con dos Pokémon de Showdown en sus rocas; logo "POKÉMON SHOWDOWN" con la O como anillo con gota (lluvia/noche) o rayo (campo/atardecer). Abajo, la continuación del escenario y solo tu usuario. Cualquier botón (o tocar) entra.
- **Fin de combate**: escampa con rayos de luz si ganas y diluvia si pierdes.
- **Carátula** para el lanzador de la Thor (maqueta 11): [`caratula/caratula_600x900.png`](caratula/caratula_600x900.png) (y una versión grande de 1200×1800). Se hace desde `caratula/caratula.html`.
- **Escenarios de combate**: Showdown ya elige uno distinto en cada combate (de su propia colección); el estilo no lo tapa.

## Instalar en la Thor

1. En la Thor, abre la página del repositorio → **Releases** → la versión más nueva → descarga `ShowdownThor-….apk`.
2. Ábrelo. La primera vez Android pide permiso para "instalar apps desconocidas" desde el navegador: actívalo.
3. Las versiones nuevas se instalan encima, sin perder la sesión.
