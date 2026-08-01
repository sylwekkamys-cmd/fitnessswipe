import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { getMyProfile, getChallengeById, joinChallenge, isJoinedChallenge } from '../../lib/supabase'

const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

// Te same kolory banerow co na liscie wyzwan
const GOAL_COLORS: Record<string, [string, string]> = {
  weight_loss: ['#0e4a63', '#1a7fa8'],
  distance_running: ['#7a3b10', '#c26422'],
  distance_cycling: ['#4a2570', '#7a42b5'],
  padel_sessions: ['#0f6b46', '#17a06a'],
  pickleball_sessions: ['#7a1f4a', '#b53b78'],
  hyrox: ['#5c1010', '#a32020'],
  walking_steps: ['#2d5016', '#4f8422'],
  cold_exposure: ['#173f66', '#2e7ab8'],
  custom: ['#37474f', '#5a7484'],
}

const GOAL_ICONS: Record<string, string> = {
  weight_loss: 'trending-down', distance_running: 'walk', distance_cycling: 'bicycle',
  padel_sessions: 'tennisball', pickleball_sessions: 'baseball-outline', hyrox: 'fitness',
  walking_steps: 'footsteps', cold_exposure: 'snow', custom: 'flag',
}

export default function ChallengeLinkScreen() {
  const { t } = useTranslation()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [challenge, setChallenge] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    setLoading(true)
    try {
      const [c, me] = await Promise.all([getChallengeById(String(id)), getMyProfile()])
      setChallenge(c)
      setProfile(me)
      if (c && me) setJoined(await isJoinedChallenge(c.id, me.id))
    } catch (e) { console.log('challenge link load error:', e) }
    finally { setLoading(false) }
  }

  function getDaysLeft(endDate: string) {
    const diff = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000)
    return Math.max(diff, 0)
  }

  async function handleJoin() {
    if (!challenge || !profile) return
    setJoining(true)
    try {
      const ok = await joinChallenge(challenge.id, profile.id)
      if (ok) {
        setJoined(true)
        Alert.alert('🏆', t('publicLink.joinedChallenge'), [
          { text: 'OK', onPress: () => router.replace('/(tabs)/challenges' as any) },
        ])
      } else {
        Alert.alert(t('common.error'), t('publicLink.joinFailed'))
      }
    } finally { setJoining(false) }
  }

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" color={LIME} /></View>
  )

  if (!challenge) return (
    <View style={styles.center}>
      <Text style={{ fontSize: 44, marginBottom: 12 }}>{"🤷"}</Text>
      <Text style={styles.notFoundText}>{t('publicLink.notFound')}</Text>
      <TouchableOpacity style={styles.browseBtn} onPress={() => router.replace('/(tabs)/challenges' as any)}>
        <Text style={styles.browseBtnText}>{t('publicLink.browse')}</Text>
      </TouchableOpacity>
    </View>
  )

  const colors = GOAL_COLORS[challenge.goal_type] ?? GOAL_COLORS.custom
  const icon = GOAL_ICONS[challenge.goal_type] ?? 'flag'
  const daysLeft = getDaysLeft(challenge.end_date)

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/challenges' as any)}>
        <Ionicons name="chevron-back" size={24} color="#fff" />
      </TouchableOpacity>

      <LinearGradient colors={colors} style={styles.banner}>
        <View style={styles.bannerIcon}>
          <Ionicons name={icon as any} size={34} color="#fff" />
        </View>
        <Text style={styles.inviteLabel}>{t('publicLink.challengeInvite')}</Text>
        <Text style={styles.title}>{challenge.title}</Text>
        {challenge.creator_name && (
          <Text style={styles.creator}>{t('publicLink.organizer')}: {challenge.creator_name}</Text>
        )}
      </LinearGradient>

      {challenge.description ? <Text style={styles.description}>{challenge.description}</Text> : null}

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{challenge.goal_value} {challenge.goal_unit}</Text>
          <Text style={styles.statLabel}>{t('publicLink.goal')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{daysLeft}</Text>
          <Text style={styles.statLabel}>{t('challenges.daysLeft')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{challenge.participants_count}</Text>
          <Text style={styles.statLabel}>{t('publicLink.participants')}</Text>
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
              <Ionicons name="trophy" size={20} color="#0d1b2e" />
              <Text style={styles.joinBtnText}>{t('publicLink.join')}</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.browseLink} onPress={() => router.replace('/(tabs)/challenges' as any)}>
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
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 22, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: BG_LIGHT, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  statNum: { fontSize: 17, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4, textAlign: 'center' },
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
