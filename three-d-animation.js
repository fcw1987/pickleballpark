// Renderer-independent authored poses for the procedural Pickleboard rig.

const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
const channel = (rotation = vec(), position = null) => ({ rotation, position });

export const ANIMATION_QUALITY_LIMITS = Object.freeze({
    contactHipPitch: 0.3,
    contactTorsoPitch: 0.38,
    kneeOffsetMin: 0,
    kneeOffsetMax: 0.36,
    hipVerticalMin: -0.08,
    hipVerticalMax: 0.04,
    paddleContactDistanceMeters: 0.08,
    postContactContinuityMeters: 0.12
});

export const REQUIRED_POSES = Object.freeze([
    'ready', 'split-step', 'serve-prepare', 'serve-contact', 'serve-follow',
    'forehand-prepare', 'forehand-contact', 'forehand-follow',
    'backhand-prepare', 'backhand-contact', 'backhand-follow',
    'drive-prepare', 'drive-contact', 'drive-follow',
    'drop-contact', 'drop-follow',
    'block-prepare', 'block-contact', 'block-follow',
    'lob-prepare', 'lob-contact', 'lob-follow',
    'overhead-prepare', 'overhead-contact', 'overhead-follow'
]);

export const POSE_LIBRARY = Object.freeze({
    ready: {
        Hips: channel(vec(-0.025, 0, 0), vec(0, -0.012, 0)),
        Torso: channel(vec(-0.025, 0, 0)),
        dominantArm: channel(vec(0.06, 0, -0.13)), dominantElbow: channel(vec(-0.18, 0, 0.05)),
        nonDominantArm: channel(vec(0.045, 0, 0.13)), nonDominantElbow: channel(vec(-0.16, 0, -0.04)),
        LeftLeg: channel(vec(0, 0, 0.1)), RightLeg: channel(vec(0, 0, -0.1)),
        LeftKnee: channel(vec(0.16, 0, 0)), RightKnee: channel(vec(0.16, 0, 0)),
        LeftFoot: channel(vec(-0.04, 0.08, 0)), RightFoot: channel(vec(-0.04, -0.08, 0)),
        PaddleAttachment: channel(vec(0.02, 0, 0))
    },
    'split-step': {
        Hips: channel(vec(-0.06, 0, 0), vec(0, -0.055, 0)), Torso: channel(vec(-0.055, 0, 0)),
        LeftLeg: channel(vec(0, 0, 0.18)), RightLeg: channel(vec(0, 0, -0.18)),
        LeftKnee: channel(vec(0.3, 0, 0)), RightKnee: channel(vec(0.3, 0, 0)),
        LeftFoot: channel(vec(-0.02, 0.14, 0)), RightFoot: channel(vec(-0.02, -0.14, 0)),
        dominantArm: channel(vec(0.03, 0, -0.12)), dominantElbow: channel(vec(-0.2, 0, 0.04)),
        nonDominantArm: channel(vec(0.02, 0, 0.12)), nonDominantElbow: channel(vec(-0.16, 0, -0.03))
    },
    'serve-prepare': {
        Hips: channel(vec(-0.04, 0.16, 0)), Torso: channel(vec(-0.045, 0.28, 0.03)),
        dominantArm: channel(vec(0.02, 0.1, -0.52)), dominantElbow: channel(vec(-0.32, 0, 0.12)),
        nonDominantArm: channel(vec(-0.1, 0, 0.36)), nonDominantElbow: channel(vec(-0.18, 0, -0.1)),
        dominantKnee: channel(vec(0.26, 0, 0)), nonDominantKnee: channel(vec(0.14, 0, 0)),
        dominantFoot: channel(vec(-0.03, 0.1, 0)), nonDominantFoot: channel(vec(-0.02, -0.04, 0)),
        PaddleAttachment: channel(vec(-0.08, 0, 0.06))
    },
    'serve-contact': {
        Hips: channel(vec(-0.045, -0.18, 0), vec(0, -0.015, -0.015)), Torso: channel(vec(-0.06, -0.25, -0.02)),
        dominantArm: channel(vec(0.24, -0.08, -0.3)), dominantElbow: channel(vec(-0.12, 0, 0.02)),
        nonDominantArm: channel(vec(-0.06, 0, 0.18)), nonDominantElbow: channel(vec(-0.14, 0, -0.03)),
        dominantKnee: channel(vec(0.18, 0, 0)), nonDominantKnee: channel(vec(0.1, 0, 0)),
        dominantFoot: channel(vec(-0.02, 0.06, 0)), nonDominantFoot: channel(vec(-0.02, -0.03, 0)),
        PaddleAttachment: channel(vec(-0.1, 0, 0.08))
    },
    'serve-follow': {
        Hips: channel(vec(-0.035, -0.24, 0)), Torso: channel(vec(-0.045, -0.32, -0.04)),
        dominantArm: channel(vec(0.3, -0.16, -0.16)), dominantElbow: channel(vec(-0.2, 0, 0.08)),
        nonDominantArm: channel(vec(-0.04, 0, 0.12)),
        dominantKnee: channel(vec(0.12, 0, 0)), nonDominantKnee: channel(vec(0.08, 0, 0)),
        PaddleAttachment: channel(vec(-0.04, -0.02, 0.06))
    },
    'forehand-prepare': {
        Hips: channel(vec(-0.035, 0.28, 0), vec(0, -0.025, -0.045)), Torso: channel(vec(-0.045, 0.52, 0.02)),
        dominantArm: channel(vec(-0.1, 0.08, -0.62)), dominantElbow: channel(vec(-0.4, 0, 0.12)),
        nonDominantArm: channel(vec(-0.12, 0, 0.28)), nonDominantElbow: channel(vec(-0.18, 0, -0.06)),
        dominantKnee: channel(vec(0.24, 0, 0)), nonDominantKnee: channel(vec(0.1, 0, 0)),
        dominantFoot: channel(vec(-0.03, 0.12, 0)), nonDominantFoot: channel(vec(-0.02, -0.06, 0)),
        PaddleAttachment: channel(vec(-0.02, 0.04, -0.06))
    },
    'forehand-contact': {
        Hips: channel(vec(-0.045, -0.16, 0), vec(0, -0.015, 0)), Torso: channel(vec(-0.055, -0.24, 0)),
        dominantArm: channel(vec(0.2, -0.1, -0.12)), dominantElbow: channel(vec(-0.16, 0, 0.04)),
        nonDominantArm: channel(vec(-0.04, 0, 0.16)), nonDominantElbow: channel(vec(-0.14, 0, -0.03)),
        dominantKnee: channel(vec(0.14, 0, 0)), nonDominantKnee: channel(vec(0.06, 0, 0)),
        dominantFoot: channel(vec(-0.02, 0.08, 0)), nonDominantFoot: channel(vec(-0.02, -0.04, 0)),
        PaddleAttachment: channel(vec(0, 0.04, -0.08))
    },
    'forehand-follow': {
        Hips: channel(vec(-0.035, -0.24, 0)), Torso: channel(vec(-0.035, -0.34, -0.03)),
        dominantArm: channel(vec(0.28, -0.18, 0.24)), dominantElbow: channel(vec(-0.26, 0, 0.08)),
        nonDominantArm: channel(vec(-0.02, 0, 0.08)),
        dominantKnee: channel(vec(0.1, 0, 0)), nonDominantKnee: channel(vec(0.05, 0, 0)),
        PaddleAttachment: channel(vec(0.02, 0.02, -0.04))
    },
    'drive-prepare': {
        Hips: channel(vec(-0.03, 0.30, 0), vec(0, -0.028, -0.05)), Torso: channel(vec(-0.04, 0.58, 0)),
        dominantArm: channel(vec(-0.04, 0.04, -0.48)), dominantElbow: channel(vec(-0.3, 0, 0.08)),
        nonDominantArm: channel(vec(-0.08, 0, 0.22)), nonDominantElbow: channel(vec(-0.16, 0, -0.04)),
        dominantKnee: channel(vec(0.2, 0, 0)), nonDominantKnee: channel(vec(0.08, 0, 0)),
        PaddleAttachment: channel(vec(-0.02, 0.03, -0.05))
    },
    'drive-contact': {
        Hips: channel(vec(-0.04, -0.10, 0), vec(0, -0.012, 0.025)), Torso: channel(vec(-0.055, -0.18, -0.02)),
        dominantArm: channel(vec(0.24, -0.08, -0.08)), dominantElbow: channel(vec(-0.12, 0, 0.03)),
        nonDominantArm: channel(vec(-0.03, 0, 0.14)), nonDominantElbow: channel(vec(-0.12, 0, -0.03)),
        dominantKnee: channel(vec(0.12, 0, 0)), nonDominantKnee: channel(vec(0.05, 0, 0)),
        PaddleAttachment: channel(vec(0, 0.03, -0.09))
    },
    'drive-follow': {
        Hips: channel(vec(-0.03, -0.25, 0), vec(0, -0.005, 0.06)), Torso: channel(vec(-0.035, -0.48, -0.02)),
        dominantArm: channel(vec(0.26, -0.12, 0.14)), dominantElbow: channel(vec(-0.2, 0, 0.06)),
        nonDominantArm: channel(vec(-0.02, 0, 0.08)),
        dominantKnee: channel(vec(0.08, 0, 0)), nonDominantKnee: channel(vec(0.04, 0, 0)),
        PaddleAttachment: channel(vec(0.01, 0.02, -0.05))
    },
    'backhand-prepare': {
        Hips: channel(vec(-0.035, -0.28, 0), vec(0, -0.025, -0.045)), Torso: channel(vec(-0.045, -0.52, 0)),
        dominantArm: channel(vec(-0.08, -0.05, 0.58)), dominantElbow: channel(vec(-0.34, 0, -0.08)),
        nonDominantArm: channel(vec(-0.08, 0, -0.3)), nonDominantElbow: channel(vec(-0.18, 0, 0.06)),
        dominantKnee: channel(vec(0.18, 0, 0)), nonDominantKnee: channel(vec(0.08, 0, 0)),
        PaddleAttachment: channel(vec(0.02, -0.03, 0.1))
    },
    'backhand-contact': {
        Hips: channel(vec(-0.045, 0.16, 0), vec(0, -0.015, 0)), Torso: channel(vec(-0.055, 0.28, 0)),
        dominantArm: channel(vec(0.18, 0.1, 0.1)), dominantElbow: channel(vec(-0.12, 0, 0)),
        nonDominantArm: channel(vec(-0.02, 0, -0.16)), nonDominantElbow: channel(vec(-0.12, 0, 0.04)),
        dominantKnee: channel(vec(0.12, 0, 0)), nonDominantKnee: channel(vec(0.05, 0, 0)),
        PaddleAttachment: channel(vec(0.02, -0.03, 0.1))
    },
    'backhand-follow': {
        Hips: channel(vec(-0.035, 0.24, 0)), Torso: channel(vec(-0.04, 0.36, 0)),
        dominantArm: channel(vec(0.26, 0.18, -0.18)), dominantElbow: channel(vec(-0.24, 0, -0.05)),
        nonDominantArm: channel(vec(0.02, 0, -0.1)), nonDominantElbow: channel(vec(-0.1, 0, 0.02)),
        dominantKnee: channel(vec(0.08, 0, 0)), nonDominantKnee: channel(vec(0.04, 0, 0)),
        PaddleAttachment: channel(vec(0.02, -0.02, 0.06))
    },
    'drop-contact': {
        Hips: channel(vec(-0.075, -0.08, 0), vec(0, -0.06, 0)), Torso: channel(vec(-0.11, -0.06, 0)),
        dominantArm: channel(vec(0.12, -0.03, -0.14)), dominantElbow: channel(vec(-0.4, 0, 0.02)),
        nonDominantArm: channel(vec(-0.1, 0, 0.22)), nonDominantElbow: channel(vec(-0.16, 0, -0.06)),
        dominantKnee: channel(vec(0.34, 0, 0)), nonDominantKnee: channel(vec(0.3, 0, 0)),
        LeftFoot: channel(vec(-0.04, 0.08, 0)), RightFoot: channel(vec(-0.04, -0.08, 0)),
        PaddleAttachment: channel(vec(0.08, 0, 0.12))
    },
    'drop-follow': {
        Hips: channel(vec(-0.06, -0.1, 0), vec(0, -0.04, 0)), Torso: channel(vec(-0.08, -0.1, 0)),
        dominantArm: channel(vec(0.16, -0.05, 0.02)), dominantElbow: channel(vec(-0.32, 0, 0.03)),
        dominantKnee: channel(vec(0.24, 0, 0)), nonDominantKnee: channel(vec(0.22, 0, 0)),
        PaddleAttachment: channel(vec(0.06, 0, 0.09))
    },
    // A lob loads through the knees and shoulder, then lifts with a quiet wrist.
    // The paddle path and face opening are sampled separately by the physical rig.
    'lob-prepare': {
        Hips: channel(vec(-0.06, 0.18, 0), vec(0, -0.07, -0.045)),
        Torso: channel(vec(-0.075, 0.30, 0)),
        dominantKnee: channel(vec(0.32, 0, 0)), nonDominantKnee: channel(vec(0.27, 0, 0)),
        dominantElbow: channel(vec(-0.28, 0, 0)), PaddleAttachment: channel(vec(0.48, 0, 0))
    },
    'lob-contact': {
        Hips: channel(vec(-0.045, -0.06, 0), vec(0, -0.045, 0.025)),
        Torso: channel(vec(-0.055, -0.10, 0)),
        dominantKnee: channel(vec(0.24, 0, 0)), nonDominantKnee: channel(vec(0.20, 0, 0)),
        dominantElbow: channel(vec(-0.20, 0, 0)), PaddleAttachment: channel(vec(0.48, 0, 0))
    },
    'lob-follow': {
        Hips: channel(vec(-0.025, -0.12, 0), vec(0, -0.01, 0.055)),
        Torso: channel(vec(-0.025, -0.18, 0)),
        dominantKnee: channel(vec(0.12, 0, 0)), nonDominantKnee: channel(vec(0.10, 0, 0)),
        dominantElbow: channel(vec(-0.16, 0, 0)), PaddleAttachment: channel(vec(0.42, 0, 0))
    },
    'overhead-prepare': {
        Hips: channel(vec(-0.025, 0.27, 0)), Torso: channel(vec(0.035, 0.45, 0)),
        dominantElbow: channel(vec(-0.6, 0, 0)), nonDominantArm: channel(vec(0.5, 0, 0))
    },
    'overhead-contact': {
        Hips: channel(vec(-0.03, -0.10, 0)), Torso: channel(vec(-0.06, -0.20, 0)),
        dominantElbow: channel(vec(-0.10, 0, 0))
    },
    'overhead-follow': {
        Hips: channel(vec(-0.035, -0.18, 0)), Torso: channel(vec(-0.08, -0.30, 0)),
        dominantElbow: channel(vec(-0.32, 0, 0))
    },
    'block-prepare': {
        Hips: channel(vec(-0.035, 0, 0), vec(0, -0.025, 0)), Torso: channel(vec(-0.04, 0, 0)),
        dominantArm: channel(vec(0.04, -0.01, -0.08)), dominantElbow: channel(vec(-0.28, 0, 0)),
        nonDominantArm: channel(vec(0.03, 0, 0.1)), nonDominantElbow: channel(vec(-0.18, 0, -0.03)),
        LeftKnee: channel(vec(0.2, 0, 0)), RightKnee: channel(vec(0.2, 0, 0)),
        PaddleAttachment: channel(vec(0.02, 0, 0.02))
    },
    'block-contact': {
        Hips: channel(vec(-0.04, 0, 0), vec(0, -0.035, 0)), Torso: channel(vec(-0.045, 0, 0)),
        dominantArm: channel(vec(0.1, -0.02, -0.1)), dominantElbow: channel(vec(-0.34, 0, 0)),
        nonDominantArm: channel(vec(0.04, 0, 0.12)), nonDominantElbow: channel(vec(-0.2, 0, -0.04)),
        LeftKnee: channel(vec(0.24, 0, 0)), RightKnee: channel(vec(0.24, 0, 0)),
        PaddleAttachment: channel(vec(0.04, 0, 0.02))
    },
    'block-follow': {
        Hips: channel(vec(-0.035, 0, 0), vec(0, -0.022, 0)), Torso: channel(vec(-0.035, 0, 0)),
        dominantArm: channel(vec(0.12, -0.03, -0.04)), dominantElbow: channel(vec(-0.28, 0, 0)),
        LeftKnee: channel(vec(0.18, 0, 0)), RightKnee: channel(vec(0.18, 0, 0)),
        PaddleAttachment: channel(vec(0.03, 0, 0.01))
    }
});

export function dominantAliases(handedness) {
    const right = handedness === 'right';
    return {
        dominantArm: right ? 'RightArm' : 'LeftArm', dominantElbow: right ? 'RightElbow' : 'LeftElbow',
        dominantHand: right ? 'RightHand' : 'LeftHand', dominantKnee: right ? 'RightKnee' : 'LeftKnee',
        dominantFoot: right ? 'RightFoot' : 'LeftFoot',
        nonDominantArm: right ? 'LeftArm' : 'RightArm', nonDominantElbow: right ? 'LeftElbow' : 'RightElbow',
        nonDominantHand: right ? 'LeftHand' : 'RightHand', nonDominantKnee: right ? 'LeftKnee' : 'RightKnee',
        nonDominantFoot: right ? 'LeftFoot' : 'RightFoot'
    };
}

const strokePoseNames = stroke => {
    if (stroke === 'serve') return ['serve-prepare', 'serve-contact', 'serve-follow'];
    if (stroke === 'lob') return ['lob-prepare', 'lob-contact', 'lob-follow'];
    if (stroke === 'overhead') return ['overhead-prepare', 'overhead-contact', 'overhead-follow'];
    if (stroke === 'backhand') return ['backhand-prepare', 'backhand-contact', 'backhand-follow'];
    if (stroke === 'drive') return ['drive-prepare', 'drive-contact', 'drive-follow'];
    if (stroke === 'drop') return ['forehand-prepare', 'drop-contact', 'drop-follow'];
    if (stroke === 'block') return ['block-prepare', 'block-contact', 'block-follow',
    'lob-prepare', 'lob-contact', 'lob-follow',
    'overhead-prepare', 'overhead-contact', 'overhead-follow'];
    return ['forehand-prepare', 'forehand-contact', 'forehand-follow'];
};

export function sampleStrokePose(stroke, profile, localTime) {
    const [prepare, contact, follow] = strokePoseNames(stroke);
    const normalized = Math.max(0, Math.min(1, localTime / profile.duration));
    const epsilon = 1e-9;
    if (normalized <= profile.prepareRatio + epsilon) return { from: 'ready', to: prepare, progress: normalized / profile.prepareRatio, phase: 'prepare' };
    if (normalized <= profile.contactRatio + epsilon) return { from: prepare, to: contact, progress: (normalized - profile.prepareRatio) / (profile.contactRatio - profile.prepareRatio), phase: 'contact' };
    if (normalized <= profile.recoverRatio + epsilon) return { from: contact, to: follow, progress: (normalized - profile.contactRatio) / (profile.recoverRatio - profile.contactRatio), phase: 'follow-through' };
    return { from: follow, to: 'ready', progress: (normalized - profile.recoverRatio) / (1 - profile.recoverRatio), phase: 'recover' };
}

export function captureRigRest(nodes) {
    return Object.fromEntries(Object.entries(nodes).map(([name, node]) => [name, {
        position: { x: node.position.x, y: node.position.y, z: node.position.z },
        rotation: { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z }
    }]));
}
