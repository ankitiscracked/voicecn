import type {
  VoiceCommandResult,
  VoiceCommandStage,
  VoiceCommandStatus,
} from "../types";
import type { VoiceAudioStream } from "../audio/voiceAudioStream";
import { SimpleEventEmitter } from "../utils/eventEmitter";

interface StateEvents {
  change: VoiceCommandStatus;
  results: VoiceCommandResult[];
  playback: boolean;
  audioStream: VoiceAudioStream | null;
}

export class VoiceInputStore {
  private status: VoiceCommandStatus = { stage: "idle" };
  private results: VoiceCommandResult[] = [];
  private audioStream: VoiceAudioStream | null = null;
  private audioPlaying = false;
  private emitter = new SimpleEventEmitter<StateEvents>();

  getStatus() {
    return this.status;
  }

  getResults() {
    return this.results;
  }

  getAudioStream() {
    return this.audioStream;
  }

  isAudioPlaying() {
    return this.audioPlaying;
  }

  subscribe(handler: (status: VoiceCommandStatus) => void) {
    return this.emitter.on("change", handler);
  }

  subscribeResults(handler: (results: VoiceCommandResult[]) => void) {
    return this.emitter.on("results", handler);
  }

  subscribePlayback(handler: (playing: boolean) => void) {
    return this.emitter.on("playback", handler);
  }

  subscribeAudioStream(handler: (stream: VoiceAudioStream | null) => void) {
    return this.emitter.on("audioStream", handler);
  }

  setStatus(patch: Partial<VoiceCommandStatus>) {
    console.log("setStatus", patch);
    this.status = { ...this.status, ...patch };
    this.emitter.emit("change", this.status);
  }

  updateStage(stage: VoiceCommandStage) {
    this.setStatus({ stage });
  }

  resetStatus() {
    this.status = { stage: "idle" };
    this.emitter.emit("change", this.status);
  }

  pushResult(result: VoiceCommandResult) {
    this.results = [result, ...this.results];
    this.emitter.emit("results", this.results);
  }

  clearResults() {
    this.results = [];
    this.emitter.emit("results", this.results);
  }

  setAudioStream(stream: VoiceAudioStream | null) {
    this.audioStream = stream;
    this.emitter.emit("audioStream", stream);
  }

  clearAudioStream() {
    this.setAudioStream(null);
  }

  setAudioPlayback(playing: boolean) {
    this.audioPlaying = playing;
    this.emitter.emit("playback", playing);
  }
}
