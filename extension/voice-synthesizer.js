/**
 * Voice Synthesizer
 * Converts answers to speech using Web Speech API
 */

class VoiceSynthesizer {
  constructor() {
    this.synth = window.speechSynthesis;
    this.isSupported = 'speechSynthesis' in window;
    this.isPlaying = false;
  }

  /**
   * Speak text using Web Speech API
   */
  async speak(text, options = {}) {
    if (!this.isSupported) {
      console.error('Speech Synthesis not supported');
      return false;
    }

    return new Promise((resolve) => {
      // Cancel any ongoing speech
      this.synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);

      // Configure voice options
      utterance.rate = options.rate || 1.0;
      utterance.pitch = options.pitch || 1.0;
      utterance.volume = options.volume || 1.0;
      utterance.lang = options.lang || 'en-US';

      // Event handlers
      utterance.onstart = () => {
        this.isPlaying = true;
        console.log('Speaking started');
      };

      utterance.onend = () => {
        this.isPlaying = false;
        resolve(true);
      };

      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event.error);
        this.isPlaying = false;
        resolve(false);
      };

      // Speak
      this.synth.speak(utterance);
    });
  }

  /**
   * Speak answer with natural pauses
   */
  async speakAnswer(answer) {
    if (!this.isSupported) {
      console.log('Voice not supported, showing text answer');
      return false;
    }

    try {
      // Add intro
      const intro = "Let me read this answer to you.";
      await this.speak(intro, { rate: 1.0 });

      // Pause slightly
      await new Promise(resolve => setTimeout(resolve, 500));

      // Speak main answer
      await this.speak(answer, { rate: 0.95, pitch: 1.0 });

      return true;
    } catch (error) {
      console.error('Error speaking answer:', error);
      return false;
    }
  }

  /**
   * Stop speaking
   */
  stop() {
    this.synth.cancel();
    this.isPlaying = false;
  }

  /**
   * Get available voices
   */
  getVoices() {
    return this.synth.getVoices();
  }

  /**
   * Speak decision summary
   */
  async speakDecisionSummary(decisions) {
    if (!this.isSupported) return false;

    const summary = `We found ${decisions.length} decisions. ` +
      decisions.map((d, i) => `Decision ${i + 1}: ${d.title}`).join('. ');

    return await this.speak(summary, { rate: 0.9 });
  }
}

// Export for use
const voiceSynth = new VoiceSynthesizer();