import type { Units } from '../types'

const FT_TO_M = 0.3048
const LB_TO_KG = 0.45359237
const FT3_TO_L = 28.316846592
const M3_TO_L = 1000

export function toMetricLength(v: number, units: Units): number {
  return units === 'm' ? v : v * FT_TO_M
}

export function toUsLength(v: number, units: Units): number {
  return units === 'ft' ? v : v / FT_TO_M
}

export function toMetricWeight(v: number, units: Units): number {
  return units === 'm' ? v : v * LB_TO_KG
}

export function toUsWeight(v: number, units: Units): number {
  return units === 'ft' ? v : v / LB_TO_KG
}

/** Displacement volume → liters. */
export function toLiters(volume: number, units: Units): number {
  return units === 'm' ? volume * M3_TO_L : volume * FT3_TO_L
}

export function toUsVolumeFt3(volume: number, units: Units): number {
  return units === 'ft' ? volume : volume / FT_TO_M ** 3
}

export function toMetricArea(a: number, units: Units): number {
  return units === 'm' ? a : a * FT_TO_M ** 2
}

export function toUsArea(a: number, units: Units): number {
  return units === 'ft' ? a : a / FT_TO_M ** 2
}

/** Righting moment → N·m (approx kgf·m using kg·m). */
export function toMetricMoment(m: number, units: Units): number {
  return units === 'm' ? m : m * LB_TO_KG * FT_TO_M
}

export function toUsMoment(m: number, units: Units): number {
  return units === 'ft' ? m : m / (LB_TO_KG * FT_TO_M)
}
