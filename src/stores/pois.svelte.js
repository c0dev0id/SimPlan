import markerSvg      from '@mapbox/maki/icons/marker.svg?raw'
import campsiteSvg    from '@mapbox/maki/icons/campsite.svg?raw'
import mountainSvg    from '@mapbox/maki/icons/mountain.svg?raw'
import viewpointSvg   from '@mapbox/maki/icons/viewpoint.svg?raw'
import shelterSvg     from '@mapbox/maki/icons/shelter.svg?raw'
import picnicSvg      from '@mapbox/maki/icons/picnic-site.svg?raw'
import restaurantSvg  from '@mapbox/maki/icons/restaurant.svg?raw'
import waterSvg       from '@mapbox/maki/icons/drinking-water.svg?raw'
import lodgingSvg     from '@mapbox/maki/icons/lodging.svg?raw'
import parkingSvg     from '@mapbox/maki/icons/parking.svg?raw'
import informationSvg from '@mapbox/maki/icons/information.svg?raw'
import hospitalSvg    from '@mapbox/maki/icons/hospital.svg?raw'

// Strip XML declaration and outer <svg> wrapper; keep inner path/group elements
function inner(raw) {
  return raw
    .replace(/<\?xml[^?]*\?>\s*/g, '')
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>/, '')
    .trim()
}

export const POI_SYMBOLS = [
  { id: 'marker',      label: 'Marker',    color: '#f59e0b', content: inner(markerSvg) },
  { id: 'campsite',    label: 'Camp',      color: '#22c55e', content: inner(campsiteSvg) },
  { id: 'mountain',    label: 'Summit',    color: '#8b5cf6', content: inner(mountainSvg) },
  { id: 'viewpoint',   label: 'Viewpoint', color: '#14b8a6', content: inner(viewpointSvg) },
  { id: 'shelter',     label: 'Shelter',   color: '#78716c', content: inner(shelterSvg) },
  { id: 'picnic-site', label: 'Picnic',    color: '#84cc16', content: inner(picnicSvg) },
  { id: 'restaurant',  label: 'Food',      color: '#f97316', content: inner(restaurantSvg) },
  { id: 'water',       label: 'Water',     color: '#06b6d4', content: inner(waterSvg) },
  { id: 'lodging',     label: 'Lodging',   color: '#ec4899', content: inner(lodgingSvg) },
  { id: 'parking',     label: 'Parking',   color: '#3b82f6', content: inner(parkingSvg) },
  { id: 'information', label: 'Info',      color: '#6b7280', content: inner(informationSvg) },
  { id: 'hospital',    label: 'Medical',   color: '#ef4444', content: inner(hospitalSvg) },
]

const DEFAULT_SYMBOL = 'marker'

function createPoisStore() {
  let pois = $state([])

  return {
    get pois() { return pois },

    add(lngLat) {
      const id = crypto.randomUUID()
      pois.push({ id, lng: lngLat.lng, lat: lngLat.lat, name: '', symbol: DEFAULT_SYMBOL })
      return id
    },

    remove(id) {
      const i = pois.findIndex(p => p.id === id)
      if (i >= 0) pois.splice(i, 1)
    },

    update(id, changes) {
      const i = pois.findIndex(p => p.id === id)
      if (i >= 0) pois[i] = { ...pois[i], ...changes }
    },
  }
}

export const poisStore = createPoisStore()
