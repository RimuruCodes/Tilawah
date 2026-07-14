// A quick, honest "calibration" step. Most of the app's scoring
// thresholds are already relative (ratios/dB-deltas) rather than fixed
// absolute levels, so they don't need heavy per-user recalibration. What
// actually helps is catching a bad mic setup *before* someone spends time
// on a full recitation attempt — too quiet, too loud/clipping, or no
// signal at all. That's what this does: a ~1.2s live level check.
export async function runMicCheck(durationMs = 1200) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  const rmsSamples = [];

  const start = performance.now();
  await new Promise((resolve) => {
    function tick() {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      rmsSamples.push(Math.sqrt(sum / data.length));
      if (performance.now() - start < durationMs) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    }
    tick();
  });

  stream.getTracks().forEach((t) => t.stop());
  ctx.close();

  const peakRms = Math.max(...rmsSamples, 1e-8);
  const peakDb = 20 * Math.log10(peakRms);

  if (peakDb < -50) {
    return { verdict: "silent", peakDb: Math.round(peakDb), message: "No sound detected — check your microphone permissions and that the right input device is selected." };
  }
  if (peakDb < -32) {
    return { verdict: "quiet", peakDb: Math.round(peakDb), message: "Your mic level seems quiet — try moving closer or speaking a bit louder for a more reliable score." };
  }
  if (peakDb > -3) {
    return { verdict: "loud", peakDb: Math.round(peakDb), message: "Your input is very loud and may be clipping — try moving back slightly from the mic." };
  }
  return { verdict: "good", peakDb: Math.round(peakDb), message: "Mic level looks good." };
}
