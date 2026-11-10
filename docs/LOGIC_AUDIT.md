# Pickleball Park logic audit

Audit date: 2026-11-10. Base: deployed main
`09d2a7beb3851571a45c8f4bd747e5c480564d12`. Work is isolated on
`audit/pickleball-positioning`. The release checkout and historical fixtures
are not rewritten. This audit does not authorize publication.

## Scope and coaching basis

Review covers service roles, opening bounces, grounded NVZ evidence, contact
selection, tactical shot policy and targets, generated movement, optional
coverage guidance, source ownership, sampled speed/spacing and terminal events.
Rules and tactics remain separate. The app is a four-player rally demonstrator,
not a complete match-scoring or officiating system.

The main coaching principles are linked lateral coverage, protecting the line
and middle according to ball location, earning kitchen progress behind suitable
shots, staying balanced against attacks, and preserving the opening two bounces.
A forehand can break a comparable contact tie; it does not universally own the
middle. Feet-per-second, clearance and lane constants are product heuristics,
not rules or measurements of every player's ability.

Primary references checked during the audit:

- [USA Pickleball positioning](https://usapickleball.org/pickleball-skills/level-two/pickleball-basics-positioning-tips/)
- [USA Pickleball split step](https://usapickleball.org/pickleball-skills/level-four/how-to-master-the-split-step-for-faster-reactions/)
- [PrimeTime Pickleball shading and middle responsibility](https://primetimepickleball.com/the-number-1-forehand-strategy-mistake/)
- [Selkirk third-shot approach guidance](https://www.selkirk.com/blogs/pickleball-education/using-the-third-shot-drop-to-earn-optimal-court-position)
- [2026 USA Pickleball Official Rulebook](https://usapickleball.org/docs/rules/USAP-Official-Rulebook.pdf)
- [2026 Referee Casebook, May 22 revision](https://usapickleball.org/docs/referee/usa-pickleball-referee-casebook-2026-r1.pdf)

## Confirmed problems and repairs

### Discontinuous and crowded coverage suggestions

The old near-player/sideline branch jumped several feet as an opponent's contact
origin crossed x=10. Centered (5,30)/(15,30) defenders could receive markedly
asymmetric suggestions. A separate authored fixture at (8,30)/(12,30) was accepted
with no findings after assistance reduced its separation from 4 to 1.58 feet.
The old compiler clearance fallback applied only to automatic generated tactics.

Coverage now uses continuous, reflected pair lanes and retains depth. The
contact receiver, manual commands and active pins stay protected in guides as
well as applied positions. Lateral additions are limited before entering a
partner's clearance circle. Compiler validation compares assisted routes with
the unassisted baseline and rejects newly crowded authored routes too. The
same boundary now rejects assisted eased movement that newly exceeds 18 ft/s,
including an authored off-ball route that previously reached 25.45 ft/s. A close,
unusual or already-fast authored base is not silently repaired. Model 2 continues to
exclude this legacy post-compile assistance because its contacts and feet are
physical evidence.

### Mirrored forehand guidance

The legacy tactical snapshot/Smart ranking used the opposite anatomical lateral
sign from the physical contact model. It now uses low x for a right-handed Green
player facing +y and the reflected direction for Orange, with handedness
mirrored. Zero lateral offset does not earn a forehand tiebreak. Explicit
service eligibility and authored next contacts remain authoritative.

### Permanent receiving-team approach

The former receiving team was allowed to approach throughout the rally, even
after a weak, attackable own shot or while defending a fast attack. The same
shot could therefore produce different movement solely because of who served.

The opening return retains its approach. Later, either team earns progress
behind a controlled own shot; its own attackable shot does not trigger an
approach. Either transitional defending pair can close on an incoming soft
ball, while established kitchen defenders hold a balanced stance. Fast incoming
drives, volleys and overheads do not inherit the original returner's advance.
Midrally demonstrations use open-rally logic from their first shown contact.
Actual contact arrivals, time bounds, pair clearance and grounded NVZ recovery
remain independently validated.

Movement endpoints follow the current flight. It would be incorrect to treat
all target-based end-of-flight recovery as advance knowledge: by the next
contact, a crosscourt ball has moved to that lane. Coverage-origin guides and
actual flight recovery have different roles. Mirrored tests verify both.

### Fixed execution errors outside a post

The wider current-generation regression exposed an off-sideline long error
whose exact contact-to-target chord went around the net post. Delivered-flight
resolution supported this incidental route for wide errors but not long errors,
so an otherwise solver-supported miss could terminate as unsupported.

Both fixed long and wide errors now use the actual outside-post chord. This does
not add an ATP tactic, alter nominal route admission, change the sampled target,
reroll quality, or reclassify the ball as successful. Mirrored tests retain the
original draws and include neutral, net-error and strict-planner negative cases.

## Historical preservation and regression evidence

Saved recipes keep their explicit movement, contacts and physical evidence.
Archived positive and negative rally documents remain unchanged and are tested
on both court ends and handednesses. New procedural output can differ when
corrected movement changes the next formation or feasible shot choices.

The dynamic Pro 1136 and Advanced 1074 checks record those changed current
outputs explicitly, without changing old source fixtures. Advanced 1074 now
selects a transition reset after the old returning team's weak drive rather
than pretending all four players reached the kitchen. Pro 1136 retains a legal,
solver-supported attack with a smaller positive local-tape margin at its exact
new contact. Execution quality draws are not rerolled to obtain a desired result.

Local evidence is written under ignored `release-results/logic-audit/`. Required
validation includes full unit/static checks, generated assets, both complete
headless browser catalogs, exact built-package verification and the existing
3,600-input physical/determinism regression. A focused pass alone is not a
claim that these release gates passed; final results accompany the completed
audit. No failure, retry, skip or calibration exception is added by this branch.

## Remaining model limits

- Full sole, paddle/clothing-ground contact, balance recovery and adaptive play
  are not represented; the existing NVZ uncertainty notices remain necessary.
- Contact and body geometry are approximations. Assisted legacy actor clearance
  is sampled, not a proof of all continuous anatomical positions.
- There is no drag/spin calibration, full tactical opponent model, universal
  optimal spacing, or comprehensive stacking/poaching policy.
- Headless Chromium/WebKit exercise browser behavior while the Mac is locked.
  Physical touch, native Safari, VoiceOver and real displayed frame rate require
  separate device validation.
