import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Diagnostic only: it deliberately records the unchanged assertion's outcome.
// Copy this file to tests/artwork-linux-pixels.spec.mjs in the isolated CI probe.
test('diagnostic: all original athlete atlas frames record exact RGBA provenance', async ({ page, browserName }, testInfo) => {
  test.setTimeout(90000);
  const { referenceRigBrowserContract } = await import(pathToFileURL(resolve('tests/helpers/reference-rig-browser-contract.mjs')));
  const { readReferenceAtlasPixels } = await import(pathToFileURL(resolve('tests/helpers/reference-athlete-geometry.mjs')));
  const hair = JSON.parse(await readFile('tests/fixtures/reference-sleeve-preserved-hair.json', 'utf8'));
  const originalPNG = await readReferenceAtlasPixels(new URL(pathToFileURL(resolve('assets/reference-athletes/athletes-armless-v2.png'))));
  await page.goto('/index.html?workspace=planner&artwork-linux-pixel-diagnostic=1');
  await page.waitForFunction(() => Boolean(window.pickleboard?.threeD));
  await page.evaluate(async () => { pickleboard.plays.load('fifth-shot-drop'); if (!await pickleboard.threeD.enter()) throw Error('Could not enter original athlete scene'); });
  const report = await page.evaluate(async ({ contractSource, hair }) => {
    const { REFERENCE_SLEEVE_REGIONS: regions } = await import('/reference-athletes.js');
    const contract = new Function(`return (${contractSource})();`)();
    const viewer = pickleboard.threeD, assets = viewer.actorResources.assets, source = assets.sourceImage;
    const create = frequent => {
      const canvas = document.createElement('canvas'); canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
      const context = frequent === null ? canvas.getContext('2d') : canvas.getContext('2d', { willReadFrequently: frequent });
      return { canvas, context, attributes: context.getContextAttributes?.() ?? null };
    };
    const sourceViews = Object.fromEntries([['default', null], ['frequent', true]].map(([name, frequent]) => {
      const value = create(frequent); value.context.drawImage(source, 0, 0); value.pixels = value.context.getImageData(0, 0, value.canvas.width, value.canvas.height); return [name, value];
    }));
    const rendererContext = viewer.renderer.getContext();
    const debugInfo = rendererContext.getExtension('WEBGL_debug_renderer_info');
    const output = { userAgent: navigator.userAgent, devicePixelRatio, source: { src: source.currentSrc || source.src, complete: source.complete, naturalWidth: source.naturalWidth, naturalHeight: source.naturalHeight },
      sourceContexts: Object.fromEntries(Object.entries(sourceViews).map(([k,v])=>[k,v.attributes])),
      gpu: { version: rendererContext.getParameter(rendererContext.VERSION), renderer: rendererContext.getParameter(rendererContext.RENDERER), vendor: rendererContext.getParameter(rendererContext.VENDOR),
        unmaskedRenderer: debugInfo ? rendererContext.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null, attributes: rendererContext.getContextAttributes() }, frames: [] };
    const rgba = (pixels, x, y) => Array.from(pixels.data.slice((y * pixels.width + x) * 4, (y * pixels.width + x) * 4 + 4));
    const canonicalParts = (player, frame, frequent) => {
      const result = [create(frequent), create(frequent), create(frequent)], [ox, oy] = assets.metadata.frames[player][frame].rect;
      result[0].context.drawImage(source, 0, 0);
      for (let side = 0; side < 2; side++) {
        const region = regions[player][frame][side]; if (!region.visible) continue;
        const [x,y,w,h]=region.bodyCut,[px,py,pw,ph]=region.patch;
        result[0].context.clearRect(ox+x,oy+y,w,h);
        result[side+1].context.drawImage(source,ox+px,oy+py,pw,ph,ox+px,oy+py,pw,ph);
        for(const [hx,hy,hw,hh] of region.preserveRects||[]) {
          const left=Math.max(x,hx),top=Math.max(y,hy),right=Math.min(x+w,hx+hw),bottom=Math.min(y+h,hy+hh);
          if(right>left&&bottom>top) result[0].context.drawImage(source,ox+left,oy+top,right-left,bottom-top,ox+left,oy+top,right-left,bottom-top);
          result[side+1].context.clearRect(ox+hx,oy+hy,hw,hh);
        }
      }
      return result;
    };
    for (const root of viewer.playerObjects.values()) {
      const data=root.userData, player=data.player, savedFrame=data.animation.frame, parts=[data.body,...data.sleeves], savedMaps=parts.map(p=>p.material.map), savedVisibility=parts.map(p=>p.visible);
      for (let frame=0;frame<4;frame++) {
        data.animation.frame=frame;
        for(let part=0;part<3;part++){parts[part].material.map=data.resources.texture(player,frame,part-1);parts[part].visible=part===0||regions[player][frame][part-1].visible;}
        const [x,y,width,height]=assets.metadata.frames[player][frame].rect, defaultCanonical=canonicalParts(player,frame,null), frequentCanonical=canonicalParts(player,frame,true);
        const entry={player,frame,rect:[x,y,width,height],regions:regions[player][frame],preservedHair:hair.filter(h=>h.player===player&&h.frame===frame),contract:contract.artwork(root),parts:[]};
        for(let part=0;part<3;part++) {
          const object=parts[part],actualContext=object.material.map.image.getContext('2d'),actual=actualContext.getImageData(x,y,width,height),threshold=Math.max(1,Math.ceil(object.material.alphaTest*255));
          const references={sourceDefault:sourceViews.default.pixels,sourceFrequent:sourceViews.frequent.pixels,
            canonicalDefault:defaultCanonical[part].context.getImageData(0,0,source.naturalWidth,source.naturalHeight),canonicalFrequent:frequentCanonical[part].context.getImageData(0,0,source.naturalWidth,source.naturalHeight)};
          const record={part:part===0?'body':`sleeve${part-1}`,visible:part===0||regions[player][frame][part-1].visible,threshold,contextAttributes:actualContext.getContextAttributes?.()??null,
            canvasSize:[object.material.map.image.width,object.material.map.image.height],texture:{offset:object.material.map.offset.toArray(),repeat:object.material.map.repeat.toArray(),resourceKey:`${player}/${frame}/${part-1}`,identity:object.material.map===data.resources.textures.get(`${player}/${frame}/${part-1}`)},
            visiblePixels:0,alphaHistogram:{},comparisons:{},hair:[]};
          for(const name of Object.keys(references))record.comparisons[name]={allPixelMismatches:0,visiblePixelMismatches:0,premultipliedMismatches:0,maxChannelDifference:[0,0,0,0],first20:[]};
          for(let row=0;row<height;row++)for(let col=0;col<width;col++) {
            const painted=rgba(actual,col,row),visible=painted[3]>=threshold;record.alphaHistogram[painted[3]]=(record.alphaHistogram[painted[3]]||0)+1;if(visible)record.visiblePixels++;
            for(const [name,reference]of Object.entries(references)) {
              const original=rgba(reference,x+col,y+row),summary=record.comparisons[name];
              if(!painted.some((value,c)=>value!==original[c]))continue;
              summary.allPixelMismatches++;if(visible)summary.visiblePixelMismatches++;
              if(painted[3]!==original[3]||[0,1,2].some(c=>Math.round(painted[c]*painted[3]/255)!==Math.round(original[c]*original[3]/255)))summary.premultipliedMismatches++;
              painted.forEach((value,c)=>summary.maxChannelDifference[c]=Math.max(summary.maxChannelDifference[c],Math.abs(value-original[c])));
              if(summary.first20.length<20)summary.first20.push({global:[x+col,y+row],framePixel:[col,row],visible,painted,original});
            }
          }
          for(const preserved of entry.preservedHair)for(const rect of preserved.rects){const[hx,hy,hw,hh]=rect;let visiblePixels=0;for(let row=hy;row<hy+hh;row++)for(let col=hx;col<hx+hw;col++)if(rgba(actual,col,row)[3]>=threshold)visiblePixels++;record.hair.push({rect,visiblePixels});}
          entry.parts.push(record);
        }
        output.frames.push(entry);
      }
      data.animation.frame=savedFrame;parts.forEach((part,index)=>{part.material.map=savedMaps[index];part.visible=savedVisibility[index];});
    }
    return output;
  }, { contractSource: referenceRigBrowserContract.toString(), hair });
  // Keep the actual encoded PNG RGBA alongside every mismatch: browser canvas
  // color conversion/readback must not be mistaken for changed source bytes.
  for(const frame of report.frames)for(const part of frame.parts)for(const summary of Object.values(part.comparisons))for(const pair of summary.first20){const[x,y]=pair.global,at=(y*originalPNG.width+x)*4;pair.encodedPNG=Array.from(originalPNG.data.slice(at,at+4));}
  report.engine=browserName;report.expectedFrames=16;report.expectedParts=48;
  await mkdir('release-results', {recursive:true});
  const path=`release-results/artwork-linux-pixels-${browserName}.json`;await writeFile(path,JSON.stringify(report,null,2)+'\n');await testInfo.attach('all-original-atlas-pixel-pairs',{path,contentType:'application/json'});
  console.log(JSON.stringify({path,engine:browserName,frames:report.frames.length,baselineFailures:report.frames.filter(f=>!f.contract.visibleOriginalPixels).map(f=>[f.player,f.frame]),
    mismatches:report.frames.flatMap(f=>f.parts.filter(p=>p.comparisons.sourceFrequent.visiblePixelMismatches||!p.visiblePixels&&p.visible).map(p=>({player:f.player,frame:f.frame,part:p.part,visiblePixels:p.visiblePixels,source:p.comparisons.sourceFrequent.visiblePixelMismatches,canonical:p.comparisons.canonicalDefault.allPixelMismatches})))},null,2));
  console.log(JSON.stringify({sourceContexts:report.sourceContexts,gpu:report.gpu,
    actualRGBAExamples:report.frames.flatMap(frame=>frame.parts.map(part=>({player:frame.player,frame:frame.frame,part:part.part,contextAttributes:part.contextAttributes,
      comparisons:Object.fromEntries(Object.entries(part.comparisons).map(([name,value])=>[name,{visiblePixelMismatches:value.visiblePixelMismatches,premultipliedMismatches:value.premultipliedMismatches,maxChannelDifference:value.maxChannelDifference,firstThree:value.first20.slice(0,3)}]))})))},null,2));
  expect(report.frames).toHaveLength(16);expect(report.frames.reduce((sum,f)=>sum+f.parts.length,0)).toBe(48);
});
