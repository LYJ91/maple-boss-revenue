/**
 * calculator 저장이 revision 충돌이면 문서를 통째로 덮지 않고
 * 다시 받아 3-way 병합한 뒤 재시도한다.
 */

import {
  calculatorStateEqual,
  mergeCalculatorState,
} from "./calculatorMerge";
import type { AppState } from "./storage";

export interface CalculatorRemote {
  revision: number;
  state: AppState;
}

export function isRevisionConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: number }).status === 409
  );
}

export async function pushMergedCalculator(input: {
  base: AppState;
  local: AppState;
  remote: CalculatorRemote;
  getRemote: () => Promise<CalculatorRemote>;
  put: (state: AppState, baseRevision: number) => Promise<{ revision: number }>;
  maxAttempts?: number;
}): Promise<{ state: AppState; revision: number; pushed: boolean }> {
  let base = input.base;
  let local = input.local;
  let remote = input.remote;
  const maxAttempts = input.maxAttempts ?? 4;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const merged = mergeCalculatorState(base, local, remote.state);
    if (calculatorStateEqual(merged, remote.state)) {
      return { state: merged, revision: remote.revision, pushed: false };
    }
    try {
      const saved = await input.put(merged, remote.revision);
      return { state: merged, revision: saved.revision, pushed: true };
    } catch (error) {
      if (!isRevisionConflict(error) || attempt === maxAttempts - 1) throw error;
      base = remote.state;
      local = merged;
      remote = await input.getRemote();
    }
  }
  throw new Error("계산기 상태를 병합해 저장하지 못했습니다.");
}
