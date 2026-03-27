<script>
  import Map from './lib/Map.svelte'
  import Sidebar from './lib/Sidebar.svelte'
  import Toolbar from './lib/Toolbar.svelte'
</script>

<div class="app">
  <Toolbar />
  <div class="main">
    <Sidebar />
    <Map />
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
</style>
