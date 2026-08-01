import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Akcje moderacyjne (panel admina w aplikacji). Caly przywilej siedzi tutaj
// (service role) — klient nie ma zadnych podwyzszonych uprawnien w RLS.
// Kazde wywolanie najpierw weryfikuje, ze JWT nalezy do osoby z admin_users.

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

    const { data: adm } = await admin.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
    if (!adm) return json({ error: 'forbidden' }, 403)

    const body = await req.json()
    const action = body?.action as string

    if (action === 'list') {
      const { data: reports } = await admin
        .from('reported_users')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      const rows = reports ?? []
      const ids = [...new Set(rows.flatMap((r: any) => [r.reporter_id, r.reported_id]).filter(Boolean))]
      const { data: profiles } = ids.length
        ? await admin.from('profiles').select('id, name, photo_urls, banned').in('id', ids)
        : { data: [] }
      const byId: Record<string, any> = {}
      ;(profiles ?? []).forEach((p: any) => { byId[p.id] = p })
      const reportedIds = [...new Set(rows.map((r: any) => r.reported_id).filter(Boolean))]
      const { data: statuses } = reportedIds.length
        ? await admin.from('training_status')
            .select('profile_id, status_text, status_photo_url, video_url, expires_at')
            .in('profile_id', reportedIds)
            .gt('expires_at', new Date().toISOString())
        : { data: [] }
      const statusBy: Record<string, any> = {}
      ;(statuses ?? []).forEach((s: any) => { statusBy[s.profile_id] = s })
      return json({
        reports: rows.map((r: any) => ({
          ...r,
          reporter: byId[r.reporter_id] ?? null,
          reported: byId[r.reported_id] ?? null,
          reported_status: statusBy[r.reported_id] ?? null,
        })),
      })
    }

    // Certyfikaty trenerow: lista oczekujacych + zatwierdzenie/odrzucenie z pushem do trenera
    if (action === 'cert_list') {
      const { data: pend } = await admin
        .from('trainer_profiles')
        .select('profile_id, certificate_url, cert_status')
        .eq('cert_status', 'pending')
      const ids = (pend ?? []).map((r: any) => r.profile_id)
      const { data: profs } = ids.length
        ? await admin.from('profiles').select('id, name, photo_urls').in('id', ids)
        : { data: [] }
      const byId: Record<string, any> = {}
      ;(profs ?? []).forEach((p: any) => { byId[p.id] = p })
      return json({ certs: (pend ?? []).map((r: any) => ({ ...r, profile: byId[r.profile_id] ?? null })) })
    }

    if (action === 'cert_approve' || action === 'cert_reject') {
      const approved = action === 'cert_approve'
      const profileId = body.profileId as string | undefined
      if (!profileId) return json({ error: 'no profile' }, 400)
      await admin.from('trainer_profiles')
        .update({ cert_status: approved ? 'approved' : 'rejected' })
        .eq('profile_id', profileId)
      try {
        const { data: prof } = await admin.from('profiles').select('push_token, lang').eq('id', profileId).single()
        if (prof?.push_token) {
          const TXT: Record<string, string> = {
            pl: approved ? 'Twój certyfikat został zatwierdzony — masz złoty znaczek zweryfikowanego trenera!' : 'Twój certyfikat został odrzucony. Wgraj czytelniejszy dokument.',
            en: approved ? 'Your certificate was approved — you now have the verified trainer badge!' : 'Your certificate was rejected. Please upload a clearer document.',
            de: approved ? 'Dein Zertifikat wurde bestätigt — du hast jetzt das Verifiziert-Abzeichen!' : 'Dein Zertifikat wurde abgelehnt. Lade bitte ein besser lesbares Dokument hoch.',
            fr: approved ? 'Ton certificat a été approuvé — tu as le badge de coach vérifié !' : 'Ton certificat a été refusé. Télécharge un document plus lisible.',
            es: approved ? '¡Tu certificado fue aprobado — ya tienes la insignia de entrenador verificado!' : 'Tu certificado fue rechazado. Sube un documento más legible.',
            nl: approved ? 'Je certificaat is goedgekeurd — je hebt nu de geverifieerde-trainer badge!' : 'Je certificaat is afgekeurd. Upload een duidelijker document.',
            bg: approved ? 'Сертификатът ти беше одобрен — вече имаш значката на верифициран треньор!' : 'Сертификатът ти беше отхвърлен. Качи по-четлив документ.',
            ro: approved ? 'Certificatul tău a fost aprobat — ai acum insigna de antrenor verificat!' : 'Certificatul tău a fost respins. Încarcă un document mai lizibil.',
            tr: approved ? 'Sertifikan onaylandı — artık doğrulanmış antrenör rozetin var!' : 'Sertifikan reddedildi. Daha okunaklı bir belge yükle.',
          }
          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([{
              to: prof.push_token,
              sound: 'default',
              title: approved ? '🎓 FitnessSwipe Studio' : 'FitnessSwipe Studio',
              body: TXT[prof.lang] ?? TXT.en,
              data: { type: 'cert' },
            }]),
          })
        }
      } catch (_e) { /* push jest bonusem, status i tak zapisany */ }
      return json({ ok: true })
    }

    if (action === 'dismiss') {
      await admin.from('reported_users')
        .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
        .eq('id', body.reportId)
      return json({ ok: true })
    }

    if (action === 'delete_content') {
      // Z panelu (reportId) albo bezposrednio z talii swipe (profileId)
      let targetId = body.profileId as string | undefined
      if (body.reportId) {
        const { data: report } = await admin.from('reported_users').select('reported_id').eq('id', body.reportId).single()
        if (!report) return json({ error: 'report not found' }, 404)
        targetId = report.reported_id
      }
      if (!targetId) return json({ error: 'no profile' }, 400)
      // Relacja (zdjecie/wideo/tekst) znika wraz z reakcjami i widokami
      await admin.from('training_status').delete().eq('profile_id', targetId)
      await admin.from('status_reactions').delete().eq('status_profile_id', targetId)
      await admin.from('status_views').delete().eq('status_profile_id', targetId)
      if (body.reportId) {
        await admin.from('reported_users')
          .update({ status: 'content_removed', resolved_at: new Date().toISOString() })
          .eq('id', body.reportId)
      }
      return json({ ok: true })
    }

    if (action === 'ban' || action === 'unban') {
      let profileId = body.profileId as string | undefined
      if (!profileId && body.reportId) {
        const { data: report } = await admin.from('reported_users').select('reported_id').eq('id', body.reportId).single()
        profileId = report?.reported_id
      }
      if (!profileId) return json({ error: 'no profile' }, 400)

      const banned = action === 'ban'
      await admin.from('profiles').update({ banned }).eq('id', profileId)
      if (banned) {
        await admin.from('training_status').delete().eq('profile_id', profileId)
        await admin.from('status_reactions').delete().eq('status_profile_id', profileId)
        await admin.from('status_views').delete().eq('status_profile_id', profileId)
      }
      // Ban na poziomie konta auth: zbanowany nie zaloguje sie ponownie,
      // a istniejaca sesja wygasa z refresh tokenem (max ~1h)
      try {
        const { data: prof } = await admin.from('profiles').select('user_id').eq('id', profileId).single()
        if (prof?.user_id) {
          await admin.auth.admin.updateUserById(prof.user_id, { ban_duration: banned ? '87600h' : 'none' } as any)
        }
      } catch (_e) { /* flaga banned w profilu i tak dziala */ }
      if (body.reportId) {
        await admin.from('reported_users')
          .update({ status: banned ? 'banned' : 'pending', resolved_at: banned ? new Date().toISOString() : null })
          .eq('id', body.reportId)
      }
      return json({ ok: true })
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
