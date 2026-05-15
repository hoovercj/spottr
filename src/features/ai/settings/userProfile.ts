/**
 * Free-form coaching profile the user fills in once and the system prompt
 * injects on every send. Lives in the `meta` table (per-device, never
 * synced) so it never travels across the wire to other devices and never
 * appears in export payloads.
 *
 * All fields are free-form strings except `experienceLevel`. The system
 * prompt renders only non-empty fields so an unfilled profile doesn't
 * bloat the prompt with `goals: (none)` lines.
 */

import { getDb } from '@/data/db';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced' | 'unspecified';

export interface UserProfile {
  goals: string;
  experienceLevel: ExperienceLevel;
  equipment: string;
  injuries: string;
  coachingNotes: string;
}

const META_KEY = 'ai:userProfile';

export const EMPTY_PROFILE: UserProfile = {
  goals: '',
  experienceLevel: 'unspecified',
  equipment: '',
  injuries: '',
  coachingNotes: '',
};

function coerceLevel(v: unknown): ExperienceLevel {
  return v === 'beginner' || v === 'intermediate' || v === 'advanced' || v === 'unspecified'
    ? v
    : 'unspecified';
}

export async function getUserProfile(): Promise<UserProfile> {
  const row = await getDb().meta.get(META_KEY);
  if (!row?.value) return EMPTY_PROFILE;
  const raw = row.value as Partial<UserProfile>;
  return {
    goals: typeof raw.goals === 'string' ? raw.goals : '',
    experienceLevel: coerceLevel(raw.experienceLevel),
    equipment: typeof raw.equipment === 'string' ? raw.equipment : '',
    injuries: typeof raw.injuries === 'string' ? raw.injuries : '',
    coachingNotes: typeof raw.coachingNotes === 'string' ? raw.coachingNotes : '',
  };
}

export async function setUserProfile(patch: Partial<UserProfile>): Promise<UserProfile> {
  const current = await getUserProfile();
  const next: UserProfile = { ...current, ...patch };
  await getDb().meta.put({ key: META_KEY, value: next });
  return next;
}

export async function clearUserProfile(): Promise<void> {
  await getDb().meta.delete(META_KEY);
}

/** True if any field is non-empty (level "unspecified" counts as empty). */
export function isProfileNonEmpty(p: UserProfile): boolean {
  return (
    p.goals.trim().length > 0 ||
    p.experienceLevel !== 'unspecified' ||
    p.equipment.trim().length > 0 ||
    p.injuries.trim().length > 0 ||
    p.coachingNotes.trim().length > 0
  );
}
