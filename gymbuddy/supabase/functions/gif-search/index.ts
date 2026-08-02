import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Wyszukiwarka GIF-ow / naklejek Giphy (naklejki = osobne API Giphy, animowane,
// przezroczyste tlo) dla czatu i relacji. Klucz GIPHY_KEY zyje tylko tutaj.
// Darmowy klucz = 100 zapytan/h, wiec agresywny cache w gif_cache:
// trendy 1 h, frazy 24 h — wspolne dla wszystkich uzytkownikow.

const TRENDING_TTL_MS = 60 * 60 * 1000
const SEARCH_TTL_MS = 24 * 60 * 60 * 1000

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  try {
    const key = Deno.env.get('GIPHY_KEY')
    if (!key) return json({ gifs: [], error: 'no_key' })

    const body = await req.json().catch(() => ({}))
    const q = typeof body?.q === 'string' ? body.q.trim().toLowerCase().slice(0, 60) : ''
    const lang = typeof body?.lang === 'string' ? body.lang.slice(0, 2) : 'en'
    // stickers = osobne API Giphy: animowane, przezroczyste tlo (do naklejek na relacji)
    const kind = body?.mode === 'stickers' ? 'stickers' : 'gifs'

    // Frazy cache'ujemy per jezyk i per rodzaj (gifs/stickers maja osobne wyniki)
    const cacheKey = `${kind}:${q ? `${lang}:${q}` : ':trending'}`
    const ttl = q ? SEARCH_TTL_MS : TRENDING_TTL_MS

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: cached } = await supabase.from('gif_cache').select('*').eq('term', cacheKey).maybeSingle()
    if (cached && Date.now() - new Date(cached.updated_at).getTime() < ttl) {
      return json({ gifs: cached.gifs, cached: true })
    }

    const url = q
      ? `https://api.giphy.com/v1/${kind}/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=24&rating=pg-13&lang=${lang}`
      : `https://api.giphy.com/v1/${kind}/trending?api_key=${key}&limit=24&rating=pg-13`

    const res = await fetch(url)
    if (!res.ok) {
      // Limit/awaria Giphy: lepszy przeterminowany cache niz nic
      if (cached) return json({ gifs: cached.gifs, stale: true })
      return json({ gifs: [], error: `giphy_${res.status}` })
    }
    const data = await res.json()
    const gifs = (data.data ?? []).map((g: any) => ({
      id: g.id,
      // fixed_width (~200 px) do siatki, fixed_height do wyslania — male pliki
      preview: g.images?.fixed_width?.url ?? g.images?.original?.url,
      url: g.images?.fixed_height?.url ?? g.images?.original?.url,
    })).filter((g: any) => g.preview && g.url)

    if (gifs.length > 0) {
      await supabase.from('gif_cache').upsert({ term: cacheKey, gifs, updated_at: new Date().toISOString() })
    }
    return json({ gifs })
  } catch (e) {
    return json({ gifs: [], error: String(e) })
  }
})
