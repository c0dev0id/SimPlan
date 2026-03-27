import { fetchSegment } from '../lib/routing/brouter.js'

function makeStraight(from, to) {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [to.lng, to.lat]] },
    properties: { straight: true },
  }
}

function isStraight(seg) {
  return !!seg?.properties?.straight
}

function createRouteState() {
  let waypoints = $state([])
  let segments  = $state([])
  let profile   = $state('hiking-mountain')
  let loading   = $state(0)

  async function calcSegment(i) {
    if (i < 0 || i >= waypoints.length - 1) return
    if (isStraight(segments[i])) {
      segments[i] = makeStraight(waypoints[i], waypoints[i + 1])
      return
    }
    loading++
    try {
      segments[i] = await fetchSegment(waypoints[i], waypoints[i + 1], profile)
    } catch (e) {
      console.error('BRouter:', e)
      segments[i] = null
    } finally {
      loading--
    }
  }

  async function addWaypoint(lngLat, index = waypoints.length, straight = false) {
    waypoints.splice(index, 0, lngLat)
    if (waypoints.length < 2) return

    const calc = (i, s) => s
      ? Promise.resolve(void (segments[i] = makeStraight(waypoints[i], waypoints[i + 1])))
      : calcSegment(i)

    if (index === 0) {
      segments.splice(0, 0, straight ? makeStraight(lngLat, waypoints[1]) : null)
      if (!straight) await calcSegment(0)
    } else if (index === waypoints.length - 1) {
      segments.push(null)
      await calc(index - 1, straight)
    } else {
      const wasStraight = isStraight(segments[index - 1])
      segments.splice(index - 1, 1, null, null)
      await Promise.all([calc(index - 1, straight), calc(index, wasStraight)])
    }
  }

  async function moveWaypoint(index, lngLat) {
    waypoints[index] = lngLat
    const tasks = []
    if (index > 0)                    tasks.push(calcSegment(index - 1))
    if (index < waypoints.length - 1) tasks.push(calcSegment(index))
    await Promise.all(tasks)
  }

  async function removeWaypoint(index) {
    waypoints.splice(index, 1)
    if (waypoints.length < 2) {
      segments.splice(0, segments.length)
      return
    }
    if (index === 0) {
      segments.splice(0, 1)
    } else if (index >= waypoints.length) {
      segments.splice(segments.length - 1, 1)
    } else {
      const straight = isStraight(segments[index - 1])
      segments.splice(index - 1, 2, null)
      if (straight) segments[index - 1] = makeStraight(waypoints[index - 1], waypoints[index])
      else await calcSegment(index - 1)
    }
  }

  async function setProfile(p) {
    profile = p
    // Only re-fetch BRouter segments; straight segments stay as-is
    await Promise.all(
      segments.map((seg, i) => isStraight(seg) ? Promise.resolve() : calcSegment(i))
    )
  }

  function clear() {
    waypoints.splice(0, waypoints.length)
    segments.splice(0, segments.length)
  }

  function loadFrom(wps, segs, prof) {
    waypoints.splice(0, waypoints.length, ...wps)
    segments.splice(0, segments.length, ...segs.slice(0, Math.max(0, wps.length - 1)))
    if (prof) profile = prof
  }

  return {
    get waypoints() { return waypoints },
    get segments()  { return segments },
    get profile()   { return profile },
    get loading()   { return loading > 0 },
    addWaypoint,
    moveWaypoint,
    removeWaypoint,
    setProfile,
    clear,
    loadFrom,
  }
}

export const routeState = createRouteState()
