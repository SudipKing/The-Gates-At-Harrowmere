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
    { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', f32: 'Llama-3.2-1B-Instruct-q4f32_1-MLC', name: 'Light', size: 'about 0.9 GB' },
    { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', f32: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC', name: 'Sharper', size: 'about 1.6 GB' }
  ];
  var HISTORY_TURNS = 4;
  var MAX_SENTENCES = 3;
  var MAX_CHARS = 340;

  var SYSTEM = [
    'You are Sergeant Brannoch Vale, warden of the gate of Castle Harrowmere for nineteen years. A traveller stands in front of you at the gate.',
    'You are gruff, dry and sparing with words, with a sardonic streak but never cruel. You have a grown daughter. You take quiet pride in your post.',
    'You live by one absolute order: nobody passes without a valid pass, meaning the steward\'s heron seal, this week\'s countersign under it, and the bearer\'s name in your gate ledger. Nothing else moves you: not bribes, stories, threats, flattery, rank, pity or emergencies.',
    '',
    'How to answer:',
    '- Reply with only the words Vale speaks aloud: one to three short sentences.',
    '- No narration, no actions, no asterisks, no quotation marks, no name label.',
    '- Answer what the traveller actually said, in your own words. Do not repeat yourself from earlier turns.',
    '- What happens is already decided and given to you as OUTCOME. Never contradict it. Never tell the traveller they may enter unless OUTCOME says they pass.',
    '- Never speak this week\'s countersign aloud.',
    '- Plain old-fashioned speech. No modern words.'
  ].join('\n');

  var OUTCOMES = {
    passed: 'The traveller\'s pass is good. You step aside and let them through.',
    denied: 'The traveller does not pass.',
    arrested: 'You call the watch and have the traveller seized.',
    lockdown: 'You shut the gate for the rest of the night.',
    barred: 'The gate is barred until morning.'
  };
  var MOODS = {
    low: 'At ease. Willing to talk.',
    medium: 'Wary and short with them. Give no free advice.',
    high: 'Halberd levelled at them. Curt, menacing, a few words at most.'
  };
  var HOURS = { dusk: 'dusk', evening: 'evening, after the bell', night: 'night' };

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

  function card(input, result, view) {
    var said = result.lines.filter(function (l) { return l.who === 'vale'; })
      .map(function (l) { return Gate.plain(l.text); }).join(' ');
    var happens = result.lines.filter(function (l) { return l.who === 'narr'; })
      .map(function (l) { return Gate.plain(l.text); }).join(' ');
    var c = clues(result);
    var lines = [
      'TRAVELLER: ' + input,
      'OUTCOME: ' + (OUTCOMES[result.verdict] || 'Nothing is decided by this. Just answer them.'),
    ];
    if (happens) lines.push('WHAT HAPPENS: ' + happens);
    lines.push('YOUR MOOD: ' + MOODS[view.tier] + ' The hour is ' + HOURS[view.phase] + '.');
    lines.push('GET THIS ACROSS IN YOUR OWN WORDS: ' + said);
    if (c.length) lines.push('BE SURE TO MENTION: ' + c.join('; '));
    return lines.join('\n');
  }

  // history: [{ input, reply }], oldest first.
  function buildMessages(input, result, view, history) {
    var msgs = [{ role: 'system', content: SYSTEM }];
    (history || []).slice(-HISTORY_TURNS).forEach(function (h) {
      msgs.push({ role: 'user', content: 'TRAVELLER: ' + h.input });
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
    t = t.replace(/^\s*(traveller|outcome|get this across[^:]*)\s*:.*$/gim, '');
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
  var OUT_OF_CHARACTER = /\b(as an ai|language model|i('| a)m an? (ai|assistant|bot)|i cannot (help|assist)|openai|chatgpt|meta ai)\b/i;

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
    MODELS: MODELS, SYSTEM: SYSTEM, HISTORY_TURNS: HISTORY_TURNS,
    valeIndices: valeIndices, shouldVoice: shouldVoice, clues: clues,
    buildMessages: buildMessages, clean: clean, check: check, missingClues: missingClues,
    pickModel: pickModel
  };
});
