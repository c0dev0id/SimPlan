<script>
  // File tree lives here — stub for now
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <span>Tracks</span>
  </div>
  <div class="file-tree">
    <p class="empty">No tracks yet.</p>
  </div>
</aside>

<style>
  .sidebar {
    width: 260px;
    min-width: 260px;
    background: #1e1e2e;
    color: #cdd6f4;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #313244;
    overflow: hidden;
  }

  .sidebar-header {
    padding: 12px 16px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6c7086;
    border-bottom: 1px solid #313244;
  }

  .file-tree {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .empty {
    padding: 16px;
    font-size: 0.85rem;
    color: #6c7086;
  }
</style>
