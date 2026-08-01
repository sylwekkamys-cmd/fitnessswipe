import { router, Stack } from 'expo-router'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'

const BG = '#0d1b2e'
const LIME = '#94e336'

// Ekran 404 w stylu apki (domyslny szablon Expo byl bialy i po angielsku)
export default function NotFoundScreen() {
  const { t } = useTranslation()
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Ionicons name="compass-outline" size={40} color={LIME} />
        </View>
        <Text style={styles.title}>{t('notFound.title')}</Text>
        <Text style={styles.sub}>{t('notFound.sub')}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(tabs)/swipe' as any)}>
          <Ionicons name="home" size={17} color={BG} />
          <Text style={styles.btnText}>{t('notFound.goHome')}</Text>
        </TouchableOpacity>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconCircle: { width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(148,227,54,0.1)', borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.4)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '800', color: '#fff', textAlign: 'center' },
  sub: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: LIME, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 14, marginTop: 26 },
  btnText: { fontSize: 15, fontWeight: '800', color: BG },
})
