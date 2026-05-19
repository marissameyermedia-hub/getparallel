# How Parallel Finds Your Matches

*For users, journalists, investors, and anyone who wants to understand what's actually happening under the hood.*

---

## The Short Version

Parallel doesn't show you a feed of people to swipe through. Instead, it runs a compatibility algorithm — once — that scores how well you and every other completed profile would work together across eight dimensions of relationship success. The people who score highest become your matches.

The algorithm was built on decades of relationship research, including Dr. John Gottman's 40+ years of work predicting long-term relationship outcomes, attachment theory, and values-alignment research.

---

## Step 1: The Non-Negotiables

Before any scoring happens, five hard filters eliminate people who are fundamentally incompatible in ways that can't be bridged:

**1. Gender**
You only see people whose gender matches what you're looking for, and who are looking for your gender. Bidirectional — both people have to be open to each other.

**2. Age**
Both of you have to fall within the other person's stated age preference. If someone wants to date people 28–40 and you're 26, they won't appear in your matches (and you won't appear in theirs).

**3. Height**
If someone has specified a height range for a partner, you have to fall within it — and they have to fall within yours, if you've set one. Height is not required, and not everyone sets a range.

**4. Distance**
Both of you have to be willing to date at the distance between you. If you'd date someone up to 50 miles away and they're 80 miles away, neither of you appears in the other's matches.

**5. Political views**
If someone specifies they only want to date people with certain political views, you have to meet that preference — and they have to meet yours. Parallel doesn't take a side; it just honors what you've told us.

---

## Step 2: Your Dealbreakers

Dealbreakers are the requirements you've marked as absolute — things you truly cannot work around.

Here's the key difference from everything else on the questionnaire: **dealbreakers are not flexible.** If you mark "must not smoke" as a dealbreaker and a potential match smokes regularly, they're removed — regardless of how well you score together on everything else.

Dealbreakers work in both directions. Even if your dealbreakers pass for someone, if their dealbreakers don't pass for you, you won't match.

**What can be marked as a dealbreaker:**
- Drinking and smoking habits
- Drug use
- Pets (including allergies)
- Religion and faith practice
- Parenting style
- Lifestyle preferences

**One important thing:** dealbreakers are absolute *by design*. The questionnaire is built to make sure you understand this when you're setting them. If you mark something as a dealbreaker, we take that at face value — Parallel doesn't soften or override your stated requirements.

---

## Step 3: The 8 Compatibility Dimensions

Once someone passes the hard filters and your dealbreakers (and you pass theirs), the algorithm calculates a compatibility score across eight dimensions. Each dimension carries a different weight, based on how strongly it predicts long-term relationship success.

### 1. Attachment & Emotional Health *(highest weight)*

This is the single most important dimension in the algorithm, and the one backed by the strongest research.

We assess how you bond and connect emotionally — what happens in your body when someone doesn't text back quickly, or when a relationship starts getting close. Research by Dr. John Gottman and attachment theorists consistently shows that how two people's attachment styles interact predicts long-term relationship quality better than almost any other factor.

The four attachment patterns the algorithm recognizes:
- **Secure** — You don't stress about closeness or space. You assume good intent.
- **Anxious** — You tend to worry about the relationship, check for reassurance, and feel uncertainty strongly.
- **Avoidant** — When things get emotionally close, you feel a pull to create distance.
- **Fearful** — You both want closeness and feel scared by it.

**The anxious-avoidant pairing** gets a 10% score reduction. This doesn't prevent a match — an anxious person and an avoidant person can and do match — but the research consistently shows this pairing requires more intentional work, and the score reflects that.

**Secure + secure** produces the highest scores. Secure people can also pair beautifully with anxious or avoidant people, because their steadiness helps regulate the relationship.

### 2. Communication & Conflict *(second highest weight)*

Not whether you argue — everyone does — but *how* you handle conflict.

Gottman's research found that couples who stay together aren't the ones who fight less. They're the ones who fight *better*: they can hear hard feedback, they don't go completely silent, they repair after conflict, and they don't hold grudges.

The algorithm looks at things like: Do you need to process alone before talking, or do you process out loud? Do you tend to go quiet or push through? Can you hear criticism without shutting down?

### 3. Life Goals *(tied for second)*

Children, marriage, relationship type, and timeline.

If one person wants children and the other doesn't, that's a genuine incompatibility — not a failure, just a mismatch. The same is true for someone who wants marriage versus someone who's philosophically opposed to it, or someone who wants a long-term partner versus someone who's genuinely open to something more casual.

This dimension doesn't judge any particular answer. It scores alignment between what two people want to build.

### 4. Values & Beliefs *(tied for second)*

Religion, family importance, and what you stand for.

Shared values predict long-term compatibility more strongly than shared personality or shared hobbies. The algorithm handles religion carefully: it isn't scored as a hard filter (unless you've set a dealbreaker), and it respects both "I'm very open to different beliefs" and "I need a partner who shares mine."

### 5. Lifestyle Behaviors *(mid weight)*

Drinking, smoking, marijuana, exercise, cleanliness, sleep schedule, and daily habits.

Some of these are also dealbreaker-eligible (see Step 2). When they're *not* marked as dealbreakers, they're scored on a spectrum: if you drink occasionally and your potential match drinks heavily, that scores lower than two people who have similar habits.

### 6. Social & Shared Life *(mid weight)*

Hobbies, how you recharge (introvert/extrovert), community, and what kind of life you want to share.

The algorithm scores both hobby overlap and lifestyle style — someone who loves being out constantly would score lower with a devoted homebody, even if they have individual hobbies in common.

### 7. Financial & Career *(lower weight)*

Ambition, financial philosophy, career orientation, and how you approach money.

This is weighted lower than psychology and life goals because financial compatibility tends to be more negotiable — two people can have very different careers and still work well together. But financial *philosophy* (spending vs. saving, debt tolerance, who pays for what) is harder to navigate when it diverges sharply.

### 8. Intimacy & Connection *(lower weight)*

Physical attraction preferences and how you experience connection.

This is scored as a compatibility dimension, not a filter. Attraction preferences are compared using a multi-select compatibility system: if your partner's stated build preferences don't align with your build, you score lower on this dimension — but it doesn't prevent a match. This is intentional: attraction is real but attraction can develop, and Parallel doesn't want to build a product that filters primarily on physical appearance.

---

## How the Score Is Calculated

Each of the eight dimensions gets an average score (0–100), weighted by how many questions cover it and how predictive it is of long-term success.

Those eight scores are then combined into a final compatibility score using something called a **harmonic mean** (instead of a simple average). This is deliberate: the harmonic mean punishes lopsided scores more than a simple average would.

If you score 95 on attachment and 20 on life goals, the harmonic result is much lower than (95+20)/2 = 57. That's because a 20 in a critical dimension isn't "offset" by high scores elsewhere — misalignment on life goals is genuinely problematic, and the algorithm shouldn't hide it.

**Score minimums for a match:**
- Neither person's directional score can be below 30
- The final harmonic score must be at least 40

If either of these thresholds isn't met, the pair is not matched.

---

## What the Score Means

| Score | What it suggests |
|-------|-----------------|
| 80–100 | Exceptional alignment across the dimensions that matter most |
| 65–79 | Strong compatibility with some natural differences |
| 50–64 | Solid foundation; some areas worth discussing |
| 40–49 | Enough to work with; meaningful differences exist |
| < 40 | Not matched (below minimum threshold) |

The score is not a grade and it's not a promise. Two people with a 92 can have a terrible relationship if they're not honest with each other. Two people with a 52 can have a beautiful one if they're both committed to working on the areas where they differ. The score is a starting point, not a verdict.

---

## The Feedback Loop

Every time you go on a date with a Parallel match, we ask how it went. Not just "did you like them?" — but more specific things: How was the conversation? Did they match how they presented themselves? How did the energy feel?

Over time, that feedback teaches the algorithm about what actually matters for *you* specifically. The algorithm starts with research-based defaults, but your experience shapes your future matches. If you consistently enjoy matches who score very high on communication and less so on lifestyle, the algorithm learns that and weights your future scoring accordingly.

This is still early. The feedback loop gets stronger the more you use it.

---

## The Research Behind It

Parallel's matching algorithm draws on several well-established bodies of research:

**Attachment Theory (Bowlby, Ainsworth, Hazan & Shaver):** Originally developed to understand parent-child bonds, then extended to adult romantic relationships. The secure/anxious/avoidant framework is one of the most robust predictors of relationship quality.

**The Gottman Institute:** 40+ years of longitudinal research on couples. Gottman's "Four Horsemen" (criticism, contempt, defensiveness, stonewalling) and his work on repair and conflict patterns directly inform how Parallel scores communication and conflict.

**Values Alignment Research:** Decades of relationship research consistently shows that shared values predict long-term satisfaction more than shared interests or shared personalities.

**Personality Similarity Research:** Despite popular belief, "opposites attract" doesn't hold up well in longitudinal studies. Similarity on the dimensions that matter (attachment, values, life goals) predicts better outcomes than difference.

---

## What Parallel Does NOT Do

**We don't rank by photos.** Photos are verified (to prevent catfishing) but they're not scored. Two people with the same compatibility score are sorted by distance, not by how their photo performs.

**We don't optimize for engagement.** Many apps benefit when you're addicted and swiping forever. Parallel benefits when you find a great match and leave — we've done our job.

**We don't have a "hot list" or tier system.** There's no hidden tier where certain profiles get more visibility. Everyone's matches are computed the same way.

**We don't use AI-generated scores based on your behavior patterns or usage data.** The score comes from your questionnaire answers, nothing else.

---

## Updating This Document

This document lives in the Parallel codebase at `docs/HOW_MATCHING_WORKS.md`. When the algorithm changes, this document is updated at the same time. The algorithm version described here is **v100**, deployed May 2026.
