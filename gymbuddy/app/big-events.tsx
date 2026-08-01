import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, Linking, Alert } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { supabase, getMyProfile, getBigEvents, createSportsEvent } from '../lib/supabase'

const LIME = '#94e336'
const GOLD = '#f0b429'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// Gatunek Ticketmaster -> nasz typ sportu (dla tworzonej ekipy)
const GENRE_MAP: Record<string, string> = {
  Soccer: 'football', Football: 'football', Basketball: 'basketball', Tennis: 'tennis',
  Athletics: 'running', Running: 'running', Cycling: 'cycling', Swimming: 'swimming',
}

export default function BigEventsScreen() {
  const { t, i18n } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [crews, setCrews] = useState<Record<string, { count: number; firstId: string }>>({})

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      if (!me) return
      setProfile(me)
      const list = await getBigEvents((me as any).latitude ?? 0, (me as any).longitude ?? 0)
      setEvents(list)
      await loadCrews(list)
    } catch (e) { console.log('big events screen error:', e) }
    finally { setLoading(false) }
  }

  // Ekipy z FitnessSwipe doczepione do duzych eventow
  async function loadCrews(list: any[]) {
    const ids = list.map(e => e.id)
    if (ids.length === 0) return
    const { data } = await supabase
      .from('sports_events')
      .select('id, external_ref')
      .in('external_ref', ids)
    const map: Record<string, { count: number; firstId: string }> = {}
    for (const row of data ?? []) {
      if (!map[row.external_ref]) map[row.external_ref] = { count: 0, firstId: row.id }
      map[row.external_ref].count++
    }
    setCrews(map)
  }

  async function handleGatherCrew(be: any) {
    if (!profile || creating) return
    setCreating(be.id)
    try {
      const sportType = GENRE_MAP[be.genre] ?? 'other'
      const venue = [be.venue, be.city].filter(Boolean).join(', ')
      const result = await createSportsEvent(
        profile.id,
        be.name,
        t('events.crewDescription', { venue }),
        sportType,
        be.date,
        (be.time ?? '12:00:00').slice(0, 5),
        venue || be.name,
        (profile as any).latitude ?? 0,
        (profile as any).longitude ?? 0,
        null,
        100,
        be.id
      )
      if (result.success && result.eventId) {
        await loadCrews(events)
        Alert.alert('💪', t('events.crewCreated'), [
          { text: 'OK', onPress: () => router.push(`/event/${result.eventId}` as any) },
        ])
      } else {
        Alert.alert(t('common.error'))
      }
    } finally { setCreating(null) }
  }

  // Grupowanie po miesiacu
  const groups: { key: string; label: string; items: any[] }[] = []
  for (const e of events) {
    if (!e.date) continue
    const d = new Date(e.date + 'T12:00:00')
    const key = `${d.getFullYear()}-${d.getMonth()}`
    let g = groups.find(x => x.key === key)
    if (!g) {
      g = { key, label: `${t('months.' + MONTH_KEYS[d.getMonth()])} ${d.getFullYear()}`, items: [] }
      groups.push(g)
    }
    g.items.push(e)
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{'🎟️'} {t('events.bigNearby')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={LIME} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
          {groups.map(g => (
            <View key={g.key}>
              <Text style={styles.monthHeader}>{g.label.toUpperCase()}</Text>
              {g.items.map(be => {
                const d = new Date(be.date + 'T12:00:00')
                const crew = crews[be.id]
                return (
                  <View key={be.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={styles.dateTile}>
                        <Text style={styles.dateDay}>{d.getDate()}</Text>
                        <Text style={styles.dateMonth}>{t('months.' + MONTH_KEYS[d.getMonth()]).slice(0, 3).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardName} numberOfLines={2}>{be.name}</Text>
                        <Text style={styles.cardMeta} numberOfLines={1}>
                          {be.venue ?? ''}{be.city ? ` · ${be.city}` : ''}{be.genre ? ` · ${be.genre}` : ''}
                        </Text>
                      </View>
                      {be.image ? <Image source={{ uri: be.image }} style={styles.cardThumb} /> : null}
                    </View>
                    <View style={styles.cardActions}>
                      <TouchableOpacity style={styles.crewBtn} onPress={() => handleGatherCrew(be)} disabled={creating === be.id}>
                        {creating === be.id ? <ActivityIndicator size="small" color={BG} /> : (
                          <Text style={styles.crewBtnText}>{t('events.gatherCrew')} {'💪'}</Text>
                        )}
                      </TouchableOpacity>
                      {be.url ? (
                        <TouchableOpacity style={styles.ticketsBtn} onPress={() => Linking.openURL(be.url).catch(() => { })}>
                          <Text style={styles.ticketsBtnText}>{t('events.tickets')}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {crew && (
                      <TouchableOpacity style={styles.crewChip} onPress={() => router.push(`/event/${crew.firstId}` as any)}>
                        <Ionicons name="people" size={13} color={LIME} />
                        <Text style={styles.crewChipText}>{t('events.crewsGoing', { count: crew.count })}</Text>
                        <Ionicons name="chevron-forward" size={13} color={LIME} />
                      </TouchableOpacity>
                    )}
                  </View>
                )
              })}
            </View>
          ))}
          {groups.length === 0 && (
            <View style={styles.center}>
              <Text style={{ fontSize: 44, marginBottom: 10, marginTop: 60 }}>{'🎟️'}</Text>
              <Text style={styles.emptyText}>{t('events.bigEmpty')}</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 55, paddingBottom: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  monthHeader: { fontSize: 11, fontWeight: '800', color: LIME, letterSpacing: 1.5, paddingHorizontal: 16, marginTop: 14, marginBottom: 8 },
  card: { backgroundColor: BG_LIGHT, borderRadius: 16, marginHorizontal: 16, marginBottom: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateTile: { width: 46, backgroundColor: BG, borderRadius: 12, paddingVertical: 7, alignItems: 'center' },
  dateDay: { fontSize: 18, fontWeight: '800', color: LIME },
  dateMonth: { fontSize: 9.5, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  cardName: { fontSize: 14.5, fontWeight: '800', color: '#fff' },
  cardMeta: { fontSize: 11.5, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  cardThumb: { width: 52, height: 52, borderRadius: 10 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  crewBtn: { flex: 1, backgroundColor: LIME, borderRadius: 11, paddingVertical: 9, alignItems: 'center' },
  crewBtnText: { fontSize: 12.5, fontWeight: '800', color: BG },
  ticketsBtn: { flex: 1, backgroundColor: BG, borderRadius: 11, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  ticketsBtnText: { fontSize: 12.5, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  crewChip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9, backgroundColor: 'rgba(148,227,54,0.1)', borderWidth: 1, borderColor: 'rgba(148,227,54,0.35)', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, alignSelf: 'flex-start' },
  crewChipText: { fontSize: 11.5, fontWeight: '700', color: LIME },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
})
