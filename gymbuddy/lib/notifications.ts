import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { supabase, getMyProfile } from './supabase'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Powiadomienia dzialaja tylko na fizycznym urzadzeniu')
    return null
  }
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') {
    console.log('Brak uprawnien do powiadomien')
    return null
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'FitnessSwipe',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7dc52e',
    })
  }
  const token = (await Notifications.getExpoPushTokenAsync()).data
  return token
}

export async function savePushToken(token: string) {
  const profile = await getMyProfile()
  if (!profile) return
  await supabase.from('profiles').update({ push_token: token }).eq('id', profile.id)
}

export async function sendPushNotification(pushToken: string, title: string, body: string, data: any = {}) {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: pushToken,
      sound: 'default',
      title,
      body,
      data,
    }),
  })
}

// Powiadamia matchy uzytkownika znajdujacych sie w zadanym promieniu od punktu (lat, lng)
// Uzywane przy tworzeniu wyzwania / wydarzenia z opcja "powiadom okolice"
export async function notifyMatchesNearby(
  myProfileId: string,
  lat: number,
  lng: number,
  radiusKm: number,
  title: string,
  body: string,
  data: any = {}
) {
  try {
    const { data: matchData } = await supabase
      .from('matches')
      .select('profile_a_id, profile_b_id')
      .or(`profile_a_id.eq.${myProfileId},profile_b_id.eq.${myProfileId}`)
      .not('is_trainer_chat', 'is', true)
    if (!matchData || matchData.length === 0) return
    const otherIds = matchData.map(m => m.profile_a_id === myProfileId ? m.profile_b_id : m.profile_a_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, latitude, longitude')
      .in('id', otherIds)

    function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
      const R = 6371
      const dLat = (lat2 - lat1) * Math.PI / 180
      const dLng = (lng2 - lng1) * Math.PI / 180
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

    for (const p of profiles ?? []) {
      // Brak lokalizacji odbiorcy albo tworcy = wysylamy (lepiej powiadomic niz pominac)
      const inRange = !lat || !lng || p.latitude == null || p.longitude == null
        ? true
        : distanceKm(lat, lng, p.latitude, p.longitude) <= radiusKm
      if (inRange) notifyProfile(p.id, title, body, data)
    }
  } catch (e) {
    console.log('notifyMatchesNearby error:', e)
  }
}

// Wysyla powiadomienie push do uzytkownika na podstawie jego profile.id
// Uzywane przy nowym matchu, wiadomosci i polubieniu
export async function notifyProfile(profileId: string, title: string, body: string, data: any = {}) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('push_token, notif_matches, notif_messages')
      .eq('id', profileId)
      .single()
    if (!profile?.push_token) return

    // Respektuj preferencje odbiorcy z ustawien
    const type = data?.type
    if ((type === 'match' || type === 'like') && (profile as any).notif_matches === false) return
    if (type === 'message' && (profile as any).notif_messages === false) return

    await sendPushNotification(profile.push_token, title, body, data)
  } catch (e) {
    console.log('notifyProfile error:', e)
  }
}
