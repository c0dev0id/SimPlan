<script>
  import { routeState } from '../stores/route.svelte.js'
  import { tracksStore } from '../stores/tracks.svelte.js'
  import { PROFILES } from '../lib/routing/brouter.js'
  import { exportGpx } from './gpx.js'

  function handleExport() {
    const active = tracksStore.tracks.find(t => t.id === tracksStore.activeId)
    const name   = active?.name ?? 'route'
    exportGpx(name, routeState.segments)
  }

  const canExport = $derived(routeState.segments.some(Boolean))
</script>

<header class="toolbar">
  <div class="brand">Simple Planner</div>

  <select
    class="profile-select"
    value={routeState.profile}
    onchange={e => routeState.setProfile(e.target.value)}
  >
    {#each PROFILES as p}
      <option value={p.id}>{p.label}</option>
    {/each}
  </select>

  {#if routeState.loading}
    <span class="spinner" title="Calculating route…"></span>
  {/if}

  <div class="spacer"></div>

  <button
    class="btn"
    disabled={!canExport}
    onclick={handleExport}
    title="Export current route as GPX"
  >
    Export GPX
  </button>

  <button class="btn secondary" onclick={() => routeState.clear()} title="Clear route">
    Clear
  </button>
</header>

<style>
  .toolbar {
    height: 44px;
    min-height: 44px;
    background: #181825;
    color: #cdd6f4;
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 10px;
    border-bottom: 1px solid #313244;
    z-index: 10;
  }

  .brand {
    font-size: 0.9rem;
    font-weight: 600;
    color: #89b4fa;
    letter-spacing: 0.03em;
    white-space: nowrap;
  }

  .profile-select {
    background: #1e1e2e;
    color: #cdd6f4;
    border: 1px solid #45475a;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 0.82rem;
    cursor: pointer;
  }

  .profile-select:focus {
    outline: none;
    border-color: #89b4fa;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid #45475a;
    border-top-color: #89b4fa;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .spacer { flex: 1; }

  .btn {
    background: #313244;
    color: #cdd6f4;
    border: 1px solid #45475a;
    border-radius: 4px;
    padding: 4px 12px;
    font-size: 0.82rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn:hover:not(:disabled) {
    background: #45475a;
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .btn.secondary {
    background: transparent;
    color: #6c7086;
  }

  .btn.secondary:hover {
    color: #cdd6f4;
    background: #313244;
  }
</style>
