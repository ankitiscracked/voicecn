import { ArrowDownIcon, ArrowRightIcon } from "lucide-react";
import { useMemo } from "react";
import Marquee from "react-fast-marquee";

type Direction = "ltr" | "rtl";
type Variant = "audio" | "text";

const CHIP_COUNT = 8; // Number of chips per layer (all layers use the same count)

// Both arrays must have at least CHIP_COUNT items (they will cycle if more)
const TEXT_WORDS = [
  "intent",
  "context",
  "latency",
  "handoff",
  "embedding",
  "prompt",
  "memory",
  "vector",
] as const;
const AUDIO_CHUNKS = [
  "0x1F7A",
  "0xAAE3",
  "0x42C1",
  "0x7B90",
  "0xF012",
  "0x3AC5",
  "0x99BF",
  "0x65DA",
] as const;

type StairFlowProps = {
  direction: Direction;
  variant: Variant;
};

export function SystemDesignAnimation() {
  const layers: Array<{
    direction: Direction;
    variant: Variant;
    align: "start" | "end";
  }> = [
    { direction: "ltr", variant: "audio", align: "start" },
    { direction: "rtl", variant: "text", align: "end" },
    { direction: "ltr", variant: "text", align: "start" },
    { direction: "rtl", variant: "audio", align: "end" },
  ];

  return (
    <div className="mx-auto flex flex-col w-1/2 justify-center items-center gap-2 bg-white border border-muted-foreground/10 rounded-md p-4">
      <span className="font-mono text-xs bg-stone-100 rounded-sm px-2 py-1">
        useVoice.record()
      </span>
      <ArrowDownIcon className="w-4 h-4 text-muted-foreground" />
      <div
        key={`${layers[0].direction}-${layers[0].variant}-${0}`}
        className={`flex w-full ${layers[0].align === "start" ? "justify-start" : "justify-end"}`}
      >
        <StairFlow
          direction={layers[0].direction}
          variant={layers[0].variant}
        />
      </div>
      <div className="flex items-center">
        <span className="font-mono text-xs bg-stone-100 rounded-sm px-2 py-1">
          stt = deepgram('nova-3'); stt.queue(audioChunk)
        </span>
        <div className="ml-4 flex items-center gap-2">
          <span className="text-xs border border-muted-foreground/30 rounded-sm p-1">
            Deepgram
          </span>
          <span className="text-xs border border-muted-foreground/30 rounded-sm p-1">
            Whisper
          </span>
          <span className="text-xs border border-muted-foreground/30 rounded-sm p-1">
            ...
          </span>
        </div>
      </div>
      <ArrowDownIcon className="w-4 h-4" />
      <div
        key={`${layers[1].direction}-${layers[1].variant}-${1}`}
        className={`flex w-full ${layers[1].align === "start" ? "justify-start" : "justify-end"}`}
      >
        <StairFlow
          direction={layers[1].direction}
          variant={layers[1].variant}
        />
      </div>
      <div className="w-full">
        <ConnectorLevel />
      </div>

      <div
        key={`${layers[2].direction}-${layers[2].variant}-${2}`}
        className={`flex w-full ${layers[2].align === "start" ? "justify-start" : "justify-end"}`}
      >
        <StairFlow
          direction={layers[2].direction}
          variant={layers[2].variant}
        />
      </div>

      <div className="flex items-center">
        <span className="font-mono text-xs bg-stone-100 rounded-sm px-2 py-1">
          tts = cartesia('sonic-3'); tts.queue(textChunk)
        </span>
        <div className="ml-4 flex items-center gap-2">
          <span className="text-xs border border-muted-foreground/30 rounded-sm p-1">
            Cartesia
          </span>
          <span className="text-xs border border-muted-foreground/30 rounded-sm p-1">
            ElevenLabs
          </span>
          <span className="text-xs border border-muted-foreground/30 rounded-sm p-1">
            ...
          </span>
        </div>
      </div>
      <ArrowDownIcon className="w-4 h-4" />

      <div
        key={`${layers[3].direction}-${layers[3].variant}-${3}`}
        className={`flex w-full ${layers[3].align === "start" ? "justify-start" : "justify-end"}`}
      >
        <StairFlow
          direction={layers[3].direction}
          variant={layers[3].variant}
        />
      </div>
      <ArrowDownIcon className="w-4 h-4 text-muted-foreground" />
      <span className="font-mono text-xs bg-stone-100 rounded-sm px-2 py-1">
        useAudio.queue(chunk)
      </span>
    </div>
  );
}

function StairFlow({ direction, variant }: StairFlowProps) {
  return <InfiniteChipRow direction={direction} variant={variant} />;
}

function ConnectorLevel() {
  return (
    <div className="flex items-center gap-2 justify-between border border-muted-foreground/30 rounded-md px-8 py-2">
      <span className="text-xs">Complete transcript</span>
      <ArrowRightIcon className="w-4 h-4 text-muted-foreground" />
      <span className="text-xs px-4 py-2 rounded-sm bg-fd-primary text-fd-primary-foreground">
        Your Agent Pipeline
      </span>
      <ArrowRightIcon className="w-4 h-4 text-muted-foreground" />
      <span className="text-xs ">Your text output</span>
    </div>
  );
}

function InfiniteChipRow({ direction, variant }: StairFlowProps) {
  const chips = useMemo(() => getChipConfigs(variant), [variant]);

  return (
    <div className="w-full">
      <Marquee
        direction={direction === "ltr" ? "right" : "left"}
        speed={50}
        pauseOnHover={false}
      >
        {chips.map((chip, index) => (
          <span
            key={`${chip.id}-${index}`}
            className={`mx-2 px-2 text-[10px] font-mono  text-fd-primary/40 tracking-tight`}
          >
            {chip.label}
          </span>
        ))}
      </Marquee>
    </div>
  );
}

function getChipConfigs(variant: Variant) {
  const source = variant === "audio" ? AUDIO_CHUNKS : TEXT_WORDS;
  return Array.from({ length: CHIP_COUNT }, (_, idx) => {
    const label = source[idx % source.length];
    return {
      id: `${variant}-${label}-${idx}`,
      label,
    };
  });
}
