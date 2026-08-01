import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Nocne sprzatanie relacji (pg_cron 04:00 UTC): wygasle wpisy training_status
// zostawaly w bazie NA ZAWSZE razem ze zdjeciami/wideo w storage — z realnymi
// uzytkownikami to rosnace koszty. Kasujemy wpisy przeterminowane ponad dobe
// (doba zapasu na moderacje zgloszen) wraz z ich plikami.

const CRON_SECRET = Deno.env.get('CRON_SECRET')

serve(async (req) => {
  try {
    if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const { data: expired } = await supabase
      .from('training_status')
      .select('id, status_photo_url, video_url')
      .lt('expires_at', cutoff)
      .limit(500)

    const rows = expired ?? []
    if (rows.length === 0) {
      return new Response(JSON.stringify({ deleted: 0, files: 0 }), { headers: { 'Content-Type': 'application/json' } })
    }

    // Sciezki plikow w buckecie profile-photos (zdjecia status_* i wideo status_video_*)
    const paths: string[] = []
    for (const r of rows) {
      for (const url of [r.status_photo_url, r.video_url]) {
        if (typeof url === 'string' && url.includes('/profile-photos/')) {
          const p = url.split('/profile-photos/')[1]
          if (p) paths.push(decodeURIComponent(p))
        }
      }
    }

    let filesRemoved = 0
    for (let i = 0; i < paths.length; i += 50) {
      const batch = paths.slice(i, i + 50)
      const { data: removed, error } = await supabase.storage.from('profile-photos').remove(batch)
      if (!error) filesRemoved += (removed ?? []).length
    }

    const ids = rows.map(r => r.id)
    await supabase.from('training_status').delete().in('id', ids)

    return new Response(JSON.stringify({ deleted: ids.length, files: filesRemoved }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
