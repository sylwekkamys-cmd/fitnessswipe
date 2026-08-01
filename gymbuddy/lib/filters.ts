import AsyncStorage from '@react-native-async-storage/async-storage'

// Filtry wyszukiwania sa zapisywane w AsyncStorage globalnie dla urzadzenia.
// Przy wylogowaniu czyscimy je w calosci, zeby ustawienia jednego konta
// nie przeciekaly do drugiego (bug: "wszyscy" pokazywal tylko mezczyzn,
// bo poprzednie konto na tym telefonie mialo filtr plci).
export const FILTER_STORAGE_KEYS = [
  'filter_gender',
  'filter_min_age',
  'filter_max_age',
  'filter_radius',
  'filter_fitness_level',
  'filter_min_experience',
  'filter_max_experience',
  'filter_goals',
  'filter_schedule',
  'filter_intensity',
  'filter_spotter',
  'filter_verified_only',
]

export async function clearFilterStorage(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(FILTER_STORAGE_KEYS)
  } catch (e) { }
}
