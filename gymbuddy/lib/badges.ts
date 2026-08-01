import { Alert } from 'react-native'
import { getMyBadges, checkAndAwardBadges } from './supabase'

// Sprawdza nowe odznaki i pokazuje alert celebracyjny jesli cos nowego zostalo odblokowane
// Uzywane po kazdej akcji ktora moze odblokowac odznake (swipe, trening, wyzwanie, wydarzenie)
export async function checkAndCelebrateBadges(profileId: string, t: any): Promise<string[]> {
  try {
    const before = await getMyBadges(profileId)
    const after = await checkAndAwardBadges(profileId)
    const newOnes = after.filter(b => !before.includes(b))
    if (newOnes.length > 0) {
      const badgeName = t('achievements.' + newOnes[0] + '_name') || newOnes[0]
      Alert.alert(
        '🏅 ' + (t('achievements.newBadge') || 'New Achievement!'),
        badgeName
      )
    }
    return after
  } catch (e) {
    console.log('checkAndCelebrateBadges error:', e)
    return []
  }
}
