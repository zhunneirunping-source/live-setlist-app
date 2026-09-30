import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const register = JSON.parse(await readFile(new URL("../security-risk-register.json", import.meta.url), "utf8"));
const auditCommand = process.platform === "win32"
  ? [process.env.ComSpec, ["/d", "/s", "/c", "npm.cmd audit --json"]]
  : ["npm", ["audit", "--json"]];
const audit = spawnSync(auditCommand[0], auditCommand[1], {
  encoding: "utf8",
});

if (!audit.stdout) {
  console.error("Security audit did not return JSON.");
  if (audit.stderr) console.error(audit.stderr.trim());
  process.exit(2);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  console.error("Security audit returned invalid JSON.");
  process.exit(2);
}

const today = new Date().toISOString().slice(0, 10);
const accepted = new Map(register.exceptions.map((entry) => [entry.package, entry]));
const failures = [];
const warnings = [];

for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
  if (!["high", "critical"].includes(vulnerability.severity)) continue;
  if (vulnerability.severity === "critical") {
    failures.push(`${name}: CRITICAL vulnerabilities cannot be excepted`);
    continue;
  }

  const exception = accepted.get(name);
  const advisoryIds = [...new Set((vulnerability.via ?? [])
    .filter((item) => typeof item === "object" && item.severity === "high")
    .map((item) => item.url?.split("/").at(-1))
    .filter(Boolean))];
  const missingAdvisories = advisoryIds.filter((id) => !exception?.advisories?.includes(id));
  const validClass = ["NON_RUNTIME", "NON_REACHABLE", "MITIGATED_REVIEW"].includes(exception?.classification);
  const validEvidence = Array.isArray(exception?.evidence) && exception.evidence.length > 0;
  const validAcceptance = Boolean(exception?.productionExposure && exception?.mitigation && exception?.acceptedReason && exception?.owner);
  const validReview = /^\d{4}-\d{2}-\d{2}$/.test(exception?.reviewBy ?? "") && exception.reviewBy >= today;

  if (!exception || exception.status !== "accepted" || !validClass || !validEvidence || !validAcceptance || !validReview || missingAdvisories.length) {
    failures.push(`${name}: missing, expired, or incomplete risk exception`);
  } else {
    warnings.push(`${name}: ${exception.classification}, review by ${exception.reviewBy}`);
  }
}

for (const warning of warnings) console.warn(`ACCEPTED HIGH: ${warning}`);
if (failures.length) {
  for (const failure of failures) console.error(`BLOCKED: ${failure}`);
  process.exit(1);
}

console.log(`Security audit gate passed with ${warnings.length} reviewed High package exception(s).`);
