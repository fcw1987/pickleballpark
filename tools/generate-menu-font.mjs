// Original square-grid display alphabet. No font assets or font libraries.
// TrueType outlines contain only rectangles; use for short labels, not prose.
import {mkdirSync,writeFileSync} from 'node:fs';
const patterns={
 A:'01110/10001/10001/11111/10001/10001/10001',B:'11110/10001/10001/11110/10001/10001/11110',C:'01111/10000/10000/10000/10000/10000/01111',D:'11110/10001/10001/10001/10001/10001/11110',E:'11111/10000/10000/11110/10000/10000/11111',F:'11111/10000/10000/11110/10000/10000/10000',G:'01111/10000/10000/10111/10001/10001/01110',H:'10001/10001/10001/11111/10001/10001/10001',I:'111/010/010/010/010/010/111',J:'00111/00010/00010/00010/10010/10010/01100',K:'10001/10010/10100/11000/10100/10010/10001',L:'10000/10000/10000/10000/10000/10000/11111',M:'10001/11011/10101/10101/10001/10001/10001',N:'10001/11001/11001/10101/10011/10011/10001',O:'01110/10001/10001/10001/10001/10001/01110',P:'11110/10001/10001/11110/10000/10000/10000',Q:'01110/10001/10001/10001/10101/10010/01101',R:'11110/10001/10001/11110/10100/10010/10001',S:'01111/10000/10000/01110/00001/00001/11110',T:'11111/00100/00100/00100/00100/00100/00100',U:'10001/10001/10001/10001/10001/10001/01110',V:'10001/10001/10001/10001/10001/01010/00100',W:'10001/10001/10001/10101/10101/11011/10001',X:'10001/10001/01010/00100/01010/10001/10001',Y:'10001/10001/01010/00100/00100/00100/00100',Z:'11111/00001/00010/00100/01000/10000/11111',
 '0':'01110/10001/10011/10101/11001/10001/01110','1':'010/110/010/010/010/010/111','2':'01110/10001/00001/00010/00100/01000/11111','3':'11110/00001/00001/01110/00001/00001/11110','4':'00010/00110/01010/10010/11111/00010/00010','5':'11111/10000/10000/11110/00001/00001/11110','6':'01110/10000/10000/11110/10001/10001/01110','7':'11111/00001/00010/00100/01000/01000/01000','8':'01110/10001/10001/01110/10001/10001/01110','9':'01110/10001/10001/01111/00001/00001/01110',
 ' ':'000/000/000/000/000/000/000','.':'0/0/0/0/0/1/1',':':'0/1/1/0/1/1/0','-':'000/000/000/111/000/000/000','+':'000/010/010/111/010/010/000','/':'00001/00001/00010/00100/01000/10000/10000','?':'11110/00001/00001/00110/00100/00000/00100','!':'1/1/1/1/1/0/1'
};
const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16BE(n&65535);return b;};
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n>>>0);return b;};
const words=(...n)=>Buffer.concat(n.map(u16));
const pad=b=>Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]);
const checksum=b=>{b=pad(b);let sum=0;for(let i=0;i<b.length;i+=4)sum=(sum+b.readUInt32BE(i))>>>0;return sum;};
const glyph=pattern=>{
 const rows=pattern.split('/'),points=[],ends=[];
 rows.forEach((row,y)=>[...row].forEach((cell,x)=>{if(cell==='1'){const left=x*100+50,bottom=(6-y)*100;points.push([left,bottom],[left,bottom+100],[left+100,bottom+100],[left+100,bottom]);ends.push(points.length-1);}}));
 if(!points.length)return {bytes:Buffer.alloc(0),advance:400};
 let x=0,y=0;const dx=[],dy=[];for(const point of points){dx.push(point[0]-x);dy.push(point[1]-y);[x,y]=point;}
 return {bytes:pad(Buffer.concat([words(ends.length,50,0,rows[0].length*100+50,700,...ends,0),Buffer.alloc(points.length,1),words(...dx),words(...dy)])),advance:(rows[0].length+1)*100};
};
const chars=Object.keys(patterns).sort(),glyphs=[glyph('11111/10001/10101/10101/10101/10001/11111'),...chars.map(c=>glyph(patterns[c]))];
const num=glyphs.length,tables=new Map(),set=(tag,bytes)=>tables.set(tag,bytes);
const head=Buffer.alloc(54);head.writeUInt32BE(0x10000,0);head.writeUInt32BE(0x10000,4);head.writeUInt32BE(0x5f0f3cf5,12);head.writeUInt16BE(3,16);head.writeUInt16BE(1000,18);head.writeInt16BE(550,40);head.writeInt16BE(700,42);head.writeUInt16BE(8,46);head.writeInt16BE(2,48);head.writeInt16BE(1,50);set('head',head);
set('hhea',Buffer.concat([u32(0x10000),words(800,-200,0,600,0,0,550,1,0,0,0,0,0,0,0,num)]));
set('maxp',Buffer.concat([u32(0x10000),words(num,140,35,0,0,2,0,0,0,0,0,0,0,0)]));
set('hmtx',Buffer.concat(glyphs.map(g=>words(g.advance,50))));
let offset=0;const offsets=glyphs.map(g=>{const n=offset;offset+=g.bytes.length;return n;});set('loca',Buffer.concat([...offsets,offset].map(u32)));set('glyf',Buffer.concat(glyphs.map(g=>g.bytes)));
const mapping=chars.flatMap((c,i)=>[[c.charCodeAt(0),i+1],...(/[A-Z]/.test(c)?[[c.toLowerCase().charCodeAt(0),i+1]]:[])]).sort((a,b)=>a[0]-b[0]);mapping.push([65535,0]);
const count=mapping.length,power=2**Math.floor(Math.log2(count));
const format4=Buffer.concat([words(4,16+count*8,0,count*2,power*2,Math.log2(power),count*2-power*2),words(...mapping.map(m=>m[0])),u16(0),words(...mapping.map(m=>m[0])),words(...mapping.map(m=>m[1]-m[0])),Buffer.alloc(count*2)]);
set('cmap',Buffer.concat([words(0,1,3,1),u32(12),format4]));
const names=[[1,'Park Labels'],[2,'Regular'],[3,'ParkLabels-Original-1'],[4,'Park Labels'],[5,'Version 1.000'],[6,'ParkLabels']];let nameOffset=0;
const nameStrings=names.map(([,s])=>Buffer.from(s,'utf16le').swap16());
set('name',Buffer.concat([words(0,names.length,6+names.length*12),...names.map(([id],i)=>{const row=words(3,1,0x409,id,nameStrings[i].length,nameOffset);nameOffset+=nameStrings[i].length;return row;}),...nameStrings]));
set('post',Buffer.concat([u32(0x30000),Buffer.alloc(28)]));
const os2=Buffer.alloc(78);os2.writeInt16BE(550,2);os2.writeUInt16BE(400,4);os2.writeUInt16BE(5,6);os2.writeUInt16BE(64,62);os2.writeUInt16BE(32,64);os2.writeUInt16BE(122,66);os2.writeInt16BE(800,68);os2.writeInt16BE(-200,70);os2.writeUInt16BE(800,74);os2.writeUInt16BE(200,76);os2.write('PARK',58);set('OS/2',os2);
const entries=[...tables].sort(([a],[b])=>a<b?-1:1);let position=12+entries.length*16;const directory=entries.map(([tag,b])=>{const entry=Buffer.concat([Buffer.from(tag),u32(checksum(b)),u32(position),u32(b.length)]);position+=pad(b).length;return entry;});
const tablePower=2**Math.floor(Math.log2(entries.length));const font=Buffer.concat([u32(0x10000),words(entries.length,tablePower*16,Math.log2(tablePower),entries.length*16-tablePower*16),...directory,...entries.map(([,b])=>pad(b))]);
const headPosition=directory[entries.findIndex(([tag])=>tag==='head')].readUInt32BE(8);font.writeUInt32BE((0xb1b0afba-checksum(font))>>>0,headPosition+8);
mkdirSync('assets/park',{recursive:true});writeFileSync('assets/park/menu-labels.ttf',font);console.log(`Original Park Labels: ${num} glyphs, ${font.length} bytes`);
