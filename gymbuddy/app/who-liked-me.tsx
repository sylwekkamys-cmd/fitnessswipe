import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { supabase, getMyProfile, doSwipe } from '../lib/supabase'
import type { Profile } from '../lib/supabase'

const PRIMARY = '#7dc52e'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

export default function WhoLikedMeScreen() {
  const { t } = useTranslation()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [myProfile, setMyProfile] = useState<Profile | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      setMyProfile(me)
      if (!me) return
      // Darmowi tez dostaja liste — widza tylko rozmyta zajawke z licznikiem (dzwignia premium)
      const { data } = await supabase.rpc('get_who_liked_me', { my_id: me.id })
      setProfiles(data ?? [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  // Naglowek zajawki z poprawna odmiana (1 osoba / 2-4 osoby / 5+ osob)
  function teaserTitle(count: number): string {
    if (count === 1) return t('whoLiked.teaserOne')
    if (count < 5) return t('whoLiked.teaserFew', { count })
    return t('whoLiked.teaserMany', { count })
  }

  async function handleLike(profile: Profile) {
    if (!myProfile) return
    const result = await doSwipe(myProfile.id, profile.id, 'right')
    if (result.matched) {
      Alert.alert('🤝 ' + t('swipe.match'), t('swipe.matchSub'), [
        { text: t('swipe.sendMessage'), onPress: () => router.push('/(tabs)/matches') },
        { text: t('swipe.keepSwiping') }
      ])
    }
    setProfiles(prev => prev.filter(p => p.id !== profile.id))
  }

  async function handlePass(profile: Profile) {
    if (!myProfile) return
    await doSwipe(myProfile.id, profile.id, 'left')
    setProfiles(prev => prev.filter(p => p.id !== profile.id))
  }

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={PRIMARY} />
    </View>
  )

  // Darmowe konto: rozmyta zajawka z licznikiem (bez polubien — klasyczny lock)
  if (!myProfile?.is_premium) {
    if (profiles.length === 0) return (
      <View style={styles.center}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.lockCircle}>
          <Ionicons name="eye-outline" size={38} color={PRIMARY} />
        </View>
        <Text style={styles.lockTitle}>{t('whoLiked.title')}</Text>
        <Text style={styles.lockSubtitle}>{t('whoLiked.lockSub')}</Text>
        <TouchableOpacity style={styles.premiumBtn} onPress={() => router.push('/premium?highlight=whoLiked' as any)}>
          <Ionicons name="star" size={18} color="#fff" />
          <Text style={styles.premiumBtnText}>{t('profile.goPremium')}</Text>
        </TouchableOpacity>
      </View>
    )
    const teaser = profiles.slice(0, 6)
    const extra = profiles.length - teaser.length
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn2} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('whoLiked.title')}</Text>
        </View>
        <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
          <Text style={styles.teaserTitle}>{teaserTitle(profiles.length)}</Text>
          <Text style={styles.teaserSub}>{t('whoLiked.teaserSub')}</Text>
          <View style={styles.teaserGrid}>
            {teaser.map((p, i) => (
              <View key={p.id} style={styles.teaserCell}>
                <Image
                  source={{ uri: p.photo_urls?.[0] ?? 'https://i.pravatar.cc/200' }}
                  style={styles.teaserPhoto}
                  blurRadius={35}
                />
                <View style={styles.teaserShade} />
                {i === teaser.length - 1 && extra > 0 && (
                  <View style={styles.teaserMore}><Text style={styles.teaserMoreText}>+{extra}</Text></View>
                )}
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={() => router.push('/premium?highlight=whoLiked' as any)} activeOpacity={0.85}>
            <LinearGradient colors={['#f0b429', '#d4af37']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.unlockBtn}>
              <Ionicons name="star" size={17} color={BG} />
              <Text style={styles.unlockBtnText}>{t('whoLiked.unlock')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn2} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('whoLiked.title')}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{profiles.length}</Text>
        </View>
      </View>

      {profiles.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.lockCircle}>
            <Ionicons name="flame-outline" size={36} color="rgba(255,255,255,0.35)" />
          </View>
          <Text style={styles.emptyTitle}>{t('whoLiked.emptyTitle')}</Text>
          <Text style={styles.emptySub}>{t('whoLiked.emptySub')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {profiles.map(profile => {
            const photo = profile.photo_urls?.[0]
            return (
              <TouchableOpacity
                key={profile.id}
                style={styles.card}
                activeOpacity={0.9}
                onPress={() => router.push({ pathname: '/profile/profile-detail', params: { profileId: profile.id } })}
              >
                <Image source={{ uri: photo ?? 'https://i.pravatar.cc/200' }} style={styles.photo} />
                <LinearGradient colors={['transparent', 'rgba(13,27,46,0.55)', 'rgba(13,27,46,0.95)']} style={styles.photoGrad} pointerEvents="none" />
                {(profile as any).is_verified && (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark-circle" size={15} color={PRIMARY} />
                  </View>
                )}
                <View style={styles.cardInfo}>
                  <Text style={styles.name} numberOfLines={1}>
                    {profile.name}{(profile as any).age ? `, ${(profile as any).age}` : ''}
                  </Text>
                  {profile.city ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 6 }}>
                      <Ionicons name="location-outline" size={11} color="rgba(255,255,255,0.55)" />
                      <Text style={styles.city}>{profile.city}</Text>
                    </View>
                  ) : <View style={{ height: 6 }} />}
                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.passBtn} onPress={() => handlePass(profile)}>
                      <Ionicons name="close" size={18} color="#ff4757" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.likeBtn} onPress={() => handleLike(profile)}>
                      <Ionicons name="flame" size={17} color={BG} />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16, gap: 12 },
  backBtn: { position: 'absolute', top: 50, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  backBtn2: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '800', color: '#fff' },
  countBadge: { backgroundColor: PRIMARY, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  countText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 12 },
  card: { width: '47%', borderRadius: 16, overflow: 'hidden', backgroundColor: BG_LIGHT, height: 230 },
  photo: { ...StyleSheet.absoluteFillObject, backgroundColor: BG_LIGHT },
  photoGrad: { ...StyleSheet.absoluteFillObject },
  verifiedBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(13,27,46,0.75)', borderRadius: 10, padding: 3 },
  cardInfo: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 10 },
  name: { fontSize: 14.5, fontWeight: '800', color: '#fff', marginBottom: 2 },
  city: { fontSize: 11.5, color: 'rgba(255,255,255,0.55)' },
  cardActions: { flexDirection: 'row', gap: 8 },
  passBtn: { flex: 1, height: 32, borderRadius: 16, backgroundColor: 'rgba(13,27,46,0.75)', borderWidth: 1.5, borderColor: 'rgba(255,71,87,0.55)', alignItems: 'center', justifyContent: 'center' },
  likeBtn: { flex: 1, height: 32, borderRadius: 16, backgroundColor: '#94e336', alignItems: 'center', justifyContent: 'center' },
  teaserTitle: { fontSize: 21, fontWeight: '800', color: '#fff', textAlign: 'center' },
  teaserSub: { fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 4, marginBottom: 20 },
  teaserGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 24 },
  teaserCell: { width: '30%', aspectRatio: 0.85, borderRadius: 14, overflow: 'hidden', backgroundColor: BG_LIGHT },
  teaserPhoto: { width: '100%', height: '100%' },
  teaserShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(13,27,46,0.35)' },
  teaserMore: { position: 'absolute', bottom: 6, right: 6, backgroundColor: '#f0b429', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  teaserMoreText: { fontSize: 11, fontWeight: '900', color: BG },
  unlockBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14 },
  unlockBtnText: { fontSize: 14.5, fontWeight: '800', color: BG },
  lockCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(125,197,46,0.1)', borderWidth: 2, borderColor: 'rgba(125,197,46,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  lockTitle: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 12 },
  lockSubtitle: { fontSize: 15, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  premiumBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: PRIMARY, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 },
  premiumBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#fff', textAlign: 'center' },
  emptySub: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 8 },
})
