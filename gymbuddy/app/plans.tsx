import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Alert, KeyboardAvoidingView, Platform, Image } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { getMyProfile, getWorkoutPlans, createWorkoutPlan, deleteWorkoutPlan, getTrainerClients, assignPlanToClient } from '../lib/supabase'

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

export default function PlansScreen() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [plans, setPlans] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  // Trener: wysylanie planu wybranemu podopiecznemu
  const [me, setMe] = useState<any>(null)
  const [assignPlan, setAssignPlan] = useState<any>(null)
  const [clients, setClients] = useState<any[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [assigning, setAssigning] = useState<string | null>(null)

  useFocusEffect(
    React.useCallback(() => { load() }, [])
  )

  async function load() {
    try {
      const my = await getMyProfile()
      if (!my) return
      setMe(my)
      setProfileId(my.id)
      setPlans(await getWorkoutPlans(my.id))
    } finally { setLoading(false) }
  }

  async function openAssign(plan: any) {
    setAssignPlan(plan)
    setClientsLoading(true)
    try { setClients(await getTrainerClients(profileId!)) }
    finally { setClientsLoading(false) }
  }

  async function handleAssign(client: any) {
    if (!assignPlan || !me) return
    setAssigning(client.id)
    try {
      const ok = await assignPlanToClient(
        assignPlan.id,
        { id: me.id, name: me.name },
        client.id,
        t('plans.assignPushBody', { plan: assignPlan.name })
      )
      if (ok) {
        setAssignPlan(null)
        Alert.alert('🎓', t('plans.assignedToast', { name: client.name }))
      } else {
        Alert.alert(t('common.error'), t('common.retry'))
      }
    } finally { setAssigning(null) }
  }

  async function handleCreate() {
    if (!profileId || !newName.trim() || creating) return
    setCreating(true)
    try {
      const id = await createWorkoutPlan(profileId, newName.trim())
      setShowCreate(false)
      setNewName('')
      if (id) { await load(); router.push(`/plan/${id}` as any) }
    } finally { setCreating(false) }
  }

  function handleDelete(plan: any) {
    Alert.alert(t('plans.deleteTitle'), plan.name, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('plans.delete'), style: 'destructive', onPress: async () => { await deleteWorkoutPlan(plan.id); load() } },
    ])
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('plans.title')}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4 }} showsVerticalScrollIndicator={false}>
        {plans.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>📝</Text>
            <Text style={styles.emptyTitle}>{t('plans.empty')}</Text>
            <Text style={styles.emptySub}>{t('plans.emptySub')}</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowCreate(true)}>
              <Text style={styles.emptyBtnText}>{t('plans.create')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {plans.map(p => (
          <TouchableOpacity
            key={p.id}
            style={[styles.planCard, p.assigned_by_name ? styles.planCardGold : null]}
            onPress={() => router.push(`/plan/${p.id}` as any)}
            onLongPress={() => handleDelete(p)}
          >
            <View style={[styles.planIcon, p.assigned_by_name ? styles.planIconGold : null]}>
              <Ionicons name={p.assigned_by_name ? 'school' : 'clipboard'} size={18} color={p.assigned_by_name ? '#d4af37' : LIME} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.planName}>{p.name}</Text>
              <Text style={styles.planMeta}>{t('plans.exerciseCount', { count: p.exercise_count })}</Text>
              {p.assigned_by_name ? (
                <Text style={styles.planFromTrainer}>🎓 {t('plans.fromTrainer', { name: p.assigned_by_name })}</Text>
              ) : null}
            </View>
            {(me as any)?.is_trainer && !p.assigned_by_name && (
              <TouchableOpacity style={styles.sendBtn} onPress={() => openAssign(p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="paper-plane-outline" size={17} color="#d4af37" />
              </TouchableOpacity>
            )}
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        ))}
        {plans.length > 0 && <Text style={styles.hint}>{t('plans.deleteHint')}</Text>}
      </ScrollView>

      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView style={styles.sheetOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('plans.createTitle')}</Text>
            <TextInput
              style={styles.sheetInput}
              value={newName}
              onChangeText={setNewName}
              placeholder={t('plans.namePlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              maxLength={40}
              autoFocus
            />
            <TouchableOpacity style={[styles.sheetSaveBtn, !newName.trim() && { opacity: 0.4 }]} onPress={handleCreate} disabled={!newName.trim() || creating}>
              {creating ? <ActivityIndicator color={BG} /> : <Text style={styles.sheetSaveText}>{t('plans.create')}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 10 }} onPress={() => setShowCreate(false)}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Trener: wybor podopiecznego, ktoremu wysylamy kopie planu */}
      <Modal visible={!!assignPlan} transparent animationType="slide" onRequestClose={() => setAssignPlan(null)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('plans.assignTitle', { plan: assignPlan?.name ?? '' })}</Text>
            {clientsLoading ? (
              <ActivityIndicator color={PRIMARY} style={{ marginVertical: 24 }} />
            ) : clients.length === 0 ? (
              <Text style={styles.assignEmpty}>{t('plans.assignNoClients')}</Text>
            ) : (
              <ScrollView style={{ maxHeight: 340 }}>
                {clients.map(c => (
                  <TouchableOpacity key={c.id} style={styles.clientRow} onPress={() => handleAssign(c)} disabled={!!assigning}>
                    {c.photo_urls?.[0] ? (
                      <Image source={{ uri: c.photo_urls[0] }} style={styles.clientAvatar} />
                    ) : (
                      <View style={[styles.clientAvatar, { backgroundColor: '#2e415c', alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="person" size={15} color="rgba(255,255,255,0.35)" />
                      </View>
                    )}
                    <Text style={styles.clientName}>{c.name}</Text>
                    {assigning === c.id ? (
                      <ActivityIndicator size="small" color="#d4af37" />
                    ) : (
                      <Ionicons name="paper-plane-outline" size={17} color="#d4af37" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 12 }} onPress={() => setAssignPlan(null)}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 55, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  emptyBox: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center' },
  emptySub: { fontSize: 13.5, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyBtn: { backgroundColor: LIME, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 13, marginTop: 20 },
  emptyBtnText: { color: BG, fontSize: 15, fontWeight: '800' },
  planCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BG_LIGHT, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  // Plan przypisany przez trenera: zlota ramka i tlo, spojnie ze Studiem
  planCardGold: { borderWidth: 1.5, borderColor: 'rgba(212,175,55,0.5)', backgroundColor: 'rgba(212,175,55,0.08)' },
  planIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(148,227,54,0.12)', alignItems: 'center', justifyContent: 'center' },
  planIconGold: { backgroundColor: 'rgba(212,175,55,0.14)' },
  planName: { fontSize: 15.5, fontWeight: '700', color: '#fff' },
  planFromTrainer: { fontSize: 11, fontWeight: '700', color: '#d4af37', marginTop: 3 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(212,175,55,0.12)', alignItems: 'center', justifyContent: 'center' },
  assignEmpty: { fontSize: 13.5, color: 'rgba(255,255,255,0.5)', textAlign: 'center', paddingVertical: 24, lineHeight: 20 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  clientAvatar: { width: 38, height: 38, borderRadius: 19 },
  clientName: { flex: 1, fontSize: 14.5, fontWeight: '700', color: '#fff' },
  planMeta: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  hint: { fontSize: 11.5, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 8 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 30 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 14 },
  sheetInput: { backgroundColor: BG, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#fff' },
  sheetSaveBtn: { backgroundColor: LIME, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  sheetSaveText: { color: BG, fontSize: 15, fontWeight: '800' },
})
