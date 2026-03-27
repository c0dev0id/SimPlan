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
  import { poisStore, POI_SYMBOLS } from '../stores/pois.svelte.js'

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

  // --- Waypoints GL layer ----------------------------------------------

  const ROUTE_COLOR = '#2563eb'
  const TRACK_COLOR = '#991b1b'

  function segColor(i) {
    // Pick the segment after point i; fall back to the segment before for the last point
    const seg = routeState.segments[i] ?? routeState.segments[i - 1]
    return seg?.properties?.straight ? TRACK_COLOR : ROUTE_COLOR
  }

  function buildWaypointsGeoJSON(wps, overrideIdx = -1, overrideLngLat = null) {
    const n = wps.length
    return {
      type: 'FeatureCollection',
      features: wps.map((wp, i) => {
        const coords = (i === overrideIdx && overrideLngLat)
          ? [overrideLngLat.lng, overrideLngLat.lat]
          : [wp.lng, wp.lat]
        // First / last keep their landmark colors; middle points reflect segment type
        const color = i === 0 ? '#16a34a' : i === n - 1 ? '#dc2626' : segColor(i)
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: coords },
          properties: { index: i, label: String(i + 1), color },
        }
      }),
    }
  }

  // Sync GL waypoints source whenever waypoints or segments change
  $effect(() => {
    const wps = routeState.waypoints.slice()
    void routeState.segments.slice() // also re-run when segment types change
    if (!mapLoaded) return
    map.getSource('waypoints')?.setData(buildWaypointsGeoJSON(wps))
  })

  function setupWaypointInteraction() {
    // Drag to move
    map.on('mousedown', 'waypoints-circle', e => {
      if (toolStore.active === TOOLS.ERASER) return
      e.preventDefault()
      const idx = e.features[0].properties.index
      map.dragPan.disable()
      map.getCanvas().style.cursor = 'grabbing'
      clearRubberBand()

      const onMove = ev => {
        map.getSource('waypoints').setData(
          buildWaypointsGeoJSON(routeState.waypoints, idx, ev.lngLat)
        )
      }

      const onUp = ev => {
        map.off('mousemove', onMove)
        map.off('mouseup',   onUp)
        map.dragPan.enable()
        map.getCanvas().style.cursor = toolCursor()
        routeState.moveWaypoint(idx, ev.lngLat)
      }

      map.on('mousemove', onMove)
      map.on('mouseup',   onUp)
    })

    // Eraser click → delete
    map.on('click', 'waypoints-circle', e => {
      if (toolStore.active !== TOOLS.ERASER) return
      e.preventDefault()
      routeState.removeWaypoint(e.features[0].properties.index)
    })

    // Right-click → delete
    map.on('contextmenu', 'waypoints-circle', e => {
      e.preventDefault()
      routeState.removeWaypoint(e.features[0].properties.index)
    })

    // Show grab cursor when hovering a draggable waypoint
    map.on('mouseenter', 'waypoints-circle', () => {
      if (toolStore.active !== TOOLS.ERASER) map.getCanvas().style.cursor = 'grab'
    })
    map.on('mouseleave', 'waypoints-circle', () => {
      if (toolStore.active !== TOOLS.ERASER) map.getCanvas().style.cursor = toolCursor()
    })
  }

  // --- POI markers (HTML, individually managed) ------------------------

  const poiMarkerMap = new Map() // id → { marker, popup: Popup|null }

  function poiSymDef(symId) {
    return POI_SYMBOLS.find(s => s.id === symId) ?? POI_SYMBOLS[0]
  }

  // Build the teardrop pin SVG with the Maki icon embedded in the white circle.
  // The Maki icons use a 15×15 viewBox; we scale them to 7.5×7.5 centered at (10,10).
  function poiPinSvg(sym, w = 22, h = 30) {
    return `<svg viewBox="0 0 20 28" width="${w}" height="${h}" aria-hidden="true">
      <path d="M10 0C4.5 0 0 4.5 0 10c0 7.5 10 18 10 18s10-10.5 10-18C20 4.5 15.5 0 10 0z"
            fill="${sym.color}" stroke="white" stroke-width="1.5"/>
      <circle cx="10" cy="10" r="4.5" fill="white" fill-opacity="0.9"/>
      <svg x="6.25" y="6.25" width="7.5" height="7.5" viewBox="0 0 15 15" fill="${sym.color}">
        ${sym.content}
      </svg>
    </svg>`
  }

  function syncPoiMarkers(pois) {
    const ids = new Set(pois.map(p => p.id))

    // Remove deleted POIs
    poiMarkerMap.forEach((entry, id) => {
      if (!ids.has(id)) {
        entry.popup?.remove()
        entry.marker.remove()
        poiMarkerMap.delete(id)
      }
    })

    pois.forEach(poi => {
      const sym = poiSymDef(poi.symbol)

      if (poiMarkerMap.has(poi.id)) {
        // Update existing marker visuals
        const el = poiMarkerMap.get(poi.id).marker.getElement()
        el.querySelector('.poi-pin').innerHTML = poiPinSvg(sym)
        let nameEl = el.querySelector('.poi-name')
        if (poi.name) {
          if (!nameEl) { nameEl = document.createElement('span'); nameEl.className = 'poi-name'; el.appendChild(nameEl) }
          nameEl.textContent = poi.name
        } else if (nameEl) {
          nameEl.remove()
        }
      } else {
        // Create new marker
        const el = document.createElement('div')
        el.className = 'poi-marker'
        const pin = document.createElement('div')
        pin.className = 'poi-pin'
        pin.innerHTML = poiPinSvg(sym)
        el.appendChild(pin)
        if (poi.name) {
          const n = document.createElement('span')
          n.className = 'poi-name'
          n.textContent = poi.name
          el.appendChild(n)
        }

        el.addEventListener('click', ev => {
          ev.stopPropagation()
          if (toolStore.active === TOOLS.ERASER) {
            removePoiMarker(poi.id)
          } else if (toolStore.active === TOOLS.SELECT || toolStore.active === TOOLS.WAYPOINT) {
            openPoiPopup(poi.id)
          }
        })

        el.addEventListener('contextmenu', ev => {
          ev.preventDefault()
          removePoiMarker(poi.id)
        })

        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([poi.lng, poi.lat])
          .addTo(map)

        poiMarkerMap.set(poi.id, { marker, popup: null })
      }
    })
  }

  function removePoiMarker(id) {
    const entry = poiMarkerMap.get(id)
    if (!entry) return
    entry.popup?.remove()
    entry.marker.remove()
    poiMarkerMap.delete(id)
    poisStore.remove(id)
  }

  function openPoiPopup(id) {
    const entry = poiMarkerMap.get(id)
    if (!entry) return

    // Toggle off if already open
    if (entry.popup) { entry.popup.remove(); return }

    // Close all other POI popups
    poiMarkerMap.forEach((e, eid) => { if (eid !== id && e.popup) { e.popup.remove(); e.popup = null } })

    const poi = poisStore.pois.find(p => p.id === id)
    if (!poi) return

    const wrap = document.createElement('div')
    wrap.className = 'poi-edit'

    const nameInput = document.createElement('input')
    nameInput.className = 'poi-edit-name'
    nameInput.placeholder = 'Name…'
    nameInput.value = poi.name
    nameInput.addEventListener('input', ev => poisStore.update(id, { name: ev.target.value }))

    const symGrid = document.createElement('div')
    symGrid.className = 'poi-edit-syms'
    POI_SYMBOLS.forEach(sym => {
      const btn = document.createElement('button')
      btn.className = 'poi-sym-btn' + (poi.symbol === sym.id ? ' active' : '')
      btn.title = sym.label
      btn.innerHTML = poiPinSvg(sym, 14, 20)
      btn.addEventListener('click', () => {
        poisStore.update(id, { symbol: sym.id })
        symGrid.querySelectorAll('.poi-sym-btn').forEach(b => b.classList.toggle('active', b === btn))
      })
      symGrid.appendChild(btn)
    })

    const delBtn = document.createElement('button')
    delBtn.className = 'poi-del-btn'
    delBtn.textContent = 'Delete'
    delBtn.addEventListener('click', () => removePoiMarker(id))

    wrap.appendChild(nameInput)
    wrap.appendChild(symGrid)
    wrap.appendChild(delBtn)

    const popup = new maplibregl.Popup({ closeButton: true, offset: 32, className: 'poi-popup' })
      .setDOMContent(wrap)
      .setLngLat([poi.lng, poi.lat])
      .addTo(map)

    entry.popup = popup
    popup.on('close', () => { if (entry) entry.popup = null })
    requestAnimationFrame(() => nameInput.focus())
  }

  $effect(() => {
    const pois = poisStore.pois.slice()
    if (!mapLoaded) return
    syncPoiMarkers(pois)
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
    map.getCanvas().style.cursor = toolCursor()
    clearRubberBand()
  })

  function toolCursor() {
    return {
      [TOOLS.SELECT]:   '',
      [TOOLS.ERASER]:   'cell',
      [TOOLS.ROUTE]:    'crosshair',
      [TOOLS.TRACK]:    'crosshair',
      [TOOLS.WAYPOINT]: 'crosshair',
    }[toolStore.active] ?? ''
  }

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
    const active = toolStore.active
    const drawing = active === TOOLS.ROUTE || active === TOOLS.TRACK
    if (!wps.length || !drawing) { clearRubberBand(); return }
    const last = wps[wps.length - 1]
    map.getSource('rubber-band').setData({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [[last.lng, last.lat], [lngLat.lng, lngLat.lat]],
      },
      properties: { color: active === TOOLS.TRACK ? TRACK_COLOR : ROUTE_COLOR },
    })
  }

  function clearRubberBand() {
    map.getSource('rubber-band')?.setData({ type: 'FeatureCollection', features: [] })
  }

  // --- Drag-on-line ----------------------------------------------------

  let isLineDragging = false

  function setupLineDrag() {
    map.on('mousedown', 'route-hit', e => {
      if (toolStore.active !== TOOLS.ROUTE) return  // line-drag only when routing
      e.preventDefault()
      isLineDragging = true
      const insertIdx = findInsertIndex(e.lngLat)
      map.dragPan.disable()
      clearRubberBand()

      // Ghost marker follows the cursor during drag
      const ghostEl = document.createElement('div')
      ghostEl.style.cssText = 'width:18px;height:18px;border-radius:50%;background:#2563eb;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);opacity:.6;pointer-events:none'
      const ghost = new maplibregl.Marker({ element: ghostEl, anchor: 'center' })
        .setLngLat(e.lngLat).addTo(map)

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
        paint: {
          'line-color': ['case', ['boolean', ['get', 'straight'], false], TRACK_COLOR, ROUTE_COLOR],
          'line-width': 4,
        },
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
          'line-color': ['coalesce', ['get', 'color'], ROUTE_COLOR],
          'line-width': 2,
          'line-dasharray': [4, 3],
          'line-opacity': 0.6,
        },
      })

      map.on('mousemove', e => {
        if (!isLineDragging) setRubberBand(e.lngLat)
      })
      map.getCanvas().addEventListener('mouseleave', clearRubberBand)

      // Click on blank map → add waypoint or POI
      map.on('click', e => {
        if (e.defaultPrevented) return
        const onWp = map.queryRenderedFeatures(e.point, { layers: ['waypoints-circle'] })
        if (onWp.length > 0) return
        if (toolStore.active === TOOLS.ROUTE)    routeState.addWaypoint(e.lngLat, undefined, false)
        else if (toolStore.active === TOOLS.TRACK)    routeState.addWaypoint(e.lngLat, undefined, true)
        else if (toolStore.active === TOOLS.WAYPOINT) poisStore.add(e.lngLat)
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

      // Waypoints: circle + number label (rendered by GL, no DOM lag)
      map.addSource('waypoints', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'waypoints-circle',
        type: 'circle',
        source: 'waypoints',
        paint: {
          'circle-radius': 10,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      })
      map.addLayer({
        id: 'waypoints-label',
        type: 'symbol',
        source: 'waypoints',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-font': ['Noto Sans Bold', 'Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': '#ffffff' },
      })

      setupWaypointInteraction()
      setupLineDrag()
      map.resize()
      mapLoaded = true
    })
  })

  onDestroy(() => {
    poiMarkerMap.forEach(({ marker, popup }) => { popup?.remove(); marker.remove() })
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

  /* POI markers */
  :global(.poi-marker) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    cursor: pointer;
  }

  :global(.poi-pin) {
    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.45));
    transition: filter 0.12s, transform 0.12s;
    line-height: 0;
  }

  :global(.poi-marker:hover .poi-pin) {
    filter: drop-shadow(0 3px 5px rgba(0,0,0,0.5));
    transform: translateY(-2px);
  }

  :global(.poi-name) {
    font-size: 11px;
    font-weight: 600;
    color: #1e1e2e;
    background: rgba(255,255,255,0.93);
    padding: 1px 5px;
    border-radius: 3px;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 1px 3px rgba(0,0,0,0.25);
    max-width: 130px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* POI edit popup — override MapLibre popup defaults */
  :global(.poi-popup .maplibregl-popup-content) {
    background: rgba(24, 24, 37, 0.96);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    padding: 10px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.5);
    color: #cdd6f4;
  }

  :global(.poi-popup .maplibregl-popup-tip) {
    display: none;
  }

  :global(.poi-popup .maplibregl-popup-close-button) {
    color: #585b70;
    font-size: 18px;
    line-height: 1;
    padding: 4px 6px;
    border-radius: 4px;
    top: 4px;
    right: 4px;
  }

  :global(.poi-popup .maplibregl-popup-close-button:hover) {
    background: rgba(255,255,255,0.07);
    color: #cdd6f4;
  }

  :global(.poi-edit) {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 186px;
  }

  :global(.poi-edit-name) {
    width: 100%;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 5px;
    background: rgba(17, 17, 27, 0.7);
    color: #cdd6f4;
    padding: 5px 8px;
    font-size: 13px;
    outline: none;
  }

  :global(.poi-edit-name::placeholder) { color: #45475a; }

  :global(.poi-edit-name:focus) {
    border-color: #89b4fa;
  }

  :global(.poi-edit-syms) {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  :global(.poi-sym-btn) {
    width: 30px;
    height: 30px;
    border: 1.5px solid transparent;
    border-radius: 5px;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: border-color 0.1s, background 0.1s;
    line-height: 0;
  }

  :global(.poi-sym-btn:hover) { background: rgba(255,255,255,0.08); }
  :global(.poi-sym-btn.active) { border-color: #89b4fa; background: rgba(137,180,250,0.12); }

  :global(.poi-del-btn) {
    width: 100%;
    padding: 5px;
    border: none;
    border-radius: 5px;
    background: rgba(243, 139, 168, 0.12);
    color: #f38ba8;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.1s;
  }

  :global(.poi-del-btn:hover) { background: rgba(243, 139, 168, 0.22); }
</style>
