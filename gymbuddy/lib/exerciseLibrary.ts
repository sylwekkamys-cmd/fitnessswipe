// Biblioteka popularnych cwiczen do podpowiedzi przy dodawaniu do planu.
// Wylacznie podpowiedz — user zawsze moze wpisac wlasna nazwe recznie.
export type ExerciseKind = 'strength' | 'cardio'
export type LibraryExercise = { id: string; category: string; kind: ExerciseKind }

export const EXERCISE_CATEGORIES = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio'] as const

export const EXERCISE_LIBRARY: LibraryExercise[] = [
  { id: 'benchPress', category: 'chest', kind: 'strength' },
  { id: 'inclineBenchPress', category: 'chest', kind: 'strength' },
  { id: 'dumbbellFlyes', category: 'chest', kind: 'strength' },
  { id: 'pushUps', category: 'chest', kind: 'strength' },
  { id: 'chestDips', category: 'chest', kind: 'strength' },

  { id: 'deadlift', category: 'back', kind: 'strength' },
  { id: 'pullUps', category: 'back', kind: 'strength' },
  { id: 'barbellRow', category: 'back', kind: 'strength' },
  { id: 'latPulldown', category: 'back', kind: 'strength' },
  { id: 'dumbbellRow', category: 'back', kind: 'strength' },

  { id: 'squat', category: 'legs', kind: 'strength' },
  { id: 'legPress', category: 'legs', kind: 'strength' },
  { id: 'lunges', category: 'legs', kind: 'strength' },
  { id: 'legExtension', category: 'legs', kind: 'strength' },
  { id: 'legCurl', category: 'legs', kind: 'strength' },
  { id: 'calfRaises', category: 'legs', kind: 'strength' },
  { id: 'bulgarianSplitSquat', category: 'legs', kind: 'strength' },

  { id: 'overheadPress', category: 'shoulders', kind: 'strength' },
  { id: 'lateralRaise', category: 'shoulders', kind: 'strength' },
  { id: 'rearDeltFly', category: 'shoulders', kind: 'strength' },
  { id: 'arnoldPress', category: 'shoulders', kind: 'strength' },

  { id: 'bicepCurl', category: 'arms', kind: 'strength' },
  { id: 'hammerCurl', category: 'arms', kind: 'strength' },
  { id: 'tricepPushdown', category: 'arms', kind: 'strength' },
  { id: 'skullCrushers', category: 'arms', kind: 'strength' },
  { id: 'tricepDips', category: 'arms', kind: 'strength' },

  { id: 'plank', category: 'core', kind: 'strength' },
  { id: 'crunches', category: 'core', kind: 'strength' },
  { id: 'hangingLegRaise', category: 'core', kind: 'strength' },
  { id: 'russianTwist', category: 'core', kind: 'strength' },
  { id: 'sidePlank', category: 'core', kind: 'strength' },

  { id: 'running', category: 'cardio', kind: 'cardio' },
  { id: 'cycling', category: 'cardio', kind: 'cardio' },
  { id: 'rowingMachine', category: 'cardio', kind: 'cardio' },
  { id: 'jumpRope', category: 'cardio', kind: 'cardio' },
  { id: 'elliptical', category: 'cardio', kind: 'cardio' },
  { id: 'swimming', category: 'cardio', kind: 'cardio' },
  { id: 'stairClimbing', category: 'cardio', kind: 'cardio' },
]
