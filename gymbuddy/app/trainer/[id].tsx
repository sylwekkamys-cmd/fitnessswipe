import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, TextInput, Alert, Linking } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { getMyProfile, getTrainerCard, addTrainerReview, followTrainer, unfollowTrainer, createTrainerChat, logTrainerCardView } from '../../lib/supabase'

const LIME = '#94e336'
const BLUE = '#4fc3f7'
const GOLD = '#f0b429'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

export default function TrainerCardScreen() {
  const { t } = useTranslation()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<any>(null)
  const [card, setCard] = useState<any>(null)
  const [following, setFollowing] = useState(false)
  const [togglingFollow, setTogglingFollow] = useState(false)
  const [startingChat, setStartingChat] = useState(false)
  const [myRating, setMyRating] = useState(0)
  const [myComment, setMyComment] = useState('')
  const [sendingReview, setSendingReview] = useState(false)

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    setLoading(true)
    try {
      const my = await getMyProfile()
      if (!my) return
      setMe(my)
      const c = await getTrainerCard(String(id), my.id)
      setCard(c)
      if (c) logTrainerCardView(c.profile_id, my.id)
      setFollowing(!!c?.is_following)
      if (c?.my_review) {
        setMyRating(c.my_review.rating)
        setMyComment(c.my_review.comment ?? '')
      }
    } catch (e) { console.log('trainer card error:', e) }
    finally { setLoading(false) }
  }

  async function handleFollow() {
    if (!me || !card) return
    setTogglingFollow(true)
    try {
      if (following) {
        await unfollowTrainer(card.profile_id, me.id)
        setFollowing(false)
      } else {
        await followTrainer(card.profile_id, me.id)
        setFollowing(true)
      }
    } finally { setTogglingFollow(false) }
  }

  async function handleMessage() {
    if (!me || !card) return
    setStartingChat(true)
    try {
      const matchId = await createTrainerChat(card.profile_id, me.id)
      if (matchId) router.push(`/chat/${matchId}` as any)
      else Alert.alert(t('common.error'))
    } finally { setStartingChat(false) }
  }

  async function handleSendReview() {
    if (!me || !card || myRating < 1) return
    setSendingReview(true)
    try {
      const result = await addTrainerReview(card.profile_id, me.id, myRating, myComment.trim())
      if (result.success) {
        Alert.alert('⭐', t('trainer.reviewSent'))
        await loadData()
      } else {
        Alert.alert(t('common.error'), result.error === 'not_eligible' ? t('trainer.reviewNotEligible') : t('common.error'))
      }
    } finally { setSendingReview(false) }
  }

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" color={BLUE} /></View>
  )

  if (!card) return (
    <View style={styles.center}>
      <Text style={{ fontSize: 44, marginBottom: 12 }}>{"🤷"}</Text>
      <Text style={styles.notFound}>{t('publicLink.notFound')}</Text>
      <TouchableOpacity style={styles.notFoundBtn} onPress={() => router.back()}>
        <Text style={styles.notFoundBtnText}>{t('common.back') || 'OK'}</Text>
      </TouchableOpacity>
    </View>
  )

  const isOwnCard = me?.id === card.profile_id

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Hero ze zdjeciem */}
      <View style={styles.hero}>
        {card.photo_urls?.[0] ? (
          <Image source={{ uri: card.photo_urls[0] }} style={styles.heroPhoto} />
        ) : (
          <View style={[styles.heroPhoto, styles.heroPhotoEmpty]}><Ionicons name="person" size={54} color="rgba(255,255,255,0.25)" /></View>
        )}
        <LinearGradient colors={['transparent', 'rgba(13,27,46,0.6)', BG]} style={styles.heroShade} />
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.heroBottom}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{card.name}{card.age ? `, ${card.age}` : ''}</Text>
            {card.trainer_verified && (
              <View style={styles.verifiedPill}>
                <Ionicons name="shield-checkmark" size={12} color={BG} />
                <Text style={styles.verifiedPillText}>{t('trainer.verifiedBadge')}</Text>
              </View>
            )}
          </View>
          <Text style={styles.sub}>
            {t('trainer.trainerLabel')}{card.city ? ` · ${card.city}` : ''}{card.gym_name ? ` · ${card.gym_name}` : ''}
          </Text>
        </View>
      </View>

      {/* Statystyki */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, { color: GOLD }]}>{card.rating ?? '—'}</Text>
          <Text style={styles.statLabel}>{'★'} {t('trainer.rating')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{card.followers_count}</Text>
          <Text style={styles.statLabel}>{t('trainer.followers')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{card.experience_years || '—'}</Text>
          <Text style={styles.statLabel}>{t('trainer.yearsExp')}</Text>
        </View>
      </View>

      {/* Akcje */}
      {!isOwnCard && (
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.followBtn, following && styles.followBtnOn]} onPress={handleFollow} disabled={togglingFollow}>
            {togglingFollow ? <ActivityIndicator size="small" color={following ? BG : BLUE} /> : (
              <>
                <Ionicons name={following ? 'checkmark' : 'add'} size={17} color={following ? BG : BLUE} />
                <Text style={[styles.followBtnText, following && { color: BG }]}>
                  {following ? t('trainer.following') : t('trainer.follow')}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.msgBtn} onPress={handleMessage} disabled={startingChat}>
            {startingChat ? <ActivityIndicator size="small" color={BG} /> : (
              <>
                <Ionicons name="chatbubble" size={16} color={BG} />
                <Text style={styles.msgBtnText}>{t('trainer.message')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Specjalizacje */}
      {(card.specializations ?? []).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('trainer.specializations')}</Text>
          <View style={styles.chipsWrap}>
            {card.specializations.map((s: string) => (
              <View key={s} style={styles.specChip}><Text style={styles.specChipText}>{t('goals.' + s)}</Text></View>
            ))}
          </View>
        </View>
      )}

      {/* Opis */}
      {card.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('trainer.aboutTrainer')}</Text>
          <Text style={styles.description}>{card.description}</Text>
        </View>
      ) : null}

      {/* Linki: Instagram i strona WWW */}
      {(card.instagram || card.website) ? (
        <View style={styles.section}>
          <View style={styles.linksRow}>
            {card.instagram ? (
              <TouchableOpacity
                style={styles.linkChip}
                onPress={() => Linking.openURL(`https://instagram.com/${String(card.instagram).replace('@', '').trim()}`).catch(() => { })}
              >
                <Ionicons name="logo-instagram" size={15} color={BLUE} />
                <Text style={styles.linkChipText} numberOfLines={1}>{card.instagram}</Text>
              </TouchableOpacity>
            ) : null}
            {card.website ? (
              <TouchableOpacity
                style={styles.linkChip}
                onPress={() => {
                  const url = String(card.website).startsWith('http') ? card.website : `https://${card.website}`
                  Linking.openURL(url).catch(() => { })
                }}
              >
                <Ionicons name="globe-outline" size={15} color={BLUE} />
                <Text style={styles.linkChipText} numberOfLines={1}>{String(card.website).replace(/^https?:\/\//, '')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Cennik — indywidualny, poza aplikacja */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('trainer.priceInfo')}</Text>
        <View style={styles.priceCard}>
          <Text style={styles.priceText}>{card.price_info || t('trainer.priceAsk')}</Text>
          <Text style={styles.priceDisclaimer}>{t('trainer.catalogDisclaimer')}</Text>
        </View>
      </View>

      {/* Opinie */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('trainer.reviews')} ({card.reviews_count})</Text>

        {card.can_review && !isOwnCard && (
          <View style={styles.reviewForm}>
            <Text style={styles.reviewFormTitle}>{card.my_review ? t('trainer.editReview') : t('trainer.addReview')}</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(s => (
                <TouchableOpacity key={s} onPress={() => setMyRating(s)}>
                  <Text style={[styles.star, s <= myRating && styles.starOn]}>{'★'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.reviewInput}
              value={myComment}
              onChangeText={setMyComment}
              placeholder={t('trainer.reviewPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              multiline
            />
            <TouchableOpacity style={[styles.reviewBtn, myRating < 1 && { opacity: 0.4 }]} onPress={handleSendReview} disabled={sendingReview || myRating < 1}>
              {sendingReview ? <ActivityIndicator size="small" color={BG} /> : (
                <Text style={styles.reviewBtnText}>{t('trainer.sendReview')}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        {!card.can_review && !isOwnCard && (
          <Text style={styles.eligibilityNote}>{t('trainer.reviewNotEligible')}</Text>
        )}

        {(card.reviews ?? []).map((r: any, i: number) => (
          <View key={i} style={styles.reviewRow}>
            {r.reviewer_photo ? (
              <Image source={{ uri: r.reviewer_photo }} style={styles.reviewAvatar} />
            ) : (
              <View style={[styles.reviewAvatar, { backgroundColor: '#2e415c', alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="person" size={13} color="rgba(255,255,255,0.35)" /></View>
            )}
            <View style={{ flex: 1 }}>
              <View style={styles.reviewTopRow}>
                <Text style={styles.reviewName}>{r.reviewer_name}</Text>
                <Text style={styles.reviewStars}>{'★'.repeat(r.rating)}</Text>
              </View>
              {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
            </View>
          </View>
        ))}
        {(card.reviews ?? []).length === 0 && (
          <Text style={styles.noReviews}>{t('trainer.noReviews')}</Text>
        )}
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG, paddingHorizontal: 32 },
  notFound: { color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center', marginBottom: 18 },
  notFoundBtn: { backgroundColor: BLUE, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28 },
  notFoundBtnText: { color: BG, fontSize: 15, fontWeight: '800' },
  hero: { height: 340 },
  heroPhoto: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  heroPhotoEmpty: { backgroundColor: BG_LIGHT, alignItems: 'center', justifyContent: 'center' },
  heroShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 160 },
  backBtn: { position: 'absolute', top: 52, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  heroBottom: { position: 'absolute', left: 18, right: 18, bottom: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  name: { fontSize: 26, fontWeight: '800', color: '#fff' },
  verifiedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: LIME, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  verifiedPillText: { fontSize: 11, fontWeight: '800', color: BG },
  sub: { fontSize: 13.5, color: 'rgba(255,255,255,0.65)', marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 14 },
  statCard: { flex: 1, backgroundColor: BG_LIGHT, borderRadius: 16, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  statNum: { fontSize: 18, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 3 },
  actionsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 12 },
  followBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: BLUE, borderRadius: 14, paddingVertical: 12 },
  followBtnOn: { backgroundColor: BLUE },
  followBtnText: { fontSize: 14.5, fontWeight: '800', color: BLUE },
  msgBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: LIME, borderRadius: 14, paddingVertical: 12 },
  msgBtnText: { fontSize: 14.5, fontWeight: '800', color: BG },
  section: { paddingHorizontal: 18, marginTop: 22 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  specChip: { borderRadius: 16, paddingVertical: 7, paddingHorizontal: 13, backgroundColor: 'rgba(79,195,247,0.12)', borderWidth: 1, borderColor: 'rgba(79,195,247,0.35)' },
  specChipText: { fontSize: 12.5, color: BLUE, fontWeight: '600' },
  description: { fontSize: 14.5, color: 'rgba(255,255,255,0.75)', lineHeight: 22 },
  instagram: { fontSize: 13.5, color: BLUE, marginTop: 8 },
  linksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  linkChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(79,195,247,0.1)', borderWidth: 1, borderColor: 'rgba(79,195,247,0.35)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, maxWidth: '100%' },
  linkChipText: { fontSize: 13, fontWeight: '600', color: BLUE, flexShrink: 1 },
  priceCard: { backgroundColor: BG_LIGHT, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  priceText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  priceDisclaimer: { fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginTop: 8, lineHeight: 16 },
  reviewForm: { backgroundColor: BG_LIGHT, borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  reviewFormTitle: { fontSize: 13.5, fontWeight: '700', color: '#fff', marginBottom: 8 },
  starsRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  star: { fontSize: 26, color: 'rgba(255,255,255,0.2)' },
  starOn: { color: GOLD },
  reviewInput: { backgroundColor: BG, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 14, minHeight: 60, textAlignVertical: 'top', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 10 },
  reviewBtn: { backgroundColor: GOLD, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  reviewBtnText: { color: BG, fontSize: 14, fontWeight: '800' },
  eligibilityNote: { fontSize: 12.5, color: 'rgba(255,255,255,0.4)', lineHeight: 18, marginBottom: 12 },
  reviewRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  reviewAvatar: { width: 30, height: 30, borderRadius: 15 },
  reviewTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewName: { fontSize: 13.5, fontWeight: '700', color: '#fff' },
  reviewStars: { fontSize: 12.5, color: GOLD },
  reviewComment: { fontSize: 13.5, color: 'rgba(255,255,255,0.65)', marginTop: 3, lineHeight: 19 },
  noReviews: { fontSize: 13, color: 'rgba(255,255,255,0.35)', textAlign: 'center', paddingVertical: 12 },
})
