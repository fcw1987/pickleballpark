// Stable adult-model geometry, in metres. This is an instructional athlete
// profile, not a universal human measurement or a guarantee of a feasible pose.
export const HUMAN_ATHLETE_PROFILE_V1 = Object.freeze({
  version: 'human-athlete-profile-v1',
  units: 'metres',
  hipHalfWidth: .105,
  shoulderHalfWidth: .22,
  hipHeight: .95,
  shoulderHeight: 1.49,
  shoulderForward: .055,
  ankleHeight: .10,
  thighLength: .45,
  shinLength: .43,
  upperArmLength: .33,
  forearmLength: .29,
  maximumHipHorizontalOffset: .24,
  maximumHipHeight: .985,
  maximumForwardHingeRadians: .65,
  maximumBackwardHingeRadians: .18,
  // Rounded outward from the supported grip-to-face/wrist geometry's .242648m.
  wristToPaddleFaceDistance: .243,
});
