#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * Parallel Affiliate Army — Mercury Sandbox Test (Chunk 1.2)
 *
 * Tests: list accounts → create recipient → queue $0.01 payment → report
 * The $0.01 ACH goes to Mercury's approval queue and will NOT auto-send.
 * Cancel it manually in the Mercury sandbox dashboard after running.
 *
 * Usage (Deno):
 *   MERCURY_API_TOKEN_SANDBOX=your_token deno run --allow-net --allow-env scripts/mercury-sandbox-test.ts
 *
 * Or use the deployed edge function (see README / test docs):
 *   curl -s -X POST https://qnnjtmhwcpsmpzlxdxex.supabase.co/functions/v1/mercury-sandbox-test \
 *     -H "apikey: <supabase_anon_key>" | jq .
 */

const MERCURY_BASE = "https://api-sandbox.mercury.com/api/v1";

const token = Deno.env.get("MERCURY_API_TOKEN_SANDBOX");
if (!token) {
  console.error("❌ MERCURY_API_TOKEN_SANDBOX env var not set");
  Deno.exit(1);
}

const headers = {
  "Authorization": `Bearer ${token}`,
  "Content-Type": "application/json",
  "Accept": "application/json",
};

let passed = 0;
let failed = 0;

function ok(label: string, data: unknown) {
  console.log(`✅ ${label}`);
  console.log(JSON.stringify(data, null, 2));
  passed++;
}

function fail(label: string, data: unknown) {
  console.error(`❌ ${label}`);
  console.error(JSON.stringify(data, null, 2));
  failed++;
}

console.log("═══════════════════════════════════════════════");
console.log(" Parallel × Mercury Sandbox Test");
console.log("═══════════════════════════════════════════════\n");

// ── Step 1: List accounts ─────────────────────────────────────
console.log("Step 1 — List accounts...");
const accountsRes = await fetch(`${MERCURY_BASE}/accounts`, { headers });
const accounts = await accountsRes.json();

if (!accountsRes.ok) {
  fail("List accounts", { status: accountsRes.status, body: accounts });
  console.log("\n⛔ Stopping — cannot proceed without account access.");
  Deno.exit(1);
}

const accountList: any[] = accounts.accounts ?? accounts;
if (!Array.isArray(accountList) || accountList.length === 0) {
  fail("List accounts — no accounts found", accounts);
  Deno.exit(1);
}

const account = accountList[0];
ok("List accounts", { id: account.id, name: account.name, kind: account.kind, status: account.status });

// ── Step 2: Create test recipient ─────────────────────────────
console.log("\nStep 2 — Create test recipient...");
const recipientRes = await fetch(`${MERCURY_BASE}/recipients`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    name: "Parallel Test Affiliate (SANDBOX)",
    emails: ["sandbox-test@getparallel.vip"],
    paymentMethod: "ach",
    electronicRoutingInfo: {
      accountNumber: "9900000002",
      routingNumber: "021000021",
      bankName: "Test Bank",
      electronicAccountType: "personalChecking",
    },
  }),
});
const recipient = await recipientRes.json();

if (!recipientRes.ok) {
  fail("Create recipient", { status: recipientRes.status, body: recipient });
  Deno.exit(1);
}

ok("Create recipient", { id: recipient.id, name: recipient.name, status: recipient.status });

// ── Step 3: Queue $0.01 ACH payment ──────────────────────────
console.log("\nStep 3 — Queue $0.01 ACH payment (approval queue)...");
const idempotencyKey = `sandbox-test-${Date.now()}`;
const txRes = await fetch(`${MERCURY_BASE}/account/${account.id}/transactions`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    recipientId: recipient.id,
    amount: 0.01,
    paymentMethod: "ach",
    idempotencyKey,
    note: "Parallel affiliate army sandbox test — CANCEL THIS",
  }),
});
const tx = await txRes.json();

if (!txRes.ok) {
  fail("Queue payment", { status: txRes.status, body: tx, idempotencyKey });
  Deno.exit(1);
}

ok("Queue payment", {
  id: tx.id,
  status: tx.status,
  amount: tx.amount,
  idempotencyKey,
});

// ── Summary ───────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════");
console.log(` Results: ${passed} passed, ${failed} failed`);
console.log("═══════════════════════════════════════════════");
console.log(`\n Account:     ${account.id} (${account.name})`);
console.log(`Recipient ID: ${recipient.id}`);
console.log(`Transaction:  ${tx.id} — status: ${tx.status}`);
console.log("\n⚠️  Go to Mercury sandbox dashboard and CANCEL the pending transaction.");
console.log("   Do NOT approve it — this is a test only.");
