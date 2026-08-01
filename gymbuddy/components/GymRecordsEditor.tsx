import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'

// Edytor rekordow silowych (opcjonalne): chipy predefiniowanych cwiczen +
// wlasne wpisy. Uzywany w rejestracji (krok "Twoje rekordy") i w edycji profilu.
// Zapis: profiles.gym_records jsonb — [{ key, label?, value, unit }]

const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

export type GymRecord = { key: string; label?: string; value: string; unit: string }

export const RECORD_PRESETS = [
  { key: 'squat', unit: 'kg' },
  { key: 'bench', unit: 'kg' },
  { key: 'deadlift', unit: 'kg' },
  { key: 'ohp', unit: 'kg' },
  { key: 'pullups', unit: '×' },
  { key: 'run5k', unit: 'min' },
] as const

const CUSTOM_UNITS = ['kg', '×', 'min', 'km']

// Tylko sensowne wpisy ida do bazy (wartosc niepusta, wlasne z nazwa)
export function cleanRecords(records: GymRecord[]): GymRecord[] {
  return records
    .filter(r => r.value.trim().length > 0 && (!r.key.startsWith('custom') || (r.label ?? '').trim().length > 0))
    .map(r => ({ ...r, value: r.value.trim(), label: r.label?.trim() }))
}

export default function GymRecordsEditor({ records, onChange }: {
  records: GymRecord[]
  onChange: (records: GymRecord[]) => void
}) {
  const { t } = useTranslation()

  function togglePreset(preset: { key: string; unit: string }) {
    if (records.some(r => r.key === preset.key)) {
      onChange(records.filter(r => r.key !== preset.key))
    } else {
      onChange([...records, { key: preset.key, value: '', unit: preset.unit }])
    }
  }

  function addCustom() {
    onChange([...records, { key: 'custom_' + Math.random().toString(36).slice(2, 8), label: '', value: '', unit: 'kg' }])
  }

  function update(key: string, patch: Partial<GymRecord>) {
    onChange(records.map(r => (r.key === key ? { ...r, ...patch } : r)))
  }

  function remove(key: string) {
    onChange(records.filter(r => r.key !== key))
  }

  function cycleUnit(rec: GymRecord) {
    const idx = CUSTOM_UNITS.indexOf(rec.unit)
    update(rec.key, { unit: CUSTOM_UNITS[(idx + 1) % CUSTOM_UNITS.length] })
  }

  return (
    <View>
      <View style={styles.chipsWrap}>
        {RECORD_PRESETS.map(p => {
          const active = records.some(r => r.key === p.key)
          return (
            <TouchableOpacity key={p.key} style={[styles.chip, active && styles.chipActive]} onPress={() => togglePreset(p)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {t('records.ex_' + p.key)}{active ? ' ✓' : ''}
              </Text>
            </TouchableOpacity>
          )
        })}
        <TouchableOpacity style={[styles.chip, styles.chipCustom]} onPress={addCustom}>
          <Text style={styles.chipText}>{t('records.addCustom')}</Text>
        </TouchableOpacity>
      </View>

      {records.map(rec => {
        const isCustom = rec.key.startsWith('custom')
        return (
          <View key={rec.key} style={styles.row}>
            {isCustom ? (
              <TextInput
                style={[styles.nameInput]}
                value={rec.label ?? ''}
                onChangeText={v => update(rec.key, { label: v })}
                placeholder={t('records.customPlaceholder')}
                placeholderTextColor="rgba(255,255,255,0.3)"
                maxLength={25}
              />
            ) : (
              <Text style={styles.rowLabel} numberOfLines={1}>{t('records.ex_' + rec.key)}</Text>
            )}
            <TextInput
              style={styles.valueInput}
              value={rec.value}
              onChangeText={v => update(rec.key, { value: v.replace(/[^0-9.,]/g, '') })}
              placeholder="0"
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType="decimal-pad"
              maxLength={6}
            />
            {isCustom ? (
              <TouchableOpacity style={styles.unitBtn} onPress={() => cycleUnit(rec)}>
                <Text style={styles.unitBtnText}>{rec.unit}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.unitLabel}>{rec.unit}</Text>
            )}
            <TouchableOpacity style={styles.removeBtn} onPress={() => remove(rec.key)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="close" size={15} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { backgroundColor: LIME },
  chipCustom: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderStyle: 'dashed', backgroundColor: 'transparent' },
  chipText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  chipTextActive: { color: BG, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BG_LIGHT, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 },
  rowLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: '#fff' },
  nameInput: { flex: 1, fontSize: 13, color: '#fff', backgroundColor: BG, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  valueInput: { width: 64, fontSize: 14, fontWeight: '800', color: LIME, backgroundColor: BG, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, textAlign: 'center' },
  unitLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600', width: 30 },
  unitBtn: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, width: 42, alignItems: 'center' },
  unitBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  removeBtn: { padding: 2 },
})
