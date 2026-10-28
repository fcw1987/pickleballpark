import { COVERAGE_MODEL, COVERAGE_COLORS, coverageSectors, getCoveragePreference } from './player-coverage.js';
import { readCoverageSnapshot } from './player-coverage-snapshot.js';
import { FEET_TO_METERS } from './three-d-core.js';
import { COURT_LINES } from './court-geometry.js';

// One ground plane / one draw call. Uniforms change with the shared playhead;
// no textures, raster uploads, independent clock, or camera-relative geometry.
export function createPlayerCoverageOverlay(THREE) {
  const uniforms = {
    origins: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
    directions: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
    green: { value: new THREE.Color(COVERAGE_COLORS.green) },
    orange: { value: new THREE.Color(COVERAGE_COLORS.orange) },
    shared: { value: new THREE.Color(COVERAGE_COLORS.shared) },
    ballGround: { value: new THREE.Vector2() },
    courtLines: { value: COURT_LINES.map(line => new THREE.Vector4(line.from.x, line.from.y, line.to.x, line.to.y)) },
    halfAngle: { value: COVERAGE_MODEL.angleDegrees * Math.PI / 360 }
  };
  const geometry = new THREE.PlaneGeometry(28 * FEET_TO_METERS, 52 * FEET_TO_METERS);
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    vertexShader: `varying vec2 courtPoint;
      void main(){vec4 world=modelMatrix*vec4(position,1.);courtPoint=world.xz/${FEET_TO_METERS}+vec2(10.,22.);gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `
      uniform vec4 origins[4]; uniform vec4 directions[4]; uniform vec3 green,orange,shared;
      uniform vec2 ballGround; uniform float halfAngle; uniform vec4 courtLines[${COURT_LINES.length}]; varying vec2 courtPoint;
      float sector(vec2 delta,vec2 facing,float radius){
        float distance=length(delta);float angle=acos(clamp(dot(delta/max(distance,.001),facing),-1.,1.));
        return (1.-smoothstep(radius-1.8,radius,distance))*(1.-smoothstep(halfAngle-.07,halfAngle,angle))*smoothstep(.16,.46,distance);
      }
      void main(){
        float teamA=0.,teamB=0.,overlapA=0.,overlapB=0.,edges=0.,ticks=0.;
        for(int i=0;i<4;i++){
          vec4 origin=origins[i];if(origin.w<.5)continue;
          vec2 delta=courtPoint-origin.xy;vec2 facing=directions[i].xy;
          float distance=length(delta),radius=directions[i].z;
          float angle=acos(clamp(dot(delta/max(distance,.001),facing),-1.,1.));
          float home=origin.y<22. ? 1.-smoothstep(21.8,22.,courtPoint.y) : smoothstep(22.,22.2,courtPoint.y);
          float field=sector(delta,facing,radius)*home;
          if(origin.z<.5){overlapA=max(overlapA,min(teamA,field));teamA=max(teamA,field);}
          else{overlapB=max(overlapB,min(teamB,field));teamB=max(teamB,field);}
          float rim=(1.-smoothstep(.045,.13,abs(distance-(radius-.48))))*(1.-smoothstep(halfAngle-.06,halfAngle,angle));
          // Orange has a broken perimeter as well as its warm colour.
          if(origin.z>.5)rim*=smoothstep(.20,.32,fract(atan(delta.y,delta.x)*radius/1.25));
          float side=(1.-smoothstep(.018,.04,abs(angle-(halfAngle-.025))))*smoothstep(.6,1.3,distance)*(1.-smoothstep(radius-1.7,radius,distance));
          edges=max(edges,max(rim*.55,side*.35)*home);
          float hand=dot(delta,vec2(-facing.y,facing.x))*directions[i].w;
          float tick=(1.-smoothstep(.06,.16,abs(distance-2.6)))*(1.-smoothstep(.12,.24,abs(angle-.58)))*step(.1,hand);
          ticks=max(ticks,tick*home);
        }
        float overlap=max(overlapA,overlapB);
        float field=max(teamA,teamB);
        // Fixed world hatching makes shared coverage legible without colour.
        float hatch=1.-smoothstep(.07,.14,abs(fract((courtPoint.x+courtPoint.y)/.85)-.5));
        vec3 tint=mix(green,orange,teamB/max(teamA+teamB,.001));
        tint=mix(tint,shared,clamp(overlap*.62+edges+ticks,0.,1.));
        float alpha=field*.28+overlap*(.08+hatch*.22)+edges*.52+ticks*.48;
        // Preserve the ball's ground marker and prevent a floor mask beyond apron.
        alpha*=smoothstep(.32,.75,length(courtPoint-ballGround));
        alpha*=smoothstep(-4.,-3.,courtPoint.x)*(1.-smoothstep(23.,24.,courtPoint.x));
        alpha*=smoothstep(-4.,-3.,courtPoint.y)*(1.-smoothstep(47.,48.,courtPoint.y));
        // Preserve the actual regulation markings, including their antialias
        // fringe, while allowing enough depth separation to avoid cache z-fight.
        for(int i=0;i<${COURT_LINES.length};i++){
          vec2 a=courtLines[i].xy,b=courtLines[i].zw,ab=b-a;
          vec2 nearest=a+ab*clamp(dot(courtPoint-a,ab)/dot(ab,ab),0.,1.);
          alpha*=smoothstep(.16,.25,length(courtPoint-nearest));
        }
        if(alpha<.002)discard;gl_FragColor=vec4(tint,min(.58,alpha));
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'PlayerCoverageFloor'; mesh.rotation.x = -Math.PI / 2;
  // A small depth bias prevents stripes against the cached floor. The shader
  // masks the regulation line geometry rather than painting over its pixels.
  mesh.position.y = .035; mesh.renderOrder = -10; mesh.visible = false;
  let disposed = false, diagnostics = { enabled: false, sectors: [], source: null };
  return {
    mesh,
    update(context) {
      if (disposed) return;
      mesh.visible = getCoveragePreference().enabled;
      if (!mesh.visible) { diagnostics = { enabled: false, sectors: [], source: null }; return; }
      const snapshot = readCoverageSnapshot(context), sectors = coverageSectors(snapshot);
      mesh.visible = sectors.length > 0;
      for (let i = 0; i < 4; i++) {
        const sector = sectors[i];
        if (!sector) { uniforms.origins.value[i].w = 0; continue; }
        uniforms.origins.value[i].set(sector.position.x, sector.position.y, sector.team === 'orange' ? 1 : 0, 1);
        uniforms.directions.value[i].set(sector.direction.x, sector.direction.y, sector.radius, sector.handedness === 'right' ? 1 : -1);
      }
      if (snapshot) uniforms.ballGround.value.set(snapshot.ball.x, snapshot.ball.y);
      diagnostics = { enabled: mesh.visible, sectors, timeSeconds: snapshot?.timeSeconds, phase: snapshot?.phase,
        ball: snapshot?.ball, source: snapshot?.source || (snapshot ? 'provider' : 'unavailable'), model: COVERAGE_MODEL };
    },
    getDiagnostics() { return diagnostics; },
    dispose() { if (disposed) return; disposed = true; mesh.removeFromParent(); geometry.dispose(); material.dispose(); }
  };
}
