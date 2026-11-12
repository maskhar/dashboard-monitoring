import styles from "./workspace.module.css";
import { statusLabel } from "./format";

function tone(status: string) {
  if (["COMPLETED", "PASSED", "ACCEPTED", "APPROVED"].includes(status)) return styles.success;
  if (["BLOCKED", "REJECTED", "CANCELLED", "MISSING"].includes(status)) return styles.danger;
  if (["IN_PROGRESS", "ACTIVE", "UPLOADED", "IN_REVIEW", "APPROVAL_PENDING", "SUBMITTED"].includes(status)) return styles.info;
  if (["READY", "REOPENED"].includes(status)) return styles.warning;
  return styles.neutral;
}

export function StatusPill({ status }: { status: string }) {
  return <span className={`${styles.statusPill} ${tone(status)}`}><i aria-hidden="true" />{statusLabel(status)}</span>;
}
