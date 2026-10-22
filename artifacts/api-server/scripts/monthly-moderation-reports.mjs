import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const AUDIT_ROOT = path.resolve(
  scriptDirectory,
  "..",
  ".local-audits",
  "monthly",
);

export async function readAuditSummary(auditId) {
  const safeAuditId = String(auditId ?? "");
  if (!/^audit-[0-9TZ-]+-[0-9a-f-]{36}$/iu.test(safeAuditId)) {
    throw new Error("Invalid audit ID.");
  }
  const reportPath = path.join(AUDIT_ROOT, safeAuditId, "monthly-summary.json");
  const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  if (report.auditId !== safeAuditId || report.completed !== true) {
    throw new Error("Audit report identity or completion marker is invalid.");
  }
  return { report, reportPath, directory: path.dirname(reportPath) };
}

export async function latestCompletedAudit() {
  let directories = [];
  try {
    directories = await fs.readdir(AUDIT_ROOT, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }

  const reports = [];
  for (const entry of directories) {
    if (!entry.isDirectory()) continue;
    try {
      const { report } = await readAuditSummary(entry.name);
      reports.push(report);
    } catch {
      // Incomplete or malformed directories never become audit checkpoints.
    }
  }
  return (
    reports.sort((left, right) =>
      String(right.generatedAt).localeCompare(String(left.generatedAt)),
    )[0] ?? null
  );
}

export async function writeImmutable(filePath, content) {
  await fs.writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
}
