# Catálogo de sonidos

Estado al 2026-07-20, tras el segundo drop del ingeniero de sonido y la
revisión con él. Los archivos llegaron con espacios y mayúsculas
(`OPCION REBOTE 1.mp3`, `menu+.mp3`, `REBOTE OPCION}.mp3`) y se renombraron a
kebab-case, que es lo que Vite necesita para importarlos sin fricción.

Todo suena por el canal **sfx** de Ajustes (volumen y mute aplican en vivo);
el cableado vive en `src/services/soundService.js` y los eventos de partida
en `playStateSfx` de `Game.jsx`.

## Corrección del mapeo anterior

El primer drop llegó sin nombres claros y se asignó a ojo. El segundo trajo
los mismos archivos con el nombre real del ingeniero, y por hash resultó que
tres estaban mal asignados:

| Nombre viejo | Uso que tenía | Lo que realmente es |
|---|---|---|
| `poder-2.mp3` | zona rápida/lenta | descarte (ver Fantasma) |
| `poder-1.mp3` | sin asignar | Zona lenta |
| `punto-anotado.mp3` | **gol** | Zona rápida |

Por eso el "sonido de gol" duraba 11s: nunca fue un sonido de gol.

**Fantasma**: llegaron dos, `poder Fantasma.mp3` y `Poder Fantasmaa.mp3`
(doble A). El ingeniero confirmó que el bueno es **el de doble A**; el otro
era descarte y se eliminó (era byte-idéntico al viejo `poder-2.mp3`).

## Procesado con ffmpeg (2026-07-20)

Casi todo el lote venía con cola de silencio: hasta 6s en el peor caso. Se
recortó todo por debajo de −50 dBFS con
`areverse,silenceremove=...,areverse` y se reencodeó a VBR `-q:a 2`.
La carpeta pasó de ~5.4 MB a ~2.6 MB. Dos excepciones:

- `musica-principal.mp3` no se tocó (no tiene cola y es la pista de música).
- `victoria.mp3` se dejó en su versión original: tenía solo 1.5s de cola y el
  reencode lo hacía *crecer* de 544 a 559 KB.

`gol-contra` llegó como WAV de 1.8 MB y se convirtió a MP3: **59 KB**.

`derrota-alt.mp3` (llegó como `OPCION PERDER.mp3`) se eliminó: además de
pesar 0 KB, ffmpeg no encontraba ni dos frames MPEG seguidos — venía corrupto.

`opcion.mp3` (llegó como `ocion.mp3`) resultó ser una **octava variante de
rebote**, no un sonido de menú: mismo peso (45 KB) y mismo perfil de duración
que `rebote-alt-1/2/3`. Se renombró a `rebote-alt-5.mp3`.

## Asignados (suenan en el juego)

| Archivo | Evento |
|---|---|
| `seleccionar.mp3` | Clic en botones principales: Jugar, Jugar contra el bot, Crear/Unirse a sala |
| `menu-mas.mp3` | Avanzar: entrar a una sección desde el Header (Salas, Chat, Ranking, Perfil, Ajustes) |
| `menu-retroceso.mp3` | Retroceder: volver al lobby (logo y Lobby del Header, "Volver al lobby" del final de partida) y cancelar (cola, sala privada) |
| `espera.mp3` | Se entra a la cola de matchmaking |
| `rival-encontrado.mp3` | El matchmaking empareja (solo humanos: aceptar bot ya suena con el clic) |
| `mensaje-chat.mp3` | Llega un DM de otra persona (los propios no suenan) |
| `inicio-partida.mp3` | Arranque de la partida, **una sola vez** (no en los saques tras gol) |
| `gol-favor.mp3` | Gol propio |
| `gol-contra.mp3` | Gol del rival |
| `victoria.mp3` | Fin de partida ganada (incluye rendición del rival) |
| `derrota.mp3` | Fin de partida perdida |
| `poder-aparece.mp3` | Brota un pickup en el tablero |
| `poder-zona-rapida.mp3` | Recoger Zona rápida |
| `poder-zona-lenta.mp3` | Recoger Zona lenta |
| `poder-caos.mp3` | Recoger Caos |
| `poder-obstaculo.mp3` | Recoger Obstáculo |
| `poder-fantasma.mp3` | Recoger Fantasma |
| `poder-escudo.mp3` | Recoger Escudo |
| `rebote-1/2/3.mp3` | Rebote del disco, **una de las 3 al azar** en cada golpe |

El mapeo tipo→sonido de los poderes vive en `POWER_SFX` de
`soundService.js`, con las claves que manda el servidor. Los rebotes salen
por `playRebote()`.

## Descartados tras probar el juego (2026-07-20)

- `inicio-partida-alt.mp3` (llegó como `OPCION INICIO DE PARTIDA.mp3`) — no
  gustó. Con él se va también el sonido de saque tras gol: hoy no hay.
- `rebote-alt-1..5.mp3` (llegaron como `OPCION REBOTE*`, `REBOTE OPCION}` y
  `ocion.mp3`) — confusos al oído mezclados con los otros. Quedan solo
  `rebote-1/2/3`.
- `poder Fantasma.mp3` (el de una sola A) y `OPCION PERDER.mp3` (corrupto).

Copia de todos, tal como llegaron, en el scratchpad de la sesión.

## Por qué el arranque no sonaba (arreglado)

La primera versión esperaba la transición `WAITING → PLAYING` comparando el
estado nuevo con el anterior. No funciona: el servidor hace esa transición en
`GameRoomService.playerConnected`, es decir **en el mismo momento en que el
jugador se conecta**. Contra el bot —que ya cuenta como conectado— el primer
estado que recibe el navegador ya viene en `PLAYING`, y ese primero se
descartaba por no tener con qué compararlo. Contra un humano sí sonaba,
porque el que llega primero ve la sala en `WAITING`.

Ahora el arranque se reconoce por el saque inicial (`serveAtEpochMs` en el
futuro y `lastScorer` vacío), que sirve tanto en el primer estado como en la
transición, y de paso deja mudas las reconexiones a mitad de partida.

## Detección de rebotes (heurística — verificar jugando)

El servidor **no manda evento de colisión**: el `GameState` solo trae
`puckX`/`puckY`. El rebote se deduce en `detectarRebote` comparando tres
estados seguidos: si la velocidad en un eje cambia de signo, chocó con algo
(pared, paleta u obstáculo). Salvaguardas:

- `REBOTE_V_MIN = 1.5` px/tick — por debajo es ruido de interpolación.
- `REBOTE_COOLDOWN_MS = 60` — dos detecciones más juntas son el mismo golpe.
- Se ignoran saltos mayores a `SNAP_DIST` (el saque teletransporta el disco).
- Solo con la partida en PLAYING y el disco ya soltado.

Los dos números están puestos a ojo. **Hay que jugar una partida y ajustarlos**:
si suena de más, subir `REBOTE_V_MIN`; si se pierde golpes suaves, bajarlo.
No distingue golpe de paleta de rebote en pared — para eso habría que mirar
la posición del disco respecto a las paletas, o que el servidor mande el evento.

## Pendientes

- **Música de fondo** — `musica-principal.mp3` (38.8s, sin cola muda, buen
  candidato a loop) está sin cablear. El canal `music` de Ajustes existe pero
  `soundService` aún no lo maneja: haría falta instancia única, `loop = true`
  y que `SettingsContext` empuje también ese volumen.
- **`inicio-partida.mp3` dura 7.4s de sonido real** — largo para un arranque.
  Escuchar si molesta.
- **`victoria.mp3` dura 21.7s** — el overlay final aguanta, pero es una pieza
  larga. Decidir si se recorta.
- **`menu.mp3` sin asignar** — es el único que quedó sin destino.

## Huecos sin archivo (pedir/crear)

- **Rival desconectado / reconectado** — acompaña el overlay de pausa.
- **Emotes** — pop corto al aparecer la burbuja (👍😂😮😭😡GG).
- **Solicitud de amistad** recibida/aceptada.
- **Error / acción inválida** — código de sala inválido, cola llena.
- **Voz conectada/cortada** — bloop de entrada/salida del chat de voz.
- **Destello del fantasma** — el disco invisible se revela 250ms al rebotar.
- **Copiar código de sala** — clic de confirmación.

## Notas técnicas

- MP3 y cortos; normalizados entre sí para que ningún efecto reviente los
  oídos respecto a los demás.
- Efectos por el canal `sfx`, música por `music`: volúmenes independientes.
- Los nombres van en kebab-case sin espacios ni caracteres raros: se importan
  como módulos desde `soundService.js`.
- Copia de los archivos tal como llegaron (antes del recorte) en el
  scratchpad de la sesión, por si hay que rehacer algún procesado.
