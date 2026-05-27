# Crisis resources — localized hand-off targets

The persona itself does not pick the resource. The runtime detects the
user's language (and where possible, region) and appends the appropriate
resource line to the envelope's `main_response` when `safety_level ==
"crisis"`.

## Selection logic

1. Detect language from the user's message (the persona already does
   bilingual handling — we reuse the same `looks_spanish()` heuristic
   from `runner.py`).
2. If Spanish AND a Spanish-speaking country TLD or geographic signal
   appeared in the conversation, pick the country-specific resource.
3. If Spanish without a country signal, default to **Mexico** (the
   product's primary Spanish audience, mexicano-neutral voice).
4. If English, default to **US/international** (988 + IASP global list).
5. The runtime ALWAYS appends BOTH the localized resource AND the
   IASP (International Association for Suicide Prevention) crisis center
   directory link as a fallback for users outside the matched region.

## Resources by region

### Mexico (Spanish default)
- **Línea de la Vida** — 800 290 0024 — 24/7, gratuito, confidencial
- **SAPTEL (Sistema Nacional de Apoyo Psicológico por Teléfono)** — 55 5259 8121 — 24/7
- **Locatel CDMX (línea emocional)** — 55 5658 1111 — 24/7 (solo CDMX)

### Argentina
- **Centro de Asistencia al Suicida (Buenos Aires)** — 135 (línea gratuita) o (011) 5275-1135 — 24/7

### Chile
- **Salud Responde** — 600 360 7777 (opción 1, salud mental) — 24/7
- **Fono Salud Responde Suicidio** — *4141 desde celular

### Colombia
- **Línea Nacional Psicoactiva** — 018000 112439 — 24/7
- **Línea 106 (Bogotá)** — 106 — 24/7

### España
- **Teléfono de la Esperanza** — 717 003 717 — 24/7
- **024 — Línea de atención a la conducta suicida** — 024 — 24/7

### Perú
- **Línea 113 (opción 5)** — 113 — Ministerio de Salud, 24/7

### Uruguay
- **Línea Vida** — 0800 0767 — 24/7

### US / English
- **988 Suicide & Crisis Lifeline** — call or text 988 — 24/7
- **Crisis Text Line** — text HOME to 741741 — 24/7

### International / fallback
- **IASP Crisis Centers** — https://www.iasp.info/resources/Crisis_Centres/
- **Befrienders Worldwide** — https://www.befrienders.org

## Message templates

### Spanish crisis fallback (template)

```
Lo que me cuentas pesa más de lo que esta conversación puede sostener
sola. Hablar con alguien entrenado, en este momento, importa más que
cualquier cosa que yo pueda decir.

[Resource line — selected by region]

Si después de hablar con alguien real quieres regresar, aquí seguimos.
```

### English crisis fallback (template)

```
What you're describing is bigger than this conversation can hold on its
own. Talking to someone trained, right now, matters more than anything I
can say here.

[Resource line — selected by region]

If, after you talk to someone real, you want to come back, I'm here.
```

## Resource line format

When the runtime appends, it writes one of:

ES (Mexico default):
```
México: Línea de la Vida — 800 290 0024 (24/7, gratuito).
Otros países: https://www.iasp.info/resources/Crisis_Centres/
```

EN (US/international default):
```
US: 988 Suicide & Crisis Lifeline (call or text 988, 24/7).
Worldwide: https://www.iasp.info/resources/Crisis_Centres/
```

## Maintenance

These numbers change. They should be re-verified at least quarterly. Last
audit: 2026-05 by Bernard. Anyone updating this file should:
1. Confirm the number is still active (test call from a non-emergency
   context, or check the org's official site).
2. Confirm 24/7 availability claim is current.
3. Bump the audit date at the bottom of this file.

Last audit: 2026-05-26.

## What this is NOT

- Not a complete directory. Use IASP for anything outside the listed
  countries.
- Not medical advice. The product hands off; it does not assess severity
  beyond the binary "safety_level: crisis" flag.
- Not a substitute for emergency services. For immediate physical danger,
  the universal template appends a reminder that local emergency services
  (911 / 112 / 060 / 911 MX) take priority over any crisis hotline.
