import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'
import { AppState } from 'react-native'

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl!
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.supabaseAnonKey!

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh()
  else supabase.auth.stopAutoRefresh()
})

// ============================================================
// Typy
// ============================================================

export type Profile = {
  id: string
  user_id: string
  name: string
  bio: string
  goals: string[]
  gym_name: string
  city: string
  schedule: string[]
  is_premium: boolean
  daily_swipes_left: number
  swipe_reset_date: string
  photo_urls: string[]
  lang: string
  created_at: string
  updated_at: string
}

export type Match = {
  id: string
  profile_a_id: string
  profile_b_id: string
  matched_at: string
}

export type Message = {
  id: string
  match_id: string
  sender_id: string
  content: string
  sent_at: string
  read_at: string | null
  reply_to_id?: string | null
  deleted_at?: string | null
  image_url?: string | null
  audio_url?: string | null
  audio_duration?: number | null
  edited_at?: string | null
  story_reply?: boolean | null
  location_lat?: number | null
  location_lng?: number | null
  location_name?: string | null
}

// ============================================================
// Auth / Profile
// ============================================================

export async function getMyProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('*').eq('user_id', user.id).single()
  return data
}

// ============================================================
// Candidates / Swipe
// ============================================================

export async function getCandidates(
  myProfileId: string,
  filterGender: string = '',
  filterMinAge: number = 0,
  filterMaxAge: number = 0,
  filterRadius: number = 50,
  filterFitnessLevel: string = '',
  filterMinExp: number = 0,
  filterMaxExp: number = 0,
  filterGoals: string[] = [],
  filterSchedule: string[] = [],
  filterIntensity: string = '',
  filterSpotter: boolean = false,
  filterVerifiedOnly: boolean = false
): Promise<Profile[]> {
  const { data: me } = await supabase
    .from('profiles').select('looking_for, latitude, longitude').eq('id', myProfileId).single()

  // Jesli uzytkownik explicit wybral 'any' w ustawieniach - pokaz wszystkich, ignorujac looking_for
  // Jesli filterGender jest pusty (nigdy nie ustawiano filtra) - uzyj looking_for z profilu jako domyslnej preferencji
  // Jesli filterGender to konkretna plec (male/female/other) - uzyj jej
  let genderFilter = ''
  if (filterGender === 'any') {
    genderFilter = ''
  } else if (filterGender) {
    genderFilter = filterGender
  } else if ((me as any)?.looking_for && (me as any)?.looking_for !== 'any') {
    genderFilter = (me as any)?.looking_for
  }

  const { data, error } = await supabase.rpc('get_candidates_nearby', {
    my_profile_id: myProfileId,
    my_lat: (me as any)?.latitude ?? 0,
    my_lng: (me as any)?.longitude ?? 0,
    radius_km: filterRadius,
    gender_filter: genderFilter,
    min_age: filterMinAge,
    max_age: filterMaxAge,
    fitness_filter: filterFitnessLevel,
    min_exp: filterMinExp,
    max_exp: filterMaxExp,
  })

  if (error) {
    console.log('getCandidates error:', error)
    return []
  }

  let results = data ?? []

  // Filtruj po celach treningowych (dowolny wspolny cel wystarczy)
  if (filterGoals.length > 0) {
    results = results.filter((p: any) =>
      Array.isArray(p.goals) && p.goals.some((g: string) => filterGoals.includes(g))
    )
  }

  // Filtruj po porze treningu (dowolna wspolna pora wystarczy)
  if (filterSchedule.length > 0) {
    results = results.filter((p: any) =>
      Array.isArray(p.schedule) && p.schedule.some((s: string) => filterSchedule.includes(s))
    )
  }

  // Filtruj po intensywnosci treningu
  if (filterIntensity) {
    results = results.filter((p: any) => p.training_intensity === filterIntensity)
  }

  // Tylko osoby szukajace asekuracji
  if (filterSpotter) {
    results = results.filter((p: any) => p.looking_for_spotter === true)
  }

  // Tylko profile ze zweryfikowanym zdjeciem (AI)
  if (filterVerifiedOnly) {
    results = results.filter((p: any) => p.is_verified === true)
  }

  return results
}

export async function doSwipe(
  swiperId: string,
  swipedId: string,
  direction: 'left' | 'right'
): Promise<{ matched: boolean; matchId?: string }> {
  // Upsert: ponowne polubienie osoby juz kiedys swipe'owanej (np. z wyswietlen
  // profilu) nadpisuje stary kierunek zamiast wywalac sie na unikalnosci pary
  const { error } = await supabase.from('swipes').upsert({
    swiper_id: swiperId, swiped_id: swipedId, direction,
  }, { onConflict: 'swiper_id,swiped_id' })
  if (error) throw error

  if (direction === 'right') {
    // Wzajemnosc sprawdza RPC security definer (get_match_for_pair) — niezalezne
    // od RLS. Wczesniej odczyt cudzego swipe'a przez klienta zwracal pusto (RLS
    // pozwala czytac tylko wlasne swipe'y) i popup matcha nigdy sie nie pokazywal.
    const { data: matchId } = await supabase.rpc('get_match_for_pair', { p_a: swiperId, p_b: swipedId })
    const match = matchId ? { id: matchId as string } : null
    if (match) {
      // Powiadom obie strony o nowym matchu
      const { data: swiperProfile } = await supabase.from('profiles').select('name').eq('id', swiperId).single()
      const { data: swipedProfile } = await supabase.from('profiles').select('name').eq('id', swipedId).single()
      const { notifyProfile } = await import('./notifications')
      notifyProfile(swipedId, '🤝 New Match!', `You matched with ${swiperProfile?.name ?? 'someone'}!`, { type: 'match', matchId: match.id })
      notifyProfile(swiperId, '🤝 New Match!', `You matched with ${swipedProfile?.name ?? 'someone'}!`, { type: 'match', matchId: match.id })
      return { matched: true, matchId: match.id }
    } else {
      // Powiadom o polubieniu (widoczne tylko dla Premium w aplikacji, ale wysylamy zawsze - filtr jest w UI)
      const { data: swiperProfile } = await supabase.from('profiles').select('name').eq('id', swiperId).single()
      const { notifyProfile } = await import('./notifications')
      notifyProfile(swipedId, '🔥 Someone liked you!', `${swiperProfile?.name ?? 'Someone'} liked your profile`, { type: 'like' })
    }
  }
  return { matched: false }
}

export async function decrementSwipes(profileId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles').select('daily_swipes_left, is_premium, swipe_reset_date').eq('id', profileId).single()
  if (!profile) return false
  const today = new Date().toISOString().split('T')[0]
  if ((profile as any).swipe_reset_date < today && !(profile as any).is_premium) {
    await supabase.from('profiles').update({ daily_swipes_left: 20, swipe_reset_date: today }).eq('id', profileId)
    return true
  }
  if (!(profile as any).is_premium && (profile as any).daily_swipes_left <= 0) return false
  if (!(profile as any).is_premium) {
    await supabase.from('profiles').update({ daily_swipes_left: (profile as any).daily_swipes_left - 1 }).eq('id', profileId)
  }
  return true
}

// ============================================================
// Messages / Chat
// ============================================================

export function subscribeToMessages(
  matchId: string,
  onMessage: (msg: Message) => void,
  onUpdate?: (msg: Message) => void
) {
  return supabase
    .channel(`messages:${matchId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
      payload => onMessage(payload.new as Message))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
      payload => onUpdate?.(payload.new as Message))
    .subscribe()
}

export async function markMessagesAsRead(matchId: string, myProfileId: string): Promise<void> {
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('match_id', matchId)
    .neq('sender_id', myProfileId)
    .is('read_at', null)
}

export async function getUnreadCounts(myProfileId: string): Promise<Record<string, number>> {
  const { data: matches } = await supabase
    .from('matches').select('id')
    .or(`profile_a_id.eq.${myProfileId},profile_b_id.eq.${myProfileId}`)
  if (!matches || matches.length === 0) return {}
  const matchIds = matches.map((m: any) => m.id)
  const { data } = await supabase
    .from('messages').select('match_id')
    .in('match_id', matchIds)
    .neq('sender_id', myProfileId)
    .is('read_at', null)
  const counts: Record<string, number> = {};
  (data ?? []).forEach((row: any) => { counts[row.match_id] = (counts[row.match_id] ?? 0) + 1 })
  return counts
}

// ============================================================
// Obecnosc: znacznik ostatniej aktywnosci (status online w czacie)
// ============================================================

// Online = last_seen_at swiezsze niz 2 minuty
export const ONLINE_THRESHOLD_MS = 2 * 60 * 1000

export async function touchLastSeen(profileId: string): Promise<void> {
  try {
    await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', profileId)
  } catch (e) { }
}

export function isOnline(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS
}

// ============================================================
// Reakcje na wiadomosci (czat 1:1 i grupowy wyzwan)
// ============================================================

export type MessageReaction = { message_id: string; profile_id: string; emoji: string }

// Zestaw reakcji pod klimat apki — jedna lista dla obu czatow
export const REACTION_EMOJIS = ['💪', '🔥', '👏', '❤️', '😅']

// Rozszerzony wybor pod przyciskiem "+" w pasku reakcji
export const REACTION_EMOJIS_EXTENDED = [
  '💪', '🔥', '👏', '❤️', '😅',
  '😂', '😍', '😮', '😢', '😡',
  '👍', '👎', '🙌', '🤝', '💯',
  '⚡', '🏆', '🥇', '🎯', '🎉',
  '🏋️', '🏃', '🚴', '🧘', '🥊',
  '😤', '🥵', '😴', '🤔', '🙈',
]

export async function getMessageReactions(messageIds: string[], challenge = false): Promise<MessageReaction[]> {
  if (messageIds.length === 0) return []
  const { data } = await supabase
    .from(challenge ? 'challenge_message_reactions' : 'message_reactions')
    .select('message_id, profile_id, emoji')
    .in('message_id', messageIds)
  return (data ?? []) as MessageReaction[]
}

// emoji = null usuwa reakcje; ta sama emoji co obecna tez ja zdejmuje (toggle robi ekran)
export async function setMessageReaction(messageId: string, profileId: string, emoji: string | null, challenge = false): Promise<boolean> {
  const table = challenge ? 'challenge_message_reactions' : 'message_reactions'
  const { error } = emoji === null
    ? await supabase.from(table).delete().eq('message_id', messageId).eq('profile_id', profileId)
    : await supabase.from(table).upsert({ message_id: messageId, profile_id: profileId, emoji }, { onConflict: 'message_id,profile_id' })
  if (error) console.log('setMessageReaction error:', error)
  return !error
}

export function subscribeToReactions(channelKey: string, challenge: boolean, onChange: () => void) {
  return supabase
    .channel(`reactions:${channelKey}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: challenge ? 'challenge_message_reactions' : 'message_reactions' }, () => onChange())
    .subscribe()
}

// ============================================================
// Block / Report
// ============================================================

export async function getBlockedIds(myProfileId: string): Promise<string[]> {
  const { data } = await supabase
    .from('blocked_users')
    .select('blocked_id, blocker_id')
    .or(`blocker_id.eq.${myProfileId},blocked_id.eq.${myProfileId}`)
  if (!data) return []
  return data.map((b: any) => b.blocker_id === myProfileId ? b.blocked_id : b.blocker_id)
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase.from('blocked_users').insert({ blocker_id: blockerId, blocked_id: blockedId })
  if (error) throw error
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase.from('blocked_users')
    .delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId)
  if (error) throw error
}

export async function getBlockedUsers(myProfileId: string): Promise<Profile[]> {
  const { data: blocked } = await supabase
    .from('blocked_users').select('blocked_id').eq('blocker_id', myProfileId)
  if (!blocked || blocked.length === 0) return []
  const ids = blocked.map((b: any) => b.blocked_id)
  const { data } = await supabase.from('profiles').select('*').in('id', ids)
  return data ?? []
}

// contentRef: opcjonalny kontekst dla moderacji (np. "status_video:<profileId>:<timestamp>"),
// zeby zgloszenie konkretnej tresci (nie tylko osoby) dalo sie odnalezc i szybko usunac
export async function reportUser(reporterId: string, reportedId: string, reason: string, contentRef?: string): Promise<void> {
  const { error } = await supabase.from('reported_users').insert({
    reporter_id: reporterId, reported_id: reportedId, reason, content_ref: contentRef ?? null
  })
  if (error) throw error
  // Push do moderatorow (wymog Apple: reakcja na zgloszenia UGC w 24h) — nie blokuje zgloszenia
  supabase.functions.invoke('notify-admins', { body: { reason } }).catch(() => { })
}

// Silownie w poblizu przez edge function nearby-places (Google Places ->
// Overpass -> Nominatim, cache 7 dni per ~2 km) — telefon nie odpytuje juz
// bezposrednio przeciazonych publicznych serwerow OSM
export async function fetchNearbyGyms(lat: number, lng: number, lang = 'en'): Promise<string[]> {
  try {
    const { data, error } = await supabase.functions.invoke('nearby-places', { body: { lat, lng, lang, kind: 'gyms' } })
    if (error) return []
    return Array.isArray(data?.places) ? data.places : []
  } catch (e) { return [] }
}

// Obiekty sportowe na wydarzenia (boiska, hale, stadiony, baseny) — ten sam mechanizm
export async function fetchNearbyVenues(lat: number, lng: number, lang = 'en'): Promise<string[]> {
  try {
    const { data, error } = await supabase.functions.invoke('nearby-places', { body: { lat, lng, lang, kind: 'venues' } })
    if (error) return []
    return Array.isArray(data?.places) ? data.places : []
  } catch (e) { return [] }
}

// ============================================================
// Ekipa na dzis (jednodniowe ogloszenia "szukam ludzi")
// ============================================================

// Aktywne ogloszenia w okolicy: dystans od tworcy, posortowane po godzinie startu.
// Dolaczyc moze KAZDY w zasiegu (domyslnie 50 km) — matche dostaja tylko push.
export async function getTodaySquads(myLat: number | null, myLng: number | null, radiusKm = 50): Promise<any[]> {
  try {
    const { data } = await supabase
      .from('squads')
      .select('*, profiles:creator_id (id, name, photo_urls, banned), squad_members (profile_id)')
      .gt('expires_at', new Date().toISOString())
    const R = 6371
    const dist = (la1: number, lo1: number, la2: number, lo2: number) => {
      const dLat = (la2 - la1) * Math.PI / 180
      const dLng = (lo2 - lo1) * Math.PI / 180
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }
    const rows = (data ?? [])
      .filter((s: any) => s.profiles && s.profiles.banned !== true)
      .map((s: any) => ({
        ...s,
        member_ids: (s.squad_members ?? []).map((m: any) => m.profile_id),
        distance_km: myLat != null && myLng != null && s.latitude != null && s.longitude != null
          ? dist(myLat, myLng, s.latitude, s.longitude) : null,
      }))
      .filter((s: any) => s.distance_km == null || s.distance_km <= radiusKm)
      .sort((a: any, b: any) => String(a.time_text).localeCompare(String(b.time_text)))

    // Profile uczestnikow (avatary + usuwanie przez organizatora)
    const memberIds = [...new Set(rows.flatMap((s: any) => s.member_ids))]
    if (memberIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, name, photo_urls').in('id', memberIds)
      const byId: Record<string, any> = {}
      ;(profs ?? []).forEach((p: any) => { byId[p.id] = p })
      rows.forEach((s: any) => { s.members = s.member_ids.map((id: string) => byId[id]).filter(Boolean) })
    } else {
      rows.forEach((s: any) => { s.members = [] })
    }
    return rows
  } catch (e) { return [] }
}

// Organizator usuwa uczestnika ze swojej ekipy (RLS: polityka squad_members_kick)
export async function kickSquadMember(squadId: string, profileId: string): Promise<void> {
  const { error } = await supabase.from('squad_members').delete().eq('squad_id', squadId).eq('profile_id', profileId)
  if (error) throw error
}

export async function createSquad(input: {
  creatorId: string; sport: string; timeText: string; venue: string
  spotsTotal: number; note?: string; lat?: number | null; lng?: number | null
}): Promise<string | null> {
  // Ogloszenie zyje do lokalnej polnocy tworcy
  const midnight = new Date()
  midnight.setHours(23, 59, 59, 0)
  const { data, error } = await supabase.from('squads').insert({
    creator_id: input.creatorId,
    sport: input.sport,
    time_text: input.timeText,
    venue: input.venue,
    spots_total: input.spotsTotal,
    note: input.note ?? '',
    latitude: input.lat ?? null,
    longitude: input.lng ?? null,
    expires_at: midnight.toISOString(),
  }).select('id').single()
  if (error) throw error
  // Tworca od razu zajmuje pierwsze miejsce
  await supabase.from('squad_members').insert({ squad_id: data.id, profile_id: input.creatorId })
  return data?.id ?? null
}

export async function joinSquad(squadId: string, profileId: string): Promise<void> {
  const { error } = await supabase.from('squad_members').insert({ squad_id: squadId, profile_id: profileId })
  if (error && !String(error.message).includes('duplicate')) throw error
}

// Czat ekipy: bez embedow profili (nazwy/avatary dostarcza mapa czlonkow),
// zeby nie ryzykowac niejednoznacznosci relacji jak przy czacie wyzwan
export type SquadMessage = { id: string; squad_id: string; sender_id: string; content: string; created_at: string }

export async function getSquadMessages(squadId: string): Promise<SquadMessage[]> {
  const { data, error } = await supabase
    .from('squad_messages')
    .select('*')
    .eq('squad_id', squadId)
    .order('created_at', { ascending: true })
  if (error) { console.log('getSquadMessages error:', error); return [] }
  return (data ?? []) as SquadMessage[]
}

export async function sendSquadMessage(squadId: string, senderId: string, content: string): Promise<SquadMessage | null> {
  const { data, error } = await supabase
    .from('squad_messages')
    .insert({ squad_id: squadId, sender_id: senderId, content })
    .select()
    .single()
  if (error) { console.log('sendSquadMessage error:', error); return null }
  return data as SquadMessage
}

export function subscribeToSquadMessages(squadId: string, onMessage: (msg: SquadMessage) => void) {
  return supabase
    .channel(`squad_messages:${squadId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'squad_messages', filter: `squad_id=eq.${squadId}` },
      payload => onMessage(payload.new as SquadMessage))
    .subscribe()
}

export async function getSquadMembers(squadId: string): Promise<{ id: string; name: string; photo_urls: string[] }[]> {
  const { data: rows } = await supabase.from('squad_members').select('profile_id').eq('squad_id', squadId)
  const ids = (rows ?? []).map((r: any) => r.profile_id)
  if (ids.length === 0) return []
  const { data: profs } = await supabase.from('profiles').select('id, name, photo_urls').in('id', ids)
  return (profs ?? []) as any[]
}

export async function leaveSquad(squadId: string, profileId: string): Promise<void> {
  await supabase.from('squad_members').delete().eq('squad_id', squadId).eq('profile_id', profileId)
}

export async function deleteSquad(squadId: string): Promise<void> {
  await supabase.from('squads').delete().eq('id', squadId)
}

// Eksport danych RODO (art. 20): zbiera dane konta na serwerze i wysyla je
// mailem jako zalacznik JSON (patrz supabase/functions/export-data)
export async function exportMyData(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('export-data', { body: {} })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}

// ============================================================
// Moderacja (panel admina)
// ============================================================

// Czy zalogowany uzytkownik jest adminem (RLS pozwala odczytac tylko wlasny wiersz)
export async function checkIsAdmin(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const { data } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
    return !!data
  } catch (e) { return false }
}

// Akcje moderacyjne ida przez edge function (service role) — patrz supabase/functions/admin-actions
export async function adminAction(body: Record<string, any>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('admin-actions', { body })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

// ============================================================
// Other
// ============================================================

// ============================================================
// Workout Streak
// ============================================================

// Nagrody za kamienie milowe passy: dodatkowe polubienia (3/7/14 dni),
// a co 30 dni — wyroznienie profilu w talii na 24h (boosted_until)
const STREAK_MILESTONE_SWIPES: Record<number, number> = { 3: 5, 7: 15, 14: 25 }

export async function logWorkoutToday(profileId: string): Promise<{
  success: boolean; currentStreak: number; alreadyLogged: boolean
  milestone?: number; bonusSwipes?: number; boosted?: boolean
}> {
  const today = new Date().toISOString().split('T')[0]

  // Sprawdz czy juz zaznaczono dzisiaj
  const { data: existing } = await supabase
    .from('workout_streaks')
    .select('id')
    .eq('profile_id', profileId)
    .eq('workout_date', today)
    .maybeSingle()

  if (existing) {
    const { data: profile } = await supabase.from('profiles').select('current_streak').eq('id', profileId).single()
    return { success: false, currentStreak: (profile as any)?.current_streak ?? 0, alreadyLogged: true }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('current_streak, longest_streak, last_workout_date, daily_swipes_left')
    .eq('id', profileId)
    .single()

  const lastDate = (profile as any)?.last_workout_date
  const currentStreak = (profile as any)?.current_streak ?? 0
  const longestStreak = (profile as any)?.longest_streak ?? 0

  let newStreak = 1
  if (lastDate) {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]
    if (lastDate === yesterdayStr) {
      // Kontynuacja streaka
      newStreak = currentStreak + 1
    } else if (lastDate === today) {
      // Juz zaznaczono (nie powinno sie zdarzyc bo sprawdzilismy wyzej)
      newStreak = currentStreak
    } else {
      // Przerwa - reset streaka
      newStreak = 1
    }
  }

  const newLongest = Math.max(newStreak, longestStreak)

  // Kamien milowy? Bonus polubien albo (co 30 dni) 24h wyroznienia w talii
  const bonusSwipes = STREAK_MILESTONE_SWIPES[newStreak] ?? 0
  const boosted = newStreak >= 30 && newStreak % 30 === 0
  const milestone = bonusSwipes > 0 || boosted ? newStreak : undefined

  const update: Record<string, any> = {
    current_streak: newStreak,
    longest_streak: newLongest,
    last_workout_date: today,
  }
  if (bonusSwipes > 0) update.daily_swipes_left = ((profile as any)?.daily_swipes_left ?? 0) + bonusSwipes
  if (boosted) update.boosted_until = new Date(Date.now() + 24 * 3600000).toISOString()

  await supabase.from('workout_streaks').insert({ profile_id: profileId, workout_date: today })
  await supabase.from('profiles').update(update).eq('id', profileId)

  return { success: true, currentStreak: newStreak, alreadyLogged: false, milestone, bonusSwipes: bonusSwipes || undefined, boosted: boosted || undefined }
}

// Lista widzow mojej relacji (jak na Instagramie) + ich reakcje
export async function getStatusViewers(myProfileId: string): Promise<any[]> {
  try {
    const { data: views } = await supabase
      .from('status_views')
      .select('viewer_id, viewed_at, profiles:viewer_id (id, name, photo_urls)')
      .eq('status_profile_id', myProfileId)
      .order('viewed_at', { ascending: false })
    const { data: rx } = await supabase
      .from('status_reactions')
      .select('reactor_id, emoji')
      .eq('status_profile_id', myProfileId)
    const emojiBy: Record<string, string> = {}
    ;(rx ?? []).forEach((r: any) => { emojiBy[r.reactor_id] = r.emoji })
    return (views ?? []).map((v: any) => ({ ...v, emoji: emojiBy[v.viewer_id] ?? null }))
  } catch (e) {
    return []
  }
}

export async function incrementStatusView(profileId: string, viewerId: string): Promise<void> {
  // Podglad wlasnej relacji nie nabija licznika wyswietlen
  if (profileId === viewerId) return
  try {
    await supabase.rpc('increment_status_view', { p_profile_id: profileId, p_viewer_id: viewerId })
  } catch (e) {
    console.log('incrementStatusView error:', e)
  }
}

export async function logRestDay(profileId: string): Promise<{ success: boolean; currentStreak: number; restDaysLeft?: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('log_rest_day', { p_profile_id: profileId })
    if (error) return { success: false, currentStreak: 0, error: 'unknown' }
    return {
      success: data?.success ?? false,
      currentStreak: data?.currentStreak ?? 0,
      restDaysLeft: data?.restDaysLeft,
      error: data?.error,
    }
  } catch (e) {
    return { success: false, currentStreak: 0, error: 'unknown' }
  }
}

export async function checkStreakStatus(profileId: string): Promise<{ currentStreak: number; loggedToday: boolean }> {
  const today = new Date().toISOString().split('T')[0]
  const { data: profile } = await supabase
    .from('profiles')
    .select('current_streak, last_workout_date')
    .eq('id', profileId)
    .single()

  const currentStreak = (profile as any)?.current_streak ?? 0
  const lastDate = (profile as any)?.last_workout_date

  // Jesli ostatni trening nie byl wczoraj ani dzisiaj - streak jest "martwy" (0) az do nastepnego zaznaczenia
  if (lastDate) {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]
    if (lastDate !== today && lastDate !== yesterdayStr) {
      // Streak wygasl - zapisz reset w bazie
      await supabase.from('profiles').update({ current_streak: 0 }).eq('id', profileId)
      return { currentStreak: 0, loggedToday: false }
    }
  }

  return { currentStreak, loggedToday: lastDate === today }
}

// ============================================================
// Challenges (Wyzwania)
// ============================================================

export type Challenge = {
  id: string
  creator_id: string
  title: string
  description: string
  goal_type: string
  goal_value: number
  goal_unit: string
  start_date: string
  end_date: string
  created_at: string
}

export async function getChallenges(myLat: number = 0, myLng: number = 0): Promise<any[]> {
  const { data, error } = await supabase.rpc('get_challenges_nearby', {
    my_lat: myLat,
    my_lng: myLng,
  })
  if (error) { console.log('getChallenges error:', error); return [] }
  return data ?? []
}

export async function getMyChallenges(profileId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('challenge_participants')
    .select('*, challenges(*)')
    .eq('profile_id', profileId)
  if (error) { console.log('getMyChallenges error:', error); return [] }
  return data ?? []
}

export async function createChallenge(
  creatorId: string,
  title: string,
  description: string,
  goalType: string,
  goalValue: number,
  goalUnit: string,
  endDate: string,
  radiusKm: number = 50,
  creatorLat: number = 0,
  creatorLng: number = 0
): Promise<{ success: boolean; challengeId?: string }> {
  const { data, error } = await supabase
    .from('challenges')
    .insert({
      creator_id: creatorId,
      title,
      description,
      goal_type: goalType,
      goal_value: goalValue,
      goal_unit: goalUnit,
      end_date: endDate,
      radius_km: radiusKm,
      creator_latitude: creatorLat || null,
      creator_longitude: creatorLng || null,
    })
    .select('id')
    .single()
  if (error) { console.log('createChallenge error:', error); return { success: false } }
  // Tworca automatycznie dolacza do wlasnego wyzwania
  await joinChallenge(data.id, creatorId)
  return { success: true, challengeId: data.id }
}

export async function joinChallenge(challengeId: string, profileId: string): Promise<boolean> {
  const { error } = await supabase
    .from('challenge_participants')
    .insert({ challenge_id: challengeId, profile_id: profileId })
  if (!error) {
    try {
      const { data: challenge } = await supabase
        .from('challenges')
        .select('creator_id, title')
        .eq('id', challengeId)
        .single()
      if (challenge && challenge.creator_id !== profileId) {
        const { data: joiner } = await supabase.from('profiles').select('name').eq('id', profileId).single()
        const { notifyProfile } = await import('./notifications')
        notifyProfile(
          challenge.creator_id,
          '🏆 New participant!',
          `${joiner?.name ?? 'Someone'} joined your challenge "${challenge.title}"`,
          { type: 'challenge_join', challengeId }
        )
      }
    } catch (e) {
      console.log('joinChallenge notify error:', e)
    }
  }
  return !error
}

export async function leaveChallenge(challengeId: string, profileId: string): Promise<boolean> {
  const { error } = await supabase
    .from('challenge_participants')
    .delete()
    .eq('challenge_id', challengeId)
    .eq('profile_id', profileId)
  return !error
}

export async function updateChallengeProgress(challengeId: string, profileId: string, progress: number): Promise<boolean> {
  const { error } = await supabase
    .from('challenge_participants')
    .update({ current_progress: progress })
    .eq('challenge_id', challengeId)
    .eq('profile_id', profileId)
  return !error
}

export async function getChallengeParticipants(challengeId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('challenge_participants')
    .select('*, profiles(id, name, photo_urls)')
    .eq('challenge_id', challengeId)
    .order('current_progress', { ascending: false })
  if (error) { console.log('getChallengeParticipants error:', error); return [] }
  return data ?? []
}

export async function deleteChallenge(challengeId: string): Promise<boolean> {
  const { error } = await supabase
    .from('challenges')
    .delete()
    .eq('id', challengeId)
  return !error
}

// ============================================================
// Live Gym Board (kto jest teraz na silowni)
// ============================================================

// Relacje osob w okolicy (pasek jak na Messengerze): wszystkie aktywne statusy
// w zadanym promieniu, posortowane po odleglosci. Odleglosc: wspolrzedne statusu
// (silownia) albo profilu; brak wspolrzednych = pokazujemy (lepiej niz ukryc).
export async function getNearbyStatuses(myProfileId: string, lat: number, lng: number, radiusKm = 30): Promise<any[]> {
  try {
    const { data } = await supabase
      .from('training_status')
      .select('*, profiles(id, name, photo_urls, latitude, longitude, is_trainer, banned)')
      .gt('expires_at', new Date().toISOString())
      .neq('profile_id', myProfileId)
    const blocked = await getBlockedIds(myProfileId)
    const R = 6371
    const dist = (la1: number, lo1: number, la2: number, lo2: number) => {
      const dLat = (la2 - la1) * Math.PI / 180
      const dLng = (lo2 - lo1) * Math.PI / 180
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }
    return (data ?? [])
      .filter((s: any) => s.profiles && s.profiles.banned !== true && !blocked.includes(s.profile_id))
      .map((s: any) => {
        const plat = s.gym_latitude ?? s.profiles?.latitude
        const plng = s.gym_longitude ?? s.profiles?.longitude
        const d = lat && lng && plat != null && plng != null ? dist(lat, lng, plat, plng) : null
        return { ...s, distance_km: d }
      })
      .filter((s: any) => s.distance_km == null || s.distance_km <= radiusKm)
      .sort((a: any, b: any) => (a.distance_km ?? 999) - (b.distance_km ?? 999))
  } catch (e) { return [] }
}

// Ktore relacje juz obejrzalem (szare pierscienie na pasku)
export async function getMyViewedStatusIds(myProfileId: string): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('status_views')
      .select('status_profile_id')
      .eq('viewer_id', myProfileId)
    return (data ?? []).map((r: any) => r.status_profile_id)
  } catch (e) { return [] }
}

export async function getActiveGymStatuses(myProfileId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('training_status')
    .select('*, profiles(id, name, photo_urls, fitness_level, is_trainer, banned)')
    .eq('is_live', true)
    .gt('expires_at', new Date().toISOString())
    .not('gym_latitude', 'is', null)
    .not('gym_longitude', 'is', null)
    .neq('profile_id', myProfileId)
  if (error) { console.log('getActiveGymStatuses error:', error); return [] }
  return (data ?? []).filter((s: any) => s.profiles?.banned !== true)
}

// Grupuje aktywne statusy w "kluby" - miejsca w promieniu ~300m sa traktowane jako ta sama silownia
export function groupStatusesByGym(statuses: any[]): any[] {
  const groups: any[] = []
  const RADIUS_KM = 0.3

  function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  for (const status of statuses) {
    const lat = status.gym_latitude
    const lng = status.gym_longitude
    let foundGroup = groups.find(g => distanceKm(g.latitude, g.longitude, lat, lng) <= RADIUS_KM)
    if (foundGroup) {
      foundGroup.people.push(status)
    } else {
      // Dodaj lekkie losowe przesuniecie (do ok. 150m) dla dodatkowej ochrony prywatnosci
      // Srodek okregu nigdy nie jest dokladna lokalizacja pierwszej osoby
      const jitter = 0.0013 // ~150m w stopniach szerokosci geograficznej
      const jitterLat = lat + (Math.random() - 0.5) * jitter
      const jitterLng = lng + (Math.random() - 0.5) * jitter
      groups.push({
        latitude: jitterLat,
        longitude: jitterLng,
        gym_name: status.gym_name || 'Gym',
        people: [status],
      })
    }
  }
  return groups
}

// ============================================================
// Challenge Group Chat
// ============================================================

export type ChallengeMessage = {
  id: string
  challenge_id: string
  sender_id: string
  content: string
  created_at: string
}

export async function getChallengeMessages(challengeId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('challenge_messages')
    // Jawne wskazanie relacji: tabela reakcji stworzyla druga sciezke
    // challenge_messages<->profiles i goly embed 'profiles(...)' stal sie
    // niejednoznaczny (PGRST201) — zapytanie zwracalo blad i pusty czat
    .select('*, profiles!challenge_messages_sender_id_fkey(id, name, photo_urls)')
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: true })
  if (error) { console.log('getChallengeMessages error:', error); return [] }
  return data ?? []
}

// Zwraca zapisany wiersz — nadawca rozglasza go broadcastem do reszty uczestnikow
// (rownolegle do postgres_changes, ktore bywa zawodne przy zmianach publikacji)
export async function sendChallengeMessage(challengeId: string, senderId: string, content: string): Promise<ChallengeMessage | null> {
  const { data, error } = await supabase
    .from('challenge_messages')
    .insert({ challenge_id: challengeId, sender_id: senderId, content })
    .select()
    .single()
  if (error) { console.log('sendChallengeMessage error:', error); return null }
  return data as ChallengeMessage
}

export function subscribeToChallengeMessages(
  challengeId: string,
  onMessage: (msg: ChallengeMessage) => void
) {
  return supabase
    .channel(`challenge_messages:${challengeId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'challenge_messages', filter: `challenge_id=eq.${challengeId}` },
      payload => onMessage(payload.new as ChallengeMessage))
    .subscribe()
}

// ============================================================
// Referral System
// ============================================================

export async function getReferralCode(profileId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('id', profileId)
    .single()
  return data?.referral_code ?? null
}

export async function applyReferralCode(profileId: string, code: string): Promise<{ success: boolean; error?: string }> {
  try {
    const trimmedCode = code.trim().toUpperCase()

    // Sprawdz czy kod istnieje i nie jest wlasnym kodem
    const { data: referrer } = await supabase
      .from('profiles')
      .select('id, referral_code')
      .eq('referral_code', trimmedCode)
      .maybeSingle()

    if (!referrer) {
      return { success: false, error: 'invalid_code' }
    }
    if (referrer.id === profileId) {
      return { success: false, error: 'own_code' }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ referred_by: trimmedCode })
      .eq('id', profileId)

    if (error) return { success: false, error: 'update_failed' }
    return { success: true }
  } catch (e) {
    return { success: false, error: 'unknown' }
  }
}

export async function checkPremiumExpiry(profileId: string): Promise<void> {
  try {
    await supabase.rpc('check_premium_expiry', { p_profile_id: profileId })
  } catch (e) {
    console.log('checkPremiumExpiry error:', e)
  }
}

export async function logDailyActivity(profileId: string): Promise<void> {
  try {
    await supabase.rpc('log_daily_activity', { p_profile_id: profileId })
    await checkPremiumExpiry(profileId)
  } catch (e) {
    console.log('logDailyActivity error:', e)
  }
}

export async function getReferralStats(profileId: string): Promise<{ code: string | null; referredCount: number; pendingCount: number }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('id', profileId)
    .single()

  const code = profile?.referral_code ?? null
  if (!code) return { code: null, referredCount: 0, pendingCount: 0 }

  const { data: referred } = await supabase
    .from('profiles')
    .select('referral_reward_given')
    .eq('referred_by', code)

  const referredCount = (referred ?? []).filter((r: any) => r.referral_reward_given).length
  const pendingCount = (referred ?? []).filter((r: any) => !r.referral_reward_given).length

  return { code, referredCount, pendingCount }
}

// ============================================================
// Achievements / Badges
// ============================================================

export const BADGES_CATALOG = [
  { code: 'streak_7', category: 'streak', icon: 'flame' },
  { code: 'streak_30', category: 'streak', icon: 'flame' },
  { code: 'streak_100', category: 'streak', icon: 'flame' },
  { code: 'swipes_100', category: 'swipes', icon: 'hand-left' },
  { code: 'swipes_500', category: 'swipes', icon: 'hand-left' },
  { code: 'swipes_1000', category: 'swipes', icon: 'hand-left' },
  { code: 'first_match', category: 'social', icon: 'people' },
  { code: 'matches_10', category: 'social', icon: 'people' },
  { code: 'matches_25', category: 'social', icon: 'magnet' },
  { code: 'first_message', category: 'social', icon: 'chatbubble' },
  { code: 'messages_100', category: 'social', icon: 'chatbubbles' },
  { code: 'sessions_10', category: 'workouts', icon: 'barbell' },
  { code: 'sessions_50', category: 'workouts', icon: 'barbell' },
  { code: 'early_bird', category: 'workouts', icon: 'sunny' },
  { code: 'night_owl', category: 'workouts', icon: 'moon' },
  { code: 'challenge_joined', category: 'challenges', icon: 'trophy' },
  { code: 'challenge_created', category: 'challenges', icon: 'trophy' },
  { code: 'challenge_completed', category: 'challenges', icon: 'medal' },
  { code: 'trendsetter', category: 'challenges', icon: 'trending-up' },
  { code: 'event_joined', category: 'events', icon: 'calendar' },
  { code: 'events_5', category: 'events', icon: 'calendar-number' },
  { code: 'event_created', category: 'events', icon: 'calendar' },
  { code: 'referral_first', category: 'referral', icon: 'gift' },
  { code: 'verified_profile', category: 'profile', icon: 'shield-checkmark' },
  { code: 'photogenic', category: 'profile', icon: 'camera' },
  { code: 'status_star', category: 'profile', icon: 'star' },
]

export async function checkAndAwardBadges(profileId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc('check_and_award_badges', { p_profile_id: profileId })
    if (error) { console.log('checkAndAwardBadges error:', error); return [] }
    return data ?? []
  } catch (e) {
    console.log('checkAndAwardBadges exception:', e)
    return []
  }
}

export async function getMyBadges(profileId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('profile_badges')
    .select('badge_code')
    .eq('profile_id', profileId)
  if (error) return []
  return (data ?? []).map((b: any) => b.badge_code)
}

// ============================================================
// Sports Events (wydarzenia z konkretna data/godzina)
// ============================================================

export async function getSportsEvents(myLat: number = 0, myLng: number = 0): Promise<any[]> {
  const { data, error } = await supabase.rpc('get_sports_events_nearby', {
    my_lat: myLat,
    my_lng: myLng,
  })
  if (error) { console.log('getSportsEvents error:', error); return [] }
  return data ?? []
}

export async function createSportsEvent(
  creatorId: string,
  title: string,
  description: string,
  sportType: string,
  eventDate: string,
  eventTime: string,
  venueName: string,
  latitude: number,
  longitude: number,
  maxParticipants: number | null,
  radiusKm: number = 100,
  externalRef: string | null = null
): Promise<{ success: boolean; eventId?: string }> {
  const { data, error } = await supabase
    .from('sports_events')
    .insert({
      creator_id: creatorId,
      title,
      description,
      sport_type: sportType,
      event_date: eventDate,
      event_time: eventTime,
      venue_name: venueName,
      latitude: latitude || null,
      longitude: longitude || null,
      max_participants: maxParticipants,
      radius_km: radiusKm,
      external_ref: externalRef,
    })
    .select('id')
    .single()
  if (error) { console.log('createSportsEvent error:', error); return { success: false } }
  await joinSportsEvent(data.id, creatorId)
  return { success: true, eventId: data.id }
}

export async function joinSportsEvent(eventId: string, profileId: string): Promise<boolean> {
  const { error } = await supabase
    .from('event_attendees')
    .insert({ event_id: eventId, profile_id: profileId })
  return !error
}

// Opuszczenie wydarzenia przez RPC: ostatni uczestnik = wydarzenie znika cale
export async function leaveSportsEvent(eventId: string, profileId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('leave_sports_event', {
    p_event_id: eventId, p_profile_id: profileId,
  })
  if (error) { console.log('leaveSportsEvent error:', error); return false }
  return data?.success === true
}

export async function getEventAttendees(eventId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('event_attendees')
    .select('*, profiles(id, name, photo_urls)')
    .eq('event_id', eventId)
    .order('joined_at', { ascending: true })
  if (error) { console.log('getEventAttendees error:', error); return [] }
  return data ?? []
}

export async function getMySportsEvents(profileId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('event_attendees')
    .select('event_id')
    .eq('profile_id', profileId)
  if (error) return []
  return data ?? []
}

export async function deleteSportsEvent(eventId: string): Promise<boolean> {
  const { error } = await supabase.from('sports_events').delete().eq('id', eventId)
  return !error
}

export async function getProfileViewers(myId: string): Promise<any[]> {
  const { data, error } = await supabase.rpc('get_profile_viewers', { my_id: myId })
  if (error) { console.log('getProfileViewers error:', error); return [] }
  return data ?? []
}

// ============================================================
// Profile trenerow
// ============================================================

export async function getTrainers(lat: number = 0, lng: number = 0, spec: string = '', radiusKm: number = 100): Promise<any[]> {
  const { data, error } = await supabase.rpc('get_trainers', { my_lat: lat, my_lng: lng, spec_filter: spec, radius_km: radiusKm })
  if (error) { console.log('getTrainers error:', error); return [] }
  return data ?? []
}

export async function getTrainerCard(trainerId: string, viewerId: string): Promise<any | null> {
  const { data, error } = await supabase.rpc('get_trainer_card', { p_trainer_id: trainerId, p_viewer_id: viewerId })
  if (error) { console.log('getTrainerCard error:', error); return null }
  return data
}

export async function addTrainerReview(trainerId: string, reviewerId: string, rating: number, comment: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('add_trainer_review', {
    p_trainer_id: trainerId, p_reviewer_id: reviewerId, p_rating: rating, p_comment: comment,
  })
  if (error) { console.log('addTrainerReview error:', error); return { success: false, error: 'unknown' } }
  return data
}

export async function followTrainer(trainerId: string, followerId: string): Promise<boolean> {
  const { error } = await supabase.from('trainer_followers').insert({ trainer_id: trainerId, follower_id: followerId })
  return !error
}

export async function unfollowTrainer(trainerId: string, followerId: string): Promise<boolean> {
  const { error } = await supabase.from('trainer_followers').delete()
    .eq('trainer_id', trainerId).eq('follower_id', followerId)
  return !error
}

// Kontakt z trenerem — tworzy match, dzieki czemu dziala zwykly czat
export async function createTrainerChat(trainerId: string, userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_trainer_chat', { p_trainer_id: trainerId, p_user_id: userId })
  if (error) { console.log('createTrainerChat error:', error); return null }
  return data
}

// Zaloguj wyswietlenie wizytowki trenera (1x dziennie na widza)
export async function logTrainerCardView(trainerId: string, viewerId: string): Promise<void> {
  if (trainerId === viewerId) return
  try {
    await supabase.from('trainer_card_views')
      .upsert({ trainer_id: trainerId, viewer_id: viewerId, view_date: new Date().toISOString().split('T')[0] }, { onConflict: 'trainer_id,viewer_id,view_date', ignoreDuplicates: true })
  } catch (e) { }
}

// Statystyki Studia trenera (wyswietlenia dzienne, trend, obserwujacy, zapytania)
export async function getTrainerStats(trainerId: string): Promise<any | null> {
  const { data, error } = await supabase.rpc('get_trainer_stats', { p_trainer_id: trainerId })
  if (error) { console.log('getTrainerStats error:', error); return null }
  return data
}

// Skrzynka klientow: rozmowy oznaczone jako trener-klient + ostatnia wiadomosc + nieprzeczytane
export async function getTrainerInbox(trainerId: string): Promise<any[]> {
  const { data: matches } = await supabase
    .from('matches')
    .select('id, profile_a_id, profile_b_id, matched_at')
    .eq('is_trainer_chat', true)
    .or(`profile_a_id.eq.${trainerId},profile_b_id.eq.${trainerId}`)
  if (!matches || matches.length === 0) return []
  const result = []
  for (const m of matches) {
    const otherId = m.profile_a_id === trainerId ? m.profile_b_id : m.profile_a_id
    const { data: other } = await supabase.from('profiles').select('id, name, photo_urls').eq('id', otherId).maybeSingle()
    const { data: lastMsg } = await supabase
      .from('messages').select('content, sent_at, sender_id')
      .eq('match_id', m.id).order('sent_at', { ascending: false }).limit(1).maybeSingle()
    const { count: unread } = await supabase
      .from('messages').select('*', { count: 'exact', head: true })
      .eq('match_id', m.id).neq('sender_id', trainerId).is('read_at', null)
    result.push({
      matchId: m.id,
      clientId: otherId,
      clientName: other?.name ?? '?',
      clientPhoto: other?.photo_urls?.[0] ?? null,
      lastMessage: lastMsg?.content ?? '',
      lastMessageAt: (lastMsg as any)?.sent_at ?? m.matched_at,
      unread: unread ?? 0,
    })
  }
  result.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
  return result
}

// Nadchodzace wydarzenia utworzone przez trenera (z liczba zapisanych)
export async function getMyCreatedEvents(profileId: string): Promise<any[]> {
  const today = new Date().toISOString().split('T')[0]
  const { data: events } = await supabase
    .from('sports_events')
    .select('id, title, sport_type, event_date, event_time, max_participants')
    .eq('creator_id', profileId)
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .limit(5)
  if (!events) return []
  const result = []
  for (const ev of events) {
    const { count } = await supabase
      .from('event_attendees').select('*', { count: 'exact', head: true }).eq('event_id', ev.id)
    result.push({ ...ev, attendees_count: count ?? 0 })
  }
  return result
}

// Wyslane prosby o opinie + status (czy opinia zostala wystawiona)
export async function getMyReviewInvites(trainerId: string): Promise<any[]> {
  const { data: invites } = await supabase
    .from('review_invites')
    .select('id, user_id, created_at')
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (!invites) return []
  const result = []
  for (const inv of invites) {
    const { data: user } = await supabase.from('profiles').select('name, photo_urls').eq('id', inv.user_id).maybeSingle()
    const { data: review } = await supabase
      .from('trainer_reviews').select('rating').eq('trainer_id', trainerId).eq('reviewer_id', inv.user_id).maybeSingle()
    result.push({
      inviteId: inv.id,
      userId: inv.user_id,
      userName: user?.name ?? '?',
      userPhoto: user?.photo_urls?.[0] ?? null,
      sentAt: inv.created_at,
      rating: review?.rating ?? null,
    })
  }
  return result
}

// Trener prosi podopiecznego o opinie (trener ustalany z sesji po stronie DB)
export async function sendReviewInvite(userId: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('send_review_invite', { p_user_id: userId })
  if (error) { console.log('sendReviewInvite error:', error); return { success: false, error: 'unknown' } }
  return data
}

export async function getMyTrainerProfile(profileId: string): Promise<any | null> {
  const { data } = await supabase.from('trainer_profiles').select('*').eq('profile_id', profileId).maybeSingle()
  return data
}

export async function upsertTrainerProfile(profileId: string, fields: Record<string, any>): Promise<boolean> {
  const { error } = await supabase.from('trainer_profiles')
    .upsert({ profile_id: profileId, ...fields, updated_at: new Date().toISOString() })
  if (error) console.log('upsertTrainerProfile error:', error)
  return !error
}

export async function setTrainerStatus(profileId: string, isTrainer: boolean): Promise<boolean> {
  const { error } = await supabase.from('profiles').update({ is_trainer: isTrainer }).eq('id', profileId)
  return !error
}

// Push do obserwujacych po utworzeniu wydarzenia przez trenera
export async function notifyFollowersNewEvent(trainerId: string, trainerName: string, eventTitle: string, eventId: string): Promise<void> {
  try {
    const { data: followers } = await supabase
      .from('trainer_followers').select('follower_id').eq('trainer_id', trainerId)
    if (!followers || followers.length === 0) return
    const { notifyProfile } = await import('./notifications')
    for (const f of followers) {
      notifyProfile(f.follower_id, `🎓 ${trainerName}`, eventTitle, { type: 'trainer_event', eventId })
    }
  } catch (e) { console.log('notifyFollowersNewEvent error:', e) }
}

// ============================================================
// Wspolna passa, pojedynki 1v1, tryb podroznika
// ============================================================

// Wspolne passy par (tygodnie z rzedu ze wspolnym treningiem) — mapa other_id -> tygodnie
export async function getDuoStreaks(myProfileId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('get_duo_streaks', { p_my: myProfileId })
  if (error) { console.log('getDuoStreaks error:', error); return {} }
  const map: Record<string, number> = {}
  for (const row of data ?? []) map[row.other_id] = row.weeks
  return map
}

export async function createDuel(matchId: string, metric: 'workouts' | 'steps', stake: string, days: number): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('create_duel', {
    p_match_id: matchId, p_metric: metric, p_stake: stake, p_days: days,
  })
  if (error) { console.log('createDuel error:', error); return { success: false, error: 'unknown' } }
  return data
}

export async function respondDuel(duelId: string, accept: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('respond_duel', { p_duel_id: duelId, p_accept: accept })
  if (error) { console.log('respondDuel error:', error); return false }
  return data?.success === true
}

export async function getDuel(matchId: string): Promise<any | null> {
  const { data, error } = await supabase.rpc('get_duel', { p_match_id: matchId })
  if (error) { console.log('getDuel error:', error); return null }
  return data
}

export async function reportDuelSteps(duelId: string, steps: number): Promise<void> {
  try { await supabase.rpc('report_duel_steps', { p_duel_id: duelId, p_steps: steps }) } catch (e) { }
}

export async function setTravelerUntil(profileId: string, until: string | null): Promise<boolean> {
  const { error } = await supabase.from('profiles').update({ traveler_until: until }).eq('id', profileId)
  return !error
}

// Lodolamacze AI: 3 propozycje pierwszej wiadomosci po matchu
export async function getIcebreakers(me: any, other: any, langName: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.functions.invoke('ai', {
      body: {
        action: 'icebreakers',
        myName: me?.name ?? '',
        myGoals: (me?.goals ?? []).join(', '),
        otherName: other?.name ?? '',
        otherGoals: (other?.goals ?? []).join(', '),
        sharedGym: me?.gym_name && me?.gym_name === other?.gym_name ? me.gym_name : '',
        city: other?.city ?? '',
        langName,
      },
    })
    if (error) return []
    const clean = String(data?.content ?? '{}').replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return Array.isArray(parsed.openers) ? parsed.openers.slice(0, 3) : []
  } catch (e) { return [] }
}

// Zapowiedzi obecnosci: kto z mojej silowni ma dzis aktywny status
export async function getGymPresence(gymName: string, myProfileId: string): Promise<any[]> {
  if (!gymName) return []
  const { data } = await supabase
    .from('training_status')
    .select('profile_id, training_time, status_text, looking_for_partner, profiles(id, name, photo_urls)')
    .ilike('gym_name', gymName.trim())
    .gt('expires_at', new Date().toISOString())
    .neq('profile_id', myProfileId)
  return data ?? []
}

// Duze wydarzenia sportowe z okolicy (Ticketmaster przez Edge Function, cache 24h)
// ============================================================
// Planer treningowy (plany + checklista + serie kg/powtorzenia)
// ============================================================

export type PlanSet = { w: number | null; r: number | null; done: boolean }
// kind: 'strength' (serie kg x powt.) | 'cardio' (sets = [{w: minuty, r: kcal}])
export type PlanExercise = { id: string; plan_id: string; name: string; position: number; sets: PlanSet[]; done: boolean; kind: 'strength' | 'cardio' }
export type WorkoutPlan = { id: string; name: string; rest_seconds: number; created_at: string }

export async function getWorkoutPlans(profileId: string): Promise<(WorkoutPlan & { exercise_count: number; assigned_by_name?: string | null })[]> {
  try {
    const { data } = await supabase
      .from('workout_plans')
      .select('id, name, rest_seconds, created_at, assigned_by_name, plan_exercises(id)')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: true })
    return (data ?? []).map((p: any) => ({
      id: p.id, name: p.name, rest_seconds: p.rest_seconds, created_at: p.created_at,
      assigned_by_name: p.assigned_by_name ?? null,
      exercise_count: p.plan_exercises?.length ?? 0,
    }))
  } catch (e) { return [] }
}

// Podopieczni trenera = osoby z czatem trenerskim (Studio)
export async function getTrainerClients(trainerId: string): Promise<{ id: string; name: string; photo_urls: string[] }[]> {
  try {
    const { data } = await supabase
      .from('matches')
      .select('profile_a_id, profile_b_id')
      .eq('is_trainer_chat', true)
      .or(`profile_a_id.eq.${trainerId},profile_b_id.eq.${trainerId}`)
    const ids = [...new Set((data ?? []).map((m: any) => m.profile_a_id === trainerId ? m.profile_b_id : m.profile_a_id))]
    if (ids.length === 0) return []
    const { data: profs } = await supabase.from('profiles').select('id, name, photo_urls').in('id', ids)
    return (profs ?? []) as any
  } catch (e) { return [] }
}

// Trener kopiuje swoj plan na konto podopiecznego (RLS: polityka trainer_assign_plan).
// Ciezary/powtorzenia trenera zostaja jako proponowane, odhaczenia wyczyszczone.
export async function assignPlanToClient(planId: string, trainer: { id: string; name: string }, clientId: string, pushBody: string): Promise<boolean> {
  try {
    const { data: plan } = await supabase.from('workout_plans').select('name, rest_seconds').eq('id', planId).single()
    if (!plan) return false
    const exercises = await getPlanExercises(planId)
    const { data: newPlan, error } = await supabase.from('workout_plans').insert({
      profile_id: clientId,
      name: plan.name,
      rest_seconds: plan.rest_seconds,
      assigned_by: trainer.id,
      assigned_by_name: trainer.name,
    }).select('id').single()
    if (error || !newPlan) return false
    for (const ex of exercises) {
      const sets = (ex.sets ?? []).map(s => ({ w: s.w, r: s.r, done: false }))
      await supabase.from('plan_exercises').insert({ plan_id: newPlan.id, name: ex.name, position: ex.position, kind: ex.kind, sets, done: false })
    }
    try {
      const { notifyProfile } = await import('./notifications')
      notifyProfile(clientId, `🎓 ${trainer.name}`, pushBody, { type: 'plan_assigned' })
    } catch (e) { }
    return true
  } catch (e) { return false }
}

export async function createWorkoutPlan(profileId: string, name: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('workout_plans')
      .insert({ profile_id: profileId, name })
      .select('id')
      .single()
    return error ? null : data.id
  } catch (e) { return null }
}

export async function deleteWorkoutPlan(planId: string): Promise<void> {
  try { await supabase.from('workout_plans').delete().eq('id', planId) } catch (e) { }
}

export async function updatePlanRest(planId: string, restSeconds: number): Promise<void> {
  try { await supabase.from('workout_plans').update({ rest_seconds: restSeconds }).eq('id', planId) } catch (e) { }
}

export async function getPlanExercises(planId: string): Promise<PlanExercise[]> {
  try {
    const { data } = await supabase
      .from('plan_exercises')
      .select('*')
      .eq('plan_id', planId)
      .order('position', { ascending: true })
    return (data ?? []) as PlanExercise[]
  } catch (e) { return [] }
}

export async function addPlanExercise(planId: string, name: string, position: number, kind: 'strength' | 'cardio' = 'strength'): Promise<PlanExercise | null> {
  try {
    const emptySet = { w: null, r: null, done: false }
    const sets = kind === 'cardio' ? [emptySet] : [emptySet, emptySet, emptySet]
    const { data, error } = await supabase
      .from('plan_exercises')
      .insert({ plan_id: planId, name, position, kind, sets })
      .select('*')
      .single()
    return error ? null : (data as PlanExercise)
  } catch (e) { return null }
}

export async function updatePlanExercise(id: string, patch: Partial<Pick<PlanExercise, 'name' | 'sets' | 'done' | 'position'>>): Promise<void> {
  try { await supabase.from('plan_exercises').update(patch).eq('id', id) } catch (e) { }
}

export async function deletePlanExercise(id: string): Promise<void> {
  try { await supabase.from('plan_exercises').delete().eq('id', id) } catch (e) { }
}

// Koniec treningu: zeruje odhaczenia (ciezary zostaja jako "ostatnio uzywane")
export async function resetPlanChecks(planId: string): Promise<void> {
  try {
    const exercises = await getPlanExercises(planId)
    for (const ex of exercises) {
      const sets = (ex.sets ?? []).map(s => ({ ...s, done: false }))
      await supabase.from('plan_exercises').update({ done: false, sets }).eq('id', ex.id)
    }
  } catch (e) { }
}

// ============================================================
// Pomiary sylwetki (manekin + cele + dzienniczek)
// ============================================================

export type BodyMeasurement = { id: string; measured_on: string; part: string; value: number }

// Partie mierzone osobno dla lewej i prawej strony (symetria)
export const PAIRED_PARTS = ['biceps', 'forearm', 'thigh', 'calf']

// Stare buildy zapisuja partie parzyste bez sufiksu — traktujemy jak prawa strone
// (spojnie z migracja 20260801210000, ktora przeniosla stare wpisy na _r)
function normalizeBodyPart(part: string): string {
  return PAIRED_PARTS.includes(part) ? part + '_r' : part
}

// Wszystkie pomiary uzytkownika, od najnowszych
export async function getBodyMeasurements(profileId: string): Promise<BodyMeasurement[]> {
  try {
    const { data } = await supabase
      .from('body_measurements')
      .select('id, measured_on, part, value')
      .eq('profile_id', profileId)
      .order('measured_on', { ascending: false })
    return (data ?? []).map((r: any) => ({ ...r, part: normalizeBodyPart(r.part), value: Number(r.value) }))
  } catch (e) { return [] }
}

// Zapis pomiaru: ten sam dzien + partia = nadpisanie (upsert)
export async function saveBodyMeasurement(profileId: string, part: string, value: number, dateStr?: string): Promise<boolean> {
  try {
    const measured_on = dateStr ?? new Date().toISOString().split('T')[0]
    const { error } = await supabase
      .from('body_measurements')
      .upsert({ profile_id: profileId, part, value, measured_on }, { onConflict: 'profile_id,measured_on,part' })
    return !error
  } catch (e) { return false }
}

export async function deleteBodyMeasurement(id: string): Promise<void> {
  try { await supabase.from('body_measurements').delete().eq('id', id) } catch (e) { }
}

export async function getBodyGoals(profileId: string): Promise<Record<string, number>> {
  try {
    const { data } = await supabase.from('body_goals').select('part, target').eq('profile_id', profileId)
    const map: Record<string, number> = {}
    ;(data ?? []).forEach((g: any) => { map[normalizeBodyPart(g.part)] = Number(g.target) })
    return map
  } catch (e) { return {} }
}

export async function setBodyGoal(profileId: string, part: string, target: number | null): Promise<void> {
  try {
    if (target === null) {
      await supabase.from('body_goals').delete().eq('profile_id', profileId).eq('part', part)
    } else {
      await supabase.from('body_goals').upsert({ profile_id: profileId, part, target }, { onConflict: 'profile_id,part' })
    }
  } catch (e) { }
}

// ============================================================
// Zdjecia progresu sylwetki (prywatny bucket body-photos)
// ============================================================

export type BodyPhoto = { id: string; taken_on: string; photo_path: string }

export async function getBodyPhotos(profileId: string): Promise<BodyPhoto[]> {
  try {
    const { data } = await supabase
      .from('body_photos')
      .select('id, taken_on, photo_path')
      .eq('profile_id', profileId)
      .order('taken_on', { ascending: true })
    return data ?? []
  } catch (e) { return [] }
}

export async function addBodyPhoto(profileId: string, photoPath: string, dateStr?: string): Promise<boolean> {
  try {
    const taken_on = dateStr ?? new Date().toISOString().split('T')[0]
    const { error } = await supabase
      .from('body_photos')
      .upsert({ profile_id: profileId, taken_on, photo_path: photoPath }, { onConflict: 'profile_id,taken_on' })
    return !error
  } catch (e) { return false }
}

export async function deleteBodyPhoto(id: string, photoPath: string): Promise<void> {
  try {
    await supabase.storage.from('body-photos').remove([photoPath])
    await supabase.from('body_photos').delete().eq('id', id)
  } catch (e) { }
}

// Bucket jest prywatny — dostep tylko przez podpisane linki (1h)
export async function signBodyPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  try {
    if (paths.length === 0) return {}
    const { data } = await supabase.storage.from('body-photos').createSignedUrls(paths, 3600)
    const map: Record<string, string> = {}
    ;(data ?? []).forEach((r: any) => { if (r.signedUrl && r.path) map[r.path] = r.signedUrl })
    return map
  } catch (e) { return {} }
}

// ============================================================
// Zgody na wglad trenera w pomiary
// ============================================================

export async function getMeasurementShares(ownerProfileId: string): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('measurement_shares')
      .select('trainer_profile_id')
      .eq('owner_profile_id', ownerProfileId)
    return (data ?? []).map((r: any) => r.trainer_profile_id)
  } catch (e) { return [] }
}

export async function setMeasurementShare(ownerProfileId: string, trainerProfileId: string, enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await supabase.from('measurement_shares').upsert(
        { owner_profile_id: ownerProfileId, trainer_profile_id: trainerProfileId },
        { onConflict: 'owner_profile_id,trainer_profile_id' }
      )
    } else {
      await supabase.from('measurement_shares')
        .delete()
        .eq('owner_profile_id', ownerProfileId)
        .eq('trainer_profile_id', trainerProfileId)
    }
  } catch (e) { }
}

// Strona trenera: pomiary podopiecznego (RLS przepuszcza tylko przy zgodzie)
export async function getClientMeasurements(clientProfileId: string): Promise<{ rows: BodyMeasurement[]; goals: Record<string, number> }> {
  const [rows, goals] = await Promise.all([
    getBodyMeasurements(clientProfileId),
    getBodyGoals(clientProfileId),
  ])
  return { rows, goals }
}

export async function getBigEvents(lat: number, lng: number): Promise<any[]> {
  try {
    const { data, error } = await supabase.functions.invoke('big-events', { body: { lat, lng } })
    if (error) { console.log('getBigEvents error:', error); return [] }
    return data?.events ?? []
  } catch (e) { return [] }
}

// Tryb goscia: zanonimizowany podglad okolicy (dziala bez zalogowania)
export async function getGuestPreview(lat: number = 0, lng: number = 0): Promise<{
  people: { initial: string; age: number; goal: string; dist_km: number | null }[]
  people_count: number
  events_week: number
  challenges_active: number
} | null> {
  const { data, error } = await supabase.rpc('get_guest_preview', { my_lat: lat, my_lng: lng })
  if (error) { console.log('getGuestPreview error:', error); return null }
  return data
}

// Ranking mojej silowni (punkty = treningi*10 + streak*2 + wyzwania*5)
export async function getGymLeaderboard(profileId: string, period: 'week' | 'month' = 'week'): Promise<any[]> {
  const { data, error } = await supabase.rpc('get_gym_leaderboard', { p_profile_id: profileId, p_period: period })
  if (error) { console.log('getGymLeaderboard error:', error); return [] }
  return data ?? []
}

// Liga silowni: pelna tabela klubow w promieniu 25 km (punkty tygodnia)
export async function getGymLeague(profileId: string): Promise<{ gym: string; points: number; members: number; is_mine: boolean }[]> {
  const { data, error } = await supabase.rpc('get_gym_league', { p_profile_id: profileId })
  if (error) { console.log('getGymLeague error:', error); return [] }
  return data ?? []
}

// Bitwa silowni: moja vs najaktywniejsza inna w miescie (ten tydzien)
export async function getGymBattle(profileId: string): Promise<{
  my_gym: string; my_points: number; my_members: number
  rival_gym: string | null; rival_points: number; rival_members: number
} | null> {
  const { data, error } = await supabase.rpc('get_gym_battle', { p_profile_id: profileId })
  if (error) { console.log('getGymBattle error:', error); return null }
  return data
}

// Pojedyncze wyzwanie/wydarzenie dla publicznych linkow (fitnessswipe.app/challenge/<id>)
export async function getChallengeById(challengeId: string): Promise<any | null> {
  const { data } = await supabase.from('challenges').select('*').eq('id', challengeId).maybeSingle()
  if (!data) return null
  const { count } = await supabase
    .from('challenge_participants')
    .select('*', { count: 'exact', head: true })
    .eq('challenge_id', challengeId)
  const { data: creator } = await supabase.from('profiles').select('name').eq('id', data.creator_id).maybeSingle()
  return { ...data, participants_count: count ?? 0, creator_name: creator?.name ?? null }
}

export async function getSportsEventById(eventId: string): Promise<any | null> {
  const { data } = await supabase.from('sports_events').select('*').eq('id', eventId).maybeSingle()
  if (!data) return null
  const { count } = await supabase
    .from('event_attendees')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
  const { data: creator } = await supabase.from('profiles').select('name').eq('id', data.creator_id).maybeSingle()
  return { ...data, attendees_count: count ?? 0, creator_name: creator?.name ?? null }
}

export async function isJoinedEvent(eventId: string, profileId: string): Promise<boolean> {
  const { data } = await supabase
    .from('event_attendees')
    .select('id')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .maybeSingle()
  return !!data
}

export async function isJoinedChallenge(challengeId: string, profileId: string): Promise<boolean> {
  const { data } = await supabase
    .from('challenge_participants')
    .select('id')
    .eq('challenge_id', challengeId)
    .eq('profile_id', profileId)
    .maybeSingle()
  return !!data
}

export async function deleteMyAccount(): Promise<void> {
  await supabase.rpc('delete_user_account')
}
