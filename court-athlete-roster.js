// Atlas order is stable across the illustrated and articulated courts.
export const COURT_ATHLETES = Object.freeze([
    { key:'emerald-cap', name:'Emerald Cap' },
    { key:'cream-visor', name:'Cream Visor' },
    { key:'coral-ponytail', name:'Coral Ponytail' },
    { key:'navy-cap', name:'Navy Cap' }
].map(Object.freeze));

export function courtAthleteIndex(team, index) {
    return (team==='team1' || team==='green' ? 0 : 2) + index%2;
}
