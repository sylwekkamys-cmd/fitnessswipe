import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Share } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Circle } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { supabase, getMyProfile, checkAndAwardBadges, BADGES_CATALOG } from '../lib/supabase'

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

// Kolory trofeow per kategoria (gradienty jak banery wyzwan)
const CATEGORY_COLORS: Record<string, [string, string]> = {
  streak: ['#7a5b10', '#b8921e'],
  swipes: ['#173f66', '#2e7ab8'],
  social: ['#7a1f4a', '#b53b78'],
  workouts: ['#2d5016', '#4f8422'],
  challenges: ['#7a3b10', '#c26422'],
  events: ['#4a2570', '#7a42b5'],
  referral: ['#7a2410', '#b8441e'],
  profile: ['#0f6b46', '#17a06a'],
}

// Emoji + statystyka i prog do paska postepu
const BADGE_META: Record<string, { emoji: string; stat?: string; target?: number }> = {
  streak_7: { emoji: '🔥', stat: 'streak', target: 7 },
  streak_30: { emoji: '🔥', stat: 'streak', target: 30 },
  streak_100: { emoji: '🔥', stat: 'streak', target: 100 },
  swipes_100: { emoji: '🖐️', stat: 'swipes', target: 100 },
  swipes_500: { emoji: '🖐️', stat: 'swipes', target: 500 },
  swipes_1000: { emoji: '🖐️', stat: 'swipes', target: 1000 },
  first_match: { emoji: '🤝', stat: 'matches', target: 1 },
  matches_10: { emoji: '🤝', stat: 'matches', target: 10 },
  matches_25: { emoji: '🧲', stat: 'matches', target: 25 },
  first_message: { emoji: '💬', stat: 'messages', target: 1 },
  messages_100: { emoji: '💬', stat: 'messages', target: 100 },
  sessions_10: { emoji: '🏋️', stat: 'workouts', target: 10 },
  sessions_50: { emoji: '🏋️', stat: 'workouts', target: 50 },
  early_bird: { emoji: '🌅' },
  night_owl: { emoji: '🌙' },
  challenge_joined: { emoji: '🏆', stat: 'challengesJoined', target: 1 },
  challenge_created: { emoji: '🛠️', stat: 'challengesCreated', target: 1 },
  challenge_completed: { emoji: '🏅' },
  trendsetter: { emoji: '📈' },
  event_joined: { emoji: '📅', stat: 'eventsJoined', target: 1 },
  events_5: { emoji: '📅', stat: 'eventsJoined', target: 5 },
  event_created: { emoji: '🗓️', stat: 'eventsCreated', target: 1 },
  referral_first: { emoji: '🎁', stat: 'referrals', target: 1 },
  verified_profile: { emoji: '🛡️' },
  photogenic: { emoji: '📸', stat: 'photos', target: 3 },
  status_star: { emoji: '⭐', stat: 'reactions', target: 10 },
}

// Poziomy gracza wg liczby odznak
function playerLevel(earned: number, total: number, t: any): { title: string; next: number | null } {
  const thresholds = [
    { min: 20, title: t('achievements.levelLegend') || 'Legenda 👑', next: null },
    { min: 13, title: t('achievements.levelBeast') || 'Beast 🦍', next: 20 },
    { min: 6, title: t('achievements.levelRegular') || 'Regularny 💪', next: 13 },
    { min: 0, title: t('achievements.levelNovice') || 'Nowicjusz 🌱', next: 6 },
  ]
  const lvl = thresholds.find(l => earned >= l.min)!
  return { title: lvl.title, next: lvl.next }
}

function ProgressRingBig({ earned, total }: { earned: number; total: number }) {
  const R = 34
  const C = 2 * Math.PI * R
  const pct = total > 0 ? earned / total : 0
  return (
    <View style={{ width: 84, height: 84, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={84} height={84} style={{ position: 'absolute' }}>
        <Circle cx={42} cy={42} r={R} stroke="rgba(255,255,255,0.12)" strokeWidth={7} fill="none" />
        <Circle
          cx={42} cy={42} r={R}
          stroke={LIME} strokeWidth={7} fill="none"
          strokeDasharray={`${C}`}
          strokeDashoffset={C * (1 - pct)}
          strokeLinecap="round"
          transform="rotate(-90 42 42)"
        />
      </Svg>
      <Text style={{ fontSize: 17, fontWeight: '800', color: '#fff' }}>{earned}/{total}</Text>
    </View>
  )
}

export default function AchievementsScreen() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [earnedMap, setEarnedMap] = useState<Record<string, string>>({})
  const [stats, setStats] = useState<Record<string, number>>({})

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      if (!me) return
      await checkAndAwardBadges(me.id)

      // Odznaki z data zdobycia (badge "NOWE" dla ostatnich 48h)
      const { data: badgeRows } = await supabase
        .from('profile_badges')
        .select('badge_code, earned_at')
        .eq('profile_id', me.id)
      const map: Record<string, string> = {}
      ;(badgeRows ?? []).forEach((b: any) => { map[b.badge_code] = b.earned_at })
      setEarnedMap(map)

      // Biezace statystyki do paskow postepu
      const cnt = async (q: any) => { const { count } = await q; return count ?? 0 }
      const [swipes, matchesA, messages, workouts, chJoined, chCreated, evJoined, evCreated, reactions] = await Promise.all([
        cnt(supabase.from('swipes').select('*', { count: 'exact', head: true }).eq('swiper_id', me.id)),
        cnt(supabase.from('matches').select('*', { count: 'exact', head: true }).or(`profile_a_id.eq.${me.id},profile_b_id.eq.${me.id}`).not('is_trainer_chat', 'is', true)),
        cnt(supabase.from('messages').select('*', { count: 'exact', head: true }).eq('sender_id', me.id)),
        cnt(supabase.from('workout_streaks').select('*', { count: 'exact', head: true }).eq('profile_id', me.id)),
        cnt(supabase.from('challenge_participants').select('*', { count: 'exact', head: true }).eq('profile_id', me.id)),
        cnt(supabase.from('challenges').select('*', { count: 'exact', head: true }).eq('creator_id', me.id)),
        cnt(supabase.from('event_attendees').select('*', { count: 'exact', head: true }).eq('profile_id', me.id)),
        cnt(supabase.from('sports_events').select('*', { count: 'exact', head: true }).eq('creator_id', me.id)),
        cnt(supabase.from('status_reactions').select('*', { count: 'exact', head: true }).eq('status_profile_id', me.id)),
      ])
      setStats({
        streak: (me as any).longest_streak ?? 0,
        swipes, matches: matchesA, messages, workouts,
        challengesJoined: chJoined, challengesCreated: chCreated,
        eventsJoined: evJoined, eventsCreated: evCreated,
        reactions,
        photos: me.photo_urls?.length ?? 0,
      })
    } catch (e) {
      console.log('loadData achievements error:', e)
    } finally {
      setLoading(false)
    }
  }

  const earnedCodes = Object.keys(earnedMap)
  const total = BADGES_CATALOG.length
  const level = playerLevel(earnedCodes.length, total, t)

  function isNew(code: string): boolean {
    const at = earnedMap[code]
    if (!at) return false
    return Date.now() - new Date(at).getTime() < 48 * 3600000
  }

  function progressFor(code: string): number | null {
    const meta = BADGE_META[code]
    if (!meta?.stat || !meta.target) return null
    const val = stats[meta.stat] ?? 0
    return Math.min(100, Math.round((val / meta.target) * 100))
  }

  function progressLabel(code: string): string | null {
    const meta = BADGE_META[code]
    if (!meta?.stat || !meta.target) return null
    return `${Math.min(stats[meta.stat] ?? 0, meta.target)}/${meta.target}`
  }

  const earnedBadgesList = BADGES_CATALOG.filter(b => earnedCodes.includes(b.code))
  const lockedBadgesList = BADGES_CATALOG.filter(b => !earnedCodes.includes(b.code))
  // Najblizej zdobycia: mierzalne, posortowane po % (min 10%)
  const closest = lockedBadgesList
    .map(b => ({ badge: b, pct: progressFor(b.code) }))
    .filter(x => x.pct !== null && x.pct >= 10)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
    .slice(0, 2)
  const closestCodes = new Set(closest.map(c => c.badge.code))

  async function handleShare() {
    try {
      const msg = (t('achievements.shareMessage', { count: earnedCodes.length, total, level: level.title })
        || `🏆 Zdobyłem ${earnedCodes.length}/${total} odznak w FitnessSwipe! Poziom: ${level.title}`)
        + '\n\nhttps://fitnessswipe.app'
      await Share.share({ message: msg })
    } catch (e) { }
  }

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={PRIMARY} />
    </View>
  )

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('achievements.title') || 'Achievements'}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={handleShare}>
          <Ionicons name="share-social-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Pierscien + poziom gracza */}
      <View style={styles.levelCard}>
        <ProgressRingBig earned={earnedCodes.length} total={total} />
        <View style={{ flex: 1 }}>
          <Text style={styles.levelLabel}>{t('achievements.yourLevel') || 'Twój poziom'}</Text>
          <Text style={styles.levelTitle}>{level.title}</Text>
          {level.next !== null && (
            <>
              <Text style={styles.levelNext}>
                {(t('achievements.toNextLevel') || 'Do następnego poziomu:')} {level.next - earnedCodes.length}
              </Text>
              <View style={styles.levelBarTrack}>
                <View style={[styles.levelBarFill, { width: `${Math.min(100, (earnedCodes.length / level.next) * 100)}%` }]} />
              </View>
            </>
          )}
        </View>
      </View>

      {/* Gablota trofeow */}
      {earnedBadgesList.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>🏆 {(t('achievements.yourTrophies') || 'Twoje trofea')} ({earnedBadgesList.length})</Text>
          <View style={styles.trophiesGrid}>
            {earnedBadgesList.map(badge => (
              <View key={badge.code} style={styles.trophyWrap}>
                <LinearGradient
                  colors={CATEGORY_COLORS[badge.category] ?? ['#37474f', '#5a7484']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.trophyTile}
                >
                  {isNew(badge.code) && (
                    <View style={styles.newPill}>
                      <Text style={styles.newPillText}>{t('achievements.newLabel') || 'NOWE'}</Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 26 }}>{BADGE_META[badge.code]?.emoji ?? '🏅'}</Text>
                  <Text style={styles.trophyName} numberOfLines={2}>
                    {t('achievements.' + badge.code + '_name') || badge.code}
                  </Text>
                </LinearGradient>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Najblizej zdobycia */}
      {closest.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>{t('achievements.closestTitle') || 'Najbliżej zdobycia'}</Text>
          {closest.map(({ badge, pct }) => (
            <View key={badge.code} style={[styles.lockedRow, styles.lockedRowClosest]}>
              <Text style={{ fontSize: 22 }}>{BADGE_META[badge.code]?.emoji ?? '🔒'}</Text>
              <View style={{ flex: 1 }}>
                <View style={styles.lockedNameRow}>
                  <Text style={styles.lockedName}>{t('achievements.' + badge.code + '_name') || badge.code}</Text>
                  <Text style={[styles.lockedPct, { color: LIME }]}>{pct}%</Text>
                </View>
                <Text style={styles.lockedDesc} numberOfLines={1}>
                  {t('achievements.' + badge.code + '_desc') || ''} · {progressLabel(badge.code)}
                </Text>
                <View style={styles.lockedBarTrack}>
                  <View style={[styles.lockedBarFill, { width: `${pct ?? 0}%` as const, backgroundColor: LIME }]} />
                </View>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Do zdobycia */}
      {lockedBadgesList.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>{(t('achievements.toEarn') || 'Do zdobycia')} ({lockedBadgesList.length})</Text>
          {lockedBadgesList.filter(b => !closestCodes.has(b.code)).map(badge => {
            const pct = progressFor(badge.code)
            const label = progressLabel(badge.code)
            return (
              <View key={badge.code} style={styles.lockedRow}>
                <Text style={{ fontSize: 20, opacity: 0.6 }}>{BADGE_META[badge.code]?.emoji ?? '🔒'}</Text>
                <View style={{ flex: 1 }}>
                  <View style={styles.lockedNameRow}>
                    <Text style={styles.lockedName}>{t('achievements.' + badge.code + '_name') || badge.code}</Text>
                    {pct !== null && <Text style={styles.lockedPct}>{pct}%</Text>}
                  </View>
                  <Text style={styles.lockedDesc} numberOfLines={1}>
                    {t('achievements.' + badge.code + '_desc') || ''}{label ? ' · ' + label : ''}
                  </Text>
                  {pct !== null && (
                    <View style={styles.lockedBarTrack}>
                      <View style={[styles.lockedBarFill, { width: `${pct}%` }]} />
                    </View>
                  )}
                </View>
                <Ionicons name="lock-closed" size={14} color="rgba(255,255,255,0.25)" />
              </View>
            )
          })}
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, paddingHorizontal: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 55, paddingBottom: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },

  levelCard: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: BG_LIGHT, borderRadius: 20, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(148,227,54,0.2)' },
  levelLabel: { fontSize: 11, color: 'rgba(255,255,255,0.45)' },
  levelTitle: { fontSize: 19, fontWeight: '800', color: LIME, marginTop: 2 },
  levelNext: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
  levelBarTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 5 },
  levelBarFill: { height: 4, backgroundColor: LIME, borderRadius: 2 },

  sectionHeader: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },

  trophiesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trophyWrap: { width: '31%', flexGrow: 1, maxWidth: '32%' },
  trophyTile: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', minHeight: 84, justifyContent: 'center' },
  trophyName: { fontSize: 10, fontWeight: '700', color: '#fff', textAlign: 'center', marginTop: 5 },
  newPill: { position: 'absolute', top: 5, right: 5, backgroundColor: '#ff5050', borderRadius: 7, paddingHorizontal: 5, paddingVertical: 1 },
  newPillText: { fontSize: 8, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },

  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BG_LIGHT, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  lockedRowClosest: { borderColor: 'rgba(148,227,54,0.4)', borderWidth: 1.5 },
  lockedNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lockedName: { fontSize: 13, fontWeight: '700', color: '#fff' },
  lockedPct: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  lockedDesc: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  lockedBarTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 6 },
  lockedBarFill: { height: 4, backgroundColor: '#4fc3f7', borderRadius: 2 },
})
