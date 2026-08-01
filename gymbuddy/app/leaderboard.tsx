import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { supabase, getMyProfile } from '../lib/supabase'

// Ranking okolicy: najdluzsze passy treningowe w promieniu 30 km.
// Lokalna rywalizacja — powod, zeby codziennie podbic wlasna passe.

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'
const RADIUS_KM = 30

const MEDALS = ['#f0b429', '#c0c0c0', '#cd7f32']

function distKm(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 6371
  const dLat = (la2 - la1) * Math.PI / 180
  const dLng = (lo2 - lo1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function LeaderboardScreen() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [rows, setRows] = useState<any[]>([])
  const [myId, setMyId] = useState<string | null>(null)
  const [myRank, setMyRank] = useState<number | null>(null)
  const [noLocation, setNoLocation] = useState(false)

  async function load() {
    try {
      const me = await getMyProfile()
      if (!me) return
      setMyId(me.id)
      const myLat = (me as any).latitude
      const myLng = (me as any).longitude
      if (myLat == null || myLng == null) { setNoLocation(true); setRows([]); return }
      setNoLocation(false)

      const { data } = await supabase
        .from('profiles')
        .select('id, name, photo_urls, current_streak, latitude, longitude, is_verified, is_invisible, banned')
        .gt('current_streak', 0)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)

      const nearby = (data ?? [])
        .filter((p: any) => p.banned !== true && (p.is_invisible !== true || p.id === me.id))
        .map((p: any) => ({ ...p, distance_km: distKm(myLat, myLng, p.latitude, p.longitude) }))
        .filter((p: any) => p.distance_km <= RADIUS_KM)
        .sort((a: any, b: any) => (b.current_streak - a.current_streak) || (a.distance_km - b.distance_km))

      const idx = nearby.findIndex((p: any) => p.id === me.id)
      setMyRank(idx >= 0 ? idx + 1 : null)
      setRows(nearby.slice(0, 20))
    } catch (e) { }
  }

  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('leaderboard.title')}</Text>
        <View style={{ width: 40 }} />
      </View>
      <Text style={styles.subtitle}>{t('leaderboard.subtitle')}</Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
      >
        {noLocation && (
          <View style={styles.emptyBox}>
            <Ionicons name="location-outline" size={34} color="rgba(255,255,255,0.25)" />
            <Text style={styles.emptyText}>{t('leaderboard.noLocation')}</Text>
          </View>
        )}
        {!noLocation && rows.length === 0 && (
          <View style={styles.emptyBox}>
            <Ionicons name="flame-outline" size={34} color="rgba(255,255,255,0.25)" />
            <Text style={styles.emptyText}>{t('leaderboard.empty')}</Text>
          </View>
        )}

        {rows.map((p, i) => {
          const isMe = p.id === myId
          return (
            <TouchableOpacity
              key={p.id}
              style={[styles.row, isMe && styles.rowMe]}
              disabled={isMe}
              onPress={() => router.push({ pathname: '/profile/profile-detail', params: { profileId: p.id } } as any)}
            >
              <View style={[styles.rankCircle, i < 3 && { backgroundColor: MEDALS[i] }]}>
                <Text style={[styles.rankText, i < 3 && { color: BG }]}>{i + 1}</Text>
              </View>
              {p.photo_urls?.[0] ? (
                <Image source={{ uri: p.photo_urls[0] }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarEmpty]}><Ionicons name="person" size={16} color="rgba(255,255,255,0.35)" /></View>
              )}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={styles.name} numberOfLines={1}>{p.name}{isMe ? ` (${t('leaderboard.you')})` : ''}</Text>
                  {p.is_verified && <Ionicons name="checkmark-circle" size={14} color={LIME} />}
                </View>
                <Text style={styles.dist}>{p.distance_km < 1 ? '<1' : Math.round(p.distance_km)} km</Text>
              </View>
              <View style={styles.streakPill}>
                <Text style={{ fontSize: 13 }}>🔥</Text>
                <Text style={styles.streakText}>{p.current_streak}</Text>
              </View>
            </TouchableOpacity>
          )
        })}

        {/* Moja pozycja poza top 20 */}
        {myRank != null && myRank > 20 && (
          <View style={[styles.row, styles.rowMe, { marginTop: 8 }]}>
            <View style={styles.rankCircle}><Text style={styles.rankText}>{myRank}</Text></View>
            <Text style={[styles.name, { flex: 1 }]}>{t('leaderboard.you')}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 54 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginTop: 6 },
  emptyBox: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  emptyText: { fontSize: 14, color: 'rgba(255,255,255,0.45)', textAlign: 'center', paddingHorizontal: 30, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BG_LIGHT, borderRadius: 14, padding: 10, borderWidth: 1.5, borderColor: 'transparent' },
  rowMe: { borderColor: 'rgba(148,227,54,0.6)', backgroundColor: 'rgba(148,227,54,0.08)' },
  rankCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 12, fontWeight: '900', color: 'rgba(255,255,255,0.75)' },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarEmpty: { backgroundColor: '#2e415c', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14.5, fontWeight: '700', color: '#fff', flexShrink: 1 },
  dist: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  streakPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  streakText: { fontSize: 13.5, fontWeight: '900', color: '#ffb340' },
})
