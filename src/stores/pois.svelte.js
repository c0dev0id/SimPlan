export const POI_SYMBOLS = [
  { id: 'pin',      label: 'Pin',      color: '#f59e0b' },
  { id: 'flag',     label: 'Flag',     color: '#ef4444' },
  { id: 'camp',     label: 'Camp',     color: '#22c55e' },
  { id: 'summit',   label: 'Summit',   color: '#8b5cf6' },
  { id: 'food',     label: 'Food',     color: '#f97316' },
  { id: 'parking',  label: 'Parking',  color: '#3b82f6' },
]

function createPoisStore() {
  let pois = $state([])

  return {
    get pois() { return pois },

    add(lngLat) {
      const id = crypto.randomUUID()
      pois.push({ id, lng: lngLat.lng, lat: lngLat.lat, name: '', symbol: 'pin' })
      return id
    },

    remove(id) {
      const i = pois.findIndex(p => p.id === id)
      if (i >= 0) pois.splice(i, 1)
    },

    // Replace the item to ensure Svelte 5 tracks the mutation
    update(id, changes) {
      const i = pois.findIndex(p => p.id === id)
      if (i >= 0) pois[i] = { ...pois[i], ...changes }
    },
  }
}

export const poisStore = createPoisStore()
