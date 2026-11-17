// A necessary outer envelope for NEW generated grounded contacts only.
// It does not prove a complete skeletal pose, forbid a human technique, or
// change the public authored-contact model. Exact rig diagnostics remain
// independent. Low contacts keep the existing horizontal allowance because
// crouch/hinge support cannot be described by one fixed shoulder sphere.
import { HUMAN_ATHLETE_PROFILE_V1 as BODY } from './human-athlete-profile.js';

const METRES_PER_FOOT = .3048;
const EPS = 1e-7;
const torsoRadius = Math.hypot(BODY.shoulderHalfWidth, BODY.shoulderHeight - BODY.hipHeight, BODY.shoulderForward);
const hipHeight = Math.min(BODY.maximumHipHeight, BODY.ankleHeight + BODY.thighLength + BODY.shinLength);
const armPaddleReach = BODY.upperArmLength + BODY.forearmLength + BODY.wristToPaddleFaceDistance;
// Pitch/yaw can never raise the shoulder more than the norm of its y/z offset.
// Round outward in metres, independently of the renderer's chosen pose.
const shoulderHeight = Math.ceil((hipHeight + Math.hypot(BODY.shoulderHeight - BODY.hipHeight, BODY.shoulderForward)) * 1000) / 1000;
export const GENERATED_CONTACT_SUPPORT_V1 = Object.freeze({
  version: 'generated-grounded-support-v1',
  profileVersion: BODY.version,
  scope: 'necessary-generation-envelope',
  necessaryOnly: true,
  horizontalReachFeet: 3,
  maximumHipHeightMetres: hipHeight,
  maximumHipHorizontalOffsetMetres: BODY.maximumHipHorizontalOffset,
  hipToShoulderRadiusMetres: torsoRadius,
  armPaddleReachMetres: armPaddleReach,
  maximumShoulderHeightMetres: shoulderHeight,
  maximumContactHeightFeet: (shoulderHeight + armPaddleReach) / METRES_PER_FOOT,
  descendingProposalHeightsFeet: Object.freeze([7.5, 7, 6.5]),
});
const point = (value, name) => {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new TypeError(`${name} needs finite board coordinates.`);
  return value;
};

/** Null means even this generous necessary height bound excludes contact.
 * The hip-chain bound couples height and lateral reach without pretending that
 * independent shoulder-height/horizontal extrema can occur simultaneously. */
export function generatedContactRadiusFeetV1(heightFeet) {
  if (!Number.isFinite(heightFeet) || heightFeet < 0) throw new TypeError('Generated contact height must be finite and nonnegative.');
  if (heightFeet > GENERATED_CONTACT_SUPPORT_V1.maximumContactHeightFeet + EPS) return null;
  const vertical = Math.max(0, heightFeet * METRES_PER_FOOT - hipHeight);
  const chain = torsoRadius + armPaddleReach;
  if (vertical > chain) return null;
  const horizontal = BODY.maximumHipHorizontalOffset + Math.sqrt(Math.max(0, chain * chain - vertical * vertical));
  return Math.min(GENERATED_CONTACT_SUPPORT_V1.horizontalReachFeet, horizontal / METRES_PER_FOOT);
}

export function assessGeneratedContactSupportV1({ contact, feet } = {}) {
  point(contact, 'Contact');
  const maximumHorizontalFeet = generatedContactRadiusFeetV1(contact.heightFeet);
  if (!Array.isArray(feet) || feet.length !== 2) throw new TypeError('Two explicit grounded contact feet are required for the generation support envelope.');
  feet.forEach(foot => point(foot, 'Contact foot'));
  const stance = { x: (feet[0].x + feet[1].x) / 2, y: (feet[0].y + feet[1].y) / 2 };
  const actualHorizontalFeet = Math.hypot(contact.x - stance.x, contact.y - stance.y);
  const supported = maximumHorizontalFeet !== null && actualHorizontalFeet <= maximumHorizontalFeet + EPS;
  return Object.freeze({
    supported, version: GENERATED_CONTACT_SUPPORT_V1.version, profileVersion: BODY.version,
    necessaryOnly: true, actualHorizontalFeet, maximumHorizontalFeet,
    contactHeightFeet: contact.heightFeet, maximumContactHeightFeet: GENERATED_CONTACT_SUPPORT_V1.maximumContactHeightFeet,
    reason: supported ? null : 'unsupported-grounded-pose',
  });
}

/** Independent final audit of actual serialized-source contact evidence. */
export function inspectGeneratedContactSupportV1(timeline) {
  if (!Array.isArray(timeline?.segments)) throw new TypeError('A compiled model2 timeline is required for generation support inspection.');
  const violations = [];
  let checkedContacts = 0;
  for (const segment of timeline.segments) {
    if (segment?.modelVersion !== 2) throw new TypeError('Generation support inspection requires model2 contact geometry.');
    if (!segment.shotSemantics) continue;
    const contact = segment.shotSemantics.contact;
    const assessment = assessGeneratedContactSupportV1({ contact: contact.point, feet: contact.feet });
    checkedContacts++;
    if (!assessment.supported) violations.push(Object.freeze({
      shotId: segment.step.id, actor: segment.shotSemantics.playerId, ...assessment,
    }));
  }
  return Object.freeze({ valid: violations.length === 0, version: GENERATED_CONTACT_SUPPORT_V1.version,
    profileVersion: BODY.version, necessaryOnly: true, checkedContacts, violations: Object.freeze(violations) });
}
