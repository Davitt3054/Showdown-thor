# Pendientes de Showdown Thor

Lista de cambios acordados y fallos encontrados jugando en la Thor.
Se hacen todos juntos en un mismo PR cuando David lo diga.

## 0. Separación en dos apps (26 nov) — HECHO

- La Thor y el móvil son ya dos apps distintas (`Showdown-Thor.apk` y `Showdown-Movil.apk`).
- La Thor vuelve a la versión del 19 de noviembre (Grafito, dos pantallas) con lo del PR 6.
- Sin fondos en la Thor de momento: se harán de nuevo, poco a poco.
- Lo siguiente: comprobar el teambuilder y poder retar a otros jugadores en la Thor.

## 0b. Mejoras traídas a la Thor (26 nov) — HECHO, falta probar en la Thor

- Botones con menú (cruceta + A, B atrás, X equipo, Y Tera, R2 ficha, L1/R1 pestañas).
- Calculadora sin iluminación del ataque marcado.
- Inicio en castellano con Ladder, Buscar usuario y Amigos; los retos salen en el Inicio.
- Daño en cada ataque («45–53%», «KO») junto a la eficacia (en individuales).
- Dobles: eficacia en grande al elegir a quién atacar.
- Estado del campo con turnos y clima animado.
- Resumen del turno en filas (abajo, encima de Calculadora, Rival y Equipo).
- Formatos: ◀ ▶ pasan por todos (también favoritos y últimos jugados).
- Historial con momentos clave de cada combate.
- Ayuda del equipo (Resumen, Completar, Velocidades) en la pantalla de abajo: pestaña «TU EQUIPO».
- Botones de volumen = sonido del juego.
- Fuera, a propósito: fondos nuevos y estilo en inglés.

## 1. Botones nuevos: esquema sencillo con menú (acordado)

Se quita el ataque directo con Y X B A. Los ataques se eligen con la cruceta, como en el resto de la app.

| Botón | En combate |
|---|---|
| Cruceta | moverse por los ataques (el cursor sale siempre, ya en el primero) |
| A | usar el ataque marcado · durante la animación, la salta |
| B | volver / deshacer la elección (también en dobles) |
| X | Pokémon: abrir el equipo para cambiar |
| Y | Tera |
| R2 | ficha del ataque o Pokémon marcado / inspeccionar |
| L1 / R1 | pestaña anterior / siguiente de la pantalla de abajo |
| Start | Inicio ⇄ combate |
| Select | mantener = ayuda |
| L2, L3, R3 | libres |

- Los ataques siguen en 2×2 con el color de su tipo, pero sin las letras Y X B A en el círculo.
- Inicio: A busca combate, la cruceta ◀ ▶ cambia el formato, L1 / R1 pasan las pestañas de abajo (Inicio, Historial, Guía).
- Buscando y fin de combate: igual que ahora.
- Actualizar la ayuda (mantener Select), las píldoras de la pantalla (L1 EQUIPO, R1 Tera) y el README.

## 2. Pantalla de abajo

- Quitar la iluminación del ataque marcado en la calculadora (pone nervioso).

## 3. Ya hecho, pendiente de instalar (PR 6)

- Dobles: Pokémon más pequeños para que no queden pegados.
- Chat: tus ataques resaltados en ámbar.
- Orden de turno de todos los que están en el campo (Calculadora y Rival).
- Stick derecho: ejes alternativos si el mando no tiene los normales.
- Mantener Select = ayuda siempre; botón «Restablecer» en la calculadora.
- GitHub fabrica la app con cada cambio (repositorio privado).

## 4. Fallos que vaya encontrando David

- **Pasar la Thor al inglés** (lo quiere David): Inicio, botones, pantallas de buscar y fin, ayuda y pantalla de abajo.

### Prueba del 26 nov (dobles, fotos)

Combate
1. Dobles: después de elegir un ataque, al inspeccionar no se puede pasar a los Pokémon rivales.
2. La ficha (Pokémon o ataque) es un cuadro blanco de Showdown: no va con el estilo, el marco naranja
   no coincide con lo que señala y se corta abajo. Hacerla oscura (Grafito) y que se vea entera.
3. La pista de arriba aún dice «B / L3: salir» (L3 ya no hace nada): ponerla al día.
4. Dobles: las barras de vida tapan a los Pokémon (la de Seviper tapa al rival, la de Hitmonlee
   se monta sobre la de Seviper) y los rivales siguen muy juntos (Calyrex pegado a Registeel).
5. Ataques: el nombre se corta mucho («Flamethro…», «L…», «D…», «S…») desde que llevan el daño;
   el daño se monta sobre el tipo («Psíquico») y la línea de PP se corta abajo.
6. Elegir objetivo en dobles: la eficacia grande (x4, x1, x½) tapa el nombre del Pokémon; el hueco
   de la izquierda queda vacío y descuadrado.
7. Botón de Tera: la etiqueta del tipo («FIRE», «FAIRY») sale cortada y en inglés.
8. Botón «Skip» en inglés.

Pantalla de abajo
9. Calculadora en dobles: solo calcula contra un rival (Registeel); poder elegir contra cuál.
11. No se ve en la escena qué ataque usa cada Pokémon: sacar un cartel durante la animación
    («Calyrex usa Protect»), con el color del tipo, en el lado de quien ataca.
12. Chat (abajo): resaltar el ataque de TODOS los Pokémon, no solo los tuyos: tuyos en ámbar y los
    del rival en otro color, para verlos siempre de un vistazo.
13. (Va bien: resumen del turno en filas, orden de turno, «más lento que…» en Rival.)

- (se van añadiendo aquí)
