# CLAUDE.md

Este archivo proporciona orientación a Claude Code (claude.ai/code) al trabajar con el código de este repositorio.

## Proyecto

Tetris en JavaScript vanilla sobre HTML5 Canvas. Sin dependencias, sin `package.json`, sin proceso de build, sin tests y sin linter.

## Ejecución

```bash
open index.html                 # abrir directamente
python3 -m http.server 8000     # o servir estáticamente y visitar http://localhost:8000
```

No hay tests automatizados; los cambios se verifican jugando en el navegador.

## Arquitectura

Toda la lógica del juego está en `game.js`, un único script que no es un módulo (`'use strict'`, variables globales, cargado al final de `index.html`). `index.html` aporta el DOM que el script obtiene por id al cargar (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`); renombrar cualquiera de estos ids rompe el script.

Convenciones clave que abarcan varias partes del código:

- **Tipo de pieza = índice de color = valor de celda.** Las formas de `PIECES[n]` están rellenas con el valor `n`, y `COLORS[n]` es el color de esa pieza. `merge()` copia los valores de la forma directamente en `board`, así que el tablero guarda índices de color (0 = vacío). Añadir o reordenar piezas exige mantener sincronizados `PIECES`, `COLORS` y el `* 7` de `randomPiece()`.
- **Rotación**: es una transformación pura de matriz (`rotateCW`) aplicada a la forma; `tryRotate` prueba los desplazamientos horizontales (_wall kicks_) `[0, -1, 1, -2, 2]`. No es SRS.
- **Colisión** (`collide`): permite celdas por encima del tablero (`ny < 0`) y trata como choque cualquier otra salida de límites o celda ocupada. Se reutiliza para el movimiento, la rotación, la proyección de la pieza fantasma (`ghostY`) y la detección de game over en `spawn()`.
- **Bucle de juego** (`loop`): funciona con `requestAnimationFrame` y un acumulador `dropAccum`/`dropInterval`. La pausa y el game over lo detienen con `cancelAnimationFrame(animId)`; `init()` reinicia todo el estado y también es el manejador del botón de reinicio.
- **Fijación de piezas**: siempre sigue `lockPiece()` → `merge()` → `clearLines()` (puntuación, nivel, velocidad) → `spawn()`.
- **Puntuación y velocidad**: `LINE_SCORES[cleared] * level`, +1 por fila de soft drop, +2 por fila de hard drop; nivel = `floor(lines / 10) + 1`; `dropInterval = max(100, 1000 - (level - 1) * 90)`.

Dimensiones acopladas: el tamaño del canvas `#board` en `index.html` debe ser igual a `COLS × BLOCK` por `ROWS × BLOCK` (300×600), y `drawNext()` asume una cuadrícula de 4×4 celdas de 30px que coincide con el `#next-canvas` de 120×120.

El texto de la interfaz y el README están en español; los textos visibles para el usuario deben mantenerse en español.
