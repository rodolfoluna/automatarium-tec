# Automatarium Tec

Adaptación de [Automatarium](https://github.com/automatarium/automatarium) (licencia MIT) para usarlo en clase:

- **PWA instalable** en celular y computadora, funciona sin internet.
- **Registro del alumno** la primera vez que se abre: número de control y nombre.
- **Entregas con pestañas**: varios autómatas (AF, AP, MT) en un solo archivo `.atec`.
- **Archivos ligados al alumno**: solo se abren en una app registrada con el mismo número de control (en cualquier dispositivo) y en la herramienta del profesor.
- **Detección de trampa**: el profesor sabe si un archivo se modificó fuera de la app, si se importó contenido de fuera o si el trabajo "apareció" de golpe.
- **Herramienta del profesor** para revisar muchas entregas a la vez y exportar un reporte CSV.

Toda la interfaz está en español (el inglés sigue disponible en Preferencias).

**App para alumnos:** https://rodolfoluna.github.io/automatarium-tec/

## Créditos y licencia

Automatarium Tec es una obra derivada de **[Automatarium](https://github.com/automatarium/automatarium)**,
© 2022 Automatarium. Sus autores originales son Maxwell Reid, Thomas Dib, Ewan Breakey, Benji Grant, Timothy Tran
y los demás [colaboradores](https://github.com/automatarium/automatarium/graphs/contributors), y el proyecto nació en la Universidad RMIT.
Gracias a ellos por publicarlo como software libre.

- Se distribuye bajo la misma **licencia MIT**. El aviso de copyright original se conserva en [`LICENSE`](LICENSE),
  y se agregó la línea de copyright de las modificaciones.
- La app publicada incluye el texto de la licencia (`LICENSE.txt`, enlazado desde el pie de página). También muestra en
  *Acerca de* y en el pie de página el crédito y el enlace al proyecto original.
- Este proyecto **no está afiliado ni respaldado** por el equipo original de Automatarium ni por la Universidad RMIT.
- Principales cambios respecto al original: registro del alumno, almacenamiento cifrado, entregas `.atec` con pestañas,
  bitácora de integridad, herramienta del profesor, traducción al español y ajustes de PWA. Consulta el historial de git.

---

## Guía rápida para el profesor

### 1. Generar las llaves del grupo (una vez por semestre)

```bash
corepack yarn install
corepack yarn keygen
```

El comando pide una contraseña y genera dos archivos en `frontend/`. Con `--out <carpeta>` los genera en otra carpeta; es lo recomendable, fuera del repositorio:

| Archivo | Qué es | Qué hacer con él |
|---|---|---|
| `teacher-key.json` | Tu llave **privada**, cifrada con tu contraseña | Guárdala en un lugar seguro (USB, gestor de contraseñas). **Nunca la compartas ni la subas al repositorio.** Sin ella no podrás abrir las entregas. |
| `.env.production.local` | Secreto de la app y tu llave pública | Se usa al compilar. Si publicas con GitHub Actions, copia sus dos valores como secretos (ver abajo). |

> Si generas llaves nuevas, las entregas hechas con la versión anterior de la app solo se podrán abrir con la llave anterior. Conserva las llaves viejas.

### 2. Publicar la app para los alumnos

**Opción A: GitHub Pages (recomendada).**

1. Haz un fork de este repositorio.
2. En *Settings → Secrets and variables → Actions*, crea los secretos `ATEC_APP_SECRET` y `ATEC_TEACHER_PUBLIC_KEY` con los valores de `.env.production.local`.
3. De forma opcional, crea las *variables* `ATEC_INSTITUTION` (nombre que ve el alumno) y `ATEC_CONTROL_REGEX` (formato del número de control; por defecto `^[A-Z]?\d{8,9}$`).
4. Sube la rama `tec`. El workflow `Deploy Automatarium Tec` compila, corre las pruebas y publica en GitHub Pages. La compilación falla si faltan los secretos.

**Opción B: servidor propio.**

```bash
corepack yarn build        # genera frontend/dist con las llaves de .env.production.local
```

Sube el contenido de `frontend/dist/` a cualquier hosting estático con **HTTPS**. Sin HTTPS no funcionan ni la PWA ni el cifrado.

Si la app muestra la franja roja *"Compilación de prueba"*, se compiló sin llaves reales. No la uses con alumnos.

### 3. Revisar entregas

```bash
corepack yarn build:teacher   # genera dist-teacher/
```

Abre `dist-teacher/teacher.html` desde un servidor local (por ejemplo `npx serve dist-teacher`). También puedes publicarla en una URL privada, pero **no** junto a la app de los alumnos. Después:

1. Carga tu `teacher-key.json` y escribe tu contraseña. La llave no sale de esa pestaña del navegador.
2. Arrastra todos los `.atec` que recibiste (de Classroom, Teams, correo…).
3. Revisa la tabla. Cada entrega queda con uno de estos estados:

| Estado | Significa |
|---|---|
| ✅ **Íntegro** | El archivo no se tocó y la bitácora de edición es coherente. |
| ⚠️ **Sospechoso** | Hay contenido importado, trabajo que apareció de golpe o en muy poco tiempo, almacenamiento local alterado, un dispositivo compartido con otro alumno o un dibujo idéntico al de otro alumno. |
| ❌ **Alterado** | El archivo se modificó fuera de la app, la bitácora está rota o no coincide con el autómata entregado. |

4. Haz clic en una fila para ver cada pestaña dibujada, probar cadenas y descargarla como `.json` estándar de Automatarium.
5. Con **Exportar CSV** obtienes el reporte para tu lista.

Los hallazgos son **indicios**, no pruebas. Úsalos para platicar con el alumno. Por ejemplo, pegar una plantilla propia también genera el aviso "se agregaron N elementos en un solo paso".

---

## Guía rápida para el alumno

1. Abre la liga que te dio tu profesor. En Chrome/Edge usa **Instalar app**; en iPhone, *Compartir → Agregar a pantalla de inicio*.
2. La primera vez escribe tu **número de control** y tu **nombre completo**. Revísalos bien: después no se pueden cambiar sin borrar todo tu trabajo.
3. Crea una **Nueva entrega** y usa el botón **+** de las pestañas para agregar más autómatas. Doble clic en una pestaña para renombrarla.
4. Tu trabajo se guarda solo en el dispositivo, cifrado.
5. Para entregar o pasar tu trabajo a otro dispositivo, usa **Guardar entrega (.atec)** o **Compartir**. En el otro dispositivo, instala la app con el mismo número de control y usa **Abrir entrega (.atec)**.

---

## Cómo funciona la seguridad y cuáles son sus límites

- Cada entrega se cifra con AES-256-GCM usando una llave aleatoria. Esa llave se guarda envuelta dos veces:
  - con una llave derivada del **número de control**, para que el alumno la abra en cualquiera de sus dispositivos;
  - con la **llave pública del profesor** (ECDH P-256), para que el profesor abra cualquier entrega.
- El encabezado (número de control y nombre) está autenticado. Cambiar un solo byte hace que el archivo ya no se pueda abrir.
- Dentro de la entrega viaja una **bitácora** con cada cambio hecho en el editor, encadenada con SHA-256. La herramienta del profesor la reproduce desde cero y verifica que llegue exactamente al autómata entregado. También calcula el tiempo activo, las sesiones y los dispositivos.
- El almacenamiento local (IndexedDB) también va cifrado. Si alguien lo modifica, la app lo detecta y deja constancia en la siguiente entrega.
- Exportar a JSON, JFLAP o URL está deshabilitado. Importar se permite, pero queda marcado.

**Límite importante.** No hay servidor ni PIN, así que un alumno con conocimientos técnicos podría extraer el secreto de la app. Con él podría abrir el archivo de un compañero (si conoce su número de control) o armar una entrega a mano.

- Lo que **no** puede hacer es abrir entregas sin conocer el número de control. Tampoco puede evitar que el profesor las abra, porque la llave privada del profesor nunca está en la app.
- Una entrega armada a mano tendría que venir con una bitácora creíble y consistente, y lo más probable es que se marque como sospechosa (trabajo en un solo paso, tiempos irreales).

Para subir el nivel de seguridad, las mejoras naturales son agregar un **PIN del alumno** a la derivación de la llave o un **servidor** que selle las entregas con fecha.

---

## Desarrollo

```bash
corepack yarn install
corepack yarn dev            # app del alumno en http://localhost:1234 (usa llaves de desarrollo)
corepack yarn dev:teacher    # herramienta del profesor en http://localhost:1240
corepack yarn workspace @automatarium/secure-file test
```

Las llaves de desarrollo están en `frontend/src/tec/dev-keys.json`, y la llave privada de desarrollo en `dev-keys/teacher-key.dev.json` (contraseña `profesor-dev`). Se regeneran con `corepack yarn workspace frontend keygen --dev`.

| Ruta | Contenido |
|---|---|
| `packages/secure-file/` | Formato `.atec`, derivación de llaves, bitácora, análisis de entregas (con pruebas) |
| `frontend/src/tec/` | Configuración, almacenamiento cifrado, entregas/pestañas, bitácora, guardar/abrir `.atec` |
| `frontend/src/pages/Welcome/` | Registro del alumno |
| `frontend/src/pages/Editor/components/TabBar/` | Barra de pestañas |
| `frontend/src/teacher/` | Herramienta del profesor (`public/teacher.html`) |
| `frontend/scripts/teacher-keygen.ts` | Generación de llaves |
