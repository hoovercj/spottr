/**
 * "About you" section of AI settings. Edits the per-device UserProfile
 * stored in the `meta` table. Every field auto-saves 600ms after the
 * last keystroke so the user doesn't have to remember a Save button.
 *
 * The system prompt reads this profile on every send, so changes take
 * effect on the next chat message.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  EMPTY_PROFILE,
  getUserProfile,
  setUserProfile,
  type ExperienceLevel,
  type UserProfile,
} from '@/features/ai/settings/userProfile';

const LEVEL_OPTIONS: ReadonlyArray<{ value: ExperienceLevel; label: string }> = [
  { value: 'unspecified', label: '— prefer not to say —' },
  { value: 'beginner', label: 'Beginner (< 1 year)' },
  { value: 'intermediate', label: 'Intermediate (1-3 years)' },
  { value: 'advanced', label: 'Advanced (3+ years)' },
];

const AUTOSAVE_MS = 600;

export function UserProfileForm() {
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether the user has touched any field this session so we
  // don't show "Saved" the moment they open Settings.
  const dirtyRef = useRef(false);

  useEffect(() => {
    void (async () => {
      const stored = await getUserProfile();
      setProfile(stored);
      setLoaded(true);
    })();
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const scheduleSave = useCallback((next: UserProfile) => {
    dirtyRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void (async () => {
        await setUserProfile(next);
        setSavedAt(Date.now());
      })();
    }, AUTOSAVE_MS);
  }, []);

  const update = <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => {
    setProfile((cur) => {
      const next = { ...cur, [field]: value };
      scheduleSave(next);
      return next;
    });
  };

  if (!loaded) {
    return (
      <Typography variant="body2" color="text.secondary">
        Loading…
      </Typography>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h2">About you</Typography>
      <Alert severity="info" variant="outlined">
        The coach reads these every message, so anything you add here shapes the next reply.
        Leave blank what you don't want to share. Saved on this device only.
      </Alert>

      <TextField
        label="Goals"
        value={profile.goals}
        onChange={(e) => update('goals', e.target.value)}
        fullWidth
        multiline
        minRows={2}
        placeholder="e.g. build a 4-plate squat while staying under 175 lb"
      />

      <TextField
        select
        label="Experience level"
        value={profile.experienceLevel}
        onChange={(e) => update('experienceLevel', e.target.value as ExperienceLevel)}
        fullWidth
      >
        {LEVEL_OPTIONS.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        label="Equipment"
        value={profile.equipment}
        onChange={(e) => update('equipment', e.target.value)}
        fullWidth
        multiline
        minRows={2}
        placeholder="e.g. home gym — barbell, DBs to 100 lb, pull-up bar, no rack"
      />

      <TextField
        label="Injuries / limitations"
        value={profile.injuries}
        onChange={(e) => update('injuries', e.target.value)}
        fullWidth
        multiline
        minRows={2}
        placeholder="e.g. left shoulder — skip OHP variations"
      />

      <TextField
        label="Anything else for the coach"
        value={profile.coachingNotes}
        onChange={(e) => update('coachingNotes', e.target.value)}
        fullWidth
        multiline
        minRows={2}
        placeholder="e.g. I prefer pull/push/legs splits; I deload every 5 weeks"
      />

      <Typography variant="caption" color="text.secondary" sx={{ minHeight: 16 }}>
        {dirtyRef.current && savedAt ? 'Saved' : ''}
      </Typography>
    </Stack>
  );
}
