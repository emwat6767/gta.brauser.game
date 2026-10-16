//# sourceURL=ufc/downed.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;
const V3 = THREE.Vector3, Q = THREE.Quaternion, E = THREE.Euler;

// ---------------------------------------------------------------------------
// Knockdown (conscious) vs knockout.
//   fall      active ragdoll: arms brace, head held off the canvas
//   grounded  propped on an elbow, guarding, turning/scooting to face the threat
//   rising    sit up -> post a hand -> one knee -> stand -> stance
// A KO keeps the limp ragdoll.
// Pose values: bone Euler XYZ (order YXZ) in radians, hips height in body heights.
// ---------------------------------------------------------------------------
const POSES = {
  grounded: {
    hipsY: 0.1, hips: [-1.2, 0, 0.08], spine: [0.35, 0, 0], chest: [0.3, 0, 0], neck: [0.3, 0, 0], head: [0.2, 0, 0],
    uaL: [0.85, 0, 0.35], faL: [-1.45, 0, 0], uaR: [-1.9, 0, -0.35], faR: [-2.1, 0, 0],
    thL: [-0.45, 0, 0.14], snL: [1.05, 0, 0], thR: [-0.7, 0, -0.12], snR: [1.25, 0, 0], ftL: [0.3, 0, 0], ftR: [0.35, 0, 0],
  },
  covering: { // under ground strikes: both hands up, chin tucked
    hipsY: 0.09, hips: [-1.3, 0, 0.05], spine: [0.45, 0, 0], chest: [0.4, 0, 0], neck: [0.45, 0, 0], head: [0.25, 0, 0],
    uaL: [-1.75, 0, 0.3], faL: [-2.2, 0, 0], uaR: [-1.75, 0, -0.3], faR: [-2.2, 0, 0],
    thL: [-1.05, 0, 0.2], snL: [1.6, 0, 0], thR: [-1.15, 0, -0.2], snR: [1.3, 0, 0], ftL: [0.3, 0, 0], ftR: [0.3, 0, 0],
  },
  situp: {
    hipsY: 0.1, hips: [-0.55, 0, 0.05], spine: [0.35, 0, 0], chest: [0.25, 0, 0], neck: [0.15, 0, 0], head: [0.1, 0, 0],
    uaL: [0.6, 0, 0.5], faL: [-0.25, 0, 0], uaR: [-1.4, 0, -0.3], faR: [-2.0, 0, 0],
    thL: [-1.45, 0, 0.35], snL: [2.4, 0, 0], thR: [-1.0, 0, -0.1], snR: [0.8, 0, 0], ftL: [0.2, 0, 0], ftR: [0.2, 0, 0],
  },
  post: {
    hipsY: 0.21, hips: [0.45, 0.95, 0.15], spine: [0.35, 0, 0], chest: [0.25, 0, 0], neck: [-0.25, 0, 0], head: [-0.15, 0, 0],
    uaL: [-0.35, 0, 0.15], faL: [-0.1, 0, 0], uaR: [-1.5, 0, -0.3], faR: [-2.0, 0, 0],
    thL: [0.15, 0, 0.05], snL: [2.3, 0, 0], thR: [-1.45, 0, -0.2], snR: [1.5, 0, 0], ftL: [0.6, 0, 0], ftR: [0, 0, 0],
  },
  kneel: {
    hipsY: 0.29, hips: [0.15, 0.45, 0.05], spine: [0.15, 0, 0], chest: [0.1, 0, 0], neck: [-0.1, 0, 0], head: [0, 0, 0],
    uaL: [-1.25, 0, 0.35], faL: [-2.1, 0, 0], uaR: [-1.25, 0, -0.35], faR: [-2.1, 0, 0],
    thL: [0.02, 0, 0.04], snL: [1.52, 0, 0], thR: [-1.45, 0, 0], snR: [1.55, 0, 0], ftL: [0.9, 0, 0], ftR: [0, 0, 0],
  },
  rise: {
    hipsY: 0.45, hips: [0.1, 0.25, 0], spine: [0.12, 0, 0], chest: [0.1, 0, 0], neck: [-0.05, 0, 0], head: [0, 0, 0],
    uaL: [-1.25, 0, 0.35], faL: [-2.1, 0, 0], uaR: [-1.25, 0, -0.35], faR: [-2.1, 0, 0],
    thL: [-0.25, 0, 0.05], snL: [0.75, 0, 0], thR: [-0.8, 0, -0.05], snR: [0.95, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0],
  },
};
// ---- fall reactions: controlled keyframes instead of a limp ragdoll -------
// Conscious knockdowns
Object.assign(POSES, {
  staggerBack: { // head snapped back, weight thrown onto the back foot
    hipsY: 0.5, hips: [-0.14, 0, 0], spine: [-0.14, 0, 0], chest: [-0.1, 0, 0], neck: [-0.3, 0, 0], head: [-0.35, 0, 0],
    uaL: [-0.45, 0, 0.55], faL: [-0.7, 0, 0], uaR: [-0.3, 0, -0.65], faR: [-0.55, 0, 0],
    thL: [-0.3, 0, 0.06], snL: [0.35, 0, 0], thR: [0.28, 0, -0.06], snR: [0.3, 0, 0], ftL: [0, 0, 0], ftR: [0.1, 0, 0],
  },
  staggerDeep: { // legs going, arms reaching for balance
    hipsY: 0.41, hips: [-0.26, 0, 0.04], spine: [-0.05, 0, 0], chest: [-0.05, 0, 0], neck: [-0.15, 0, 0], head: [-0.2, 0, 0],
    uaL: [-0.15, 0, 0.9], faL: [-0.35, 0, 0], uaR: [0.1, 0, -0.95], faR: [-0.25, 0, 0],
    thL: [-0.65, 0, 0.1], snL: [1.0, 0, 0], thR: [0.05, 0, -0.1], snR: [0.95, 0, 0], ftL: [0.2, 0, 0], ftR: [0.4, 0, 0],
  },
  sitBack: { // landed on his backside, posting on both hands behind
    hipsY: 0.1, hips: [-0.38, 0, 0], spine: [0.12, 0, 0], chest: [0.1, 0, 0], neck: [0.15, 0, 0], head: [0.1, 0, 0],
    uaL: [0.75, 0, 0.45], faL: [-0.2, 0, 0], uaR: [0.75, 0, -0.45], faR: [-0.2, 0, 0],
    thL: [-1.25, 0, 0.2], snL: [1.15, 0, 0], thR: [-1.05, 0, -0.15], snR: [0.8, 0, 0], ftL: [0.2, 0, 0], ftR: [0.2, 0, 0],
  },
  buckle: { // legs give out under him, chin drops
    hipsY: 0.36, hips: [0.28, 0.08, 0.04], spine: [0.2, 0, 0], chest: [0.15, 0, 0], neck: [0.3, 0, 0], head: [0.25, 0, 0],
    uaL: [0.1, 0, 0.3], faL: [-0.35, 0, 0], uaR: [0.05, 0, -0.3], faR: [-0.35, 0, 0],
    thL: [-0.95, 0, 0.12], snL: [1.65, 0, 0], thR: [-0.7, 0, -0.1], snR: [1.45, 0, 0], ftL: [0.4, 0, 0], ftR: [0.4, 0, 0],
  },
  kneelPost: { // down on one knee, one glove on the canvas
    hipsY: 0.28, hips: [0.3, 0.35, 0.05], spine: [0.25, 0, 0], chest: [0.15, 0, 0], neck: [0.25, 0, 0], head: [0.1, 0, 0],
    uaL: [-1.2, 0, 0.35], faL: [-2.0, 0, 0], uaR: [0.2, 0, -0.25], faR: [-0.05, 0, 0],
    thL: [0.02, 0, 0.04], snL: [1.52, 0, 0], thR: [-1.45, 0, 0], snR: [1.55, 0, 0], ftL: [0.9, 0, 0], ftR: [0, 0, 0],
  },
  tiltSide: { // loses balance sideways, arm flung out
    hipsY: 0.47, hips: [0, 0, 0.22], spine: [0, 0, 0.12], chest: [0, 0, 0.05], neck: [0, 0, -0.2], head: [-0.1, 0, -0.25],
    uaL: [-0.25, 0, 1.05], faL: [-0.45, 0, 0], uaR: [-0.35, 0, -0.35], faR: [-0.8, 0, 0],
    thL: [-0.25, 0, 0.3], snL: [0.45, 0, 0], thR: [0.1, 0, -0.08], snR: [0.35, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0],
  },
  hipDown: { // going down on the hip, left hand catching the fall
    hipsY: 0.14, hips: [-0.35, 0.2, 0.75], spine: [0.1, 0, 0.25], chest: [0.05, 0, 0.1], neck: [0.2, 0, -0.35], head: [0.1, 0, -0.2],
    uaL: [0.1, 0, 1.15], faL: [-0.2, 0, 0], uaR: [-0.9, 0, -0.05], faR: [-2.15, 0, 0],
    thL: [-1.05, 0, 0.2], snL: [1.45, 0, 0], thR: [-0.7, 0, -0.1], snR: [1.1, 0, 0], ftL: [0.3, 0, 0], ftR: [0.3, 0, 0],
  },
  fallBack: { // mid fall backwards, chin tucked, arms reaching back
    hipsY: 0.26, hips: [-0.75, 0, 0], spine: [-0.05, 0, 0], chest: [-0.05, 0, 0], neck: [0.3, 0, 0], head: [0.3, 0, 0],
    uaL: [0.95, 0, 0.5], faL: [-0.25, 0, 0], uaR: [0.95, 0, -0.5], faR: [-0.25, 0, 0],
    thL: [-1.0, 0, 0.1], snL: [0.8, 0, 0], thR: [-0.8, 0, -0.1], snR: [0.6, 0, 0], ftL: [0.2, 0, 0], ftR: [0.2, 0, 0],
  },
  handDown: { // flash knockdown: glove touches the canvas, eyes up
    hipsY: 0.34, hips: [0.38, 0.2, 0], spine: [0.25, 0, 0], chest: [0.2, 0, 0], neck: [-0.1, 0, 0], head: [-0.15, 0, 0],
    uaL: [-1.2, 0, 0.35], faL: [-2.0, 0, 0], uaR: [0.35, 0, -0.35], faR: [-0.05, 0, 0],
    thL: [-1.0, 0, 0.15], snL: [1.75, 0, 0], thR: [-0.45, 0, -0.1], snR: [1.45, 0, 0], ftL: [0.4, 0, 0], ftR: [0.6, 0, 0],
  },
  // ---- knockouts: the fighter is out, the body falls under control and stays down
  koHeadBack: { // stiff: head whipped back, arms lock up
    hipsY: 0.5, hips: [-0.2, 0, 0], spine: [-0.1, 0, 0], chest: [-0.1, 0, 0], neck: [-0.45, 0, 0], head: [-0.4, 0, 0],
    uaL: [-1.1, 0, 0.3], faL: [-0.35, 0, 0], uaR: [-0.9, 0, -0.35], faR: [-0.5, 0, 0],
    thL: [-0.15, 0, 0.05], snL: [0.15, 0, 0], thR: [0.1, 0, -0.05], snR: [0.1, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0],
  },
  koTimber: { // falling straight back like a cut tree
    hipsY: 0.34, hips: [-0.95, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [-0.25, 0, 0], head: [-0.2, 0, 0],
    uaL: [-1.35, 0, 0.35], faL: [-0.25, 0, 0], uaR: [-1.0, 0, -0.45], faR: [-0.35, 0, 0],
    thL: [0.55, 0, 0.05], snL: [0.25, 0, 0], thR: [0.45, 0, -0.05], snR: [0.3, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0],
  },
  koOnBack: { // flat on the back, one arm still up, head turned
    hipsY: 0.065, hips: [-1.52, 0, 0], spine: [0, 0, 0], chest: [0.02, 0, 0], neck: [0.05, 0.35, 0], head: [0.05, 0.45, 0],
    uaL: [-1.45, 0, 0.25], faL: [-0.55, 0, 0], uaR: [0.05, 0, -1.1], faR: [-0.35, 0, 0],
    thL: [-0.25, 0, 0.12], snL: [0.45, 0, 0], thR: [0.02, 0, -0.1], snR: [0.1, 0, 0], ftL: [0.6, 0, 0], ftR: [0.8, 0, 0],
  },
  koKnees: { // knees hit the canvas, torso slumping forward
    hipsY: 0.27, hips: [0.35, 0, 0], spine: [0.3, 0, 0], chest: [0.25, 0, 0], neck: [0.35, 0, 0], head: [0.35, 0, 0],
    uaL: [0.15, 0, 0.2], faL: [-0.3, 0, 0], uaR: [0.1, 0, -0.2], faR: [-0.3, 0, 0],
    thL: [0.05, 0, 0.1], snL: [1.55, 0, 0], thR: [0.05, 0, -0.1], snR: [1.55, 0, 0], ftL: [1.0, 0, 0], ftR: [1.0, 0, 0],
  },
  koFaceDown: { // face first onto the canvas, head turned
    hipsY: 0.075, hips: [1.45, 0, 0], spine: [0.05, 0, 0], chest: [0.05, 0, 0], neck: [-0.2, 0.9, 0], head: [-0.15, 0.4, 0],
    uaL: [0.15, 0, 0.55], faL: [-0.4, 0, 0], uaR: [-0.25, 0, -0.35], faR: [-0.9, 0, 0],
    thL: [0.02, 0, 0.12], snL: [0.3, 0, 0], thR: [-0.35, 0, -0.1], snR: [0.8, 0, 0], ftL: [1.1, 0, 0], ftR: [1.0, 0, 0],
  },
  koTwist: { // hook: head and shoulders spun, legs crossing
    hipsY: 0.44, hips: [0.05, 0.55, 0.18], spine: [0, 0.3, 0.12], chest: [0, 0.2, 0.05], neck: [0, 0.5, 0.3], head: [-0.2, 0.45, 0.3],
    uaL: [0.2, 0, 0.7], faL: [-0.4, 0, 0], uaR: [0.3, 0, -0.35], faR: [-0.4, 0, 0],
    thL: [-0.5, 0, 0.25], snL: [0.9, 0, 0], thR: [-0.1, 0, 0.1], snR: [0.7, 0, 0], ftL: [0.2, 0, 0], ftR: [0.2, 0, 0],
  },
  koOnSide: { // on his side, limp
    hipsY: 0.11, hips: [0, 0.15, 1.42], spine: [0.1, 0, 0.05], chest: [0.05, 0, 0], neck: [0.1, 0, 0.2], head: [0.05, 0, 0.3],
    uaL: [-0.9, 0, 0.1], faL: [-0.7, 0, 0], uaR: [-0.3, 0, -0.1], faR: [-0.3, 0, 0],
    thL: [-0.75, 0, 0], snL: [1.05, 0, 0], thR: [-0.4, 0, 0], snR: [0.55, 0, 0], ftL: [0.4, 0, 0], ftR: [0.4, 0, 0],
  },
  koDoubleOver: { // body shot: folds around the liver
    hipsY: 0.4, hips: [0.55, 0, 0], spine: [0.45, 0, 0], chest: [0.3, 0, 0], neck: [0.15, 0, 0], head: [0.05, 0, 0],
    uaL: [-0.45, 0, -0.1], faL: [-1.9, 0, 0], uaR: [-0.45, 0, 0.1], faR: [-1.9, 0, 0],
    thL: [-0.75, 0, 0.1], snL: [1.15, 0, 0], thR: [-0.55, 0, -0.1], snR: [0.95, 0, 0], ftL: [0.3, 0, 0], ftR: [0.3, 0, 0],
  },
  koCurled: { // curled up on the side holding the body
    hipsY: 0.11, hips: [0.3, 0.1, 1.42], spine: [0.4, 0, 0], chest: [0.3, 0, 0], neck: [0.25, 0, 0], head: [0.2, 0, 0],
    uaL: [-0.55, 0, -0.2], faL: [-2.0, 0, 0], uaR: [-0.55, 0, 0.2], faR: [-2.0, 0, 0],
    thL: [-1.3, 0, 0], snL: [1.6, 0, 0], thR: [-1.1, 0, 0], snR: [1.4, 0, 0], ftL: [0.3, 0, 0], ftR: [0.3, 0, 0],
  },
  koTryRise: { // on the back, tries to sit up, then fades
    hipsY: 0.1, hips: [-1.0, 0, 0], spine: [0.3, 0, 0], chest: [0.2, 0, 0], neck: [0.3, 0, 0], head: [0.15, 0.2, 0],
    uaL: [0.6, 0, 0.55], faL: [-0.4, 0, 0], uaR: [-0.3, 0, -0.5], faR: [-1.2, 0, 0],
    thL: [-0.85, 0, 0.15], snL: [1.25, 0, 0], thR: [-0.4, 0, -0.1], snR: [0.6, 0, 0], ftL: [0.3, 0, 0], ftR: [0.3, 0, 0],
  },
});
// ---- how a conscious fighter lies on the canvas (and covers up under ground strikes)
Object.assign(POSES, {
  downSide: { // on his side, knees drawn up, top arm guarding
    hipsY: 0.11, hips: [0.05, 0.1, 1.35], spine: [0.25, 0, 0], chest: [0.15, 0, 0], neck: [0.15, 0, 0.3], head: [0.1, 0, 0.3],
    uaL: [-1.3, 0, 0.2], faL: [-2.0, 0, 0], uaR: [-1.0, 0, -0.55], faR: [-1.5, 0, 0],
    thL: [-1.15, 0, 0], snL: [1.55, 0, 0], thR: [-0.85, 0, 0], snR: [1.35, 0, 0], ftL: [0.3, 0, 0], ftR: [0.3, 0, 0],
  },
  downSideCover: {
    hipsY: 0.11, hips: [0.15, 0.1, 1.38], spine: [0.4, 0, 0], chest: [0.3, 0, 0], neck: [0.35, 0, 0.3], head: [0.25, 0, 0.3],
    uaL: [-1.75, 0, -0.1], faL: [-2.3, 0, 0], uaR: [-1.6, 0, 0.1], faR: [-2.3, 0, 0],
    thL: [-1.45, 0, 0], snL: [1.9, 0, 0], thR: [-1.25, 0, 0], snR: [1.8, 0, 0], ftL: [0.3, 0, 0], ftR: [0.3, 0, 0],
  },
  downProne: { // face down, pushing up on the forearms, head up
    hipsY: 0.1, hips: [1.42, 0, 0], spine: [-0.22, 0, 0], chest: [-0.18, 0, 0], neck: [-0.35, 0, 0], head: [-0.25, 0, 0],
    uaL: [-1.2, 0, 0.45], faL: [-1.35, 0, 0], uaR: [-1.2, 0, -0.45], faR: [-1.35, 0, 0],
    thL: [0.05, 0, 0.08], snL: [0.35, 0, 0], thR: [-0.15, 0, -0.08], snR: [0.6, 0, 0], ftL: [0.9, 0, 0], ftR: [0.9, 0, 0],
  },
  downProneCover: { // flat, gloves wrapped round the head
    hipsY: 0.085, hips: [1.5, 0, 0], spine: [0.05, 0, 0], chest: [0.05, 0, 0], neck: [0.1, 0, 0], head: [0.1, 0.3, 0],
    uaL: [-2.3, 0, 0.35], faL: [-2.2, 0, 0], uaR: [-2.3, 0, -0.35], faR: [-2.2, 0, 0],
    thL: [0.0, 0, 0.1], snL: [0.25, 0, 0], thR: [-0.2, 0, -0.1], snR: [0.5, 0, 0], ftL: [1.0, 0, 0], ftR: [1.0, 0, 0],
  },
  downTurtle: { // on hands and knees, back rounded
    hipsY: 0.3, hips: [1.2, 0, 0], spine: [0.25, 0, 0], chest: [0.15, 0, 0], neck: [0.1, 0, 0], head: [0.0, 0, 0],
    uaL: [-1.45, 0, 0.12], faL: [-0.25, 0, 0], uaR: [-1.45, 0, -0.12], faR: [-0.25, 0, 0],
    thL: [-1.2, 0, 0.08], snL: [1.55, 0, 0], thR: [-1.2, 0, -0.08], snR: [1.55, 0, 0], ftL: [1.0, 0, 0], ftR: [1.0, 0, 0],
  },
  downTurtleCover: { // turtled up tight, forearms round the head, forehead down
    hipsY: 0.26, hips: [1.05, 0, 0], spine: [0.5, 0, 0], chest: [0.35, 0, 0], neck: [0.4, 0, 0], head: [0.3, 0, 0],
    uaL: [-2.0, 0, -0.15], faL: [-2.3, 0, 0], uaR: [-2.0, 0, 0.15], faR: [-2.3, 0, 0],
    thL: [-1.35, 0, 0.1], snL: [1.75, 0, 0], thR: [-1.35, 0, -0.1], snR: [1.75, 0, 0], ftL: [1.0, 0, 0], ftR: [1.0, 0, 0],
  },
  sitCover: { // sitting on the canvas, dazed, gloves up
    hipsY: 0.1, hips: [-0.3, 0, 0], spine: [0.2, 0, 0], chest: [0.15, 0, 0], neck: [0.25, 0, 0], head: [0.15, 0, 0],
    uaL: [-1.6, 0, 0.3], faL: [-2.2, 0, 0], uaR: [-1.6, 0, -0.3], faR: [-2.2, 0, 0],
    thL: [-1.3, 0, 0.2], snL: [1.3, 0, 0], thR: [-1.1, 0, -0.15], snR: [0.9, 0, 0], ftL: [0.2, 0, 0], ftR: [0.2, 0, 0],
  },
});
UFC.POSES = POSES;
// Fall sequences. key = [pose, time (s), metres back along the blow, metres
// to the side, yaw turn]. end: 'grounded' (conscious, on the canvas),
// 'rise' (straight back up from a knee), 'out' (knocked out, stays down).
// The ways a conscious fighter can end up on the canvas: base pose, covered
// pose under ground strikes, the limp pose a heavy ground shot drops him into,
// and the pose he gets up through.
const DOWN_STYLES = {
  back: { base: 'grounded', cover: 'covering', out: 'koOnBack', rise: null, faces: true, legs: true },
  sit: { base: 'sitBack', cover: 'sitCover', out: 'koOnBack', rise: null, faces: true, legs: true },
  side: { base: 'downSide', cover: 'downSideCover', out: 'koOnSide', rise: 'kneel', faces: false, legs: true },
  prone: { base: 'downProne', cover: 'downProneCover', out: 'koFaceDown', rise: 'downTurtle', faces: false, legs: false },
  turtle: { base: 'downTurtle', cover: 'downTurtleCover', out: 'koFaceDown', rise: 'kneel', faces: false, legs: false },
};
UFC.DOWN_STYLES = DOWN_STYLES;
// which positions a fall can leave him in
const FALL_STYLES = { kdSit: ['sit', 'back', 'sit'], kdBack: ['back', 'back', 'side'], kdSide: ['side', 'turtle', 'prone'], kdFaceDown: ['prone', 'turtle'] };

const FALLS = {
  // knockdowns: the fighter is hurt but conscious
  kdSit: { end: 'grounded', keys: [['staggerBack', 0.16, 0.22], ['staggerDeep', 0.4, 0.52], ['sitBack', 0.74, 0.72]] },
  kdBack: { end: 'grounded', keys: [['staggerBack', 0.14, 0.2], ['fallBack', 0.46, 0.55], ['sitBack', 0.8, 0.78]] },
  kdSide: { end: 'grounded', keys: [['tiltSide', 0.24, 0.1, 0.18, 0.2], ['hipDown', 0.64, 0.22, 0.42, 0.45]] },
  kdFaceDown: { end: 'grounded', keys: [['buckle', 0.2, 0.04], ['koKnees', 0.5, 0.04], ['downTurtle', 0.88, -0.02], ['downProne', 1.25, -0.28]] },
  kdKnee: { end: 'rise', hold: 0.35, keys: [['buckle', 0.2, 0.05], ['kneelPost', 0.52, 0.1], ['kneel', 1.05, 0.1]] },
  kdFlash: { end: 'rise', hold: 0.1, keys: [['buckle', 0.16, 0.03], ['handDown', 0.38, 0.08], ['kneel', 0.7, 0.08]] },
  kdKneeBody: { end: 'rise', hold: 0.5, keys: [['koDoubleOver', 0.3, 0.05], ['kneelPost', 0.78, 0.08], ['kneel', 1.3, 0.08]] },
  // knockouts: out cold, a controlled collapse that stays down
  koTimber: { end: 'out', keys: [['koHeadBack', 0.12, 0.1], ['koTimber', 0.42, 0.42], ['koOnBack', 0.72, 0.92]] },
  koStagger: { end: 'out', keys: [['koHeadBack', 0.14, 0.14], ['staggerBack', 0.46, 0.5], ['staggerDeep', 0.82, 0.88], ['koTimber', 1.1, 1.12], ['koOnBack', 1.38, 1.5]] },
  koBuckle: { end: 'out', keys: [['buckle', 0.2, 0.04], ['koKnees', 0.52, 0.04], ['koFaceDown', 0.98, -0.42]] },
  koTwist: { end: 'out', keys: [['koTwist', 0.22, 0.1, 0.12, 0.45], ['koOnSide', 0.66, 0.28, 0.5, 0.95]] },
  koBody: { end: 'out', keys: [['koDoubleOver', 0.32, 0.05], ['koKnees', 0.8, 0.08], ['koCurled', 1.26, 0.14, 0.28, 0.5]] },
  koBodyDrop: { end: 'out', keys: [['koDoubleOver', 0.28, 0.05], ['koKnees', 0.85, 0.06], ['koKnees', 1.15, 0.06], ['koFaceDown', 1.6, -0.36]] },
  koTryRise: { end: 'out', keys: [['koHeadBack', 0.12, 0.1], ['fallBack', 0.42, 0.48], ['koOnBack', 0.72, 0.9], ['koOnBack', 1.15, 0.9], ['koTryRise', 1.75, 0.9], ['koOnBack', 2.3, 0.9]] },
  koGround: { end: 'out', keys: [['koOnBack', 0.6, 0]] },
};
UFC.FALLS = FALLS;

// Pick a fall that suits the blow, never the same one twice in a row.
function pickFall(f, ko, kind, hint) {
  const t = (hint && hint.type) || '';
  const pw = (hint && hint.power) || 10;
  let pool;
  if (!ko) {
    if (kind === 'body') pool = ['kdKneeBody', 'kdKnee'];
    else if (kind === 'legs') pool = ['kdSit', 'kdSide'];
    // a fresh fighter often pops straight back up, but half the time he is on
    // the canvas and the attacker can follow him down
    else if (f.head > 55 && pw < 16) pool = ['kdFlash', 'kdSit', 'kdBack', 'kdKnee'];
    else if (t === 'hook' || t === 'headKick') pool = ['kdSide', 'kdSit', 'kdBack', 'kdFaceDown'];
    else if (t === 'uppercut') pool = ['kdKnee', 'kdSit', 'kdFaceDown'];
    else pool = ['kdBack', 'kdSit', 'kdKnee', 'kdFaceDown'];
  } else if (kind === 'body') pool = ['koBody', 'koBodyDrop'];
  else if (t === 'headKick') pool = ['koTimber', 'koTwist', 'koBuckle'];
  else if (t === 'hook') pool = ['koTwist', 'koBuckle', 'koStagger'];
  else if (t === 'uppercut') pool = ['koBuckle', 'koTimber', 'koTryRise'];
  else pool = ['koTimber', 'koStagger', 'koBuckle', 'koTryRise'];
  const game = f.game, last = game && game.lastFall;
  let pick = M.pick(pool);
  if (pool.length > 1 && pick === last) pick = M.pick(pool.filter((n) => n !== last));
  if (game) game.lastFall = pick;
  return pick;
}
UFC.pickFall = pickFall;

const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'uaL', 'faL', 'uaR', 'faR', 'thL', 'snL', 'thR', 'snR', 'ftL', 'ftR'];
const RISE_KEYS = [['grounded', 0], ['situp', 0.45], ['post', 0.9], ['kneel', 1.35], ['rise', 1.75]];
UFC.RISE_KEYS = RISE_KEYS;

// Pre-convert poses to quaternions.
const _e = new E(0, 0, 0, 'YXZ');
function compile(pose) {
  const out = { hipsY: pose.hipsY, q: {} };
  for (const b of BONES) { const r = pose[b] || [0, 0, 0]; out.q[b] = new Q().setFromEuler(_e.set(r[0], r[1], r[2], 'YXZ')); }
  return out;
}
const COMPILED = {};
for (const k of Object.keys(POSES)) COMPILED[k] = compile(POSES[k]);
UFC.compilePose = (name) => { COMPILED[name] = compile(POSES[name]); return COMPILED[name]; };

const _q = new Q(), _q2 = new Q();

const P = UFC.Fighter.prototype;

// Write a (possibly blended) pose onto the skeleton.
P._writePose = function (a, b, w, fromSnap) {
  const B = this.body.B, h = this.h;
  for (const name of BONES) {
    const qa = fromSnap ? fromSnap.q[name] : a.q[name];
    B[name].quaternion.slerpQuaternions(qa, b.q[name], w);
  }
  for (const s of ['L', 'R']) B['hand' + s].quaternion.identity();
  const ya = fromSnap ? null : a.hipsY * h;
  if (fromSnap) B.hips.position.lerpVectors(fromSnap.hipsPos, _v(0, b.hipsY * h, 0), w);
  else B.hips.position.set(0, M.lerp(ya, b.hipsY * h, w), 0);
};
const __v = new V3();
function _v(x, y, z) { return __v.set(x, y, z); }

P.knockDown = function (dirW, power, kind, fallName) {
  this.cancelStrike();
  this.state = 'down';
  this.block = 'none';
  this.knockdowns++;
  this.downTimer = 0;
  this.downKind = kind;
  this._gnpFlash = null; this._risePre = null;
  // time on the canvas depends on how hurt he is
  this.getupAt = 2.4 + Math.random() * 0.8 + (1 - this.head / 100) * 1.6 + (this.stun > 120 ? 0.6 : 0);
  this.rise = null;
  this._startFall(fallName || pickFall(this, false, kind, this._fallHint), dirW);
  this._fallHint = null;
};

P.knockOut = function (dirW, power, fallName) {
  void power;
  const wasDown = this.state === 'down';
  if (!wasDown) { this.cancelStrike(); this.knockdowns++; }
  this.state = 'ko';
  this.rise = null;
  // finished while already on the canvas: go limp from where he lies
  const grounded = wasDown && this.downPhase !== 'seq';
  if (grounded && this.downStyle && DOWN_STYLES[this.downStyle]) FALLS.koGround.keys[0][0] = DOWN_STYLES[this.downStyle].out;
  this._startFall(fallName || (grounded ? 'koGround' : pickFall(this, true, this.downKind === 'body' && wasDown ? 'body' : (this._fallHint && this._fallHint.zone) || 'head', this._fallHint)), dirW);
  this._fallHint = null;
};

// Start a keyframed fall from whatever pose the fighter is in right now.
P._startFall = function (name, dirW) {
  const F = FALLS[name] || FALLS.kdSit;
  if (this.ragdoll) this.ragdoll.stop();
  const dir = (dirW ? dirW.clone() : new V3()).setY(0);
  if (dir.lengthSq() < 1e-6) dir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  dir.normalize();
  const snap = this._snapshot(this.yaw);
  const sign = Math.random() < 0.5 ? 1 : -1;
  this.fall = { name, F, t: 0, dir, side: new V3(-dir.z, 0, dir.x).multiplyScalar(sign), sign, start: this.pos.clone(), yaw0: this.yaw, snap };
  this.downPhase = 'seq';
  this.fallName = name;
};

P._endFall = function () {
  const f = this.fall, F = f.F;
  this.fall = null;
  if (F.end === 'out') {
    this.downPhase = 'out';
    this._outPose = COMPILED[F.keys[F.keys.length - 1][0]];
    return;
  }
  if (F.end === 'rise' && this.state !== 'ko') {
    // straight back up from the knee: continue the rise from its kneeling key
    this.downPhase = 'rising';
    this.riseT = RISE_KEYS[3][1];
    this.riseSpeed = 0.9 + 0.3 * M.sat(this.stamina / 70);
    this.stun = Math.min(this.stun, 40);
    return;
  }
  // conscious on the canvas: gather into a defensive position; which one
  // depends on how he fell (back, sitting, side, face down, turtle)
  const opp = this.opponent;
  const hips = this.body.B.hips.getWorldPosition(new V3());
  const styles = FALL_STYLES[this.fallName] || ['back'];
  this.downStyle = M.pick(styles);
  const faces = DOWN_STYLES[this.downStyle].faces;
  const yaw = faces && opp ? Math.atan2(opp.pos.x - hips.x, opp.pos.z - hips.z) : this.yaw;
  this._downSnap = this._snapshot(yaw);
  this.yaw = yaw;
  this.downPhase = 'grounded';
  this.groundT = 0;
};

// Capture the current skeleton as a blend source, re-expressed for a new root yaw.
P._snapshot = function (newYaw) {
  const B = this.body.B, root = this.body.root;
  root.updateMatrixWorld(true);
  const snap = { q: {}, hipsPos: new V3() };
  for (const name of BONES) snap.q[name] = B[name].quaternion.clone();
  const hipsWorld = B.hips.getWorldPosition(new V3());
  const oldQ = _q.setFromAxisAngle(_v(0, 1, 0), root.rotation.y);
  const newQi = _q2.setFromAxisAngle(_v(0, 1, 0), newYaw).invert();
  snap.q.hips = newQi.clone().multiply(oldQ).multiply(snap.q.hips);
  this.pos.set(hipsWorld.x, 0, hipsWorld.z);
  // during a walkout the fighter is legitimately outside the cage
  if (!(this.cine && this.cine.free)) UFC.clampToOctagon(this.pos, 0.5);
  snap.hipsPos.set(hipsWorld.x - this.pos.x, hipsWorld.y, hipsWorld.z - this.pos.z).applyQuaternion(newQi);
  return snap;
};

P._updateDown = function (dt) {
  this.downTimer += dt;
  const root = this.body.root, opp = this.opponent;
  this.vel.set(0, 0, 0);

  if (this.downPhase === 'seq' && this.fall) {
    const f = this.fall, keys = f.F.keys;
    f.t += dt;
    let i = 0;
    while (i < keys.length - 1 && f.t > keys[i][1]) i++;
    const k = keys[i], pk = i > 0 ? keys[i - 1] : null;
    const t0 = pk ? pk[1] : 0;
    const w = M.smooth(M.sat((f.t - t0) / Math.max(0.01, k[1] - t0)));
    this._writePose(pk ? COMPILED[pk[0]] : null, COMPILED[k[0]], w, pk ? null : f.snap);
    const lerpK = (j) => M.lerp(pk ? (pk[j] || 0) : 0, k[j] || 0, w);
    this.pos.copy(f.start).addScaledVector(f.dir, lerpK(2)).addScaledVector(f.side, lerpK(3));
    UFC.clampToOctagon(this.pos, 0.45);
    this.yaw = f.yaw0 + lerpK(4) * f.sign;
    root.position.copy(this.pos); root.rotation.set(0, this.yaw, 0);
    root.updateMatrixWorld(true);
    if (f.t >= keys[keys.length - 1][1] + (f.F.hold || 0)) this._endFall();
    return;
  }
  if (this.downPhase === 'out') {
    // knocked out: the body stays where it fell, only shallow breathing
    root.position.copy(this.pos); root.rotation.set(0, this.yaw, 0);
    this._writePose(this._outPose, this._outPose, 1);
    this.body.B.chest.quaternion.multiply(_q.setFromEuler(_e.set(Math.sin(this.downTimer * 1.7) * 0.02, 0, 0, 'YXZ')));
    root.updateMatrixWorld(true);
    return;
  }
  if (this.downPhase === 'fall' || this.downPhase === 'ko' || this.state === 'ko') {
    this.ragdoll.step(dt);
    this.ragdoll.apply();
    this.pos.set(this.ragdoll.p.hips.x, 0, this.ragdoll.p.hips.z);
    root.updateMatrixWorld(true);
    if (this.state === 'down' && this.downPhase === 'fall' && this.downTimer > 0.45 && (this.ragdoll.settle < 0.004 || this.downTimer > 1.25)) {
      // conscious: gather himself into a defensive position facing the threat
      const yaw = opp ? Math.atan2(opp.pos.x - this.ragdoll.p.hips.x, opp.pos.z - this.ragdoll.p.hips.z) : this.yaw;
      this.ragdoll.stop();
      this._downSnap = this._snapshot(yaw);
      this.yaw = yaw;
      this.downPhase = 'grounded';
      this.groundT = 0;
    }
    return;
  }

  if (this.downPhase === 'grounded') {
    this.groundT += dt;
    const DS = DOWN_STYLES[this.downStyle || 'back'] || DOWN_STYLES.back;
    // turn to face the opponent and scoot away if he closes in
    if (opp) {
      const target = Math.atan2(opp.pos.x - this.pos.x, opp.pos.z - this.pos.z);
      if (DS.faces) this.yaw += M.wrap(target - this.yaw) * Math.min(1, dt * 2.2);
      const d = Math.hypot(opp.pos.x - this.pos.x, opp.pos.z - this.pos.z);
      if (d < 1.4 && !this.gnpBy) {
        this.pos.x -= Math.sin(this.yaw) * 0.22 * dt; this.pos.z -= Math.cos(this.yaw) * 0.22 * dt;
        UFC.clampToOctagon(this.pos, 0.5);
      }
    }
    // player input (any stick or button) speeds up the attempt to rise
    if (this.index === 0 && this.game.input) {
      const s = this.game.input.state;
      if (Math.abs(s.lx) + Math.abs(s.ly) > 0.4 || s.square || s.triangle || s.cross || s.circle) this.downTimer += dt * 0.6;
    }
    root.position.copy(this.pos); root.rotation.set(0, this.yaw, 0);
    const BASE = COMPILED[DS.base], COVER = COMPILED[DS.cover];
    const target = this.gnpBy ? COVER : BASE;
    const w = M.smooth(Math.min(1, this.groundT / 0.6));
    if (w < 1) this._writePose(null, target, w, this._downSnap);
    else {
      // settle smoothly between guarding and covering
      const fl = this._gnpFlash;
      this._coverW = M.damp(this._coverW || 0, this.gnpBy && !fl ? 1 : 0, 6, dt);
      this._writePose(BASE, COVER, this._coverW);
      const B = this.body.B;
      // dropped by a ground shot: goes limp for a moment, arms fall, then recovers
      if (fl) {
        fl.t += dt;
        const k = fl.t < 0.18 ? M.smooth(fl.t / 0.18) : 1 - M.smooth(M.sat((fl.t - fl.hold) / 0.5));
        const OUT = COMPILED[DS.out];
        for (const n of BONES) B[n].quaternion.slerp(OUT.q[n], 0.85 * k);
        B.hips.position.y = M.lerp(B.hips.position.y, OUT.hipsY * this.h, 0.85 * k);
        if (fl.t >= fl.hold + 0.5) this._gnpFlash = null;
      }
      // conscious movement: legs keep working
      if (DS.legs && !fl) {
        _q.setFromEuler(_e.set(Math.sin(this.time * 3.1) * 0.18, 0, 0, 'YXZ'));
        B.snR.quaternion.multiply(_q);
        _q.setFromEuler(_e.set(Math.sin(this.time * 2.3 + 1) * 0.1, 0, 0, 'YXZ'));
        B.snL.quaternion.multiply(_q);
      }
      // reactions under ground strikes: turn away, shrimp, curl, snap, try to rise
      const r = this._gnpReact;
      if (r) {
        r.t += dt;
        const k = Math.sin(M.sat(r.t / r.dur) * Math.PI);
        const sd = r.side || 1;
        if (r.kind === 'turn') {
          B.hips.quaternion.multiply(_q.setFromEuler(_e.set(0, 0.35 * k * sd, 0.3 * k * sd, 'YXZ')));
          B.chest.quaternion.multiply(_q.setFromEuler(_e.set(0.1 * k, 0.3 * k * sd, 0, 'YXZ')));
        } else if (r.kind === 'shrimp') {
          if (opp) {
            const ax = this.pos.x - opp.pos.x, az = this.pos.z - opp.pos.z, al = Math.hypot(ax, az) || 1;
            this.pos.x += ax / al * dt * 0.4 * k; this.pos.z += az / al * dt * 0.4 * k;
            UFC.clampToOctagon(this.pos, 0.5);
          }
          B.thL.quaternion.multiply(_q.setFromEuler(_e.set(0.45 * k, 0, 0, 'YXZ')));
          B.hips.quaternion.multiply(_q.setFromEuler(_e.set(0, 0, 0.25 * k * sd, 'YXZ')));
        } else if (r.kind === 'curl') {
          B.thL.quaternion.multiply(_q.setFromEuler(_e.set(-0.55 * k, 0, 0, 'YXZ')));
          B.thR.quaternion.multiply(_q.setFromEuler(_e.set(-0.5 * k, 0, 0, 'YXZ')));
          B.chest.quaternion.multiply(_q.setFromEuler(_e.set(0.3 * k, 0, 0, 'YXZ')));
        } else if (r.kind === 'snap') {
          B.head.quaternion.multiply(_q.setFromEuler(_e.set(-0.2 * k, 0.55 * k * sd, 0, 'YXZ')));
        } else if (r.kind === 'rise') {
          // tries to get up and out, and gets put back down
          const up = COMPILED[DS.rise || 'situp'];
          for (const n of BONES) B[n].quaternion.slerp(up.q[n], 0.5 * k);
          B.hips.position.y = M.lerp(B.hips.position.y, up.hipsY * this.h, 0.5 * k);
        }
        if (r.t >= r.dur) this._gnpReact = null;
      }
    }
    root.updateMatrixWorld(true);
    const canRise = this.downTimer > this.getupAt && !this.gnpBy && this.groundT > 0.8 && !this._gnpFlash;
    if (canRise) {
      this.downPhase = 'rising';
      this.riseT = 0;
      // from the side, face down or turtle he gets up through his knees
      this._risePre = DS.rise ? { t: 0, via: DS.rise, snap: this._snapshot(opp ? Math.atan2(opp.pos.x - this.pos.x, opp.pos.z - this.pos.z) : this.yaw) } : null;
      if (this._risePre && opp) this.yaw = Math.atan2(opp.pos.x - this.pos.x, opp.pos.z - this.pos.z);
      this.riseSpeed = 0.85 + 0.25 * M.sat(this.stamina / 70);
      this.stun = Math.min(this.stun, 40);
    }
    return;
  }

  if (this.downPhase === 'rising' && this._risePre) {
    const pre = this._risePre;
    pre.t += dt * this.riseSpeed;
    root.position.copy(this.pos); root.rotation.set(0, this.yaw, 0);
    if (pre.via !== 'kneel' && pre.t < 0.45) this._writePose(null, COMPILED[pre.via], M.smooth(pre.t / 0.45), pre.snap);
    else if (pre.via !== 'kneel') this._writePose(COMPILED[pre.via], COMPILED.kneel, M.smooth(M.sat((pre.t - 0.45) / 0.45)));
    else this._writePose(null, COMPILED.kneel, M.smooth(M.sat(pre.t / 0.6)), pre.snap);
    root.updateMatrixWorld(true);
    if (pre.t >= (pre.via !== 'kneel' ? 0.9 : 0.6)) { this._risePre = null; this.riseT = RISE_KEYS[3][1]; }
    return;
  }
  if (this.downPhase === 'rising') {
    this.riseT += dt * this.riseSpeed;
    if (opp) {
      const target = Math.atan2(opp.pos.x - this.pos.x, opp.pos.z - this.pos.z);
      this.yaw += M.wrap(target - this.yaw) * Math.min(1, dt * 3);
    }
    root.position.copy(this.pos); root.rotation.set(0, this.yaw, 0);
    const keys = RISE_KEYS, t = this.riseT;
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1][1]) i++;
    const [ka, ta] = keys[i], [kb, tb] = keys[i + 1];
    const w = M.smooth(M.sat((t - ta) / (tb - ta)));
    this._writePose(COMPILED[ka], COMPILED[kb], w);
    root.updateMatrixWorld(true);
    if (t >= 1.2 && this.state === 'down') { this.state = 'getup'; this.hitstun = 0; }
    if (t >= keys[keys.length - 1][1]) this._finishRise();
    return;
  }
};

// Hand over from the last rising keyframe to the live stance (IK) pose.
P._finishRise = function () {
  const B = this.body.B;
  this.downPhase = null;
  this.state = 'getup';
  this.getupT = 0;
  this._blendDur = 0.4;
  this.stamina = Math.max(this.stamina, 30);
  this._snap = {};
  for (const [k, b] of Object.entries(B)) this._snap[k] = b.quaternion.clone();
  this._snapHips = B.hips.position.clone();
  this.gait = null;
  for (const side of ['L', 'R']) {
    const f = this.foot[side];
    this._footRest(side, f.planted);
    f.stepping = false; f.t = 1; f.yaw = this._restYaw(side);
  }
  Object.values(this.sp).forEach((s) => { s.vel = 0; });
  this.sp.crouch.snap(0.12 * this.h);
};

P._getupBlend = function (dt) {
  this.getupT += dt;
  const dur = this._blendDur || 0.4;
  const w = 1 - M.smooth(this.getupT / dur);
  const B = this.body.B;
  if (w > 0) {
    for (const [k, b] of Object.entries(B)) b.quaternion.slerpQuaternions(b.quaternion.clone(), this._snap[k], w);
    B.hips.position.lerp(this._snapHips, w);
    this.body.root.updateMatrixWorld(true);
  }
  if (this.getupT >= dur) { this.state = 'fight'; this.hitstun = 0.05; }
};

// Is this fighter on the canvas but conscious (valid ground-and-pound target)?
P.isGrounded = function () { return this.state === 'down' && this.downPhase === 'grounded'; };
})();

