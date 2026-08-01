import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image, RefreshControl, Modal } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { checkIsAdmin, adminAction } from '../lib/supabase'

// Panel moderacji — widoczny tylko dla kont z admin_users (wejscie z Ustawien).
// Celowo bez i18n: ekran ogladaja wylacznie moderatorzy.

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Oczekuje',
  dismissed: 'Odrzucone',
  content_removed: 'Treść usunięta',
  banned: 'Zbanowano',
}

function ago(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${Math.max(mins, 1)} min temu`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h} h temu`
  return `${Math.floor(h / 24)} dni temu`
}

export default function AdminScreen() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [reports, setReports] = useState<any[]>([])
  const [certs, setCerts] = useState<any[]>([])
  const [certPreview, setCertPreview] = useState<string | null>(null)
  const [tab, setTab] = useState<'pending' | 'resolved' | 'certs'>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await adminAction({ action: 'list' })
      setReports(Array.isArray(data?.reports) ? data.reports : [])
      const certData = await adminAction({ action: 'cert_list' })
      setCerts(Array.isArray(certData?.certs) ? certData.certs : [])
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? String(e))
    }
  }, [])

  useEffect(() => {
    (async () => {
      // Twarda weryfikacja i tak siedzi w edge function — to tylko szybkie odciecie UI
      if (!(await checkIsAdmin())) { router.back(); return }
      await load()
      setLoading(false)
    })()
  }, [load])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function runAction(report: any, action: 'dismiss' | 'delete_content' | 'ban' | 'unban') {
    setBusyId(report.id)
    try {
      await adminAction({ action, reportId: report.id, profileId: report.reported_id })
      await load()
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? String(e))
    } finally { setBusyId(null) }
  }

  // Weryfikacja certyfikatow trenerow: zatwierdz od reki, odrzucenie z potwierdzeniem
  async function runCertAction(cert: any, approve: boolean) {
    setBusyId(cert.profile_id)
    try {
      await adminAction({ action: approve ? 'cert_approve' : 'cert_reject', profileId: cert.profile_id })
      await load()
    } catch (e: any) { Alert.alert('Błąd', e?.message ?? String(e)) }
    finally { setBusyId(null) }
  }

  function confirmCertReject(cert: any) {
    Alert.alert(`Odrzucić certyfikat: ${cert.profile?.name ?? ''}?`, 'Trener dostanie powiadomienie i będzie mógł wgrać dokument ponownie.', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Odrzuć', style: 'destructive', onPress: () => runCertAction(cert, false) },
    ])
  }

  function confirmAction(report: any, action: 'delete_content' | 'ban') {
    const name = report.reported?.name ?? 'użytkownika'
    Alert.alert(
      action === 'ban' ? `Zbanować ${name}?` : 'Usunąć zgłoszoną treść?',
      action === 'ban'
        ? 'Konto zostanie zablokowane (profil znika z apki, logowanie odcięte), a jego relacja usunięta.'
        : `Relacja użytkownika ${name} (zdjęcie/wideo/tekst) zostanie trwale usunięta.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        { text: action === 'ban' ? 'Zbanuj' : 'Usuń', style: 'destructive', onPress: () => runAction(report, action) },
      ]
    )
  }

  const pending = reports.filter(r => (r.status ?? 'pending') === 'pending')
  const resolved = reports.filter(r => (r.status ?? 'pending') !== 'pending')
  const shown = tab === 'pending' ? pending : resolved

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Moderacja</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabsRow}>
        <TouchableOpacity style={[styles.tabChip, tab === 'pending' && styles.tabChipActive]} onPress={() => setTab('pending')}>
          <Text style={[styles.tabChipText, tab === 'pending' && styles.tabChipTextActive]}>Oczekujące ({pending.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabChip, tab === 'resolved' && styles.tabChipActive]} onPress={() => setTab('resolved')}>
          <Text style={[styles.tabChipText, tab === 'resolved' && styles.tabChipTextActive]}>Rozpatrzone ({resolved.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabChip, tab === 'certs' && styles.tabChipActive]} onPress={() => setTab('certs')}>
          <Text style={[styles.tabChipText, tab === 'certs' && styles.tabChipTextActive]}>📄 Certyfikaty ({certs.length})</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
      >
        {/* Certyfikaty trenerow do weryfikacji */}
        {tab === 'certs' && certs.length === 0 && (
          <View style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={34} color="rgba(255,255,255,0.25)" />
            <Text style={styles.emptyText}>Brak certyfikatów do weryfikacji 🎉</Text>
          </View>
        )}
        {tab === 'certs' && certs.map(cert => {
          const busy = busyId === cert.profile_id
          return (
            <View key={cert.profile_id} style={styles.card}>
              <View style={styles.cardTop}>
                {cert.profile?.photo_urls?.[0] ? (
                  <Image source={{ uri: cert.profile.photo_urls[0] }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarEmpty]}><Ionicons name="person" size={16} color="rgba(255,255,255,0.35)" /></View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{cert.profile?.name ?? 'Nieznany'}</Text>
                  <Text style={styles.cardSub}>Certyfikat trenera do weryfikacji</Text>
                </View>
                <TouchableOpacity
                  style={styles.profileBtn}
                  onPress={() => router.push({ pathname: '/profile/profile-detail', params: { profileId: cert.profile_id } } as any)}
                >
                  <Ionicons name="open-outline" size={16} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              </View>

              {cert.certificate_url ? (
                <TouchableOpacity activeOpacity={0.85} onPress={() => setCertPreview(cert.certificate_url)}>
                  <Image source={{ uri: cert.certificate_url }} style={styles.certImage} resizeMode="cover" />
                  <View style={styles.certZoomHint}>
                    <Ionicons name="expand-outline" size={13} color="#fff" />
                    <Text style={styles.certZoomHintText}>Powiększ</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <Text style={styles.cardSub}>Brak pliku certyfikatu</Text>
              )}

              <View style={styles.actionsRow}>
                {busy ? <ActivityIndicator color={PRIMARY} style={{ flex: 1 }} /> : (
                  <>
                    <TouchableOpacity style={[styles.actionBtn, styles.actionDanger]} onPress={() => confirmCertReject(cert)}>
                      <Text style={styles.actionDangerText}>Odrzuć</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.actionApprove]} onPress={() => runCertAction(cert, true)}>
                      <Text style={styles.actionApproveText}>Zatwierdź</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          )
        })}

        {tab !== 'certs' && shown.length === 0 && (
          <View style={styles.emptyBox}>
            <Ionicons name={tab === 'pending' ? 'shield-checkmark-outline' : 'archive-outline'} size={34} color="rgba(255,255,255,0.25)" />
            <Text style={styles.emptyText}>{tab === 'pending' ? 'Brak oczekujących zgłoszeń 🎉' : 'Brak rozpatrzonych zgłoszeń'}</Text>
          </View>
        )}

        {tab !== 'certs' && shown.map(report => {
          const rep = report.reported
          const busy = busyId === report.id
          const st = report.reported_status
          const isStatusReport = typeof report.content_ref === 'string' && report.content_ref.startsWith('status')
          return (
            <View key={report.id} style={styles.card}>
              <View style={styles.cardTop}>
                {rep?.photo_urls?.[0] ? (
                  <Image source={{ uri: rep.photo_urls[0] }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarEmpty]}><Ionicons name="person" size={16} color="rgba(255,255,255,0.35)" /></View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.cardName}>{rep?.name ?? 'Nieznany'}</Text>
                    {rep?.banned && <View style={styles.bannedPill}><Text style={styles.bannedPillText}>BAN</Text></View>}
                  </View>
                  <Text style={styles.cardSub}>Zgłosił(a): {report.reporter?.name ?? '—'} · {ago(report.created_at)}</Text>
                </View>
                <TouchableOpacity
                  style={styles.profileBtn}
                  onPress={() => router.push({ pathname: '/profile/profile-detail', params: { profileId: report.reported_id } } as any)}
                >
                  <Ionicons name="open-outline" size={16} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              </View>

              <View style={styles.reasonBox}>
                <Text style={styles.reasonLabel}>POWÓD</Text>
                <Text style={styles.reasonText}>{report.reason}{report.details ? ` — ${report.details}` : ''}</Text>
                {isStatusReport && (
                  <Text style={styles.contentRefText}>
                    Zgłoszona treść: relacja {st ? (st.video_url ? '(wideo, nadal aktywna)' : st.status_photo_url ? '(zdjęcie, nadal aktywna)' : '(tekst, nadal aktywna)') : '(już wygasła/usunięta)'}
                  </Text>
                )}
              </View>

              {/* Podglad aktualnej relacji zglaszanego (jesli zyje) */}
              {st?.status_photo_url && !st?.video_url ? (
                <Image source={{ uri: st.status_photo_url }} style={styles.statusPreview} resizeMode="cover" />
              ) : null}
              {st?.status_text ? <Text style={styles.statusText}>„{st.status_text}"</Text> : null}

              {(report.status ?? 'pending') === 'pending' ? (
                <View style={styles.actionsRow}>
                  {busy ? <ActivityIndicator color={PRIMARY} style={{ flex: 1 }} /> : (
                    <>
                      <TouchableOpacity style={[styles.actionBtn, styles.actionNeutral]} onPress={() => runAction(report, 'dismiss')}>
                        <Text style={styles.actionNeutralText}>Odrzuć</Text>
                      </TouchableOpacity>
                      {st && (
                        <TouchableOpacity style={[styles.actionBtn, styles.actionWarn]} onPress={() => confirmAction(report, 'delete_content')}>
                          <Text style={styles.actionWarnText}>Usuń treść</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={[styles.actionBtn, styles.actionDanger]} onPress={() => confirmAction(report, 'ban')}>
                        <Text style={styles.actionDangerText}>Zbanuj</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              ) : (
                <View style={styles.resolvedRow}>
                  <Text style={styles.resolvedText}>
                    {STATUS_LABELS[report.status] ?? report.status}{report.resolved_at ? ` · ${ago(report.resolved_at)}` : ''}
                  </Text>
                  {report.status === 'banned' && (
                    busy ? <ActivityIndicator color={PRIMARY} /> : (
                      <TouchableOpacity onPress={() => runAction(report, 'unban')}>
                        <Text style={styles.unbanText}>Odbanuj</Text>
                      </TouchableOpacity>
                    )
                  )}
                </View>
              )}
            </View>
          )
        })}
      </ScrollView>

      {/* Pelnoekranowy podglad certyfikatu */}
      <Modal visible={!!certPreview} transparent animationType="fade" onRequestClose={() => setCertPreview(null)}>
        <TouchableOpacity style={styles.previewOverlay} activeOpacity={1} onPress={() => setCertPreview(null)}>
          {certPreview && <Image source={{ uri: certPreview }} style={styles.previewImage} resizeMode="contain" />}
          <View style={styles.previewClose}>
            <Ionicons name="close" size={22} color="#fff" />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 10 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  tabsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 4 },
  tabChip: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  tabChipActive: { backgroundColor: LIME },
  tabChipText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  tabChipTextActive: { color: BG },
  emptyBox: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  emptyText: { fontSize: 14, color: 'rgba(255,255,255,0.45)' },
  card: { backgroundColor: BG_LIGHT, borderRadius: 16, padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarEmpty: { backgroundColor: '#2e415c', alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 15, fontWeight: '800', color: '#fff' },
  bannedPill: { backgroundColor: 'rgba(255,80,80,0.2)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: 'rgba(255,80,80,0.5)' },
  bannedPillText: { fontSize: 9, fontWeight: '900', color: '#ff6b6b' },
  cardSub: { fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  profileBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  reasonBox: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: 10, gap: 3 },
  reasonLabel: { fontSize: 9.5, fontWeight: '800', color: 'rgba(255,255,255,0.4)', letterSpacing: 1 },
  reasonText: { fontSize: 13.5, color: '#fff', fontWeight: '600' },
  contentRefText: { fontSize: 11.5, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  statusPreview: { width: '100%', height: 160, borderRadius: 10, backgroundColor: '#0a1626' },
  statusText: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontStyle: 'italic' },
  actionsRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  actionNeutral: { backgroundColor: 'rgba(255,255,255,0.08)' },
  actionNeutralText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  actionWarn: { backgroundColor: 'rgba(240,180,41,0.15)', borderWidth: 1, borderColor: 'rgba(240,180,41,0.5)' },
  actionWarnText: { fontSize: 13, fontWeight: '800', color: '#f0b429' },
  actionDanger: { backgroundColor: 'rgba(255,80,80,0.15)', borderWidth: 1, borderColor: 'rgba(255,80,80,0.5)' },
  actionDangerText: { fontSize: 13, fontWeight: '800', color: '#ff6b6b' },
  resolvedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  certImage: { width: '100%', height: 220, borderRadius: 10, backgroundColor: '#0a1626' },
  certZoomHint: { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(13,27,46,0.75)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  certZoomHintText: { fontSize: 11, color: '#fff', fontWeight: '600' },
  actionApprove: { backgroundColor: 'rgba(148,227,54,0.15)', borderWidth: 1, borderColor: 'rgba(148,227,54,0.55)' },
  actionApproveText: { fontSize: 13, fontWeight: '800', color: LIME },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  previewImage: { width: '96%', height: '85%' },
  previewClose: { position: 'absolute', top: 54, right: 18, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  resolvedText: { fontSize: 12.5, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  unbanText: { fontSize: 13, fontWeight: '800', color: LIME },
})
