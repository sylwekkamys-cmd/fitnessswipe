import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert, Modal
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import {
  getMyProfile, getChallengeMessages, sendChallengeMessage,
  subscribeToChallengeMessages, getChallengeParticipants, type ChallengeMessage,
  getMessageReactions, setMessageReaction, subscribeToReactions, REACTION_EMOJIS, REACTION_EMOJIS_EXTENDED, supabase,
  type MessageReaction,
} from '../lib/supabase'

const PRIMARY = '#7dc52e'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

export default function ChallengeChatScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams()
  const challengeId = params.challengeId as string
  const challengeTitle = params.challengeTitle as string

  const [myProfile, setMyProfile] = useState<any>(null)
  const [messages, setMessages] = useState<ChallengeMessage[]>([])
  const [participantsMap, setParticipantsMap] = useState<Record<string, any>>({})
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const flatListRef = useRef<FlatList>(null)
  // Reakcje na wiadomosci grupowe (jak w czacie 1:1)
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({})
  const [reactionTarget, setReactionTarget] = useState<ChallengeMessage | null>(null)
  const [showAllEmojis, setShowAllEmojis] = useState(false)
  const [whoTarget, setWhoTarget] = useState<string | null>(null)
  const messagesRef = useRef<ChallengeMessage[]>([])
  useEffect(() => { messagesRef.current = messages }, [messages])

  // Dwie drogi dostarczania na zywo: postgres_changes + broadcast od nadawcy.
  // Wspolna obsluga z deduplikacja (wiadomosc moze przyjsc obiema drogami).
  const broadcastRef = useRef<any>(null)

  function handleIncoming(msg: ChallengeMessage) {
    if (!msg?.id) return
    setMessages(prev => {
      // Usun tymczasowa (optimistic) wersje tej wiadomosci jesli istnieje
      const withoutTemp = prev.filter(m =>
        !(m.id.startsWith('temp-') && m.sender_id === msg.sender_id && m.content === msg.content)
      )
      // Unikaj duplikatu jesli wiadomosc juz jest (np. przyszla druga droga)
      if (withoutTemp.some(m => m.id === msg.id)) return withoutTemp
      return [...withoutTemp, msg]
    })
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
  }

  useEffect(() => {
    loadData()
    const channel = subscribeToChallengeMessages(challengeId, handleIncoming)
    const broadcast = supabase.channel(`challenge-chat:${challengeId}`)
    broadcast.on('broadcast', { event: 'msg' }, (payload: any) => handleIncoming(payload?.payload)).subscribe()
    broadcastRef.current = broadcast
    const reactionChannel = subscribeToReactions(String(challengeId), true, () => loadReactions(messagesRef.current))
    return () => { channel.unsubscribe(); supabase.removeChannel(broadcast); supabase.removeChannel(reactionChannel) }
  }, [challengeId])

  async function loadReactions(msgs: ChallengeMessage[]) {
    try {
      const ids = msgs.filter(m => !m.id.startsWith('temp-')).map(m => m.id)
      const rows = await getMessageReactions(ids, true)
      const map: Record<string, MessageReaction[]> = {}
      rows.forEach(r => { (map[r.message_id] = map[r.message_id] ?? []).push(r) })
      setReactions(map)
    } catch (e) { }
  }

  async function pickReaction(emoji: string) {
    const msg = reactionTarget
    setReactionTarget(null)
    if (!msg || !myProfile || msg.id.startsWith('temp-')) return
    const mine = (reactions[msg.id] ?? []).find(r => r.profile_id === myProfile.id)
    const next = mine?.emoji === emoji ? null : emoji
    setReactions(prev => {
      const rest = (prev[msg.id] ?? []).filter(r => r.profile_id !== myProfile.id)
      return { ...prev, [msg.id]: next ? [...rest, { message_id: msg.id, profile_id: myProfile.id, emoji: next }] : rest }
    })
    await setMessageReaction(msg.id, myProfile.id, next, true)
  }

  async function loadData() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      setMyProfile(me)

      const participants = await getChallengeParticipants(challengeId)
      const map: Record<string, any> = {}
      participants.forEach((p: any) => { map[p.profile_id] = p.profiles })
      setParticipantsMap(map)

      const msgs = await getChallengeMessages(challengeId)
      setMessages(msgs)
      loadReactions(msgs)
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200)
    } catch (e) {
      console.log('loadData challenge-chat error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleSend() {
    if (!text.trim() || !myProfile || sending) return
    setSending(true)
    const content = text.trim()
    setText('')

    // Optimistic update - pokaz wiadomosc od razu, nie czekaj na realtime
    const tempMessage: ChallengeMessage = {
      id: `temp-${Date.now()}`,
      challenge_id: challengeId,
      sender_id: myProfile.id,
      content,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMessage])
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)

    try {
      const saved = await sendChallengeMessage(challengeId, myProfile.id, content)
      if (!saved) throw new Error('send failed')
      // Podmien tymczasowa na prawdziwa i rozglos do reszty uczestnikow
      setMessages(prev => prev.map(m => m.id === tempMessage.id ? saved : m))
      broadcastRef.current?.send({ type: 'broadcast', event: 'msg', payload: saved })
    } catch (e) {
      // Usun tymczasowa wiadomosc jesli wyslanie sie nie udalo
      setMessages(prev => prev.filter(m => m.id !== tempMessage.id))
      setText(content)
      Alert.alert(t('common.error'))
    } finally {
      setSending(false)
    }
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  function renderMessage({ item }: { item: ChallengeMessage }) {
    const isMine = item.sender_id === myProfile?.id
    const sender = participantsMap[item.sender_id]

    return (
      <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
        {!isMine && (
          <Image
            source={{ uri: sender?.photo_urls?.[0] ?? 'https://i.pravatar.cc/100' }}
            style={styles.msgAvatar}
          />
        )}
        <View style={{ maxWidth: '100%' }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={() => !item.id.startsWith('temp-') && setReactionTarget(item)}
            delayLongPress={280}
            style={[styles.msgBubble, isMine ? styles.msgBubbleMine : styles.msgBubbleTheirs]}
          >
            {!isMine && <Text style={styles.msgSenderName}>{sender?.name ?? '...'}</Text>}
            <Text style={styles.msgText}>{item.content}</Text>
            <Text style={styles.msgTime}>{formatTime(item.created_at)}</Text>
          </TouchableOpacity>
          {(reactions[item.id] ?? []).length > 0 && (
            <TouchableOpacity
              style={[styles.reactPillsRow, isMine && { alignSelf: 'flex-end' }]}
              onPress={() => setWhoTarget(item.id)}
              activeOpacity={0.7}
            >
              {Object.entries(
                (reactions[item.id] ?? []).reduce((acc: Record<string, number>, r) => { acc[r.emoji] = (acc[r.emoji] ?? 0) + 1; return acc }, {})
              ).map(([emoji, count]) => {
                const mine = (reactions[item.id] ?? []).some(r => r.emoji === emoji && r.profile_id === myProfile?.id)
                return (
                  <View key={emoji} style={[styles.reactPill, mine && styles.reactPillMine]}>
                    <Text style={styles.reactPillText}>{emoji} {count > 1 ? count : ''}</Text>
                  </View>
                )
              })}
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={PRIMARY} />
    </View>
  )

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerIconCircle}>
          <Ionicons name="chatbubbles" size={18} color={PRIMARY} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{challengeTitle}</Text>
          <Text style={styles.headerSubtitle}>{Object.keys(participantsMap).length} {t('challenges.leaderboard') ? '' : ''}{t('liveMap.peopleHere') ? '' : ''}{t('challenges.participants') || 'participants'}</Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={40} color={PRIMARY} />
            <Text style={styles.emptyTitle}>{t('challenges.noMessages') || 'No messages yet'}</Text>
            <Text style={styles.emptySubtitle}>{t('challenges.beFirstMessage') || 'Say hi to your challenge group!'}</Text>
          </View>
        }
      />

      <View style={[styles.inputRow, { paddingBottom: 12 + insets.bottom }]}>
        <TextInput
          style={styles.input}
          placeholder={t('chat.placeholder')}
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Pasek reakcji po przytrzymaniu wiadomosci; "+" rozwija pelna siatke */}
      <Modal visible={!!reactionTarget} transparent animationType="fade" onRequestClose={() => { setReactionTarget(null); setShowAllEmojis(false) }}>
        <TouchableOpacity style={styles.reactOverlay} activeOpacity={1} onPress={() => { setReactionTarget(null); setShowAllEmojis(false) }}>
          {!showAllEmojis ? (
            <View style={styles.reactBar}>
              {REACTION_EMOJIS.map(emoji => {
                const mine = reactionTarget && (reactions[reactionTarget.id] ?? []).some(r => r.emoji === emoji && r.profile_id === myProfile?.id)
                return (
                  <TouchableOpacity key={emoji} style={[styles.reactBarBtn, mine && styles.reactBarBtnMine]} onPress={() => { setShowAllEmojis(false); pickReaction(emoji) }}>
                    <Text style={{ fontSize: 26 }}>{emoji}</Text>
                  </TouchableOpacity>
                )
              })}
              <TouchableOpacity style={styles.reactMoreBtn} onPress={() => setShowAllEmojis(true)}>
                <Ionicons name="add" size={22} color="#94e336" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.reactGrid} onStartShouldSetResponder={() => true}>
              {REACTION_EMOJIS_EXTENDED.map(emoji => {
                const mine = reactionTarget && (reactions[reactionTarget.id] ?? []).some(r => r.emoji === emoji && r.profile_id === myProfile?.id)
                return (
                  <TouchableOpacity key={emoji} style={[styles.reactGridBtn, mine && styles.reactBarBtnMine]} onPress={() => { setShowAllEmojis(false); pickReaction(emoji) }}>
                    <Text style={{ fontSize: 25 }}>{emoji}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </TouchableOpacity>
      </Modal>

      {/* Kto zareagowal */}
      <Modal visible={!!whoTarget} transparent animationType="slide" onRequestClose={() => setWhoTarget(null)}>
        <TouchableOpacity style={styles.whoOverlay} activeOpacity={1} onPress={() => setWhoTarget(null)}>
          <View style={styles.whoSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.whoHandle} />
            <Text style={styles.whoTitle}>{t('chat.reactionsTitle')}</Text>
            {(whoTarget ? reactions[whoTarget] ?? [] : []).map(r => {
              const person = r.profile_id === myProfile?.id ? myProfile : participantsMap[r.profile_id]
              return (
                <View key={r.profile_id} style={styles.whoRow}>
                  <Image source={{ uri: person?.photo_urls?.[0] ?? 'https://i.pravatar.cc/40' }} style={styles.whoAvatar} />
                  <Text style={styles.whoName}>{r.profile_id === myProfile?.id ? t('chat.you') : person?.name ?? '...'}</Text>
                  <Text style={{ fontSize: 20 }}>{r.emoji}</Text>
                </View>
              )
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },

  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 55, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(125,197,46,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: PRIMARY, marginTop: 2, fontWeight: '600' },

  emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginTop: 12, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 6 },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12, maxWidth: '85%' },
  msgRowMine: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14 },
  msgBubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '100%' },
  msgBubbleMine: { backgroundColor: PRIMARY, borderBottomRightRadius: 4 },
  msgBubbleTheirs: { backgroundColor: BG_LIGHT, borderBottomLeftRadius: 4 },
  msgSenderName: { fontSize: 12, fontWeight: '700', color: PRIMARY, marginBottom: 3 },
  msgText: { fontSize: 15, color: '#fff', lineHeight: 20 },
  msgTime: { fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 4, alignSelf: 'flex-end' },

  reactPillsRow: { flexDirection: 'row', gap: 4, marginTop: 3, alignSelf: 'flex-start' },
  reactPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: BG_LIGHT, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 11, paddingHorizontal: 7, paddingVertical: 2 },
  reactPillMine: { borderColor: 'rgba(148,227,54,0.55)', backgroundColor: 'rgba(148,227,54,0.12)' },
  reactPillText: { fontSize: 12, color: '#fff' },
  reactOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  reactBar: { flexDirection: 'row', gap: 10, backgroundColor: BG_LIGHT, borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.5)', borderRadius: 26, paddingHorizontal: 16, paddingVertical: 10 },
  reactBarBtn: { padding: 4, borderRadius: 18 },
  reactBarBtnMine: { backgroundColor: 'rgba(148,227,54,0.2)' },
  reactMoreBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(148,227,54,0.12)', borderWidth: 1, borderColor: 'rgba(148,227,54,0.4)', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  reactGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, backgroundColor: BG_LIGHT, borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.5)', borderRadius: 22, padding: 14, marginHorizontal: 28 },
  reactGridBtn: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  whoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  whoSheet: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  whoHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 12 },
  whoTitle: { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 10 },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  whoAvatar: { width: 34, height: 34, borderRadius: 17 },
  whoName: { flex: 1, fontSize: 14.5, fontWeight: '600', color: '#fff' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  input: { flex: 1, backgroundColor: BG_LIGHT, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#fff', maxHeight: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: 'rgba(125,197,46,0.3)' },
})
