
// Simple synthesizer using Web Audio API
let audioCtx: AudioContext | null = null;

const getCtx = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
};

export const playSound = (type: 'pop' | 'buzz' | 'success' | 'levelUp' | 'shatter') => {
  const ctx = getCtx();
  if (!ctx) return;
  
  // Resume context if suspended (browser policy)
  if (ctx.state === 'suspended') ctx.resume();

  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  const now = ctx.currentTime;

  switch (type) {
    case 'pop':
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      // High pitched short sine wave (bubble pop)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
      gainNode.gain.setValueAtTime(0.5, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
      break;

    case 'buzz':
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      // Low pitched sawtooth (error buzzer)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.3);
      
      // Shake effect in volume
      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.linearRampToValueAtTime(0.01, now + 0.3);
      
      osc.start(now);
      osc.stop(now + 0.3);
      break;

    case 'success':
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      // Major chord arpeggio
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now); // A4
      osc.frequency.setValueAtTime(554, now + 0.1); // C#5
      osc.frequency.setValueAtTime(659, now + 0.2); // E5
      
      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.6);
      
      osc.start(now);
      osc.stop(now + 0.6);
      break;

    case 'levelUp':
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        // Fanfare
        osc.type = 'square';
        osc.frequency.setValueAtTime(523.25, now); // C
        osc.frequency.setValueAtTime(659.25, now + 0.2); // E
        osc.frequency.setValueAtTime(783.99, now + 0.4); // G
        osc.frequency.setValueAtTime(1046.50, now + 0.6); // C5
        
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 1.5);
        
        osc.start(now);
        osc.stop(now + 1.5);
        break;

    case 'shatter':
        // Noise burst
        const bufferSize = ctx.sampleRate * 0.5; // 0.5 seconds
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
          // White noise with decay
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 4);
        }
        
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 800;
        
        noise.connect(noiseFilter);
        noiseFilter.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        gainNode.gain.setValueAtTime(0.4, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        
        noise.start(now);
        break;
  }
};