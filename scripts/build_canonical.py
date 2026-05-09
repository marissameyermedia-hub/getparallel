#!/usr/bin/env python3
"""
build_canonical.py

Reads src/data/parallelQuestionnaire_updated.ts and writes
src/data/canonical-options.json — the canonical questionnaire snapshot
consumed by the run-matching edge function via public.matching_config.

Usage:
    python3 scripts/build_canonical.py
"""
import sys
import re
import json
import hashlib
from pathlib import Path

ROOT = Path(__file__).parent.parent
TS_FILE = ROOT / "src" / "data" / "parallelQuestionnaire_updated.ts"
OUT_FILE = ROOT / "src" / "data" / "canonical-options.json"

VERSION = "v100"
SCHEMA_VERSION = 1


# ── Sorting ──────────────────────────────────────────────────────────────────

def sort_key(qid):
    """
    Sort key for dotted question IDs: "1.1", "3.9a", "7.1b", "11.1b", etc.
    Returns (major, minor_num, alpha_suffix) for correct numeric ordering.
    """
    parts = qid.split(".", 1)
    major = int(parts[0])
    if len(parts) < 2:
        return (major, 0, "")
    m = re.match(r'^(\d+)([a-z]*)$', parts[1])
    if m:
        return (major, int(m.group(1)), m.group(2))
    return (major, 0, "")


# ── Comment stripping ─────────────────────────────────────────────────────────

def strip_comment_from_line(line):
    """Remove a // line comment, respecting string literals."""
    in_str = False
    str_char = None
    i = 0
    while i < len(line):
        c = line[i]
        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == str_char:
                in_str = False
        else:
            if c in ('"', "'", '`'):
                in_str = True
                str_char = c
            elif c == '/' and i + 1 < len(line) and line[i + 1] == '/':
                return line[:i]
        i += 1
    return line


def strip_line_comments(text):
    return '\n'.join(strip_comment_from_line(line) for line in text.split('\n'))


# ── Brace / bracket matching ──────────────────────────────────────────────────

def find_opening_brace(text, pos):
    """
    Walk backwards from pos to find the { that directly encloses it.
    Counts unmatched } encountered along the way.
    """
    depth = 0
    i = pos - 1
    while i >= 0:
        c = text[i]
        if c == '}':
            depth += 1
        elif c == '{':
            if depth == 0:
                return i
            depth -= 1
        i -= 1
    return None


def find_closing_brace(text, start):
    """Find the } that closes the { at position start, respecting strings."""
    depth = 0
    in_str = False
    str_char = None
    i = start
    while i < len(text):
        c = text[i]
        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == str_char:
                in_str = False
        else:
            if c in ('"', "'", '`'):
                in_str = True
                str_char = c
            elif c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return None


def find_closing_bracket(text, start):
    """Find the ] that closes the [ at position start, respecting strings."""
    depth = 0
    in_str = False
    str_char = None
    i = start
    while i < len(text):
        c = text[i]
        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == str_char:
                in_str = False
        else:
            if c in ('"', "'"):
                in_str = True
                str_char = c
            elif c == '[':
                depth += 1
            elif c == ']':
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return None


# ── Question block parser ─────────────────────────────────────────────────────

def parse_question_block(block, qid):
    """
    Parse the TypeScript question object text into a canonical dict.
    Returns None if required fields are missing.
    """
    q = {"id": qid}

    # text (required)
    m = re.search(r'\btext:\s*"((?:[^"\\]|\\.)*)"', block)
    if not m:
        return None
    q["text"] = m.group(1)

    # type (required)
    m = re.search(r'\btype:\s*"([A-Z_]+)"', block)
    if not m:
        return None
    q["type"] = m.group(1)

    # category
    m = re.search(r'\bcategory:\s*"([^"]+)"', block)
    q["category"] = m.group(1) if m else None

    # weight
    m = re.search(r'\bweight:\s*(\d+)', block)
    q["weight"] = int(m.group(1)) if m else 0

    # tags array
    tags_m = re.search(r'\btags:\s*\[', block)
    if tags_m:
        bracket_start = tags_m.end() - 1
        bracket_end = find_closing_bracket(block, bracket_start)
        if bracket_end:
            tags_block = block[bracket_start:bracket_end + 1]
            q["tags"] = re.findall(r'"([^"]+)"', tags_block)
        else:
            q["tags"] = []
    else:
        q["tags"] = []

    # has_dealbreaker
    m = re.search(r'\bhasDealbreaker:\s*(true|false)', block)
    q["has_dealbreaker"] = (m.group(1) == "true") if m else None

    # optional
    m = re.search(r'\boptional:\s*(true|false)', block)
    q["optional"] = (m.group(1) == "true") if m else None

    # options array — match only the top-level `options:` field, not
    # hideOptions / dealbreakerValues / ifValues etc.
    options_m = re.search(r'(?<!\w)options:\s*\[', block)
    if options_m:
        bracket_start = options_m.end() - 1
        bracket_end = find_closing_bracket(block, bracket_start)
        if bracket_end:
            options_block = block[bracket_start:bracket_end + 1]
            q["options"] = re.findall(r'"((?:[^"\\]|\\.)*)"', options_block)
        else:
            q["options"] = []
    else:
        q["options"] = []

    return q


# ── Main extraction ───────────────────────────────────────────────────────────

# Matches question IDs only: dotted strings like "1.1", "3.9a", "7.1b", "11.1b"
ID_RE = re.compile(r'\bid:\s*"(\d+\.[0-9a-z]+)"')


def extract_questions(text):
    questions = []
    seen_ids = set()

    for match in ID_RE.finditer(text):
        qid = match.group(1)
        if qid in seen_ids:
            continue

        brace_start = find_opening_brace(text, match.start())
        if brace_start is None:
            print(f"WARNING: no opening brace for {qid}", file=sys.stderr)
            continue

        brace_end = find_closing_brace(text, brace_start)
        if brace_end is None:
            print(f"WARNING: no closing brace for {qid}", file=sys.stderr)
            continue

        block = text[brace_start:brace_end + 1]
        q = parse_question_block(block, qid)
        if q is None:
            print(f"WARNING: failed to parse {qid}", file=sys.stderr)
            continue

        questions.append(q)
        seen_ids.add(qid)

    return questions


# ── Hash ──────────────────────────────────────────────────────────────────────

def compute_hash(questions):
    """SHA-256 of the sorted, serialised question list (first 16 hex chars)."""
    sorted_qs = sorted(questions, key=lambda q: sort_key(q["id"]))
    payload = json.dumps(sorted_qs, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    if not TS_FILE.exists():
        print(f"ERROR: {TS_FILE} not found", file=sys.stderr)
        sys.exit(1)

    raw = TS_FILE.read_text(encoding="utf-8")
    clean = strip_line_comments(raw)
    questions = extract_questions(clean)
    questions.sort(key=lambda q: sort_key(q["id"]))

    content_hash = compute_hash(questions)

    output = {
        "version": VERSION,
        "schema_version": SCHEMA_VERSION,
        "questions": questions,
        "content_hash": content_hash,
    }

    OUT_FILE.write_text(
        json.dumps(output, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    hard_filters = [q["id"] for q in questions if "Hard Filter" in q["tags"]]
    dealbreakers = [q["id"] for q in questions if "Dealbreaker Eligible" in q["tags"]]

    print(f"Questions  : {len(questions)}", file=sys.stderr)
    print(f"Hash       : {content_hash}", file=sys.stderr)
    print(f"Hard filters ({len(hard_filters)}): {', '.join(hard_filters)}", file=sys.stderr)
    print(f"Dealbreaker eligible ({len(dealbreakers)}): {', '.join(dealbreakers)}", file=sys.stderr)
    print(f"Output     : {OUT_FILE}", file=sys.stderr)


if __name__ == "__main__":
    main()
