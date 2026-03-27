const BASE = 'https://brouter.de/brouter'

export const PROFILES = [
  { id: 'hiking-mountain', label: 'Hiking' },
  { id: 'trekking',        label: 'Trekking' },
  { id: 'fastbike',        label: 'Road bike' },
  { id: 'safety',          label: 'City bike' },
  { id: 'moped',           label: 'Moped' },
  { id: 'car-fast',        label: 'Car' },
]

export async function fetchSegment(from, to, profile) {
  const lonlats = `${from.lng},${from.lat}|${to.lng},${to.lat}`
  const url = `${BASE}?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=geojson`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`BRouter ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.features[0]
}
