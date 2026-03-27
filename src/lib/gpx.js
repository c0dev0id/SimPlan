/**
 * Export BRouter route segments to a GPX file and trigger download.
 */
export function exportGpx(name, segments) {
  const trkpts = segments
    .filter(Boolean)
    .flatMap(seg => seg.geometry.coordinates)
    .map(([lon, lat, ele]) => {
      const elTag = ele != null ? `\n        <ele>${ele.toFixed(1)}</ele>` : ''
      return `      <trkpt lat="${lat}" lon="${lon}">${elTag}\n      </trkpt>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Simple Planner" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`

  const blob = new Blob([xml], { type: 'application/gpx+xml' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `${name}.gpx`,
  })
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Parse a GPX string and return a GeoJSON Feature (LineString)
 * suitable for display as a reference track.
 * Extracts <trkpt> and <rtept> elements.
 */
export function gpxToFeature(gpxText, name) {
  const doc    = new DOMParser().parseFromString(gpxText, 'text/xml')
  const pts    = [...doc.querySelectorAll('trkpt, rtept')]
  if (pts.length < 2) throw new Error('GPX contains no track points')

  const coords = pts.map(pt => {
    const lon = parseFloat(pt.getAttribute('lon'))
    const lat = parseFloat(pt.getAttribute('lat'))
    const ele = parseFloat(pt.querySelector('ele')?.textContent ?? 'NaN')
    return isNaN(ele) ? [lon, lat] : [lon, lat, ele]
  })

  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: { name },
  }
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
