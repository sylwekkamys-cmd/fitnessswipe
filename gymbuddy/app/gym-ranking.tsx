import React, { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, RefreshControl, Animated } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { getMyProfile, getGymLeaderboard, getGymLeague, getGymPresence } from '../lib/supabase'

const LIME = '#94e336'
const GOLD = '#f0b429'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

// Pulsujaca zielona kropka "zywej" sekcji obecnosci
function PulseDot() {
  const pulse = useRef(new Animated.Value(1)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start()
  }, [])
  return <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80', opacity: pulse }} />
}

export default function GymRankingScreen() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [profile, setProfile] = useState<any>(null)
  const [rows, setRows] = useState<any[]>([])
  const [league, setLeague] = useState<any[]>([])
  const [presence, setPresence] = useState<any[]>([])

  useEffect(() => { loadData() }, [])
  useEffect(() => { if (profile) loadLeaderboard(profile.id, period) }, [period])

  async function loadData() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      if (!me) return
      setProfile(me)
      const [lb, lg, pres] = await Promise.all([
        getGymLeaderboard(me.id, period),
        getGymLeague(me.id),
        getGymPresence((me as any).gym_name ?? '', me.id),
      ])
      setRows(lb)
      setLeague(lg)
      setPresence(pres)
    } catch (e) { console.log('gym ranking error:', e) }
    finally { setLoading(false); setRefreshing(false) }
  }

  async function loadLeaderboard(profileId: string, p: 'week' | 'month') {
    setRows(await getGymLeaderboard(profileId, p))
  }

  const maxPoints = Math.max(...rows.map(r => r.points), 1)
  // Liga: pozycja mojego klubu + dystans do miejsca wyzej
  const myLeagueIdx = league.findIndex(g => g.is_mine)
  // Podium klubu: top 3 rankingu + moj osobisty cel (dystans punktowy)
  const myRowIdx = rows.findIndex(r => r.is_me)
  const isoWeek = (() => {
    const d = new Date()
    const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const dayNum = (target.getUTCDay() + 6) % 7
    target.setUTCDate(target.getUTCDate() - dayNum + 3)
    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
    return 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  })()

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" color={LIME} /></View>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t('gymRanking.title')}</Text>
          {profile?.gym_name ? <Text style={styles.headerSub}>{profile.gym_name}</Text> : null}
        </View>
      </View>

      {!profile?.gym_name ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 44, marginBottom: 12 }}>{"💪"}</Text>
          <Text style={styles.emptyText}>{t('gymRanking.noGym')}</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(tabs)/profile' as any)}>
            <Text style={styles.emptyBtnText}>{t('gymRanking.setGym')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData() }} tintColor={LIME} />}
        >
          {/* Zapowiedzi obecnosci: zywa karuzela z licznikiem (wariant 3) */}
          {presence.length > 0 && (
            <View style={styles.presenceCard}>
              <View style={styles.presenceHeader}>
                <PulseDot />
                <Text style={styles.presenceTitle}>{t('presence.title')}</Text>
                <View style={styles.presenceCountPill}>
                  <Text style={styles.presenceCountText}>{t('presence.countPeople', { count: presence.length })}</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presenceRowScroll}>
                {presence.map((p: any) => (
                  <TouchableOpacity
                    key={p.profile_id}
                    style={styles.presenceItem}
                    onPress={() => router.push({ pathname: '/profile/profile-detail', params: { profileId: p.profile_id } } as any)}
                  >
                    {p.profiles?.photo_urls?.[0] ? (
                      <Image source={{ uri: p.profiles.photo_urls[0] }} style={[styles.presenceAvatar, p.looking_for_partner && styles.presenceAvatarLooking]} />
                    ) : (
                      <View style={[styles.presenceAvatar, p.looking_for_partner && styles.presenceAvatarLooking, { backgroundColor: '#2e415c', alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="person" size={18} color="rgba(255,255,255,0.35)" />
                      </View>
                    )}
                    <Text style={styles.presenceName} numberOfLines={1}>{p.profiles?.name}</Text>
                    <Text style={[styles.presenceTime, !p.looking_for_partner && { color: 'rgba(255,255,255,0.5)' }]} numberOfLines={1}>
                      {p.training_time ? p.training_time : t('presence.todayShort')}{p.looking_for_partner ? ' 🤝' : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.presenceCta} onPress={() => router.push('/training-status' as any)}>
                <Text style={styles.presenceCtaText}>
                  {'💪'} {t('presence.ctaQuestion')} <Text style={styles.presenceCtaAction}>{t('presence.ctaAction')}</Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Liga silowni okolicy (25 km): pelna tabela zamiast bitwy 1v1 */}
          {league.length > 0 && (
            <View style={styles.leagueCard}>
              <Text style={styles.leagueTitle}>🏆 {t('gymRanking.leagueTitle')} · {t('gymRanking.weekNo', { week: isoWeek })}</Text>
              {league.slice(0, 8).map((g, i) => (
                <View key={g.gym + i} style={[styles.leagueRow, g.is_mine && styles.leagueRowMine, i === 0 && !g.is_mine && styles.leagueRowLeader]}>
                  <Text style={[styles.leagueRank, i === 0 && { color: GOLD }, g.is_mine && i !== 0 && { color: LIME }]}>{i + 1}</Text>
                  <Text style={[styles.leagueName, g.is_mine && { color: LIME }]} numberOfLines={1}>
                    {g.gym}{i === 0 ? ' 👑' : ''}{g.is_mine ? ` ${t('gymRanking.leagueYours')}` : ''}
                  </Text>
                  <Text style={styles.leagueMembers}>{g.members} 👥</Text>
                  <Text style={[styles.leaguePts, i === 0 && { color: GOLD }, g.is_mine && i !== 0 && { color: LIME }]}>{g.points} {t('gymRanking.pts')}</Text>
                </View>
              ))}
              {myLeagueIdx === 0 && league.length > 1 && (
                <Text style={styles.leagueNote}>{t('gymRanking.leagueLeading', { pts: league[0].points - league[1].points })}</Text>
              )}
              {myLeagueIdx > 0 && (
                <Text style={styles.leagueNote}>{t('gymRanking.leagueGap', { pts: league[myLeagueIdx - 1].points - league[myLeagueIdx].points + 10 })}</Text>
              )}
            </View>
          )}

          {/* Zakladki okresu */}
          <View style={styles.tabsRow}>
            <TouchableOpacity style={[styles.tab, period === 'week' && styles.tabActive]} onPress={() => setPeriod('week')}>
              <Text style={[styles.tabText, period === 'week' && styles.tabTextActive]}>{t('gymRanking.week')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, period === 'month' && styles.tabActive]} onPress={() => setPeriod('month')}>
              <Text style={[styles.tabText, period === 'month' && styles.tabTextActive]}>{t('gymRanking.month')}</Text>
            </TouchableOpacity>
          </View>

          {/* Podium tygodnia klubu + osobisty cel punktowy */}
          {rows.length > 0 && (
            <View style={styles.podiumCard}>
              <Text style={styles.leagueTitle}>🥇 {t('gymRanking.podiumTitle')}</Text>
              <View style={styles.podiumRow}>
                {[1, 0, 2].map(pos => {
                  const r = rows[pos]
                  if (!r) return <View key={pos} style={{ width: 74 }} />
                  const heights = [64, 46, 36]
                  const isFirst = pos === 0
                  return (
                    <View key={pos} style={styles.podiumCol}>
                      {r.photo_url ? (
                        <Image source={{ uri: r.photo_url }} style={[styles.podiumAvatar, isFirst && styles.podiumAvatarFirst]} />
                      ) : (
                        <View style={[styles.podiumAvatar, isFirst && styles.podiumAvatarFirst, { backgroundColor: '#2e415c', alignItems: 'center', justifyContent: 'center' }]}>
                          <Ionicons name="person" size={16} color="rgba(255,255,255,0.35)" />
                        </View>
                      )}
                      <Text style={[styles.podiumName, r.is_me && { color: LIME }]} numberOfLines={1}>
                        {r.is_me ? t('gymRanking.you') : r.name}{isFirst ? ' 👑' : ''}
                      </Text>
                      <View style={[styles.podiumBlock, { height: heights[pos] }, isFirst && styles.podiumBlockFirst]}>
                        <Text style={[styles.podiumRank, isFirst && { color: GOLD }]}>{pos + 1}</Text>
                      </View>
                    </View>
                  )
                })}
              </View>
              {/* Osobisty cel: ile brakuje do miejsca wyzej / jaka przewage bronisz */}
              {myRowIdx === 0 && rows.length > 1 && (
                <View style={styles.goalPill}>
                  <Text style={styles.goalText}>🛡️ {t('gymRanking.goalDefend', { pts: rows[0].points - rows[1].points, name: rows[1].name })}</Text>
                </View>
              )}
              {myRowIdx > 0 && (
                <View style={styles.goalPill}>
                  <Text style={styles.goalText}>🎯 {t('gymRanking.goalChase', { place: myRowIdx, pts: rows[myRowIdx - 1].points - rows[myRowIdx].points + 10 })}</Text>
                </View>
              )}
              {myRowIdx === -1 && (
                <View style={styles.goalPill}>
                  <Text style={styles.goalText}>💪 {t('gymRanking.goalStart')}</Text>
                </View>
              )}
            </View>
          )}

          {/* Leaderboard z paskami postepu */}
          <View style={{ paddingHorizontal: 16, gap: 8, paddingBottom: 30 }}>
            {rows.map((r, i) => (
              <TouchableOpacity
                key={r.profile_id}
                style={[styles.row, r.is_me && styles.rowMe]}
                activeOpacity={0.8}
                disabled={r.is_me}
                onPress={() => router.push({ pathname: '/profile/profile-detail', params: { profileId: r.profile_id } } as any)}
              >
                <Text style={[styles.rowRank, i === 0 && { color: GOLD }]}>{i + 1}</Text>
                {r.photo_url ? (
                  <Image source={{ uri: r.photo_url }} style={styles.rowAvatar} />
                ) : (
                  <View style={[styles.rowAvatar, styles.rowAvatarEmpty]}><Ionicons name="person" size={15} color="rgba(255,255,255,0.35)" /></View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.rowName, r.is_me && { color: LIME }]} numberOfLines={1}>
                      {r.is_me ? t('gymRanking.you') : r.name}
                    </Text>
                    <View style={styles.rowMeta}>
                      {r.streak > 0 && <Text style={styles.rowStreak}>{'🔥'} {r.streak}</Text>}
                      <Text style={[styles.rowPoints, r.is_me && { color: LIME }]}>{r.points} {t('gymRanking.pts')}</Text>
                    </View>
                  </View>
                  <View style={styles.rowTrack}>
                    <View style={[styles.rowFill, { width: `${Math.max(Math.round((r.points / maxPoints) * 100), 3)}%` as any, backgroundColor: r.is_me ? LIME : (i === 0 ? GOLD : 'rgba(148,227,54,0.55)') }]} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
            {rows.length === 0 && (
              <Text style={styles.emptyList}>{t('gymRanking.emptyList')}</Text>
            )}
            <Text style={styles.formula}>{t('gymRanking.formula')}</Text>
          </View>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG, paddingHorizontal: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 55, paddingBottom: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12.5, color: LIME, fontWeight: '600', marginTop: 1 },
  emptyText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center', marginBottom: 20 },
  emptyBtn: { backgroundColor: LIME, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 28 },
  emptyBtnText: { color: BG, fontSize: 15, fontWeight: '800' },
  presenceCard: { backgroundColor: BG_LIGHT, borderRadius: 18, marginHorizontal: 16, marginBottom: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(148,227,54,0.3)' },
  presenceHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 11 },
  presenceTitle: { fontSize: 11, fontWeight: '800', color: LIME, letterSpacing: 1, textTransform: 'uppercase' },
  presenceCountPill: { backgroundColor: 'rgba(148,227,54,0.18)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  presenceCountText: { fontSize: 10.5, fontWeight: '800', color: LIME },
  presenceRowScroll: { gap: 13, paddingRight: 4 },
  presenceItem: { alignItems: 'center', width: 58 },
  presenceAvatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)' },
  presenceAvatarLooking: { borderColor: LIME },
  presenceName: { fontSize: 10.5, fontWeight: '700', color: '#fff', marginTop: 4, maxWidth: 58 },
  presenceTime: { fontSize: 9.5, fontWeight: '800', color: LIME, marginTop: 1 },
  presenceCta: { backgroundColor: BG, borderRadius: 11, paddingVertical: 9, paddingHorizontal: 11, marginTop: 12 },
  presenceCtaText: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  presenceCtaAction: { color: LIME, fontWeight: '800' },
  leagueCard: { backgroundColor: BG_LIGHT, borderRadius: 20, marginHorizontal: 16, marginBottom: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  leagueTitle: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.45)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 11 },
  leagueRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 11, marginBottom: 4 },
  leagueRowMine: { backgroundColor: 'rgba(148,227,54,0.09)', borderWidth: 1, borderColor: 'rgba(148,227,54,0.45)' },
  leagueRowLeader: { backgroundColor: 'rgba(240,180,41,0.08)', borderWidth: 1, borderColor: 'rgba(240,180,41,0.35)' },
  leagueRank: { width: 18, fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
  leagueName: { flex: 1, fontSize: 13, fontWeight: '700', color: '#fff' },
  leagueMembers: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  leaguePts: { fontSize: 12.5, fontWeight: '800', color: 'rgba(255,255,255,0.7)', minWidth: 56, textAlign: 'right' },
  leagueNote: { fontSize: 12, color: LIME, fontWeight: '600', textAlign: 'center', marginTop: 8 },
  podiumCard: { backgroundColor: BG_LIGHT, borderRadius: 20, marginHorizontal: 16, marginBottom: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 10 },
  podiumCol: { alignItems: 'center', width: 82 },
  podiumAvatar: { width: 40, height: 40, borderRadius: 20, marginBottom: 4, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  podiumAvatarFirst: { width: 48, height: 48, borderRadius: 24, borderColor: GOLD },
  podiumName: { fontSize: 11, fontWeight: '700', color: '#fff', marginBottom: 5, maxWidth: 82, textAlign: 'center' },
  podiumBlock: { width: 70, borderTopLeftRadius: 9, borderTopRightRadius: 9, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  podiumBlockFirst: { backgroundColor: 'rgba(240,180,41,0.2)', borderWidth: 1, borderColor: 'rgba(240,180,41,0.45)', borderBottomWidth: 0 },
  podiumRank: { fontSize: 16, fontWeight: '800', color: 'rgba(255,255,255,0.55)' },
  goalPill: { backgroundColor: BG, borderRadius: 11, paddingVertical: 9, paddingHorizontal: 12, marginTop: 12 },
  goalText: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  tabsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 14 },
  tab: { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 18, backgroundColor: BG_LIGHT },
  tabActive: { backgroundColor: LIME },
  tabText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  tabTextActive: { color: BG },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BG_LIGHT, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  rowMe: { borderColor: 'rgba(148,227,54,0.5)', backgroundColor: 'rgba(148,227,54,0.08)' },
  rowRank: { width: 22, fontSize: 14, fontWeight: '800', color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
  rowAvatar: { width: 34, height: 34, borderRadius: 17 },
  rowAvatarEmpty: { backgroundColor: '#2e415c', alignItems: 'center', justifyContent: 'center' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  rowName: { fontSize: 13.5, fontWeight: '700', color: '#fff', flex: 1, paddingRight: 6 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowStreak: { fontSize: 11.5, color: GOLD, fontWeight: '700' },
  rowPoints: { fontSize: 12.5, fontWeight: '800', color: 'rgba(255,255,255,0.7)' },
  rowTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2 },
  rowFill: { height: 4, borderRadius: 2 },
  emptyList: { color: 'rgba(255,255,255,0.4)', fontSize: 13.5, textAlign: 'center', paddingVertical: 24 },
  formula: { fontSize: 11.5, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 10 },
})
