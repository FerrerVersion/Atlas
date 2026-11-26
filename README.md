# Atlas · Navegación

Aplicación web de navegación con **ubicaciones y nombres reales de OpenStreetMap**, motor de rutas **A\*** propio, navegación paso a paso, paradas múltiples y **15 estilos visuales de mapa** (de clásico a cyberpunk, blueprint, arcade o fantasía).

La originalidad está en la interfaz, los estilos y las funcionalidades. **Ningún nombre geográfico se inventa**: ciudades, calles y establecimientos proceden siempre de OpenStreetMap. Solo en el editor de *mapas personalizados* el usuario puede nombrar libremente sus propios lugares.

---

## Características

- **Búsqueda** de ciudades, municipios, barrios, calles, POIs y coordenadas, con autocompletado, normalización de acentos y sin distinguir mayúsculas. Resultados con nombre real, tipo, dirección, icono y distancia aproximada.
- **Búsqueda por categoría** («gasolineras», «restaurantes cerca»…) y filtros de **POIs reales** (12 categorías) vía Overpass.
- **Mapa interactivo** (Leaflet): zoom con botones, rueda y pellizco, arrastre, centrado en el lugar seleccionado y en tu ubicación (si das permiso), ajuste automático a la ruta, menú contextual («Ruta desde aquí / hasta aquí / Añadir parada / ¿Qué hay aquí?»).
- **Motor de rutas A\*** sobre la red viaria real: sentidos únicos, rotondas, límites de velocidad, modo coche/a pie, ruta más rápida o más corta, evitar autopistas, detección de destinos inaccesibles.
- **Paradas múltiples**: añadir, eliminar, reordenar (botones o arrastrar), invertir; cálculo por tramos y unión sin nodos duplicados; marcadores arrastrables.
- **Navegación paso a paso** generada a partir de la geometría: giros (suaves, normales, bruscos), cambios de sentido, rotondas («toma la 2.ª salida»), incorporación y salida de autopista, llegada a paradas y destino. Modo navegación con próxima maniobra, distancia al giro, distancia y tiempo restantes, simulación del recorrido, seguimiento GPS y voz (síntesis local del navegador).
- **15 estilos de mapa** con selector, vista previa y persistencia. Cambiar de estilo no toca la búsqueda, la ruta, las paradas, las coordenadas, los nombres ni el grafo.
- **Modo noche** de la interfaz (claro / noche / automático) y mapa nocturno automático opcional.
- **Favoritos, historial y preferencias** persistidos en LocalStorage; datos geográficos cacheados en IndexedDB.
- **Mapas personalizados**: carga local de PNG/JPG/WebP, calibración por puntos de referencia, nodos, vías, rutas A* y exportación/importación JSON.
- **Demo offline**: extracto real de OSM (Buñol) incluido en el repositorio.
- Diseño responsive: panel lateral en escritorio, buscador superior y panel inferior deslizable en móvil.

## Capturas

Las capturas se pueden regenerar con `node e2e/visual-themes.mjs <carpeta>` (requiere `npx vite preview --port 4173` en marcha): genera una imagen por estilo con teselas reales y una ruta de ejemplo en Buñol.

## Stack

React 19 · TypeScript (estricto) · Vite · Tailwind CSS v4 · React Router · Zustand · Lucide React · Leaflet + React-Leaflet · idb-keyval · Vitest + Testing Library · Playwright · oxlint.

## Requisitos

- Node.js ≥ 20 (probado con Node 24) y npm.
- Conexión a Internet para teselas, búsqueda y descarga de calles (la demo offline funciona sin ella, salvo las teselas).

## Instalación y ejecución

```bash
npm install
npm run dev          # http://localhost:5173
```

### Ubicación del dispositivo (GPS)

- **Al abrir la web** se pide permiso de ubicación; si lo concedes, el mapa se centra donde estás y el punto azul se mantiene actualizado mientras la página esté abierta (un único seguimiento compartido por toda la app). Si lo deniegas, no se insiste. Se puede desactivar en *Ajustes → Ubicación*.
- **Mi ubicación** (botón de diana en los controles del mapa, resaltado cuando el seguimiento está activo): vuelve a centrar el mapa en tu posición.
- **Usar mi ubicación como origen** (icono junto al campo *Origen* en la pestaña Ruta).
- **Seguir mi ubicación GPS** en el modo navegación: la posición se proyecta sobre la ruta para avanzar las indicaciones.

La ubicación nunca se envía a ningún servidor. Los navegadores solo la permiten en **HTTPS o `localhost`**: en el ordenador basta `npm run dev`; para probarla **desde el móvil** en la misma red wifi:

```bash
npm run dev:movil    # https://<IP-del-ordenador>:5173 (certificado autofirmado)
```

Abre la URL «Network» en el móvil, acepta el aviso del certificado y concede el permiso de ubicación.

## Build

```bash
npm run build        # tsc -b + vite build → dist/
npm run preview
```

## Tests

```bash
npm test             # Vitest: 72 tests unitarios y de integración
npx playwright install chromium   # solo la primera vez
npm run test:e2e     # Playwright: escritorio y móvil, sin red (datos OSM reales simulados)
npm run lint         # oxlint
```

> En macOS, si la pantalla entra en reposo Chromium deja de emitir `requestAnimationFrame` y los e2e se ralentizan o fallan. Ejecútalos con `caffeinate -dis npm run test:e2e`.

Cobertura de los tests: A* (ruta directa, varios tramos, óptima frente a alternativa, sentido único, inalcanzable, nodo inexistente, grafo vacío, varios caminos, geometría, distancia, tiempo, reconstrucción, ausencia de ciclos), construcción del grafo desde OSM, instrucciones (giros, rotondas, autopistas), multi-parada, progreso de navegación, planificación de descargas, búsqueda y normalización, adaptadores Photon/Nominatim, temas, store (cambiar tema no borra ruta), persistencia, calibración de imágenes, limitador de peticiones y componentes de UI.

## Arquitectura

```
src/
├── app/            App, router, providers (modo claro/noche)
├── components/     Interfaz (sin lógica de negocio)
│   ├── layout/     AppShell, Sidebar, MobileNavigation, pestañas
│   ├── map/        MapView, capas temáticas, RoadLayer, StreetLabels, RouteLayer, marcadores, controles
│   ├── search/     SearchBar, PlaceAutocomplete, SearchResults
│   ├── navigation/ RoutePanel, WaypointList, RouteSummary, NavigationInstructions, NavigationHUD
│   ├── explore/    Ficha del lugar y POIs
│   ├── themes/     Galería y vistas previas
│   ├── customMap/  Editor de mapas personalizados
│   └── ui/         Botones, controles, toasts
├── features/       Lógica independiente de la UI
│   ├── routing/    graph.ts, astar.ts, routeInstructions.ts, routeService.ts, routeTypes.ts
│   ├── geocoding/  Proveedores Photon / Nominatim (intercambiables)
│   ├── search/     Búsqueda combinada, local y por categorías
│   ├── osm/        Overpass, almacén de red viaria, datos demo
│   ├── poi/        Categorías y parseo de POIs
│   ├── navigation/ Progreso de navegación
│   ├── map/        Proveedores de teselas, utilidades de marcadores
│   ├── themes/     Tipos, registro y un archivo por tema
│   └── customMap/  Calibración afín, persistencia y exportación
├── data/           Extracto OSM real (Buñol) para modo offline y tests
├── hooks/          Cálculo de rutas, carga de POIs/calles, GPS, navegación, búsqueda
├── store/          Estado global (Zustand + persistencia parcial)
├── styles/         globals.css (Tailwind) y map.css (efectos, marcadores)
├── utils/          Distancias, geometría, HTTP limitado, almacenamiento
└── tests/          Vitest
e2e/                Playwright
scripts/            Descarga de extractos OSM
```

Separación clave: **UI** (`components/`), **datos geográficos** (`features/osm`, `data/`), **motor de rutas** (`features/routing`, puro y testeado), **servicios externos** (`geocoding`, `overpassService`), **estilos** (`features/themes`) y **datos personalizados** (`features/customMap`).

## Algoritmo A*

1. **Grafo** (`graph.ts`): las vías OSM (`highway=*`) se dividen en las intersecciones (nodos compartidos por varias vías) y, en vías largas, cada ~250 m para mejorar el ajuste. Cada arista conserva la geometría completa, el nombre/ref real, el tipo de vía y la velocidad (`maxspeed` o valor por defecto por tipo). Las vías de doble sentido generan dos aristas dirigidas; `oneway=yes/-1`, rotondas y autopistas solo una.
2. **Ajuste a la red**: cada parada se ajusta al nodo más cercano de la componente conexa principal (máx. 1,5 km).
3. **Búsqueda** (`astar.ts`): montículo binario, coste = tiempo (`distancia / velocidad`) o distancia; heurística = distancia haversine al destino (dividida por la velocidad máxima del grafo en modo «más rápida»), que nunca sobreestima → ruta óptima. Conjunto cerrado y descarte de entradas obsoletas → sin bucles infinitos. Devuelve `RouteResult` con nodos, aristas, distancia, tiempo y geometría, o un error tipado (`empty-graph`, `node-not-found`, `unreachable`, `limit-exceeded`).
4. **Instrucciones** (`routeInstructions.ts`): ángulo entre el rumbo de llegada y el de salida (medidos a 20 m del nodo), número de alternativas en el cruce, cambios de nombre, rotondas y transiciones de autopista.
5. **Descarga de datos** (`routeService.ts`): trayectos cortos → todas las calles del área. Trayectos largos → por trozos con caché propia: calles de coche a 1 km de cada parada, un **anillo de acceso** de 5 km (secundarias, terciarias y sin clasificar, que son las que unen cada núcleo con las autovías) y un corredor de vías principales. Si aun así las paradas no conectan, el corredor se amplía un nivel. Ejemplo real: Buñol solo enlaza con la A-3 por la CV-425, a ~2,7 km del centro; sin el anillo, la ruta Valencia→Buñol daba un rodeo de 46 km por Chiva en lugar de los 40 km reales. Si la zona ya está cargada no se vuelve a pedir.

Si no hay datos de carreteras, **no se inventa una ruta**: se informa del motivo.

## Fuentes cartográficas

| Uso | Servicio | Notas |
|---|---|---|
| Autocompletado | [Photon](https://photon.komoot.io) (komoot, datos OSM) | Diseñado para búsqueda mientras se escribe. Antirrebote 350 ms, mín. 3 letras, caché. |
| Búsqueda completa y geocodificación inversa | [Nominatim](https://nominatim.org) (OSMF) | [Política](https://operations.osmfoundation.org/policies/nominatim/): **máx. 1 petición/s**, sin autocompletado → solo al pulsar Enter o elegir un punto del mapa. |
| Red viaria y POIs | [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) | Peticiones espaciadas ≥ 1,2 s, caché IndexedDB de 7 días, zonas acotadas. Si un espejo no responde en 12 s se prueba el siguiente en paralelo (gana el primero y se cancela el resto); los errores 429/5xx se reintentan una vez. |
| Teselas | OpenStreetMap estándar, Esri (World Imagery, Light/Dark Gray Canvas), OpenTopoMap | Ninguna requiere clave API. Los basemaps de CARTO pasaron a exigir clave y no se usan. |

### Configurar fuentes alternativas

Crea un `.env.local`:

```bash
VITE_PHOTON_URL=https://mi-photon.example.org
VITE_NOMINATIM_URL=https://mi-nominatim.example.org
VITE_OVERPASS_URLS=https://mi-overpass.example.org/api/interpreter,https://overpass.private.coffee/api/interpreter
```

Para teselas, añade un proveedor en `src/features/map/tileProviders.ts` y referéncialo desde un tema. Para otro geocodificador, implementa la interfaz `GeocodingProvider` (`geocodingService.ts`) y asígnalo en `geocoding`.

### Trabajar con datos locales

```bash
npm run data:demo                                   # Buñol (por defecto)
node scripts/fetch-osm-extract.mjs "Nombre" s,w,n,e # otra zona (bbox pequeño)
```

Genera `src/data/demoRoads.json`, `demoPOIs.json` y `demoCity.json` con datos reales. En la app: *Ajustes → Cargar demo offline*.

## Licencias y atribuciones

- Datos: **© OpenStreetMap contributors**, [ODbL 1.0](https://www.openstreetmap.org/copyright). El extracto de `src/data/` está bajo ODbL.
- Teselas OSM: [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) (uso ligero, atribución obligatoria).
- Esri World Imagery / Canvas: © Esri y proveedores (Maxar, Earthstar Geographics, HERE, Garmin…), según los términos de Esri.
- OpenTopoMap: CC-BY-SA, © OpenTopoMap, SRTM.
- Photon: © komoot (datos OSM). Nominatim: © OSMF.
- Fuentes tipográficas (Inter, Orbitron, Press Start 2P, JetBrains Mono, Cinzel, Caveat): SIL Open Font License, servidas localmente con @fontsource (sin peticiones a Google Fonts).

La atribución se muestra siempre en el mapa y en *Ajustes → Fuentes y licencias*.

## Sistema de temas

Cada tema (`src/features/themes/themes/*.ts`) define: colores (fondo, agua, parques, edificios, calles, principales, autopistas, ruta, etiquetas, marcadores, acento), tipografía (familia, tamaño, peso, mayúsculas, espaciado), nivel de detalle, capa base y de etiquetas (proveedor, filtro CSS, opacidad, zoom máximo, pixelado), capa vectorial propia por clase de vía (color, grosor, discontinuidad, carcasa), nodos visibles, etiquetas de calle propias, estilo de ruta (color, carcasa, animación, resplandor), forma de marcador, estilo de POI y efectos (resplandor, sombras, animaciones, scanlines, rejilla, viñeta, papel, ciclo de color).

| Estilo | Base | Rasgos |
|---|---|---|
| Clásico | OSM | Familiar y legible |
| Satélite | Esri World Imagery | Calles OSM superpuestas, etiquetas opcionales |
| Oscuro Premium | Esri Dark Gray | Autopistas ámbar, ruta cian con resplandor |
| Minimalista | Esri Light Gray | Gris, sin decoración |
| Cyberpunk | Dark Gray recoloreado | Neón magenta/cian, ruta animada, Orbitron, scanlines |
| Mundo Abierto | OSM saturado | Carreteras gruesas con carcasa, viñeta, marcadores rombo |
| Blueprint | Dark Gray azulado | Trazos técnicos, rejilla, intersecciones, monoespaciada |
| Retro Arcade | Teselas pixeladas | Colores intensos, iconos y tipografía de 8 bits |
| Fantasía | OpenTopoMap sepia | Relieve real, caminos a tinta, papel, sellos de lacre |
| Caótico / Experimental | OSM con ciclo de color | Trazos discontinuos, marcadores que respiran |
| Vintage, Blanco y negro, Topográfico, Dibujo a mano, Holográfico | — | Estilos adicionales |

Los efectos se desactivan con `prefers-reduced-motion`.

### Cómo añadir un estilo

1. Crea `src/features/themes/themes/miTema.ts` con `defineTheme({...})` (usa otro tema como plantilla).
2. Añádelo al array `THEMES` de `themeRegistry.ts`.
3. `npm test` valida automáticamente ids únicos, colores, proveedores y que sea distinto de los demás.

## Cómo añadir puntos de interés

Añade una entrada a `POI_CATEGORIES` en `src/features/poi/poiTypes.ts` con: id, etiquetas, icono (regístralo en `src/features/map/icons.ts`), color, selectores Overpass, palabras clave de búsqueda, radio y función `matches(tags)`. Los POIs siempre se descargan de OSM; los que no tienen nombre se muestran como «(sin nombre en OSM)».

## Cómo cambiar de ubicación

Busca cualquier lugar (p. ej. «Valencia», «Buñol», «Madrid», «Barcelona») o arrastra el mapa. Al acercarte (zoom ≥ 15) se descargan automáticamente las calles reales de la zona (desactivable en Ajustes) o con el botón de descarga. Las rutas descargan lo necesario por sí solas.

## Mapas personalizados

Ruta `/custom` (Ajustes → *Abrir editor de mapas*):

1. Carga una imagen PNG/JPG/WebP (se lee con `FileReader`, **nunca sale del navegador**).
2. **Calibrar**: pulsa puntos reconocibles y escribe sus coordenadas. Con 2 puntos se calcula una semejanza (escala + rotación + traslación); con 3 o más, una transformación afín por mínimos cuadrados con su error medio. Sin referencias puedes fijar escala (m/píxel) y rotación manuales.
3. **Nodos**: clic para crear intersecciones y nómbralas libremente.
4. **Vías**: pulsa dos nodos para conectarlos (nombre, tipo, velocidad, sentido único).
5. **Ruta**: elige origen y destino → A* con instrucciones.
6. **Exportar** a JSON (opcionalmente con la imagen) e importarlo después. Se autoguarda en IndexedDB.

Limitaciones: proyección plana local (precisa para zonas de pocos km); las vías son tramos rectos entre nodos; la imagen calibrada no se superpone aún sobre el mapa real.

## Limitaciones

- Depende de servicios públicos gratuitos (Overpass, Photon, Nominatim, teselas) con límites de uso; Overpass puede estar saturado (se prueban espejos y se informa al usuario). Para uso intensivo, despliega tus propias instancias.
- Rutas en vivo hasta ~300 km en coche (~25 km a pie); en trayectos largos solo se descargan vías principales en el corredor.
- No hay tráfico en tiempo real, restricciones de giro (`turn restrictions`) ni carriles.
- El ajuste de paradas es al nodo más cercano (puede haber un pequeño tramo de acceso, mostrado con línea punteada).
- Las capas Esri Canvas tienen detalle nativo hasta zoom 16; por encima, las calles se dibujan en vectorial a partir de OSM.
- Los colores de agua/parques/edificios de cada tema se aplican mediante filtros sobre teselas ráster (no hay teselas vectoriales).
- Rotación del mapa no implementada (Leaflet no la soporta de forma nativa).
- El bundle principal (~820 kB) podría dividirse más.

## Próximas mejoras

- Restricciones de giro y perfiles de bicicleta.
- Teselas vectoriales (MapLibre) para recolorear agua/parques de forma exacta y rotar el mapa.
- Web Worker para construir el grafo y ejecutar A* en zonas grandes.
- Superponer mapas personalizados calibrados sobre el mapa real.
- Importación de archivos `.osm`/`.pbf` y GeoJSON arbitrarios.
- PWA con caché offline de teselas.
