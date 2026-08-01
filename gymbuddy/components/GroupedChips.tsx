import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useTranslation } from 'react-i18next'

// Chipy wyboru w stylu "kropki statusu" (wariant 3): wszystkie w tym samym
// ciemnym kolorze, wybor sygnalizuje limonkowa kropka + subtelna ramka.
// Dlugie listy (cele, cwiczenia) sa pogrupowane w podsekcje z naglowkami.

const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

// Grupy celow treningowych — porzadek zamiast 37 chipow w jednej kupie
export const GOAL_GROUPS: { key: string; items: string[] }[] = [
  { key: 'gym', items: ['strength', 'muscle_gain', 'powerlifting', 'crossfit', 'calisthenics', 'functional_fitness', 'hiit', 'hyrox'] },
  { key: 'cardio', items: ['cardio', 'endurance', 'running', 'cycling', 'swimming', 'walking'] },
  { key: 'martial', items: ['martial_arts', 'bjj', 'mma', 'karate', 'judo', 'kickboxing', 'muay_thai', 'wrestling', 'boxing'] },
  { key: 'sports', items: ['padel', 'pickleball', 'tennis', 'climbing'] },
  { key: 'body', items: ['weight_loss', 'flexibility', 'mobility', 'pilates', 'yoga'] },
  { key: 'health', items: ['general_health', 'stress_relief', 'longevity', 'injury_recovery', 'competition_prep'] },
]

export const EXERCISE_GROUPS: { key: string; items: string[] }[] = [
  { key: 'weights', items: ['bench_press', 'squat', 'deadlift', 'hip_thrust', 'olympic_lifting', 'kettlebell'] },
  { key: 'bodyweight', items: ['pull_up', 'push_up', 'core_abs'] },
  { key: 'cardio', items: ['running', 'cycling', 'swimming', 'rowing', 'sprints', 'hiit'] },
  { key: 'other', items: ['yoga', 'stretching', 'mobility_drills', 'boxing', 'crossfit'] },
]

export default function GroupedChips({ groups, selected, onToggle, itemPrefix, groupPrefix, chipBg }: {
  groups: { key: string; items: string[] }[]
  selected: string[]
  onToggle: (item: string) => void
  // prefiksy kluczy i18n, np. 'goals.' i 'goalGroups.'
  itemPrefix: string
  groupPrefix: string
  // tlo chipa dopasowane do tla ekranu (BG_LIGHT na granatowym, BG w kartach akordeonu)
  chipBg?: string
}) {
  const { t } = useTranslation()
  const bg = chipBg ?? BG_LIGHT
  return (
    <View>
      {groups.map(group => (
        <View key={group.key} style={styles.group}>
          <Text style={styles.groupTitle}>{t(groupPrefix + group.key)}</Text>
          <View style={styles.wrap}>
            {group.items.map(item => {
              const active = selected.includes(item)
              return (
                <TouchableOpacity
                  key={item}
                  style={[styles.chip, { backgroundColor: bg }, active && styles.chipActive]}
                  onPress={() => onToggle(item)}
                >
                  <View style={[styles.dot, active && styles.dotActive]} />
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(itemPrefix + item)}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  group: { marginBottom: 14 },
  groupTitle: { fontSize: 10.5, fontWeight: '800', color: 'rgba(255,255,255,0.45)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'transparent' },
  chipActive: { borderColor: 'rgba(148,227,54,0.5)' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)' },
  dotActive: { backgroundColor: LIME },
  chipText: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
})
