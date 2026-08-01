import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Miejsca w poblizu — dwa tryby:
//  kind 'places' (domyslny): parki/obiekty sportowe do naklejki lokalizacji (Overpass -> Nominatim)
//  kind 'gyms': silownie do wyboru w profilu/relacji (Google Places -> Overpass -> Nominatim)
// Publiczne serwery Overpass bywaja przeciazone, wiec wszystko odpytujemy po
// stronie serwera z dlugimi timeoutami i cache'ujemy per komorka ~2 km na 7 dni.
// Klucz Google (GOOGLE_PLACES_KEY w sekretach Edge Functions) jest opcjonalny —
// bez niego dziala fallback OSM.

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

const CACHE_MS = 7 * 24 * 3600 * 1000
const PER_MIRROR_TIMEOUT = 12000
const OVERALL_DEADLINE = 30000

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
}

// Fallback gdy Overpass lezy: Nominatim (oficjalny geokoder OSM) z terminami
// dopasowanymi do jezyka — dopasowuje po NAZWACH miejsc w viewboxie ~4 km
const NOMINATIM_TERMS: Record<string, string[]> = {
  pl: ['park', 'stadion', 'basen', 'hala sportowa'],
  nl: ['park', 'stadion', 'zwembad', 'sporthal'],
  en: ['park', 'stadium', 'pool', 'sports'],
  de: ['park', 'stadion', 'schwimmbad', 'sporthalle'],
  fr: ['parc', 'stade', 'piscine', 'gymnase'],
  es: ['parque', 'estadio', 'piscina', 'polideportivo'],
  bg: ['парк', 'стадион', 'басейн', 'спортна зала'],
  ro: ['parc', 'stadion', 'piscină', 'sală de sport'],
  tr: ['park', 'stadyum', 'havuz', 'spor salonu'],
}

const NOMINATIM_GYM_TERMS: Record<string, string[]> = {
  pl: ['siłownia', 'fitness'],
  nl: ['sportschool', 'fitness'],
  en: ['gym', 'fitness'],
  de: ['fitnessstudio', 'fitness'],
  fr: ['salle de sport', 'fitness'],
  es: ['gimnasio', 'fitness'],
  bg: ['фитнес', 'фитнес зала'],
  ro: ['sală de fitness', 'fitness'],
  tr: ['spor salonu', 'fitness'],
}

async function nominatimSearch(lat: number, lng: number, terms: string[], boxDeg: number): Promise<string[]> {
  const box = `${lng - boxDeg * 1.5},${lat + boxDeg},${lng + boxDeg * 1.5},${lat - boxDeg}`
  const out: string[] = []
  for (const term of terms) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&bounded=1&viewbox=${box}&q=${encodeURIComponent(term)}`
      const res = await fetch(url, { headers: { 'User-Agent': 'FitnessSwipe/1.0 (support.fitnessswipe@gmail.com)' } })
      if (!res.ok) continue
      const rows = await res.json()
      for (const r of rows) {
        if (r.category === 'highway') continue // ulice odpadaja (np. "Sportlaan")
        const name = r.name || String(r.display_name ?? '').split(',')[0]
        if (name && !out.includes(name)) out.push(name)
      }
      await new Promise(r => setTimeout(r, 400)) // polityka Nominatim: max ~1 zapytanie/s
    } catch (_e) { /* nastepny termin */ }
  }
  return out.slice(0, 20)
}

async function overpassNames(q: string): Promise<string[]> {
  const start = Date.now()
  for (const server of MIRRORS) {
    if (Date.now() - start > OVERALL_DEADLINE) break
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), PER_MIRROR_TIMEOUT)
      const res = await fetch(server, { method: 'POST', body: q, signal: ctrl.signal })
      clearTimeout(timer)
      const text = await res.text()
      if (!text.startsWith('{')) continue
      const data = JSON.parse(text)
      const names = [...new Set(
        (data.elements ?? [])
          .filter((e: any) => e.tags?.name)
          .map((e: any) => e.tags.name as string)
      )].slice(0, 20)
      if (names.length > 0) return names
    } catch (_e) { /* nastepny mirror */ }
  }
  return []
}

// Google Places (New) Nearby Search — najpewniejsze zrodlo, wymaga klucza
async function googleNearby(lat: number, lng: number, lang: string, types: string[], radius: number): Promise<string[]> {
  const key = Deno.env.get('GOOGLE_PLACES_KEY')
  if (!key) return []
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName',
      },
      body: JSON.stringify({
        includedTypes: types,
        maxResultCount: 20,
        languageCode: lang,
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
      }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return [...new Set(
      (data.places ?? [])
        .map((p: any) => p.displayName?.text as string)
        .filter(Boolean)
    )].slice(0, 20)
  } catch (_e) { return [] }
}

serve(async (req) => {
  try {
    const { lat, lng, lang, kind } = await req.json()
    if (typeof lat !== 'number' || typeof lng !== 'number' || !lat || !lng) return json({ places: [] })
    const isGyms = kind === 'gyms'
    const isVenues = kind === 'venues'
    const langCode = typeof lang === 'string' ? lang : 'en'

    const cell = `${isGyms ? 'g:' : isVenues ? 'v:' : ''}${Math.round(lat / 0.02)}:${Math.round(lng / 0.02)}`
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: cached } = await supabase.from('places_cache').select('*').eq('cell', cell).maybeSingle()
    if (cached && Date.now() - new Date(cached.updated_at).getTime() < CACHE_MS) {
      return json({ places: cached.places, cached: true })
    }

    let places: string[] = []

    if (isGyms) {
      // 1) Google Places (jesli klucz ustawiony) 2) Overpass 3) Nominatim
      places = await googleNearby(lat, lng, langCode, ['gym', 'fitness_center'], 15000)
      if (places.length === 0) {
        const around = `(around:20000,${lat},${lng})`
        const q = `[out:json][timeout:11];(node["leisure"="fitness_centre"]["name"]${around};way["leisure"="fitness_centre"]["name"]${around};node["amenity"="gym"]["name"]${around};);out tags;`
        places = await overpassNames(q)
      }
      if (places.length === 0) {
        places = await nominatimSearch(lat, lng, NOMINATIM_GYM_TERMS[langCode] ?? NOMINATIM_GYM_TERMS.en, 0.09)
      }
    } else if (isVenues) {
      // Obiekty na wydarzenia sportowe: boiska, hale, stadiony, baseny
      places = await googleNearby(lat, lng, langCode, ['sports_complex', 'stadium', 'swimming_pool', 'athletic_field'], 15000)
      if (places.length === 0) {
        const around = `(around:20000,${lat},${lng})`
        const q = `[out:json][timeout:11];(node["leisure"~"pitch|sports_centre|fitness_centre|stadium|track|swimming_pool"]["name"]${around};way["leisure"~"pitch|sports_centre|fitness_centre|stadium|swimming_pool"]["name"]${around};node["amenity"="gym"]["name"]${around};);out tags;`
        places = await overpassNames(q)
      }
      if (places.length === 0) {
        places = await nominatimSearch(lat, lng, NOMINATIM_TERMS[langCode] ?? NOMINATIM_TERMS.en, 0.09)
      }
    } else {
      const around = `(around:3000,${lat},${lng})`
      const q = `[out:json][timeout:11];(node["leisure"~"park|sports_centre|stadium|swimming_pool|track"]["name"]${around};way["leisure"~"park|sports_centre|stadium|swimming_pool"]["name"]${around};node["natural"="beach"]["name"]${around};way["natural"="beach"]["name"]${around};);out tags;`
      places = await overpassNames(q)
      if (places.length === 0) {
        places = await nominatimSearch(lat, lng, NOMINATIM_TERMS[langCode] ?? NOMINATIM_TERMS.en, 0.03)
      }
    }

    if (places.length > 0) {
      await supabase.from('places_cache').upsert({ cell, places, updated_at: new Date().toISOString() })
    } else if (cached) {
      // Wszystko padlo — lepszy przeterminowany cache niz nic
      places = cached.places
    }

    return json({ places })
  } catch (e) {
    return json({ places: [], error: String(e) })
  }
})
