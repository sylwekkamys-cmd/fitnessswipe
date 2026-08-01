import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Wieczorny straznik passy (pg_cron 17:00 UTC): push do osob, ktorych passa
// wygasnie dzis wieczorem (trening wczoraj, dzis jeszcze nie zalogowany).
// Strata boli bardziej niz nagroda — najskuteczniejszy mechanizm powrotu.

const CRON_SECRET = Deno.env.get('CRON_SECRET')

const TEXTS: Record<string, (n: number) => string> = {
  pl: n => `Twoja passa ${n} dni wygaśnie dziś! Zalicz trening, żeby ją utrzymać 💪`,
  en: n => `Your ${n}-day streak expires today! Log a workout to keep it 💪`,
  de: n => `Deine ${n}-Tage-Serie läuft heute ab! Trag ein Training ein 💪`,
  fr: n => `Ta série de ${n} jours expire aujourd'hui ! Enregistre un entraînement 💪`,
  es: n => `¡Tu racha de ${n} días caduca hoy! Registra un entrenamiento 💪`,
  nl: n => `Je reeks van ${n} dagen verloopt vandaag! Log een training 💪`,
  bg: n => `Серията ти от ${n} дни изтича днес! Запиши тренировка 💪`,
  ro: n => `Seria ta de ${n} zile expiră azi! Înregistrează un antrenament 💪`,
  tr: n => `${n} günlük serin bugün sona eriyor! Bir antrenman kaydet 💪`,
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

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const { data: atRisk } = await supabase
      .from('profiles')
      .select('id, push_token, lang, current_streak')
      .eq('last_workout_date', yesterday)
      .gte('current_streak', 2)
      .eq('banned', false)
      .not('push_token', 'is', null)

    const messages = (atRisk ?? [])
      .filter((p: any) => p.push_token)
      .map((p: any) => {
        const textFn = TEXTS[p.lang] ?? TEXTS.en
        return {
          to: p.push_token,
          sound: 'default',
          title: '🔥 FitnessSwipe',
          body: textFn(p.current_streak),
          data: { type: 'streak_guard' },
        }
      })

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
