import React, { useState, useCallback } from 'react'
import { Tabs, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { getMyProfile, getUnreadCounts, touchLastSeen } from '../../lib/supabase'

const PRIMARY = '#7dc52e'

export default function TabsLayout() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [totalUnread, setTotalUnread] = useState(0)
  const [trainerUnread, setTrainerUnread] = useState(0)

  useFocusEffect(
    useCallback(() => {
      let active = true
      let myId: string | null = null
      let amTrainer = false
      let showSteps = false
      let trainerChatIds: Set<string> = new Set()
      let lastSeenTouch = 0
      let lastStepsSync = 0

      async function refresh() {
        try {
          if (!myId) {
            const me = await getMyProfile()
            if (!me || !active) return
            myId = me.id
            amTrainer = !!(me as any).is_trainer
            showSteps = !!(me as any).show_steps
          }
          // Obecnosc: znacznik "ostatnio widziany" co ~minute, poki apka otwarta
          if (Date.now() - lastSeenTouch > 60000) {
            lastSeenTouch = Date.now()
            touchLastSeen(myId)
          }
          // Kroki na profil publiczny (gdy wlaczone) — co ~5 minut
          if (showSteps && Date.now() - lastStepsSync > 300000) {
            lastStepsSync = Date.now()
            try {
              const { syncStepsToProfile } = await import('../../lib/health')
              syncStepsToProfile(myId, true)
            } catch (e) { }
          }
          // Rozmowy klient-trener trenera lataja pod zakladka Trenerzy, nie Dopasowania
          if (amTrainer) {
            const { supabase } = await import('../../lib/supabase')
            const { data } = await supabase
              .from('matches').select('id')
              .eq('is_trainer_chat', true)
              .or(`profile_a_id.eq.${myId},profile_b_id.eq.${myId}`)
            trainerChatIds = new Set((data ?? []).map((m: any) => m.id))
          }
          const counts = await getUnreadCounts(myId)
          let matchesTotal = 0
          let trainerTotal = 0
          for (const [matchId, n] of Object.entries(counts)) {
            if (trainerChatIds.has(matchId)) trainerTotal += n
            else matchesTotal += n
          }
          if (active) { setTotalUnread(matchesTotal); setTrainerUnread(trainerTotal) }
        } catch (e) {}
      }

      refresh()
      const interval = setInterval(refresh, 10000)
      return () => { active = false; clearInterval(interval) }
    }, [])
  )

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: PRIMARY,
        tabBarInactiveTintColor: '#aaa',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.06)',
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 8,
          backgroundColor: '#1a2a44',
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="swipe"
        options={{
          title: t('tabs.discover'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="flame" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="challenges"
        options={{
          title: t('tabs.challenges') || 'Challenges',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: t('tabs.matches'),
          tabBarBadge: totalUnread > 0 ? (totalUnread > 9 ? '9+' : totalUnread) : undefined,
          tabBarBadgeStyle: { backgroundColor: PRIMARY, color: '#fff', fontSize: 11 },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="trainers"
        options={{
          title: t('tabs.trainers'),
          tabBarBadge: trainerUnread > 0 ? (trainerUnread > 9 ? '9+' : trainerUnread) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#d4af37', color: '#0b0b0e', fontSize: 11 },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="school" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
