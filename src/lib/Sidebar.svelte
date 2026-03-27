<script>
  import { tracksStore } from '../stores/tracks.svelte.js'
  import { routeState } from '../stores/route.svelte.js'
  import { exportGpx } from './gpx.js'

  let editingId   = $state(null)
  let editingName = $state('')
  let fileInput

  function startEdit(track) {
    editingId   = track.id
    editingName = track.name
  }

  async function commitEdit() {
    if (editingId !== null) {
      await tracksStore.renameTrack(editingId, editingName)
      editingId = null
    }
  }

  function onKeydown(e) {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') editingId = null
  }

  async function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    try {
      await tracksStore.importGpx(file)
    } catch (err) {
      alert(`Could not import GPX: ${err.message}`)
    }
    fileInput.value = ''
  }

  function handleExport(track) {
    const segs = track.id === tracksStore.activeId
      ? routeState.segments
      : (track.segments ?? [])
    exportGpx(track.name, segs)
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <span>Tracks</span>
    <div class="header-actions">
      <button class="icon-btn" title="Import GPX" onclick={() => fileInput.click()}>+GPX</button>
      <button class="icon-btn" title="New track"  onclick={() => tracksStore.newTrack()}>+</button>
    </div>
  </div>

  <input
    bind:this={fileInput}
    type="file"
    accept=".gpx"
    style="display:none"
    onchange={handleImport}
  />

  <div class="file-tree">
    {#if tracksStore.tracks.length === 0}
      <p class="empty">Click the map to start planning.</p>
    {/if}

    {#each tracksStore.tracks as track (track.id)}
      {@const isActive = track.id === tracksStore.activeId}
      <div
        class="track-item"
        class:active={isActive}
        onclick={() => tracksStore.loadTrack(track.id)}
        role="button"
        tabindex="0"
        onkeydown={e => e.key === 'Enter' && tracksStore.loadTrack(track.id)}
      >
        <span class="dot" style="background:{track.color}"></span>

        {#if editingId === track.id}
          <input
            class="name-input"
            bind:value={editingName}
            onblur={commitEdit}
            onkeydown={onKeydown}
            onclick={e => e.stopPropagation()}
            use:focusOnMount
          />
        {:else}
          <span
            class="track-name"
            role="button"
            tabindex="-1"
            ondblclick={e => { e.stopPropagation(); startEdit(track) }}
            title="Double-click to rename"
          >{track.name}</span>
        {/if}

        <span class="type-badge">{track.type === 'imported' ? 'ref' : ''}</span>

        <div class="track-actions" onclick={e => e.stopPropagation()} role="none">
          <button
            class="icon-btn"
            title="Export GPX"
            onclick={() => handleExport(track)}
          >↓</button>
          <button
            class="icon-btn danger"
            title="Delete"
            onclick={() => tracksStore.deleteTrack(track.id)}
          >×</button>
        </div>
      </div>
    {/each}
  </div>
</aside>

<!-- Svelte action to focus an element when mounted -->
<script module>
  function focusOnMount(node) {
    node.focus()
    node.select()
  }
</script>

<style>
  .sidebar {
    width: 240px;
    min-width: 240px;
    background: #1e1e2e;
    color: #cdd6f4;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #313244;
    overflow: hidden;
  }

  .sidebar-header {
    padding: 10px 12px;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6c7086;
    border-bottom: 1px solid #313244;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-actions {
    display: flex;
    gap: 4px;
  }

  .file-tree {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .empty {
    padding: 14px 12px;
    font-size: 0.8rem;
    color: #585b70;
    line-height: 1.5;
  }

  .track-item {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 10px 6px 12px;
    cursor: pointer;
    border-left: 2px solid transparent;
    transition: background 0.1s;
  }

  .track-item:hover {
    background: #2a2a3d;
  }

  .track-item.active {
    background: #252537;
    border-left-color: #89b4fa;
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .track-name {
    flex: 1;
    font-size: 0.83rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .name-input {
    flex: 1;
    background: #313244;
    color: #cdd6f4;
    border: 1px solid #89b4fa;
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 0.83rem;
    min-width: 0;
  }

  .type-badge {
    font-size: 0.65rem;
    color: #585b70;
    flex-shrink: 0;
  }

  .track-actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.1s;
  }

  .track-item:hover .track-actions,
  .track-item.active .track-actions {
    opacity: 1;
  }

  .icon-btn {
    background: transparent;
    border: none;
    color: #6c7086;
    cursor: pointer;
    padding: 2px 4px;
    font-size: 0.78rem;
    border-radius: 3px;
    line-height: 1;
  }

  .icon-btn:hover {
    color: #cdd6f4;
    background: #313244;
  }

  .icon-btn.danger:hover {
    color: #f38ba8;
    background: #3a2030;
  }
</style>
