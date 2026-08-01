import { useEffect, useState } from 'react'
import { Redirect } from 'expo-router'
import { View, ActivityIndicator } from 'react-native'
import { supabase } from '../lib/supabase'

// Inteligentne przekierowanie: zalogowany -> talia, niezalogowany -> logowanie.
// Dzieki temu powrot "do domu" (np. po bledzie trasy) nie laduje na ekranie logowania.
export default function Index() {
  const [dest, setDest] = useState<'/(tabs)/swipe' | '/(auth)/login' | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setDest(session?.user ? '/(tabs)/swipe' : '/(auth)/login')
    })
  }, [])

  if (!dest) return (
    <View style={{ flex: 1, backgroundColor: '#0d1b2e', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color="#94e336" />
    </View>
  )
  return <Redirect href={dest as any} />
}
