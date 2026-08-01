import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Linking } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { getMyProfile } from '../lib/supabase'
import { getOfferings, purchasePackage, restorePurchases } from '../lib/revenuecat'
import { loadRewarded, showRewarded } from '../lib/admob'
import { supabase } from '../lib/supabase'
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases'

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const GOLD = '#f0b429'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

// Mapowanie naszych planow na identyfikatory pakietow RevenueCat
const PACKAGE_MAP: Record<string, string> = {
  monthly: '$rc_monthly',
  quarterly: '$rc_three_month',
  yearly: '$rc_annual',
}

export default function PremiumScreen() {
  const { t } = useTranslation()
  // Kontekstowe otwarcie: /premium?highlight=stats podswietla konkretna funkcje
  const { highlight } = useLocalSearchParams<{ highlight?: string }>()
  const [selectedPlan, setSelectedPlan] = useState('yearly')
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [watchingAd, setWatchingAd] = useState(false)
  const [offering, setOffering] = useState<PurchasesOffering | null>(null)
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const p = await getMyProfile()
    setProfile(p)
    const o = await getOfferings()
    setOffering(o)
    loadRewarded()
  }

  // Tabela porownawcza Free vs Premium
  const TABLE_ROWS = [
    { code: 'swipes', title: t('premium.unlimited'), free: '20', premium: '∞' },
    { code: 'whoLiked', title: t('premium.seeWhoLiked'), free: null, premium: 'check' },
    { code: 'stats', title: t('premium.profileStats'), free: null, premium: 'check' },
    { code: 'invisible', title: t('premium.invisibleMode') || 'Invisible mode', free: null, premium: 'check' },
    { code: 'undo', title: t('premium.undo'), free: null, premium: 'check' },
    { code: 'noAds', title: t('premium.noAds'), free: null, premium: 'check' },
    { code: 'history', title: t('premium.workoutHistory'), free: 'check', premium: 'check' },
    { code: 'verification', title: t('premium.verification'), free: 'check', premium: 'check' },
    { code: 'chat', title: t('premium.chat'), free: 'check', premium: 'check' },
  ]

  const highlightRow = TABLE_ROWS.find(r => r.code === highlight)

  const STATIC_PRICES: Record<string, { price: string; pricePLN: string }> = {
    monthly: { price: '10€', pricePLN: '40 zł' },
    quarterly: { price: '25€', pricePLN: '100 zł' },
    yearly: { price: '55€', pricePLN: '240 zł' },
  }

  const PLAN_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 }
  const STATIC_MONTHLY: Record<string, string> = { monthly: '10,00€', quarterly: '8,33€', yearly: '4,58€' }

  const PLANS = [
    { id: 'yearly', label: t('premium.yearly'), note: t('premium.save50'), gold: true },
    { id: 'quarterly', label: t('premium.quarterly'), note: t('premium.save25'), gold: false },
    { id: 'monthly', label: t('premium.monthly'), note: null, gold: false },
  ]

  // Cena za miesiac z realnych cen RevenueCat (fallback: statyczne)
  function getMonthlyPrice(planId: string): string {
    const pkg = getPackageForPlan(planId)
    if (pkg && typeof pkg.product.price === 'number') {
      const monthly = pkg.product.price / (PLAN_MONTHS[planId] ?? 1)
      return `${monthly.toFixed(2)} ${pkg.product.currencyCode ?? ''}`.trim()
    }
    return STATIC_MONTHLY[planId] ?? ''
  }

  // Znajdz pakiet RevenueCat odpowiadajacy wybranemu planowi
  function getPackageForPlan(planId: string): PurchasesPackage | undefined {
    if (!offering) return undefined
    const identifier = PACKAGE_MAP[planId]
    return offering.availablePackages.find(p => p.identifier === identifier)
  }

  // Pobierz cene z RevenueCat (prawdziwa cena ze store'u) lub fallback na cene statyczna
  function getPriceForPlan(planId: string): { price: string; pricePLN: string } {
    const pkg = getPackageForPlan(planId)
    if (pkg) {
      return { price: pkg.product.priceString, pricePLN: '' }
    }
    return STATIC_PRICES[planId]
  }

  async function handleSubscribe() {
    const pkg = getPackageForPlan(selectedPlan)

    if (!pkg) {
      // Oferty nie sa jeszcze skonfigurowane w App Store / Google Play
      Alert.alert(
        t('common.error'),
        'Płatności są w trakcie konfiguracji. Spróbuj ponownie wkrótce.'
      )
      return
    }

    setLoading(true)
    try {
      const result = await purchasePackage(pkg)
      if (result.success) {
        Alert.alert(t('premium.welcome'), t('premium.welcomeSub'), [{ text: 'OK', onPress: () => router.back() }])
      } else if (result.error !== 'cancelled') {
        Alert.alert(t('common.error'), result.error ?? 'unknown_error')
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleWatchAd() {
    setWatchingAd(true)
    try {
      const result = await showRewarded()
      if (result.rewarded) {
        const me = await getMyProfile()
        if (me) {
          const newSwipes = ((me as any).daily_swipes_left ?? 0) + result.amount
          await supabase.from('profiles').update({ daily_swipes_left: newSwipes }).eq('id', me.id)
          Alert.alert('🎉', t('premium.adReward', { count: result.amount }))
        }
      }
    } catch (e) { console.log('Rewarded ad error:', e) }
    finally { setWatchingAd(false); loadRewarded() }
  }

  async function handleRestore() {
    setRestoring(true)
    try {
      const result = await restorePurchases()
      if (result.isPremium) {
        Alert.alert('✅', t('premium.welcomeSub'), [{ text: 'OK', onPress: () => router.back() }])
      } else {
        Alert.alert(t('common.error'), 'Nie znaleziono aktywnej subskrypcji.')
      }
    } finally {
      setRestoring(false)
    }
  }

  // Komorka tabeli: check / brak / wartosc tekstowa (np. "20" vs "∞")
  function renderCell(value: string | null, isPremiumCol: boolean) {
    if (value === 'check') {
      return <Ionicons name="checkmark" size={17} color={isPremiumCol ? LIME : 'rgba(255,255,255,0.45)'} />
    }
    if (value === null) {
      return <Ionicons name="close" size={16} color="rgba(255,255,255,0.15)" />
    }
    return <Text style={[styles.cellValue, isPremiumCol && styles.cellValuePremium]}>{value}</Text>
  }

  const selectedPrice = getPriceForPlan(selectedPlan)
  const isPremiumUser = !!profile?.is_premium

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
        <Ionicons name="close" size={24} color="rgba(255,255,255,0.5)" />
      </TouchableOpacity>

      <LinearGradient colors={['#3a2c08', 'rgba(240,180,41,0.12)', BG]} style={styles.header}>
        <View style={styles.crownContainer}>
          <Text style={styles.crown}>{"👑"}</Text>
        </View>
        <Text style={styles.title}>{t('premium.title')}</Text>
        <Text style={styles.subtitle}>{t('premium.subtitle')}</Text>
        {highlightRow && (
          <View style={styles.highlightPill}>
            <Ionicons name="lock-closed" size={13} color={GOLD} />
            <Text style={styles.highlightPillText}>{highlightRow.title} · {t('premium.unlockHint')}</Text>
          </View>
        )}
      </LinearGradient>

      {/* Tabela porownawcza Free vs Premium */}
      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <View style={styles.tableTitleCol} />
          <Text style={styles.tableColFree}>FREE</Text>
          <Text style={styles.tableColPremium}>PREMIUM</Text>
        </View>
        {TABLE_ROWS.map((row, i) => (
          <View key={row.code} style={[styles.tableRow, i === TABLE_ROWS.length - 1 && { borderBottomWidth: 0 }, row.code === highlight && styles.tableRowHighlight]}>
            <Text style={[styles.tableRowTitle, row.code === highlight && styles.tableRowTitleHighlight]} numberOfLines={2}>{row.title}</Text>
            <View style={styles.tableCell}>{renderCell(row.free, false)}</View>
            <View style={[styles.tableCell, styles.tableCellPremium]}>{renderCell(row.premium, true)}</View>
          </View>
        ))}
      </View>

      {/* Pionowe karty planow — roczny zloty na gorze */}
      <View style={styles.plansContainer}>
        {PLANS.map(plan => {
          const priceInfo = getPriceForPlan(plan.id)
          const selected = selectedPlan === plan.id
          return (
            <TouchableOpacity
              key={plan.id}
              style={[styles.planCard, selected && (plan.gold ? styles.planCardGoldSelected : styles.planCardSelected)]}
              onPress={() => setSelectedPlan(plan.id)}
              activeOpacity={0.8}
            >
              {plan.note && (
                <View style={[styles.planBadge, plan.gold ? styles.planBadgeGold : styles.planBadgeLime]}>
                  <Text style={[styles.planBadgeText, plan.gold ? { color: '#3a2c08' } : { color: '#0d1b2e' }]}>{plan.note.toUpperCase()}</Text>
                </View>
              )}
              <View style={[styles.radio, selected && (plan.gold ? styles.radioGoldOn : styles.radioOn)]}>
                {selected && <Ionicons name="checkmark" size={13} color="#0d1b2e" />}
              </View>
              <View style={styles.planInfo}>
                <Text style={[styles.planLabel, selected && { color: '#fff' }]}>{plan.label}</Text>
                {/* Cena przeliczona na miesiac jako informacja PODRZEDNA — kwota
                    billingu musi byc najbardziej wyeksponowana (Apple 3.1.2c) */}
                {PLAN_MONTHS[plan.id] > 1 && (
                  <Text style={styles.planBilled}>= {getMonthlyPrice(plan.id)} {t('premium.perMonth')}</Text>
                )}
              </View>
              <View style={styles.planPriceCol}>
                <Text style={[styles.planMonthly, plan.gold && { color: GOLD }, selected && !plan.gold && { color: LIME }]}>{priceInfo.price}</Text>
                <Text style={styles.planPerMonth}>{t(`premium.billed_${plan.id}`)}</Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      <TouchableOpacity style={[styles.subscribeBtn, loading && styles.subscribeBtnDisabled]} onPress={handleSubscribe} disabled={loading}>
        {loading ? <ActivityIndicator color="#0d1b2e" /> : (
          <>
            <Ionicons name="star" size={18} color="#0d1b2e" />
            <Text style={styles.subscribeBtnText}>{t('premium.activate')} · {selectedPrice.price}</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={styles.noCommitment}>{t('premium.noCommitment')}</Text>

      {/* Zapros znajomego — oboje dostajecie 7 dni Premium */}
      <TouchableOpacity style={styles.referralRow} onPress={() => router.push('/referral' as any)} activeOpacity={0.8}>
        <View style={styles.referralIcon}>
          <Ionicons name="gift" size={18} color={GOLD} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.referralTitle}>{t('referral.inviteFriends')}</Text>
          <Text style={styles.referralSub}>{t('referral.heroTitle')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color="rgba(255,255,255,0.3)" />
      </TouchableOpacity>

      {/* Darmowi uzytkownicy: reklama za dodatkowe swipe'y */}
      {!isPremiumUser && (
        <TouchableOpacity style={styles.watchAdBtn} onPress={handleWatchAd} disabled={watchingAd}>
          {watchingAd ? <ActivityIndicator color={LIME} size="small" /> : (
            <>
              <Text style={{ fontSize: 16 }}>{"🎬"}</Text>
              <Text style={styles.watchAdText}>{t('premium.watchAd')}</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} disabled={restoring}>
        {restoring ? <ActivityIndicator color="rgba(255,255,255,0.5)" size="small" /> : (
          <Text style={styles.restoreBtnText}>{t('premium.restore')}</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.terms}>{t('premium.terms')}</Text>

      {/* Wymog Apple: dzialajace linki do regulaminu i polityki prywatnosci przy subskrypcjach */}
      <View style={styles.legalLinksRow}>
        <TouchableOpacity onPress={() => Linking.openURL('https://fitnessswipe.app/terms')}>
          <Text style={styles.legalLink}>{t('premium.termsOfUse')}</Text>
        </TouchableOpacity>
        <Text style={styles.legalDot}>·</Text>
        <TouchableOpacity onPress={() => Linking.openURL('https://fitnessswipe.app/privacy')}>
          <Text style={styles.legalLink}>{t('premium.privacyPolicy')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  closeBtn: { position: 'absolute', top: 16, right: 16, zIndex: 10, padding: 8 },
  header: { alignItems: 'center', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 24 },
  crownContainer: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(240,180,41,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderWidth: 1, borderColor: 'rgba(240,180,41,0.4)' },
  crown: { fontSize: 38 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.45)', marginTop: 6, textAlign: 'center' },
  highlightPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(240,180,41,0.12)', borderWidth: 1, borderColor: 'rgba(240,180,41,0.35)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginTop: 14 },
  highlightPillText: { fontSize: 12, fontWeight: '700', color: GOLD },
  tableCard: { marginHorizontal: 16, backgroundColor: BG_LIGHT, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  tableTitleCol: { flex: 1 },
  tableColFree: { width: 56, textAlign: 'center', fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.35)', letterSpacing: 1 },
  tableColPremium: { width: 72, textAlign: 'center', fontSize: 10, fontWeight: '800', color: GOLD, letterSpacing: 1 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  tableRowHighlight: { backgroundColor: 'rgba(240,180,41,0.08)', marginHorizontal: -16, paddingHorizontal: 16, borderRadius: 10 },
  tableRowTitle: { flex: 1, fontSize: 13.5, fontWeight: '600', color: 'rgba(255,255,255,0.85)', paddingRight: 6 },
  tableRowTitleHighlight: { color: GOLD },
  tableCell: { width: 56, alignItems: 'center' },
  tableCellPremium: { width: 72 },
  cellValue: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.45)' },
  cellValuePremium: { color: LIME, fontSize: 16 },
  plansContainer: { paddingHorizontal: 16, gap: 10, marginBottom: 20 },
  planCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 16, backgroundColor: BG_LIGHT, position: 'relative' },
  planCardSelected: { borderColor: PRIMARY, backgroundColor: 'rgba(125,197,46,0.08)' },
  planCardGoldSelected: { borderColor: GOLD, backgroundColor: 'rgba(240,180,41,0.08)' },
  planBadge: { position: 'absolute', top: -9, right: 14, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2.5 },
  planBadgeGold: { backgroundColor: GOLD },
  planBadgeLime: { backgroundColor: LIME },
  planBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: LIME, borderColor: LIME },
  radioGoldOn: { backgroundColor: GOLD, borderColor: GOLD },
  planInfo: { flex: 1 },
  planLabel: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  planBilled: { fontSize: 11.5, color: 'rgba(255,255,255,0.35)', marginTop: 2 },
  planPriceCol: { alignItems: 'flex-end' },
  planMonthly: { fontSize: 18, fontWeight: '800', color: '#fff' },
  planPerMonth: { fontSize: 10, color: 'rgba(255,255,255,0.3)' },
  subscribeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: LIME, borderRadius: 16, paddingVertical: 16, marginHorizontal: 24 },
  subscribeBtnDisabled: { backgroundColor: '#333' },
  subscribeBtnText: { color: '#0d1b2e', fontSize: 17, fontWeight: '800' },
  noCommitment: { fontSize: 12, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 8, marginBottom: 14 },
  referralRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 24, backgroundColor: 'rgba(240,180,41,0.08)', borderWidth: 1, borderColor: 'rgba(240,180,41,0.35)', borderRadius: 16, padding: 13, marginBottom: 10 },
  referralIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(240,180,41,0.15)', alignItems: 'center', justifyContent: 'center' },
  referralTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  referralSub: { fontSize: 12, color: GOLD, marginTop: 1 },
  watchAdBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 24, borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.4)', borderStyle: 'dashed', borderRadius: 16, paddingVertical: 13, marginBottom: 10 },
  watchAdText: { fontSize: 13.5, fontWeight: '700', color: LIME },
  restoreBtn: { alignItems: 'center', paddingVertical: 8, marginBottom: 8 },
  restoreBtnText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, textDecorationLine: 'underline' },
  terms: { fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', paddingHorizontal: 32, paddingBottom: 12, lineHeight: 16 },
  legalLinksRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, paddingBottom: 32 },
  legalLink: { fontSize: 12, color: 'rgba(255,255,255,0.45)', textDecorationLine: 'underline' },
  legalDot: { color: 'rgba(255,255,255,0.3)' },
})
