import type { Hull } from '../types'
import { isHulText, parseHul } from './hul'
import { parseHull } from './json'

/** Parse a hull from file/library text (.hul or .hull.json). */
export function parseHullText(text: string, filename: string): Hull {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.hul') || isHulText(text)) {
    return parseHul(text, filename)
  }
  return parseHull(text)
}

function hullsUrl(path: string): string {
  const root = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${root}hulls/${path}`
}

export async function fetchLibraryHull(filename: string): Promise<Hull> {
  const res = await fetch(hullsUrl(encodeURIComponent(filename)))
  if (!res.ok) {
    throw new Error(`Could not load ${filename} (${res.status})`)
  }
  const text = await res.text()
  return parseHullText(text, filename)
}

export async function fetchLibraryIndex(): Promise<string[]> {
  const res = await fetch(hullsUrl('index.json'))
  if (!res.ok) {
    throw new Error(`Could not load hull library (${res.status})`)
  }
  const data: unknown = await res.json()
  if (!Array.isArray(data) || !data.every((x) => typeof x === 'string')) {
    throw new Error('Invalid hull library index')
  }
  return data
}

export function libraryDisplayName(filename: string): string {
  return filename.replace(/\.hul$/i, '')
}
