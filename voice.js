/*
 * Vale's voice — turns the engine's verdict into Vale's own words.
 *
 * The rules engine (game.js) still decides everything that happens: whether
 * the gate opens, what Vale notices, how suspicious he gets. A small language
 * model running in the player's browser only rewrites what Vale SAYS, so he
 * answers what the player actually typed instead of repeating a fixed line.
 *
 * This file has no DOM or model code: it builds the prompt, cleans the
 * model's reply, and rejects replies that would contradict the engine. If a
 * reply is rejected, the page falls back to the engine's scripted lines.
 * Works in the browser (window.ValeVoice) and in Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./game.js'));
  else root.ValeVoice = factory(root.Gate);
})(typeof self !== 'undefined' ? self : this, function (Gate) {
  'use strict';

  var MODELS = [
    // Qwen 2.5 1.5B was tried as a larger option and gave rambling, off-tone
    // replies in the same test where this model stayed short and in voice.
    { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', f32: 'Llama-3.2-1B-Instruct-q4f32_1-MLC', name: 'Llama 3.2 1B', size: 'about 0.9 GB' }
  ];
  var HISTORY_TURNS = 4;
  var MAX_SENTENCES = 3;
  var TEMPERATURE = 0.5;
  var MAX_CHARS = 340;

  // Small models do far better paraphrasing a line they are given than
  // improvising, so every turn hands the model the engine's own line as the
  // meaning to keep, plus a few worked examples of the voice.
  var SYSTEM = [
    'You write the spoken lines of Sergeant Vale, the gruff old guard of a castle gate.',
    'Vale is blunt, dry and brief. He never lets anyone in without a valid pass, and nothing else moves him.',
    'Each turn you get what the traveller said and what Vale means to say back.',
    'Reply with Vale’s words only: one or two short, plain sentences that answer what the traveller said and keep Vale’s meaning.',
    'No narration, no actions, no quotation marks, no poetry. Never change what happens.'
  ].join('\n');

  var EXAMPLES = [
    ['Lovely evening, isn’t it?', 'Sergeant Vale. Nineteen years on this arch. I’m told I’m poor company. Pass?', 'Lovely for some. I’ve seen nineteen years of evenings from this arch. Pass?', 'At ease'],
    ['The baron himself sent me. Stand aside!', 'Then whoever sent you will have given you a pass, because everyone who matters knows about me. No pass, and I have to wonder who you really are.', 'If the baron sent you, he sent a pass with you. No pass, and I start wondering who you really are.', 'At ease'],
    ['Here, a silver piece for your trouble.', 'That’d buy my daughter a dowry and me a rope. Put it away. He issues passes. I only read them.', 'Keep your silver. A bribe buys me a rope, not you a way in. The steward sells passes; I only read them.', 'Wary']
  ];

  var OUTCOMES = {
    passed: 'Vale steps aside and lets them through.',
    arrested: 'Vale calls the watch to seize them.',
    lockdown: 'Vale shuts the gate for the night.',
    barred: 'The gate is barred until morning.'
  };
  var MOODS = { low: 'At ease', medium: 'Wary', high: 'Hostile, halberd levelled' };

  // ---------- reading an engine result ----------

  function valeIndices(result) {
    var out = [];
    result.lines.forEach(function (l, i) { if (l.who === 'vale') out.push(i); });
    return out;
  }

  function shouldVoice(result) {
    return valeIndices(result).length > 0;
  }

  // Clues Vale's lines carry, e.g. "cracked left wing". The margin records
  // them either way, but the prose should not silently drop them.
  function clues(result) {
    var found = [];
    result.lines.forEach(function (l) {
      if (l.who !== 'vale') return;
      l.text.replace(/\[\[c:([^\]]*)\]\]/g, function (_, c) { found.push(c); });
    });
    return found;
  }

  // ---------- prompt ----------

  function said(text) { return 'Traveller: "' + String(text).replace(/"/g, "'") + '"'; }

  function card(input, result, view) {
    var means = result.lines.filter(function (l) { return l.who === 'vale'; })
      .map(function (l) { return Gate.plain(l.text); }).join(' ');
    var c = clues(result);
    var lines = [said(input), 'Vale means: "' + means + '"'];
    if (c.length) lines.push('Must mention: ' + c.join('; '));
    if (OUTCOMES[result.verdict]) lines.push('Outcome: ' + OUTCOMES[result.verdict]);
    lines.push('Mood: ' + MOODS[view.tier]);
    return lines.join('\n');
  }

  // history: [{ input, reply }], oldest first.
  function buildMessages(input, result, view, history) {
    var msgs = [{ role: 'system', content: SYSTEM }];
    EXAMPLES.forEach(function (e) {
      msgs.push({ role: 'user', content: [said(e[0]), 'Vale means: "' + e[1] + '"', 'Mood: ' + e[3]].join('\n') });
      msgs.push({ role: 'assistant', content: e[2] });
    });
    (history || []).slice(-HISTORY_TURNS).forEach(function (h) {
      msgs.push({ role: 'user', content: said(h.input) });
      msgs.push({ role: 'assistant', content: h.reply });
    });
    msgs.push({ role: 'user', content: card(input, result, view) });
    return msgs;
  }

  // ---------- cleaning ----------

  function clean(raw) {
    var t = String(raw || '');
    t = t.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '');
    t = t.replace(/\*[^*]*\*/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
    t = t.replace(/^\s*(\*\*)?(sergeant\s+)?(brannoch\s+)?vale(\*\*)?\s*:\s*/i, '');
    t = t.replace(/^\s*(traveller|outcome|vale means|must mention|mood)\s*:.*$/gim, '');
    t = t.replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
    var sentences = t.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [];
    t = sentences.slice(0, MAX_SENTENCES).join('').trim();
    if (t.length > MAX_CHARS) {
      var cut = t.slice(0, MAX_CHARS);
      var end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
      t = end > 40 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
    }
    return t;
  }

  // ---------- guards ----------

  var PROMISES_ENTRY = /\b(go (on )?(through|in|inside)|you may (pass|enter|go)|come (on )?in|step (through|inside|in)|i('| wi)ll let you|welcome (in|inside|to)|the gate is open to you|in you go|pass,? friend)\b/i;
  var OUT_OF_CHARACTER = /\b(end of (the|this) conversation|role-?play|the traveller says|vale means|as an ai|language model|i('| a)m an? (ai|assistant|bot)|i cannot (help|assist)|openai|chatgpt|meta ai)\b/i;

  function check(reply, result) {
    if (!reply || reply.replace(/[^a-z]/gi, '').length < 2) return { ok: false, reason: 'empty' };
    if (OUT_OF_CHARACTER.test(reply)) return { ok: false, reason: 'out of character' };
    var engineSaid = result.lines.map(function (l) { return l.text; }).join(' ');
    var word = Gate.COUNTERSIGN.toLowerCase();
    if (reply.toLowerCase().indexOf(word) >= 0 && engineSaid.toLowerCase().indexOf(word) < 0) {
      return { ok: false, reason: 'spoke the countersign' };
    }
    if (result.verdict !== 'passed' && PROMISES_ENTRY.test(reply)) return { ok: false, reason: 'promised entry' };
    return { ok: true };
  }

  var STOP = { this: 1, that: 1, with: 1, your: 1, from: 1, until: 1, under: 1, which: 1, look: 1, everything: 1, comes: 1 };
  function keyWords(phrase) {
    return Gate.plain(phrase).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
      .filter(function (w) { return w.length >= 4 && !STOP[w]; });
  }

  // Clues the reply failed to get across (at least half their key words missing).
  function missingClues(reply, result) {
    var said = ' ' + String(reply).toLowerCase() + ' ';
    return clues(result).filter(function (c) {
      var words = keyWords(c);
      if (!words.length) return false;
      var hits = words.filter(function (w) { return said.indexOf(w.slice(0, Math.max(4, w.length - 2))) >= 0; }).length;
      return hits * 2 < words.length;
    });
  }

  function pickModel(id, hasF16) {
    var m = MODELS.filter(function (x) { return x.id === id || x.f32 === id; })[0] || MODELS[0];
    return hasF16 ? m.id : m.f32;
  }

  return {
    TEMPERATURE: TEMPERATURE, MODELS: MODELS, SYSTEM: SYSTEM, EXAMPLES: EXAMPLES, HISTORY_TURNS: HISTORY_TURNS,
    valeIndices: valeIndices, shouldVoice: shouldVoice, clues: clues,
    buildMessages: buildMessages, clean: clean, check: check, missingClues: missingClues,
    pickModel: pickModel
  };
});
