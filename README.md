# They Live Adblocker

![They Live billboards](docs/they-live-billboards.jpg)

A fork of [uBlock Origin Lite](https://github.com/uBlockOrigin/uBOL-home) that, instead of *hiding* cosmetically-blocked ads, **replaces** them with white tiles bearing slogans from John Carpenter's 1988 film *They Live*:

> **OBEY · CONSUME · WATCH TV · SLEEP · SUBMIT · CONFORM · STAY ASLEEP · BUY · WORK 8 HOURS · NO INDEPENDENT THOUGHT · DO NOT QUESTION AUTHORITY · MARRY AND REPRODUCE · NO IMAGINATION · NO IDEAS · HONOR APATHY · PLAY 8 HOURS · WORK 8 HOURS · OBEY**

Each blocked ad gets a single phrase — random by default, or precisely matched to the ad's content when the optional AI classification feature is enabled.

**Hover** over any tile to peek at the original ad underneath; move the mouse away to restore the slogan.

The idea is from a blog post I wrote in 2015 (and never got around to building): [_They Live adblock mode_](https://proceduralgraphics.blogspot.com/2015/04/they-live-adblock-mode.html).

## Screenshot

<img width="395" height="399" alt="reddit_screenshot" src="https://github.com/user-attachments/assets/908b6602-078a-4d78-abc0-9ca13e22d62e" />

---

## Features

### 🎯 AI-powered classification (optional)

Enable **They Live AI** in the dashboard to have an LLM read each ad's surrounding context (element class names, nearby text, `alt` attributes, advertiser domain, ad SDK data attributes) and pick a more fitting slogan — e.g. a car ad gets **CONSUME**, a political piece gets **DO NOT QUESTION AUTHORITY**, a job listing gets **WORK 8 HOURS**.

- Calls are batched in ~250 ms windows; a random phrase is shown immediately while the LLM response is in flight, then swapped when it arrives
- Fast-path domain/keyword rules fire instantly (no LLM call needed) for ~120 known ad domains and common keyword patterns
- Startup race handled: ads tagged before settings load are re-queued and re-classified once AI is confirmed enabled

### 🕵️ Your Ad Profile

The dashboard's **Your Ad Profile** section reverse-engineers what ad brokers have inferred about you, based solely on the ads served to you:

| Signal | What it shows |
|--------|--------------|
| **Interest segments** | Broker-category labels derived from the phrases assigned to your ads (e.g. *Home & Finance*, *Tech & Gadgets*, *Career & Work*), shown as a bar chart |
| **Retargeting tracker** | Advertisers whose domains have appeared across 2+ different pages — i.e. they are actively following you |
| **Raw targeting data** | Any decoded `cust_params` from Google Ad Manager iframes (publisher-defined first-party segments such as `age=25-34&interests=travel`) |
| **Profile intensity score** | 0–10 score combining interest breadth and retargeting depth |

#### Analyse with AI

With AI enabled, click **Analyse with AI** to get a sardonic, bullet-pointed breakdown of what your ad profile says about you in the language of the ad industry — CPM value, purchase intent, income bracket and all.

---

## AI setup

### Ollama Cloud (no local install needed)

1. Create a free account at [ollama.com](https://ollama.com) and generate an API key.
2. Open the extension dashboard → **They Live AI** section.
3. Check **Enable AI classification**.
4. Leave the URL as `https://ollama.com`, model as `gemma4:31b-cloud`, and paste your API key.
5. Click **Save**.

### Local Ollama instance

If you have [Ollama](https://ollama.com/download) installed locally, set the URL to `http://localhost:11434` and choose any model you have pulled (e.g. `gemma3:4b`). Leave the API key blank.

---

## Hover to peek

Move your mouse over any **OBEY** / **CONSUME** tile to temporarily reveal the original ad content beneath. Moving the mouse away restores the slogan tile. No clicks needed — it's purely CSS.

---

## Install

Download the latest **`uBOLite_theylive.chromium.zip`** from the [Releases page](https://github.com/NaphatrB/they_live_adblocker/releases), extract it, then in Chromium / Chrome / Brave / Edge:

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top-right)
3. Click **Load unpacked** and select the extracted folder

Keep the folder around — the extension is loaded from that path.

### Firefox

1. Go to `about:debugging` → **This Firefox**
2. Click **Load Temporary Add-on…**
3. Select the `manifest.json` inside the extracted folder

> The extension stays loaded until Firefox restarts. Re-load it from `about:debugging` after any changes.

### Make it actually replace ads

By default uBO Lite uses **Basic** filtering mode, which blocks ads at the network layer. Network-blocked ads never produce a DOM element, so there's nothing to "they-live-ify" — you just get empty space. To see the OBEY tiles:

1. Click the uBO Lite toolbar icon → cog (⚙) → Dashboard.
2. Set the filtering mode for the sites you care about to **Optimal** or **Complete**.
3. Reload.

---

## Building from source

Requires Node 22.

```bash
git clone --recursive https://github.com/NaphatrB/they_live_adblocker
cd they_live_adblocker/uBlock
nvm use 22                       # or otherwise ensure Node >= 22
tools/make-mv3.sh chromium       # builds to uBlock/dist/build/uBOLite.chromium/
tools/make-mv3.sh firefox        # builds to uBlock/dist/build/uBOLite.firefox/
```

Load the output folder as an unpacked/temporary extension as described above.

### Running tests

```bash
cd they_live_adblocker
npm test   # 91 unit tests for the classification engine (Node 22, no deps)
```

---

## How it works

uBO Lite's cosmetic filtering normally injects CSS like `selector { display: none !important }` to hide matched ad elements. This fork patches those injection sites to instead apply a white-box mask with a `::after` overlay whose `content` is read from a `data-ubol-they-live` attribute, then walks the DOM (with a MutationObserver for late-loaded ads) to tag each matched element with a phrase.

On hover the `::after` overlay is hidden and the element background becomes transparent, revealing the original ad content that was always in the DOM beneath.

When AI classification is enabled, element context (class names, nearby text, `alt` attributes, outbound link domain, ad SDK data attributes) is batched and sent to an Ollama-compatible API endpoint; the returned phrase replaces the initial random one once the response arrives. The service worker also passively builds an ad-profile data structure from classification signals for the **Your Ad Profile** dashboard.

### Touched files in [`NaphatrB/uBlock`](https://github.com/NaphatrB/uBlock/tree/they-live-llm)

- `platform/mv3/extension/js/scripting/they-live.js` — phrase list, CSS generator, DOM tagging, LLM batch queue, ad-context extraction, DoubleClick param extractor
- `platform/mv3/extension/js/scripting/they-live-classify.js` — fast-path domain/keyword classifier (120+ domain rules, 16 keyword patterns)
- `platform/mv3/extension/js/scripting/css-{specific,generic,procedural-api}.js` — call sites
- `platform/mv3/extension/js/scripting-manager.js` — registers `they-live.js` ahead of consumers
- `platform/mv3/extension/js/background.js` — Ollama API handler, classification stats, ad-profile aggregation, LLM prompt v5
- `platform/mv3/extension/dashboard.html` — They Live AI settings + Your Ad Profile section
- `platform/mv3/extension/js/they-live-dashboard.js` — dashboard rendering: phrase table, profile section, AI analysis button
- `platform/mv3/extension/js/settings.js` — loads/saves Ollama config

---

## Caveats

- Personal hobby fork; **not** an official uBlock Origin product. Don't file uBO issues against this.
- Forcing previously-hidden elements visible can occasionally shift page layout where the site's CSS assumed the ad slot collapsed.
- Custom user-defined cosmetic filters still hide normally (no OBEY treatment).
- Network-blocked ads (most of uBO Lite's blocking) don't get replaced — only cosmetic-filtered ones do.
- The **Your Ad Profile** data is local to your browser session; it resets when the service worker is terminated.

## License

GPL-3.0, same as upstream uBlock Origin / uBO Lite.
