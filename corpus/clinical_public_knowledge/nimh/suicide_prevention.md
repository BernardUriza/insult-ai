---
source: NIMH
source_url: https://www.nimh.nih.gov/health/topics/suicide-prevention
license: public-domain-us-federal
license_url: https://www.nimh.nih.gov/site-info/policies
retrieved_at: 2026-05-26
attribution_required: true
attribution_text: "Source: National Institute of Mental Health (NIMH)."
phi_screened: true
---

# Suicide Prevention — Warning Signs and Resources

Suicide is a leading cause of death in the United States. Talking openly
about suicide does not plant the idea in someone's head; the opposite is
closer to the truth — open conversations save lives.

This document exists so the Roast Coach pipeline has retrievable text
to ground the safety branch of the persona (see
`api/insult_ai/policies/crisis_resources.md` and the safety hierarchy
in `api/insult_ai/personas/clinical_compadre.md`). The Roast Coach
ABANDONS the roast persona immediately when crisis signals appear; the
content below is part of what is surfaced in that branch.

## Warning signs to take seriously

Any one of these is a reason to take action — to reach out, to ask
directly, to connect the person with a resource. The combination is
even more concerning. They include:

- Talking about wanting to die or wanting to kill themselves.
- Talking about feeling empty, hopeless, or having no reason to live.
- Talking about being a burden to others.
- Talking about feeling trapped or in unbearable emotional or physical
  pain.
- Making a plan or looking for a way to kill themselves — searching
  online for methods, gathering means.
- Talking about great guilt or shame.
- Using alcohol or drugs more often.
- Acting anxious, agitated, or restless.
- Withdrawing from family and friends.
- Sleeping too little or too much.
- Showing rage or talking about seeking revenge.
- Saying goodbye to loved ones; putting affairs in order; giving away
  important possessions.
- Extreme mood swings — sudden calm after a period of depression can
  also be a warning sign.

## What helps

- **Ask directly.** "Are you thinking about suicide?" Asking does not
  cause suicide. It opens the door for the person to tell someone.
- **Listen without judgment.** The person needs to feel heard, not
  fixed.
- **Be there.** Physical presence, or staying on the phone, matters.
- **Help them connect with a resource.** A clinician, a crisis line,
  a trusted family member, an emergency room when appropriate.
- **Remove access to means** when possible — firearms, medications,
  other dangerous items.
- **Follow up.** A check-in days later is often what makes the
  difference.

## Crisis resources

In the United States:

- **988 Suicide and Crisis Lifeline.** Call or text **988**, 24 hours a
  day, every day. Free and confidential.
- **Crisis Text Line.** Text **HOME** to **741741** in the US.
- **In immediate danger:** call **911** or go to the nearest emergency
  room.

For users outside the United States, the Roast Coach runtime is
configured to surface localized hotlines via
`api/insult_ai/policies/crisis_resources.md`. The list there is the
canonical source.

## What the Roast Coach must do in this branch

When the user signals suicidal ideation, self-harm, or a comparable
crisis:

1. The persona is dropped. No sarcasm, no jab, no jokes, no minimizing.
2. The envelope `safety_level` MUST be `crisis` and `roast_line` MUST
   be null.
3. The response validates the courage of saying it.
4. The response names that this is bigger than what the Roast Coach can
   hold.
5. The response hands over a real resource (localized hotline appended
   by the runtime).
6. The response does not pretend to be a clinician and does not
   diagnose.

This is not optional behavior. It is enforced by safety guards in
`runner.py` and by the persona policy in `clinical_compadre.md`.

## Important note

This document is for psychoeducation and to ground the safety branch of
the agent. It is not a substitute for professional crisis services. If
you or someone you know is in crisis, please use the resources above.
