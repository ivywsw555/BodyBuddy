import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppState, Member } from './types';
import { today } from './lib/date';

const KEY = 'bodybuddy.v1';

export function defaultState(): AppState {
  const start = today();
  const ivy: Member = {
    id: 'm_ivy',
    name: 'Ivy',
    avatar: '🌸',
    role: 'both',
    goals: ['muscle', 'posture', 'fitness'],
    place: 'home',
    equipment: ['dumbbell', 'band'],
    trainingDays: [1, 3, 5],
    level: 'beginner',
    cautions: { spineFragile: false, hipFragile: false, neckShoulderPain: true, kneeIssue: false, cleared: false },
    startDate: start,
    supervisorId: 'm_hubby',
    swaps: {},
  };
  const hubby: Member = {
    id: 'm_hubby',
    name: 'Hubby',
    avatar: '🦴',
    role: 'both',
    goals: ['bone', 'muscle'],
    place: 'gym',
    equipment: [],
    trainingDays: [1, 3, 5, 6],
    level: 'beginner',
    cautions: { spineFragile: true, hipFragile: true, neckShoulderPain: false, kneeIssue: false, cleared: false },
    startDate: start,
    supervisorId: 'm_ivy',
    swaps: {},
  };
  return {
    version: 1,
    members: [ivy, hubby],
    activeMemberId: ivy.id,
    logs: [],
    leaves: [],
    pools: [],
    wishes: [],
    dexa: [],
    body: [],
    milestones: [],
    labs: [],
    daily: {},
    walks: [],
    reviews: {},
    customVideos: {},
    settings: { currency: '$', requireApproval: true, minCompletion: 0.8 },
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.version === 1) return { ...defaultState(), ...parsed };
    }
  } catch {
    // fall back to defaults if stored data can't be read
  }
  return defaultState();
}

type Updater = (draft: AppState) => void;

interface Store {
  state: AppState;
  update: (fn: Updater) => void;
  replace: (s: AppState) => void;
  saveError: string | null;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      setSaveError(null);
    } catch {
      setSaveError('Browser storage is full, so recent changes may not be saved. Export a backup in Settings and delete some check-in photos.');
    }
  }, [state]);

  const update = useCallback((fn: Updater) => {
    setState((s) => {
      const draft = structuredClone(s);
      fn(draft);
      return draft;
    });
  }, []);

  const replace = useCallback((s: AppState) => setState(s), []);

  return <Ctx.Provider value={{ state, update, replace, saveError }}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

export function useMember(id?: string): Member | undefined {
  const { state } = useStore();
  return state.members.find((m) => m.id === (id ?? state.activeMemberId));
}

export function memberName(state: AppState, id?: string): string {
  const m = state.members.find((x) => x.id === id);
  return m ? `${m.avatar} ${m.name}` : '—';
}

export function isTrainee(m: Member): boolean {
  return m.role === 'trainee' || m.role === 'both';
}

export function isSupervisor(m: Member): boolean {
  return m.role === 'supervisor' || m.role === 'both';
}
