<script>
  // Toolbar actions will go here
</script>

<header class="toolbar">
  <div class="brand">Simple Planner</div>
  <div class="actions">
    <!-- tools will live here -->
  </div>
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
    border-bottom: 1px solid #313244;
    gap: 16px;
    z-index: 10;
  }

  .brand {
    font-size: 0.9rem;
    font-weight: 600;
    color: #89b4fa;
    letter-spacing: 0.03em;
  }

  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
</style>
