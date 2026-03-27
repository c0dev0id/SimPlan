<script>
  import { onMount, onDestroy } from 'svelte'
  import maplibregl from 'maplibre-gl'
  import 'maplibre-gl/dist/maplibre-gl.css'
  import { MAPTILER_KEY } from '../config.js'

  let container
  let map

  onMount(() => {
    map = new maplibregl.Map({
      container,
      style: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`,
      center: [10, 50],
      zoom: 5,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-right')
  })

  onDestroy(() => map?.remove())
</script>

<div class="map-wrap">
  <div bind:this={container} class="map"></div>
</div>

<style>
  .map-wrap {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .map {
    width: 100%;
    height: 100%;
  }
</style>
