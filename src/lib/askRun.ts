/**
 * planAsk 결과를 허용된 조회 함수로만 실행한다.
 */

import { DIFFICULTY_LABEL } from "../data/crystalData";
import type { Boss } from "../types";
import type { AccountSummary } from "./calc";
import { formatFull, formatMeso } from "./format";
import type { LookupCharacter } from "./nexon";
import {
  bossKey,
  completedBossKeys,
  schedulerReliability,
  type SchedulerState,
} from "./scheduler";
import type { AskPlan, AskTool } from "./ask";

export interface AskDeps {
  searchCharacter(name: string): Promise<LookupCharacter>;
  fetchScheduler(ocid: string, accountId: string): Promise<SchedulerState>;
  summary: AccountSummary;
  bossMap: ReadonlyMap<string, Boss>;
  today: string;
}

export type AskResult =
  | {
      kind: "value";
      tool: AskTool["tool"];
      args: string;
      rows: { label: string; value: string }[];
    }
  | { kind: "refuse"; reason: string };

function refuse(reason: string): AskResult {
  return { kind: "refuse", reason };
}

function basicRows(info: LookupCharacter): AskResult {
  return {
    kind: "value",
    tool: "characterBasic",
    args: info.name,
    rows: [
      { label: "레벨", value: String(info.level) },
      { label: "직업", value: info.job },
      { label: "월드", value: info.world },
      {
        label: "경험치",
        value: info.exp != null ? formatFull(info.exp) : "응답에 없음",
      },
      { label: "경험치 비율", value: info.expRate ?? "응답에 없음" },
    ],
  };
}

export async function runAsk(plan: AskPlan, deps: AskDeps): Promise<AskResult> {
  if (plan.kind === "refuse") return refuse(plan.reason);
  try {
    if (plan.call.tool === "characterBasic") {
      const info = await deps.searchCharacter(plan.call.name);
      return basicRows({ ...info, name: info.name || plan.call.name });
    }
    if (plan.call.tool === "revenue") {
      if (plan.call.characterId == null) {
        return {
          kind: "value",
          tool: "revenue",
          args: "계정 전체",
          rows: [
            {
              label: "이번 주 수익",
              value: `${formatMeso(deps.summary.weeklyRevenue)} 메소`,
            },
            {
              label: "결정 수",
              value: String(deps.summary.weeklyCrystalCount),
            },
          ],
        };
      }
      const characterId = plan.call.characterId;
      const found = deps.summary.characters.find((item) => item.id === characterId);
      if (!found) {
        return refuse("앱에 등록된 캐릭터만 수익을 계산할 수 있습니다.");
      }
      return {
        kind: "value",
        tool: "revenue",
        args: characterId,
        rows: [
          {
            label: "이번 주 수익 (90개 제한 전)",
            value: `${formatMeso(found.weeklyRevenue)} 메소`,
          },
        ],
      };
    }
    const boss = deps.bossMap.get(plan.call.bossId);
    if (!boss) return refuse("앱 보스 목록에 있는 보스 이름을 넣어 주세요.");
    const state = await deps.fetchScheduler(plan.call.ocid, plan.call.accountId);
    const reliability = schedulerReliability(state);
    const trusted =
      boss.reset === "monthly" ? reliability.monthlyBosses : reliability.weeklyBosses;
    if (!trusted) {
      return refuse("스케줄러 응답이 축약돼 확인할 수 없습니다.");
    }
    const cleared = completedBossKeys(state);
    const hits = boss.variants.filter((variant) =>
      cleared.has(bossKey(boss.id, variant.difficulty)),
    );
    const period = boss.reset === "monthly" ? "이번 달" : "이번 주";
    return {
      kind: "value",
      tool: "weeklyClear",
      args: `${plan.call.name} · ${boss.name}`,
      rows: [
        {
          label: period,
          value:
            hits.length === 0
              ? "격파 기록 없음"
              : hits.map((variant) => DIFFICULTY_LABEL[variant.difficulty]).join(", "),
        },
      ],
    };
  } catch (error) {
    return refuse(
      error instanceof Error ? error.message : "조회에 실패했습니다.",
    );
  }
}
