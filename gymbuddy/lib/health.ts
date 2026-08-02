import { Platform } from 'react-native'
import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase, updateChallengeProgress } from './supabase'

// Expo Go: moduly natywne nie istnieja, a HealthKit (NitroModules) rzuca blad
// juz przy samym require — dlatego w Expo Go nie wolno go nawet dotykac
const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient'

// Kroki z zegarka/telefonu — jeden interfejs, dwie platformy:
//  Android: Health Connect (hub systemowy — Garmin/Fitbit/Samsung itd.)
//  iOS:     HealthKit (Apple Health) przez @kingstinct/react-native-healthkit
// Oba moduly sa natywne — istnieja tylko w buildzie dev/produkcyjnym.
// W Expo Go require sie nie powiedzie i wszystko bezpiecznie zwraca "niedostepne".

let hcModule: any = null
let hcTried = false

function getHC(): any | null {
  if (Platform.OS !== 'android' || IS_EXPO_GO) return null
  if (hcTried) return hcModule
  hcTried = true
  try {
    hcModule = require('react-native-health-connect')
  } catch (e) {
    hcModule = null
  }
  return hcModule
}

let hkModule: any = null
let hkTried = false

function getHK(): any | null {
  if (Platform.OS !== 'ios' || IS_EXPO_GO) return null
  if (hkTried) return hkModule
  hkTried = true
  try {
    // v8 (bez NitroModules — v14 wieszal apke na splashu); default export ma wszystkie funkcje
    const mod = require('@kingstinct/react-native-healthkit')
    hkModule = mod?.default ?? mod
  } catch (e) {
    hkModule = null
  }
  return hkModule
}

export function isHealthSupported(): boolean {
  return getHC() !== null || getHK() !== null
}

export async function isHealthConnected(): Promise<boolean> {
  if (!getHC() && !getHK()) return false
  return (await AsyncStorage.getItem('health_connected')) === '1'
}

// Prosi o dostep do krokow (systemowy dialog Health Connect / Apple Health)
export async function connectHealth(): Promise<{ success: boolean; error?: string }> {
  const hk = getHK()
  if (hk) {
    try {
      const available = await hk.isHealthDataAvailable()
      if (!available) return { success: false, error: 'unavailable' }
      // Apple nie zdradza, czy uzytkownik faktycznie przyznal odczyt (prywatnosc) —
      // sukces requestu traktujemy jako polaczenie; brak zgody = zawsze 0 krokow
      await hk.requestAuthorization([
        'HKQuantityTypeIdentifierStepCount', 'HKWorkoutTypeIdentifier',
        'HKQuantityTypeIdentifierHeartRate', 'HKQuantityTypeIdentifierActiveEnergyBurned',
      ])
      await AsyncStorage.setItem('health_connected', '1')
      return { success: true }
    } catch (e: any) {
      console.log('connectHealth (HealthKit) error:', e)
      return { success: false, error: e?.message ?? 'unknown' }
    }
  }
  const hc = getHC()
  if (!hc) return { success: false, error: 'unavailable' }
  try {
    const initialized = await hc.initialize()
    if (!initialized) return { success: false, error: 'not_initialized' }
    const granted = await hc.requestPermission([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'ExerciseSession' },
      { accessType: 'read', recordType: 'Distance' },
      { accessType: 'read', recordType: 'HeartRate' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
    ])
    const hasSteps = (granted ?? []).some((p: any) => p.recordType === 'Steps')
    if (hasSteps) {
      await AsyncStorage.setItem('health_connected', '1')
      return { success: true }
    }
    return { success: false, error: 'denied' }
  } catch (e: any) {
    console.log('connectHealth error:', e)
    return { success: false, error: e?.message ?? 'unknown' }
  }
}

export async function disconnectHealth(): Promise<void> {
  await AsyncStorage.setItem('health_connected', '0')
}

// Suma krokow w przedziale czasu (agregacja — deduplikuje telefon+zegarek)
export async function getStepsBetween(start: Date, end: Date): Promise<number | null> {
  if (!(await isHealthConnected())) return null
  const hk = getHK()
  if (hk) {
    try {
      // v8: (identifier, opcje, od, do, jednostka)
      const stats = await hk.queryStatisticsForQuantity(
        'HKQuantityTypeIdentifierStepCount',
        ['cumulativeSum'],
        start,
        end,
        'count'
      )
      return Math.round(stats?.sumQuantity?.quantity ?? 0)
    } catch (e) {
      console.log('getStepsBetween (HealthKit) error:', e)
      return null
    }
  }
  const hc = getHC()
  if (!hc) return null
  try {
    const result = await hc.aggregateRecord({
      recordType: 'Steps',
      timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
    })
    return result?.COUNT_TOTAL ?? 0
  } catch (e) {
    console.log('getStepsBetween error:', e)
    return null
  }
}

// Ostatni dzisiejszy trening (do naklejki aktywnosci na relacji): czas, dystans,
// tetno srednie, kalorie. Best-effort na kazdym polu osobno — brak danych na
// ktoryms z nich nie blokuje reszty, a przy calkowitym braku user wpisuje recznie.
export async function getTodayWorkout(): Promise<{ durationMin: number; distanceKm: number | null; avgHeartRate: number | null; calories: number | null } | null> {
  if (!(await isHealthConnected())) return null
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
  const now = new Date()
  const hk = getHK()
  if (hk) {
    try {
      // v8: duration to liczba sekund, dystans w jawnie wskazanej jednostce (metry)
      const workouts = await hk.queryWorkoutSamples({
        from: dayStart,
        to: now,
        limit: 3,
        ascending: false,
        distanceUnit: 'm',
      })
      const w = workouts?.[0]
      if (!w) return null
      const durationMin = Math.round((w.duration ?? 0) / 60)
      if (durationMin <= 0) return null
      const distanceKm = w.totalDistance?.quantity
        ? Math.round(w.totalDistance.quantity / 10) / 100
        : null
      const wStart = w.startDate ? new Date(w.startDate) : dayStart
      const wEnd = w.endDate ? new Date(w.endDate) : now
      let avgHeartRate: number | null = null
      try {
        const hrStats = await hk.queryStatisticsForQuantity('HKQuantityTypeIdentifierHeartRate', ['discreteAverage'], wStart, wEnd, 'count/min')
        const avg = hrStats?.averageQuantity?.quantity
        if (avg) avgHeartRate = Math.round(avg)
      } catch (e) { }
      let calories: number | null = null
      try {
        const calStats = await hk.queryStatisticsForQuantity('HKQuantityTypeIdentifierActiveEnergyBurned', ['cumulativeSum'], wStart, wEnd, 'kcal')
        const sum = calStats?.sumQuantity?.quantity
        if (sum) calories = Math.round(sum)
      } catch (e) { }
      return { durationMin, distanceKm, avgHeartRate, calories }
    } catch (e) { return null }
  }
  const hc = getHC()
  if (!hc) return null
  try {
    const res = await hc.readRecords('ExerciseSession', {
      timeRangeFilter: { operator: 'between', startTime: dayStart.toISOString(), endTime: now.toISOString() },
    })
    const sessions = res?.records ?? res ?? []
    const s = sessions[sessions.length - 1]
    if (!s) return null
    const durationMin = Math.round((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000)
    if (durationMin <= 0) return null
    let distanceKm: number | null = null
    try {
      const agg = await hc.aggregateRecord({
        recordType: 'Distance',
        timeRangeFilter: { operator: 'between', startTime: s.startTime, endTime: s.endTime },
      })
      const meters = agg?.DISTANCE?.inMeters ?? agg?.DISTANCE_TOTAL?.inMeters ?? null
      if (meters) distanceKm = Math.round(meters / 10) / 100
    } catch (e) { }
    let avgHeartRate: number | null = null
    try {
      const hrAgg = await hc.aggregateRecord({
        recordType: 'HeartRate',
        timeRangeFilter: { operator: 'between', startTime: s.startTime, endTime: s.endTime },
      })
      const avg = hrAgg?.BPM_AVG ?? hrAgg?.HEART_RATE_AVG ?? hrAgg?.AVERAGE ?? null
      if (avg) avgHeartRate = Math.round(avg)
    } catch (e) { }
    let calories: number | null = null
    try {
      const calAgg = await hc.aggregateRecord({
        recordType: 'ActiveCaloriesBurned',
        timeRangeFilter: { operator: 'between', startTime: s.startTime, endTime: s.endTime },
      })
      const kcal = calAgg?.ACTIVE_CALORIES_TOTAL?.inKilocalories ?? calAgg?.ENERGY_TOTAL?.inKilocalories ?? null
      if (kcal) calories = Math.round(kcal)
    } catch (e) { }
    return { durationMin, distanceKm, avgHeartRate, calories }
  } catch (e) { return null }
}

// Kroki z ostatnich 7 dni (do wykresu na wlasnym profilu), od najstarszego dnia
export async function getWeekSteps(): Promise<{ date: string; steps: number }[] | null> {
  if (!(await isHealthConnected())) return null
  const out: { date: string; steps: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const day = new Date()
    day.setDate(day.getDate() - i)
    const start = new Date(day); start.setHours(0, 0, 0, 0)
    const end = new Date(day); end.setHours(23, 59, 59, 999)
    const steps = await getStepsBetween(start, end)
    out.push({ date: start.toISOString().split('T')[0], steps: steps ?? 0 })
  }
  return out
}

// Wlasne kroki na profil publiczny: zapis do bazy TYLKO gdy uzytkownik wlaczyl
// "pokazuj kroki" — inni widza je z profiles.steps_today (odswiezane z heartbeatem)
export async function syncStepsToProfile(profileId: string, showSteps: boolean): Promise<void> {
  if (!showSteps) return
  try {
    const steps = await getTodaySteps()
    if (steps === null) return
    await supabase.from('profiles').update({
      steps_today: steps,
      steps_date: new Date().toISOString().split('T')[0],
    }).eq('id', profileId)
  } catch (e) { }
}

export async function getTodaySteps(): Promise<number | null> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return getStepsBetween(start, new Date())
}

// Automatyczny postep wyzwan krokowych: suma krokow od startu wyzwania
export async function syncStepsToChallenges(profileId: string): Promise<boolean> {
  if (!(await isHealthConnected())) return false
  try {
    const today = new Date().toISOString().split('T')[0]
    const { data: participations } = await supabase
      .from('challenge_participants')
      .select('challenge_id, current_progress, challenges!inner(id, goal_type, start_date, end_date)')
      .eq('profile_id', profileId)
      .eq('challenges.goal_type', 'walking_steps')
      .gte('challenges.end_date', today)
    if (!participations || participations.length === 0) return false

    let updated = false
    for (const p of participations) {
      const ch: any = (p as any).challenges
      const start = new Date(ch.start_date + 'T00:00:00')
      const steps = await getStepsBetween(start, new Date())
      if (steps !== null && steps > (p.current_progress ?? 0)) {
        await updateChallengeProgress(p.challenge_id, profileId, steps)
        updated = true
      }
    }
    return updated
  } catch (e) {
    console.log('syncStepsToChallenges error:', e)
    return false
  }
}
