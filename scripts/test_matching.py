#!/usr/bin/env python3
"""
Regression test suite for the run-matching algorithm.

Usage:
    python3 scripts/test_matching.py [--tc TC-01] [--verbose]

Requirements:
    pip install requests

Environment variables required:
    SUPABASE_URL          e.g. https://yourproject.supabase.co
    SUPABASE_SERVICE_ROLE_KEY

What it does:
    For each test case in test-cases.json:
    1. Inserts two seed profiles (A and B) into the profiles table
    2. Inserts their answers and dealbreakers
    3. Calls the run-matching edge function for user A
    4. Checks whether user B appears in A's match results
    5. Compares against the expected outcome (MATCH or REJECTED)
    6. Deletes both seed profiles (clean up)

    Seed profiles are visible to real users for ~5 seconds per test case.
    Run during low-traffic periods or on a staging environment if available.
"""

import json
import os
import sys
import time
import uuid
import argparse
from datetime import datetime

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package not found. Run: pip install requests")
    sys.exit(1)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.")
    sys.exit(1)

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

EDGE_FUNCTION_URL = f"{SUPABASE_URL}/functions/v1/run-matching"


def rest_post(table, data):
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{table}", headers=HEADERS, json=data)
    if not r.ok:
        raise RuntimeError(f"POST {table} failed {r.status_code}: {r.text}")
    return r.json() if r.text.strip() else None


def rest_delete(table, params):
    headers = {**HEADERS, "Prefer": ""}
    r = requests.delete(f"{SUPABASE_URL}/rest/v1/{table}", headers=headers, params=params)
    if not r.ok:
        raise RuntimeError(f"DELETE {table} failed {r.status_code}: {r.text}")


def rest_get(table, params):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}", headers=HEADERS, params=params)
    if not r.ok:
        raise RuntimeError(f"GET {table} failed {r.status_code}: {r.text}")
    return r.json()


def insert_seed_profile(tc_id, role, spec):
    profile_id = str(uuid.uuid4())
    profile_data = {
        "id": profile_id,
        "name": spec["profile"]["name"],
        "date_of_birth": spec["profile"]["date_of_birth"],
        "latitude": spec["profile"].get("latitude"),
        "longitude": spec["profile"].get("longitude"),
        "has_completed_onboarding": True,
        "is_seed_account": True,
        "is_suspended": False,
        "is_paused": False,
        "is_hidden_pending_review": False,
    }
    rest_post("profiles", profile_data)

    if spec.get("answers"):
        rest_post("user_answers", {
            "user_id": profile_id,
            "answers": spec["answers"],
        })

    if spec.get("dealbreaker_ids"):
        rest_post("user_dealbreakers", {
            "user_id": profile_id,
            "question_ids": spec["dealbreaker_ids"],
        })

    return profile_id


def cleanup_seed(profile_id):
    try:
        rest_delete("matches", {"user_id": f"eq.{profile_id}"})
    except Exception:
        pass
    try:
        rest_delete("matches", {"matched_user_id": f"eq.{profile_id}"})
    except Exception:
        pass
    try:
        rest_delete("user_dealbreakers", {"user_id": f"eq.{profile_id}"})
    except Exception:
        pass
    try:
        rest_delete("user_answers", {"user_id": f"eq.{profile_id}"})
    except Exception:
        pass
    try:
        rest_delete("profiles", {"id": f"eq.{profile_id}"})
    except Exception:
        pass


def run_matching_for(user_id):
    r = requests.post(
        EDGE_FUNCTION_URL,
        headers={
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
        },
        json={"userId": user_id},
        timeout=60,
    )
    if not r.ok:
        raise RuntimeError(f"run-matching failed {r.status_code}: {r.text[:500]}")
    return r.json()


def check_matched(user_id, candidate_id):
    rows = rest_get("matches", {
        "user_id": f"eq.{user_id}",
        "matched_user_id": f"eq.{candidate_id}",
    })
    return rows


def run_test_case(tc, verbose=False):
    tc_id = tc["id"]
    desc = tc["description"]
    expected = tc["expected"]

    a_id = None
    b_id = None

    try:
        a_id = insert_seed_profile(tc_id, "A", tc["a"])
        b_id = insert_seed_profile(tc_id, "B", tc["b"])

        if verbose:
            print(f"  Inserted A={a_id[:8]}... B={b_id[:8]}...")

        result = run_matching_for(a_id)

        if verbose:
            print(f"  run-matching result: matched={result.get('matched', '?')}, "
                  f"hardFilterRejects={result.get('hardFilterRejects', '?')}, "
                  f"dealbreakerRejects={result.get('dealbreakerRejects', '?')}, "
                  f"scoreRejects={result.get('scoreRejects', '?')}")

        match_rows = check_matched(a_id, b_id)
        did_match = len(match_rows) > 0
        score = match_rows[0].get("compatibility_score") if did_match else None

        if expected == "MATCH":
            if not did_match:
                sample = result.get("sampleRejects", [])
                b_name = tc["b"]["profile"]["name"]
                b_reject = next((s for s in sample if b_name in s), "not in sample rejects")
                return False, f"Expected MATCH but got REJECTED. Reject reason: {b_reject}"
            score_min = tc.get("score_min")
            score_max = tc.get("score_max")
            if score_min is not None and score is not None and score < score_min:
                return False, f"Matched but score {score} < expected minimum {score_min}"
            if score_max is not None and score is not None and score > score_max:
                return False, f"Matched but score {score} > expected maximum {score_max}"
            score_note = f" (score={score})" if score is not None else ""
            return True, f"MATCH{score_note}"

        else:  # REJECTED
            if did_match:
                return False, f"Expected REJECTED but got MATCH (score={score})"
            return True, "REJECTED"

    except Exception as e:
        return False, f"Exception: {e}"
    finally:
        if a_id:
            cleanup_seed(a_id)
        if b_id:
            cleanup_seed(b_id)


def main():
    parser = argparse.ArgumentParser(description="Run matching algorithm regression tests.")
    parser.add_argument("--tc", help="Run only this test case (e.g. TC-01)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show extra detail")
    args = parser.parse_args()

    cases_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "supabase", "functions", "run-matching", "test-cases.json"
    )

    with open(cases_path) as f:
        data = json.load(f)

    test_cases = data["test_cases"]
    if args.tc:
        test_cases = [tc for tc in test_cases if tc["id"] == args.tc]
        if not test_cases:
            print(f"No test case found with id={args.tc}")
            sys.exit(1)

    print(f"\nrun-matching regression tests  ({datetime.now().strftime('%Y-%m-%d %H:%M')})")
    print(f"Algorithm version target: {data.get('algorithm_version', 'unknown')}")
    print(f"Running {len(test_cases)} test case(s)\n")

    passed = 0
    failed = 0
    failures = []

    for tc in test_cases:
        tc_id = tc["id"]
        desc = tc["description"][:70]
        print(f"  {tc_id}  {desc}")

        if args.verbose:
            print(f"    Expected: {tc['expected']} ({tc.get('expected_reason', 'n/a')})")

        ok, msg = run_test_case(tc, verbose=args.verbose)

        if ok:
            passed += 1
            print(f"    ✅ PASS — {msg}")
        else:
            failed += 1
            failures.append((tc_id, msg))
            print(f"    ❌ FAIL — {msg}")

        print()

    total = passed + failed
    print("─" * 60)
    print(f"{passed}/{total} tests passed\n")

    if failures:
        print("Failures:")
        for tc_id, msg in failures:
            print(f"  {tc_id}: {msg}")
        print()
        print("DO NOT DEPLOY until all tests pass.")
        sys.exit(1)
    else:
        print("All tests passed. Safe to deploy.")
        sys.exit(0)


if __name__ == "__main__":
    main()
