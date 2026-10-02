// Voice narration with the browser's built-in speech synthesis (no audio files).
// Text is rewritten for the ear (CO₂ → "carbon dioxide", µmol → "micromoles"),
// split into sentences (long utterances get cut off in some browsers) and
// spoken in sequence. The tour asks `speaking` before moving to the next stop.
window.VC = window.VC || {};
(function (VC) {
  'use strict';

  const SAY = [
    [/µmol e⁻ m⁻² s⁻¹/g, 'micromoles of electrons per square metre per second'],
    [/µmol m⁻² s⁻¹/g, 'micromoles per square metre per second'],
    [/µm³/g, 'cubic micrometres'],
    [/µmol/g, 'micromoles'],
    [/µm\b/g, 'micrometres'],
    [/pmol C h⁻¹|pmol C\/h/g, 'picomoles of carbon per hour'],
    [/pmol/g, 'picomoles'],
    [/\bMPa\b/g, 'megapascals'],
    [/m²/g, 'square metre'],
    [/°C/g, ' degrees'],
    [/H₂O₂/g, 'hydrogen peroxide'],
    [/H₂O/g, 'water'],
    [/CO₂/g, 'carbon dioxide'],
    [/O₂/g, 'oxygen'],
    [/NH₃/g, 'ammonia'],
    [/NH₄⁺/g, 'ammonium'],
    [/NO₃⁻/g, 'nitrate'],
    [/K⁺/g, 'potassium'],
    [/H⁺/g, 'protons'],
    [/b₆f/g, 'b six f'],
    [/\bNADPH\b/g, 'N A D P H'],
    [/\bATP\b/g, 'A T P'],
    [/\bmRNA\b/g, 'messenger R N A'],
    [/\bDNA\b/g, 'D N A'],
    [/\bRNA\b/g, 'R N A'],
    [/\bTPT\b/g, 'T P T'],
    [/\bAOX\b/g, 'alternative oxidase'],
    [/\bER\b/g, 'E R'],
    [/\bGS\b/g, 'G S'],
    [/\bGOGAT\b/g, 'GO-GAT'],
    [/\bTOC\b/g, 'tock'],
    [/\bTIC\b/g, 'tick'],
    [/\bTCA\b/g, 'T C A'],
    [/(\d)×/g, '$1 times'],
    [/×/g, ' times '],
    [/→/g, ' to '],
    [/~/g, 'about '],
    [/[₀-₉⁰-⁹⁻⁺]/g, ''],
    [/\s+/g, ' '],
  ];

  class Narrator {
    constructor() {
      this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
      this.enabled = false;
      this.speaking = false;
      this.paused = false;
      this.gen = 0;
      // Nature-documentary delivery: unhurried, slightly low, with pauses.
      this.rate = 0.86;
      this.pitch = 0.88;
      this.pauseMs = 420;
      this.voice = null;
      this.lastEnd = 0;
      if (this.supported) {
        const pick = () => { this.voice = this._pick(); };
        pick();
        try { window.speechSynthesis.addEventListener('voiceschanged', pick); } catch (e) { window.speechSynthesis.onvoiceschanged = pick; }
      }
      try { this.enabled = this.supported && localStorage.getItem('vc-voice') === 'on'; } catch (e) { /* storage blocked */ }
    }

    // Prefer natural-sounding English voices when the device has them.
    _pick() {
      const vs = window.speechSynthesis.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang));
      // A warm, mature British male voice suits a nature documentary best.
      const gb = vs.filter((v) => /en[-_]GB/i.test(v.lang));
      const prefs = [
        [gb, /Microsoft (Ryan|George|Thomas|Alfie|Arthur).*(Natural|Online)/i], [gb, /(natural|neural|premium|enhanced).*/i],
        [vs, /Microsoft (Ryan|George|Thomas)/i], [vs, /Google UK English Male/i], [vs, /\b(Daniel|Arthur|Oliver|Malcolm)\b/i],
        [gb, /male/i], [gb, /./], [vs, /natural|neural|premium|enhanced/i], [vs, /Google US English/i],
      ];
      for (const [list, p] of prefs) { const v = list.find((x) => p.test(x.name)); if (v) return v; }
      return vs.find((v) => v.default) || vs[0] || null;
    }

    static speakable(text) {
      let s = ' ' + text + ' ';
      for (const [re, rep] of SAY) s = s.replace(re, rep);
      return s.trim();
    }

    setEnabled(on) {
      this.enabled = !!on && this.supported;
      try { localStorage.setItem('vc-voice', this.enabled ? 'on' : 'off'); } catch (e) { /* ignore */ }
      if (!this.enabled) this.stop();
    }

    say(text) {
      if (!this.supported || !this.enabled) return;
      this.stop();
      const gen = ++this.gen;
      const clean = Narrator.speakable(text);
      const parts = clean.match(/[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g) || [clean];
      let i = 0;
      this.speaking = true;
      this.paused = false;
      const next = () => {
        if (gen !== this.gen) return;
        if (i >= parts.length) { this.speaking = false; this.lastEnd = performance.now(); return; }
        if (this.paused) { setTimeout(next, 250); return; }
        const u = new SpeechSynthesisUtterance(parts[i++].trim());
        if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else u.lang = 'en-GB';
        u.rate = this.rate;
        u.pitch = this.pitch;
        u.onend = () => setTimeout(next, this.pauseMs);
        u.onerror = (e) => {
          // 'not-allowed' means the browser wants a click first: stop quietly.
          if (e && e.error === 'not-allowed') { this.speaking = false; this.blocked = true; return; }
          next();
        };
        window.speechSynthesis.speak(u);
      };
      next();
    }

    stop() {
      this.gen++;
      this.speaking = false;
      this.paused = false;
      if (this.supported) window.speechSynthesis.cancel();
    }

    pause() { if (this.supported && this.speaking) { window.speechSynthesis.pause(); this.paused = true; } }
    resume() { if (this.supported && this.paused) { window.speechSynthesis.resume(); this.paused = false; } }

    // True while narration should hold the story on the current stop.
    holding(minGap = 900) {
      return this.enabled && (this.speaking || performance.now() - this.lastEnd < minGap);
    }
  }

  VC.Narrator = Narrator;
})(window.VC);
