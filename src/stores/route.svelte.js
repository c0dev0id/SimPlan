import { fetchSegment } from '../lib/routing/brouter.js'

function createRouteState() {
  let waypoints = $state([])
  let segments  = $state([])
  let profile   = $state('hiking-mountain')
  let loading   = $state(0) // count of in-flight requests

  async function calcSegment(i) {
    if (i < 0 || i >= waypoints.length - 1) return
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

  async function addWaypoint(lngLat, index = waypoints.length) {
    waypoints.splice(index, 0, lngLat)
    if (waypoints.length < 2) return

    if (index === 0) {
      segments.splice(0, 0, null)
      await calcSegment(0)
    } else if (index === waypoints.length - 1) {
      segments.push(null)
      await calcSegment(index - 1)
    } else {
      // Split the segment that spanned this position into two
      segments.splice(index - 1, 1, null, null)
      await Promise.all([calcSegment(index - 1), calcSegment(index)])
    }
  }

  async function moveWaypoint(index, lngLat) {
    waypoints[index] = lngLat
    const tasks = []
    if (index > 0)                      tasks.push(calcSegment(index - 1))
    if (index < waypoints.length - 1)   tasks.push(calcSegment(index))
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
      // Merge the two segments around the removed waypoint
      segments.splice(index - 1, 2, null)
      await calcSegment(index - 1)
    }
  }

  async function setProfile(p) {
    profile = p
    await Promise.all(Array.from({ length: waypoints.length - 1 }, (_, i) => calcSegment(i)))
  }

  function clear() {
    waypoints.splice(0, waypoints.length)
    segments.splice(0, segments.length)
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
  }
}

export const routeState = createRouteState()
