import React, { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Alert, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, ScrollView, PanResponder } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useVideoPlayer, VideoView } from 'expo-video'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { supabase, incrementStatusView, reportUser, getStatusViewers, setSliderResponse } from '../lib/supabase'
import { OverlayPillsView, FilterLayer, formatCountdown } from './statusMedia'

const PRIMARY = '#7dc52e'
const REACTION_EMOJIS = ['💪', '🔥', '👊']
const SLIDER_TRACK_WIDTH = 180
const COUNTDOWN_REMINDER_KEY = 'countdown_reminder_'

// Re-eksport dla ekranow, ktore importowaly stad naklejki
export { OverlayPillsView as OverlayPills }

// Naklejka slidera u WIDZA: przeciagana buzia po torze, puszczenie wysyla
// odpowiedz (0-1). Na WLASNEJ relacji (disabled) to tylko statyczny podglad —
// autor sredni wynik widzi na liscie swoich relacji, nie tutaj.
function SliderOverlayViewer({ ov, statusId, disabled }: { ov: any; statusId: string; disabled: boolean }) {
  const [value, setValue] = useState(0.5)
  const valueRef = useRef(0.5)
  valueRef.current = value
  const startRef = useRef(0.5)
  const [answered, setAnswered] = useState(false)

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { startRef.current = valueRef.current },
      onPanResponderMove: (_, g) => {
        setValue(Math.min(1, Math.max(0, startRef.current + g.dx / SLIDER_TRACK_WIDTH)))
      },
      onPanResponderRelease: () => {
        setAnswered(true)
        setSliderResponse(statusId, valueRef.current)
      },
    })
  ).current

  if (disabled) {
    return (
      <View style={sliderStyles.wrap} pointerEvents="none">
        {!!ov.text && <Text style={sliderStyles.label}>{ov.text}</Text>}
        <View style={sliderStyles.track}>
          <View style={sliderStyles.trackLine} />
          <View style={[sliderStyles.handle, { left: '50%', marginLeft: -22 }]}>
            <Text style={{ fontSize: 20 }}>{ov.sliderEmoji || '❤️'}</Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={sliderStyles.wrap}>
      {!!ov.text && <Text style={sliderStyles.label}>{ov.text}</Text>}
      <View style={sliderStyles.track} {...responder.panHandlers}>
        <View style={sliderStyles.trackLine} pointerEvents="none" />
        <View style={[sliderStyles.handle, { left: `${value * 100}%`, marginLeft: -22 }, answered && sliderStyles.handleAnswered]} pointerEvents="none">
          <Text style={{ fontSize: 20 }}>{ov.sliderEmoji || '❤️'}</Text>
        </View>
      </View>
    </View>
  )
}

// Naklejka odliczania u WIDZA: tykajacy zegar + przycisk lokalnego przypomnienia
// (zaplanowane na moment osiagniecia celu, dziala bez wzgledu na to czy relacja
// jeszcze bedzie widoczna). Na WLASNEJ relacji tylko zegar, bez przycisku.
function CountdownOverlayViewer({ ov, statusId, authorName, disabled }: { ov: any; statusId: string; authorName?: string; disabled: boolean }) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  const [reminded, setReminded] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    if (disabled) return
    AsyncStorage.getItem(COUNTDOWN_REMINDER_KEY + statusId).then(v => { if (v) setReminded(true) })
  }, [statusId, disabled])

  const target = new Date(ov.countdownTarget).getTime()
  const passed = target <= now

  async function remindMe() {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: t('trainingStatus.countdownReminderTitle'), body: `${authorName ?? ''} ${t('trainingStatus.countdownReminderBody')}`.trim() },
        trigger: { type: 'date', date: new Date(target) } as any,
      })
      await AsyncStorage.setItem(COUNTDOWN_REMINDER_KEY + statusId, id)
      setReminded(true)
    } catch (e) { }
  }

  return (
    <View style={countdownStyles.wrap} pointerEvents={disabled ? 'none' : 'box-none'}>
      <Text style={countdownStyles.value}>{passed ? '🏁' : formatCountdown(ov.countdownTarget, now)}</Text>
      {!disabled && !passed && (
        <TouchableOpacity style={[countdownStyles.btn, reminded && countdownStyles.btnActive]} onPress={remindMe} disabled={reminded}>
          <Ionicons name={reminded ? 'checkmark' : 'notifications-outline'} size={14} color={reminded ? '#0d1b2e' : '#fff'} />
          <Text style={[countdownStyles.btnText, reminded && { color: '#0d1b2e' }]}>
            {reminded ? t('trainingStatus.countdownReminded') : t('trainingStatus.countdownRemindMe')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// Jeden slajd: zdjecie (rozmyte tlo + contain) albo wideo (gra tylko gdy aktywne).
// isOwn: naklejka slidera renderuje sie jako interaktywna (przeciagalna) tylko
// dla WIDZOW cudzej relacji — na wlasnej to statyczny podglad (bez przeciagania)
function StoryMedia({ person, isActive, muted, isOwn }: { person: any; isActive: boolean; muted: boolean; isOwn: boolean }) {
  const videoUrl = person.video_url || null
  const player = useVideoPlayer(videoUrl, p => { p.loop = true })
  useEffect(() => {
    if (!videoUrl) return
    player.muted = muted
    if (isActive) player.play(); else player.pause()
  }, [isActive, muted, videoUrl])

  const sliderOv = (person.overlays ?? []).find((o: any) => o.type === 'slider')
  const sliderNode = isActive && sliderOv ? (
    <View
      style={[
        sliderStyles.anchor,
        { left: `${Math.min(Math.max(sliderOv.x * 100, 2), 78)}%`, top: `${Math.min(Math.max(sliderOv.y * 100, 6), 84)}%` },
      ]}
    >
      <SliderOverlayViewer ov={sliderOv} statusId={person.id} disabled={isOwn} />
    </View>
  ) : null

  const countdownOv = (person.overlays ?? []).find((o: any) => o.type === 'countdown')
  const countdownNode = isActive && countdownOv ? (
    <View
      style={[
        sliderStyles.anchor,
        { left: `${Math.min(Math.max(countdownOv.x * 100, 2), 78)}%`, top: `${Math.min(Math.max(countdownOv.y * 100, 6), 84)}%` },
      ]}
    >
      <CountdownOverlayViewer ov={countdownOv} statusId={person.id} authorName={person.profiles?.name} disabled={isOwn} />
    </View>
  ) : null

  const hidden = ['slider', 'countdown']

  if (videoUrl) {
    return (
      <View style={[styles.media, !isActive && styles.mediaHidden]}>
        <VideoView player={player} style={styles.media} contentFit="contain" nativeControls={false} />
        <FilterLayer id={person.filter} />
        {isActive && <OverlayPillsView status={person} hideTypes={hidden} />}
        {sliderNode}
        {countdownNode}
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
        {isActive && <OverlayPillsView status={person} hideTypes={hidden} />}
        {sliderNode}
        {countdownNode}
      </View>
    )
  }
  return (
    <View style={[styles.media, !isActive && styles.mediaHidden]}>
      <Image source={{ uri }} style={styles.media} resizeMode="cover" blurRadius={30} />
      <View style={[styles.media, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
      <Image source={{ uri }} style={styles.media} resizeMode="contain" />
      <FilterLayer id={person.filter} />
      {isActive && <OverlayPillsView status={person} hideTypes={hidden} />}
      {sliderNode}
      {countdownNode}
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
  // Odpowiedz na relacje -> czat 1:1 (tylko gdy jest match z autorem)
  const [matchByProfile, setMatchByProfile] = useState<Record<string, string>>({})
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [replySent, setReplySent] = useState(false)
  // Lista widzow wlasnej relacji: arkusz otwierany NA MIEJSCU (bez wychodzenia z podgladu)
  const [viewersOpen, setViewersOpen] = useState(false)
  const [viewersList, setViewersList] = useState<any[]>([])
  const [viewersLoading, setViewersLoading] = useState(false)
  const touchStart = useRef({ x: 0, y: 0 })

  async function openViewersSheet() {
    if (!myProfile) return
    setViewersOpen(true)
    setViewersLoading(true)
    try { setViewersList(await getStatusViewers(myProfile.id)) } catch (e) { }
    finally { setViewersLoading(false) }
  }

  function viewedAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${Math.max(mins, 1)} min`
    if (mins < 60 * 24) return `${Math.floor(mins / 60)} h`
    return `${Math.floor(mins / (60 * 24))} d`
  }

  // Zamkniecie podgladu / zmiana slajdu chowa arkusz widzow
  useEffect(() => { setViewersOpen(false) }, [visible, index])

  // Mapa autor -> id matcha (odpowiadac mozna tylko dopasowanym; czaty trenerskie odpadaja)
  useEffect(() => {
    if (!visible || !myProfile || people.length === 0) return
    supabase
      .from('matches')
      .select('id, profile_a_id, profile_b_id')
      .or(`profile_a_id.eq.${myProfile.id},profile_b_id.eq.${myProfile.id}`)
      .not('is_trainer_chat', 'is', true)
      .then(({ data }) => {
        const map: Record<string, string> = {}
        ;(data ?? []).forEach((m: any) => {
          map[m.profile_a_id === myProfile.id ? m.profile_b_id : m.profile_a_id] = m.id
        })
        setMatchByProfile(map)
      })
  }, [visible])

  // Zmiana slajdu czysci stan odpowiedzi
  useEffect(() => { setReplyText(''); setReplySent(false) }, [index, visible])

  async function sendStoryReply() {
    const person = people[index]
    if (!person || !myProfile || !replyText.trim() || sendingReply) return
    const matchId = matchByProfile[person.profile_id]
    if (!matchId) return
    setSendingReply(true)
    try {
      await supabase.from('messages').insert({
        match_id: matchId,
        sender_id: myProfile.id,
        content: replyText.trim(),
        image_url: person.status_photo_url || null,
        story_reply: true,
      })
      try {
        const { notifyProfile } = await import('../lib/notifications')
        notifyProfile(person.profile_id, myProfile.name, replyText.trim(), { type: 'message', matchId })
      } catch (e) { }
      setReplyText('')
      setReplySent(true)
      setTimeout(() => setReplySent(false), 2000)
    } catch (e) { }
    finally { setSendingReply(false) }
  }

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
      const isNew = !current
      setMyReactions(prev => ({ ...prev, [statusProfileId]: emoji }))
      await supabase.from('status_reactions').upsert(
        { status_profile_id: statusProfileId, reactor_id: myProfile.id, emoji },
        { onConflict: 'status_profile_id,reactor_id' }
      )
      // Push do autora tylko przy PIERWSZEJ reakcji (zmiana emoji nie spamuje)
      if (isNew && statusProfileId !== myProfile.id) {
        try {
          const { notifyProfile } = await import('../lib/notifications')
          notifyProfile(statusProfileId, myProfile.name, `${emoji} ${t('trainingStatus.reactionPush')}`, { type: 'story_reaction' })
        } catch (e) { }
      }
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
      <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {people.map((p, i) => (
          <StoryMedia
            key={p.id ?? `${p.profile_id}-${i}`}
            person={p}
            isActive={visible && i === index}
            muted={muted}
            isOwn={!!myProfile && p.profile_id === myProfile.id}
          />
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
            {/* Wlasna relacja: przycisk listy widzow (jak na Instagramie) */}
            {isOwn && (
              <TouchableOpacity style={styles.viewersBtn} onPress={openViewersSheet}>
                <Ionicons name="eye-outline" size={16} color="#fff" />
                <Text style={styles.viewersBtnText}>
                  {person.view_count ?? 0} · {t('trainingStatus.seeViewers')}
                </Text>
              </TouchableOpacity>
            )}
            {/* Reakcje i przejscie do profilu tylko dla OGLADAJACYCH — nie na wlasnej relacji */}
            {!isOwn && (
              <>
                {/* Odpowiedz wiadomoscia — tylko gdy autor to Twoj match */}
                {matchByProfile[person.profile_id] && (
                  <View style={styles.replyRow}>
                    <TextInput
                      style={styles.replyInput}
                      placeholder={t('chat.storyReplyPlaceholder')}
                      placeholderTextColor="rgba(255,255,255,0.45)"
                      value={replyText}
                      onChangeText={setReplyText}
                      maxLength={300}
                    />
                    <TouchableOpacity
                      style={[styles.replySendBtn, (!replyText.trim() || sendingReply) && { opacity: 0.5 }]}
                      onPress={sendStoryReply}
                      disabled={!replyText.trim() || sendingReply}
                    >
                      {sendingReply ? <ActivityIndicator size="small" color="#0d1b2e" /> : replySent ? (
                        <Ionicons name="checkmark" size={18} color="#0d1b2e" />
                      ) : (
                        <Ionicons name="send" size={16} color="#0d1b2e" />
                      )}
                    </TouchableOpacity>
                  </View>
                )}
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

        {/* Arkusz widzow i reakcji — nakladka wewnatrz podgladu (bez drugiego Modala) */}
        {viewersOpen && (
          <View style={styles.viewersOverlay}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setViewersOpen(false)} />
            <View style={styles.viewersSheet}>
              <View style={styles.viewersHandle} />
              <Text style={styles.viewersTitle}>👁️‍🗨️ {t('trainingStatus.viewersTitle')}</Text>
              {viewersLoading ? (
                <ActivityIndicator color={PRIMARY} style={{ marginVertical: 24 }} />
              ) : (
                <ScrollView style={{ maxHeight: 320 }}>
                  {viewersList.map((v: any) => (
                    <TouchableOpacity
                      key={v.viewer_id}
                      style={styles.viewerRow}
                      onPress={() => { setViewersOpen(false); onClose(); router.push({ pathname: '/profile/profile-detail', params: { profileId: v.viewer_id } } as any) }}
                    >
                      {v.profiles?.photo_urls?.[0] ? (
                        <Image source={{ uri: v.profiles.photo_urls[0] }} style={styles.viewerAvatar} />
                      ) : (
                        <View style={[styles.viewerAvatar, { backgroundColor: '#2e415c', alignItems: 'center', justifyContent: 'center' }]}>
                          <Ionicons name="person" size={15} color="rgba(255,255,255,0.35)" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.viewerName}>{v.profiles?.name ?? '...'}</Text>
                        <Text style={styles.viewerTime}>{viewedAgo(v.viewed_at)}</Text>
                      </View>
                      {v.emoji ? <Text style={{ fontSize: 19 }}>{v.emoji}</Text> : null}
                    </TouchableOpacity>
                  ))}
                  {viewersList.length === 0 && (
                    <Text style={styles.viewersEmpty}>{t('trainingStatus.viewersEmpty')}</Text>
                  )}
                </ScrollView>
              )}
              <TouchableOpacity style={styles.viewersClose} onPress={() => setViewersOpen(false)}>
                <Text style={styles.viewersCloseText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
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
  viewersBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8, marginTop: 12 },
  viewersBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  viewersOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 30, justifyContent: 'flex-end' },
  viewersSheet: { backgroundColor: '#1a2a44', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34 },
  viewersHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 12 },
  viewersTitle: { fontSize: 16, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 10 },
  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  viewerAvatar: { width: 38, height: 38, borderRadius: 19 },
  viewerName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  viewerTime: { fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  viewersEmpty: { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', paddingVertical: 18 },
  viewersClose: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  viewersCloseText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  replyInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 22, paddingHorizontal: 15, paddingVertical: 9, fontSize: 14, color: '#fff' },
  replySendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  reactionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  reactionBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  reactionBtnActive: { backgroundColor: 'rgba(148,227,54,0.35)', borderWidth: 1.5, borderColor: '#94e336' },
  profileBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: PRIMARY, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9, marginTop: 14 },
  profileBtnText: { fontSize: 13, fontWeight: '700', color: '#0d1b2e' },
})

const sliderStyles = StyleSheet.create({
  anchor: { position: 'absolute', zIndex: 5, maxWidth: '76%' },
  wrap: { width: SLIDER_TRACK_WIDTH, alignItems: 'center' },
  label: {
    fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 10, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
  },
  // track = wieksza strefa dotyku (44 wys.), trackLine = cienka widoczna kreska w srodku
  track: { width: '100%', height: 44, justifyContent: 'center' },
  trackLine: { width: '100%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.4)' },
  handle: {
    position: 'absolute', width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, borderColor: '#fff', backgroundColor: 'rgba(13,27,46,0.55)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },
  handleAnswered: { borderColor: '#94e336' },
})

const countdownStyles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  value: {
    fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
  },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8,
  },
  btnActive: { backgroundColor: '#94e336', borderColor: '#94e336' },
  btnText: { fontSize: 12.5, fontWeight: '700', color: '#fff' },
})
