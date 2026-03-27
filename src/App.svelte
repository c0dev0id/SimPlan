<script>
  import { onMount } from 'svelte'
  import Map from './lib/Map.svelte'
  import Sidebar from './lib/Sidebar.svelte'
  import Toolbar from './lib/Toolbar.svelte'
  import BottomToolbar from './lib/BottomToolbar.svelte'
  import { routeState } from './stores/route.svelte.js'
  import { tracksStore } from './stores/tracks.svelte.js'

  onMount(() => tracksStore.init())

  // Auto-save 2 s after the route stops changing
  $effect(() => {
    void routeState.segments.slice()
    const t = setTimeout(() => tracksStore.saveActive(), 2000)
    return () => clearTimeout(t)
  })
</script>

<div class="app">
  <Toolbar />
  <div class="main">
    <Sidebar />
    <div class="map-area">
      <Map />
      <BottomToolbar />
    </div>
  </div>
</div>

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    font-family: system-ui, sans-serif;
    overflow: hidden;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
  }

  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .map-area {
    position: relative;
    flex: 1;
    overflow: hidden;
  }
</style>
