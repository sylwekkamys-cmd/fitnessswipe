import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const ADMIN_EMAIL = 'support.fitnessswipe@gmail.com'

serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record

    const reporterId = record.reporter_id
    const reportedId = record.reported_id
    const reason = record.reason

    const emailBody = `
      <h2>New Report Received</h2>
      <p><strong>Reporter Profile ID:</strong> ${reporterId}</p>
      <p><strong>Reported Profile ID:</strong> ${reportedId}</p>
      <p><strong>Reason:</strong> ${reason}</p>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      <p>Please review this in the Supabase Dashboard under the reported_users table.</p>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'FitnessSwipe Reports <noreply@fitnessswipe.app>',
        to: ADMIN_EMAIL,
        subject: '🚨 New Profile Report - FitnessSwipe',
        html: emailBody,
      }),
    })

    const data = await res.json()

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
