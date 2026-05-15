import { getDb } from '@/data/db';
import { mostRecentMonday } from '@/data/calendarDate';
import { newId, nowIso } from '@/data/ids';
import { withWriteLock } from '@/data/locks';
import type {
  EquipmentKind,
  LiftFamily,
  Location,
  PlannedSet,
  Program,
  ScheduleSlot,
  SlotPlan,
  SlotPlanSupersetGroup,
  SplitDayType,
  Variant,
} from '@/data/types';
import { DEFAULT_IS_FREE_WEIGHT } from '@/data/types';

interface SeedFamily {
  name: string;
  variants: EquipmentKind[];
}

const SEED_LIFT_LIBRARY: SeedFamily[] = [
  { name: 'Bench Press', variants: ['barbell', 'dumbbell', 'machine'] },
  { name: 'Incline Bench Press', variants: ['barbell', 'dumbbell'] },
  { name: 'Shoulder Press', variants: ['barbell', 'dumbbell', 'machine', 'smith-machine'] },
  { name: 'Lateral Raise', variants: ['dumbbell', 'cable', 'machine'] },
  { name: 'Tricep Pushdown', variants: ['cable'] },
  { name: 'Skullcrusher', variants: ['barbell', 'dumbbell'] },
  { name: 'Pull-up', variants: ['bodyweight', 'machine'] },
  { name: 'Row', variants: ['barbell', 'dumbbell', 'cable', 'machine'] },
  { name: 'Lat Pulldown', variants: ['cable', 'machine'] },
  { name: 'Bicep Curl', variants: ['barbell', 'dumbbell', 'cable'] },
  { name: 'Face Pull', variants: ['cable'] },
  { name: 'Squat', variants: ['barbell', 'machine', 'smith-machine'] },
  { name: 'Front Squat', variants: ['barbell'] },
  { name: 'Romanian Deadlift', variants: ['barbell', 'dumbbell'] },
  { name: 'Deadlift', variants: ['barbell'] },
  { name: 'Leg Press', variants: ['machine'] },
  { name: 'Leg Curl', variants: ['machine'] },
  { name: 'Leg Extension', variants: ['machine'] },
  { name: 'Calf Raise', variants: ['machine', 'smith-machine'] },
];

interface SeedSlot {
  splitDayName: string;
  isRest: boolean;
  lifts: SeedLift[];
  /** Pairs / triples of family names to programme as a superset. */
  supersets?: string[][];
}

interface SeedLift {
  familyName: string;
  /** Selects the seed variant; if omitted, picks the first variant the family has. */
  variantKind?: EquipmentKind;
  sets: number;
  repsMin: number;
  repsMax: number;
}

interface SeedProgram {
  name: string;
  slots: SeedSlot[];
  isActive?: boolean;
}

const PPL_SEED_PROGRAM: SeedSlot[] = [
  {
    splitDayName: 'Pull',
    isRest: false,
    lifts: [
      { familyName: 'Pull-up', variantKind: 'bodyweight', sets: 3, repsMin: 6, repsMax: 10 },
      { familyName: 'Row', variantKind: 'barbell', sets: 4, repsMin: 6, repsMax: 8 },
      { familyName: 'Lat Pulldown', variantKind: 'cable', sets: 3, repsMin: 8, repsMax: 12 },
      { familyName: 'Face Pull', variantKind: 'cable', sets: 3, repsMin: 12, repsMax: 15 },
      { familyName: 'Bicep Curl', variantKind: 'dumbbell', sets: 3, repsMin: 10, repsMax: 12 },
    ],
  },
  {
    splitDayName: 'Push',
    isRest: false,
    lifts: [
      { familyName: 'Bench Press', variantKind: 'barbell', sets: 5, repsMin: 5, repsMax: 5 },
      { familyName: 'Shoulder Press', variantKind: 'machine', sets: 3, repsMin: 8, repsMax: 12 },
      {
        familyName: 'Incline Bench Press',
        variantKind: 'dumbbell',
        sets: 3,
        repsMin: 10,
        repsMax: 10,
      },
      { familyName: 'Tricep Pushdown', variantKind: 'cable', sets: 3, repsMin: 12, repsMax: 12 },
      { familyName: 'Lateral Raise', variantKind: 'dumbbell', sets: 3, repsMin: 15, repsMax: 15 },
    ],
    supersets: [['Tricep Pushdown', 'Lateral Raise']],
  },
  {
    splitDayName: 'Legs',
    isRest: false,
    lifts: [
      { familyName: 'Squat', variantKind: 'barbell', sets: 5, repsMin: 5, repsMax: 5 },
      { familyName: 'Romanian Deadlift', variantKind: 'barbell', sets: 3, repsMin: 8, repsMax: 8 },
      { familyName: 'Leg Press', variantKind: 'machine', sets: 3, repsMin: 10, repsMax: 12 },
      { familyName: 'Leg Curl', variantKind: 'machine', sets: 3, repsMin: 10, repsMax: 12 },
      { familyName: 'Calf Raise', variantKind: 'machine', sets: 3, repsMin: 12, repsMax: 15 },
    ],
  },
  {
    splitDayName: 'Pull',
    isRest: false,
    lifts: [
      { familyName: 'Pull-up', variantKind: 'bodyweight', sets: 3, repsMin: 8, repsMax: 12 },
      { familyName: 'Row', variantKind: 'dumbbell', sets: 3, repsMin: 10, repsMax: 12 },
      { familyName: 'Lat Pulldown', variantKind: 'cable', sets: 3, repsMin: 10, repsMax: 12 },
      { familyName: 'Face Pull', variantKind: 'cable', sets: 3, repsMin: 12, repsMax: 15 },
      { familyName: 'Bicep Curl', variantKind: 'cable', sets: 3, repsMin: 10, repsMax: 12 },
    ],
  },
  {
    splitDayName: 'Push',
    isRest: false,
    lifts: [
      {
        familyName: 'Incline Bench Press',
        variantKind: 'barbell',
        sets: 5,
        repsMin: 5,
        repsMax: 5,
      },
      { familyName: 'Shoulder Press', variantKind: 'barbell', sets: 3, repsMin: 6, repsMax: 10 },
      { familyName: 'Bench Press', variantKind: 'dumbbell', sets: 3, repsMin: 10, repsMax: 10 },
      { familyName: 'Skullcrusher', variantKind: 'barbell', sets: 3, repsMin: 8, repsMax: 10 },
      { familyName: 'Lateral Raise', variantKind: 'dumbbell', sets: 3, repsMin: 15, repsMax: 15 },
    ],
  },
  {
    splitDayName: 'Legs',
    isRest: false,
    lifts: [
      { familyName: 'Front Squat', variantKind: 'barbell', sets: 3, repsMin: 6, repsMax: 8 },
      { familyName: 'Romanian Deadlift', variantKind: 'barbell', sets: 3, repsMin: 6, repsMax: 8 },
      { familyName: 'Leg Extension', variantKind: 'machine', sets: 3, repsMin: 12, repsMax: 15 },
      { familyName: 'Leg Curl', variantKind: 'machine', sets: 3, repsMin: 12, repsMax: 15 },
      { familyName: 'Calf Raise', variantKind: 'machine', sets: 3, repsMin: 12, repsMax: 15 },
    ],
  },
  {
    splitDayName: 'Rest',
    isRest: true,
    lifts: [],
  },
];

const STARTING_STRENGTH: SeedSlot[] = [
  {
    splitDayName: 'A',
    isRest: false,
    lifts: [
      { familyName: 'Squat', variantKind: 'barbell', sets: 3, repsMin: 5, repsMax: 5 },
      { familyName: 'Bench Press', variantKind: 'barbell', sets: 3, repsMin: 5, repsMax: 5 },
      { familyName: 'Deadlift', variantKind: 'barbell', sets: 1, repsMin: 5, repsMax: 5 },
    ],
  },
  {
    splitDayName: 'B',
    isRest: false,
    lifts: [
      { familyName: 'Squat', variantKind: 'barbell', sets: 3, repsMin: 5, repsMax: 5 },
      { familyName: 'Shoulder Press', variantKind: 'barbell', sets: 3, repsMin: 5, repsMax: 5 },
      { familyName: 'Deadlift', variantKind: 'barbell', sets: 1, repsMin: 5, repsMax: 5 },
    ],
  },
];

const STRONGLIFTS_5X5: SeedSlot[] = [
  {
    splitDayName: 'A',
    isRest: false,
    lifts: [
      { familyName: 'Squat', variantKind: 'barbell', sets: 5, repsMin: 5, repsMax: 5 },
      { familyName: 'Bench Press', variantKind: 'barbell', sets: 5, repsMin: 5, repsMax: 5 },
      { familyName: 'Row', variantKind: 'barbell', sets: 5, repsMin: 5, repsMax: 5 },
    ],
  },
  {
    splitDayName: 'B',
    isRest: false,
    lifts: [
      { familyName: 'Squat', variantKind: 'barbell', sets: 5, repsMin: 5, repsMax: 5 },
      { familyName: 'Shoulder Press', variantKind: 'barbell', sets: 5, repsMin: 5, repsMax: 5 },
      { familyName: 'Deadlift', variantKind: 'barbell', sets: 1, repsMin: 5, repsMax: 5 },
    ],
  },
];

const NSUNS_531_4DAY: SeedSlot[] = [
  {
    splitDayName: 'Bench / OHP',
    isRest: false,
    lifts: [
      { familyName: 'Bench Press', variantKind: 'barbell', sets: 5, repsMin: 3, repsMax: 8 },
      { familyName: 'Shoulder Press', variantKind: 'barbell', sets: 5, repsMin: 3, repsMax: 8 },
      { familyName: 'Tricep Pushdown', variantKind: 'cable', sets: 3, repsMin: 10, repsMax: 15 },
      { familyName: 'Bicep Curl', variantKind: 'dumbbell', sets: 3, repsMin: 10, repsMax: 15 },
      { familyName: 'Face Pull', variantKind: 'cable', sets: 3, repsMin: 12, repsMax: 15 },
    ],
  },
  {
    splitDayName: 'Squat / Sumo',
    isRest: false,
    lifts: [
      { familyName: 'Squat', variantKind: 'barbell', sets: 5, repsMin: 3, repsMax: 8 },
      { familyName: 'Deadlift', variantKind: 'barbell', sets: 5, repsMin: 3, repsMax: 8 },
      { familyName: 'Leg Curl', variantKind: 'machine', sets: 3, repsMin: 10, repsMax: 15 },
      { familyName: 'Calf Raise', variantKind: 'machine', sets: 3, repsMin: 12, repsMax: 15 },
    ],
  },
  {
    splitDayName: 'Bench / Incline',
    isRest: false,
    lifts: [
      { familyName: 'Bench Press', variantKind: 'barbell', sets: 5, repsMin: 1, repsMax: 5 },
      { familyName: 'Incline Bench Press', variantKind: 'barbell', sets: 5, repsMin: 3, repsMax: 8 },
      { familyName: 'Skullcrusher', variantKind: 'barbell', sets: 3, repsMin: 8, repsMax: 12 },
      { familyName: 'Lateral Raise', variantKind: 'dumbbell', sets: 3, repsMin: 12, repsMax: 15 },
    ],
  },
  {
    splitDayName: 'Deadlift / Front Squat',
    isRest: false,
    lifts: [
      { familyName: 'Deadlift', variantKind: 'barbell', sets: 5, repsMin: 1, repsMax: 5 },
      { familyName: 'Front Squat', variantKind: 'barbell', sets: 5, repsMin: 3, repsMax: 5 },
      { familyName: 'Row', variantKind: 'barbell', sets: 3, repsMin: 8, repsMax: 12 },
      { familyName: 'Pull-up', variantKind: 'bodyweight', sets: 3, repsMin: 6, repsMax: 10 },
    ],
  },
];

const UPPER_LOWER_4DAY: SeedSlot[] = [
  {
    splitDayName: 'Upper A',
    isRest: false,
    lifts: [
      { familyName: 'Bench Press', variantKind: 'barbell', sets: 4, repsMin: 6, repsMax: 8 },
      { familyName: 'Row', variantKind: 'barbell', sets: 4, repsMin: 6, repsMax: 8 },
      { familyName: 'Shoulder Press', variantKind: 'dumbbell', sets: 3, repsMin: 8, repsMax: 10 },
      { familyName: 'Lat Pulldown', variantKind: 'cable', sets: 3, repsMin: 10, repsMax: 12 },
      { familyName: 'Bicep Curl', variantKind: 'dumbbell', sets: 3, repsMin: 10, repsMax: 12 },
      { familyName: 'Tricep Pushdown', variantKind: 'cable', sets: 3, repsMin: 10, repsMax: 12 },
    ],
  },
  {
    splitDayName: 'Lower A',
    isRest: false,
    lifts: [
      { familyName: 'Squat', variantKind: 'barbell', sets: 4, repsMin: 6, repsMax: 8 },
      { familyName: 'Romanian Deadlift', variantKind: 'barbell', sets: 3, repsMin: 8, repsMax: 10 },
      { familyName: 'Leg Press', variantKind: 'machine', sets: 3, repsMin: 10, repsMax: 12 },
      { familyName: 'Leg Curl', variantKind: 'machine', sets: 3, repsMin: 10, repsMax: 12 },
      { familyName: 'Calf Raise', variantKind: 'machine', sets: 4, repsMin: 12, repsMax: 15 },
    ],
  },
  {
    splitDayName: 'Upper B',
    isRest: false,
    lifts: [
      {
        familyName: 'Incline Bench Press',
        variantKind: 'barbell',
        sets: 4,
        repsMin: 8,
        repsMax: 10,
      },
      { familyName: 'Pull-up', variantKind: 'bodyweight', sets: 4, repsMin: 6, repsMax: 10 },
      { familyName: 'Lateral Raise', variantKind: 'dumbbell', sets: 3, repsMin: 12, repsMax: 15 },
      { familyName: 'Face Pull', variantKind: 'cable', sets: 3, repsMin: 12, repsMax: 15 },
      { familyName: 'Skullcrusher', variantKind: 'barbell', sets: 3, repsMin: 8, repsMax: 12 },
      { familyName: 'Bicep Curl', variantKind: 'cable', sets: 3, repsMin: 10, repsMax: 12 },
    ],
  },
  {
    splitDayName: 'Lower B',
    isRest: false,
    lifts: [
      { familyName: 'Deadlift', variantKind: 'barbell', sets: 4, repsMin: 5, repsMax: 6 },
      { familyName: 'Front Squat', variantKind: 'barbell', sets: 3, repsMin: 8, repsMax: 10 },
      { familyName: 'Leg Extension', variantKind: 'machine', sets: 3, repsMin: 10, repsMax: 12 },
      { familyName: 'Leg Curl', variantKind: 'machine', sets: 3, repsMin: 10, repsMax: 12 },
      { familyName: 'Calf Raise', variantKind: 'machine', sets: 4, repsMin: 12, repsMax: 15 },
    ],
  },
];

const SEED_PROGRAMS: SeedProgram[] = [
  { name: 'PPL (6-day)', slots: PPL_SEED_PROGRAM, isActive: true },
  { name: 'Upper/Lower (4-day)', slots: UPPER_LOWER_4DAY },
  { name: 'nSuns 5/3/1 (4-day)', slots: NSUNS_531_4DAY },
  { name: 'Stronglifts 5x5', slots: STRONGLIFTS_5X5 },
  { name: 'Starting Strength', slots: STARTING_STRENGTH },
];

const SEED_DONE_META_KEY = 'seed:v1:applied';
/** Name of the built-in "no labeled location" row (FR9 fallback). */
export const NO_LOCATION_NAME = 'No location';

export interface SeedSummary {
  programId: string;
  homeLocationId: string;
  liftFamilyCount: number;
  variantCount: number;
  scheduleSlotCount: number;
}

export async function seedIfNeeded(): Promise<SeedSummary | null> {
  // Serialize concurrent invocations (StrictMode double-mount, etc.) so two
  // racing callers can't both decide they need to seed.
  return withWriteLock('workout-buddy-seed', async () => {
    const db = getDb();
    const existing = await db.meta.get(SEED_DONE_META_KEY);
    if (existing) return null;
    return runSeed();
  });
}

export async function runSeed(): Promise<SeedSummary> {
  const db = getDb();
  const now = nowIso();

  const families = new Map<string, LiftFamily>();
  const variantsByFamilyKind = new Map<string, Variant>();

  const allFamilies: LiftFamily[] = SEED_LIFT_LIBRARY.map((f) => ({
    id: newId(),
    name: f.name,
    isCustom: false,
    createdAt: now,
  }));
  for (const f of allFamilies) families.set(f.name, f);

  const allVariants: Variant[] = [];
  for (const seed of SEED_LIFT_LIBRARY) {
    const family = families.get(seed.name);
    if (!family) throw new Error(`seed: family ${seed.name} missing`);
    for (const kind of seed.variants) {
      const variant: Variant = {
        id: newId(),
        liftFamilyId: family.id,
        name: kindDisplayName(kind),
        equipmentKind: kind,
        isFreeWeight: DEFAULT_IS_FREE_WEIGHT[kind],
        isAlias: false,
        createdAt: now,
      };
      allVariants.push(variant);
      variantsByFamilyKind.set(`${family.id}::${kind}`, variant);
    }
  }

  const homeLocation: Location = {
    id: newId(),
    name: 'Home Gym',
    createdAt: now,
  };
  const noLocation: Location = {
    id: newId(),
    name: NO_LOCATION_NAME,
    createdAt: now,
  };

  const allPrograms: Program[] = [];
  const allSplitDayTypes: SplitDayType[] = [];
  const scheduleSlots: ScheduleSlot[] = [];
  const slotPlans: SlotPlan[] = [];
  const supersetGroups: SlotPlanSupersetGroup[] = [];
  // Track the primary program (active = true) for the return summary.
  let primaryProgramId: string | null = null;

  // All routines anchor on the most recent Monday at install time so the
  // first calendar week of use shows Day 1 on Monday for the user.
  const anchor = mostRecentMonday();

  for (const seedProg of SEED_PROGRAMS) {
    const program: Program = {
      id: newId(),
      name: seedProg.name,
      isActive: Boolean(seedProg.isActive),
      anchorDate: anchor,
      createdAt: now,
    };
    allPrograms.push(program);
    if (program.isActive) primaryProgramId = program.id;

    // One SplitDayType per unique name within this program. Rest is its own row.
    const splitDayTypes = new Map<string, SplitDayType>();
    for (const slot of seedProg.slots) {
      if (splitDayTypes.has(slot.splitDayName)) continue;
      splitDayTypes.set(slot.splitDayName, {
        id: newId(),
        programId: program.id,
        name: slot.splitDayName,
        isRest: slot.isRest,
      });
    }
    for (const v of splitDayTypes.values()) allSplitDayTypes.push(v);

    seedProg.slots.forEach((slot, idx) => {
      const sdt = splitDayTypes.get(slot.splitDayName);
      if (!sdt) throw new Error(`seed: SDT missing: ${slot.splitDayName}`);

      const scheduleSlot: ScheduleSlot = {
        id: newId(),
        programId: program.id,
        orderIndex: idx,
        splitDayTypeId: sdt.id,
      };
      scheduleSlots.push(scheduleSlot);

      const planByFamily = new Map<string, SlotPlan>();
      slot.lifts.forEach((lift, lIdx) => {
        const family = families.get(lift.familyName);
        if (!family) throw new Error(`seed: family ${lift.familyName} missing in slot ${idx}`);
        const variant = lift.variantKind
          ? variantsByFamilyKind.get(`${family.id}::${lift.variantKind}`)
          : undefined;
        const plannedSets: PlannedSet[] = Array.from({ length: lift.sets }, (_v, i) => ({
          orderIndex: i,
          plannedRepsMin: lift.repsMin,
          plannedRepsMax: lift.repsMax,
        }));
        const sp: SlotPlan = {
          id: newId(),
          scheduleSlotId: scheduleSlot.id,
          orderIndex: lIdx,
          liftFamilyId: family.id,
          plannedSets,
          ...(variant ? { defaultVariantId: variant.id } : {}),
        };
        slotPlans.push(sp);
        planByFamily.set(lift.familyName, sp);
      });

      slot.supersets?.forEach((group, gIdx) => {
        const slotPlanIds = group.map((fName) => {
          const sp = planByFamily.get(fName);
          if (!sp) throw new Error(`seed: superset references missing lift ${fName}`);
          return sp.id;
        });
        supersetGroups.push({
          id: newId(),
          scheduleSlotId: scheduleSlot.id,
          slotPlanIds,
          orderIndex: gIdx,
        });
      });
    });
  }

  if (!primaryProgramId) {
    // Should never happen given SEED_PROGRAMS has isActive on the first
    // entry — but guard anyway so callers always see a valid id.
    primaryProgramId = allPrograms[0]?.id ?? '';
  }

  await db.transaction(
    'rw',
    [
      db.liftFamily,
      db.variant,
      db.location,
      db.program,
      db.splitDayType,
      db.scheduleSlot,
      db.slotPlan,
      db.slotPlanSupersetGroup,
      db.meta,
    ],
    async () => {
      await db.liftFamily.bulkPut(allFamilies);
      await db.variant.bulkPut(allVariants);
      await db.location.bulkPut([homeLocation, noLocation]);
      await db.program.bulkPut(allPrograms);
      await db.splitDayType.bulkPut(allSplitDayTypes);
      await db.scheduleSlot.bulkPut(scheduleSlots);
      await db.slotPlan.bulkPut(slotPlans);
      await db.slotPlanSupersetGroup.bulkPut(supersetGroups);
      await db.meta.put({ key: SEED_DONE_META_KEY, value: { appliedAt: nowIso() } });
    },
  );

  return {
    programId: primaryProgramId,
    homeLocationId: homeLocation.id,
    liftFamilyCount: allFamilies.length,
    variantCount: allVariants.length,
    scheduleSlotCount: scheduleSlots.length,
  };
}

function kindDisplayName(kind: EquipmentKind): string {
  switch (kind) {
    case 'barbell':
      return 'Barbell';
    case 'dumbbell':
      return 'Dumbbell';
    case 'machine':
      return 'Machine';
    case 'cable':
      return 'Cable';
    case 'bodyweight':
      return 'Bodyweight';
    case 'smith-machine':
      return 'Smith';
    case 'custom':
      return 'Custom';
  }
}
