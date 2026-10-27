import {createStarterDocument,PLAY_DOCUMENT_ENUMS} from '../../play-document.js';

// The actual schema permits all four contact styles for every family, including
// serve/short-hop and overhead/short-hop. Do not silently discard those pairs.
export function pixelAuthoringCases(){
 const cases=[];
 for(const family of PLAY_DOCUMENT_ENUMS.families)for(const contactStyle of PLAY_DOCUMENT_ENUMS.contactStyles)for(const handedness of ['left','right'])for(const serveMethod of family==='serve'?['volley','drop']:[undefined]){
  const document=createStarterDocument(),serve=family==='serve';
  document.id=`pixel-${family}-${contactStyle}-${handedness}-${serveMethod||'rally'}`;
  document.title=document.id;document.opening=serve?'serve':'midrally';
  for(const player of Object.values(document.players))player.handedness=handedness;
  const contact=serve?{x:15,y:-1}:{x:7,y:14.4};
  document.initialLayout.player1={...contact};document.initialLayout.ball={...contact};
  document.shots=[{id:'matrix-shot',family,hitter:'player1',receiver:'auto',contactStyle,target:serve?{x:5,y:38}:{x:7,y:32},arc:'medium',pace:'medium',movement:{intent:'hold',pinned:false},...(serve?{serveMethod}:{})}];
  cases.push({id:document.id,family,contactStyle,handedness,serveMethod,document});
 }
 return cases;
}

// Boundary representatives vary tactics without multiplying identical skeletons.
export function pixelTacticalBoundaryCases(){
 return pixelAuthoringCases().filter(c=>c.contactStyle==='forehand'&&c.handedness==='right'&&(!c.serveMethod||c.serveMethod==='volley')).flatMap(c=>[
  {arc:'low',pace:'soft',target:c.family==='serve'?{x:.25,y:29.25}:{x:.25,y:29.25}},
  {arc:'high',pace:'firm',target:c.family==='serve'?{x:9.75,y:43.75}:{x:19.75,y:43.75}}
 ].map((variant,index)=>{
  const item=structuredClone(c);item.id+=`-tactical-${index}`;item.document.id=item.id;Object.assign(item.document.shots[0],variant);return item;
 }));
}
