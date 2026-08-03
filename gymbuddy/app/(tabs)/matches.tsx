import React, { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert, Image, StyleSheet, ActivityIndicator, RefreshControl, Modal } from 'react-native'
import { useTranslation } from 'react-i18next'
import { supabase, getMyProfile, getUnreadCounts, reportUser, getNearbyStatuses, getMyViewedStatusIds, isOnline } from '../../lib/supabase'
import type { Profile } from '../../lib/supabase'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import StoryViewer from '../../components/StoryViewer'

const PRIMARY = '#7dc52e'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

type LastMessage = { content: string; sender_id: string; sent_at: string; deleted_at?: string | null; image_url?: string | null; view_once?: boolean | null; audio_url?: string | null; location_lat?: number | null; location_name?: string | null }
type MatchWithProfile = { id: string; matched_at: string; otherProfile: Profile; lastMsg: LastMessage | null }

export default function MatchesScreen() {
  const { t } = useTranslation()
  const [matches, setMatches] = useState<MatchWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [myProfileId, setMyProfileId] = useState<string | null>(null)
  const [optionsForMatch, setOptionsForMatch] = useState<MatchWithProfile | null>(null)
  const [reporting, setReporting] = useState(false)
  const [duoStreaks, setDuoStreaks] = useState<Record<string, number>>({})
  // Pasek relacji w okolicy (jak Messenger): aktywne statusy w 30 km
  const [nearbyStories, setNearbyStories] = useState<any[]>([])
  const [viewedIds, setViewedIds] = useState<string[]>([])
  const [myStatus, setMyStatus] = useState<any>(null)
  const [myProfileFull, setMyProfileFull] = useState<any>(null)
  const [storyIndex, setStoryIndex] = useState<number | null>(null)

  useEffect(() => { loadMatches() }, [])

  useFocusEffect(
    React.useCallback(() => {
      loadMatches()
    }, [])
  )

  async function loadMatches() { setLoading(true); await fetchMatches(); setLoading(false) }

  async function fetchMatches() {
    try {
      const me = await getMyProfile()
      if (!me) return
      setMyProfileId(me.id)
      setMyProfileFull(me)
      // Wspolne passy par (tygodnie ze wspolnym treningiem z rzedu)
      import('../../lib/supabase').then(({ getDuoStreaks }) => getDuoStreaks(me.id).then(setDuoStreaks)).catch(() => { })
      // Relacje w okolicy + moje obejrzenia + moj wlasny status (kafelek "Twoja")
      getNearbyStatuses(me.id, (me as any).latitude ?? 0, (me as any).longitude ?? 0, 30)
        .then(list => {
          // Pasek relacji pokazuje tylko statusy ze zdjeciem/wideo — tekstowe
          // i "trenuje teraz" (live) zyja na mapie i badge'ach, nie jako relacje
          setNearbyStories(list.filter((s: any) => (s.video_url && s.video_url.length > 0) || (s.status_photo_url && s.status_photo_url.length > 0)))
          getMyViewedStatusIds(me.id).then(setViewedIds).catch(() => { })
        })
        .catch(() => { })
      supabase
        .from('training_status')
        .select('*')
        .eq('profile_id', me.id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => setMyStatus(data))
      const { data: matchData } = await supabase.from('matches').select('*').or(`profile_a_id.eq.${me.id},profile_b_id.eq.${me.id}`).order('matched_at', { ascending: false })
      if (!matchData) return
      // Trener: rozmowy z klientami zyja w skrzynce Studia, nie na liscie dopasowan
      const visibleMatches = (me as any).is_trainer
        ? matchData.filter((m: any) => !m.is_trainer_chat)
        : matchData
      const enriched: MatchWithProfile[] = []
      for (const match of visibleMatches) {
        const otherId = match.profile_a_id === me.id ? match.profile_b_id : match.profile_a_id
        const { data: otherProfile } = await supabase.from('profiles').select('*').eq('id', otherId).single()
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('content, sender_id, sent_at, deleted_at, image_url, view_once, audio_url, location_lat, location_name')
          .eq('match_id', match.id)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (otherProfile) enriched.push({ id: match.id, matched_at: match.matched_at, otherProfile, lastMsg: lastMsg ?? null })
      }
      // Rozmowy z najnowsza aktywnoscia na gorze
      enriched.sort((a, b) => new Date(b.lastMsg?.sent_at ?? b.matched_at).getTime() - new Date(a.lastMsg?.sent_at ?? a.matched_at).getTime())
      setMatches(enriched)
      const counts = await getUnreadCounts(me.id)
      setUnreadCounts(counts)
    } catch (e) { console.error(e) }
  }

  async function onRefresh() { setRefreshing(true); await fetchMatches(); setRefreshing(false) }

  async function deleteMatch(matchId: string) {
    setOptionsForMatch(null)
    Alert.alert(t('matches.deleteMatch'), t('matches.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.save'), style: 'destructive', onPress: async () => {
        await supabase.rpc('delete_match_and_swipes', { match_id: matchId })
        setMatches(prev => prev.filter(m => m.id !== matchId))
      }}
    ])
  }

  async function handleReportChat(otherProfileId: string) {
    if (!myProfileId || reporting) return
    setReporting(true)
    try {
      await reportUser(myProfileId, otherProfileId, 'Reported from chat/match list')
      setOptionsForMatch(null)
      Alert.alert('✅', t('matches.reportSent') || 'Report sent. Our team will review it.')
    } catch (e) {
      Alert.alert(t('common.error'))
    } finally {
      setReporting(false)
    }
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (mins < 60) return mins + ' min'
    if (hours < 24) return hours + ' h'
    return days + ' d'
  }

  // Nieobejrzane relacje najpierw, potem wg odleglosci (kolejnosc stala takze w przegladarce)
  const sortedStories = [...nearbyStories].sort((a, b) => {
    const sa = viewedIds.includes(a.profile_id) ? 1 : 0
    const sb = viewedIds.includes(b.profile_id) ? 1 : 0
    if (sa !== sb) return sa - sb
    return (a.distance_km ?? 999) - (b.distance_km ?? 999)
  })

  // Wiele relacji na osobe: pasek pokazuje JEDNO kolko na osobe, a przegladarka
  // dostaje plaska liste, w ktorej relacje tej samej osoby sasiaduja (najstarsza pierwsza)
  const storyProfileOrder: string[] = []
  const storiesByProfile: Record<string, any[]> = {}
  sortedStories.forEach((s: any) => {
    if (!storiesByProfile[s.profile_id]) { storiesByProfile[s.profile_id] = []; storyProfileOrder.push(s.profile_id) }
    storiesByProfile[s.profile_id].push(s)
  })
  storyProfileOrder.forEach(id => storiesByProfile[id].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()))
  const flatStories = storyProfileOrder.flatMap(id => storiesByProfile[id])
  const groupedStories = storyProfileOrder.map(id => ({
    profile_id: id,
    profiles: storiesByProfile[id][0].profiles,
    stories: storiesByProfile[id],
  }))

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>

  if (matches.length === 0) return (
    <View style={styles.center}>
      <View style={styles.emptyIconContainer}><Ionicons name="people-outline" size={40} color={PRIMARY} /></View>
      <Text style={styles.emptyTitle}>{t('matches.noMatches')}</Text>
      <Text style={styles.emptySub}>{t('matches.noMatchesSub')}</Text>
      <TouchableOpacity style={styles.swipeButton} onPress={() => router.push('/(tabs)/swipe')}>
        <Ionicons name="flame-outline" size={18} color="#fff" />
        <Text style={styles.swipeButtonText}>{t('matches.discover')}</Text>
      </TouchableOpacity>
    </View>
  )

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('matches.title')}</Text>
        <Text style={styles.headerSub}>{matches.length} {matches.length === 1 ? t('matches.partner') : t('matches.partners')}</Text>
      </View>

      {/* Pasek relacji w okolicy (jak Messenger): limonkowy pierscien = nieobejrzana */}
      <Text style={styles.storiesLabel}>{t('matches.storiesNearby')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storiesBar} contentContainerStyle={styles.storiesContent}>
        <TouchableOpacity style={styles.storyItem} activeOpacity={0.8} onPress={() => router.push('/training-status')}>
          {myStatus && ((myStatus.video_url && myStatus.video_url.length > 0) || (myStatus.status_photo_url && myStatus.status_photo_url.length > 0)) ? (
            <View style={[styles.storyRing, styles.storyRingUnread]}>
              <Image source={{ uri: myProfileFull?.photo_urls?.[0] ?? 'https://i.pravatar.cc/100' }} style={styles.storyAvatar} />
              <View style={styles.storyPlusBadge}>
                <Ionicons name="add" size={11} color="#0d1b2e" />
              </View>
            </View>
          ) : (
            <View style={[styles.storyRing, styles.storyRingAdd]}>
              <Ionicons name="add" size={24} color="#94e336" />
            </View>
          )}
          <Text style={styles.storyName}>{t('matches.yourStory')}</Text>
        </TouchableOpacity>
        {groupedStories.map((g: any) => {
          const seen = viewedIds.includes(g.profile_id)
          const hasVideo = g.stories.some((s: any) => s.video_url)
          return (
            <TouchableOpacity
              key={g.profile_id}
              style={styles.storyItem}
              activeOpacity={0.8}
              onPress={() => setStoryIndex(flatStories.findIndex((s: any) => s.profile_id === g.profile_id))}
            >
              <View style={[styles.storyRing, seen ? styles.storyRingSeen : styles.storyRingUnread]}>
                <Image source={{ uri: g.profiles?.photo_urls?.[0] ?? 'https://i.pravatar.cc/100' }} style={styles.storyAvatar} />
                {g.stories.length > 1 ? (
                  <View style={styles.storyCountBadge}>
                    <Text style={styles.storyCountBadgeText}>{g.stories.length}</Text>
                  </View>
                ) : hasVideo ? (
                  <View style={styles.storyVideoBadge}>
                    <Ionicons name="videocam" size={9} color="#fff" />
                  </View>
                ) : null}
              </View>
              <Text style={[styles.storyName, !seen && styles.storyNameUnread]} numberOfLines={1}>{g.profiles?.name}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {matches.map((item) => {
        const photo = item.otherProfile.photo_urls?.[0]
        const unread = (unreadCounts[item.id] ?? 0) > 0
        const isMine = item.lastMsg?.sender_id === myProfileId
        const lastLabel = item.lastMsg
          ? (item.lastMsg.deleted_at ? t('chat.deletedMsg')
            : item.lastMsg.image_url && item.lastMsg.view_once ? '🔥 ' + t('chat.viewOncePhoto')
            : item.lastMsg.image_url?.includes('giphy') ? 'GIF 🎬'
            : item.lastMsg.image_url ? '📷 ' + t('chat.photoMsg')
            : item.lastMsg.audio_url ? '🎤 ' + t('chat.voiceMsg')
            : item.lastMsg.location_lat != null ? '📍 ' + (item.lastMsg.location_name || t('chat.locationMsg'))
            : item.lastMsg.content)
          : ''
        const preview = item.lastMsg
          ? (isMine ? (t('chat.you') || 'Ty') + ': ' : '') + lastLabel
          : (t('matches.sayHi') || 'Nowe dopasowanie — przywitaj się! 👋')
        return (
          <TouchableOpacity
            key={item.id}
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push('/chat/' + item.id)}
            onLongPress={() => setOptionsForMatch(item)}
          >
            <View>
              <Image source={{ uri: photo ?? 'https://i.pravatar.cc/100' }} style={styles.avatar} />
              {isOnline((item.otherProfile as any).last_seen_at) && <View style={styles.onlineDotAvatar} />}
            </View>
            <View style={styles.info}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.name, unread && styles.nameUnread, (item.otherProfile as any).is_trainer && { color: '#d4af37' }]}>{item.otherProfile.name}</Text>
                {(duoStreaks[item.otherProfile.id] ?? 0) > 0 && (
                  <View style={styles.duoStreakPill}>
                    <Text style={styles.duoStreakText}>{'🔥'} {duoStreaks[item.otherProfile.id]} {t('duo.weeksShort')}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.preview, unread && styles.previewUnread, !item.lastMsg && styles.previewNew]} numberOfLines={1}>{preview}</Text>
            </View>
            <View style={styles.rightCol}>
              <Text style={[styles.time, unread && styles.timeUnread]}>{formatTime(item.lastMsg?.sent_at ?? item.matched_at)}</Text>
              {unread && <View style={styles.unreadDot} />}
            </View>
          </TouchableOpacity>
        )
      })}

      <Modal visible={!!optionsForMatch} animationType="slide" transparent onRequestClose={() => setOptionsForMatch(null)}>
        <TouchableOpacity style={styles.optionsOverlay} activeOpacity={1} onPress={() => setOptionsForMatch(null)}>
          <View style={styles.optionsSheet}>
            <View style={styles.optionsHandle} />
            {optionsForMatch && (
              <>
                <View style={styles.optionsHeader}>
                  <Image source={{ uri: optionsForMatch.otherProfile.photo_urls?.[0] ?? 'https://i.pravatar.cc/100' }} style={styles.optionsAvatar} />
                  <Text style={styles.optionsName}>{optionsForMatch.otherProfile.name}</Text>
                </View>

                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => { setOptionsForMatch(null); router.push({ pathname: '/profile/profile-detail', params: { profileId: optionsForMatch.otherProfile.id } }) }}
                >
                  <Ionicons name="person-outline" size={20} color={PRIMARY} />
                  <Text style={styles.optionText}>{t('matches.viewProfile') || 'View Profile'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => handleReportChat(optionsForMatch.otherProfile.id)}
                  disabled={reporting}
                >
                  <Ionicons name="flag-outline" size={20} color="#F59E0B" />
                  <Text style={styles.optionText}>{t('matches.reportChat') || 'Report this chat'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => deleteMatch(optionsForMatch.id)}
                >
                  <Ionicons name="close-circle-outline" size={20} color="#ff4757" />
                  <Text style={[styles.optionText, { color: '#ff4757' }]}>{t('matches.deleteMatch')}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.optionsCancel} onPress={() => setOptionsForMatch(null)}>
                  <Text style={styles.optionsCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Pelnoekranowa przegladarka relacji */}
      <StoryViewer
        visible={storyIndex != null}
        people={flatStories}
        initialIndex={storyIndex ?? 0}
        onClose={() => {
          setStoryIndex(null)
          // Odswiez szare pierscienie po obejrzeniu
          if (myProfileId) getMyViewedStatusIds(myProfileId).then(setViewedIds).catch(() => { })
        }}
        myProfile={myProfileFull}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: BG },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#fff' },
  duoStreakPill: { backgroundColor: 'rgba(240,180,41,0.15)', borderWidth: 1, borderColor: 'rgba(240,180,41,0.4)', borderRadius: 9, paddingHorizontal: 6, paddingVertical: 1.5 },
  duoStreakText: { fontSize: 10.5, fontWeight: '800', color: '#f0b429' },
  headerSub: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  storiesLabel: { fontSize: 10.5, fontWeight: '800', color: '#94e336', letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 20, marginBottom: 7 },
  storiesBar: { marginBottom: 4 },
  storiesContent: { paddingHorizontal: 16, gap: 14, paddingBottom: 10 },
  storyItem: { alignItems: 'center', width: 64 },
  storyRing: { padding: 3, borderRadius: 34, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.15)' },
  storyRingUnread: { borderColor: '#94e336' },
  storyRingSeen: { borderColor: 'rgba(255,255,255,0.2)' },
  storyRingAdd: { borderStyle: 'dashed', borderColor: 'rgba(148,227,54,0.6)', width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  storyPlusBadge: { position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: '#94e336', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BG },
  storyVideoBadge: { position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(13,27,46,0.9)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#94e336' },
  storyAvatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: BG_LIGHT },
  storyName: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 5, maxWidth: 64, textAlign: 'center' },
  storyNameUnread: { color: '#fff', fontWeight: '600' },
  card: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', gap: 12 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: BG_LIGHT },
  onlineDotAvatar: { position: 'absolute', bottom: 1, right: 1, width: 13, height: 13, borderRadius: 7, backgroundColor: '#94e336', borderWidth: 2, borderColor: BG },
  storyCountBadge: { position: 'absolute', bottom: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#94e336', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: BG },
  storyCountBadgeText: { fontSize: 10, fontWeight: '800', color: BG },
  nameUnread: { fontWeight: '800' },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '700', color: '#fff' },
  preview: { fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  previewUnread: { color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  previewNew: { color: '#94e336', fontStyle: 'italic' },
  rightCol: { alignItems: 'flex-end', gap: 6 },
  time: { fontSize: 11, color: 'rgba(255,255,255,0.3)' },
  timeUnread: { color: '#94e336', fontWeight: '600' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#94e336' },
  optionsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  optionsSheet: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30 },
  optionsHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
  optionsHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  optionsAvatar: { width: 44, height: 44, borderRadius: 22 },
  optionsName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  optionText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  optionsCancel: { marginTop: 10, paddingVertical: 14, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14 },
  optionsCancelText: { fontSize: 15, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  emptyIconContainer: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(125,197,46,0.1)', borderWidth: 1.5, borderColor: 'rgba(125,197,46,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  emptySub: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 8, lineHeight: 22 },
  swipeButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: PRIMARY, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, marginTop: 24 },
  swipeButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
