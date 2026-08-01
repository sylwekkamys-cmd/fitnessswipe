import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import {
  supabase, getMyProfile, getSquadMessages, sendSquadMessage,
  subscribeToSquadMessages, getSquadMembers, type SquadMessage,
} from '../lib/supabase'

const PRIMARY = '#7dc52e'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

// Throttling pushy: przy zywej rozmowie kazda wiadomosc bombardowala czlonkow
// osobnym pushem. Max 1 push/min na ekipe z tego urzadzenia — kolejne
// wiadomosci i tak docieraja realtime'em, a osoby poza czatem dostana
// nastepny push najdalej po minucie. Poziom modulu: przezywa remount ekranu.
const lastSquadPushAt: Record<string, number> = {}
const SQUAD_PUSH_INTERVAL_MS = 60_000

// Czat ekipy "na dzis": wspolny watek czlonkow ogloszenia do ustalenia
// szczegolow spotkania. Dostarczanie podwojne (postgres_changes + broadcast
// od nadawcy) z deduplikacja — lekcja z czatu wyzwan.
export default function SquadChatScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams()
  const squadId = params.squadId as string
  const title = params.title as string

  const [myProfile, setMyProfile] = useState<any>(null)
  const [messages, setMessages] = useState<SquadMessage[]>([])
  const [membersMap, setMembersMap] = useState<Record<string, any>>({})
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const flatListRef = useRef<FlatList>(null)
  const broadcastRef = useRef<any>(null)

  function handleIncoming(msg: SquadMessage) {
    if (!msg?.id) return
    setMessages(prev => {
      const withoutTemp = prev.filter(m =>
        !(m.id.startsWith('temp-') && m.sender_id === msg.sender_id && m.content === msg.content)
      )
      if (withoutTemp.some(m => m.id === msg.id)) return withoutTemp
      return [...withoutTemp, msg]
    })
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
  }

  useEffect(() => {
    loadData()
    const channel = subscribeToSquadMessages(squadId, handleIncoming)
    const broadcast = supabase.channel(`squad-chat:${squadId}`)
    broadcast.on('broadcast', { event: 'msg' }, (payload: any) => handleIncoming(payload?.payload)).subscribe()
    broadcastRef.current = broadcast
    return () => { channel.unsubscribe(); supabase.removeChannel(broadcast) }
  }, [squadId])

  async function loadData() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      setMyProfile(me)
      const members = await getSquadMembers(squadId)
      const map: Record<string, any> = {}
      members.forEach(m => { map[m.id] = m })
      setMembersMap(map)
      setMessages(await getSquadMessages(squadId))
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200)
    } catch (e) {
      console.log('loadData squad-chat error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleSend() {
    if (!text.trim() || !myProfile || sending) return
    setSending(true)
    const content = text.trim()
    setText('')

    const tempMessage: SquadMessage = {
      id: `temp-${Date.now()}`,
      squad_id: squadId,
      sender_id: myProfile.id,
      content,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMessage])
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)

    try {
      const saved = await sendSquadMessage(squadId, myProfile.id, content)
      if (!saved) throw new Error('send failed')
      setMessages(prev => prev.map(m => m.id === tempMessage.id ? saved : m))
      broadcastRef.current?.send({ type: 'broadcast', event: 'msg', payload: saved })
      // Push do pozostalych czlonkow — spotkanie jest dzis, licza sie minuty,
      // ale nie czesciej niz raz na minute (throttling powyzej)
      const now = Date.now()
      if (now - (lastSquadPushAt[squadId] ?? 0) >= SQUAD_PUSH_INTERVAL_MS) {
        lastSquadPushAt[squadId] = now
        try {
          const { notifyProfile } = await import('../lib/notifications')
          Object.keys(membersMap)
            .filter(id => id !== myProfile.id)
            .forEach(id => notifyProfile(id, `⚡ ${myProfile.name}`, content, { type: 'squad' }))
        } catch (e) { }
      }
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== tempMessage.id))
      setText(content)
      Alert.alert(t('common.error'))
    } finally {
      setSending(false)
    }
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
  }

  function renderMessage({ item }: { item: SquadMessage }) {
    const isMine = item.sender_id === myProfile?.id
    const sender = membersMap[item.sender_id]
    return (
      <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
        {!isMine && (
          <Image source={{ uri: sender?.photo_urls?.[0] ?? 'https://i.pravatar.cc/100' }} style={styles.msgAvatar} />
        )}
        <View style={[styles.msgBubble, isMine ? styles.msgBubbleMine : styles.msgBubbleTheirs]}>
          {!isMine && <Text style={styles.msgSenderName}>{sender?.name ?? '...'}</Text>}
          <Text style={[styles.msgText, isMine && { color: BG }]}>{item.content}</Text>
          <Text style={[styles.msgTime, isMine && { color: 'rgba(13,27,46,0.5)' }]}>{formatTime(item.created_at)}</Text>
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
          <Text style={{ fontSize: 16 }}>{'⚡'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.headerSubtitle}>{Object.keys(membersMap).length} 👥</Text>
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
            <Text style={{ fontSize: 40 }}>{'⚡'}</Text>
            <Text style={styles.emptyTitle}>{t('squad.chatEmpty')}</Text>
            <Text style={styles.emptySubtitle}>{t('squad.chatEmptySub')}</Text>
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
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 55, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(148,227,54,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: PRIMARY, marginTop: 2, fontWeight: '600' },
  emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: 30, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#fff', textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12, maxWidth: '85%' },
  msgRowMine: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14 },
  msgBubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '100%' },
  msgBubbleMine: { backgroundColor: PRIMARY, borderBottomRightRadius: 4 },
  msgBubbleTheirs: { backgroundColor: BG_LIGHT, borderBottomLeftRadius: 4 },
  msgSenderName: { fontSize: 12, fontWeight: '700', color: PRIMARY, marginBottom: 3 },
  msgText: { fontSize: 15, color: '#fff', lineHeight: 20 },
  msgTime: { fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 4, alignSelf: 'flex-end' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  input: { flex: 1, backgroundColor: BG_LIGHT, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#fff', maxHeight: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: 'rgba(125,197,46,0.3)' },
})
