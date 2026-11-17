# Showdown Thor

App Android para jugar a Pokémon Showdown en la AYN Thor, con dos pantallas y mando.

Todo el plan está en [`docs/Showdown_Thor_app_plan.md`](docs/Showdown_Thor_app_plan.md) y las maquetas en [`docs/maquetas/`](docs/maquetas/).

## Qué hay en el repositorio

| Carpeta / archivo | Qué es |
|---|---|
| `web/estilo.css` | El estilo que se pone sobre Showdown. **Editarlo cambia el aspecto sin reinstalar** (la app lo descarga al arrancar). |
| `web/mando.user.js` | El script del mando. Igual: se descarga al arrancar. |
| `app/` | El código de la app Android. |
| `.github/workflows/apk.yml` | La receta con la que GitHub fabrica el `.apk` y lo publica en *Releases*. |
| `docs/` | Plan, maquetas y archivos originales de partida. |

## Cómo funciona (fase 1)

- La app abre `play.pokemonshowdown.com` a pantalla completa.
- Al arrancar intenta bajar `web/estilo.css` y `web/mando.user.js` de la rama `main`. Si no puede (sin internet o repositorio privado), usa la última copia que bajó o la que lleva dentro.
- El mando lo lee Android y se lo pasa al script con un "puente" (`app/src/main/assets/puente.js`), así el script funciona igual que en Firefox.
- B (y el gesto de atrás) nunca cierran la app. Para salir: botón de inicio de Android.
- La pantalla se queda encendida; el script la deja apagarse tras 20 min sin tocar nada.
- La sesión (usuario, ajustes, equipos) se guarda.

## Instalar en la Thor

1. En la Thor, abre la página del repositorio → **Releases** → la versión más nueva → descarga `ShowdownThor-….apk`.
2. Ábrelo. La primera vez Android pide permiso para "instalar apps desconocidas" desde el navegador: actívalo.
3. Las versiones nuevas se instalan encima, sin perder la sesión.
