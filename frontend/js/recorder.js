class AudioRecorder {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.scriptProcessor = null;
        this.analyser = null;
        this.recordingChannels = [];
        this.isRecording = false;
        this.noiseThreshold = 0.0020; // Approx -54dB RMS for noise gating
        this.inputSampleRate = 44100;
        this.outputSampleRate = 16000; // 16kHz for Azure Speech SDK compatibility
    }

    /**
     * Starts audio recording from user's microphone.
     * @param {function} volumeCallback - Invoked with current RMS volume for UI animation.
     */
    async start(volumeCallback) {
        if (this.isRecording) return;
        
        // Request microphone with mandatory preprocessing filters
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                noiseSuppression: true,
                echoCancellation: true,
                autoGainControl: true
            }
        });

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContextClass();
        this.inputSampleRate = this.audioContext.sampleRate;

        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        
        // Real-time Analyser node for mic volume bars
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        source.connect(this.analyser);

        // Process audio in 4096 size frames
        this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
        source.connect(this.scriptProcessor);
        this.scriptProcessor.connect(this.audioContext.destination);

        this.recordingChannels = [];
        this.isRecording = true;

        this.scriptProcessor.onaudioprocess = (e) => {
            if (!this.isRecording) return;
            const inputBuffer = e.inputBuffer.getChannelData(0);
            
            // Calculate Root Mean Square (RMS) decibel level
            let rms = 0;
            for (let i = 0; i < inputBuffer.length; i++) {
                rms += inputBuffer[i] * inputBuffer[i];
            }
            rms = Math.sqrt(rms / inputBuffer.length);

            // Report volume level to UI visualizer callback
            if (volumeCallback) {
                volumeCallback(rms);
            }

            // Copy chunk
            const frame = new Float32Array(inputBuffer.length);
            
            // Preprocessing noise cancellation (Noise Gate):
            // If the signal is below the threshold, silence the buffer to remove room hum.
            if (rms < this.noiseThreshold) {
                frame.fill(0);
            } else {
                frame.set(inputBuffer);
            }
            this.recordingChannels.push(frame);
        };
    }

    /**
     * Stops audio recording, downsamples output, and encodes to a WAV Blob.
     * @returns {Promise<Blob>} The 16kHz PCM WAV Blob.
     */
    async stop() {
        if (!this.isRecording) return null;
        this.isRecording = false;

        // Disconnect nodes and cleanup streams
        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect();
            this.scriptProcessor.onaudioprocess = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
        }
        if (this.audioContext) {
            await this.audioContext.close();
        }

        // Flatten Float32 channels
        let totalLength = 0;
        for (const chunk of this.recordingChannels) {
            totalLength += chunk.length;
        }
        const flatBuffer = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of this.recordingChannels) {
            flatBuffer.set(chunk, offset);
            offset += chunk.length;
        }

        // Downsample to 16kHz for Speech recognizer compliance
        const downsampled = this.downsample(flatBuffer, this.inputSampleRate, this.outputSampleRate);
        
        // Return encoded WAV
        return this.encodeWAV(downsampled, this.outputSampleRate);
    }

    /** Downsamples buffer from inRate to outRate using linear averaging. */
    downsample(buffer, inRate, outRate) {
        if (inRate === outRate) return buffer;
        const ratio = inRate / outRate;
        const newLength = Math.round(buffer.length / ratio);
        const result = new Float32Array(newLength);
        let outOffset = 0;
        let inOffset = 0;
        while (outOffset < result.length) {
            const nextInOffset = Math.round((outOffset + 1) * ratio);
            let accum = 0;
            let count = 0;
            for (let i = inOffset; i < nextInOffset && i < buffer.length; i++) {
                accum += buffer[i];
                count++;
            }
            result[outOffset] = count > 0 ? accum / count : 0;
            outOffset++;
            inOffset = nextInOffset;
        }
        return result;
    }

    /** Encodes rawFloat samples to a standard 16-bit PCM WAV container */
    encodeWAV(samples, sampleRate) {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);

        // Write WAV Header
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + samples.length * 2, true);
        this.writeString(view, 8, 'WAVE');
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // format PCM = 1
        view.setUint16(22, 1, true); // Channels = 1
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true); // byteRate
        view.setUint16(32, 2, true); // blockAlign
        view.setUint16(34, 16, true); // bitsPerSample
        this.writeString(view, 36, 'data');
        view.setUint32(40, samples.length * 2, true);

        // Convert Float32 samples to 16-bit signed PCM
        let index = 44;
        for (let i = 0; i < samples.length; i++) {
            let s = Math.max(-1, Math.min(1, samples[i]));
            // Scale and convert
            view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            index += 2;
        }

        return new Blob([view], { type: 'audio/wav' });
    }

    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
}
window.AudioRecorder = AudioRecorder;
