/**
 * 넥슨 캐릭터 이미지(300x300) 크롭.
 * 캔버스는 크고 스프라이트는 작아서(실측 약 52x82) 확대가 필요하지만,
 * 얼굴 원형은 머리+얼굴이 들어가게만 확대한다.
 */
export const AVATAR_SOURCE_SIZE = 300;

export const AVATAR_CROP = {
  face: { zoom: 4.2, focusY: 0.49 },
  full: { zoom: 3.2, focusY: 0.54 },
} as const;

export type AvatarVariant = keyof typeof AVATAR_CROP;

export interface SourceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** CSS width% / translateY% — CharacterAvatar와 테스트가 같은 값을 쓴다 */
export function avatarCropStyle(variant: AvatarVariant): {
  zoom: string;
  focusY: string;
} {
  const crop = AVATAR_CROP[variant];
  return {
    zoom: `${Math.round(crop.zoom * 100)}%`,
    focusY: `${Math.round(crop.focusY * 100)}%`,
  };
}

/**
 * 컨테이너에 실제로 보이는 원본(300x300) 영역.
 * width: zoom*100%, translate(-50%, -focusY*100%) 기준.
 */
export function visibleSourceRect(
  variant: AvatarVariant,
  sourceSize = AVATAR_SOURCE_SIZE,
): SourceRect {
  const { zoom, focusY } = AVATAR_CROP[variant];
  const size = sourceSize / zoom;
  return {
    x: sourceSize / 2 - size / 2,
    y: sourceSize * focusY - size / 2,
    w: size,
    h: size,
  };
}

export function rectContains(
  outer: SourceRect,
  inner: SourceRect,
  padding = 0,
): boolean {
  return (
    inner.x >= outer.x - padding &&
    inner.y >= outer.y - padding &&
    inner.x + inner.w <= outer.x + outer.w + padding &&
    inner.y + inner.h <= outer.y + outer.h + padding
  );
}
