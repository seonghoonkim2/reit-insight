import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <div className="empty">
        페이지를 찾을 수 없습니다.<br />
        <Link href="/">홈으로 →</Link>
      </div>
    </main>
  );
}
