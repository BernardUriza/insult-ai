# Safety protocols — classifier and escalation rules

Internal reference for the safety pre-check + the persona's override logic.
Three levels: `normal`, `sensitive`, `crisis`. The persona MUST set
`safety_level` correctly in every envelope; the judge MUST reject envelopes
where the level read does not match the input signals.

## The three levels

### `normal`
Default. Everything that isn't sensitive or crisis. The persona operates
under the user's chosen tone with the full clinical arc.

### `sensitive`
Moderate distress, burnout, grief, relationship hurt, work overwhelm
severe enough to mention, financial stress without crisis language,
anxiety described in non-clinical-but-heavy terms. The user is not in
danger but the conversation is delicate.

**Persona effect**: tone is overridden to no-jab effectively. The `tone`
field in the envelope still reflects what the user picked (audit trail),
but `roast_line` is null. Clinical move tends toward validation /
reflection rather than challenge.

### `crisis`
Explicit suicidal ideation, self-harm intent or active behavior, abuse
being suffered, threats of violence to self or others, acute medical
emergency, intoxication with risk. The user has crossed into territory
this product cannot hold alone.

**Persona effect**: ABANDON the Roast Coach voice. No jab. No
micro-action that minimizes the situation. `roast_line` is null,
`micro_action` is null (the micro-action would imply we can still coach
our way out — we can't). `main_response` validates the courage of saying
it, names that this is bigger than the conversation, and
`follow_up_question` is null because we hand off to a real resource
(see crisis_resources.md).

## Classifier signals (regex fast-path)

The pre-check runs simple pattern matching BEFORE the LLM eval. Hits move
the request straight to `crisis` or `sensitive` without consulting the
LLM (faster + cheaper + more reliable on the cases we know).

### Crisis signals (any → `crisis`)

EN:
- "kill myself", "killing myself", "end my life", "end it all"
- "suicid(e|al)" (with a self-pronoun nearby: i, me, my)
- "want to die", "rather be dead", "don't want to be alive"
- "hurt(ing)? myself", "cut(ting)? myself", "self.harm"
- "overdose" / "OD on" (with self-pronoun)
- "(loaded|loaded my|my) (gun|pills)" (with self-pronoun)
- "no point (in living|going on|anymore)"
- "goodbye" + "forever" (in same message)

ES (kept for users who type Spanish — the classifier still triggers; the
persona answers in English per the language policy unless `auto_locale`
is on):
- "matarme", "quitarme la vida", "acabar con mi vida", "acabar con todo"
- "suicid(io|arme|ar)"
- "quiero morir", "ya no quiero (vivir|estar|seguir)"
- "(me|me estoy) (lastim|cort|hac)\w+ daño"
- "ya no aguanto" + "(vida|aquí|esto)" (combo)
- "no tiene sentido (seguir|vivir|nada)"

### Sensitive signals (any → `sensitive`)

EN:
- "overwhelmed", "burnt? out", "drowning", "can't cope"
- "anxious" / "anxiety attack" (without crisis flag)
- "panic attack" (recent)
- "haven't slept in", "haven't eaten in"
- "lost my (job|mom|dad|partner|sister|brother|friend)"
- "(my|abusive) (partner|boyfriend|girlfriend|husband|wife)" + descriptors of harm
- crying for context ("crying", "in tears")
- "alone" + intensifier ("really", "so", "completely")

ES (same rationale — input recognition only):
- "saturad[ao]", "agotad[ao]", "no puedo más", "me ahogo"
- "ansiedad" / "ataque de ansiedad"
- "ataque de pánico"
- "no he dormido", "no he comido"
- "perdí a mi (mamá|papá|pareja|hermano|hermana|amigo)"
- "(mi|mi pareja) abusiv\w+"
- "(estoy|me siento) (sol[oa]|complemente sol[oa])"

## Crisis fallback response template

When `safety_level == "crisis"`, the persona produces an envelope where:

```
{
  "safety_level": "crisis",
  "tone": "<echoes user pick, but irrelevant — safety wins>",
  "user_state_hypothesis": "in crisis, needs hand-off to live resource",
  "clinical_move": "boundary",
  "roast_line": null,
  "main_response": "<validates courage + names the limit + points to a
                    resource — short, no sarcasm, no minimizing>",
  "micro_action": null,
  "follow_up_question": null
}
```

The runtime then enriches the response with the localized crisis
resource (see crisis_resources.md) — the persona doesn't pick the
resource itself, the runtime selects by detected language/region.

## Ambiguity escalation

When the regex fast-path doesn't fire but the LLM-eval second pass
returns `sensitive | crisis`, that level wins. Conservative direction:
if the classifier is uncertain between `normal` and `sensitive`, pick
`sensitive`. If uncertain between `sensitive` and `crisis`, pick
`crisis`.

## Judge invariants

The judge MUST reject any envelope where:
- `safety_level == "crisis"` AND (`roast_line != null` OR `micro_action != null` OR `follow_up_question != null`)
- `safety_level == "sensitive"` AND `roast_line != null`
- `safety_level == "normal"` AND (`micro_action == null` OR `follow_up_question == null`)
- Tone-not-honored: user picked `no_insults` AND `roast_line != null`

On rejection the runtime regenerates one (1) time. If the second envelope
still violates, the runtime degrades to `tone: "no_insults"` and serves
the safer second envelope anyway.

## What this is NOT

- Not a diagnosis pipeline. We do not store mental health assessments.
  The `safety_level` exists only to gate the response, not to label the
  user.
- Not crisis counseling. The product hands off, it does not replace a
  crisis line.
- Not a content filter on the user's input. The user can say whatever
  they want; the SAFETY LEVEL governs the RESPONSE, not what the user is
  allowed to send.
