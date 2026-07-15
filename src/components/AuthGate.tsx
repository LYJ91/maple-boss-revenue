import { useState, type FormEvent, type ReactNode } from "react";
import { authClient, authUrl } from "../lib/auth";
import { UserStateProvider, useSyncStatus } from "../context/UserStateProvider";

export function ProtectedApp({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  if (!authUrl)
    return (
      <AuthMessage
        title="서버 설정 필요"
        text="Neon Auth 환경변수가 아직 연결되지 않았습니다."
      />
    );
  if (session.isPending)
    return <AuthMessage title="로그인 확인 중…" text="잠시만 기다려주세요." />;
  if (!session.data?.user) return <AuthForm />;
  return (
    <UserStateProvider>
      <UserBar email={session.data.user.email} />
      {children}
    </UserStateProvider>
  );
}

function AuthForm() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "sign-in"
          ? await authClient.signIn.email({ email: email.trim(), password })
          : await authClient.signUp.email({
              email: email.trim(),
              password,
              name: name.trim() || email.split("@")[0],
            });
      if (result.error)
        throw new Error(result.error.message ?? "인증에 실패했습니다.");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "인증에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <h2>{mode === "sign-in" ? "로그인" : "회원가입"}</h2>
        <p>
          로그인하면 모든 기기에서 같은 체크리스트와 보스수익 데이터를 볼 수
          있습니다.
        </p>
        {mode === "sign-up" && (
          <input
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름"
            autoComplete="name"
          />
        )}
        <input
          className="text-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          autoComplete="email"
          required
        />
        <input
          className="text-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호 (8자 이상)"
          minLength={8}
          autoComplete={
            mode === "sign-in" ? "current-password" : "new-password"
          }
          required
        />
        {error && <p className="notice warn">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? "처리 중…" : mode === "sign-in" ? "로그인" : "가입하기"}
        </button>
        <button
          className="btn ghost"
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
          }}
        >
          {mode === "sign-in"
            ? "처음이신가요? 회원가입"
            : "이미 계정이 있나요? 로그인"}
        </button>
        <a className="auth-public-link" href="#/lookup">
          로그인 없이 장비 검색
        </a>
      </form>
    </div>
  );
}

function UserBar({ email }: { email: string }) {
  const sync = useSyncStatus();
  const label =
    sync.status === "saving"
      ? "저장 중…"
      : sync.status === "saved"
        ? "동기화 완료"
        : sync.status === "offline"
          ? "오프라인 · 재시도 대기"
          : sync.status === "error"
            ? "동기화 오류"
            : "불러오는 중…";
  return (
    <div className={`sync-user-bar ${sync.status}`}>
      <span>{label}</span>
      <span>{email}</span>
      <button
        className="btn ghost sm"
        onClick={() =>
          void authClient.signOut().then(() => window.location.reload())
        }
      >
        로그아웃
      </button>
    </div>
  );
}

function AuthMessage({ title, text }: { title: string; text: string }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h2>{title}</h2>
        <p>{text}</p>
        <a href="#/lookup">장비 검색으로 이동</a>
      </div>
    </div>
  );
}
