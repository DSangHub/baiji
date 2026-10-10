import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Configure Gemini as a continuous interpreter session
const session = await ai.getLiveSession({
  model: 'gemini-2.5-flash',
  config: {
    systemInstruction: {
      parts: [{
        text: `You are a real-time audio interpreter between Punjabi and Canadian English. 
               When you hear Punjabi, immediately translate and speak it in natural English.
               When you hear English, immediately translate and speak it in respectful conversational Punjabi.`
      }]
    },
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
      }
    }
  }
});

// Stream audio buffers from client WebRTC connection directly to session import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Session configured for pure Punjabi assistance & mediation
const session = await ai.getLiveSession({
  model: 'gemini-2.5-flash',
  config: {
    systemInstruction: {
      parts: [{
        text: `ਤੁਸੀਂ ਬਾਈ ਜੀ (Bai Ji) ਹੋ। ਇਸ ਕਾਲ ਵਿੱਚ ਦੋਵੇਂ ਵਿਅਕਤੀ ਪੰਜਾਬੀ ਵਿੱਚ ਗੱਲ ਕਰ ਰਹੇ ਹਨ। 
               ਤੁਹਾਡਾ ਕੰਮ ਬਹੁਤ ਸਰਲ ਅਤੇ ਸਪੱਸ਼ਟ ਪੰਜਾਬੀ ਵਿੱਚ ਮਦਦ ਕਰਨਾ ਹੈ। 
               ਜਦੋਂ ਉਹ ਤੁਹਾਡੇ ਤੋਂ ਕੋਈ ਸਵਾਲ ਪੁੱਛਣ, ਜਾਂ ਕਿਸੇ ਮਸਲੇ ਦਾ ਹੱਲ ਚਾਹੁਣ, ਤਾਂ ਛੋਟਾ ਅਤੇ ਸਿੱਧਾ ਜਵਾਬ ਦਿਓ।`
      }]
    },
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
      }
    }
  }
});// Web Audio Context for Waiting Music & Ducking
class BaijiAudioManager {
  constructor() {
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.bgMusicNode = null;
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.connect(this.audioCtx.destination);
    
    // Playlists (High-quality public domain / royalty-free loops)
    this.tracks = {
      gurbani: 'https://cdn.baiji.app/audio/gurbani_instrumental_rabab.mp3',
      sufi: 'https://cdn.baiji.app/audio/sufi_flute_calm.mp3',
      folk: 'https://cdn.baiji.app/audio/punjabi_algoze_soft.mp3',
      diljit: 'https://cdn.baiji.app/audio/instrumental_chill_pop.mp3'
    };
  }

  // Play chosen category while AI is thinking/processing
  playWaitingMusic(category = 'gurbani') {
    if (this.bgMusicNode) this.bgMusicNode.stop();

    const audioUrl = this.tracks[category] || this.tracks.gurbani;
    const audio = new Audio(audioUrl);
    audio.loop = true;
    audio.crossOrigin = "anonymous";

    this.bgMusicNode = this.audioCtx.createMediaElementSource(audio);
    this.bgMusicNode.connect(this.gainNode);
    
    // Start playing at comfortable background level (15% volume)
    this.gainNode.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
    audio.play();
  }

  // Fade out music smoothly when AI or User speaks
  stopWaitingMusic(fadeDuration = 0.5) {
    if (!this.bgMusicNode) return;
    
    // Smooth fade out to avoid abrupt audio pops
    this.gainNode.gain.exponentialRampToValueAtTime(
      0.0001, 
      this.audioCtx.currentTime + fadeDuration
    );

    setTimeout(() => {
      if (this.bgMusicNode) {
        this.bgMusicNode.mediaElement.pause();
        this.bgMusicNode = null;
      }
    }, fadeDuration * 1000);
  }
}

export const baijiAudio = new BaijiAudioManager();class BaijiGeminiLiveBridge {
  constructor(websocketUrl, musicCategory = 'gurbani') {
    this.ws = new WebSocket(websocketUrl);
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.musicCategory = musicCategory;
    this.bgAudioNode = null;
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.connect(this.audioCtx.destination);
    
    this.setupWebSocket();
  }

  setupWebSocket() {
    this.ws.onopen = () => {
      console.log('Connected to Gemini Live WebSocket Session');
      // Send initial setup configuration
      this.sendStateEvent('SESSION_INIT', { 
        language: 'pa', 
        waitingMusic: this.musicCategory 
      });
    };

    this.ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      this.handleGeminiServerEvent(message);
    };
  }

  // Handle incoming Gemini audio & turn events
  handleGeminiServerEvent(message) {
    switch (message.type) {
      case 'AI_SPEECH_START':
        // Gemini has started generating Punjabi audio response -> Duck/Stop Music
        this.duckWaitingMusic(0.0); 
        break;

      case 'AI_SPEECH_END':
        // AI finished speaking -> Resume soft waiting music if waiting for user
        this.duckWaitingMusic(0.15);
        break;

      case 'AUDIO_DATA':
        // Play incoming Gemini audio PCM frames
        this.playGeminiAudioChunk(message.pcmBuffer);
        break;
    }
  }

  // Start background music loop locally
  startWaitingMusic(audioUrl) {
    const audio = new Audio(audioUrl);
    audio.loop = true;
    audio.crossOrigin = 'anonymous';

    this.bgAudioNode = this.audioCtx.createMediaElementSource(audio);
    this.bgAudioNode.connect(this.gainNode);
    
    // Set initial waiting volume to 15%
    this.gainNode.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
    audio.play();

    // Inform server of audio state
    this.sendStateEvent('MUSIC_STATE_CHANGE', { isPlaying: true, category: this.musicCategory });
  }

  // Smoothly duck volume (e.g. 0.15 when waiting, 0.0 when Gemini speaks)
  duckWaitingMusic(targetVolume, duration = 0.3) {
    if (!this.gainNode) return;
    this.gainNode.gain.exponentialRampToValueAtTime(
      Math.max(targetVolume, 0.0001), 
      this.audioCtx.currentTime + duration
    );
  }

  // Send PCM audio chunk from Mic (WITHOUT background music mixed in)
  sendUserAudioPCM(pcmInt16Array) {
    if (this.ws.readyState === WebSocket.OPEN) {
      // Duck music while user is speaking
      this.duckWaitingMusic(0.02);

      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(pcmInt16Array.buffer)));
      this.ws.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{
            mimeType: "audio/pcm;rate=16000",
            data: base64Audio
          }]
        }
      }));
    }
  }

  sendStateEvent(eventType, payload) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: eventType, payload }));
    }
  }
}import { WebSocketServer } from 'ws';
import { GoogleGenAI } from '@google/genai';

const wss = new WebSocketServer({ port: 8080 });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

wss.on('connection', async (ws) => {
  console.log('Baiji Client connected');

  // Initialize Gemini 2.5 Multimodal Live Session
  const liveSession = await ai.getLiveSession({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: {
        parts: [{
          text: `You are Bai Ji (ਬਾਈ ਜੀ), a respectful voice assistant in Punjab.
                 Respond in short, clear conversational Punjabi. Keep answers simple.`
        }]
      },
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
        }
      }
    }
  });

  // Relay audio back to client
  liveSession.on('audio', (data) => {
    ws.send(JSON.stringify({
      type: 'AUDIO_DATA',
      pcmBuffer: data
    }));
  });

  // Turn detection events
  liveSession.on('turnStart', () => {
    ws.send(JSON.stringify({ type: 'AI_SPEECH_START' }));
  });

  liveSession.on('turnComplete', () => {
    ws.send(JSON.stringify({ type: 'AI_SPEECH_END' }));
  });

  // Process incoming messages from client
  ws.on('message', async (message) => {
    const data = JSON.parse(message);

    if (data.type === 'MUSIC_STATE_CHANGE') {
      console.log(`Client music state: ${data.payload.category} (Playing: ${data.payload.isPlaying})`);
    } else if (data.realtimeInput) {
      // Pass clean microphone audio into Gemini Live API
      await liveSession.send(data.realtimeInput);
    }
  });

  ws.on('close', () => {
    liveSession.close();
  });
});

console.log('Baiji Gemini Live WebSocket Server running on ws://localhost:8080');
