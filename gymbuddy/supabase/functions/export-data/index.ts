import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Eksport danych RODO (art. 20 - prawo do przenoszenia danych): zbiera wszystkie
// dane zalogowanego uzytkownika i wysyla je mailem w dwoch zalacznikach:
// JSON (format maszynowy wymagany przez art. 20) + HTML (wersja czytelna).
// Wolane przez klienta z wlasnym JWT (nie service-role) — dostep tylko do wlasnych danych.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary)
}

const MAIL: Record<string, { subject: string; title: string; body: string; warn: string; readable: string; sections: Record<string, string> }> = {
  pl: { subject: 'Twoje dane z FitnessSwipe (RODO)', title: 'Twoje dane z FitnessSwipe', body: 'W załącznikach znajdziesz wszystkie dane powiązane z Twoim kontem, zgodnie z prawem do przenoszenia danych (art. 20 RODO): wersję czytelną (HTML) i maszynową (JSON).', warn: 'Jeśli to nie Ty poprosiłeś(-aś) o ten eksport, zignoruj tę wiadomość i rozważ zmianę hasła.', readable: 'Eksport danych', sections: { account: 'Konto', profile: 'Profil', gdpr_consents: 'Zgody RODO', swipes_sent: 'Wysłane swipe’y', swipes_received: 'Otrzymane swipe’y', matches: 'Dopasowania', messages: 'Wiadomości', workouts: 'Treningi', workout_streaks: 'Passy treningowe', body_measurements: 'Pomiary ciała', body_goals: 'Cele sylwetkowe', training_status_history: 'Historia relacji', status_reactions_given: 'Reakcje na relacje', badges: 'Odznaki' } },
  en: { subject: 'Your FitnessSwipe data (GDPR)', title: 'Your FitnessSwipe data', body: 'Attached you will find all data linked to your account, in line with the right to data portability (Art. 20 GDPR): a readable version (HTML) and a machine-readable one (JSON).', warn: 'If you did not request this export, ignore this message and consider changing your password.', readable: 'Data export', sections: { account: 'Account', profile: 'Profile', gdpr_consents: 'GDPR consents', swipes_sent: 'Swipes sent', swipes_received: 'Swipes received', matches: 'Matches', messages: 'Messages', workouts: 'Workouts', workout_streaks: 'Workout streaks', body_measurements: 'Body measurements', body_goals: 'Body goals', training_status_history: 'Story history', status_reactions_given: 'Story reactions', badges: 'Badges' } },
  de: { subject: 'Deine FitnessSwipe-Daten (DSGVO)', title: 'Deine FitnessSwipe-Daten', body: 'Im Anhang findest du alle mit deinem Konto verknüpften Daten gemäß dem Recht auf Datenübertragbarkeit (Art. 20 DSGVO): eine lesbare Version (HTML) und eine maschinenlesbare (JSON).', warn: 'Falls du diesen Export nicht angefordert hast, ignoriere diese Nachricht und ändere ggf. dein Passwort.', readable: 'Datenexport', sections: { account: 'Konto', profile: 'Profil', gdpr_consents: 'DSGVO-Einwilligungen', swipes_sent: 'Gesendete Swipes', swipes_received: 'Erhaltene Swipes', matches: 'Matches', messages: 'Nachrichten', workouts: 'Trainings', workout_streaks: 'Trainingsserien', body_measurements: 'Körpermaße', body_goals: 'Körperziele', training_status_history: 'Story-Verlauf', status_reactions_given: 'Story-Reaktionen', badges: 'Abzeichen' } },
  fr: { subject: 'Tes données FitnessSwipe (RGPD)', title: 'Tes données FitnessSwipe', body: 'En pièces jointes, toutes les données liées à ton compte, conformément au droit à la portabilité (art. 20 RGPD) : une version lisible (HTML) et une version machine (JSON).', warn: 'Si tu n’as pas demandé cet export, ignore ce message et pense à changer ton mot de passe.', readable: 'Export de données', sections: { account: 'Compte', profile: 'Profil', gdpr_consents: 'Consentements RGPD', swipes_sent: 'Swipes envoyés', swipes_received: 'Swipes reçus', matches: 'Matchs', messages: 'Messages', workouts: 'Entraînements', workout_streaks: 'Séries d’entraînement', body_measurements: 'Mensurations', body_goals: 'Objectifs physiques', training_status_history: 'Historique des stories', status_reactions_given: 'Réactions aux stories', badges: 'Badges' } },
  es: { subject: 'Tus datos de FitnessSwipe (RGPD)', title: 'Tus datos de FitnessSwipe', body: 'Adjuntos encontrarás todos los datos vinculados a tu cuenta, conforme al derecho a la portabilidad (art. 20 RGPD): una versión legible (HTML) y otra para máquinas (JSON).', warn: 'Si no solicitaste esta exportación, ignora este mensaje y considera cambiar tu contraseña.', readable: 'Exportación de datos', sections: { account: 'Cuenta', profile: 'Perfil', gdpr_consents: 'Consentimientos RGPD', swipes_sent: 'Swipes enviados', swipes_received: 'Swipes recibidos', matches: 'Matches', messages: 'Mensajes', workouts: 'Entrenamientos', workout_streaks: 'Rachas de entrenamiento', body_measurements: 'Medidas corporales', body_goals: 'Objetivos físicos', training_status_history: 'Historial de stories', status_reactions_given: 'Reacciones a stories', badges: 'Insignias' } },
  nl: { subject: 'Je FitnessSwipe-gegevens (AVG)', title: 'Je FitnessSwipe-gegevens', body: 'In de bijlagen vind je alle gegevens die aan je account gekoppeld zijn, conform het recht op dataportabiliteit (art. 20 AVG): een leesbare versie (HTML) en een machineleesbare (JSON).', warn: 'Heb je deze export niet aangevraagd? Negeer dit bericht en overweeg je wachtwoord te wijzigen.', readable: 'Gegevensexport', sections: { account: 'Account', profile: 'Profiel', gdpr_consents: 'AVG-toestemmingen', swipes_sent: 'Verzonden swipes', swipes_received: 'Ontvangen swipes', matches: 'Matches', messages: 'Berichten', workouts: 'Trainingen', workout_streaks: 'Trainingsreeksen', body_measurements: 'Lichaamsmetingen', body_goals: 'Lichaamsdoelen', training_status_history: 'Story-geschiedenis', status_reactions_given: 'Story-reacties', badges: 'Badges' } },
  bg: { subject: 'Твоите данни от FitnessSwipe (GDPR)', title: 'Твоите данни от FitnessSwipe', body: 'В прикачените файлове ще намериш всички данни, свързани с акаунта ти, съгласно правото на преносимост (чл. 20 GDPR): четима версия (HTML) и машинна (JSON).', warn: 'Ако не си поискал(а) този експорт, игнорирай съобщението и обмисли смяна на паролата.', readable: 'Експорт на данни', sections: { account: 'Акаунт', profile: 'Профил', gdpr_consents: 'GDPR съгласия', swipes_sent: 'Изпратени суайпове', swipes_received: 'Получени суайпове', matches: 'Съвпадения', messages: 'Съобщения', workouts: 'Тренировки', workout_streaks: 'Тренировъчни серии', body_measurements: 'Телесни мерки', body_goals: 'Цели за тялото', training_status_history: 'История на сторита', status_reactions_given: 'Реакции на сторита', badges: 'Значки' } },
  ro: { subject: 'Datele tale FitnessSwipe (GDPR)', title: 'Datele tale FitnessSwipe', body: 'În atașamente găsești toate datele legate de contul tău, conform dreptului la portabilitate (art. 20 GDPR): o versiune lizibilă (HTML) și una pentru mașini (JSON).', warn: 'Dacă nu ai cerut acest export, ignoră mesajul și ia în calcul schimbarea parolei.', readable: 'Export de date', sections: { account: 'Cont', profile: 'Profil', gdpr_consents: 'Consimțăminte GDPR', swipes_sent: 'Swipe-uri trimise', swipes_received: 'Swipe-uri primite', matches: 'Potriviri', messages: 'Mesaje', workouts: 'Antrenamente', workout_streaks: 'Serii de antrenament', body_measurements: 'Măsurători corporale', body_goals: 'Obiective fizice', training_status_history: 'Istoric story-uri', status_reactions_given: 'Reacții la story-uri', badges: 'Insigne' } },
  tr: { subject: 'FitnessSwipe verilerin (GDPR)', title: 'FitnessSwipe verilerin', body: 'Eklerde, veri taşınabilirliği hakkı (GDPR md. 20) uyarınca hesabınla ilişkili tüm veriler var: okunabilir sürüm (HTML) ve makine sürümü (JSON).', warn: 'Bu dışa aktarmayı sen istemediysen bu mesajı yok say ve şifreni değiştirmeyi düşün.', readable: 'Veri dışa aktarımı', sections: { account: 'Hesap', profile: 'Profil', gdpr_consents: 'GDPR onayları', swipes_sent: 'Gönderilen kaydırmalar', swipes_received: 'Alınan kaydırmalar', matches: 'Eşleşmeler', messages: 'Mesajlar', workouts: 'Antrenmanlar', workout_streaks: 'Antrenman serileri', body_measurements: 'Vücut ölçüleri', body_goals: 'Vücut hedefleri', training_status_history: 'Hikaye geçmişi', status_reactions_given: 'Hikaye tepkileri', badges: 'Rozetler' } },
}

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object') return esc(JSON.stringify(v))
  return esc(v)
}

// Czytelny HTML: profil jako lista klucz-wartosc, listy rekordow jako tabele
function buildReadableHtml(payload: Record<string, unknown>, t: (typeof MAIL)['en']): string {
  let out = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0d1b2e;color:#fff;padding:24px;line-height:1.5}
    h1{color:#94e336}h2{color:#94e336;margin-top:32px;font-size:18px}
    table{border-collapse:collapse;width:100%;font-size:12.5px;margin-top:8px}
    th,td{border:1px solid rgba(255,255,255,0.15);padding:5px 8px;text-align:left;vertical-align:top;word-break:break-word}
    th{background:#1a2a44;color:#94e336}
    .kv td:first-child{color:#94e336;white-space:nowrap}
    .empty{color:rgba(255,255,255,0.4)}
  </style></head><body><h1>FitnessSwipe — ${esc(t.readable)}</h1>`

  for (const [key, value] of Object.entries(payload)) {
    if (key === 'exported_at') continue
    const label = t.sections[key] ?? key
    out += `<h2>${esc(label)}</h2>`
    if (Array.isArray(value)) {
      if (value.length === 0) { out += `<p class="empty">—</p>`; continue }
      const cols = Object.keys(value[0] as Record<string, unknown>)
      out += `<table><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>`
      for (const row of value as Record<string, unknown>[]) {
        out += `<tr>${cols.map(c => `<td>${fmtVal(row[c])}</td>`).join('')}</tr>`
      }
      out += `</table>`
    } else if (value && typeof value === 'object') {
      out += `<table class="kv">`
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out += `<tr><td>${esc(k)}</td><td>${fmtVal(v)}</td></tr>`
      }
      out += `</table>`
    } else {
      out += `<p>${fmtVal(value)}</p>`
    }
  }
  out += `<p style="margin-top:32px;color:rgba(255,255,255,0.4);font-size:12px">${esc(String(payload.exported_at ?? ''))}</p></body></html>`
  return out
}

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user } } = await supabase.auth.getUser(jwt)
    if (!user) return json({ error: 'unauthorized' }, 401)
    if (!user.email) return json({ error: 'no_email' }, 400)

    const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle()
    if (!profile) return json({ error: 'no_profile' }, 404)
    const pid = profile.id

    const [
      gdpr, swipesSent, swipesReceived, matches, workouts, streaks,
      bodyMeasurements, bodyGoals, trainingStatus, reactions, badges,
    ] = await Promise.all([
      supabase.from('gdpr_consents').select('*').eq('user_id', user.id),
      supabase.from('swipes').select('*').eq('swiper_id', pid),
      supabase.from('swipes').select('*').eq('swiped_id', pid),
      supabase.from('matches').select('*').or(`profile_a_id.eq.${pid},profile_b_id.eq.${pid}`),
      supabase.from('workouts').select('*').or(`creator_id.eq.${pid},partner_id.eq.${pid}`),
      supabase.from('workout_streaks').select('*').eq('profile_id', pid),
      supabase.from('body_measurements').select('*').eq('profile_id', pid),
      supabase.from('body_goals').select('*').eq('profile_id', pid),
      supabase.from('training_status').select('*').eq('profile_id', pid),
      supabase.from('status_reactions').select('*').eq('reactor_id', pid),
      supabase.from('profile_badges').select('*').eq('profile_id', pid),
    ])

    // Wiadomosci: tylko z rozmow, w ktorych uczestniczy (dwustronne, jak w apce)
    const matchIds = (matches.data ?? []).map((m: any) => m.id)
    const messages = matchIds.length
      ? await supabase.from('messages').select('*').in('match_id', matchIds)
      : { data: [] }

    const exportPayload = {
      exported_at: new Date().toISOString(),
      account: { email: user.email, created_at: user.created_at },
      profile,
      gdpr_consents: gdpr.data ?? [],
      swipes_sent: swipesSent.data ?? [],
      swipes_received: swipesReceived.data ?? [],
      matches: matches.data ?? [],
      messages: messages.data ?? [],
      workouts: workouts.data ?? [],
      workout_streaks: streaks.data ?? [],
      body_measurements: bodyMeasurements.data ?? [],
      body_goals: bodyGoals.data ?? [],
      training_status_history: trainingStatus.data ?? [],
      status_reactions_given: reactions.data ?? [],
      badges: badges.data ?? [],
    }

    const t = MAIL[profile.lang] ?? MAIL.en
    const jsonStr = JSON.stringify(exportPayload, null, 2)
    const readableHtml = buildReadableHtml(exportPayload, t)

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'FitnessSwipe <noreply@fitnessswipe.app>',
        to: user.email,
        subject: t.subject,
        html: `
          <h2>${t.title}</h2>
          <p>${t.body}</p>
          <p>${t.warn}</p>
        `,
        attachments: [
          { filename: 'fitnessswipe-data.html', content: toBase64(readableHtml) },
          { filename: 'fitnessswipe-data.json', content: toBase64(jsonStr) },
        ],
      }),
    })

    if (!emailRes.ok) {
      const errText = await emailRes.text()
      return json({ error: 'email_failed', details: errText }, 502)
    }

    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
