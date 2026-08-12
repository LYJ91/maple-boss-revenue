import { describe, expect, it } from "vitest";
import {
  AVATAR_CROP,
  avatarCropStyle,
  rectContains,
  visibleSourceRect,
} from "./avatarCrop";

/** 오지환 초상화 실측 스프라이트 (300x300 안) */
const SPRITE = { x: 123, y: 121, w: 52, h: 82 };
/** 머리+얼굴 ≈ 스프라이트 상단 50px */
const HEAD = { x: SPRITE.x, y: SPRITE.y, w: SPRITE.w, h: 50 };

describe("avatarCrop", () => {
  it("원형(face)은 머리통만 잘리지 않고 얼굴이 들어간다", () => {
    const view = visibleSourceRect("face");
    expect(view.h).toBeGreaterThan(60);
    expect(rectContains(view, HEAD)).toBe(true);
  });

  it("과도한 확대(구버전 860%)면 얼굴이 잘린다", () => {
    const tooClose = { x: 150 - 17.5, y: 138 - 17.5, w: 35, h: 35 };
    expect(rectContains(tooClose, HEAD)).toBe(false);
  });

  it("전신(full)은 스프라이트 전체가 들어간다", () => {
    const view = visibleSourceRect("full");
    expect(rectContains(view, SPRITE, 2)).toBe(true);
  });

  it("CSS 변수 문자열이 배율과 맞다", () => {
    expect(avatarCropStyle("face")).toEqual({
      zoom: `${Math.round(AVATAR_CROP.face.zoom * 100)}%`,
      focusY: `${Math.round(AVATAR_CROP.face.focusY * 100)}%`,
    });
    expect(avatarCropStyle("full").zoom).toBe("320%");
  });
});
