import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const OPENAI_KEY = Deno.env.get('OPENAI_KEY')

// Proxy do OpenAI - klucz API zostaje na serwerze, aplikacja nigdy go nie widzi.
// Prompty budowane sa tutaj (nie w aplikacji), zeby nikt nie uzywal funkcji
// jako ogolnego proxy do OpenAI.
serve(async (req) => {
  try {
    const body = await req.json()

    let messages: unknown
    let maxTokens = 150
    let temperature = 1

    if (body.action === 'generate-bio') {
      const { name, goals, city, langName } = body
      const prompt = `Write a short motivating bio (max 120 words) for a gym partner app user. Name: ${name}. Goals: ${goals}. City: ${city || 'unknown'}. Write in ${langName} language. First person, energetic. Only bio, no extra text.`
      messages = [{ role: 'user', content: prompt }]
      maxTokens = 200
      temperature = 0.8
    } else if (body.action === 'verify-photo') {
      // Dwa zdjecia: [1] zywe selfie weryfikacyjne, [2] istniejace zdjecie profilowe.
      // Bez porownania twarzy weryfikacja potwierdzalaby tylko "zywa osoba", nie
      // "ta sama osoba co na profilu" — referenceImageBase64 domyka te luke.
      const { gestureLabel, imageBase64, referenceImageBase64 } = body
      const prompt = referenceImageBase64
        ? `You are a profile verification system for a fitness app.
      The FIRST photo is a live verification selfie just taken. The SECOND photo is the user's existing profile photo.
      The user needs to verify their identity by making a specific gesture: ${gestureLabel}.
      Look at both photos and determine:
      1. Is a human face clearly visible in the first (verification) photo?
      2. Is the person in the first photo making the correct gesture: ${gestureLabel}?
      3. Does the first photo appear to be a live selfie (not a photo of a photo or screen)?
      4. Is the person in the first photo the SAME person as in the second (profile) photo?
      All four conditions must be true for verification to pass.
      Respond with JSON only: {"face_visible": true/false, "gesture_correct": true/false, "is_real_person": true/false, "same_person": true/false, "confidence": 0-100}`
        : `You are a profile verification system for a fitness app.
      The user needs to verify their identity by making a specific gesture: ${gestureLabel}.
      Look at the verification photo and determine:
      1. Is a human face clearly visible in the photo?
      2. Is the person making the correct gesture: ${gestureLabel}?
      3. Does this appear to be a live selfie (not a photo of a photo or screen)?
      All three conditions must be true for verification to pass.
      Respond with JSON only: {"face_visible": true/false, "gesture_correct": true/false, "is_real_person": true/false, "confidence": 0-100}`
      const content: any[] = [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
      ]
      if (referenceImageBase64) content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${referenceImageBase64}` } })
      messages = [{ role: 'user', content }]
      maxTokens = 150
    } else if (body.action === 'parse-challenge') {
      const { text } = body
      const prompt = `Parse this fitness challenge description into JSON. Text: "${text}"
Goal types: weight_loss, distance_running, distance_cycling, padel_sessions, pickleball_sessions, hyrox, walking_steps, cold_exposure, custom.
Units should be short, in the same language as the text (e.g. kg, km, steps/kroki, sessions/sesje, workouts/treningi).
Respond with JSON only, no markdown: {"goal_type": "...", "goal_value": number, "goal_unit": "...", "duration_days": number, "title": "short motivating title in the same language as the text"}`
      messages = [{ role: 'user', content: prompt }]
      maxTokens = 150
      temperature = 0
    } else if (body.action === 'parse-event') {
      const { text, today } = body
      const prompt = `Parse this sports event description into JSON. Text: "${text}"
Today's date is ${today} (ISO, local). Resolve relative dates like "tomorrow"/"jutro"/"w sobotę" against it.
Sport types: running, cycling, padel, pickleball, hyrox, football, basketball, tennis, swimming, other.
Respond with JSON only, no markdown: {"sport_type": "...", "event_date": "YYYY-MM-DD", "event_time": "HH:MM", "venue_name": "..." (empty string if not mentioned), "title": "short title in the same language as the text"}`
      messages = [{ role: 'user', content: prompt }]
      maxTokens = 150
      temperature = 0
    } else if (body.action === 'icebreakers') {
      const { myName, myGoals, otherName, otherGoals, sharedGym, city, langName } = body
      const prompt = `Two people matched on a gym partner app and haven't talked yet.
Me: ${myName}, goals: ${myGoals || 'unknown'}. Them: ${otherName}, goals: ${otherGoals || 'unknown'}.
${sharedGym ? `They train at the same gym: ${sharedGym}.` : ''} City: ${city || 'unknown'}.
Write 3 short, casual opening messages (max 15 words each) I could send to start the conversation.
They must reference something concrete (shared goal, gym, sport) and suggest training together. No emojis overload (max 1 per message). Write in ${langName} language.
Respond with JSON only, no markdown: {"openers": ["...", "...", "..."]}`
      messages = [{ role: 'user', content: prompt }]
      maxTokens = 200
      temperature = 0.9
    } else {
      return new Response(JSON.stringify({ error: 'unknown_action' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: maxTokens, temperature }),
    })
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content ?? null

    return new Response(JSON.stringify({ content }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
