import React, { useState, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, RefreshControl } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { getMyProfile, getTrainerInbox } from '../lib/supabase'

const SBG = '#0b0b0e'
const SCARD = '#17171c'
const GOLD = '#d4af37'

export default function TrainerInboxScreen() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [inbox, setInbox] = useState<any[]>([])

  useFocusEffect(useCallback(() => { loadData() }, []))

  async function loadData() {
    try {
      const me = await getMyProfile()
      if (!me) return
      setInbox(await getTrainerInbox(me.id))
    } finally { setLoading(false); setRefreshing(false) }
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('trainer.inboxTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={GOLD} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData() }} tintColor={GOLD} />}
        >
          {inbox.map(c => (
            <TouchableOpacity key={c.matchId} style={styles.row} onPress={() => router.push(`/chat/${c.matchId}` as any)} activeOpacity={0.8}>
              {c.clientPhoto ? (
                <Image source={{ uri: c.clientPhoto }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarEmpty]}><Ionicons name="person" size={18} color="rgba(255,255,255,0.35)" /></View>
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={[styles.name, c.unread > 0 && { color: GOLD }]}>{c.clientName}</Text>
                  <Text style={styles.time}>{formatTime(c.lastMessageAt)}</Text>
                </View>
                <Text style={[styles.preview, c.unread > 0 && styles.previewUnread]} numberOfLines={1}>
                  {c.lastMessage || t('trainer.inboxNoMessages')}
                </Text>
              </View>
              {c.unread > 0 && (
                <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{c.unread > 9 ? '9+' : c.unread}</Text></View>
              )}
            </TouchableOpacity>
          ))}
          {inbox.length === 0 && (
            <View style={styles.empty}>
              <Text style={{ fontSize: 44, marginBottom: 10 }}>{"📥"}</Text>
              <Text style={styles.emptyText}>{t('trainer.inboxEmpty')}</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SBG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 55, paddingBottom: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: SCARD, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarEmpty: { backgroundColor: '#26262c', alignItems: 'center', justifyContent: 'center' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: '#fff' },
  time: { fontSize: 11.5, color: 'rgba(255,255,255,0.35)' },
  preview: { fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  previewUnread: { color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadBadgeText: { fontSize: 11, fontWeight: '800', color: SBG },
  empty: { alignItems: 'center', paddingVertical: 50 },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
})
