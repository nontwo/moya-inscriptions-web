import { useState, useRef } from "react";
import { Play, Pause, Volume2 } from "lucide-react";

interface AudioPlayerProps {
  text: string;
  label?: string;
  className?: string;
}

export default function AudioPlayer({
  text,
  label,
  className = "",
}: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = () => {
    if (!("speechSynthesis" in window)) return;

    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = rate;
    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => setPlaying(false);

    synthRef.current = utterance;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setPlaying(true);
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setPlaying(false);
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <button
        onClick={speak}
        className={`p-2 rounded-full transition-colors cursor-pointer ${
          playing
            ? "bg-vermilion-500 text-white"
            : "bg-rice-200 text-ink-500 hover:bg-vermilion-100 hover:text-vermilion-500"
        }`}
        title={playing ? "停止朗读" : "朗读"}
      >
        {playing ? <Pause size={16} /> : <Volume2 size={16} />}
      </button>

      {label && <span className="text-xs text-ink-400">{label}</span>}

      {/* 语速调节 */}
      {playing && (
        <div className="flex items-center gap-1 text-xs text-ink-400">
          <button
            onClick={() => setRate((r) => Math.max(r - 0.25, 0.5))}
            className="px-1 hover:text-ink-600 cursor-pointer"
          >
            {rate}x
          </button>
          <button
            onClick={() => setRate((r) => Math.min(r + 0.25, 2))}
            className="px-1 hover:text-ink-600 cursor-pointer"
          >
            +
          </button>
          <button
            onClick={stopSpeaking}
            className="px-2 text-vermilion-500 hover:text-vermilion-600 cursor-pointer"
          >
            停止
          </button>
        </div>
      )}
    </div>
  );
}
