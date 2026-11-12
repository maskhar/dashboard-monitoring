"use client";

import { ArrowLeft, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import styles from "@/components/project-workspace/workspace.module.css";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return <main className={styles.routeState} role="alert">
    <div className={`${styles.loadingMark} ${styles.errorMark}`}>!</div>
    <h1>Halaman workspace bermasalah</h1>
    <p>{error.message || "Terjadi kesalahan saat menyiapkan halaman ruang proyek."}</p>
    <div className={styles.stateActions}>
      <button type="button" className={styles.secondaryButton} onClick={() => router.push("/")}><ArrowLeft size={17} aria-hidden="true" />Dashboard</button>
      <button type="button" className={styles.primaryButton} onClick={reset}><RefreshCw size={17} aria-hidden="true" />Coba lagi</button>
    </div>
  </main>;
}
