import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Share,
  ActivityIndicator
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { getMyProfile, getReferralStats } from '../lib/supabase'

const PRIMARY = '#7dc52e'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

export default function ReferralScreen() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState<string | null>(null)
  const [referredCount, setReferredCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      if (me) {
        const stats = await getReferralStats(me.id)
        setCode(stats.code)
        setReferredCount(stats.referredCount)
        setPendingCount(stats.pendingCount)
      }
    } catch (e) {
      console.log('loadData referral error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleShare() {
    if (!code) return
    try {
      const message = t('referral.shareMessage', { code }) ||
        `💪 Join me on FitnessSwipe - find your perfect gym partner!\n\nUse my code ${code} when you sign up.\n\nDownload: https://fitnessswipe.app`
      await Share.share({ message })
    } catch (e) {
      console.log('Share error:', e)
    }
  }

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={PRIMARY} />
    </View>
  )

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('referral.title') || 'Invite Friends'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.heroSection}>
        <View style={styles.heroIconCircle}>
          <Ionicons name="gift" size={36} color="#F59E0B" />
        </View>
        <Text style={styles.heroTitle}>{t('referral.heroTitle') || 'Give 7 days, Get 7 days'}</Text>
        <Text style={styles.heroSubtitle}>
          {t('referral.heroSubtitle') || 'Invite a friend. When they stay active for 7 days, you both get 7 days of Premium free!'}
        </Text>
      </View>

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>{t('referral.yourCode') || 'Your referral code'}</Text>
        <Text style={styles.codeValue}>{code ?? '...'}</Text>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
          <Ionicons name="share-social-outline" size={20} color="#fff" />
          <Text style={styles.shareBtnText}>{t('referral.shareCode') || 'Share Your Code'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{referredCount}</Text>
          <Text style={styles.statLabel}>{t('referral.rewarded') || 'Rewarded'}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{pendingCount}</Text>
          <Text style={styles.statLabel}>{t('referral.pending') || 'Pending'}</Text>
        </View>
      </View>

      <View style={styles.howItWorks}>
        <Text style={styles.howItWorksTitle}>{t('referral.howItWorks') || 'How it works'}</Text>

        <View style={styles.stepRow}>
          <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
          <Text style={styles.stepText}>{t('referral.step1') || 'Share your code with a friend'}</Text>
        </View>
        <View style={styles.stepRow}>
          <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
          <Text style={styles.stepText}>{t('referral.step2') || 'They enter it during sign up'}</Text>
        </View>
        <View style={styles.stepRow}>
          <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
          <Text style={styles.stepText}>{t('referral.step3') || 'They stay active for 7 days'}</Text>
        </View>
        <View style={styles.stepRow}>
          <View style={styles.stepNumber}><Text style={styles.stepNumberText}>4</Text></View>
          <Text style={styles.stepText}>{t('referral.step4') || 'You both get 7 days of Premium free!'}</Text>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 55, paddingBottom: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },

  heroSection: { alignItems: 'center', paddingHorizontal: 30, marginTop: 10, marginBottom: 24 },
  heroIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(245,158,11,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 2, borderColor: 'rgba(245,158,11,0.3)' },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 8 },
  heroSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 20 },

  codeCard: { backgroundColor: BG_LIGHT, borderRadius: 20, padding: 24, marginHorizontal: 20, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.25)', marginBottom: 16 },
  codeLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 8 },
  codeValue: { fontSize: 28, fontWeight: '800', color: '#F59E0B', letterSpacing: 2, marginBottom: 20 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, width: '100%', justifyContent: 'center' },
  shareBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  statsRow: { flexDirection: 'row', gap: 12, marginHorizontal: 20, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: BG_LIGHT, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  statNumber: { fontSize: 28, fontWeight: '800', color: PRIMARY },
  statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 },

  howItWorks: { marginHorizontal: 20, marginBottom: 40 },
  howItWorksTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 16 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  stepNumber: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(125,197,46,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(125,197,46,0.4)' },
  stepNumberText: { fontSize: 14, fontWeight: '800', color: PRIMARY },
  stepText: { flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 20 },
})
