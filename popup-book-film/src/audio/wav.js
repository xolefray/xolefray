// 16-bit PCM WAV encoder for an AudioBuffer (interleaved, little-endian).
export function encodeWav(buf) {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const sr = buf.sampleRate;
  const bytes = n * ch * 2;
  const out = new ArrayBuffer(44 + bytes);
  const dv = new DataView(out);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + bytes, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, bytes, true);
  const data = [];
  for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  const pcm = new Int16Array(out, 44, n * ch);
  for (let i = 0, k = 0; i < n; i++) {
    for (let c = 0; c < ch; c++, k++) {
      const x = data[c][i];
      const s = x <= -1 ? -32768 : x >= 1 ? 32767 : Math.round(x * 32767);
      pcm[k] = s;
    }
  }
  return out;
}
