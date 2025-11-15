import type { RecorderOptions } from "../types";

const DEFAULT_CHUNK_MS = 400;

export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private visualizationStream: MediaStream | null = null;
  private isRecording = false;
  private cancelling = false;

  constructor(private options: RecorderOptions) {}

  get stream() {
    return this.visualizationStream;
  }

  get recording() {
    return this.isRecording;
  }

  async start() {
    if (this.isRecording) {
      return;
    }

    await this.options.onSocketReady();

    const mediaDevices = this.options.mediaDevices ?? navigator?.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      throw new Error("MediaDevices API is not available");
    }

    this.mediaStream = await mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    const timezone =
      typeof Intl !== "undefined" && "DateTimeFormat" in Intl
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "UTC";

    await this.options.sendJson({
      type: "start",
      timezone,
    });

    this.mediaRecorder = new MediaRecorder(this.mediaStream, {
      mimeType: "audio/webm;codecs=opus",
    });
    this.visualizationStream = this.mediaStream;

    this.mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        await this.options.sendBinary(event.data);
      }
    };

    this.mediaRecorder.onstop = async () => {
      this.mediaStream?.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
      this.visualizationStream = null;
      this.isRecording = false;

      if (this.cancelling) {
        this.cancelling = false;
        return;
      }

      await this.options.sendJson({ type: "end" });
      await this.options.onRecordingEnded();
    };

    this.mediaRecorder.start(this.options.chunkMs ?? DEFAULT_CHUNK_MS);
    this.isRecording = true;
  }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.stop();
    }
  }

  async cancel() {
    if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
      await this.cleanup();
      return;
    }

    this.cancelling = true;
    this.mediaRecorder.stop();

    await this.options.sendJson({ type: "cancel" });
    await this.options.onCancel();
    await this.cleanup();
  }

  async cleanup() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.visualizationStream = null;
    this.isRecording = false;
  }
}
