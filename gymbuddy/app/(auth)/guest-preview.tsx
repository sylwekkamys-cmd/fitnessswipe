import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import * as Location from 'expo-location'
import { getGuestPreview } from '../../lib/supabase'

const LIME = '#94e336'
const GOLD = '#f0b429'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

type GuestData = {
  people: { initial: string; age: number; goal: string; dist_km: number | null }[]
  people_count: number
  events_week: number
  challenges_active: number
}

export default function GuestPreviewScreen() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<GuestData | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      let lat = 0, lng = 0
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          lat = loc.coords.latitude
          lng = loc.coords.longitude
        }
      } catch (e) { }
      setData(await getGuestPreview(lat, lng))
    } catch (e) { console.log('guest preview error:', e) }
    finally { setLoading(false) }
  }

  function goalLabel(goal: string): string {
    if (!goal) return ''
    const translated = t('goals.' + goal)
    return translated.startsWith('goals.') ? goal : translated
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={24} color="#fff" />
      </TouchableOpacity>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={LIME} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{t('guest.title')}</Text>
          <Text style={styles.subtitle}>
            {data?.people_count
              ? t('guest.peopleNearby', { count: data.people_count })
              : t('guest.subtitle')}
          </Text>

          {/* Zanonimizowane mini-karty */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
            {(data?.people ?? []).map((p, i) => (
              <View key={i} style={styles.personCard}>
                <View style={styles.personAvatar}>
                  <Text style={styles.personInitial}>{p.initial}.</Text>
                </View>
                <Text style={styles.personAge}>{p.initial}., {p.age}</Text>
                {p.goal ? <Text style={styles.personGoal} numberOfLines={1}>{goalLabel(p.goal)}</Text> : null}
                {p.dist_km !== null ? <Text style={styles.personDist}>{p.dist_km} km</Text> : null}
              </View>
            ))}
            {(data?.people ?? []).length === 0 && (
              <View style={styles.personCard}>
                <View style={styles.personAvatar}><Ionicons name="people" size={22} color="rgba(255,255,255,0.4)" /></View>
                <Text style={styles.personGoal}>{t('guest.beFirst')}</Text>
              </View>
            )}
          </ScrollView>

          {/* Zajawki wydarzen i wyzwan */}
          <View style={styles.teaserRow}>
            <View style={styles.teaserCard}>
              <Text style={[styles.teaserNum, { color: GOLD }]}>{data?.events_week ?? 0}</Text>
              <Text style={styles.teaserLabel}>{t('guest.eventsWeek')}</Text>
            </View>
            <View style={styles.teaserCard}>
              <Text style={[styles.teaserNum, { color: LIME }]}>{data?.challenges_active ?? 0}</Text>
              <Text style={styles.teaserLabel}>{t('guest.challengesActive')}</Text>
            </View>
          </View>

          <View style={styles.lockNote}>
            <Ionicons name="lock-closed" size={14} color="rgba(255,255,255,0.4)" />
            <Text style={styles.lockNoteText}>{t('guest.lockNote')}</Text>
          </View>

          <TouchableOpacity style={styles.ctaBtn} onPress={() => router.back()}>
            <Text style={styles.ctaBtnText}>{t('guest.cta')}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn: { position: 'absolute', top: 52, left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingTop: 110, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', paddingHorizontal: 24 },
  subtitle: { fontSize: 15, color: LIME, fontWeight: '700', paddingHorizontal: 24, marginTop: 6, marginBottom: 20 },
  cardsRow: { paddingHorizontal: 20, gap: 10 },
  personCard: { width: 110, backgroundColor: BG_LIGHT, borderRadius: 16, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  personAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#2e415c', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  personInitial: { fontSize: 18, fontWeight: '800', color: 'rgba(255,255,255,0.85)' },
  personAge: { fontSize: 13, fontWeight: '700', color: '#fff' },
  personGoal: { fontSize: 11, color: LIME, marginTop: 2, textAlign: 'center' },
  personDist: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 },
  teaserRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 20 },
  teaserCard: { flex: 1, backgroundColor: BG_LIGHT, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  teaserNum: { fontSize: 24, fontWeight: '800' },
  teaserLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
  lockNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 22, paddingHorizontal: 32 },
  lockNoteText: { fontSize: 12.5, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
  ctaBtn: { backgroundColor: LIME, borderRadius: 16, paddingVertical: 16, marginHorizontal: 24, marginTop: 14, alignItems: 'center' },
  ctaBtnText: { color: BG, fontSize: 16, fontWeight: '800' },
})
