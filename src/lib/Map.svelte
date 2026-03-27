<script>
  import { onMount, onDestroy } from 'svelte'
  import maplibregl from 'maplibre-gl'
  import 'maplibre-gl/dist/maplibre-gl.css'
  import { MAPTILER_KEY } from '../config.js'

  // Use MapTiler outdoor when a key is available; fall back to OpenFreeMap (no key/quota)
  const MAP_STYLE = MAPTILER_KEY
    ? `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`
    : 'https://tiles.openfreemap.org/styles/liberty'
  import { routeState } from '../stores/route.svelte.js'
  import { tracksStore } from '../stores/tracks.svelte.js'
  import { toolStore, TOOLS } from '../stores/tool.svelte.js'

  let container
  let map
  let mapLoaded    = $state(false)
  let locating     = $state(false)
  let locateError  = $state('')

  function locate() {
    if (!navigator.geolocation) { locateError = 'Geolocation not supported'; return }
    locating    = true
    locateError = ''
    navigator.geolocation.getCurrentPosition(
      pos => {
        map.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 18,
          speed: 2,
        })
        locating = false
      },
      err => {
        locateError = err.code === 1 ? 'Location access denied' : 'Location unavailable'
        locating    = false
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  // --- Marker management -----------------------------------------------

  let markerInstances = []

  function createMarkerEl(isFirst, isLast) {
    const el = document.createElement('div')
    el.className = 'wp-marker' + (isFirst ? ' wp-first' : isLast ? ' wp-last' : '')
    return el
  }

  function rebuildMarkers(waypoints) {
    markerInstances.forEach(m => m.remove())
    const tool = toolStore.active
    markerInstances = waypoints.map((wp, i) => {
      const isFirst = i === 0
      const isLast  = i === waypoints.length - 1
      const el      = createMarkerEl(isFirst, isLast)

      if (tool === TOOLS.ERASER) el.style.cursor = 'crosshair'

      const marker = new maplibregl.Marker({
        element: el,
        draggable: tool !== TOOLS.ERASER,
        anchor: 'center',
      }).setLngLat(wp).addTo(map)

      if (tool !== TOOLS.ERASER) {
        marker.on('dragend', () => routeState.moveWaypoint(i, marker.getLngLat()))
      }

      el.addEventListener('click', e => {
        if (toolStore.active === TOOLS.ERASER) {
          e.stopPropagation()
          routeState.removeWaypoint(i)
        }
      })

      el.addEventListener('contextmenu', e => {
        e.preventDefault()
        routeState.removeWaypoint(i)
      })

      return marker
    })
  }

  // Sync markers whenever waypoints or active tool change
  $effect(() => {
    const wps  = routeState.waypoints.slice()
    void toolStore.active  // track as dependency
    if (!mapLoaded) return
    rebuildMarkers(wps)
  })

  // --- Route layer -----------------------------------------------------

  function updateRouteLayer() {
    if (!mapLoaded) return
    const src = map.getSource('route')
    if (!src) return
    src.setData({
      type: 'FeatureCollection',
      features: routeState.segments.filter(Boolean),
    })
  }

  $effect(() => {
    void routeState.segments.slice()
    updateRouteLayer()
  })

  // Sync saved (non-active) tracks as background reference lines
  $effect(() => {
    if (!mapLoaded) return
    const src = map.getSource('saved-tracks')
    if (!src) return
    const activeId = tracksStore.activeId
    const features = tracksStore.tracks
      .filter(t => t.id !== activeId)
      .flatMap(t => (t.segments ?? [])
        .filter(Boolean)
        .map(seg => ({ ...seg, properties: { ...seg.properties, trackColor: t.color } }))
      )
    src.setData({ type: 'FeatureCollection', features })
  })

  // --- Geometry helpers ------------------------------------------------

  function distToSegment(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1]
    if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
    const t = Math.max(0, Math.min(1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
  }

  function findInsertIndex(lngLat) {
    const pt = [lngLat.lng, lngLat.lat]
    let minDist = Infinity
    let minIdx  = routeState.waypoints.length // default: append

    routeState.segments.forEach((seg, i) => {
      const coords = seg?.geometry?.coordinates
      if (!coords) return
      for (let j = 0; j < coords.length - 1; j++) {
        const d = distToSegment(pt, coords[j], coords[j + 1])
        if (d < minDist) { minDist = d; minIdx = i + 1 }
      }
    })
    return minIdx
  }

  // --- Cursor management -----------------------------------------------

  $effect(() => {
    if (!mapLoaded) return
    const cursor = { [TOOLS.SELECT]: '', [TOOLS.ERASER]: 'cell', [TOOLS.PLACE]: 'crosshair' }
    map.getCanvas().style.cursor = cursor[toolStore.active] ?? ''
    clearRubberBand()
  })

  // --- Lasso helpers ---------------------------------------------------

  function pixelRectToPolygon(p1, p2) {
    const corners = [
      [p1.x, p1.y], [p2.x, p1.y], [p2.x, p2.y], [p1.x, p2.y], [p1.x, p1.y],
    ].map(([x, y]) => { const c = map.unproject([x, y]); return [c.lng, c.lat] })
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [corners] } }
  }

  function inPixelRect(lngLat, p1, p2) {
    const { x, y } = map.project(lngLat)
    return x >= Math.min(p1.x, p2.x) && x <= Math.max(p1.x, p2.x)
        && y >= Math.min(p1.y, p2.y) && y <= Math.max(p1.y, p2.y)
  }

  // --- Rubber band (cursor → last waypoint preview line) ---------------

  function setRubberBand(lngLat) {
    const wps = routeState.waypoints
    if (!wps.length || toolStore.active !== TOOLS.PLACE) { clearRubberBand(); return }
    const last = wps[wps.length - 1]
    map.getSource('rubber-band').setData({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [[last.lng, last.lat], [lngLat.lng, lngLat.lat]],
      },
    })
  }

  function clearRubberBand() {
    map.getSource('rubber-band')?.setData({ type: 'FeatureCollection', features: [] })
  }

  // --- Drag-on-line ----------------------------------------------------

  let isLineDragging = false

  function setupLineDrag() {
    map.on('mousedown', 'route-hit', e => {
      if (toolStore.active !== TOOLS.PLACE) return
      e.preventDefault()
      isLineDragging = true
      const insertIdx = findInsertIndex(e.lngLat)
      map.dragPan.disable()
      clearRubberBand()

      // Ghost marker follows the cursor during drag
      const ghost = new maplibregl.Marker({
        element: createMarkerEl(false, false),
        anchor: 'center',
      }).setLngLat(e.lngLat).addTo(map)
      ghost.getElement().style.opacity = '0.6'
      ghost.getElement().style.pointerEvents = 'none'

      let lastLngLat = e.lngLat

      const onMove = ev => {
        lastLngLat = ev.lngLat
        ghost.setLngLat(ev.lngLat)
      }

      const onUp = () => {
        map.off('mousemove', onMove)
        map.off('mouseup',   onUp)
        map.getCanvas().style.cursor = ''
        map.dragPan.enable()
        ghost.remove()
        isLineDragging = false
        routeState.addWaypoint(lastLngLat, insertIdx)
      }

      map.getCanvas().style.cursor = 'grabbing'
      map.on('mousemove', onMove)
      map.on('mouseup',   onUp)
    })

    map.on('mouseenter', 'route-hit', () => {
      if (map.dragPan.isEnabled()) map.getCanvas().style.cursor = 'crosshair'
    })
    map.on('mouseleave', 'route-hit', () => {
      map.getCanvas().style.cursor = ''
    })
  }

  // --- Map init --------------------------------------------------------

  onMount(() => {
    map = new maplibregl.Map({
      container,
      style: MAP_STYLE,
      center: [10, 50],
      zoom: 5,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-right')

    map.on('error', e => console.error('MapLibre error:', e.error))

    map.on('load', () => {
      // Background layer for saved (non-active) tracks
      map.addSource('saved-tracks', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'saved-tracks-line',
        type: 'line',
        source: 'saved-tracks',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['coalesce', ['get', 'trackColor'], '#888'],
          'line-width': 2.5,
          'line-opacity': 0.55,
        },
      })

      map.addSource('route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // White casing for contrast over any basemap
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.7 },
      })

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#2563eb', 'line-width': 4 },
      })

      // Wide invisible layer for pointer events (drag + cursor)
      map.addLayer({
        id: 'route-hit',
        type: 'line',
        source: 'route',
        paint: { 'line-color': 'transparent', 'line-width': 20 },
      })

      // Rubber-band preview line
      map.addSource('rubber-band', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'rubber-band',
        type: 'line',
        source: 'rubber-band',
        paint: {
          'line-color': '#2563eb',
          'line-width': 2,
          'line-dasharray': [4, 3],
          'line-opacity': 0.6,
        },
      })

      map.on('mousemove', e => {
        if (!isLineDragging) setRubberBand(e.lngLat)
      })
      map.getCanvas().addEventListener('mouseleave', clearRubberBand)

      // Click on blank map → append waypoint (place tool only)
      map.on('click', e => {
        if (e.defaultPrevented) return
        if (toolStore.active === TOOLS.PLACE) routeState.addWaypoint(e.lngLat)
      })

      // Eraser lasso: shift+drag to select and delete multiple waypoints
      map.addSource('lasso', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'lasso-fill',
        type: 'fill',
        source: 'lasso',
        paint: { 'fill-color': '#f38ba8', 'fill-opacity': 0.15 },
      })
      map.addLayer({
        id: 'lasso-line',
        type: 'line',
        source: 'lasso',
        paint: { 'line-color': '#f38ba8', 'line-width': 1.5, 'line-dasharray': [3, 2] },
      })

      map.on('mousedown', e => {
        if (toolStore.active !== TOOLS.ERASER || !e.originalEvent.shiftKey) return
        e.preventDefault()
        map.dragPan.disable()

        const start = e.point

        const onMove = ev => {
          map.getSource('lasso').setData(pixelRectToPolygon(start, ev.point))
        }

        const onUp = ev => {
          map.off('mousemove', onMove)
          map.off('mouseup',   onUp)
          map.dragPan.enable()
          map.getSource('lasso').setData({ type: 'FeatureCollection', features: [] })

          // Collect indices of waypoints inside lasso (delete high→low to preserve indices)
          const toDelete = routeState.waypoints
            .map((wp, i) => ({ wp, i }))
            .filter(({ wp }) => inPixelRect({ lng: wp.lng, lat: wp.lat }, start, ev.point))
            .map(({ i }) => i)
            .sort((a, b) => b - a)

          toDelete.forEach(i => routeState.removeWaypoint(i))
        }

        map.on('mousemove', onMove)
        map.on('mouseup',   onUp)
      })

      setupLineDrag()
      map.resize()
      mapLoaded = true
    })
  })

  onDestroy(() => {
    markerInstances.forEach(m => m.remove())
    map?.remove()
  })
</script>

<div class="map-wrap">
  <div bind:this={container} class="map"></div>

  <button
    class="locate-btn"
    class:loading={locating}
    onclick={locate}
    title={locateError || 'Go to my location'}
    aria-label="Go to my location"
  >
    {#if locating}
      <span class="spinner"></span>
    {:else}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
        <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" stroke="none" fill="currentColor" opacity="0.15"/>
      </svg>
    {/if}
  </button>

  {#if locateError}
    <div class="locate-error">{locateError}</div>
  {/if}
</div>

<style>
  .map-wrap {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  .map {
    position: absolute;
    inset: 0;
  }

  :global(.wp-marker) {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #2563eb;
    border: 2.5px solid #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    cursor: grab;
    transition: transform 0.1s;
  }

  :global(.wp-marker:active) {
    cursor: grabbing;
    transform: scale(1.3);
  }

  :global(.wp-marker.wp-first) {
    background: #16a34a;
  }

  :global(.wp-marker.wp-last) {
    background: #dc2626;
  }

  .locate-btn {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 10;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 6px;
    background: rgba(24, 24, 37, 0.92);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    color: #cdd6f4;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s, color 0.12s;
  }

  .locate-btn:hover {
    background: rgba(49, 50, 68, 0.95);
    color: #89b4fa;
  }

  .locate-btn :global(svg) {
    width: 18px;
    height: 18px;
  }

  .locate-btn .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid #45475a;
    border-top-color: #89b4fa;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .locate-error {
    position: absolute;
    top: 54px;
    left: 10px;
    background: rgba(24, 24, 37, 0.92);
    color: #f38ba8;
    font-size: 0.75rem;
    padding: 5px 9px;
    border-radius: 5px;
    border: 1px solid rgba(243, 139, 168, 0.3);
    pointer-events: none;
    white-space: nowrap;
  }
</style>
