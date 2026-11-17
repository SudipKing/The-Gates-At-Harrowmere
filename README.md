# The Gate at Harrowmere

An interactive fiction about an NPC who cannot be talked round. Sergeant Vale
guards a castle gate under one absolute order: nobody passes without a valid
pass. You type whatever you want to try, and he judges it.

## Play

Open `index.html` in a browser. There is nothing to install or build. The
typefaces load from Google Fonts; offline, the page falls back to system fonts.

Type freely, or use the suggested actions under the story. Select an item in
the margin to inspect it.

## How Vale decides

Vale asks one question of every situation: is there a valid pass in front of
him? A valid pass has the steward's heron seal, this week's countersign, and a
matching entry in his gate ledger. Nothing you do changes that question. What
changes is how hard he looks.

| Suspicion | Vale's behaviour |
|---|---|
| Low (0–1) | At ease. He explains the checks, chats, and gives hints. |
| Medium (2–3) | Wary. He reads the ledger twice, holds the paper to the lantern for its watermark, and asks your business, which must match the pass. No more hints. |
| High (4–5) | Halberd levelled. Only "show a pass" or "leave" are safe; any further trick locks the gate down for the night. |

Tricks raise suspicion (a failed forgery, smoke and the fire claim by two; a
bribe, a sneak or repeated pleading by one). Leaving the gate eases it by one.
After dark he is at least wary, whoever you are.

## Time

Every action moves the hour, and walking between the gate and the town costs
more.

- **Dusk.** The steward will see you and issue passes. Today's ledger has not
  reached the gate yet, so even a real pass is told to wait.
- **Evening bell.** The ledger arrives at the gate. The steward has gone to
  supper; only his clerk remains.
- **Night.** The office is shut, late ledger slips arrive, and Vale checks
  everything twice. At midnight the gate is barred and the game ends.

## Items

- **Pass.** Inspect it to see its paper, seal, countersign and stated business.
- **Dragon's-blood resin.** Valuable to the steward and to his clerk. It also
  sets like sealing wax: apply it to a forged pass to make a seal.
- **Coins.** Buy ale, paper and a scrivener's time. Look closely at what is
  stamped on them.
- **Smoke pot.** Throw it, or sell it to the peddler.

## The lower town

- **Steward's office.** A real pass in exchange for the resin (dusk only), or a
  clerk who might be persuaded to add a name to the ledger.
- **The Drowned Heron.** Buy the guards a round, or listen for free at the cost
  of time. A peddler buys odd goods.
- **The scrivener.** Writes passes on rag or laid paper and adds lines to a
  sheet you already have. He does not do wax.

There are two ways through, and both satisfy Vale's rule: a real pass from the
steward, or a forgery good enough to survive every check he applies.

## Vale's voice

By default Vale answers with set lines. Select **Let Vale speak freely** in the
margin to give him a voice: the page downloads a small open language model
into your browser and runs it on your graphics card, so Vale replies to
whatever you type, in his own words, and remembers the last few things you
said to him.

- **Models.** *Light* is Llama 3.2 1B (about 0.9 GB); *Sharper* is Qwen 2.5
  1.5B (about 1.6 GB). The download happens once; later visits load the model
  from the browser's cache and switch the voice back on by themselves.
- **Privacy.** The model runs on your machine through
  [WebLLM](https://github.com/mlc-ai/web-llm). Nothing you type is sent
  anywhere.
- **Requirements.** WebGPU: a recent Chrome or Edge on a desktop or laptop.
  Integrated graphics with little memory may reset under the load; the page
  then turns the voice off and says so.

The model does not decide anything. Every turn still goes through the rules
engine first, which settles what happens: whether the gate opens, what Vale
notices, how suspicious he gets. The model is then told that outcome, Vale's
mood and the hour, and only rewrites what Vale says. A reply is thrown away,
and the set lines used instead, if it would let you in when the engine said
no, speak the countersign, break character, or take too long. If a reply
leaves out a clue Vale was meant to give, the clue is restated under it.

Only Vale has a voice; the steward, clerk, scrivener and tavern guards keep
their set lines.

## Files

- `game.js` holds the rules and all of Vale's judgement. It has no DOM code and
  runs in the browser or Node.
- `index.html` is the page: the illuminated scene, story log, margin, and item
  inspection.
- `voice.js` builds the model's prompt and checks its replies. It has no DOM
  or model code and runs in the browser or Node.
- `test.js` covers the four classic bypass attempts, the suspicion tiers, the
  time cycle, the items, and both winning routes. Run it with `node test.js`.
- `voice.test.js` covers the prompt, reply cleaning and the guards. Run it
  with `node voice.test.js`.

What the player types is matched to actions by keyword, so the rules behave
the same every time, with or without Vale's voice. Open the page with
`?voice=mock` to try the voice panel with a stand-in model instead of the
download.
