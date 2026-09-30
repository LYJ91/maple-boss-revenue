import type { SchedulerState } from "../../src/lib/schedulerMatch.js";

const NEXON_BASE = "https://open.api.nexon.com/maplestory/v1";

interface NexonSchedulerState {
  date: string | null;
  weekly_contents?: {
    content_name: string;
    type: string;
    registration_flag: string;
    now_count: number;
    max_count: number;
  }[];
  boss_contents?: {
    content_name: string;
    difficulty: string;
    cycle: string;
    complete_flag: string;
  }[];
  weekly_boss_clear_count: number;
  weekly_boss_clear_limit_count: number;
}

export function mapSchedulerPayload(data: NexonSchedulerState): SchedulerState {
  return {
    date: data.date,
    weeklyBossClearCount: data.weekly_boss_clear_count,
    weeklyBossClearLimit: data.weekly_boss_clear_limit_count,
    bosses: (data.boss_contents ?? []).map((boss) => ({
      name: boss.content_name,
      difficulty: boss.difficulty,
      cycle: boss.cycle,
      complete: boss.complete_flag === "true",
    })),
    contents: (data.weekly_contents ?? [])
      .filter((content) => content.type === "contents")
      .map((content) => ({
        name: content.content_name,
        nowCount: content.now_count,
        maxCount: content.max_count,
        registered: content.registration_flag === "true",
      })),
  };
}

export async function fetchNexonScheduler(
  ocid: string,
  apiKey: string,
): Promise<SchedulerState> {
  const url = new URL(`${NEXON_BASE}/scheduler/character-state`);
  url.searchParams.set("ocid", ocid);
  const response = await fetch(url, { headers: { "x-nxopen-api-key": apiKey } });
  if (!response.ok) {
    throw Object.assign(new Error(`스케줄러 조회 실패 (${response.status})`), {
      status: response.status,
    });
  }
  return mapSchedulerPayload((await response.json()) as NexonSchedulerState);
}
