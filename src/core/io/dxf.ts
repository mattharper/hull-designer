import type { NestResult, Panel } from '../types'
import { sheetBoardLayout, transformedOutline } from '../nest/nesting'

function dxfHeader(): string {
  return `0
SECTION
2
HEADER
9
$ACADVER
1
AC1009
0
ENDSEC
0
SECTION
2
TABLES
0
ENDSEC
0
SECTION
2
ENTITIES
`
}

function dxfFooter(): string {
  return `0
ENDSEC
0
EOF
`
}

function lwpolyline(points: { x: number; y: number }[], layer: string): string {
  if (points.length < 2) return ''
  const closed = 1
  let out = `0
LWPOLYLINE
8
${layer}
90
${points.length}
70
${closed}
`
  for (const p of points) {
    out += `10
${p.x.toFixed(6)}
20
${p.y.toFixed(6)}
`
  }
  return out
}

/** Export nested panels as DXF (inches if hull is feet — caller scales). */
export function panelsToDxf(
  panels: Panel[],
  nest: NestResult,
  scale = 1,
): string {
  const byId = new Map(panels.map((p) => [p.id, p]))
  let entities = ''

  if (nest.sheets.length === 0) {
    return dxfHeader() + entities + dxfFooter()
  }

  const layout = sheetBoardLayout(nest.sheets[0], nest.sheets.length)

  // Sheet outlines (shortest edges abutting)
  nest.sheets.forEach((sheet, i) => {
    const o = layout.origins[i]
    const ox = o.x * scale
    const oy = o.y * scale
    const rect = [
      { x: ox, y: oy },
      { x: ox + sheet.width * scale, y: oy },
      { x: ox + sheet.width * scale, y: oy + sheet.height * scale },
      { x: ox, y: oy + sheet.height * scale },
    ]
    entities += lwpolyline(rect, 'SHEETS')
  })

  for (const pl of nest.placements) {
    const panel = byId.get(pl.panelId)
    if (!panel) continue
    const pts = transformedOutline(panel, pl).map((p) => ({
      x: p.x * scale,
      y: p.y * scale,
    }))
    entities += lwpolyline(pts, 'PANELS')
  }

  return dxfHeader() + entities + dxfFooter()
}

export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
