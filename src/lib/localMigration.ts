import type { TodoState } from "./todoStorage";
import type { AppState } from "./storage";
import type { WeekRecord } from "./history";

export interface LegacyAccount {
  id: string;
  label: string;
  apiKey?: string;
  connected?: boolean;
}
export interface LegacyTodoState extends Omit<TodoState, "accounts"> {
  accounts: LegacyAccount[];
}

export function hasCalculatorData(state: AppState): boolean {
  return state.characters.length > 0;
}
export function hasTodoData(state: LegacyTodoState): boolean {
  return (
    state.characters.length > 0 ||
    state.accounts.length > 0 ||
    Object.keys(state.checks).length > 0 ||
    state.items.some((i) => !i.builtin)
  );
}
export function hasHistoryData(records: WeekRecord[]): boolean {
  return records.length > 0;
}

export function redactTodoKeys(state: LegacyTodoState): TodoState {
  return {
    ...state,
    accounts: state.accounts.map(({ id, label }) => ({
      id,
      label,
      connected: true,
    })),
  };
}
