import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Duze wydarzenia sportowe z Ticketmaster Discovery API.
// Klucz zostaje po stronie serwera; wyniki cache'owane per region (siatka 0.5 stopnia) na 24h.

const TM_KEY = Deno.env.get('TICKETMASTER_KEY')

// TheSportsDB: terminarze lig (pilka, kosz, F1, MMA). Darmowy klucz '123' daje
// 1 najblizsze wydarzenie na lige; klucz premium (sekret TSDB_KEY) — pelne listy.
const TSDB_KEY = Deno.env.get('TSDB_KEY') ?? '123'
const TSDB_LEAGUES: Record<string, { id: number; genre: string }[]> = {
  NL: [
    { id: 4337, genre: 'Eredivisie' },
    { id: 4370, genre: 'Formula 1' },
    { id: 4463, genre: 'UFC' },
  ],
  PL: [
    { id: 4422, genre: 'Ekstraklasa' },
    { id: 4578, genre: 'Basketball' },
    { id: 4709, genre: 'KSW' },
    { id: 4370, genre: 'Formula 1' },
    { id: 4463, genre: 'UFC' },
  ],
}

async function fetchLeagueEvents(leagueId: number, genre: string): Promise<any[]> {
  try {
    const res = await fetch(`https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/eventsnextleague.php?id=${leagueId}`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.events ?? []).map((e: any) => ({
      id: `tsdb-${e.idEvent}`,
      name: e.strEvent,
      date: e.dateEvent ?? null,
      time: e.strTime ? String(e.strTime).slice(0, 8) : null,
      venue: e.strVenue || null,
      city: e.strCity || e.strCountry || null,
      image: e.strThumb || null,
      url: null,
      genre,
    }))
  } catch (e) { return [] }
}

serve(async (req) => {
  try {
    const { lat, lng } = await req.json()
    if (typeof lat !== 'number' || typeof lng !== 'number' || (lat === 0 && lng === 0)) {
      return new Response(JSON.stringify({ events: [] }), { headers: { 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Siatka ~50km: ta sama okolica = ten sam wpis cache
    const regionKey = `${Math.round(lat * 2) / 2},${Math.round(lng * 2) / 2}`

    const { data: cached } = await supabase
      .from('big_events_cache')
      .select('payload, fetched_at')
      .eq('region_key', regionKey)
      .maybeSingle()

    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < 24 * 3600 * 1000) {
      return new Response(JSON.stringify({ events: cached.payload }), { headers: { 'Content-Type': 'application/json' } })
    }

    const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json')
    url.searchParams.set('apikey', TM_KEY!)
    url.searchParams.set('latlong', `${lat},${lng}`)
    url.searchParams.set('radius', '100')
    url.searchParams.set('unit', 'km')
    url.searchParams.set('segmentName', 'Sports')
    url.searchParams.set('sort', 'date,asc')
    url.searchParams.set('size', '15')

    // Zrodlo 2: terminarze lig (kraj z dlugosci geograficznej: NL na zachod od 8°E)
    const country = lng < 8 ? 'NL' : 'PL'
    const leagueEvents = (await Promise.all(
      TSDB_LEAGUES[country].map(l => fetchLeagueEvents(l.id, l.genre))
    )).flat()

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`Ticketmaster ${res.status}`)
    const data = await res.json()

    const tmEvents = (data._embedded?.events ?? []).map((e: any) => {
      const venue = e._embedded?.venues?.[0]
      const image = (e.images ?? []).find((i: any) => i.ratio === '16_9' && i.width >= 600) ?? e.images?.[0]
      return {
        id: e.id,
        name: e.name,
        date: e.dates?.start?.localDate ?? null,
        time: e.dates?.start?.localTime ?? null,
        venue: venue?.name ?? null,
        city: venue?.city?.name ?? null,
        image: image?.url ?? null,
        url: e.url ?? null,
        genre: e.classifications?.[0]?.genre?.name ?? null,
      }
    })

    // Scal zrodla: dedupe po nazwie+dacie, tylko przyszle, sortuj po dacie, max 25
    const today = new Date().toISOString().split('T')[0]
    const seen = new Set<string>()
    const events = [...tmEvents, ...leagueEvents]
      .filter((e: any) => e.date && e.date >= today)
      .filter((e: any) => {
        const key = `${String(e.name).toLowerCase().slice(0, 30)}|${e.date}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 25)

    await supabase.from('big_events_cache').upsert({
      region_key: regionKey,
      payload: events,
      fetched_at: new Date().toISOString(),
    })

    return new Response(JSON.stringify({ events }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ events: [], error: String(e) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
})
