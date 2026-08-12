import type { CSSProperties } from "react";
import { avatarCropStyle } from "../lib/avatarCrop";

/**
 * 넥슨 캐릭터 이미지(300x300, 스프라이트는 작음).
 * 확대를 버리진 않고, 얼굴 원형에는 머리+얼굴이 들어가게만 확대한다.
 */
export function CharacterAvatar({
  src,
  size,
  variant = "face",
}: {
  src?: string | null;
  size: number;
  variant?: "face" | "full";
}) {
  if (!src) return null;
  const crop = avatarCropStyle(variant);
  return (
    <span
      className={`avatar-frame ${variant}`}
      style={
        {
          width: size,
          height: size,
          "--avatar-zoom": crop.zoom,
          "--avatar-focus-y": crop.focusY,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
    </span>
  );
}
