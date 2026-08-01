import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CRON_SECRET = Deno.env.get('CRON_SECRET')

// Teksty digestu w jezyku odbiorcy
const DIGEST_TEXTS: Record<string, (n: number) => string> = {
  pl: n => `Dziś ${n} ${n === 1 ? 'osoba widziała' : n < 5 ? 'osoby widziały' : 'osób widziało'} Twój profil 👀`,
  en: n => `${n} ${n === 1 ? 'person' : 'people'} viewed your profile today 👀`,
  de: n => `${n} ${n === 1 ? 'Person hat' : 'Personen haben'} heute dein Profil angesehen 👀`,
  fr: n => `${n} ${n === 1 ? 'personne a vu' : 'personnes ont vu'} ton profil aujourd'hui 👀`,
  es: n => `${n} ${n === 1 ? 'persona vio' : 'personas vieron'} tu perfil hoy 👀`,
  nl: n => `${n} ${n === 1 ? 'persoon bekeek' : 'mensen bekeken'} vandaag je profiel 👀`,
  bg: n => `Днес ${n} ${n === 1 ? 'човек видя' : 'души видяха'} профила ти 👀`,
  ro: n => `${n} ${n === 1 ? 'persoană ți-a văzut' : 'persoane ți-au văzut'} profilul azi 👀`,
  tr: n => `Bugün ${n} kişi profilini görüntüledi 👀`,
}

// Poniedzialkowy raport dla trenerow: wyswietlenia wizytowki + nowi obserwujacy (7 dni)
const TRAINER_TEXTS: Record<string, (v: number, f: number) => string> = {
  pl: (v, f) => `Twoje Studio w tym tygodniu: ${v} wyświetleń wizytówki${f > 0 ? `, +${f} obserwujących` : ''} 🥇`,
  en: (v, f) => `Your Studio this week: ${v} card views${f > 0 ? `, +${f} followers` : ''} 🥇`,
  de: (v, f) => `Dein Studio diese Woche: ${v} Kartenaufrufe${f > 0 ? `, +${f} Follower` : ''} 🥇`,
  fr: (v, f) => `Ton Studio cette semaine : ${v} vues de ta carte${f > 0 ? `, +${f} abonnés` : ''} 🥇`,
  es: (v, f) => `Tu Studio esta semana: ${v} vistas de tu tarjeta${f > 0 ? `, +${f} seguidores` : ''} 🥇`,
  nl: (v, f) => `Jouw Studio deze week: ${v} kaartweergaven${f > 0 ? `, +${f} volgers` : ''} 🥇`,
  bg: (v, f) => `Твоето Студио тази седмица: ${v} прегледа на картата${f > 0 ? `, +${f} последователи` : ''} 🥇`,
  ro: (v, f) => `Studioul tău săptămâna asta: ${v} vizualizări ale cardului${f > 0 ? `, +${f} urmăritori` : ''} 🥇`,
  tr: (v, f) => `Stüdyon bu hafta: ${v} kart görüntülenmesi${f > 0 ? `, +${f} takipçi` : ''} 🥇`,
}

serve(async (req) => {
  try {
    if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Dzisiejsze wyswietlenia per ogladany profil
    const today = new Date().toISOString().split('T')[0]
    const { data: rows, error } = await supabase
      .from('profile_view_daily')
      .select('viewed_id, count')
      .eq('day', today)
      .gt('count', 0)
    if (error) throw error

    const messages: any[] = []
    if (rows && rows.length > 0) {
      const ids = rows.map(r => r.viewed_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, push_token, lang, is_premium')
        .in('id', ids)
        .not('push_token', 'is', null)

      for (const p of profiles ?? []) {
        const count = rows.find(r => r.viewed_id === p.id)?.count ?? 0
        if (count === 0 || !p.push_token) continue
        const textFn = DIGEST_TEXTS[p.lang] ?? DIGEST_TEXTS.en
        messages.push({
          to: p.push_token,
          sound: 'default',
          title: 'FitnessSwipe',
          body: textFn(count),
          data: { type: 'view_digest' },
        })
      }
    }

    // W poniedzialki: tygodniowy raport Studia dla trenerow
    if (new Date().getUTCDay() === 1) {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      const weekAgoDate = weekAgo.split('T')[0]
      const { data: trainers } = await supabase
        .from('profiles')
        .select('id, push_token, lang')
        .eq('is_trainer', true)
        .not('push_token', 'is', null)
      for (const tr of trainers ?? []) {
        const { count: views } = await supabase
          .from('trainer_card_views')
          .select('*', { count: 'exact', head: true })
          .eq('trainer_id', tr.id)
          .gte('view_date', weekAgoDate)
        const { count: followers } = await supabase
          .from('trainer_followers')
          .select('*', { count: 'exact', head: true })
          .eq('trainer_id', tr.id)
          .gte('created_at', weekAgo)
        if ((views ?? 0) === 0 && (followers ?? 0) === 0) continue
        const textFn = TRAINER_TEXTS[tr.lang] ?? TRAINER_TEXTS.en
        messages.push({
          to: tr.push_token,
          sound: 'default',
          title: 'FitnessSwipe Studio',
          body: textFn(views ?? 0, followers ?? 0),
          data: { type: 'trainer_weekly' },
        })
      }
    }

    // Expo przyjmuje partie po max 100 wiadomosci
    let sent = 0
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100)
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      })
      sent += batch.length
    }

    return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
