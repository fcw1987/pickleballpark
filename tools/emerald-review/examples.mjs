// Each example goes through the regular saved-document compiler and court.
export const examples = [
    ['tracking','Track the far court'], ['dink','Forehand dink'], ['drive','Forehand drive'],
    ['backhand','Backhand drive'], ['lob','Lob'], ['overhead','High overhead'],
    ['approach','Return to the kitchen'], ['saved','Saved drive–drop rally'], ['grounded','Grounded overhead limit']
];

export function reviewDocument(key, handedness, source) {
    const doc=structuredClone(source);
    doc.players.player1.handedness=handedness;
    if (key==='saved') return doc;
    const label=examples.find(([id])=>id===key)?.[1];
    if(!label)throw new Error('Unknown court example');
    doc.id='emerald-review-'+key;
    doc.title=label;
    doc.opening='midrally';
    doc.ending='stop';
    doc.assistance.autoShading=false;
    doc.initialLayout={player1:{x:10,y:14},player2:{x:4,y:14},player3:{x:1,y:30},player4:{x:19,y:30},ball:{x:10,y:14}};
    const shot=(id,family,hitter,receiver,x,y,style='forehand',movement='hold')=>({
        id,family,hitter:'player'+hitter,receiver:receiver?'player'+receiver:'auto',contactStyle:style,
        target:{x,y},arc:family==='lob'?'high':'medium',pace:['dink','drop','lob'].includes(family)?'soft':'medium',
        movement:{intent:movement,pinned:false}
    });
    if(key==='tracking') {
        doc.initialLayout.ball={...doc.initialLayout.player2};
        doc.shots=[shot('left','dink',2,3,1,29),shot('left-return','dink',3,2,4,14),
            shot('right','dink',2,4,19,29),shot('right-return','dink',4,2,5,14),
            shot('middle','dink',2,3,10,29),shot('middle-return','dink',3,1,10,14),
            shot('finish','dink',1,4,16,30,'backhand')];
    } else if(key==='approach') {
        doc.modelVersion=2;doc.physicsVersion='play-physics-v2';
        doc.initialLayout.player1={x:12,y:10.2};doc.initialLayout.ball={...doc.initialLayout.player1};
        doc.shots=[shot('approach','drop',1,3,4,29,'forehand','advance'),shot('reply','dink',3,1,12,18.3),
            shot('kitchen','dink',1,4,17,29,'backhand'),shot('reset','dink',4,2,4,15)]
            .map(s=>({...s,intent:s.family,quality:'neutral'}));
    } else if(key==='grounded') {
        doc.modelVersion=2;doc.physicsVersion='play-physics-v2';
        doc.shots=[{...shot('grounded','overhead',1,3,5,31),intent:'put-away',quality:'neutral'}];
    } else {
        doc.initialLayout.player3={x:5,y:30};doc.initialLayout.ball={...doc.initialLayout.player3};
        doc.shots=[shot('feed',key==='overhead'?'lob':'dink',3,1,10,14),shot('stroke',key==='backhand'?'drive':key,1,3,7,30,key==='backhand'?'backhand':'forehand'),
            shot('reply','dink',3,2,4,14)];
    }
    return doc;
}
