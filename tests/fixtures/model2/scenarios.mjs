import { clone, model2Document, model2Shot } from './factories.mjs';

const feet = (x, y) => [{ x: x - .42, y }, { x: x + .42, y }];
const evidence = (x, y, extra = {}) => ({ feet: feet(x, y), feetEstablishedOutsideNVZ: true, ...extra });
const layout = (ball, player1 = ball, player3 = { x: 16, y: 32 }, player4 = { x: 18, y: 39 }) => ({ player1, player2: { x: 16, y: 5 }, player3, player4, ball });

// Hand-authored geometry, never generated tactics. Outcomes are captured from
// the shared physical solver, then checked against these independent cases.
export function model2ScenarioDrafts() {
  const drafts = [];
  const add = (id, expectedReason, document, negative) => drafts.push({ id, expectedReason, document: { ...document, id: `m1-${id}`, title: `Model 2 ${id}` }, negative });
  const terminal = (shot, initialLayout = layout({ x: 7, y: 14 })) => model2Document({ ending: 'fault', initialLayout, shots: [model2Shot(shot)] });

  add('net', 'net', terminal({ physics: { apexFeet: 2.25 }, target: { x: 7, y: 32 }, quality: 'error' }), document => { document.outcome.evidence.position.y += 2; });
  add('long', 'long', terminal({ family: 'drive', intent: 'drive', target: { x: 7, y: 46 }, physics: { apexFeet: 7 } }), document => { document.shots[0].target.y = 42; });
  add('wide', 'wide', terminal({ family: 'drive', intent: 'drive', target: { x: 22, y: 34 }, physics: { apexFeet: 7 } }), document => { document.shots[0].target.x = 18; });
  add('second-bounce', 'second-bounce', terminal({ target: { x: 3, y: 33 }, physics: { apexFeet: 6 } }, layout({ x: 7, y: 14 }, { x: 7, y: 14 }, { x: 10, y: 34 }, { x: 17, y: 39 })), document => { document.outcome.faultingActor = 'player1'; });
  add('body', 'body', terminal({ family: 'drive', intent: 'speed-up', target: { x: 7, y: 40 }, physics: { apexFeet: 6 } }, layout({ x: 7, y: 14 }, { x: 7, y: 14 }, { x: 7, y: 32 })), document => { document.initialLayout.player3.x = 15; });

  const volley = model2Shot({ family: 'volley', intent: 'counter', contactMode: 'volley', target: { x: 7, y: 36 }, physics: { apexFeet: 5 }, contactEvidence: evidence(7, 15) });
  add('nvz-foot', 'nvz-foot', terminal(volley, layout({ x: 7, y: 15 })), document => { document.shots[0].contactEvidence.feet = feet(7, 14); });
  const momentum = clone(volley); momentum.contactEvidence = evidence(7, 14, { momentum: { afterContactSeconds: 1.5, feet: feet(7, 15), balanced: false } });
  momentum.target = { x: 7, y: 46 };
  add('nvz-momentum-after-dead', 'nvz-momentum', terminal(momentum), document => { document.outcome.evidence.afterContactSeconds -= .25; });
  const earlierMomentum = model2Document({ ending: 'fault', initialLayout: layout({ x: 7, y: 14 }, { x: 7, y: 14 }, { x: 7, y: 34 }), shots: [
    model2Shot({ id: 'earlier-volley', family: 'volley', intent: 'counter', contactMode: 'volley', receiver: 'player3', target: { x: 7, y: 40 }, physics: { apexFeet: 7 }, contactEvidence: evidence(7, 14, { momentum: { afterContactSeconds: 2.5, feet: feet(7, 15), balanced: false } }) }),
    model2Shot({ id: 'later-out', family: 'volley', intent: 'counter', hitter: 'player3', contactMode: 'volley', target: { x: 7, y: -2 }, physics: { apexFeet: 7 } })
  ] });
  add('earlier-momentum-overrides-later-fault', 'nvz-momentum', earlierMomentum, document => { document.outcome.shotId = 'later-out'; });

  const opening = () => model2Document({
    opening: 'serve', ending: 'fault',
    initialLayout: layout({ x: 16.2, y: 0 }, { x: 15, y: -1 }, { x: 5, y: 34 }, { x: 15, y: 30 }),
    shots: [model2Shot({ id: 'serve', family: 'serve', intent: 'serve', hitter: 'player1', receiver: 'player3', serveMethod: 'volley', target: { x: 5, y: 38 }, physics: { apexFeet: 7 } })]
  });
  const volleyReturn = opening();
  volleyReturn.shots.push(model2Shot({ id: 'return-volley', family: 'volley', intent: 'counter', hitter: 'player3', receiver: 'player1', contactMode: 'volley', target: { x: 15, y: 6 }, physics: { apexFeet: 7 } }));
  add('opening-return-volley', 'two-bounce', volleyReturn, document => { document.outcome.faultingActor = 'player1'; });
  const servePartner = opening();
  servePartner.initialLayout.player2 = { x: 15.3, y: 3 };
  add('serve-hits-server-partner', 'body', servePartner, document => { document.outcome.faultingActor = 'player2'; });
  const serveReceiverPartner = opening();
  serveReceiverPartner.initialLayout.player3 = { x: 5, y: 41 };
  serveReceiverPartner.initialLayout.player4 = { x: 7.1, y: 31 };
  add('serve-hits-receiver-partner', 'body', serveReceiverPartner, document => { document.outcome.faultingActor = 'player1'; });
  const volleyThird = opening();
  volleyThird.shots[0].movement = { intent: 'manual', pinned: false, target: { x: 15, y: 14 } };
  volleyThird.shots.push(model2Shot({ id: 'return', family: 'return', intent: 'deep-return', hitter: 'player3', receiver: 'player1', contactMode: 'bounced', contactTiming: { afterBounceSeconds: .2 }, target: { x: 15, y: 5 }, physics: { apexFeet: 7 } }));
  volleyThird.shots.push(model2Shot({ id: 'third-volley', family: 'volley', intent: 'counter', hitter: 'player1', receiver: 'auto', contactMode: 'volley', target: { x: 7, y: 35 }, physics: { apexFeet: 7 } }));
  add('opening-third-volley', 'two-bounce', volleyThird, document => { document.outcome.ruleRef = '10.A.1'; });

  const transition = model2Document({ initialLayout: layout({ x: 7, y: 8 }, { x: 7, y: 8 }, { x: 7, y: 36 }), shots: [
    model2Shot({ id: 'transition-feed', family: 'drive', intent: 'drive', target: { x: 7, y: 41 }, physics: { apexFeet: 8 }, receiver: 'player3' }),
    model2Shot({ id: 'transition-volley', family: 'volley', intent: 'counter', hitter: 'player3', contactMode: 'volley', target: { x: 5, y: 8 }, physics: { apexFeet: 6 } })
  ] });
  add('transition-volley', null, transition, document => { document.shots[1].contactEvidence = evidence(7, 29); });
  const bounced = model2Document({ initialLayout: layout({ x: 7, y: 14 }, { x: 7, y: 14 }, { x: 9, y: 33 }), shots: [
    model2Shot({ id: 'bounce-feed', target: { x: 9, y: 30 }, physics: { apexFeet: 6 }, receiver: 'player3' }),
    model2Shot({ id: 'bounced-reply', family: 'return', intent: 'return', hitter: 'player3', contactMode: 'bounced', contactTiming: { afterBounceSeconds: .2 }, target: { x: 15, y: 8 }, physics: { apexFeet: 7 } })
  ] });
  add('variable-bounced-contact', null, bounced, document => { document.shots[1].contactTiming.afterBounceSeconds = 1.4; });

  const erne = model2Document({ initialLayout: layout({ x: -1.5, y: 18 }, { x: -2, y: 18 }), shots: [model2Shot({
    family: 'volley', intent: 'erne', contactMode: 'volley', contactOverride: { x: -1.5, y: 18 },
    contactEvidence: evidence(-2, 18), target: { x: 5, y: 29 }, physics: { apexFeet: 5 }
  })] });
  add('erne', null, erne, document => { document.shots[0].contactEvidence.feet[1].x = .1; });
  const atp = model2Document({ initialLayout: layout({ x: -2.5, y: 18 }, { x: -2.5, y: 18 }), shots: [model2Shot({
    family: 'dink', intent: 'around-the-post', contactMode: 'bounced', contactOverride: { x: -2.5, y: 18 },
    contactEvidence: evidence(-2.5, 18), target: { x: .5, y: 32 }, physics: { apexFeet: 2.5 }
  })] });
  add('around-the-post', null, atp, document => { document.shots[0].target.x = 5; });
  add('unreachable', 'unreachable', terminal({ family: 'overhead', intent: 'put-away', target: { x: 1, y: 27 } }, layout({ x: 1, y: 14 }, { x: 1, y: 14 }, { x: 28, y: 52 }, { x: 27, y: 51 })), document => { document.outcome.evidence.afterContactSeconds += .2; });
  return drafts;
}
