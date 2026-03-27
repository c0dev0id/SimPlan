<script>
  import { toolStore, TOOLS } from '../stores/tool.svelte.js'

  const tools = [
    {
      id: TOOLS.SELECT,
      label: 'Select',
      key: 'S',
      // Arrow cursor icon
      icon: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 2L4 17L8 13L11.5 21L13.5 20L10 12L16 12Z"/>
      </svg>`,
    },
    {
      id: TOOLS.ERASER,
      label: 'Eraser',
      key: 'E',
      // Eraser icon
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 20H9L4 15L14 5L22 13L20 20Z"/>
        <line x1="9" y1="20" x2="22" y2="20"/>
        <line x1="7.5" y1="13.5" x2="14.5" y2="6.5"/>
      </svg>`,
    },
    {
      id: TOOLS.PLACE,
      label: 'Place waypoint',
      key: 'W',
      // Pin icon
      icon: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/>
      </svg>`,
    },
  ]

  function onKeydown(e) {
    if (e.target.tagName === 'INPUT') return
    if (e.key === 's' || e.key === 'S' || e.key === 'Escape') toolStore.use(TOOLS.SELECT)
    if (e.key === 'e' || e.key === 'E') toolStore.use(TOOLS.ERASER)
    if (e.key === 'w' || e.key === 'W') toolStore.use(TOOLS.PLACE)
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="bottom-toolbar" role="toolbar" aria-label="Drawing tools">
  {#each tools as tool}
    <button
      class="tool-btn"
      class:active={toolStore.active === tool.id}
      onclick={() => toolStore.use(tool.id)}
      title="{tool.label} ({tool.key})"
      aria-pressed={toolStore.active === tool.id}
    >
      {@html tool.icon}
      <span class="key-hint">{tool.key}</span>
    </button>
  {/each}
</div>

<style>
  .bottom-toolbar {
    position: absolute;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    display: flex;
    gap: 4px;
    padding: 5px;
    background: rgba(24, 24, 37, 0.92);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 40px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.35);
  }

  .tool-btn {
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: #a6adc8;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: background 0.12s, color 0.12s;
  }

  .tool-btn :global(svg) {
    width: 22px;
    height: 22px;
  }

  .tool-btn:hover {
    background: rgba(255,255,255,0.07);
    color: #cdd6f4;
  }

  .tool-btn.active {
    background: #313244;
    color: #89b4fa;
  }

  .key-hint {
    position: absolute;
    bottom: 3px;
    right: 5px;
    font-size: 8px;
    font-weight: 600;
    color: #585b70;
    line-height: 1;
    pointer-events: none;
  }

  .tool-btn.active .key-hint {
    color: #45475a;
  }
</style>
