export const TOOLS = {
  SELECT: 'select',
  ERASER: 'eraser',
  PLACE:  'place',
}

function createToolStore() {
  let active = $state(TOOLS.PLACE)

  return {
    get active() { return active },
    use(tool) { active = tool },
  }
}

export const toolStore = createToolStore()
