import React, { useState, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image, Modal, Share } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import ViewShot from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import { LinearGradient } from 'expo-linear-gradient'
import { getMyProfile, getMyTrainerProfile, getTrainerCard, getTrainerStats, getTrainerInbox, getMyCreatedEvents, getMyReviewInvites, getWorkoutPlans, getTrainerClients, assignPlanToClient } from '../lib/supabase'
import { getTrainerOffering, purchaseTrainerPackage } from '../lib/revenuecat'

const BG = '#0d1b2e'
const BLUE = '#4fc3f7'
// Studio trenera: czern + zloto
const SBG = '#0b0b0e'
const SCARD = '#17171c'
const GOLD = '#d4af37'
const SBORDER = 'rgba(212,175,55,0.35)'

export default function TrainerHubScreen() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [trainerProfile, setTrainerProfile] = useState<any>(null)
  const [offering, setOffering] = useState<any>(null)
  const [card, setCard] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [events, setEvents] = useState<any[]>([])
  const [invites, setInvites] = useState<any[]>([])
  const [showShareCard, setShowShareCard] = useState(false)
  const [sharingCard, setSharingCard] = useState(false)
  const shareRef = useRef<ViewShot>(null)
  // Wysylanie planu podopiecznemu prosto ze Studia: krok 1 plan, krok 2 klient
  const [showSendPlan, setShowSendPlan] = useState(false)
  const [myPlans, setMyPlans] = useState<any[]>([])
  const [plansLoading, setPlansLoading] = useState(false)
  const [sendPlan, setSendPlan] = useState<any>(null)
  const [clients, setClients] = useState<any[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [assigning, setAssigning] = useState<string | null>(null)

  useFocusEffect(useCallback(() => { loadData() }, []))

  async function loadData() {
    try {
      const me = await getMyProfile()
      if (!me) return
      setProfile(me)
      if ((me as any).is_trainer) {
        const [tp, c, st, inbox, ev, inv] = await Promise.all([
          getMyTrainerProfile(me.id),
          getTrainerCard(me.id, me.id),
          getTrainerStats(me.id),
          getTrainerInbox(me.id),
          getMyCreatedEvents(me.id),
          getMyReviewInvites(me.id),
        ])
        setTrainerProfile(tp)
        setCard(c)
        setStats(st)
        setUnreadTotal(inbox.reduce((s: number, x: any) => s + x.unread, 0))
        setEvents(ev)
        setInvites(inv)
      } else {
        setOffering(await getTrainerOffering())
      }
    } catch (e) { console.log('trainer hub error:', e) }
    finally { setLoading(false) }
  }

  async function handleBuy() {
    setBuying(true)
    try {
      const pkg = offering?.availablePackages?.[0]
      const result = await purchaseTrainerPackage(pkg)
      if (result.success) {
        const { upsertTrainerProfile } = await import('../lib/supabase')
        if (profile) await upsertTrainerProfile(profile.id, {})
        Alert.alert(result.devMode ? '🧪' : '🎉', result.devMode ? t('trainer.devModeNote') : t('trainer.welcome'))
        setLoading(true)
        await loadData()
      } else if (result.error !== 'cancelled') {
        Alert.alert(t('common.error'), 'Płatności są w trakcie konfiguracji. Spróbuj ponownie wkrótce.')
      }
    } finally { setBuying(false) }
  }

  async function handleShareLink() {
    if (!profile) return
    const link = `https://fitnessswipe.app/trainer/${profile.id}`
    try {
      await Share.share({ message: t('trainer.shareLinkMsg', { link }) })
    } catch (e) { }
  }

  async function handleCaptureCard() {
    if (!shareRef.current?.capture) return
    setSharingCard(true)
    try {
      const uri = await shareRef.current.capture()
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'FitnessSwipe' })
      }
    } catch (e) { console.log('share trainer card error:', e) }
    finally { setSharingCard(false) }
  }

  async function openSendPlan() {
    if (!profile) return
    setSendPlan(null)
    setShowSendPlan(true)
    setPlansLoading(true)
    try {
      const all = await getWorkoutPlans(profile.id)
      // Tylko wlasne plany — przypisanych od innych trenerow nie podsylamy dalej
      setMyPlans((all ?? []).filter((p: any) => !p.assigned_by_name))
    } finally { setPlansLoading(false) }
  }

  async function pickPlanToSend(plan: any) {
    setSendPlan(plan)
    setClientsLoading(true)
    try { setClients(await getTrainerClients(profile.id)) }
    finally { setClientsLoading(false) }
  }

  async function handleSendToClient(client: any) {
    if (!sendPlan || !profile || assigning) return
    setAssigning(client.id)
    try {
      const ok = await assignPlanToClient(
        sendPlan.id,
        { id: profile.id, name: profile.name },
        client.id,
        t('plans.assignPushBody', { plan: sendPlan.name })
      )
      if (ok) {
        setShowSendPlan(false)
        setSendPlan(null)
        Alert.alert('🎓', t('plans.assignedToast', { name: client.name }))
      } else {
        Alert.alert(t('common.error'), t('common.retry'))
      }
    } finally { setAssigning(null) }
  }

  // Sila wizytowki: 6 elementow budujacych zaufanie
  function getChecklist() {
    return [
      { key: 'tipPhoto', done: (profile?.photo_urls?.length ?? 0) > 0 },
      { key: 'tipDesc', done: (trainerProfile?.description?.length ?? 0) >= 40 },
      { key: 'tipSpecs', done: (trainerProfile?.specializations?.length ?? 0) >= 3 },
      { key: 'tipPrice', done: !!trainerProfile?.price_info },
      { key: 'tipCert', done: trainerProfile?.cert_status === 'approved' || trainerProfile?.cert_status === 'pending' },
      { key: 'tipReview', done: (card?.reviews_count ?? 0) > 0 },
    ]
  }

  if (loading) return (
    <View style={[styles.center, { backgroundColor: profile?.is_trainer ? SBG : BG }]}>
      <ActivityIndicator size="large" color={profile?.is_trainer ? GOLD : BLUE} />
    </View>
  )

  const isTrainer = !!profile?.is_trainer

  // ===== PITCH (nie-trener): niebieski, jak dotad =====
  if (!isTrainer) return (
    <ScrollView style={styles.pitchContainer} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('trainer.becomeTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.heroIcon}><Ionicons name="school" size={36} color={BLUE} /></View>
      <Text style={styles.heroTitle}>{t('trainer.pitchTitle')}</Text>
      <Text style={styles.heroSub}>{t('trainer.pitchSub')}</Text>
      <View style={styles.benefits}>
        {[
          { icon: 'megaphone', text: t('trainer.benefit6') },
          { icon: 'id-card', text: t('trainer.benefit1') },
          { icon: 'people', text: t('trainer.benefit2') },
          { icon: 'star', text: t('trainer.benefit3') },
          { icon: 'shield-checkmark', text: t('trainer.benefit4') },
          { icon: 'albums', text: t('trainer.benefit5') },
        ].map((b, i) => (
          <View key={i} style={styles.benefitRow}>
            <View style={styles.benefitIcon}><Ionicons name={b.icon as any} size={17} color={BLUE} /></View>
            <Text style={styles.benefitText}>{b.text}</Text>
          </View>
        ))}
      </View>
      <View style={styles.priceCard}>
        <Text style={styles.priceValue}>{offering?.availablePackages?.[0]?.product?.priceString ?? '15€ / 50 zł'}</Text>
        <Text style={styles.pricePeriod}>{t('premium.perMonth')}</Text>
        <TouchableOpacity style={styles.buyBtn} onPress={handleBuy} disabled={buying}>
          {buying ? <ActivityIndicator color={BG} /> : (
            <Text style={styles.buyBtnText}>{t('trainer.activate')}</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.noCommit}>{t('premium.noCommitment')}</Text>
        <View style={styles.priceLockRow}>
          <Ionicons name="trending-up" size={13} color="#f0b429" />
          <Text style={styles.priceLockText}>{t('trainer.priceLockNote')}</Text>
        </View>
      </View>
      <View style={styles.disclaimer}>
        <Ionicons name="information-circle-outline" size={16} color="rgba(255,255,255,0.4)" />
        <Text style={styles.disclaimerText}>{t('trainer.pricingDisclaimer')}</Text>
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  )

  // ===== STUDIO (trener): czern + zloto =====
  const checklist = getChecklist()
  const strength = Math.round((checklist.filter(c => c.done).length / checklist.length) * 100)
  const daily: { day: string; views: number }[] = stats?.daily ?? []
  const maxViews = Math.max(...daily.map(d => d.views), 1)
  const trend = stats && stats.views_prev_7d > 0
    ? Math.round(((stats.views_7d - stats.views_prev_7d) / stats.views_prev_7d) * 100)
    : null

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Naglowek Studia */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{t('trainer.studioTitle')}</Text>
          {trainerProfile?.cert_status === 'approved' && (
            <Text style={styles.headerVerified}>{t('trainer.verifiedBadge')} ✓</Text>
          )}
        </View>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.push(`/trainer/${profile.id}` as any)}>
          <Ionicons name="eye-outline" size={20} color={GOLD} />
        </TouchableOpacity>
      </View>

      {/* Statystyki + wykres wyswietlen */}
      <View style={styles.statsCard}>
        <View style={styles.statsTopRow}>
          <View>
            <Text style={styles.statsLabel}>{t('trainer.views7d')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text style={styles.statsBig}>{stats?.views_7d ?? 0}</Text>
              {trend !== null && (
                <Text style={[styles.statsTrend, { color: trend >= 0 ? '#94e336' : '#e24b4a' }]}>
                  {trend >= 0 ? '+' : ''}{trend}%
                </Text>
              )}
            </View>
          </View>
          <View style={styles.chartRow}>
            {daily.map((d, i) => (
              <View key={i} style={[styles.chartBar, {
                height: Math.max(6, Math.round((d.views / maxViews) * 40)),
                backgroundColor: i === daily.length - 1 ? GOLD : 'rgba(212,175,55,0.35)',
              }]} />
            ))}
          </View>
        </View>
        <View style={styles.statsBottomRow}>
          <View style={styles.miniStat}>
            <Text style={styles.miniStatNum}>{stats?.followers ?? 0}{(stats?.new_followers_7d ?? 0) > 0 ? ` (+${stats.new_followers_7d})` : ''}</Text>
            <Text style={styles.miniStatLabel}>{t('trainer.followers')}</Text>
          </View>
          <View style={styles.miniStat}>
            <Text style={styles.miniStatNum}>{card?.rating ?? '—'}</Text>
            <Text style={styles.miniStatLabel}>{'★'} {t('trainer.rating')}</Text>
          </View>
          <View style={styles.miniStat}>
            <Text style={styles.miniStatNum}>{stats?.inquiries ?? 0}</Text>
            <Text style={styles.miniStatLabel}>{t('trainer.inquiries')}</Text>
          </View>
        </View>
      </View>

      {/* Sila wizytowki */}
      <View style={styles.sectionCard}>
        <View style={styles.strengthTop}>
          <Text style={styles.sectionTitle}>{t('trainer.cardStrength')}</Text>
          <Text style={[styles.strengthPct, strength === 100 && { color: '#94e336' }]}>{strength}%</Text>
        </View>
        <View style={styles.strengthTrack}>
          <View style={[styles.strengthFill, { width: `${strength}%` as any, backgroundColor: strength === 100 ? '#94e336' : GOLD }]} />
        </View>
        {checklist.filter(c => !c.done).slice(0, 3).map(c => (
          <TouchableOpacity key={c.key} style={styles.tipRow} onPress={() => router.push('/trainer-edit' as any)}>
            <Ionicons name="add-circle-outline" size={15} color={GOLD} />
            <Text style={styles.tipText}>{t('trainer.' + c.key)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Skrzynka klientow */}
      <TouchableOpacity style={styles.rowCard} onPress={() => router.push('/trainer-inbox' as any)} activeOpacity={0.8}>
        <View style={styles.rowIcon}><Ionicons name="chatbubbles" size={17} color={GOLD} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{t('trainer.inboxTitle')}</Text>
          <Text style={styles.rowSub}>{t('trainer.inquiriesCount', { count: stats?.inquiries ?? 0 })}</Text>
        </View>
        {unreadTotal > 0 && (
          <View style={styles.goldBadge}><Text style={styles.goldBadgeText}>{unreadTotal > 9 ? '9+' : unreadTotal}</Text></View>
        )}
        <Ionicons name="chevron-forward" size={17} color="rgba(255,255,255,0.3)" />
      </TouchableOpacity>

      {/* Wyslij plan podopiecznemu */}
      <TouchableOpacity style={styles.rowCard} onPress={openSendPlan} activeOpacity={0.8}>
        <View style={styles.rowIcon}><Ionicons name="paper-plane" size={17} color={GOLD} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{t('trainer.sendPlan')}</Text>
          <Text style={styles.rowSub}>{t('trainer.sendPlanSub')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color="rgba(255,255,255,0.3)" />
      </TouchableOpacity>

      {/* Moje wydarzenia */}
      <View style={styles.sectionCard}>
        <View style={styles.strengthTop}>
          <Text style={styles.sectionTitle}>{t('trainer.myEvents')}</Text>
          <TouchableOpacity onPress={() => router.push('/sports-events' as any)}>
            <Text style={styles.goldLink}>{t('trainer.createEvent')} +</Text>
          </TouchableOpacity>
        </View>
        {events.map(ev => (
          <TouchableOpacity key={ev.id} style={styles.eventRow} onPress={() => router.push(`/event/${ev.id}` as any)}>
            <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
            <Text style={styles.eventMeta}>
              {ev.event_date} · {String(ev.event_time ?? '').slice(0, 5)} · {ev.attendees_count}{ev.max_participants ? `/${ev.max_participants}` : ''} 👥
            </Text>
          </TouchableOpacity>
        ))}
        {events.length === 0 && <Text style={styles.emptyLine}>{t('trainer.eventsEmpty')}</Text>}
      </View>

      {/* Prosby o opinie */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('trainer.reviewRequests')}</Text>
        {invites.slice(0, 5).map(inv => (
          <View key={inv.inviteId} style={styles.inviteRow}>
            {inv.userPhoto ? (
              <Image source={{ uri: inv.userPhoto }} style={styles.inviteAvatar} />
            ) : (
              <View style={[styles.inviteAvatar, { backgroundColor: '#26262c', alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="person" size={12} color="rgba(255,255,255,0.35)" /></View>
            )}
            <Text style={styles.inviteName} numberOfLines={1}>{inv.userName}</Text>
            {inv.rating ? (
              <Text style={styles.inviteStars}>{'★'.repeat(inv.rating)}</Text>
            ) : (
              <Text style={styles.invitePending}>{t('trainer.pendingReview')}</Text>
            )}
          </View>
        ))}
        {invites.length === 0 && <Text style={styles.emptyLine}>{t('trainer.invitesEmpty')}</Text>}
      </View>

      {/* Promuj sie */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('trainer.promote')}</Text>
        <View style={styles.promoteRow}>
          <TouchableOpacity style={styles.promoteBtn} onPress={handleShareLink}>
            <Ionicons name="link" size={16} color={GOLD} />
            <Text style={styles.promoteBtnText}>{t('trainer.shareLink')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.promoteBtn} onPress={() => setShowShareCard(true)}>
            <Ionicons name="image" size={16} color={GOLD} />
            <Text style={styles.promoteBtnText}>{t('trainer.shareCard')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/trainer-edit' as any)}>
        <Ionicons name="create-outline" size={18} color={SBG} />
        <Text style={styles.editBtnText}>{t('trainer.editCard')}</Text>
      </TouchableOpacity>
      <Text style={styles.manageSub}>{t('trainer.manageSub')}</Text>
      <View style={{ height: 40 }} />

      {/* Wysylanie planu: krok 1 wybor planu, krok 2 wybor podopiecznego */}
      <Modal visible={showSendPlan} transparent animationType="slide" onRequestClose={() => setShowSendPlan(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowSendPlan(false)}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              {sendPlan ? t('plans.assignTitle', { plan: sendPlan.name }) : t('trainer.pickPlan')}
            </Text>
            {!sendPlan ? (
              plansLoading ? (
                <ActivityIndicator color={GOLD} style={{ marginVertical: 24 }} />
              ) : myPlans.length === 0 ? (
                <View>
                  <Text style={styles.sheetEmpty}>{t('trainer.noPlansYet')}</Text>
                  <TouchableOpacity
                    style={styles.sheetGoldBtn}
                    onPress={() => { setShowSendPlan(false); router.push('/plans' as any) }}
                  >
                    <Ionicons name="clipboard-outline" size={16} color={SBG} />
                    <Text style={styles.sheetGoldBtnText}>{t('trainer.goCreatePlan')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 360 }}>
                  {myPlans.map(p => (
                    <TouchableOpacity key={p.id} style={styles.sheetRow} onPress={() => pickPlanToSend(p)}>
                      <View style={styles.rowIcon}><Ionicons name="clipboard" size={16} color={GOLD} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sheetRowTitle}>{p.name}</Text>
                        <Text style={styles.sheetRowSub}>{t('plans.exerciseCount', { count: p.exercise_count })}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )
            ) : (
              clientsLoading ? (
                <ActivityIndicator color={GOLD} style={{ marginVertical: 24 }} />
              ) : clients.length === 0 ? (
                <Text style={styles.sheetEmpty}>{t('plans.assignNoClients')}</Text>
              ) : (
                <ScrollView style={{ maxHeight: 360 }}>
                  {clients.map(c => (
                    <TouchableOpacity key={c.id} style={styles.sheetRow} onPress={() => handleSendToClient(c)} disabled={!!assigning}>
                      {c.photo_urls?.[0] ? (
                        <Image source={{ uri: c.photo_urls[0] }} style={styles.sheetAvatar} />
                      ) : (
                        <View style={[styles.sheetAvatar, { backgroundColor: '#26262c', alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="person" size={14} color="rgba(255,255,255,0.35)" /></View>
                      )}
                      <Text style={[styles.sheetRowTitle, { flex: 1 }]}>{c.name}</Text>
                      {assigning === c.id ? (
                        <ActivityIndicator size="small" color={GOLD} />
                      ) : (
                        <Ionicons name="paper-plane-outline" size={17} color={GOLD} />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )
            )}
            <TouchableOpacity
              style={styles.sheetCancel}
              onPress={() => { if (sendPlan) setSendPlan(null); else setShowSendPlan(false) }}
            >
              <Text style={styles.sheetCancelText}>{sendPlan ? t('common.back') : t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Karta 9:16 "Trenuj ze mna" na stories */}
      <Modal visible={showShareCard} transparent animationType="fade" onRequestClose={() => setShowShareCard(false)}>
        <View style={styles.shareOverlay}>
          <ViewShot ref={shareRef} options={{ format: 'png', quality: 1 }} style={styles.shareCard}>
            {profile?.photo_urls?.[0] ? (
              <Image source={{ uri: profile.photo_urls[0] }} style={styles.shareCardPhoto} />
            ) : (
              <View style={[styles.shareCardPhoto, { backgroundColor: SCARD }]} />
            )}
            <LinearGradient colors={['transparent', 'rgba(11,11,14,0.6)', 'rgba(11,11,14,0.97)']} style={styles.shareCardShade} />
            <View style={styles.shareCardBottom}>
              <Text style={styles.shareCardName}>{profile?.name}</Text>
              <Text style={styles.shareCardRole}>
                {t('trainer.trainerLabel')}{trainerProfile?.cert_status === 'approved' ? ' ✓' : ''}{card?.rating ? ` · ${card.rating} ★` : ''}
              </Text>
              {(trainerProfile?.specializations ?? []).length > 0 && (
                <Text style={styles.shareCardSpecs} numberOfLines={1}>
                  {(trainerProfile.specializations as string[]).slice(0, 3).map(s => t('goals.' + s)).join(' · ')}
                </Text>
              )}
              <View style={styles.shareCardCta}>
                <Text style={styles.shareCardCtaText}>{t('trainer.shareCardCta')}</Text>
              </View>
              <View style={styles.shareBrandRow}>
                <Text style={styles.shareBrand}>FitnessSwipe</Text>
                <Text style={styles.shareBrandSub}>fitnessswipe.app</Text>
              </View>
            </View>
          </ViewShot>
          <View style={styles.shareActions}>
            <TouchableOpacity style={styles.shareGoBtn} onPress={handleCaptureCard} disabled={sharingCard}>
              {sharingCard ? <ActivityIndicator color={SBG} /> : (
                <><Ionicons name="share-social" size={17} color={SBG} /><Text style={styles.shareGoBtnText}>{t('workouts.shareCta')}</Text></>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareCloseBtn} onPress={() => setShowShareCard(false)}>
              <Text style={styles.shareCloseBtnText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SBG },
  pitchContainer: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 55, paddingBottom: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerVerified: { fontSize: 11, fontWeight: '700', color: GOLD, marginTop: 1 },
  heroIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(79,195,247,0.12)', borderWidth: 1, borderColor: 'rgba(79,195,247,0.4)', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 8, marginBottom: 14 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center', paddingHorizontal: 24 },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', paddingHorizontal: 32, marginTop: 8, lineHeight: 20 },
  benefits: { marginTop: 22, paddingHorizontal: 24, gap: 12 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(79,195,247,0.12)', alignItems: 'center', justifyContent: 'center' },
  benefitText: { flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 19 },
  priceCard: { backgroundColor: '#1a2a44', borderRadius: 20, marginHorizontal: 20, marginTop: 24, padding: 20, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(79,195,247,0.35)' },
  priceValue: { fontSize: 28, fontWeight: '800', color: BLUE },
  pricePeriod: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2, marginBottom: 14 },
  buyBtn: { backgroundColor: BLUE, borderRadius: 14, paddingVertical: 14, width: '100%', alignItems: 'center' },
  buyBtnText: { color: BG, fontSize: 16, fontWeight: '800' },
  noCommit: { fontSize: 11.5, color: 'rgba(255,255,255,0.35)', marginTop: 10 },
  priceLockRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10, paddingHorizontal: 4 },
  priceLockText: { flex: 1, fontSize: 11.5, color: 'rgba(240,180,41,0.85)', lineHeight: 16 },
  disclaimer: { flexDirection: 'row', gap: 8, paddingHorizontal: 28, marginTop: 16, alignItems: 'flex-start' },
  disclaimerText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 17 },
  statsCard: { backgroundColor: SCARD, borderRadius: 18, marginHorizontal: 16, padding: 16, borderWidth: 1, borderColor: SBORDER, marginBottom: 12 },
  statsTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 },
  statsLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  statsBig: { fontSize: 32, fontWeight: '800', color: GOLD },
  statsTrend: { fontSize: 13, fontWeight: '800' },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 44 },
  chartBar: { width: 9, borderRadius: 3 },
  statsBottomRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', paddingTop: 12 },
  miniStat: { flex: 1, alignItems: 'center' },
  miniStatNum: { fontSize: 15, fontWeight: '800', color: '#fff' },
  miniStatLabel: { fontSize: 10.5, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  sectionCard: { backgroundColor: SCARD, borderRadius: 16, marginHorizontal: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: 'rgba(212,175,55,0.85)', textTransform: 'uppercase', letterSpacing: 1 },
  strengthTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  strengthPct: { fontSize: 15, fontWeight: '800', color: GOLD },
  strengthTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, marginBottom: 10 },
  strengthFill: { height: 6, borderRadius: 3 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  tipText: { flex: 1, fontSize: 12.5, color: 'rgba(255,255,255,0.65)' },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: SCARD, borderRadius: 16, marginHorizontal: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 12 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(212,175,55,0.12)', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14.5, fontWeight: '700', color: '#fff' },
  rowSub: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  goldBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  goldBadgeText: { fontSize: 11.5, fontWeight: '800', color: SBG },
  goldLink: { fontSize: 12.5, fontWeight: '800', color: GOLD },
  eventRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  eventTitle: { fontSize: 13.5, fontWeight: '700', color: '#fff' },
  eventMeta: { fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  emptyLine: { fontSize: 12.5, color: 'rgba(255,255,255,0.35)', paddingVertical: 8 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', marginTop: 4 },
  inviteAvatar: { width: 28, height: 28, borderRadius: 14 },
  inviteName: { flex: 1, fontSize: 13.5, fontWeight: '600', color: '#fff' },
  inviteStars: { fontSize: 12.5, color: GOLD },
  invitePending: { fontSize: 11.5, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' },
  promoteRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  promoteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: SBORDER, borderRadius: 12, paddingVertical: 11 },
  promoteBtnText: { fontSize: 12.5, fontWeight: '800', color: GOLD },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GOLD, borderRadius: 16, paddingVertical: 15, marginHorizontal: 16 },
  editBtnText: { color: SBG, fontSize: 16, fontWeight: '800' },
  manageSub: { fontSize: 11.5, color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingHorizontal: 32, lineHeight: 16, marginTop: 12 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: SCARD, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 34, borderTopWidth: 1, borderColor: SBORDER },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 16.5, fontWeight: '800', color: '#fff', marginBottom: 12 },
  sheetEmpty: { fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingVertical: 20 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  sheetRowTitle: { fontSize: 14.5, fontWeight: '700', color: '#fff' },
  sheetRowSub: { fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  sheetAvatar: { width: 34, height: 34, borderRadius: 17 },
  sheetGoldBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GOLD, borderRadius: 13, paddingVertical: 12, marginTop: 4 },
  sheetGoldBtnText: { fontSize: 13.5, fontWeight: '800', color: SBG },
  sheetCancel: { alignItems: 'center', paddingVertical: 12, marginTop: 6 },
  sheetCancelText: { fontSize: 13.5, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  shareOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  shareCard: { width: 290, aspectRatio: 9 / 16, borderRadius: 18, overflow: 'hidden', backgroundColor: SBG },
  shareCardPhoto: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  shareCardShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  shareCardBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16 },
  shareCardName: { fontSize: 24, fontWeight: '800', color: '#fff' },
  shareCardRole: { fontSize: 13, fontWeight: '700', color: GOLD, marginTop: 2 },
  shareCardSpecs: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 6 },
  shareCardCta: { backgroundColor: GOLD, borderRadius: 10, paddingVertical: 8, alignItems: 'center', marginTop: 12 },
  shareCardCtaText: { fontSize: 12.5, fontWeight: '800', color: SBG },
  shareBrandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)', paddingTop: 10, marginTop: 12 },
  shareBrand: { fontSize: 13, fontWeight: '800', color: '#fff' },
  shareBrandSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  shareActions: { marginTop: 18, width: 290, gap: 8 },
  shareGoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GOLD, borderRadius: 14, paddingVertical: 14 },
  shareGoBtnText: { color: SBG, fontSize: 15, fontWeight: '800' },
  shareCloseBtn: { alignItems: 'center', paddingVertical: 10 },
  shareCloseBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
})
