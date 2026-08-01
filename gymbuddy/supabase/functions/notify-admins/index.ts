import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Push do adminow o nowym zgloszeniu (wymog Apple 1.2: reakcja na zgloszenia UGC w 24h).
// Wolane przez klienta zaraz po zapisaniu zgloszenia; wymaga zalogowanego uzytkownika.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user } } = await admin.auth.getUser(jwt)
    if (!user) return json({ error: 'unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 80) : ''
    // kind: 'report' (zgloszenie tresci) | 'cert' (certyfikat trenera do weryfikacji)
    const isCert = body?.kind === 'cert'

    const { data: admins } = await admin.from('admin_users').select('user_id')
    const adminIds = (admins ?? []).map((a: any) => a.user_id)
    if (adminIds.length === 0) return json({ ok: true, sent: 0 })

    const { data: profiles } = await admin
      .from('profiles')
      .select('push_token')
      .in('user_id', adminIds)
      .not('push_token', 'is', null)

    const messages = (profiles ?? [])
      .filter((p: any) => p.push_token)
      .map((p: any) => ({
        to: p.push_token,
        sound: 'default',
        title: isCert ? '📄 Certyfikat trenera' : '🚨 Nowe zgłoszenie',
        body: isCert
          ? 'Nowy certyfikat czeka na weryfikację w panelu moderacji'
          : reason ? `Powód: ${reason}` : 'Sprawdź panel moderacji',
        data: { type: isCert ? 'admin_cert' : 'admin_report' },
      }))
    if (messages.length === 0) return json({ ok: true, sent: 0 })

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    })

    return json({ ok: true, sent: messages.length })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
