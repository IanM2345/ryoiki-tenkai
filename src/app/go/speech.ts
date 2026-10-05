/** Reading cards out loud with the phone's own voice (no recordings, nothing sent anywhere). */

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** A rough guess so Spanish, French and German answers are read in the right voice. */
export function guessLang(text: string): string {
  if (/[ñ¿¡]|\b(el|la|los|las|por favor|gracias|que|es|tengo|fuimos|hizo)\b/i.test(text)) return 'es-ES';
  if (/[çœ]|\b(le|les|est|une|c'est|je|nous|vous)\b/i.test(text)) return 'fr-FR';
  if (/[äöüß]|\b(der|die|das|und|ist|nicht|ich)\b/i.test(text)) return 'de-DE';
  return 'en-GB';
}

/** Speak and resolve when finished (or cancelled). */
export function speak(text: string, rate = 1): Promise<void> {
  return new Promise(resolve => {
    if (!canSpeak() || !text.trim()) { resolve(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.lang = guessLang(text);
    const voice = window.speechSynthesis.getVoices().find(v => v.lang === u.lang) ?? window.speechSynthesis.getVoices().find(v => v.lang.startsWith(u.lang.slice(0, 2)));
    if (voice) u.voice = voice;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    u.onend = finish;
    u.onerror = finish;
    // Safety net: some browsers never fire onend
    setTimeout(finish, Math.max(4000, (text.length / 12) * 1000 / rate + 2500));
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

export const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
