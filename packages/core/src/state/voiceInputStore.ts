import type {
  VoiceInputResult,
  VoiceCommandStage,
  VoiceCommandStatus,
} from "../types";
import type { VoiceAudioStream } from "../audio/voiceAudioStream";
import { SimpleEventEmitter } from "../utils/eventEmitter";

interface StateEvents {
  change: VoiceCommandStatus;
  results: VoiceInputResult[];
  playback: boolean;
  audioStream: VoiceAudioStream | null;
  recording: boolean;
}

export class VoiceInputStore {
  private status: VoiceCommandStatus = { stage: "idle" };
  private results: VoiceInputResult[] = [];
  private audioStream: VoiceAudioStream | null = null;
  private audioPlaying = false;
  private recording = false;
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

  subscribeResults(handler: (results: VoiceInputResult[]) => void) {
    return this.emitter.on("results", handler);
  }

  subscribePlayback(handler: (playing: boolean) => void) {
    return this.emitter.on("playback", handler);
  }

  subscribeAudioStream(handler: (stream: VoiceAudioStream | null) => void) {
    return this.emitter.on("audioStream", handler);
  }

  subscribeRecording(handler: (recording: boolean) => void) {
    return this.emitter.on("recording", handler);
  }

  isRecording() {
    return this.recording;
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

  pushResult(result: VoiceInputResult) {
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

  setRecording(recording: boolean) {
    if (this.recording === recording) {
      return;
    }
    this.recording = recording;
    this.emitter.emit("recording", recording);
  }

  resetButKeepResults() {
    this.resetStatus();
    this.clearAudioStream();
    this.setAudioPlayback(false);
  }

  reset() {
    this.resetStatus();
    this.clearResults();
    this.clearAudioStream();
    this.setAudioPlayback(false);
    this.setRecording(false);
  }
}
