# jammies

---

## what is this

desktop buddy is a tamagotchi-style companion app that floats on top of all your windows. it hatches from an egg, develops a personality based on a short quiz, and reacts to your computer activity in real time, powered by a local llm so everything stays on your machine.

no two buddies are the same. same species, totally different personality depending on who's raising it.

---

## feats

### egg 
- app launches with a floating egg
- egg wiggles and wobbles while you wait
- egg cracks open and reveals your pet species 

### personality quiz
- immediately after your egg hatches, a short quiz appears before your buddy "wakes up"
- 4 sliders with opposing values:
  - keeps it in <-> puts it out (I/E)
  - what's real <-> what could be (S/N)
  - soft read <-> sharp read (F/T)
  - loose <-> locked (J/P)
- answers determine your buddy's personality out of 16 personality types, organized into:
  - sharp: INTJ sharp strategist, INTP sharp eccentric, ENTJ sharp commander, ENTP sharp debater
  - serene: INFJ serene visionary, INFP serene dreamer, ENFJ serene mentor, ENFP serene enthusiast
  - steady: ISTJ steady realist, ISFJ steady nurturer, ESTJ steady manager, ESFJ steady socialite
  - swift: ISTP swift operator, ISFP swift artist, ESTP swift risk-taker, ESFP swift entertainer

### activity watching
buddy watches what apps and processes you have open and reacts accordingly
- reading the active window title and running process list

### real-time commentary
- buddy floats on your screen in a small frameless always-on-top window
- speech bubble pops up with a short 1–2 line comment when triggered
- max one unprompted comment every 5 minutes so it doesn't get annoying (?)
- click your buddy any time to prompt an immediate reaction

### local llm
- runs entirely on your machine via ollama (?)
- system prompt adapts over time based on your usage patterns and how you interact with your buddy
- personality deepens the longer you use it

### pixel art sprites
- all buddies are 16×16 pixel art
- multiple animation states per species: idle, happy, judging, sleepy, hyped
- `image-rendering: pixelated` so they stay crisp at any size
- each species has its own distinct design — personality is layered on top

---

## how it works

```
first launch → egg appears on desktop
     ↓
click on it x amount of times to hatch
     ↓
egg cracks open → species revealed
     ↓
personality quiz appears (4 sliders)
     ↓
quiz result is saved locally and injected into the ollama system prompt
     ↓
buddy wakes up with derived personality
     ↓
buddy floats on your screen
watches your apps → generates commentary via ollama
click system tray thingy at the top (mac) or bottom (windows) → open dashboard
```

---

## privacy

- active window title and process list are read to detect app context 
  - opt in for keystrokes & file contents
- all llm inference runs locally via ollama
- all pet state and memory stored in a local json file

---

## stack

- **electron**: cross-platform desktop app, floating windows, system tray
- **html/css/canvas**: buddy rendering with pixelated scaling
- **ollama**: local llm inference (llama 3 / mistral)
- **node child_process**: active window + process detection
- **local json / sqlite**: pet state and memory persistence


---

## ollama set up (dev)

- runs the local llm used by the app. contributors can install ollama and pull the project model like so:

- install ollama w/ the official installer:

```bash
npm run setup:ollama
```

- pull the model:

```bash
npm run pull-model
```

- `scripts/get-ollama.sh` runs the official installer from https://ollama.com. for distribution builds, we can package the platform specific ollama binaries into the release artifacts...
---

## commands
- pin position to screen: `Cmd` + `Opt` + `Shift` + `S`

---

## open questions

- [ ] can you have multiple buddies, or just one at a time?
- [ ] what happens if you neglect your buddy for too long?
