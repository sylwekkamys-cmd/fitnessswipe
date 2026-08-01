import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, Modal } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useTranslation } from 'react-i18next'
import { supabase, getMyProfile, getProfileViewers, doSwipe } from '../lib/supabase'

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function ProfileViewersScreen() {
  const { t, i18n } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [viewers, setViewers] = useState<any[]>([])
  const [myProfile, setMyProfile] = useState<any>(null)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [matchedProfile, setMatchedProfile] = useState<any>(null)
  const [dailyRows, setDailyRows] = useState<{ day: string; count: number }[]>([])
  const [matchIds, setMatchIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      if (me) {
        setMyProfile(me)
        const list = await getProfileViewers(me.id)
        setViewers(list)

        // Dzienne liczniki (wykres + trend, ostatnie 14 dni)
        const since = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]
        const { data: daily } = await supabase
          .from('profile_view_daily')
          .select('day, count')
          .eq('viewed_id', me.id)
          .gte('day', since)
        setDailyRows(daily ?? [])

        // Matche - do konwersji i chipow
        const { data: matchData } = await supabase
          .from('matches')
          .select('profile_a_id, profile_b_id')
          .or(`profile_a_id.eq.${me.id},profile_b_id.eq.${me.id}`)
          .not('is_trainer_chat', 'is', true)
        setMatchIds(new Set((matchData ?? []).map((m: any) => m.profile_a_id === me.id ? m.profile_b_id : m.profile_a_id)))

        // Osoby juz polubione — przycisk od razu pokazuje ✓ zamiast plomienia
        const { data: myLikes } = await supabase
          .from('swipes')
          .select('swiped_id')
          .eq('swiper_id', me.id)
          .eq('direction', 'right')
        setLikedIds(new Set((myLikes ?? []).map((s: any) => s.swiped_id)))
      }
    } catch (e) {
      console.log('loadData profile-viewers error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleLike(viewer: any) {
    if (!myProfile || likedIds.has(viewer.id)) return
    setLikedIds(prev => new Set(prev).add(viewer.id))
    try {
      const result = await doSwipe(myProfile.id, viewer.id, 'right')
      if (result.matched) {
        setMatchedProfile(viewer)
      }
    } catch (e) {
      setLikedIds(prev => { const s = new Set(prev); s.delete(viewer.id); return s })
    }
  }

  function formatTimeAgo(dateStr: string) {
    const diffMs = Date.now() - new Date(dateStr).getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)
    if (diffMins < 60) return (t('viewers.minutesAgo', { count: diffMins }) || `${diffMins}m ago`)
    if (diffHours < 24) return (t('viewers.hoursAgo', { count: diffHours }) || `${diffHours}h ago`)
    return (t('viewers.daysAgo', { count: diffDays }) || `${diffDays}d ago`)
  }

  // Wspolne cechy z widzem - powod, zeby napisac
  function sharedTraits(viewer: any): string[] {
    const traits: string[] = []
    const myGoals: string[] = myProfile?.goals ?? []
    const shared = myGoals.filter(g => (viewer.goals ?? []).includes(g))
    if (shared.length > 0) traits.push('✓ ' + (t('goals.' + shared[0]) || shared[0]))
    if (myProfile?.gym_name && viewer.gym_name && myProfile.gym_name.trim().toLowerCase() === viewer.gym_name.trim().toLowerCase()) {
      traits.push(t('viewers.sameGym') || 'Ta sama siłownia')
    }
    if (myProfile?.fitness_level && myProfile.fitness_level === viewer.fitness_level) {
      traits.push(t('viewers.sameLevel') || 'Ten sam poziom')
    }
    return traits.slice(0, 2)
  }

  function viewerDistance(viewer: any): string | null {
    const myLat = (myProfile as any)?.latitude
    const myLng = (myProfile as any)?.longitude
    if (myLat == null || myLng == null || viewer.latitude == null || viewer.longitude == null) return null
    const d = distanceKm(myLat, myLng, viewer.latitude, viewer.longitude)
    return d < 1 ? '< 1 km' : Math.round(d) + ' km'
  }

  // ===== Statystyki z dziennych licznikow =====
  const dayKey = (offset: number) => {
    const d = new Date(Date.now() - offset * 86400000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const countFor = (key: string) => dailyRows.find(r => r.day === key)?.count ?? 0
  const todayCount = countFor(dayKey(0))
  const week = Array.from({ length: 7 }, (_, i) => countFor(dayKey(6 - i)))
  const weekSum = week.reduce((a, b) => a + b, 0)
  const prevWeekSum = Array.from({ length: 7 }, (_, i) => countFor(dayKey(13 - i))).reduce((a, b) => a + b, 0)
  const trendPct = prevWeekSum > 0 ? Math.round(((weekSum - prevWeekSum) / prevWeekSum) * 100) : (weekSum > 0 ? 100 : 0)
  const maxBar = Math.max(1, ...week)
  const matchedViewers = viewers.filter(v => matchIds.has(v.id)).length
  const conversionPct = viewers.length > 0 ? Math.round((matchedViewers / viewers.length) * 100) : 0

  // Najlepszy dzien tygodnia z ostatnich 14 dni
  let bestDayLabel: string | null = null
  if (dailyRows.length > 0) {
    const byDow: Record<number, number> = {}
    dailyRows.forEach(r => {
      const dow = new Date(r.day + 'T12:00:00').getDay()
      byDow[dow] = (byDow[dow] ?? 0) + r.count
    })
    const best = Object.entries(byDow).sort((a, b) => b[1] - a[1])[0]
    if (best && best[1] > 0) {
      const ref = new Date()
      ref.setDate(ref.getDate() + ((parseInt(best[0]) - ref.getDay() + 7) % 7))
      try {
        bestDayLabel = ref.toLocaleDateString(i18n.language, { weekday: 'long' })
      } catch (e) { bestDayLabel = null }
    }
  }

  // Grupowanie: Dzisiaj / Wczoraj / Wczesniej
  const now = new Date()
  const isSameDay = (d: Date, ref: Date) => d.toDateString() === ref.toDateString()
  const yesterday = new Date(now.getTime() - 86400000)
  const groups: { key: string; label: string; items: any[] }[] = [
    { key: 'today', label: t('viewers.groupToday') || 'Dzisiaj', items: [] },
    { key: 'yesterday', label: t('viewers.groupYesterday') || 'Wczoraj', items: [] },
    { key: 'earlier', label: t('viewers.groupEarlier') || 'Wcześniej', items: [] },
  ]
  viewers.forEach(v => {
    const d = new Date(v.viewed_at)
    if (isSameDay(d, now)) groups[0].items.push(v)
    else if (isSameDay(d, yesterday)) groups[1].items.push(v)
    else groups[2].items.push(v)
  })

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={PRIMARY} />
    </View>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t('viewers.title') || 'Profile Views'}</Text>
          <Text style={styles.headerSubtitle}>{viewers.length} {t('viewers.subtitle') || 'people viewed your profile'}</Text>
        </View>
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Kafelki statystyk */}
        <View style={styles.statTilesRow}>
          <View style={styles.statTile}>
            <Text style={[styles.statTileNum, { color: '#4fc3f7' }]}>{todayCount}</Text>
            <Text style={styles.statTileLabel}>{t('viewers.statToday') || 'dziś'}</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={[styles.statTileNum, { color: LIME }]}>{weekSum}</Text>
            <Text style={styles.statTileLabel}>{t('viewers.statWeek') || 'w tym tygodniu'}</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={[styles.statTileNum, { color: '#ffb340' }]}>{conversionPct}%</Text>
            <Text style={styles.statTileLabel}>{t('viewers.statMatches') || '→ matche'}</Text>
          </View>
        </View>

        {/* Wykres 7 dni + trend */}
        <View style={styles.chartCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.chartTitle}>{t('viewers.chartTitle') || 'Ostatnie 7 dni'}</Text>
            <Text style={[styles.chartTrend, { color: trendPct >= 0 ? LIME : '#ff8080' }]}>
              {trendPct >= 0 ? '+' : ''}{trendPct}% {t('viewers.vsLastWeek') || 'vs poprzedni tydzień'}
            </Text>
          </View>
          <View style={styles.chartBars}>
            {week.map((c, i) => (
              <View key={i} style={styles.chartBarCol}>
                <View style={[
                  styles.chartBar,
                  {
                    height: Math.max(4, (c / maxBar) * 44),
                    backgroundColor: i === 6 ? LIME : `rgba(79,195,247,${0.35 + (c / maxBar) * 0.55})`,
                  },
                ]} />
              </View>
            ))}
          </View>
        </View>

        {/* Insight */}
        {(trendPct >= 20 || bestDayLabel) && (
          <LinearGradient colors={['#2d5016', '#4f8422']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.insightCard}>
            <Text style={{ fontSize: 18 }}>🔥</Text>
            <View style={{ flex: 1 }}>
              {trendPct >= 20 && (
                <Text style={styles.insightTitle}>{t('viewers.hotTitle') || 'Twój profil jest na fali!'}</Text>
              )}
              {bestDayLabel && (
                <Text style={styles.insightSub}>{(t('viewers.bestDay') || 'Najwięcej odwiedzin:')} {bestDayLabel}</Text>
              )}
            </View>
          </LinearGradient>
        )}

        {viewers.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="eye-outline" size={36} color="#4fc3f7" />
            </View>
            <Text style={styles.emptyTitle}>{t('viewers.empty') || 'No views yet'}</Text>
            <Text style={styles.emptySubtitle}>{t('viewers.emptySub') || 'When someone views your profile, they will appear here'}</Text>
          </View>
        ) : (
          groups.filter(g => g.items.length > 0).map(group => (
            <View key={group.key}>
              <Text style={styles.groupHeader}>{group.label}</Text>
              {group.items.map((viewer) => {
                const traits = sharedTraits(viewer)
                const dist = viewerDistance(viewer)
                return (
                  <View key={viewer.id} style={styles.viewerRow}>
                    <TouchableOpacity
                      style={styles.viewerTouchable}
                      onPress={() => router.push({ pathname: '/profile/profile-detail', params: { profileId: viewer.id } })}
                      activeOpacity={0.8}
                    >
                      <Image source={{ uri: viewer.photo_urls?.[0] ?? 'https://i.pravatar.cc/100' }} style={styles.viewerAvatar} />
                      <View style={{ flex: 1 }}>
                        <View style={styles.viewerNameRow}>
                          <Text style={styles.viewerName}>{viewer.name}{viewer.age ? `, ${viewer.age}` : ''}</Text>
                          {viewer.is_verified && <Ionicons name="shield-checkmark" size={13} color="#4fc3f7" />}
                          {(viewer.view_count ?? 1) > 1 && (
                            <View style={styles.returnBadge}>
                              <Text style={styles.returnBadgeText}>{viewer.view_count}×</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.viewerTime}>
                          {formatTimeAgo(viewer.viewed_at)}{dist ? '  ·  📍 ' + dist : ''}
                        </Text>
                        {traits.length > 0 && (
                          <View style={styles.traitsRow}>
                            {traits.map(tr => (
                              <View key={tr} style={styles.traitChip}>
                                <Text style={styles.traitChipText}>{tr}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.likeBtn, likedIds.has(viewer.id) && styles.likeBtnDone]}
                      onPress={() => handleLike(viewer)}
                      disabled={likedIds.has(viewer.id)}
                    >
                      <Ionicons name={likedIds.has(viewer.id) ? 'checkmark' : 'flame'} size={18} color={likedIds.has(viewer.id) ? LIME : BG} />
                    </TouchableOpacity>
                  </View>
                )
              })}
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={!!matchedProfile} transparent animationType="fade" onRequestClose={() => setMatchedProfile(null)}>
        <View style={styles.matchOverlay}>
          <View style={styles.matchCard}>
            <Text style={{ fontSize: 48 }}>🤝</Text>
            <Text style={styles.matchTitle}>{t('swipe.match') || 'New training partner!'}</Text>
            <Text style={styles.matchSub}>{matchedProfile?.name}</Text>
            <TouchableOpacity style={styles.matchBtn} onPress={() => { setMatchedProfile(null); router.push('/(tabs)/matches') }}>
              <Text style={styles.matchBtnText}>{t('swipe.sendMessage') || 'Send a message'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.matchBtnOutline} onPress={() => setMatchedProfile(null)}>
              <Text style={styles.matchBtnOutlineText}>{t('swipe.keepSwiping') || 'Continue'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 55, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 19, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: '#4fc3f7', marginTop: 2, fontWeight: '600' },

  list: { flex: 1, paddingHorizontal: 20 },

  statTilesRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statTile: { flex: 1, backgroundColor: BG_LIGHT, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  statTileNum: { fontSize: 20, fontWeight: '800', color: '#fff' },
  statTileLabel: { fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 3, textAlign: 'center' },

  chartCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BG_LIGHT, borderRadius: 14, padding: 14, marginBottom: 10 },
  chartTitle: { fontSize: 13, fontWeight: '700', color: '#fff' },
  chartTrend: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 44 },
  chartBarCol: { justifyContent: 'flex-end' },
  chartBar: { width: 10, borderRadius: 3 },

  insightCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 12, marginBottom: 10 },
  insightTitle: { fontSize: 13, fontWeight: '700', color: '#fff' },
  insightSub: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 1 },

  groupHeader: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 12, marginBottom: 8 },

  emptyState: { alignItems: 'center', marginTop: 40, paddingHorizontal: 30 },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,170,255,0.1)', borderWidth: 1.5, borderColor: 'rgba(0,170,255,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 20 },

  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BG_LIGHT, borderRadius: 16, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  viewerTouchable: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  viewerAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: BG },
  viewerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  viewerName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  returnBadge: { backgroundColor: 'rgba(255,80,80,0.2)', borderWidth: 1, borderColor: 'rgba(255,120,120,0.5)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  returnBadgeText: { fontSize: 10, fontWeight: '800', color: '#ff8080' },
  viewerTime: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  traitsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  traitChip: { backgroundColor: 'rgba(148,227,54,0.12)', borderWidth: 1, borderColor: 'rgba(148,227,54,0.35)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  traitChipText: { fontSize: 10, fontWeight: '600', color: '#b5e084' },
  likeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  likeBtnDone: { backgroundColor: 'rgba(148,227,54,0.15)', borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.4)' },
  matchOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 30 },
  matchCard: { backgroundColor: BG_LIGHT, borderRadius: 24, padding: 32, alignItems: 'center', width: '100%', borderWidth: 1.5, borderColor: 'rgba(125,197,46,0.3)' },
  matchTitle: { fontSize: 24, fontWeight: '800', color: PRIMARY, marginTop: 12 },
  matchSub: { fontSize: 16, color: '#fff', marginTop: 8, fontWeight: '600' },
  matchBtn: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 24, width: '100%', alignItems: 'center' },
  matchBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  matchBtnOutline: { paddingVertical: 12, marginTop: 8 },
  matchBtnOutlineText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
})
