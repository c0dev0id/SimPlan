import db from '../lib/db.js'
import { routeState } from './route.svelte.js'
import { gpxToFeature } from '../lib/gpx.js'

const PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777']

function nextColor(tracks) {
  return PALETTE[tracks.length % PALETTE.length]
}

function createTracksStore() {
  let tracks   = $state([])
  let activeId = $state(null)

  async function init() {
    tracks = await db.tracks.orderBy('updatedAt').reverse().toArray()
  }

  async function saveActive() {
    if (routeState.waypoints.length === 0) return

    const data = {
      profile:   routeState.profile,
      waypoints: routeState.waypoints.map(({ lng, lat }) => ({ lng, lat })),
      segments:  routeState.segments.filter(Boolean),
      updatedAt: Date.now(),
    }

    if (activeId === null) {
      const id = await db.tracks.add({
        ...data,
        name:      `Route ${tracks.length + 1}`,
        color:     nextColor(tracks),
        type:      'planned',
        createdAt: Date.now(),
      })
      activeId = id
      tracks = await db.tracks.orderBy('updatedAt').reverse().toArray()
    } else {
      await db.tracks.update(activeId, data)
      const idx = tracks.findIndex(t => t.id === activeId)
      if (idx >= 0) tracks[idx] = { ...tracks[idx], ...data }
    }
  }

  async function newTrack() {
    await saveActive()
    routeState.clear()
    activeId = null
  }

  async function loadTrack(id) {
    await saveActive()
    const track = await db.tracks.get(id)
    if (!track) return
    if (track.type === 'imported') {
      // Imported reference tracks: just set active, no waypoints to edit
      routeState.clear()
      activeId = id
    } else {
      routeState.loadFrom(track.waypoints ?? [], track.segments ?? [], track.profile)
      activeId = id
    }
  }

  async function deleteTrack(id) {
    await db.tracks.delete(id)
    tracks = tracks.filter(t => t.id !== id)
    if (activeId === id) {
      routeState.clear()
      activeId = null
    }
  }

  async function renameTrack(id, name) {
    const trimmed = name.trim() || 'Untitled'
    await db.tracks.update(id, { name: trimmed })
    const t = tracks.find(t => t.id === id)
    if (t) t.name = trimmed
  }

  /** Import a GPX file as a non-editable reference track. */
  async function importGpx(file) {
    const text    = await file.text()
    const name    = file.name.replace(/\.gpx$/i, '')
    const feature = gpxToFeature(text, name)
    const id      = await db.tracks.add({
      name,
      color:     nextColor(tracks),
      type:      'imported',
      segments:  [feature],
      waypoints: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    tracks = await db.tracks.orderBy('updatedAt').reverse().toArray()
    return id
  }

  return {
    get tracks()   { return tracks },
    get activeId() { return activeId },
    init,
    saveActive,
    newTrack,
    loadTrack,
    deleteTrack,
    renameTrack,
    importGpx,
  }
}

export const tracksStore = createTracksStore()
