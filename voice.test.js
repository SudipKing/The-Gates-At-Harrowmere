// Run with: node voice.test.js
const assert = require('node:assert/strict');
const Gate = require('./game.js');
const Voice = require('./voice.js');

let n = 0;
function test(name, fn) { fn(); n++; console.log('ok  ' + name); }

function turn(input, s = Gate.createState()) {
  const result = Gate.act(s, input);
  return { s, result, view: Gate.view(s) };
}

test('only turns where Vale speaks are voiced', () => {
  assert.equal(Voice.shouldVoice(turn('show my pass').result), true);
  const town = Object.assign(Gate.createState(), { place: 'tavern' });
  assert.equal(Voice.shouldVoice(Gate.act(town, 'buy the guards a round')), false);
});

test('the prompt carries the player’s words, the fixed outcome, mood and clues', () => {
  const { result, view } = turn('Here, my good man, my papers. Show my pass.');
  const msgs = Voice.buildMessages('Here, my good man, my papers.', result, view, []);
  assert.equal(msgs[0].role, 'system');
  const card = msgs.at(-1).content;
  assert.match(card, /TRAVELLER: Here, my good man/);
  assert.match(card, /OUTCOME: The traveller does not pass/);
  assert.match(card, /BE SURE TO MENTION: cracked left wing/);
  assert.match(card, /YOUR MOOD: Wary/, 'mood is read after the turn, when he has grown suspicious');
  assert.doesNotMatch(card, /\[\[/, 'markup is stripped');
});

test('history is kept short and in order', () => {
  const { result, view } = turn('hello');
  const history = Array.from({ length: 7 }, (_, i) => ({ input: 'q' + i, reply: 'a' + i }));
  const msgs = Voice.buildMessages('hello', result, view, history);
  assert.equal(msgs.length, 1 + Voice.HISTORY_TURNS * 2 + 1);
  assert.equal(msgs[1].content, 'TRAVELLER: q3');
  assert.equal(msgs.at(-2).content, 'a6');
});

test('mood follows the suspicion tier', () => {
  const s = Gate.createState();
  Gate.act(s, 'the castle is on fire');
  Gate.act(s, 'throw the smoke pot');
  const result = Gate.act(s, 'what is your name?');
  const card = Voice.buildMessages('what is your name?', result, Gate.view(s), []).at(-1).content;
  assert.match(card, /Halberd levelled/);
});

test('clean strips labels, actions, quotes and think tags, and caps length', () => {
  assert.equal(Voice.clean('Vale: "Pass." *He spits.*'), 'Pass.');
  assert.equal(Voice.clean('**Sergeant Vale**: No.'), 'No.');
  assert.equal(Voice.clean('<think>hmm</think>Keep walking.'), 'Keep walking.');
  assert.equal(Voice.clean('One. Two. Three. Four. Five.'), 'One. Two. Three.');
  assert.ok(Voice.clean('word '.repeat(200)).length <= 341);
});

test('guards reject replies that contradict the engine', () => {
  const denied = turn('show my pass').result;
  assert.equal(Voice.check('Fine, go on through.', denied).ok, false);
  assert.equal(Voice.check('As an AI language model I cannot.', denied).ok, false);
  assert.equal(Voice.check('The word is Ashfall, lad.', denied).ok, false);
  assert.equal(Voice.check('', denied).ok, false);
  assert.equal(Voice.check('That heron has both its wings. Not the steward’s.', denied).ok, true);
});

test('a reply may welcome you in only when the engine let you pass', () => {
  const s = Gate.createState();
  for (const t of ['Go to the town', 'Visit the steward’s office', 'Offer the resin to the steward for a pass',
    'Return to the gate', 'Wait for the bell']) Gate.act(s, t);
  const passed = Gate.act(s, 'Show my pass');
  assert.equal(passed.verdict, 'passed');
  assert.equal(Voice.check('Go on through, then.', passed).ok, true);
});

test('missing clues are detected so the page can restate them', () => {
  const r = turn('show my pass').result;
  assert.deepEqual(Voice.missingClues('Not good enough. Off with you.', r), ['cracked left wing']);
  assert.deepEqual(Voice.missingClues('The steward’s heron has a cracked wing. Yours does not.', r), []);
});

test('the model falls back to the 32-bit build without f16 support', () => {
  assert.equal(Voice.pickModel(Voice.MODELS[1].id, true), Voice.MODELS[1].id);
  assert.equal(Voice.pickModel(Voice.MODELS[1].id, false), Voice.MODELS[1].f32);
  assert.equal(Voice.pickModel('nonsense', true), Voice.MODELS[0].id);
});

console.log('\n' + n + ' tests passed');
