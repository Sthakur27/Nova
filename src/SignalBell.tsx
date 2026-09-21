import { useEffect, useRef, useState } from "react";
import { Rocket } from "lucide-react";

/** A small, entirely local sound toy. Audio is created only after a user gesture. */
export default function SignalBell() {
  const audio = useRef<AudioContext | null>(null);
  const voices = useRef<{ gain: GainNode; end: number }[]>([]);
  const [strike, setStrike] = useState(0);

  useEffect(() => () => {
    const context = audio.current;
    audio.current = null;
    voices.current = [];
    if (context && context.state !== "closed") void context.close().catch(() => {});
  }, []);

  async function ding() {
    setStrike(value => value + 1);
    try {
      const context = audio.current ??= new AudioContext();
      if (context.state === "suspended") await context.resume();
      if (audio.current !== context || context.state !== "running") return;
      const now = context.currentTime;
      const duration = 1.05;
      voices.current = voices.current.filter(voice => voice.end > now);
      // Bound overlapping tails so enthusiastic tapping stays gentle.
      if (voices.current.length >= 8) {
        const oldest = voices.current.shift()!;
        oldest.gain.gain.cancelScheduledValues(now);
        oldest.gain.gain.setTargetAtTime(0, now, 0.012);
      }
      const voice = context.createGain();
      voice.gain.value = 0.15;
      voice.connect(context.destination);
      voices.current.push({ gain: voice, end: now + duration });
      // A tiny desk bell: a clean, repeatable note with a bright metallic strike.
      const frequency = 1318.51 * (1 + (Math.random() - 0.5) * 0.003);
      const layers = [
        { ratio: 1, level: 0.66, length: 1, body: 0.24 },
        { ratio: 1.0025, level: 0.18, length: 0.85, body: 0.2 },
        { ratio: 2.756, level: 0.12, length: 0.32, body: 0.08 },
        { ratio: 5.404, level: 0.04, length: 0.09, body: 0.015 },
      ];
      layers.forEach(({ ratio, level, length, body }, index) => {
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        oscillator.frequency.setValueAtTime(frequency * ratio, now);
        envelope.gain.setValueAtTime(0, now);
        envelope.gain.linearRampToValueAtTime(level, now + 0.0015);
        // The fast strike gives way to a softer ring, ready for the next tap.
        envelope.gain.exponentialRampToValueAtTime(level * body, now + Math.min(0.11, length * 0.4));
        envelope.gain.exponentialRampToValueAtTime(0.0001, now + length);
        oscillator.connect(envelope);
        envelope.connect(voice);
        oscillator.start(now);
        oscillator.stop(now + duration);
        oscillator.onended = () => {
          oscillator.disconnect();
          envelope.disconnect();
          if (index === 0) voice.disconnect();
        };
      });
    } catch {
      // The visual toy still works if this device cannot play audio.
    }
  }

  return <button type="button" className="sidebar-action signal-bell"
    aria-label="Play a space ding" onClick={() => void ding()}>
    <span key={strike} className={strike ? "signal-bell-strike" : undefined}>
      <Rocket size={15} aria-hidden="true" />
    </span>
  </button>;
}
