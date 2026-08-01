import React, { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Alert, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useVideoPlayer, VideoView } from 'expo-video'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { supabase, incrementStatusView, reportUser } from '../lib/supabase'
import { OverlayPillsView, FilterLayer } from './statusMedia'

const PRIMARY = '#7dc52e'
const REACTION_EMOJIS = ['💪', '🔥', '👊']

// Re-eksport dla ekranow, ktore importowaly stad naklejki
export { OverlayPillsView as OverlayPills }

// Jeden slajd: zdjecie (rozmyte tlo + contain) albo wideo (gra tylko gdy aktywne)
function StoryMedia({ person, isActive, muted }: { person: any; isActive: boolean; muted: boolean }) {
  const videoUrl = person.video_url || null
  const player = useVideoPlayer(videoUrl, p => { p.loop = true })
  useEffect(() => {
    if (!videoUrl) return
    player.muted = muted
    if (isActive) player.play(); else player.pause()
  }, [isActive, muted, videoUrl])

  if (videoUrl) {
    return (
      <View style={[styles.media, !isActive && styles.mediaHidden]}>
        <VideoView player={player} style={styles.media} contentFit="contain" nativeControls={false} />
        <FilterLayer id={person.filter} />
        {isActive && <OverlayPillsView status={person} />}
      </View>
    )
  }
  const uri = person.status_photo_url || person.profiles?.photo_urls?.[0] || null
  // Status bez zadnego medium: gradient jak w edytorze zamiast pustej szarosci
  if (!uri) {
    return (
      <View style={[styles.media, !isActive && styles.mediaHidden]}>
        <LinearGradient colors={['#24405f', '#0d1b2e']} style={styles.media} />
        <FilterLayer id={person.filter} />
        {isActive && <OverlayPillsView status={person} />}
      </View>
    )
  }
  return (
    <View style={[styles.media, !isActive && styles.mediaHidden]}>
      <Image source={{ uri }} style={styles.media} resizeMode="cover" blurRadius={30} />
      <View style={[styles.media, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
      <Image source={{ uri }} style={styles.media} resizeMode="contain" />
      <FilterLayer id={person.filter} />
      {isActive && <OverlayPillsView status={person} />}
    </View>
  )
}

// Pelnoekranowa przegladarka relacji (wspolna: pasek w Dopasowaniach, mapa silowni)
export default function StoryViewer({ visible, people, initialIndex, onClose, myProfile, onShare }: {
  visible: boolean
  people: any[]
  initialIndex: number
  onClose: () => void
  myProfile: any
  // Udostepnianie na inne aplikacje — tylko dla WLASNYCH relacji (przycisk u gory)
  onShare?: (story: any) => void
}) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(initialIndex)
  const [muted, setMuted] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [myReactions, setMyReactions] = useState<Record<string, string>>({})
  const touchStart = useRef({ x: 0, y: 0 })

  useEffect(() => { if (visible) setIndex(initialIndex) }, [visible, initialIndex])

  // Zaliczanie wyswietlenia przy kazdej ogladanej osobie
  useEffect(() => {
    if (!visible || !myProfile || !people[index]) return
    incrementStatusView(people[index].profile_id, myProfile.id)
  }, [visible, index])

  // Moje reakcje na widoczne relacje
  useEffect(() => {
    if (!visible || !myProfile || people.length === 0) return
    supabase
      .from('status_reactions')
      .select('status_profile_id, emoji')
      .eq('reactor_id', myProfile.id)
      .in('status_profile_id', people.map(p => p.profile_id))
      .then(({ data }) => {
        const map: Record<string, string> = {}
        ;(data ?? []).forEach((r: any) => { map[r.status_profile_id] = r.emoji })
        setMyReactions(map)
      })
  }, [visible])

  async function react(statusProfileId: string, emoji: string) {
    if (!myProfile) return
    const current = myReactions[statusProfileId]
    if (current === emoji) {
      setMyReactions(prev => { const c = { ...prev }; delete c[statusProfileId]; return c })
      await supabase.from('status_reactions').delete()
        .eq('status_profile_id', statusProfileId).eq('reactor_id', myProfile.id)
    } else {
      setMyReactions(prev => ({ ...prev, [statusProfileId]: emoji }))
      await supabase.from('status_reactions').upsert(
        { status_profile_id: statusProfileId, reactor_id: myProfile.id, emoji },
        { onConflict: 'status_profile_id,reactor_id' }
      )
    }
  }

  function handleReport() {
    const person = people[index]
    if (!person) return
    Alert.alert(t('reportBlock.reportStatusTitle'), t('reportBlock.reportStatusMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('reportBlock.report'), style: 'destructive', onPress: async () => {
          setReporting(true)
          try {
            if (!myProfile) return
            const kind = person.video_url ? 'video' : 'photo'
            await reportUser(myProfile.id, person.profile_id, 'inappropriate_content', `status_${kind}:${person.profile_id}:${Date.now()}`)
            Alert.alert('✅', t('reportBlock.reportedSuccess'))
          } catch (e: any) {
            Alert.alert(t('common.error'), e?.message ?? '')
          } finally { setReporting(false) }
        }
      }
    ])
  }

  function handleTap(e: any, dir: -1 | 1) {
    const dx = Math.abs(e.nativeEvent.pageX - touchStart.current.x)
    const dy = Math.abs(e.nativeEvent.pageY - touchStart.current.y)
    if (dx < 10 && dy < 10) {
      setIndex(i => {
        const next = i + dir
        if (next < 0) return 0
        if (next >= people.length) { onClose(); return i }
        return next
      })
    }
  }

  const person = people[index]
  const isOwn = !!person && !!myProfile && person.profile_id === myProfile.id

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modal}>
        {people.map((p, i) => (
          <StoryMedia key={p.id ?? `${p.profile_id}-${i}`} person={p} isActive={visible && i === index} muted={muted} />
        ))}

        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.9)']}
          style={styles.gradient}
          pointerEvents="none"
        />

        <View
          style={styles.tapLeft}
          onTouchStart={e => { touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY } }}
          onTouchEnd={e => handleTap(e, -1)}
        />
        <View
          style={styles.tapRight}
          onTouchStart={e => { touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY } }}
          onTouchEnd={e => handleTap(e, 1)}
        />

        {/* Segmenty postepu tylko przy wielu relacjach — pojedynczy pelny pasek mylil sie z artefaktem */}
        {people.length > 1 && (
          <View style={styles.bars}>
            {people.map((_, i) => (
              <View key={i} style={[styles.bar, i === index && styles.barActive]} />
            ))}
          </View>
        )}

        <View style={styles.topActions}>
          {person?.video_url && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => setMuted(v => !v)}>
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color="#fff" />
            </TouchableOpacity>
          )}
          {isOwn && onShare && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => onShare(person)}>
              <Ionicons name="share-social-outline" size={19} color="#fff" />
            </TouchableOpacity>
          )}
          {!isOwn && (
            <TouchableOpacity style={styles.actionBtn} onPress={handleReport} disabled={reporting}>
              {reporting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="flag-outline" size={19} color="#fff" />}
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {person ? (
          <View style={styles.info} pointerEvents="box-none">
            {person.looking_for_partner ? (
              <View style={styles.partnerChip}>
                <Text style={{ fontSize: 12 }}>🤝</Text>
                <Text style={styles.partnerChipText}>{t('trainingStatus.partnerBadge')}</Text>
              </View>
            ) : null}
            <Text style={styles.name}>
              {person.profiles?.name ?? '...'}
              {person.distance_km != null ? <Text style={styles.distance}>  ·  {person.distance_km < 1 ? '<1' : Math.round(person.distance_km)} km</Text> : null}
            </Text>
            {person.status_text ? <Text style={styles.text}>{person.status_text}</Text> : null}
            <View style={styles.metaRow}>
              {person.training_time ? (
                <View style={styles.meta}>
                  <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.metaText}>{person.training_time}</Text>
                </View>
              ) : null}
              {person.gym_name ? (
                <View style={styles.meta}>
                  <Ionicons name="barbell-outline" size={13} color={PRIMARY} />
                  <Text style={[styles.metaText, { color: PRIMARY }]}>{person.gym_name}</Text>
                </View>
              ) : null}
            </View>
            {/* Reakcje i przejscie do profilu tylko dla OGLADAJACYCH — nie na wlasnej relacji */}
            {!isOwn && (
              <>
                <View style={styles.reactionsRow}>
                  {REACTION_EMOJIS.map(emoji => {
                    const active = myReactions[person.profile_id] === emoji
                    return (
                      <TouchableOpacity
                        key={emoji}
                        style={[styles.reactionBtn, active && styles.reactionBtnActive]}
                        onPress={() => react(person.profile_id, emoji)}
                      >
                        <Text style={{ fontSize: 20 }}>{emoji}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                <TouchableOpacity
                  style={styles.profileBtn}
                  onPress={() => {
                    const pid = person.profile_id
                    onClose()
                    router.push({ pathname: '/profile/profile-detail', params: { profileId: pid } } as any)
                  }}
                >
                  <Ionicons name="person-outline" size={15} color="#0d1b2e" />
                  <Text style={styles.profileBtnText}>{t('chat.viewProfile')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: '#000' },
  media: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  mediaHidden: { opacity: 0 },
  gradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%' },
  tapLeft: { position: 'absolute', top: 0, bottom: 200, left: 0, width: '50%', zIndex: 3 },
  tapRight: { position: 'absolute', top: 0, bottom: 200, right: 0, width: '50%', zIndex: 3 },
  bars: { position: 'absolute', top: 52, left: 12, right: 12, flexDirection: 'row', gap: 4, zIndex: 6 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  barActive: { backgroundColor: 'rgba(255,255,255,0.95)' },
  topActions: { position: 'absolute', top: 66, right: 16, flexDirection: 'row', gap: 10, zIndex: 7 },
  actionBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  info: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 44, zIndex: 4 },
  name: { fontSize: 22, fontWeight: '700', color: '#fff' },
  distance: { fontSize: 14, fontWeight: '600', color: '#94e336' },
  text: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  partnerChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: '#94e336', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  partnerChipText: { fontSize: 11, fontWeight: '700', color: '#0d1b2e' },
  reactionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  reactionBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  reactionBtnActive: { backgroundColor: 'rgba(148,227,54,0.35)', borderWidth: 1.5, borderColor: '#94e336' },
  profileBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: PRIMARY, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9, marginTop: 14 },
  profileBtnText: { fontSize: 13, fontWeight: '700', color: '#0d1b2e' },
})
