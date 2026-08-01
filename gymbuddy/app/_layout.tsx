import { useEffect, useState, useRef } from 'react'
import { Stack } from 'expo-router'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import '../lib/i18n'
import { registerForPushNotifications, savePushToken } from '../lib/notifications'
import * as Location from 'expo-location'
import { Alert, AppState, View, Text, ScrollView } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { useTranslation } from 'react-i18next'
import { useFonts, Outfit_800ExtraBold } from '@expo-google-fonts/outfit'
import { initRevenueCat } from '../lib/revenuecat'
import { logDailyActivity } from '../lib/supabase'
import { router } from 'expo-router'

export default function RootLayout() {
  const [checked, setChecked] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [fontsLoaded] = useFonts({ Outfit_800ExtraBold })
  // Diagnostyka bootu: jesli po 7 s dalej wisimy przed pierwszym renderem,
  // zdejmij splash i pokaz co utknelo (flagi + bledy z global.__BOOT_ERRORS)
  const [showDiag, setShowDiag] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setShowDiag(true), 7000)
    return () => clearTimeout(timer)
  }, [])
  const { t, i18n: i18nInstance } = useTranslation()
  const userIdRef = useRef<string | null>(null)

  async function updateLastActive() {
    if (!userIdRef.current) return
    try {
      await supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('user_id', userIdRef.current)
    } catch (e) {
      // ignoruj bledy
    }
  }

  async function logActivityForUser(userId: string) {
    try {
      const { data: profile } = await supabase.from('profiles').select('id').eq('user_id', userId).maybeSingle()
      if (profile) await logDailyActivity(profile.id)
    } catch (e) {
      // ignoruj bledy
    }
  }

  async function checkIfBanned(userId: string): Promise<boolean> {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('is_banned, ban_reason')
        .eq('user_id', userId)
        .maybeSingle()
      if (data?.is_banned) {
        Alert.alert(
          t('common.accountSuspended') || 'Account Suspended',
          data.ban_reason || (t('common.accountSuspendedMsg') || 'Your account has been suspended for violating our community guidelines. Contact support for more information.')
        )
        await supabase.auth.signOut()
        return true
      }
      return false
    } catch (e) {
      return false
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const banned = await checkIfBanned(session.user.id)
        if (banned) {
          setIsLoggedIn(false)
          setChecked(true)
          return
        }
      }
      setIsLoggedIn(!!session?.user)
      setChecked(true)
      if (session?.user) {
        userIdRef.current = session.user.id
        initRevenueCat(session.user.id)
        registerForPushNotifications().then(token => {
          if (token) savePushToken(token)
        })
        updateLastActive()
        logActivityForUser(session.user.id)
        Location.requestForegroundPermissionsAsync().then(({ status }) => {
          if (status === 'granted') {
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(loc => {
              supabase.from('profiles').update({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
              }).eq('user_id', session.user.id)
            })
          }
        })
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const banned = await checkIfBanned(session.user.id)
        if (banned) return
        userIdRef.current = session.user.id
        initRevenueCat(session.user.id)
        registerForPushNotifications().then(token => {
          if (token) savePushToken(token)
        })
        updateLastActive()
        logActivityForUser(session.user.id)
        try {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', session.user.id)
            .maybeSingle()
          if (profile && !error) {
            router.replace('/(tabs)/swipe')
          }
          // Jesli brak profilu (error lub null) - login.tsx/gdpr-consent same nawiguja
        } catch (e) {
          // Ignoruj bledy - pozwol login.tsx nawigowac
        }
      }
      if (event === 'SIGNED_OUT') {
        userIdRef.current = null
        router.replace('/(auth)/login')
      }
    })

    // Aktualizuj last_active_at gdy aplikacja wraca na pierwszy plan
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        updateLastActive()
      }
    })

    return () => {
      subscription.unsubscribe()
      appStateSubscription.remove()
    }
  }, [])

  useEffect(() => {
    if (checked && fontsLoaded && isLoggedIn) {
      // Przekieruj tylko jesli zalogowany przy starcie aplikacji
      // onAuthStateChange obsługuje resztę przypadków
      setTimeout(() => {
        router.replace('/(tabs)/swipe')
      }, 100)
    }
  }, [checked, fontsLoaded])

  // Ochrona przed zrzutami ekranu dziala tylko na ekranie czatu
  // (patrz app/chat/[matchId].tsx) — reszta aplikacji bez ograniczen

  if (!checked || !fontsLoaded) {
    if (!showDiag) return null
    // Boot utknal — pokaz diagnostyke zamiast wiecznego splasha
    SplashScreen.hideAsync().catch(() => { })
    const errors: string[] = (global as any).__BOOT_ERRORS ?? []
    return (
      <View style={{ flex: 1, backgroundColor: '#0d1b2e', paddingTop: 70, paddingHorizontal: 20 }}>
        <Text style={{ color: '#ff6b6b', fontSize: 17, fontWeight: '800', marginBottom: 10 }}>Diagnostyka startu</Text>
        <Text style={{ color: '#fff', fontSize: 13, marginBottom: 4 }}>sesja sprawdzona (checked): {String(checked)}</Text>
        <Text style={{ color: '#fff', fontSize: 13, marginBottom: 12 }}>czcionki (fontsLoaded): {String(fontsLoaded)}</Text>
        <Text style={{ color: '#94e336', fontSize: 13, fontWeight: '700', marginBottom: 6 }}>Złapane błędy ({errors.length}):</Text>
        <ScrollView style={{ flex: 1 }}>
          {errors.length === 0 ? (
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>brak błędów JS — boot czeka na sesję/czcionki</Text>
          ) : (
            errors.map((e, i) => (
              <Text key={i} selectable style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, marginBottom: 12, fontFamily: 'Courier' }}>{e}</Text>
            ))
          )}
        </ScrollView>
      </View>
    )
  }

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[matchId]" options={{ headerShown: false, contentStyle: { backgroundColor: '#0d1b2e' } }} />
        <Stack.Screen name="profile/profile-detail" options={{ headerShown: false }} />
        <Stack.Screen name="blocked-users" options={{ headerShown: false }} />
        <Stack.Screen name="gym-live-map" options={{ headerShown: false }} />
        <Stack.Screen name="challenge-chat" options={{ headerShown: false }} />
        <Stack.Screen name="referral" options={{ headerShown: false }} />
        <Stack.Screen name="achievements" options={{ headerShown: false }} />
        <Stack.Screen name="sports-events" options={{ headerShown: false }} />
        <Stack.Screen name="profile-viewers" options={{ headerShown: false }} />
        <Stack.Screen name="lock-screen" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="premium" options={{ headerShown: false, presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  )
}
