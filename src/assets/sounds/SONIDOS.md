# Catálogo de sonidos

Estado del mapeo al 2026-07-18. Los archivos llegaron como `.mp3.mpeg`
(extensión doble que les pegó la descarga; son MP3 legítimos) y se
renombraron a `.mp3` con nombres sin espacios ni `+`.

Todo suena por el canal **sfx** de Ajustes (volumen y mute aplican en vivo);
el cableado vive en `src/services/soundService.js` y los eventos de partida
en `playStateSfx` de `Game.jsx`.

## Asignados (ya suenan en el juego)

| Archivo | Duración | Evento |
|---|---|---|
| `seleccionar.mp3` | 3s | Clic en botones principales: Jugar, Jugar contra el bot (lobby y espera), Crear sala, Unirse a sala |
| `poder.mp3` | 6s | Aparece un pickup de poder en el tablero |
| `poder-2.mp3` | 4s | Se recoge **Zona rápida** o **Zona lenta** (compartido por ahora) |
| `poder-3.mp3` | 3s | Se recoge **Caos** |
| `punto-anotado.mp3` | 11s | Gol (de cualquiera de los dos, incluido el de la victoria) |

## Sin asignar — revisar con el ingeniero de sonido

| Archivo | Duración | Nota |
|---|---|---|
| `menu.mp3` | 2s | (dudoso) ¿hover sobre botones? ¿clic genérico? |
| `menu-mas.mp3` | 2s | (dudoso) ¿entrar/avanzar en un menú? |
| `menu-retroceso.mp3` | 2s | (dudoso) ¿volver/cancelar? (candidatos: Cancelar de la espera, Cancelar sala, cerrar sesión) |
| `poder-1.mp3` | 2s | Sin destino recordado; candidato para los poderes hoy mudos |

## Huecos sin archivo (pedir/crear)

Lista de deseos para la reunión, por prioridad. Todo lo de partida ya es
detectable desde el estado que manda el servidor: conseguido el mp3, el
cableado es una línea en el mapeo.

### Prioridad alta — se nota que faltan

- **Golpe paleta-disco** — EL sonido de un air hockey; hoy la partida es
  muda entre eventos. Detectable por el cambio brusco de velocidad del
  disco. Ideal muy corto (<300ms): suena decenas de veces por partida.
- **Rebote en la pared** — hermano del anterior, más seco/suave para
  distinguirlos. Podría arrancarse compartiendo el mismo del golpe.
- **Victoria** y **derrota** — el overlay final es mudo. Dos piezas
  distintas (fanfarria vs lamento); cierre emocional de cada partida.
- **Música de fondo** — el canal `music` de Ajustes existe y funciona pero
  no tiene pista. Decidir: ¿una para toda la app o lobby y partida
  separadas? Debe aguantar loop sin costura (que el corte no se note).

### Prioridad media — completan lo que ya suena

- **Recoger Obstáculo, Fantasma y Escudo** — hoy mudos (solo Caos y zonas
  suenan). O un genérico (candidato: `poder-1.mp3`) o uno por poder, que es
  lo ideal: el jugador identifica el poder sin mirar el ícono.
- **"¡Rival encontrado!"** — en la sala de espera, cuando el matchmaking
  empareja (hoy solo cambia la pantalla). Tipo campanita de éxito.
- **Saque / "¡A jugar!"** — al soltarse el disco tras la pausa de gol y en
  el arranque (silbato/beep de inicio). El banner ya existe, sonaría con él.
- **Rival desconectado / reconectado** — acompaña el overlay de pausa con
  cuenta regresiva (uno de alerta y uno de alivio).

### Prioridad baja — detalles con ánimo de pulir

- **Emotes** — pop corto al aparecer la burbuja (👍😂😮😭😡GG).
- **Notificación de chat** — DM recibido con la pestaña /chat abierta, y
  quizá otro para solicitud de amistad recibida/aceptada.
- **Error / acción inválida** — código de sala inválido, cola llena, etc.
  (candidato natural: `menu-retroceso.mp3` si se confirma su intención).
- **Voz conectada/cortada** — el chat de voz estilo Discord pide sus
  bloop de entrada/salida.
- **Destello del fantasma** — el disco invisible se revela 250ms al
  rebotar; un "shimmer" sutil lo haría más legible (y más aterrador).
- **Copiar código de sala** — clic de confirmación al copiar.

### Notas técnicas para producir/elegir los archivos

- MP3 está bien (es lo que ya hay); cortos y normalizados entre sí para que
  ningún efecto reviente los oídos respecto a los demás.
- Los efectos salen por el canal `sfx` y la música por `music`: volúmenes
  independientes en Ajustes, ya funcionales.
- `punto-anotado.mp3` dura 11s y la pausa de gol ~2s: el sonido sigue
  sonando ya reanudado el juego. Si molesta, pedir una versión corta (~3s).
