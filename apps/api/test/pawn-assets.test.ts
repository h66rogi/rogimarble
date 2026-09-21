import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { normalizePawnImage,readImageBody } from '../src/pawn-assets.ts';

test('decodes, bounds, and re-encodes an uploaded image',async()=>{
  const input=await sharp({create:{width:2100,height:210,channels:4,background:'#f06'}}).png().withMetadata({orientation:1}).toBuffer();
  const result=await normalizePawnImage(input,'image/png');
  assert.equal(result.mimeType,'image/png');assert.equal(result.width,2048);assert.equal(result.height,205);
  assert.deepEqual([...result.bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const metadata=await sharp(result.bytes).metadata();assert.equal(metadata.exif,undefined);assert.equal(metadata.icc,undefined);
});

test('rejects MIME confusion and SVG input',async()=>{
  const jpeg=await sharp({create:{width:2,height:2,channels:3,background:'#fff'}}).jpeg().toBuffer();
  await assert.rejects(()=>normalizePawnImage(jpeg,'image/png'),/signature/i);
  await assert.rejects(()=>normalizePawnImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),'image/png'),/signature/i);
});

test('enforces the streamed byte limit independently of Content-Length',async()=>{
  const chunk=Buffer.alloc(1024*1024);
  const request={header:()=>undefined,async *[Symbol.asyncIterator](){for(let i=0;i<6;i++)yield chunk;}};
  await assert.rejects(()=>readImageBody(request as never),/5 MiB/);
});

test('normalization also enforces the byte limit for direct callers',async()=>{
  await assert.rejects(()=>normalizePawnImage(Buffer.alloc(5*1024*1024+1),'image/png'),/5 MiB/);
});
