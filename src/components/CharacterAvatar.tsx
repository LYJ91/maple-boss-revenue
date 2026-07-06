/**
 * 넥슨 캐릭터 이미지는 96x96 캔버스에 캐릭터가 작게 렌더링되어 있어
 * 그대로 표시하면 여백이 많다. 확대 후 크롭해서 꽉 차게 보여준다.
 * - face: 원형, 머리 중심 크롭 (목록/카드용)
 * - full: 둥근 사각형, 전신 크롭 (히어로용)
 */
export function CharacterAvatar({
  src,
  size,
  variant = 'face',
}: {
  src?: string | null;
  size: number;
  variant?: 'face' | 'full';
}) {
  if (!src) return null;
  return (
    <span
      className={`avatar-frame ${variant}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img src={src} alt="" loading="lazy" />
    </span>
  );
}
