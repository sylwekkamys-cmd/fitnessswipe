import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { supabase, getMyProfile, getBlockedUsers, unblockUser } from '../lib/supabase'
import type { Profile } from '../lib/supabase'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

const PRIMARY = '#7dc52e'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

export default function BlockedUsersScreen() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [blocked, setBlocked] = useState<Profile[]>([])
  const [myId, setMyId] = useState<string>('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      if (!me) return
      setMyId(me.id)
      const list = await getBlockedUsers(me.id)
      setBlocked(list)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  function handleUnblock(profile: Profile) {
    Alert.alert(
      t('reportBlock.unblock'),
      t('reportBlock.unblockConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('reportBlock.unblock'), onPress: async () => {
            try {
              await unblockUser(myId, (profile as any).id)
              setBlocked(prev => prev.filter(p => (p as any).id !== (profile as any).id))
              Alert.alert('✅', t('reportBlock.unblockedSuccess'))
            } catch (e: any) {
              Alert.alert(t('common.error'), e?.message ?? '')
            }
          }
        }
      ]
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('reportBlock.blockedUsersTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>
      ) : blocked.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="ban-outline" size={36} color="rgba(255,255,255,0.3)" />
          </View>
          <Text style={styles.emptyText}>{t('reportBlock.noBlockedUsers')}</Text>
        </View>
      ) : (
        <FlatList
          data={blocked}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }: any) => (
            <View style={styles.row}>
              <Image
                source={{ uri: item.photo_urls?.[0] ?? 'https://i.pravatar.cc/100' }}
                style={styles.avatar}
              />
              <Text style={styles.name}>{item.name}</Text>
              <TouchableOpacity style={styles.unblockBtn} onPress={() => handleUnblock(item)}>
                <Text style={styles.unblockBtnText}>{t('reportBlock.unblock')}</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BG_LIGHT, borderRadius: 14, padding: 12, marginBottom: 10 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#333' },
  name: { flex: 1, fontSize: 15, fontWeight: '600', color: '#fff' },
  unblockBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: PRIMARY },
  unblockBtnText: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
})
