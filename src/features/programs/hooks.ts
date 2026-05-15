import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import type { Program } from '@/data/types';

export function useAllPrograms(): Program[] | undefined {
  return useLiveQuery(async () => {
    return (await getDb().live.program.toArray()).sort((a, b) => a.name.localeCompare(b.name));
  }, []);
}

export function useActiveProgram(): Program | null | undefined {
  return useLiveQuery(async () => {
    const all = await getDb().live.program.toArray();
    return all.find((p) => p.isActive) ?? null;
  }, []);
}
