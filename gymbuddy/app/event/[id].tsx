import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { getMyProfile, getSportsEventById, joinSportsEvent, isJoinedEvent } from '../../lib/supabase'

const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

// Te same kolory banerow co na liscie wydarzen
const SPORT_COLORS: Record<string, [string, string]> = {
  running: ['#7a3b10', '#c26422'],
  cycling: ['#4a2570', '#7a42b5'],
  padel: ['#0f6b46', '#17a06a'],
  pickleball: ['#7a1f4a', '#b53b78'],
  hyrox: ['#5c1010', '#a32020'],
  football: ['#2d5016', '#4f8422'],
  basketball: ['#7a2410', '#b8441e'],
  tennis: ['#6b5d10', '#a8921e'],
  swimming: ['#173f66', '#2e7ab8'],
  other: ['#37474f', '#5a7484'],
}

const SPORT_ICONS: Record<string, string> = {
  running: 'walk', cycling: 'bicycle', padel: 'tennisball', pickleball: 'baseball-outline',
  hyrox: 'fitness', football: 'football', basketball: 'basketball', tennis: 'tennisball-outline',
  swimming: 'water', other: 'flag',
}

export default function EventLinkScreen() {
  const { t } = useTranslation()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [event, setEvent] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    setLoading(true)
    try {
      const [ev, me] = await Promise.all([getSportsEventById(String(id)), getMyProfile()])
      setEvent(ev)
      setProfile(me)
      if (ev && me) setJoined(await isJoinedEvent(ev.id, me.id))
    } catch (e) { console.log('event link load error:', e) }
    finally { setLoading(false) }
  }

  async function handleJoin() {
    if (!event || !profile) return
    if (event.max_participants && event.attendees_count >= event.max_participants) {
      Alert.alert(t('common.error'), t('publicLink.eventFull'))
      return
    }
    setJoining(true)
    try {
      const ok = await joinSportsEvent(event.id, profile.id)
      if (ok) {
        setJoined(true)
        Alert.alert('🎉', t('publicLink.joinedEvent'), [
          {
            text: t('common.share'),
            onPress: async () => {
              const link = `https://fitnessswipe.app/event/${event.id}`
              const { Share } = await import('react-native')
              try {
                await Share.share({
                  message: t('events.shareMessage', {
                    title: event.title, venue: event.venue_name,
                    date: event.event_date, time: event.event_time, link,
                  }),
                })
              } catch (e) { }
              router.replace('/sports-events' as any)
            },
          },
          { text: 'OK', onPress: () => router.replace('/sports-events' as any) },
        ])
      } else {
        Alert.alert(t('common.error'), t('publicLink.joinFailed'))
      }
    } finally { setJoining(false) }
  }

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" color={LIME} /></View>
  )

  if (!event) return (
    <View style={styles.center}>
      <Text style={{ fontSize: 44, marginBottom: 12 }}>{"🤷"}</Text>
      <Text style={styles.notFoundText}>{t('publicLink.notFound')}</Text>
      <TouchableOpacity style={styles.browseBtn} onPress={() => router.replace('/sports-events' as any)}>
        <Text style={styles.browseBtnText}>{t('publicLink.browse')}</Text>
      </TouchableOpacity>
    </View>
  )

  const colors = SPORT_COLORS[event.sport_type] ?? SPORT_COLORS.other
  const icon = SPORT_ICONS[event.sport_type] ?? 'flag'
  const spotsLeft = event.max_participants ? Math.max(event.max_participants - event.attendees_count, 0) : null

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/sports-events' as any)}>
        <Ionicons name="chevron-back" size={24} color="#fff" />
      </TouchableOpacity>

      <LinearGradient colors={colors} style={styles.banner}>
        <View style={styles.bannerIcon}>
          <Ionicons name={icon as any} size={34} color="#fff" />
        </View>
        <Text style={styles.inviteLabel}>{t('publicLink.eventInvite')}</Text>
        <Text style={styles.title}>{event.title}</Text>
        {event.creator_name && (
          <Text style={styles.creator}>{t('publicLink.organizer')}: {event.creator_name}</Text>
        )}
      </LinearGradient>

      {event.description ? <Text style={styles.description}>{event.description}</Text> : null}

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={18} color={LIME} />
          <Text style={styles.infoText}>{event.event_date} · {event.event_time?.slice(0, 5)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={18} color={LIME} />
          <Text style={styles.infoText}>{event.venue_name}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="people-outline" size={18} color={LIME} />
          <Text style={styles.infoText}>
            {event.attendees_count}{event.max_participants ? ` / ${event.max_participants}` : ''} · {t('publicLink.participants')}
            {spotsLeft !== null && spotsLeft > 0 ? `  (${t('publicLink.spotsLeft', { count: spotsLeft })})` : ''}
          </Text>
        </View>
      </View>

      {joined ? (
        <View style={styles.joinedBox}>
          <Ionicons name="checkmark-circle" size={22} color={LIME} />
          <Text style={styles.joinedText}>{t('publicLink.alreadyJoined')}</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.joinBtn} onPress={handleJoin} disabled={joining}>
          {joining ? <ActivityIndicator color="#0d1b2e" /> : (
            <>
              <Ionicons name="flash" size={20} color="#0d1b2e" />
              <Text style={styles.joinBtnText}>{t('publicLink.join')}</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.browseLink} onPress={() => router.replace('/sports-events' as any)}>
        <Text style={styles.browseLinkText}>{t('publicLink.browse')}</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG, paddingHorizontal: 32 },
  backBtn: { position: 'absolute', top: 52, left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  banner: { paddingTop: 104, paddingBottom: 28, paddingHorizontal: 24, alignItems: 'center', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  bannerIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  inviteLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 },
  title: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center' },
  creator: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 8 },
  description: { fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 21, paddingHorizontal: 24, marginTop: 20, textAlign: 'center' },
  infoCard: { backgroundColor: BG_LIGHT, borderRadius: 18, marginHorizontal: 16, marginTop: 22, marginBottom: 24, padding: 18, gap: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoText: { flex: 1, fontSize: 14.5, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  joinBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: LIME, borderRadius: 16, paddingVertical: 16, marginHorizontal: 24 },
  joinBtnText: { color: '#0d1b2e', fontSize: 17, fontWeight: '800' },
  joinedBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 24, borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.4)', borderRadius: 16, paddingVertical: 15 },
  joinedText: { color: LIME, fontSize: 15, fontWeight: '700' },
  browseLink: { alignItems: 'center', paddingVertical: 18, marginBottom: 30 },
  browseLinkText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, textDecorationLine: 'underline' },
  notFoundText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center', marginBottom: 20 },
  browseBtn: { backgroundColor: LIME, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 28 },
  browseBtnText: { color: '#0d1b2e', fontSize: 15, fontWeight: '800' },
})
