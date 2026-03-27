export const TOOLS = {
  SELECT: 'select',
  ROUTE:  'route',   // draw with BRouter snapping
  TRACK:  'track',   // draw with straight lines
  ERASER: 'eraser',
}

function createToolStore() {
  let active = $state(TOOLS.ROUTE)

  return {
    get active() { return active },
    use(tool) { active = tool },
  }
}

export const toolStore = createToolStore()
