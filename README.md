<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:141E30,100:25D366&height=180&text=NEXORA%20MD&fontSize=52&fontAlignY=36&animation=twinkling" width="100%" alt="NEXORA MD"/>

<a href="https://readme-typing-svg.herokuapp.com">
  <img src="https://readme-typing-svg.herokuapp.com?lines=Rich-native+WhatsApp+bot+platform;By+Aizen+%E2%80%A2+v2.2.2&font=Fira+Code&color=25D366FF&height=55&width=520&center=true&vCenter=true&size=22" alt="Typing SVG"/>
</a>

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Multi--Device-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://www.whatsapp.com)
[![Baileys](https://img.shields.io/badge/Baileys-v0.3.18--r25-FF6B35?style=for-the-badge)](https://github.com/boyde1317-byte/baileys)
[![Commands](https://img.shields.io/badge/Commands-468-purple?style=for-the-badge)](#-command-reference)
[![Menu styles](https://img.shields.io/badge/Menu_styles-21-blueviolet?style=for-the-badge)](#-rich-native-messaging-default-on)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

</div>

---

## ✨ What is NEXORA MD?

**NEXORA MD** is a production WhatsApp multi-device bot platform — **468 commands** across **16 categories** and **715 aliases**, with a rich-message engine that makes the bot *feel native*: tappable pickers, copy-code buttons, interactive approval cards, image headers, voice synthesis, and full-text fallbacks everywhere.

Built on a **pinned private Baileys fork** ([`boyde1317-byte/baileys#v0.3.18-r25`](https://github.com/boyde1317-byte/baileys)) with device-verified rich-message generators. Every rich surface ships with a plain-text fallback, so nothing breaks when WhatsApp changes things underneath you.

Under the hood: 470 registered commands (468 user-facing) loaded from 478 files under `src/plugins/`, 21 registered menu renderers, a JSON state store (`db.json`, 60s autosave) plus SQLite archives for the CRM and message-retrieval stores, and an Express layer for health, pairing and plugin introspection.

---

## 🚀 Feature Highlights

### 🎨 Rich-Native Messaging (default ON)
- **Proven native-flow primitives only**: `quick_reply`, `cta_url`, `cta_copy`, `cta_call`, `single_select`, `cta_reminder`, `cta_cancel_reminder`, `send_location`, `address_message` — button taps dispatch their commands automatically
- **21 menu renderers** in `src/menu/types/`: document interactive, native flow, bottom sheet, product, carousel, newsletter, location, contact, order message, rich card, buttons card, Moonson card, galaxy, command directory, A2UI surface, atlas, yono, A2UI widget, zapo, Airich, photo flow — switch with `.menulist` / `.setmenu`
- **Tappable command directory**: `.menu` → category picker → `.help <category>` → command picker → detail card with a copy-command button
- **Media pickers with thumbnails**: `.play` / `.ytmp4` single-selects show the YouTube thumbnail as the card header
- **Interactive approval cards**: pairing requests and server orders land in the super owner's DM with native Approve / Deny buttons
- **LaTeX, maps, tables, galleries as native cards** (`.math`, `.locate`, `.weather`, `.pin`)
- **A2UI v0.9 surface layer** (payloads only) — locally composed v0.9 surfaces, validated against the published schema before send. Heads-up: `InteractiveMessage.bloksWidget` (proto tag 66) is not in WhatsApp's proto, so a real client drops the widget and paints only the card's own text and buttons. `.testa2ui` audits the payloads themselves
- **Rollback to plain-text mode** with `NEXORA_RICH_RESPONSE=0`; audit any device with `.testrich` (15 message types), `.testa2ui` (18 A2UI components) or `.testmessage`
- **Sticker → command mapping**: tap a sticker and it runs its mapped command

### 👥 Multi-Session Pairing
- Link additional WhatsApp numbers (`MAX_EXTRA_SESSIONS`, default 5, up to 50), each running as its own NEXORA bot (`.pair`)
- **Super-owner tier** (`SUPER_OWNER_NUMBERS`): the super owner pairs directly and manages every session; everyone else files a request — an Approve/Deny card lands in the super owner's DM (`.pairapprove` / `.pairdeny` / `.pairrequests`), codes always DM'd, never posted to groups
- **Browser pairing page** at `/pair` (`WEB_PAIR_ENABLED`) with live slot and status polling
- Session lifecycle alerts to the super owner's DM; `.logoutall` wipes every paired session at once
- Auto-resume on restart, auto-retry for transient pairing drops, 515-status resumption on socket loss

### 🧠 AI
- **Groq is the model backend** for text and vision (`GROQ_API_KEY`, model overridable with `GROQ_MODEL`); the internal call surface keeps a Gemini-shaped API so older consumers did not have to change, but no Gemini or secondary-provider key is consulted
- **Pollinations** (`POLLINATIONS_TOKEN`) is the free image-generation fallback for `.logo` / `.generateimage`; disable with `POLLINATIONS_ENABLED=false`, override the model with `POLLINATIONS_MODEL`
- Chat, code, debug, proofread, translate, brainstorm, vision, step-by-step math with native LaTeX, songwriting, Islamic Q&A, and a supportive listener (`.feelbetter`)
- `.remix` — reply to a voice note: whisper-large-v3 transcription → style rewrite (corporate, Shakespeare, Gen Z, pirate, Yoda, Gordon Ramsay) → synthesized back as a voice note
- The format follows the task, not the other way round: each AI turn is built with a rendering contract plus per-turn shape detection. "Compare iPhone 15 vs Galaxy S24" comes back as a native pipe table with a one-line verdict; "who is Kwame Nkrumah" comes back as a titled bullet profile and is explicitly forbidden from becoming a table; "how do I deploy this" becomes numbered steps; a haiku gets no directive at all. Code renders as a code card, math as LaTeX, and `**bold**` is folded to WhatsApp markup. `.aiformat <prompt>` shows which shape a prompt maps to before you send it
- AI auto-reply mode (`.chatbot`) for non-command messages, with per-chat memory (`src/lib/chatMemory.js`)

### 💰 Economy & Progression
- Coins, XP, levels, streaks, daily rewards (`.daily`), leaderboards, gambling and trivia games
- `.shop` — native tappable picker; buy custom titles, menu themes, sticker slots, XP boosts
- Passive XP from real chat activity, level-up cards, rank cards

### 🗡️ RPG & Survival
- 20 commands: gather (`fish`, `hunt`, `mine`, `chop`, `scavenge`, `adventure`), process (`cook2`, `craft`, `eat2`), trade (`sell`, `inventory`, `coop`), and a cooldown dashboard (`.cooldown`) that shows which actions are ready
- Stamina and health gates, tool requirements, per-action cooldowns, loot crates

### 🎮 Games
- **In-chat HTML5 games** served from `src/assets/htmlgames/`: Dino Runner, DOOM Strike, Geometry Dash, 3D chess, pool, piano, and more (`.game [dino/chess/mbim/plane/ttc/calc/monitor]`)
- Turn-based games: chess, pool, tic-tac-toe (solo or duo), Akinator, rock-paper-scissors, word chain, trivia, casino duels

### 🎨 Logo Maker & Media Tools
- 8 logo renderers: `.logo` (AI), `.neon`, `.fire`, `.glass`, `.metallic`, `.retro`, `.gaming`, `.mascot`
- Sticker tooling: `.sticker`, `.takeall` (bundle a group's stickers into a pack), sound stickers (`.saudio`), GIF stickers, `.brat`, `.iqc`, `.ephoto360`, and view-once retrieval (`.vv`)

### 🖥️ Built-In Storefront
- `.store` — interactive plan picker; tapping a plan files an order (`.order`), the super owner approves from their DM, and the buyer gets a payment link automatically
- Plans configured with `STORE_PLANS`

### 👥 Group Management
- `.heatchart` — a heatmap of when your group is actually alive: 24-hour activity chart, peak/dead hours, top talkers
- Welcome/goodbye cards (`.welcome`, `.goodbye`, `.greetings`), anti-link, anti-tag-spam, warns, timeouts, hidetag, sticker-pack theft (`.takeall`), Group Stories, polls, and events

### 📥 Downloaders
- 43 commands: YouTube (audio + video, with thumbnail pickers), TikTok, Facebook, Instagram, X, Spotify, Pinterest, APKs, Threads, Douyin, MediaFire, Telegram sticker packs — plus `.download`, a smart auto-detecting downloader that routes any pasted URL to the right handler

### 🗂️ CRM & Message Archive
- Every inbound message can be archived to SQLite (`better-sqlite3`): `src/lib/crmStore.js` (contacts, threads, media blobs), `src/lib/retrieveStore.js`, `src/lib/richSniffer.js`
- Owner commands: `.crm`, `.crm3`, `.crm3js`, `.crm4`, `.runcrm` — search contacts, dump threads, re-send archived media
- The archive is what makes `.vv` (view-once reveal) and quoted-media downloads work when WhatsApp strips the original payload

### ⚙️ Ops & Reliability
- Pairing-code auth for headless deploys; graceful SIGTERM shutdown; 60s auto-save; bounded message cache; exponential reconnect backoff; `.connection` health dashboard; hot-reload without restart; per-plugin error tracking (`.stats`)
- HTTP surface: `/api/health`, `/api/plugins`, `/api/database`, `/pair` — rate-limited and helmet-hardened

---

## 📋 Command Reference

Commands work with any configured prefix (`.` is the default). **468 commands** across **16 categories** (715 aliases):

| Category | Commands |
|----------|---------:|
| ⚙️ **General** | 53 |
| 🧠 **AI** | 16 |
| ⬇️ **Downloaders** | 43 |
| 🌐 **Web & Search** | 15 |
| 🖼️ **Media & Stickers** | 26 |
| 🎨 **Logo Maker** | 8 |
| 🔧 **Utility** | 51 |
| 👥 **Group Management** | 46 |
| 💰 **Economy & Levels** | 27 |
| 🗡️ **RPG & Survival** | 20 |
| 🎮 **Games** | 18 |
| 🎲 **Fun** | 35 |
| 🌸 **Anime** | 1 |
| 👑 **Owner** | 103 |
| 🛠️ **Developer Tools** | 4 |
| 📡 **Channels** | 2 |

> `.menu` opens the native tappable directory — the fastest way to browse. `.help <category>` drills into any category, `.help <command>` shows a detail card with a copy button.

#### ⚙️ General (53)

| Command | Aliases | Description |
|---------|---------|-------------|
| `.about` | info, botinfo | Shows detailed bot and system information. |
| `.addai` | — | Add the AI bot to this group. Usage: .addai (group only) |
| `.announcement` | ad | Send an announcement styled as an automated greeting card. Usage: .announcement &lt;text&gt; |
| `.brand` | brandcard | Interactive brand card with a full-screen brand details sheet (NIXCODE card). |
| `.call` | endcall, callstatus | Real WhatsApp calls: .call &lt;number\|@user&gt; [seconds] (reply to audio to play it into the call), .endcall, .callstatus. |
| `.channel` | newsletter, ch | Full WhatsApp Channel/Newsletter Manager — create, follow, info, and more. |
| `.creator2` | — | Send the NEXORA MD developer's contact card. |
| `.credits` | credit, dev | Shows bot developer, framework, and version credits. |
| `.dashboard2` | dash2 | Top 50 most-used commands by hit count. |
| `.define` | definition, dict, dictionary, meaning | Dictionary card with meanings table + audio pronunciation. Usage: .define &lt;word&gt; |
| `.donate` | donation | Donate to NEXORA MD via QRIS. Usage: .donate &lt;amount in IDR&gt; |
| `.event` | createevent, meet | Generates a WhatsApp native event card in the chat. |
| `.galaxybar` | gbar | Sends the galaxy bar as an empty container, one slot at a time. |
| `.help` | categories, modules | Browse command categories. Usage: .help [category\|command] |
| `.locate` | map, where | Pin any place on a live map card. Usage: .locate &lt;place&gt; |
| `.mainmenu` | mainhelp | Plain-text list of all commands grouped by category. Usage: .mainmenu [category] |
| `.mb` | msgbuilder, builder | Message builder demo (button / select / legacy / list / ai). |
| `.menu` | ? | Shows the interactive command menu in your active presentation style. |
| `.menu2` | help2 | Interactive menu with header image and category picker. |
| `.menulist` | styles, menus | Lists all available menu presentation styles — tap to switch instantly. |
| `.menupay` | — | Menu listing all categories and commands, with a payment button. |
| `.o` | boos | Shows the owner rights and contact details card. |
| `.o2` | — | Show the NEXORA MD owner card. |
| `.order` | orders, buyserver | Order a server plan. Usage: .order &lt;plan&gt; [note] — e.g. .order 4gb monthly. Super owner: .order list / .orderapprove / .orderdeny |
| `.owner` | creator, developer | Shows the bot owner's contact card. |
| `.pay` | payment | Send a payment request invoice. Usage: .pay &lt;price&gt; \| &lt;product name&gt; |
| `.ping` | p, speed | Measures the response speed of the bot. |
| `.ping2` | pingimage, imageping | Sends the secondary image-based ping surface. |
| `.ping3` | speed3 | Galaxy portal ping — animated planets with live server stats across two tabs. |
| `.ping4` | — | Server status card — latency, device, network and uptime. |
| `.pingimg` | — | Ping as a relayed image (fixed image from the original). |
| `.poll` | vote, survey | Creates a custom interactive poll in the chat. |
| `.product` | productcard, ordercard, pollresult, invoice, requestpayment, payreq, catalog | Native WA commerce cards: .product (product card), .ordercard (order bubble), .pollresult (result snapshot). |
| `.recipe` | cook, howtocook, make | Full recipe card — photo, ingredients table, steps and video. Usage: .recipe &lt;dish&gt; |
| `.retrieve` | getdeleted, recoverdeleted | Retrieve the latest deleted message in this chat. |
| `.sc` | script | Buy the NEXORA MD script — 200 MAD. Usage: .sc [item name] |
| `.series` | tv, show, tvshow | TV series info — poster, info table, episodes. Usage: .series &lt;name&gt; |
| `.server` | m, stat, infobot, serverstatus | Shows the short server and bot status report. |
| `.server2` | — | Show live server and bot status (uptime, CPU, RAM, Node). |
| `.start` | hi, hello | Start chatting card (card / quick / legacy / contact variants). |
| `.stats` | botstats, sysstats | Shows comprehensive bot statistics — uptime, memory, commands, and health. |
| `.store` | servers, hosting | Server hosting plans with an interactive plan picker card. |
| `.subscribe` | unsubscribe, unsub, digest | Daily fact digest. Usage: .subscribe \| .subscribe status \| .unsubscribe |
| `.system` | sysinfo, sysdiag | Shows host and bot system diagnostics in a native Galaxy flows card. |
| `.toggle` | enable, disable, on, off | Enable or disable a feature. Usage: .enable welcome \| .disable autoread \| .toggle welcome off |
| `.totalfeatures` | — | Show the total number of NEXORA MD features (commands). |
| `.totalfitur` | — | Show the total number of features and commands as a card. |
| `.totaluser` | — | Show total users in the database and how many completed onboarding. |
| `.umur` | age | Show your age and days until your next birthday. Usage: .umur 2/2/2010 |
| `.unregister` | unreg | Remove your registration. Usage: .unregister &lt;serial number&gt; (see .ceksn) |
| `.verify` | reg | Register in the bot database and claim the RPG starter pack. Usage: .verify &lt;name&gt;.&lt;age&gt; |
| `.version` | v, ver | Displays current bot, developer, core, and runtime version details. |
| `.weather` | w, forecast | Live weather + forecast with a map card. Usage: .weather &lt;city&gt; |

#### 🧠 AI (16)

| Command | Aliases | Description |
|---------|---------|-------------|
| `.ai` | gpt, ask, chat | Chat with Nexora AI. Usage: .ai &lt;message&gt; \| .ai reset |
| `.brainstorm` | ideas, ideate | Generates creative ideas on a topic. Usage: .brainstorm &lt;topic&gt; |
| `.chatbot` | autoreply, aireply | Toggle AI auto-reply for non-command messages. Usage: .chatbot on/off |
| `.code` | codegen, coder | Generate code with Nexora AI. Usage: .code &lt;what to build&gt; |
| `.debug` | fixcode | Analyzes code for bugs and provides a fix. Usage: .debug &lt;code&gt; or reply to code. |
| `.deepseek` | deepsek, depseek, dipsek | Technical AI chat through Groq. Usage: .deepseek &lt;question&gt;, or reply to a message. |
| `.feelbetter` | feeb, feelbetterbot, healing | 💚 A supportive AI listener when you need to vent. Usage: .feelbetter &lt;text&gt; |
| `.math` | solve | Step-by-step math solver with native LaTeX. Usage: .math &lt;problem&gt; |
| `.muslimai` | islamai, askislam | 🕌 Islamic AI — answers with Quran and Hadith sources. Usage: .muslimai &lt;question&gt; |
| `.proofread` | grammar, fixtext | Proofreads and corrects grammar/spelling. Usage: .proofread &lt;text&gt; or reply to a message. |
| `.simi` | simisimi | 💬 SimiSimi-style casual AI chat. Usage: .simi &lt;text&gt; |
| `.song` | songwriter, writeme | AI writes an original song from your brief. Usage: .song &lt;theme/genre/mood&gt; |
| `.summary` | summarize, tldr | Summarize text, a quoted message, or a URL. Usage: .summary [short\|bullets] [text or URL] |
| `.translate` | tr, trans, translator | Translate text or a replied voice note. Usage: .translate [lang] &lt;text&gt; — default target: English |
| `.translate2` | — | Translate text with Groq. Usage: .translate2 &lt;lang&gt; &lt;text&gt;, or reply to a message. |
| `.vision` | analyze, imageai | Analyzes an image using AI. Reply to an image with .vision [prompt]. |

#### ⬇️ Downloaders (43)

| Command | Aliases | Description |
|---------|---------|-------------|
| `.apk` | apkdl | Searches for Android APKs. Usage: .apk &lt;app name&gt; |
| `.asiabox` | abox, drakor, drama | Search Asian dramas and download episodes from Asiabox. Usage: .asiabox search &lt;title&gt; \| detail &lt;slug&gt; \| eps &lt;slug&gt; &lt;number&gt; |
| `.b44` | base44, b44zip | Pull Base44-hosted files into a .zip archive. Usage: .b44 &lt;base44-file-url&gt; [more urls...] |
| `.dafont` | — | Search and download fonts from Dafont. Usage: .dafont search &lt;name&gt; \| .dafont dl &lt;link&gt; |
| `.douyinsearch` | douyin, searchdouyin | Search Douyin videos. Usage: .douyinsearch &lt;keyword&gt; |
| `.download` | dl, autodl | Smart downloader — paste any URL and it auto-detects the platform. Usage: .download &lt;url&gt; |
| `.fb` | facebook, fbdl | Downloads a Facebook video. Usage: .fb &lt;url&gt; |
| `.githubrelease` | ghrelease, release | Get the latest release of a GitHub repository. |
| `.ig` | instagram, igdl | Downloads Instagram posts, reels, and stories. Usage: .ig &lt;url&gt; |
| `.ig2` | igphoto | Download Instagram media from a link. Usage: .ig2 https://www.instagram.com/p/xxx/ (needs your own itsvall key for method 1; methods 2-3 are keyless) |
| `.igdl2` | instagdramdl | Download Instagram media from a link. Usage: .igdl2 https://www.instagram.com/p/xxx/ |
| `.insta` | — | Download Instagram media from a link (via insget.net). Usage: .insta &lt;link&gt; |
| `.mediafire` | mf | Download a file from MediaFire. Usage: .mediafire https://www.mediafire.com/file/xxx/file |
| `.ph2` | — | Search Pornhub (text results). NSFW — off in groups unless enabled. Usage: .ph2 &lt;query&gt; |
| `.ph3` | — | Search Pornhub videos (NSFW — only works in groups with NSFW enabled). Usage: .ph3 &lt;search&gt; |
| `.phimage` | phimg, pornhubimage | Fetch Pornhub thumbnails by search or video URL (owner only). Usage: .phimage &lt;query or URL&gt; |
| `.phsearch` | — | Search Pornhub (text results). NSFW — off in groups unless enabled. Usage: .phsearch &lt;query&gt; |
| `.pinterest` | pin, pindl, unduh | Search Pinterest with the Rem Airich gallery technique. Usage: .pinterest &lt;query&gt; [number] |
| `.pinterest2` | pin2, pindl2 | Search Pinterest with an inline HTML image navigator. Usage: .pinterest2 &lt;keyword&gt;, then .pindl2 &lt;number&gt;. |
| `.play` | yta, ytmp3, yts, ytsearch, youtubesearch | Search & download YouTube audio. Usage: .play &lt;song name or YouTube URL&gt; |
| `.play2` | ytm, ytmusic | YouTube audio with synced lyrics in a music player. Usage: .play2 &lt;song name or YouTube URL&gt; |
| `.play3` | yta2, ytmp32, ytmp42, ytmp5, ytmp6, ytv2 | YouTube audio/video downloader (alt). Usage: .play3 &lt;title or URL&gt; — .ytmp32/.ytmp42 for audio, .ytv2/.ytmp5/.ytmp6 for video. |
| `.pornhub` | ph, pornhubsearch | Search Pornhub or download a video. Usage: .ph &lt;query&gt; or .ph &lt;url&gt; (owner only) |
| `.pornhubdl` | phub, porn | Search Pornhub and list video links (no download). NSFW — off in groups unless enabled. Usage: .pornhubdl &lt;query&gt; |
| `.pull` | codebase, srcpull | Download a repository/archive as a ZIP or upload it to Catbox/MediaFire (owner only). |
| `.sfile` | — | Search sfile.co and download files. Usage: .sfile &lt;query&gt; \| &lt;sfile.co link&gt; |
| `.shinigami` | — | Search and read manhwa/manga. Usage: .shinigami &lt;title&gt; |
| `.sig` | iglookup, lookupig | Look up an Instagram profile. Usage: .sig &lt;username&gt; |
| `.spotify` | sp, spdl | Downloads a Spotify track as mp3. Usage: .spotify &lt;track url&gt; |
| `.stickersearch` | — | Search sticker packs and send one pack as stickers. Usage: .stickersearch &lt;query&gt;. |
| `.tgstickers` | tgs, tgsticker, stickerpack | Download a Telegram sticker pack as WhatsApp stickers. Usage: .tgs &lt;t.me/addstickers link or name&gt; [count] |
| `.tiktok` | tt, ttdl | Downloads a TikTok video without the watermark. Usage: .tiktok &lt;url&gt; |
| `.tiktokdl` | — | Download TikTok videos or search for one. Usage: .tiktokdl &lt;link&gt; \| &lt;query&gt; |
| `.ttmp3` | tmp3, ttaudio, tiktokmp3 | Download a TikTok as MP3 audio. Usage: .ttmp3 &lt;tiktok url&gt; (or reply to a TikTok link) |
| `.twitter` | x, twdl, xdl | Downloads a video from an X/Twitter post. Usage: .twitter &lt;url&gt; |
| `.xnxxdl` | — | Download an Xnxx video. Usage: .xnxxdl &lt;link&gt; or .xnxxdl &lt;number&gt; after .xnxxsearch |
| `.xnxxsearch` | xnxxs | Search Xnxx. Usage: .xnxxsearch &lt;query&gt; — then .xnxxdl &lt;number&gt; to download |
| `.xvideosdl` | xvdl | Download an Xvideos video. Usage: .xvideosdl &lt;link&gt; |
| `.xvideossearch` | xvsearch | Search Xvideos. Usage: .xvideossearch &lt;query&gt; — then .xvideosdl &lt;link&gt; to download |
| `.yt` | ytaudio, ytvideo | Download YouTube audio (.yt / .ytaudio) or video (.ytvideo) by search or link. |
| `.ytmp3gg` | — | Download MP3 audio from YouTube (15 MB cap). Usage: .ytmp3gg &lt;YouTube link&gt; |
| `.ytmp4` | ytv, youtube | Search & download YouTube video. Usage: .ytmp4 &lt;search or YouTube URL&gt; |
| `.yts2` | — | YouTube search with a swipeable results carousel. Usage: .yts2 &lt;query&gt; |

#### 🌐 Web & Search (15)

| Command | Aliases | Description |
|---------|---------|-------------|
| `.airquality` | aqi, air | Air quality map + pollutant table for a city. Usage: .airquality &lt;city&gt; |
| `.convert` | conv, unit, convertor | Convert units and currencies. Usage: .convert &lt;amount&gt; &lt;from&gt; to &lt;to&gt; |
| `.crypto` | price, coinprice | Get cryptocurrency prices. Usage: .crypto &lt;coin&gt; (e.g. bitcoin, eth, sol) |
| `.currency` | — | Convert currency. |
| `.dns` | — | Look up DNS records for a domain. |
| `.docs` | mdn | Search MDN Web Docs. |
| `.github` | repo | Get information about a GitHub repository. |
| `.headers` | — | Get HTTP headers for a URL. |
| `.news` | — | Get the latest news articles. |
| `.npm` | — | Search for an NPM package. |
| `.screenshot` | ssweb, webshot | Takes a screenshot of any website. |
| `.search` | — | Search the web using DuckDuckGo. |
| `.ssweb2` | — | Screenshot a website. Usage: .ssweb2 https://example.com |
| `.time` | — | Get current time for a timezone. |
| `.whois` | — | Lookup WHOIS information for a domain. |

#### 🖼️ Media & Stickers (26)

| Command | Aliases | Description |
|---------|---------|-------------|
| `.artist` | singer, band | Search for an artist on iTunes. |
| `.brat` | — | Turn text into a brat-style sticker. Usage: .brat your text |
| `.capcut` | — | Render a CapCut template with your media. Usage: .capcut &lt;template link&gt; (reply to media) |
| `.ephoto360` | ephoto | Browse & render ephoto360 text/photo effects. Usage: .ephoto [category [index &lt;text&gt;]] |
| `.expose` | فضح, mirar | Expose a view-once photo/video: reply to it with .expose, .فضح or .mirar. |
| `.fakeprofile` | fakeprofil, fprof | Renders a fake WhatsApp profile screenshot. Reply to a photo with: .fakeprofile Name\|+number\|bio |
| `.gallery` | swipe, viewer | Swipeable image gallery in one card. Usage: .gallery &lt;url...&gt; or reply to an image |
| `.hd` | remini, enhance, upscale | 🖼️ Upscale and enhance an image. Reply to an image with .hd |
| `.hdr` | — | Upscale an image 4x. Reply to a photo with .hdr, or send a photo with the caption .hdr |
| `.iqc` | qc2 | Make an iOS-style quote card from text or a replied image. Usage: .iqc &lt;text&gt; |
| `.movie` | imdb, omdb | Lookup movie or series information. |
| `.musiccard` | mcard, nowplaying | Turns a photo into a now-playing music card. Usage: .musiccard &lt;Title&gt;\|&lt;Artist&gt; (reply to an image) |
| `.paperanimation` | paper | Make a paper-cut text animation video. Usage: .paper &lt;text&gt; |
| `.podcast` | podcasts | Search for a podcast on iTunes. |
| `.readviewonce` | read, rvo | Reveal a view-once photo/video: reply to it with .readviewonce. |
| `.remix` | style, redub | Reply to a voice note to get it back rewritten in a style, as a new voice note. Usage: .remix &lt;style&gt; — styles: shakespeare, corporate, genz, pirate, yoda, gordon |
| `.saudio` | ssticker, soundsticker, audiosticker | NEXORA sound stickers: reply to a video to make one, `.saudio get` to pull the sound out, `.saudio stitch` to put an image with a separate sound. Usage: .saudio [get\|vn\|stitch] [max seconds] |
| `.save` | — | Downloads and returns media from a replied message, effectively bypassing View Once limits. |
| `.sticker` | s, wm, pack | Convert image/video to sticker or rebrand a sticker. Options: crop, emoji, custom pack name. |
| `.stickergif` | — | Turn an image or short video (under 10s) into a sticker. Usage: .stickergif [pack, author]. |
| `.tgprofile` | mysetting, teleprofile, tgp | Render a Telegram-style settings profile card for you or a tagged user. |
| `.toimg` | toimage, stickerimage | Convert a sticker to PNG, or an animated sticker to MP4 automatically. |
| `.tovideo` | stickervideo | Convert a sticker to MP4 video. |
| `.tovn` | voice, voice-note | 🎙️ Convert audio/video into a WhatsApp voice note. Reply with .tovn |
| `.tts` | speak, say | 🔊 Text-to-speech is on standby until a Groq-compatible provider is configured. |
| `.viewonce` | vv, reveal, readonce | View Once reader — reply to a view-once message to reveal it. Usage: .vv (reply) |

#### 🎨 Logo Maker (8)

| Command | Aliases | Description |
|---------|---------|-------------|
| `.fire` | firelogo | Make a fire logo with your text. Usage: .fire &lt;text&gt; |
| `.gaming` | esports, esportslogo | Make a gaming logo with your text. Usage: .gaming &lt;text&gt; |
| `.glass` | glasslogo | Make a glass logo with your text. Usage: .glass &lt;text&gt; |
| `.logo` | logomaker, makelogo | AI logo maker. Usage: .logo &lt;text&gt; [style] — .logo styles to list styles |
| `.mascot` | wolf, wolflogo | Make a mascot logo with your text. Usage: .mascot &lt;text&gt; |
| `.metallic` | 3d, threed, chrome | Make a metallic logo with your text. Usage: .metallic &lt;text&gt; |
| `.neon` | neonlogo | Make a neon logo with your text. Usage: .neon &lt;text&gt; |
| `.retro` | vintage, retrologo | Make a retro logo with your text. Usage: .retro &lt;text&gt; |

#### 🔧 Utility (51)

| Command | Aliases | Description |
|---------|---------|-------------|
| `.addsticker` | setsticker | Map a sticker to a bot command. Reply to a sticker with .addsticker &lt;command&gt; |
| `.afk` | away | Set yourself as AFK. Anyone who mentions or replies to you is notified automatically. |
| `.afk2` | — | Mark yourself AFK with an optional reason. Usage: .afk2 [reason] |
| `.aicheck` | aidetect | Check whether text looks AI-written (Originality / Writer / ZeroGPT + local fallback). Usage: .aicheck &lt;text, min 20 chars&gt; |
| `.airich2` | — | Live tour of the AIRich rich-message builder — builds and edits one message step by step. |
| `.base64` | b64, encode, decode | Encodes or decodes base64. .base64 encode &lt;text&gt; \| .base64 decode &lt;b64&gt; |
| `.calc` | calculate | Quick calculator. Usage: .calc &lt;expression&gt; — supports +, -, \*, /, %, sqrt, pow, parentheses |
| `.carbon` | carbonify, codeimg | 🖥️ Turn code into a Carbon-style image. Usage: .carbon [theme] &lt;code&gt; |
| `.cekjarak` | jarak, rute, maps, distance, route | Route and distance between two places, with a rendered map. Usage: .cekjarak &lt;origin&gt; \| &lt;destination&gt; |
| `.cekresi` | — | Track an Indonesian parcel. Usage: .cekresi &lt;number&gt; or .cekresi &lt;courier&gt; &lt;number&gt; |
| `.ceksn` | — | Show your serial number (used by .unregister). Usage: .ceksn |
| `.check` | wa | Check whether a number is on WhatsApp, banned, or never registered. Usage: .check &lt;number&gt; (or reply / @mention) |
| `.checkchid` | channelid, chid, chatid | Get JID and metadata for current chat or a WhatsApp Channel link. |
| `.delcmd` | — | Delete a sticker command by name or reply. Usage: .delcmd menu or reply to a sticker with .delcmd |
| `.delcmd2` | — | Delete a sticker auto-reply text. Usage: reply to the sticker with .delcmd2 |
| `.delsticker` | removesticker, unsticker | Remove a sticker command by name or reply. Usage: .delsticker menu or reply to the sticker |
| `.device` | devinfo, deviceinfo | Device info check: linked-device index, sender-key, business name, about & more. Usage: .device [@user \| reply \| number] |
| `.enrich` | stylish | ✨ Render text as a rich message — pick a style interactively. Usage: .enrich &lt;text&gt; |
| `.fetch` | — | Download a file from a URL (max 200 MB). Usage: .fetch &lt;url&gt; |
| `.get` | fetchhtml, html | Fetch a website and return its raw HTML. Usage: .get &lt;url&gt; [offset] |
| `.githubsearch` | gbsearch | Search GitHub repositories. Usage: .githubsearch &lt;repo name&gt; |
| `.google` | gnews | Search Google News and get the results as text plus an HTML file. Usage: .google &lt;query&gt; |
| `.ip` | ipinfo, iplookup, geoip, myip | Looks up info for an IP address or domain. Use `.ip` alone to check your own public IP. |
| `.language` | lang, bahasa, idioma, setlang | Set the chat language. Admins in groups, owner in DMs. Usage: .language &lt;en\|id\|es\|pt&gt; or .language to pick from a list. |
| `.latex` | tex | 📐 Renders LaTeX as a native math card. Usage: .latex &lt;latex expression&gt; |
| `.listcmd` | — | List all sticker auto-reply texts. Usage: .listcmd |
| `.liststicker` | stickerlist, stickercmds | Show all registered sticker to command mappings |
| `.lockcmd` | unlockcmd | Lock or unlock a sticker command. Usage: reply to a sticker with .lockcmd or .unlockcmd |
| `.lockcmd2` | unlockcmd2 | Lock/unlock a sticker auto-reply. Usage: reply to the sticker with .lockcmd2 or .unlockcmd2 |
| `.lyrics` | lyric | Fetch song lyrics. Usage: .lyrics &lt;artist&gt; - &lt;title&gt; |
| `.ocr` | readtext, textfromimage, extract | Extracts text from an image. Reply to or send a photo with `.ocr`. |
| `.password` | genpass, pwgen | Generates a secure random password. |
| `.paste` | hastebin, upload | Uploads text to paste.rs and returns a shareable link. Reply to a text message or type directly. |
| `.pastebin` | getpaste | 📋 Share long text/code via pastebin. Usage: .pastebin &lt;text&gt; / .getpaste &lt;url&gt; |
| `.qr` | qrcode, makeqr, genqr | Generates a QR code image from any text or URL. |
| `.qrcode2` | — | Generate a QR code image from text or a URL (quickchart). Usage: .qrcode2 &lt;text&gt; |
| `.quoted` | q | Forward the message that your replied-to message was replying to. Reply to a reply, then .quoted |
| `.readmore` | selengkapnya, spoiler | 📖 Create a "Read more" collapsed message. Usage: .readmore &lt;visible&gt;\|&lt;hidden&gt; |
| `.remind` | reminder, remindme | Persistent reminders: .remind &lt;30m\|2h\|1d&gt; &lt;text&gt; • .remind list/cancel/clear |
| `.rich` | richresponse | Test the new rich response components and combo generators. |
| `.rich2` | — | MessageBuilderV4.7 tour — text, image, video, code, table and mixed cards in one AIRich message. |
| `.setcmd2` | — | Save an auto-reply text on a sticker. Usage: reply to a sticker with .setcmd2 &lt;text&gt; |
| `.share` | — | Make any text tappable-copyable: .share &lt;text&gt; |
| `.styletext` | fancytext, fontstyle, stylize | ✍️ Convert text into fancy Unicode styles (cursive, bold, bubbles...) |
| `.tempmail` | tmpmail, tmp | 📧 Disposable email inboxes. Usage: .tempmail [create\|inbox\|read] |
| `.tempnumber` | tempno, tmpno, tempnum | 📱 Disposable SMS numbers + live OTP feed. Usage: .tempnumber [list\|otps\|check] |
| `.tinyurl` | shorten, short, shorturl | Shortens a long URL using TinyURL. No API key required. |
| `.tourl` | geturl, mediaurl, uploadmedia, fileurl | Uploads any media (image, video, audio, sticker, document) to a public host and returns a direct URL. |
| `.transkrip` | transcribe, totext | 📝 Transcribe a voice note, audio or video to text. Reply with .transkrip |
| `.userinfo` | whoami, profile2 | Shows your detailed user profile with stats and account info. |
| `.wiki` | wikipedia | Look up a Wikipedia summary. Usage: .wiki &lt;topic&gt; |

#### 👥 Group Management (46)

| Command | Aliases | Description |
|---------|---------|-------------|
| `.accept` | acceptall | Approve all pending join requests for this group (admin only, bot must be admin). |
| `.add` | — | Add a user to the group (reply, mention, or give a number). Usage: .add &lt;number&gt; |
| `.antibot` | nobots | STRONG anti-bot: join gate + name detection + behavior scoring. Usage: .antibot on \| scan \| whitelist @user |
| `.antidelete` | snitch, antidelt | Toggle snitch mode. Deleted messages are reposted with the sender named. |
| `.antiforeign` | localonly | Restrict joins to allowed country codes. Usage: .antiforeign on \| allow &lt;cc&gt; \| remove &lt;cc&gt; \| list |
| `.antilink` | antilinks, nolink | Toggle anti-link protection. Non-admin links are auto-deleted and warned. |
| `.antispam` | antiflood, noflood | Toggle flood protection. More than 5 messages in 8 seconds from a non-admin is warned. |
| `.antisticker` | nosticker | Toggle anti-sticker protection. Non-admin stickers are auto-deleted and warned. |
| `.antitag` | antimention, notag | Toggle protection against mass-mention ("tag everyone") spam by non-admins. |
| `.antiviewonce` | antivo, noviewonce | Toggle view-once rescue. View-once media is auto-saved and reposted by the bot. |
| `.antiword` | badword, banword | Banned-words protection. Usage: .antiword add &lt;word&gt; \| remove &lt;word&gt; \| list \| on \| off |
| `.copylink` | gcl | Get the current group's invite link with a copy button. |
| `.dashboard` | panel, groupdash, gdash | Group dashboard — every group feature in one menu with live on/off states. Tap a row to flip it. |
| `.del` | delete | Delete a message for everyone. Reply to it and send .del |
| `.del2` | — | Delete a message for everyone. Reply to it and send .del2 |
| `.delall` | clearall, sweep, clearchat | Delete every message the bot recently sent in this chat |
| `.demote` | unadmin, dm | Demotes a group admin back to regular participant. |
| `.gcstory` | groupstory, swgc, gstatus | Sends a Group Story (status) to the current group. |
| `.groupinfo` | ginfo, gcinfo, groupdetails | Shows detailed metadata for the current group. |
| `.grouplink` | invitelink, invite | Gets or resets the group invite link. Use `.grouplink reset` to revoke and generate a new one. |
| `.groupsettings` | gset, open, close, lock, unlock | Change group settings. Options: open, close (messages), lock, unlock (info editing). |
| `.heatchart` | heat, activity | When this group is actually alive — hourly activity chart, peak hours, and top talkers. Usage: .heatchart |
| `.hidetag` | htag, stag, silentall | Mentions all group members silently — no @names shown in the message. |
| `.hidetag2` | — | Mention all group members silently with a message. Usage: .hidetag2 &lt;text&gt; |
| `.joinreq` | joinrequests, jreq, jr, pending | Manage pending join requests. Usage: .joinreq list \| approve @user\|all \| reject @user\|all \| gate on/off |
| `.kick` | remove, k | Removes a participant from the group. |
| `.linkgc` | — | Show the current group invite link. |
| `.mute` | closegroup | Mutes the group so only admins can send messages. |
| `.promote` | admin, pm | Promotes a group participant to Group Admin. |
| `.purge` | prune, delmsg | Delete multiple messages. Usage: .purge &lt;count&gt; \| reply + .purge |
| `.revoke` | resetlink | Revokes the current group invite link and generates a new one. |
| `.setbye` | setpromote, setdemote | Set the group's custom goodbye, promote or demote message. Usage: .setbye &lt;text&gt; (supports @user, @subject, @desc) |
| `.setcmd` | customcmd | Define group text commands. Usage: .setcmd .name &lt;text&gt; \| .setcmd del .name \| .setcmd list |
| `.setdesc` | — | Changes the group description. |
| `.setgcpp` | gcpp, grouppp, setgroupicon, setgpic, gpic | Sets or removes the group profile picture. |
| `.setname` | — | Changes the group subject/name. |
| `.tag` | — | Reply to a message with .tag to forward it while mentioning everyone. |
| `.tagall` | everyone, all, announce | Mentions all participants in the group with an optional message. |
| `.taginfo` | userinfo2, checkuser | Show info about a user. Reply to their message or @mention them. |
| `.testwelcome` | one | Render a test welcome card for a member. Usage: .one @user (group only) |
| `.timeout` | muteuser, tempmute, shh | Temporarily lock the group to admins. Usage: .timeout @user &lt;duration&gt; (e.g. 5m, 1h, 30s) |
| `.totag` | mentionall | Reply to a message with .totag to forward it while mentioning everyone. |
| `.unmute` | opengroup | Unmutes the group so all participants can send messages. |
| `.warn` | warning | Warn a user. 3 warnings = auto-removal. Usage: .warn @user [reason] |
| `.warns` | — | View or forgive protection strikes: .warns [@user] • .warns reset @user |
| `.welcome2` | — | Turn the welcome message on or off for this group (admin only). Usage: .welcome2 on / off |

#### 💰 Economy & Levels (27)

| Command | Aliases | Description |
|---------|---------|-------------|
| `.achievements` | badges, trophies | Your achievement gallery — badges unlock as you climb, rob, spin and confess. |
| `.balance` | bal, wallet, coins | Quick check of your coin balance, XP, and level. |
| `.blackjack` | bj | Blackjack vs the dealer. .bj &lt;bet&gt; deals, then Hit / Stand / Double. Blackjack pays 3:2. |
| `.corrupt` | corruption, embezzle | Embezzle public funds. Weekly — win big, or get caught and pay a fine. |
| `.crime` | hustle | Commit a crime for quick coins. Fail = fine + possible jail. 5min cooldown. |
| `.daily` | claim, dailyreward, checkin | Claim your daily reward. Streak bonuses stack up to 30 days (+10% per day). |
| `.duel` | — | Wager coins against a friend. Usage: .duel @user &lt;amount&gt; \| .duel accept \| .duel decline \| .duel stats |
| `.farm` | garden, berladang | 🌾 Grow crops, harvest and sell them for coins. Usage: .farm [status/buy/plant/harvest/sell/market/upgrade] |
| `.farm2` | — | Plant 500 of every seed and harvest fruit. Cooldown: 30 minutes. |
| `.gacha` | wish, summon | Pull the slot machine for coins, gems and XP. ${PULL_COST} coins per pull. Pity guarantees Rare+ every ${PITY_THRESHOLD} pulls. |
| `.heist` | bankheist | Co-op heist! ${ENTRY_FEE} coins entry. Start with .heist, crew joins within 90s. More crew, better odds. |
| `.leaderboard` | lb, top, topusers, ranking | Shows top users by XP. Use `.lb coins` to rank by coins, `.lb 2` for page 2. |
| `.leaderboard2` | — | Top users by XP, level and coins. Usage: .leaderboard2 [count, max 10] |
| `.levelup2` | — | Check your level and XP progress towards the next level. |
| `.monthly` | — | Claim your monthly reward (coins + XP). Premium users get more. |
| `.profile` | prof, me | Shows your profile — level, XP, coins, streak and rank. Reply to someone or @ them to view theirs. |
| `.quests` | quest, weekly, challenges | Weekly quests with coin rewards. New set every Monday. Progress auto-tracks from your hustle. |
| `.rank` | rankcard, level | Shows your XP rank card. Usage: .rank [mention/reply] — or plain .rank for yourself |
| `.rob` | steal, mug | Rob another user! 10min cooldown. Fail = fine + jail. |
| `.rob2` | — | Rob a tagged user for coins. Cooldown: 1 hour. |
| `.settitle` | title, mytitle | Set a custom title on your profile (requires shop purchase). Max ${MAX_TITLE_LENGTH} chars. |
| `.shop` | buy | Spend your coins on perks. Usage: .shop to browse, .shop buy &lt;id&gt; to purchase. |
| `.slot7772` | — | Slot 777 — playable slot machine card (client-side reels, 1,000 GP to start). |
| `.slots` | slot, reels | Spin the 3 reels. 7️⃣7️⃣7️⃣ pays x25! Pair pays too. Min bet 10. |
| `.spin` | wheel, dailywheel | Free daily spin of the wheel! Extra spins cost 250 coins. Vault jackpot: 2000 coins. |
| `.trade` | — | Trade with a tagged user. Both put up 500 coins; payouts land after 1h and 2h. |
| `.transfer` | tf | Transfer coins to another user. Usage: .transfer 100 @user |

#### 🗡️ RPG & Survival (20)

| Command | Aliases | Description |
|---------|---------|-------------|
| `.adventure` | — | Go on an adventure and bring back loot. Needs 80+ health. 1h cooldown. |
| `.chop` | chopwood | Chop wood in the forest. Needs an axe and 20+ stamina. 3-hour cooldown. |
| `.cook2` | — | Cook raw ingredients into meals. Usage: .cook2 &lt;dish&gt; [amount] |
| `.cooldown` | cd | Show which RPG actions are ready and which are still cooling down. |
| `.coop` | pen | List the animals in your pen. Usage: .coop |
| `.craft` | — | Craft tools and gear from raw materials. Usage: .craft &lt;item&gt; |
| `.eat2` | — | Eat a cooked meal to restore stamina (+20 each). Usage: .eat2 &lt;dish&gt; [amount] |
| `.fish` | — | Cast a line and see what bites. |
| `.fishing` | — | Go fishing and haul in a catch. Cooldown: 4 minutes. |
| `.hunt` | — | Head into the bush for meat and rare finds. |
| `.hunter` | — | Hunt a random monster for coins, XP and a ticketcoin. 20-minute cooldown. |
| `.hunting` | — | Hunt wild animals and stock your bag. Cooldown: ~8 minutes. |
| `.inventory` | inv, bag | Shows your RPG resources, their sale value and action cooldowns. Usage: .inv |
| `.listfruits` | — | Show the fruit in your warehouse. Usage: .listfruits |
| `.mine` | — | Swing the pickaxe for ore and hidden gems. |
| `.mining` | — | Mine for ore, gems and XP. Cooldown: 5 minutes. |
| `.open2` | — | Open loot crates for rewards. Usage: .open2 &lt;crate&gt; [count] |
| `.scavenge` | — | Scavenge for bottles, cans and cardboard. 30-minute cooldown. |
| `.sell` | — | Sell RPG resources for coins. Usage: .sell &lt;item&gt; \| .sell all |
| `.work` | — | Claim your daily labor wages (+10 limit). Once per day. |

#### 🎮 Games (18)

| Command | Aliases | Description |
|---------|---------|-------------|
| `.aki` | — | Play Akinator — think of a character and I will guess it. Start with .aki start, then answer .aki yes / no / don't know / maybe / probably not. |
| `.akinator` | tebakkarakter, tebak, karakter, mardbiru, mard, mared, guesscharacter | Akinator — think of a famous character and I will guess it. Usage: .akinator start, then answer yes / no / don't know / maybe / probably not. |
| `.bet` | gamble, casino | Gamble coins. Usage: .bet flip &lt;amount&gt; \| .bet dice &lt;amount&gt; \| .bet slots &lt;amount&gt; |
| `.bet2` | — | Gamble coins against the bot. Usage: .bet2 &lt;amount\|all&gt; — beat the bot roll to win. |
| `.chess2` | chess3d2, neonchess2 | Full 3D chess in chat — play vs the bot or vs a friend, 3D/2D view, sound. |
| `.csn` | — | Casino points duel — stake XP against the bot. Usage: .csn &lt;amount\|all&gt; |
| `.dino2` | dinorun2 | Playable Dino Runner game — tap to jump the cacti. |
| `.doom2` | doomstrike2 | Playable DOOM Strike game — raycaster maze shooter with sound. |
| `.ffstalk` | — | Look up a Free Fire profile by UID, or find a UID by nickname. Usage: .ffstalk &lt;UID or nickname&gt; |
| `.game` | htmlgame | 🎮 In-chat HTML5 games. Usage: .game [dino/chess/mbim/plane/ttc/calc/monitor] |
| `.gd2` | geometry2, geodash | Play Geometry Dash in-chat — tap to jump, double jump, ship mode. |
| `.piano2` | composer2, pianogame2 | Playable piano composer game — memorise the notes and grow your song. |
| `.pool2` | billiard2 | Playable 8-ball pool — wide arena, drag to aim, pull back to shoot. |
| `.remairich` | — | Compatibility aliases for Rem Airich HTML games. |
| `.rps` | rockpaperscissors | Play Rock Paper Scissors. Usage: .rps [rock/paper/scissors] |
| `.tic2` | tictactoe2, ttt2 | Tic Tac Toe — solo vs the bot, or duo vs a mentioned friend. Usage: .tic @friend |
| `.trivia` | quiz, question | Answer a trivia question for coins and XP. Usage: .trivia [category] |
| `.wordchain` | wc, chain, shiritori | Word chain game for groups. Start with .wordchain start, join with .wordchain join. |

#### 🎲 Fun (35)

| Command | Aliases | Description |
|---------|---------|-------------|
| `.advice` | tip | Get random life advice. Usage: .advice |
| `.angka` | — | Guess the number 0-9 and win XP. Usage: .angka 5 |
| `.cat` | cats, meow | Get a random cat picture. Usage: .cat |
| `.cekkhodam` | cekkodam, kodam, khodam | Reveal your joke guardian spirit. Usage: .cekkhodam &lt;name&gt; |
| `.ceksifat` | — | Get a random (totally unscientific) trait reading for a name. |
| `.choose` | pick, decide | Choose between options. Usage: .choose option1, option2, ... |
| `.confess` | confession, anonconfess | Send an anonymous confession to the group. Use: .confess &lt;your confession&gt; |
| `.dare` | dares | Get a random dare challenge. |
| `.dare2` | — | Get a random dare challenge (BochilTeam dare list). |
| `.darkweb` | tor, onion | A purely-for-fun "dark web terminal" roleplay. No real Tor/dark-web access. |
| `.dog` | dogs, woof | Get a random dog picture. Usage: .dog |
| `.eightball` | 8ball, 8b | Ask the magic 8-ball a yes/no question. |
| `.fact` | facts | Get a random interesting fact. Usage: .fact |
| `.fakecall` | fakecall-android, fakecall-ios, fakecallwa | Make a fake incoming-call image. Usage: .fakecall &lt;name&gt; \| &lt;duration&gt; (reply to an image for the avatar) |
| `.flip` | coinflip, coin | Flip a coin. Usage: .flip [heads\|tails] [bet amount] |
| `.food` | hungry, eat, dinner | Food roulette — a random dish with photo and a one-tap full recipe. Usage: .food [cuisine] |
| `.funpack` | — | Fun grab-bag: brat stickers, memes, quick AI answers, Spotify downloads. Usage: .funpack &lt;brat\|meme\|ai\|spotify&gt; ... |
| `.gantengcek` | cekganteng, handsomecheck | Check your (random) handsome level. Results may hurt. |
| `.hack` | fakehack, intrusion | Runs a totally real (totally fake) hacking simulation on a target. 100% jokes, nothing is accessed. |
| `.horror` | scary, haunt, casefile | Play fictional or real-life U.S. horror case files. Usage: .horror real start 1 |
| `.horrorfact` | horrorfacts, scaryfact, truehorror | Get a sourced, non-graphic U.S. horror fact. Usage: .horrorfact [number] |
| `.joke` | jokes, funny, lol | Fetches a random safe-mode joke from JokeAPI. |
| `.love` | lovemeter, match | Checks love compatibility between two names or two mentions. Results are consistent for the same pair. |
| `.meme` | memes | Fresh memes stacked in one rich message: .meme [1-5] [dank\|wholesome\|meirl\|programming] |
| `.pickup` | pickupline, flirt | Drops a random pickup line. Tag someone to deliver it to them. 100% cheesy, 0% harmful. |
| `.primbon` | artinama, ramalanjodoh, zodiak, tafsirmimpi, nomorhoki | 🔮 Javanese primbon readings — name meaning, soulmate match, zodiac, dreams, lucky numbers. Usage: .primbon &lt;subcommand&gt; |
| `.quoter` | quote, inspire, wisdom, qotd | Fetches a random inspirational quote with one-tap copy and author lookup. |
| `.roast` | fry, diss | Roasts someone (all love, no real damage). Styles: default / savage / gentle. |
| `.roll` | dice, rolldice | Roll a dice. Usage: .roll [sides] |
| `.ship` | compatibility, lovecalc | Ship two people (.ship @a @b) or yourself with someone (.ship @user). Same pair, same fate. |
| `.tarot` | cardoftheday, draw | Pulls your tarot card of the day. Same card all day (a reader would judge you for asking twice). |
| `.truth` | truths | Get a random truth question. |
| `.truth2` | — | Get a random truth question (BochilTeam truth list). |
| `.vibe` | aura, vibecheck | Checks someone's aura and vibe. Stable reading — your aura doesn't change because you asked twice. |
| `.wouldyourather` | wyr, thisorthat | Get a random "Would You Rather" question to spark group discussion. |

#### 🌸 Anime (1)

| Command | Aliases | Description |
|---------|---------|-------------|
| `.anime` | waifu, neko, wallpaper | Anime pics + GIF cards. Usage: .anime [waifu/neko/wallpaper/hug/pat/kiss/cuddle] |

#### 👑 Owner (103)

| Command | Aliases | Description |
|---------|---------|-------------|
| `.addprem` | delprem, +prem, -prem | Grant or remove premium. Usage: .addprem &lt;days\|permanent&gt; @user \| .delprem @user |
| `.advert` | — | Send an announcement as an automated greeting card (owner only). Usage: .advert &lt;text&gt; |
| `.aiformat` | airich, aiformattest | 🧪 AI rich-format audit — how AI replies become tables/code cards. |
| `.alight` | alightmotion | Create Alight Motion Pro accounts. Usage: .alight bulk [n] (owner) |
| `.anticall` | blockcalls | Toggle automatic rejection of incoming calls to the bot. |
| `.autoread` | bluetick | Toggle auto-read globally or for this chat. Usage: .autoread here on \| .autoread here off \| .autoread here reset |
| `.backup` | — | Database backup manager: .backup [now\|list\|restore &lt;file&gt;] |
| `.ban` | banuser | Ban a user from using the bot. Usage: .ban @user [reason] |
| `.banchat` | bnc | Ban this group from using the bot (owner only, group only). |
| `.banuser2` | — | Ban a user from using the bot (owner only). Usage: .banuser2 @user |
| `.broadcast` | bc | Announce to all groups. Usage: .broadcast &lt;text&gt; \| .broadcast count |
| `.checkusername` | usernamecheck | Check if a WhatsApp username is available. Usage: .checkusername &lt;name&gt; |
| `.checkwa` | checkban, wacheck, iswabanned | Check if a phone number is on WhatsApp and whether it has been banned. |
| `.connection` | health, conn | Shows WhatsApp connection health, metrics, and reconnect diagnostics. |
| `.create` | newgroup, creategroup, gc | Creates a new WhatsApp group with optional picture and description. |
| `.createtheme` | — | Create and register a custom border theme (Owner Only). |
| `.crm` | crm2, insp, adn, relay, lastchat, crmstats, ocrm, ocrm2, oinsp, oadn, orelay, olastchat | Inspect the replied message: .crm (relay script), .insp (raw), .adn (nodes), .crm2 (inline), .lastchat, .crmstats |
| `.crm3` | crm3btn, insp3, adn3, relay3, lastchat3 | Mother CRM port: reply to a message with .crm3 (relay file), .crm3btn (copy card), .insp3 (raw), .adn3 (nodes), .relay3, or .lastchat3. |
| `.crm3js` | — | Reply to a message to relay it live and receive a runnable snippet. |
| `.crm4` | crm4btn, insp4, adn4, relay4, lastchat4 | Owner-only relay-message inspector. Reply to a message: .crm4 (relay file), .crm4btn (buttons), .insp4 (raw), .adn4 (nodes), .relay4 (re-send), .lastchat4 [n] |
| `.delpremuser` | — | Remove premium from a user. Usage: .delpremuser &lt;number&gt; (or mention in a group). |
| `.delsession` | removesession, unpair | Log out and remove an extra session. Usage: .delsession &lt;number&gt; |
| `.dfp` | delplugin | Delete a plugin file. Usage: .dfp &lt;category/name.js&gt; |
| `.dfp2` | — | Delete a plugin file. Usage: .dfp2 &lt;category/name.js&gt;. Owner only. |
| `.eval` | > | Executes JavaScript expressions in a sandboxed context. |
| `.eval2` | — | Run JavaScript with the socket in scope (raw eval with deepFix relay wrapper). Owner only. |
| `.faketag` | ftag | Send a message that looks like it tags people who are not in the group (owner only). Usage: .faketag &lt;name&gt; \| &lt;text&gt; |
| `.finduser` | findbyusername, whoisusername | Find a user by WhatsApp username. Usage: .finduser &lt;name&gt; [pin] |
| `.genai` | genaitest, botbubble | 🧠 Test bench for the GenAI rich response envelope (V2). |
| `.generateassets` | genassets, makeassets | Regenerates all AI-powered bot assets using Pollinations. |
| `.generateimage` | genimage, imagine | Generates a custom image from a prompt using Pollinations. |
| `.goodbye` | gb | Toggle goodbye messages on or off (per-group or global). |
| `.gp` | getplugin, plugininfo | Browse plugins or inspect a plugin source file with an Airich card. |
| `.gp2` | getplugin2 | Browse plugins, or send a plugin\u2019s full source in-chat with a copy button (owner only). |
| `.gpairich` | — | Show the fixed AIRich demo card for the NEXORA MD owner. |
| `.greetings` | greeting, greets | Toggle welcome AND goodbye messages at once (per-group or global). Usage: .greetings on\|off |
| `.levelup` | levelannounce, lvlup | Toggle the level-up announcement card (per-group or global). Usage: .levelup on\|off |
| `.listprem` | listpremium | List premium users and their remaining premium time (owner only). |
| `.logoutall` | unpairall, killsessions, sessionpurge | SUPER OWNER ONLY — log out and remove every paired session at once. |
| `.middleware` | mw, pipeline | Shows registered middleware pipeline and rate-limiter status. |
| `.notify` | — | Send N empty reactions to a chat. Usage: .notify &lt;amount&gt; [here\|&lt;target jid&gt;] [delay ms] (owner only). |
| `.ocrm3` | — | Inspect a replied message and export it as relay code or raw JSON (owner only). |
| `.pair` | addsession, linksession | Link another number as a bot session. Super owner pairs directly; others file a request for approval. Usage: .pair &lt;number&gt; |
| `.pairapprove` | papprove, approvepair | SUPER OWNER — approve a pending .pair request. Usage: .pairapprove &lt;number&gt; |
| `.pairdeny` | pdeny, denypair | SUPER OWNER — deny a pending .pair request. Usage: .pairdeny &lt;number&gt; |
| `.pairrequests` | pairlist, pairqueue | SUPER OWNER — list pending pairing requests. Usage: .pairrequests |
| `.pptag` | ppprivate | Send each group member their own profile picture (owner + group admin only). |
| `.privatemode` | silent, silentmode | Toggle private (silent) mode. Usage: .privatemode on \| .privatemode off |
| `.proto` | resend, dump | Resend the raw payload of a quoted message. |
| `.proto2` | — | Resend the raw payload of a quoted message. Owner only. |
| `.ptv` | videonote, roundvideo | 🔵 Send a round video note (ptvMessage). Reply to a video with .ptv [-u username] [@user] |
| `.ptvchan` | ptvch, ptvchanel | Send a round PTV video to the NEXORA channel. Usage: reply to a video with .ptvchan |
| `.public` | — | Allows everyone to use the bot (public mode). |
| `.regcode` | requestregcode, regrequest | Request a registration code. Usage: .regcode &lt;cc&gt; &lt;number&gt; &lt;mcc&gt; [mnc] [sms\|voice] |
| `.register` | regcomplete | Complete registration with a code. Usage: .register &lt;code&gt; confirm |
| `.reload` | rl, hotreload | Hot-reload plugins without restarting the bot. Usage: .reload &lt;plugin\|category\|all&gt; |
| `.reportcontact` | contactreport | Report a contact. Usage: .reportcontact @user \| .reportcontact &lt;number&gt; |
| `.reportgroup` | groupreport | Report a group (bot leaves it on success). Usage: .reportgroup [group JID] confirm |
| `.reportmessage` | reportmsg, msgreport | Report the message you reply to. Usage: reply with .reportmessage [spam\|harassment\|impersonation\|scam\|other] |
| `.reportspam` | spamreport | Report a chat for spam. Usage: .reportspam [@user\|number] [count 1-5] |
| `.reportuser` | userreport | Report a user. Usage: .reportuser @user [spam\|harassment\|impersonation\|scam\|other] |
| `.restart` | reboot | Hot-reloads all plugin files, or restarts the container process. |
| `.restart2` | — | Hot-reload all plugins, or restart the container with .restart2 hard. Owner only. |
| `.runcrm` | — | Run a saved CRM relay file (owner only). Reply to the relay.js file, then send .runcrm |
| `.savesniffs` | savesniff | Paste and save every captured Meta AI response as JavaScript files. |
| `.self` | private | Restricts the bot to owner-only use (private mode). |
| `.sessions` | listsessions | List extra linked bot sessions. |
| `.setchannel` | — | Sets/clears the channel pill on menu cards: .setchannel &lt;...@newsletter&gt; \| off |
| `.setfooter` | footerstyle, footer | Changes the global active bot message footer style (Owner Only). |
| `.setgoodbyetext` | setgbtext, gbtext | Set custom text for goodbye notifications. Supports placeholders. |
| `.setimagemode` | imgmode, imode | Configure the dynamic image selection mode (static, random, or rotate). |
| `.setmenu` | changestyle, setmenustyle | Changes the global active menu presentation style (Owner Only). |
| `.setmenuaudio` | menuaudio, maudio | Enable or disable the background menu audio message playback. |
| `.setmenuimage` | setimage, setimg | Saves the replied image as background/banner for the currently active menu style. |
| `.setmenumedia` | media | Ingest or update background media files (audio, image, thumbnail) for the menu system. |
| `.setprefix` | prefix | Set custom command prefix(es). Usage: .setprefix &lt;prefix&gt; \| .setprefix reset |
| `.settheme` | theme | Changes the global active bot design theme (Owner Only). |
| `.setthumbnail` | thumbnail, thumb | Enable/disable menu thumbnails or save the replied image as the menu thumbnail. |
| `.setusername` | setuser | Set the bot's WhatsApp username. Usage: .setusername &lt;name&gt; |
| `.setwelcome` | stylewelcome, wcstyle | Set greeting layout style (1 = Image, 2 = Document Card, 3 = Interactive, 4 = Minimal, 5 = Product Card). |
| `.setwelcomeimage` | setwcimg, wcimg | Set custom background image for welcome cards (image or URL). |
| `.setwelcometext` | setwctext, wctext | Set custom text for welcome notifications. Supports placeholders. |
| `.sfp` | spf, saveplugin | Saves plugin code from a replied message. Usage: .sfp &lt;category&gt;/&lt;name&gt;.js [--force] |
| `.sfp2` | — | Save plugin code from a replied message. Usage: .sfp2 &lt;category/name.js&gt;. Owner only. |
| `.shell` | $ | Run a shell command on the host (owner only). Usage: .shell &lt;command&gt; |
| `.simulate` | — | Preview a group event (welcome/bye/promote/demote) without changing membership. Usage: .simulate welcome @user |
| `.sniff` | richsniff, safari | AI-rich payload sniffer: census, discovery, code export, dump, replay. Usage: .sniff [new\|list\|code\|dump\|replay\|clear] |
| `.status` | story, sendstatus, broadcaststatus | Sends a WhatsApp Status (Story) to contacts or groups. |
| `.statusprivacy` | — | Controls who can see your WhatsApp Status. |
| `.sudo` | addowner, delowner, rmowner, owners, sudolist | Manage sudo owners. Sub-commands: .addowner &lt;number\|@user&gt;, .delowner &lt;number\|@user&gt;, .owners |
| `.takeall` | packall, stealpack | Bundle all stickers in this group into a sticker pack named nexora (styled font). |
| `.tesbtn2` | — | Owner-only native-flow button test: plain flow, catalog quote, and location-header variants. |
| `.test2` | allbutton | Owner-only test card carrying every native-flow button type. |
| `.testa2ui` | a2uitest, surfacebind | 🧪 A2UI v0.9 surface audit — one card per catalog component. |
| `.testmessage` | testmsg, msgdebug, tesbtn, testbtn, btnnoxm, tesbtnflow | Test all interactive message types via a native WA list picker. |
| `.testptvquote` | ptvquote | Test the decorative fake PTV quote. Usage: .testptvquote [seconds] |
| `.testrich` | testrichmsg, richdebug | 🧪 Test party for OURIN-baileys rich message generators (V1 + V2). |
| `.unban` | pardon | Unban a user. Usage: .unban @user |
| `.unbanchat` | ubnc | Unban this group so it can use the bot again (owner only, group only). |
| `.unbanuser2` | — | Unban a user. Usage: .unbanuser2 @user (or reply to their message). Owner only. |
| `.viewstatus` | vs, statuslist, fetchstatus | Views WhatsApp Status updates from contacts. |
| `.vipcard` | viprich | 👑 Sends the VIP unified-response rich card (r18 envelope showcase). |
| `.welcome` | — | Toggle welcome messages on or off (per-group or global). |

#### 🛠️ Developer Tools (4)

| Command | Aliases | Description |
|---------|---------|-------------|
| `.hash` | md5, sha1, sha256 | Generates a hash for the given text. |
| `.jsonformat` | json, prettyjson | Formats and validates JSON string. |
| `.jwt` | jwtdecode | Decodes a JSON Web Token (JWT) payload. |
| `.uuid` | guid | Generates random UUID(s). Usage: .uuid [count] — up to 10 at once. |

#### 📡 Channels (2)

| Command | Aliases | Description |
|---------|---------|-------------|
| `.channels` | chan, chans, mychannels, newsletters | List the WhatsApp channels this bot follows. Usage: .channels |
| `.chanreact` | chreact, creact, chanreaction | React to a Channel post (or remove the reaction). Usage: .chanreact &lt;channel post link&gt; &lt;emoji&gt; \| .chanreact off &lt;link&gt; |

---

## 🛠️ Installation

### Prerequisites
- **Node.js 20+** and **npm 8+**
- A **WhatsApp account** to link as the bot number
- `git` available on the build host (the Baileys fork installs from a git tag)
- Optional: `ffmpeg` for audio/video conversion paths

### Clone & Install

```bash
git clone https://github.com/boyde1317-byte/NexoraFlex.git
cd NexoraFlex
npm install
```

`npm install` runs `scripts/patch-libsignal.js` as a postinstall step, and resolves `baileys` deterministically to the pinned fork tag `v0.3.18-r25` over HTTPS — no SSH keys needed in CI.

### Configure

```bash
cp .env.example .env
```

The essentials in `.env`:

```env
# Your phone number(s) — comma-separated, country code, no + or spaces
OWNER_NUMBERS="233XXXXXXXXX"

# Super owner: full session control (defaults to first OWNER_NUMBERS entry)
SUPER_OWNER_NUMBERS="233XXXXXXXXX"

# AI — free key from console.groq.com (enables chat, vision, code, remix, math)
GROQ_API_KEY="gsk_..."

# Optional — free image generation for .logo / .generateimage
POLLINATIONS_TOKEN="..."

# Optional — server plans shown by .store / .order
# STORE_PLANS='[{"ram":"1GB","price":10},{"ram":"4GB","price":40}]'
```

### Start

```bash
npm start
```

On first run the console prints a **pairing code** — enter it on the bot's phone under WhatsApp → Settings → Linked Devices → Link a Device → *Link with phone number instead*. The session persists to `./session/` and reconnects automatically on every restart.

---

## ⚙️ Configuration

Everything is read once at boot from the environment (see `.env.example` for the full annotated list) and validated by `config/index.js`, which logs warnings for missing owners, missing AI keys and invalid numbers instead of failing silently.

| Group | Variables |
|-------|-----------|
| Identity & access | `OWNER_NUMBERS`, `SUPER_OWNER_NUMBERS`, `OWNER_NAME`, `PUBLIC_MODE`, `MAX_EXTRA_SESSIONS` |
| Pairing | `PAIRING_ENABLED`, `PAIRING_PHONE`, `PAIRING_BUDGET`, `WEB_PAIR_ENABLED`, `AI_BOT_JID` |
| Connection | `RECONNECT_LIMIT`, `CONNECT_TIMEOUT`, `KEEPALIVE_INTERVAL`, `AUTO_RECOVERY`, `AUTO_READ`, `AUTO_STATUS_VIEW` |
| Rate limits | `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW`, `COMMAND_COOLDOWN` |
| Storage | `DB_PATH`, `DB_AUTOSAVE_INTERVAL` |
| AI | `GROQ_API_KEY`, `GROQ_MODEL`, `POLLINATIONS_TOKEN`, `ENABLE_AI` |
| Feature flags | `ECONOMY_ENABLED`, `GREETINGS_ENABLED`, `NEWSLETTER_ENABLED`, `GAMES_ENABLED`, `DOWNLOADS_ENABLED`, `GROUP_MGMT_ENABLED`, `STATUS_ENABLED`, `ANTI_CALL`, `HOT_RELOAD` |
| Group protection | `ANTILINK_WARN_THRESHOLD`, `ANTITAG_THRESHOLD`, `WARN_EXPIRY` |
| Progression | `XP_MIN`, `XP_MAX`, `XP_COOLDOWN`, `XP_ANNOUNCE`, `XP_LEVELUP_BONUS`, `DAILY_BASE_XP`, `DAILY_BASE_COINS`, `STREAK_MULTIPLIER`, `MAX_STREAK_BONUS` |
| Integrations | `NEWS_API_KEY`, `SMMRY_API_KEY`, `OMDB_API_KEY`, `MEDIAFIRE_*`, `CATBOX_USERHASH`, `JAKY_API_KEY`, `TELEGRAM_BOT_TOKEN` |
| Server | `PORT`, `HOST`, `MAX_FILE_SIZE`, `TEMP_DIR`, `LOG_LEVEL`, `NODE_ENV` |
| Rich output | `NEXORA_RICH_RESPONSE` (`0` disables every rich surface) |

`src/telegram/` holds an optional Telegram control panel for the session engine. It is **not wired into this build** — the standalone server never starts it, so nothing there runs unless you import it yourself.

---

## ☁️ Deployment

### Railway (recommended)
1. Fork/push this repo to GitHub
2. New project → **Deploy from GitHub repo**
3. Add the env vars above in *Variables* (at minimum `OWNER_NUMBERS` and `GROQ_API_KEY`)
4. Attach **two volumes** with mount paths `/app/session` and `/app/src/database` — without them every redeploy forces a re-pair and wipes the db
5. Deploy — the build installs the pinned git dependency keylessly (the Dockerfile includes git for the lockfile)
6. Open the deploy logs for the pairing code on first boot

### Fly.io
```bash
fly volumes create nexora_session  --size 1
fly volumes create nexora_database --size 1
fly deploy
```
`fly.toml` already maps both volumes. Set `PAIRING_ENABLED=true` and `PAIRING_PHONE` so the 8-digit code lands in the logs instead of an ASCII QR you cannot scan from a log stream.

### Docker
```bash
docker build -t nexora-md .
docker run -d --env-file .env \
  -v nexora-session:/app/session \
  -v nexora-database:/app/src/database \
  -p 3000:3000 nexora-md
```
Or `docker compose up -d --build` — `docker-compose.yml` mounts both paths already. Health check: `GET /api/health` on port `3000` (`PORT` is respected).

### VPS / Pterodactyl / Termux
Node 20 + `npm install` + `npm start` — same steps as above; use PM2 (`pm2 start server.js`) on VPS. Session state lives in `./session/`, the database in `./src/database/db.json` — back both up.

### After deploy — the device test
1. Link your WhatsApp with the pairing code from the logs
2. From the linked number, run `.testrich` — walks every rich builder
3. With `NEXORA_RICH_RESPONSE=1`, the normal user-facing cards also take the rich path — A/B them on the same device
4. Record rendering results against the fork's `TESTING.md` checklist

---

## 🔌 Writing Plugins

Every command is a plugin: one `.js` file in `src/plugins/<category>/`. Drop a file in, restart (or `.reload`), and it's live. This section is the full manual.

### Quick start

```js
// src/plugins/fun/greet.js
import { actionCard } from '../../lib/interactiveKit.js';

export default {
  name: 'greet',
  aliases: ['hello', 'hi'],
  category: 'fun',
  description: 'Greets someone. Usage: .greet @person (or .greet Bob)',
  cooldown: 2000,
  execute: async ({ m, sock, args, prefix }) => {
    const mentions = m.msg?.contextInfo?.mentionedJid ?? [];
    const who = mentions.length ? `@${mentions[0].split('@')[0].split(':')[0]}` : (args[0] || 'friend');
    await actionCard(sock, m.from, { text: `👋 Hello, ${who}!`, footer: 'NEXORA' },
      [{ label: '👋 Again', cmd: `${prefix}greet` }],
      { quoted: m, mentions });
  }
};
```

The file's default export is the plugin object. The loader (`src/core/client.js`) picks up any `.js` file anywhere under `src/plugins/`, so category folders are for organization only. Files whose names start with `_` are helpers, not commands — they are skipped with a warning unless they export a valid plugin.

### Plugin fields (all supported fields)

| Field | Type | Meaning |
|-------|------|---------|
| `name` | string | **Required.** Trigger without prefix — `.greet` |
| `execute` | function | **Required.** `async ({ ...ctx }) => {}` |
| `aliases` | string[] | Extra triggers. Must not collide with existing names/aliases (loader warns, last one wins) |
| `category` | string | One of the folders: `ai`, `anime`, `channel`, `download`, `economy`, `fun`, `games`, `general`, `group`, `logomaker`, `media`, `owner`, `rpg`, `utility`, `web`. **Omit it and the command works but is hidden from menus** |
| `description` | string | Shown in `.menu` and the command detail page. Put usage examples here — this is the only "help text" the menu reads |
| `cooldown` | number | Per-user cooldown in ms. Omit for the global default (`config.cooldownTime`) |
| `permissions` | object | The canonical gate — `permissions: { owner, groupOnly, admin, botAdmin }` (all booleans). Legacy flat flags (`ownerOnly`, `groupOnly`, `adminOnly`, `botAdmin`) still work as fallbacks but prefer the object |
| `dependencies` | string[] | Names of other plugins that must exist — loader warns if missing |
| `onLoad` / `onUnload` / `onError` | function | Lifecycle hooks. `onLoad({ client, db, config, brand, logger })` is awaited once at boot (and after `.reload`); `onError` fires when `execute` throws |

What the flags mean: `owner: true` restricts to `OWNER_NUMBERS`; `groupOnly: true` refuses DMs; `admin: true` requires the sender to be a group admin; `botAdmin: true` requires the bot itself to be group admin. The dispatcher (`src/handlers/message.js`) enforces all of them before your `execute` runs — you never need to re-check permissions inside the command.

Plugins that share one handler can be generated instead of written: `makeActionPlugin(name, emoji, description)` (see `src/plugins/rpg/fish.js`) produces a full plugin object for RPG-style actions.

### The `execute` context

```js
execute: async ({ m, sock, jid, sender, args, body, prefix,
                  isGroup, isOwner, rawMessage, db, client, config }) => {}
```

* `m` — serialized message object, the workhorse (see below)
* `sock` — the Baileys socket, for anything raw (`sendMessage`, presence, etc.)
* `args` — array of words after the command. `prefix` is the active prefix string (usually `.`; default it with `const p = prefix || '.'`)
* `body` — full text after the prefix, `rawMessage` — the untouched Baileys proto
* `isGroup`, `isOwner` flags, plus `db` (database handle), `client` (command registry), `config`

### The `m` object surface

| Member | What it does |
|--------|--------------|
| `m.reply(text)` | Plain text reply. Auto-attaches the ad-reply banner card (see `enrichContext.js`) |
| `m.reply.success / .error / .warn / .info / .loading` | Pre-formatted variants (`loading(text)` shows a spinner card you should replace with the result) |
| `m.reply(text, { skipAdReply: true })` | Suppress the banner card |
| `m.reply(text, { contextInfo })` | Custom contextInfo override |
| `m.react(emoji)` | React to the triggering message |
| `m.sender`, `m.from` | Sender JID, chat JID. Numbers: `m.sender.split('@')[0].split(':')[0]` |
| `m.quoted` | The replied-to message, if any (`m.quoted.sender`, `m.quoted.text`) |
| `m.msg?.contextInfo?.mentionedJid` | Array of `@mentions` in the triggering message |
| `m.download()` | Download attached media (images/audio/video) as a Buffer |
| `m.edit(text)`, `m.delete()` | Edit/delete the *bot's own* message (edit powers in-place animations, see `fun/hack.js`) |

Mention tags: WhatsApp only renders `@number` when the JID is also in the `mentions` array — every send that prints `@user` must pass `mentions: [jid]`.

### Applying rich messages

Rich output is a **tier system**: try the rich card first, fall back to plain text if it throws. Never assume the rich renderer succeeded — device support varies and the whole rich engine can be off (`NEXORA_RICH_RESPONSE=0` disables it globally).

```js
// Tier 1: rich table
try {
  return await richTableCard(sock, m.from, {
    title: '🪙 LEADERBOARD',
    headers: ['#', 'User', 'Coins'],
    rows,
    footer: 'Page 1/3',
  }, { quoted: m });
} catch (err) {
  console.warn(`[lb] rich failed, falling back:`, err.message);
}
// Tier 2: plain text fallback — always reached, never a dead end
await m.reply(plainTextRows);
```

Builders live in two files:

* `src/lib/interactiveKit.js` — `richTableCard` (native tables), `richArticleCard` (text + LaTeX + links), `richCodeCard`, `richCarouselCard`, `richMediaCard` (inline images), `actionCard` (buttons), `copyResultCard`, `linkCard`, `mixedCard`, `selectMenu` (list picker), `bottomSheetCard`, `offerCard`. All degrade gracefully to plain text internally.
* `src/lib/richContent.js` — `sendGridCard`, `sendMultiImageGallery`, `sendGifCard`, `sendReelWithStatsCard`, `sendLinkCard`, `sendListCard`. Gate with `richEnabled()` if you want to skip the attempt entirely.

Other rendering helpers: `sendAIRichReply` (`aiRichReply.js`, markdown/tables/code for AI output), `buildAISystemPrompt` (`aiRichFormat.js`, the rich-rendering contract + per-turn shape directive appended to every AI system prompt), `asciiBuilder` (`ui/asciiBuilder.js`, plain-text tables/banners for fallbacks), `DownloadProgress` (`lib/progress.js`, animated progress for downloads), `withReactionStatus` + `animateReveal` (`lib/cosmetics.js`, status reactions and staged reveals).

Reference plugins worth copying: `economy/leaderboard.js` (rich table + ascii fallback), `utility/wiki.js` (table card + action buttons), `fun/hack.js` (edit-based animation), `ai/ai.js` (AI rich reply + context memory).

### Must-knows checklist

1. **Reply exactly once per outcome.** The dispatcher auto-sends an error card if your plugin *throws* without having replied (`m._replyCount`), so a plugin that errors mid-send won't double-reply. But don't `reply()` and *also* `throw` — that stacks messages.
2. **Always `try/catch` rich sends** and have a working plain-text fallback. The catch block is your second chance, not dead code.
3. **Cooldowns are per sender + command.** Set realistic values — group games spam fast. `cooldown: 3000` is a good default for fun commands.
4. **Write usage into `description`.** The menu shows only `name` + `description`, so `.greet @person` examples belong in the description string itself.
5. **Never hardcode the prefix.** Use the `prefix` argument (`const p = prefix || '.'`).
6. **Don't block.** `execute` is awaited in the message pipeline — long work (API calls, downloads) should use `DownloadProgress` or an early acknowledgment, never a silent 30-second stall. The dispatcher already emits a "typing…" presence for you.
7. **Media in, media out:** use `m.download()` for input, and route image sends through the rich builders or `sock.sendMessage` with a Buffer — not raw URLs, which expire.
8. **Keep secrets out of replies.** Errors from APIs often contain keys — log with `console.warn`, reply a clean message.
9. **Names are global.** Before picking a name, `grep -rn "name: 'yourname'" src/plugins/` — the loader warns on collisions but last-loaded wins, which makes confusing behavior.
10. **Test before pushing:** `node --check <file>`, `npx eslint <file>`, then a loader boot check:

```bash
node -e "process.env.NEXORA_LOG_SILENT='1'; const { client } = await import('./src/core/client.js'); await client.loadPlugins(); console.log('loaded:', client.commands.size, 'missing new cmd?', !client.commands.has('greet'))"
```

Then `.reload greet` (owner command) loads it live without a restart. `.reload` with a category reloads the whole folder.

`npm test` runs the release gate (`scripts/verify-release.mjs`) plus the payload-sanitizer suite; `npm run lint` runs ESLint over `src/`.

## 🧩 Rich Message System

- **Outbound**: the pinned Baileys fork exposes V1/V2 generators — text, tables, LaTeX, maps, image grids, content items. `src/lib/interactiveKit.js` wraps the proven subset (native flow CTAs, single-select, buttons, carousels) that renders on real devices
- **Inbound**: `parseRichMessage()` decodes inbound rich messages into readable text
- **Sanitizer**: `src/core/payloadSanitizer.js` strips proto fields the current fork cannot encode before every send, so an unsupported field degrades one card instead of throwing the whole message
- **Testing**: `.testrich` runs the full generator audit; `.testmessage` tests all interactive message types via a native picker. Anything experimental is gated behind `experimentalCta: true` until device-verified
- **Rollback**: `NEXORA_RICH_RESPONSE=0` disables every rich surface in one env var

---

## 🛡️ Security Notes

- Owner numbers come from env only — there are no hardcoded fallback numbers in source, and with `OWNER_NUMBERS` unset the bot has no owner at all
- Pairing codes are always DM'd — never printed to groups
- `.order`, `.pair` and other request-style commands only *file* a request; nothing executes without super-owner approval
- `.eval` / `.shell` are owner-only; ban/warn/mute are permission-gated
- HTTP endpoints are helmet-hardened and rate-limited (`express-rate-limit`); `/pair` has its own start and poll limiters
- Session files in `./session/` are the bot's identity — never commit them. `db.json` and the SQLite archives hold message content: treat them as personal data

---

## 📦 Key Dependencies

| Package | Why |
|---------|-----|
| `baileys` (pinned fork `#v0.3.18-r25`) | WhatsApp multi-device socket + rich message generators (keyless git install via Dockerfile `insteadOf`) |
| NIXCODE rich-message builder | Native cards, buttons, carousels (vendored `src/lib/NIXCODE.js`, attribution preserved) |
| `better-sqlite3` | CRM, retrieve and rich-sniffer archives |
| `sharp` | Image processing for thumbnails and stickers |
| `@napi-rs/canvas` | Card and heatmap rendering |
| `wa-sticker-formatter` | Sticker encoding |
| `express` + `helmet` + `express-rate-limit` | Health, pairing page and plugin introspection endpoints |
| `libphonenumber-js` | Number normalization for owners and pairing |
| `qrcode-terminal` | Headless QR pairing when `PAIRING_ENABLED=false` |
| `fflate` | Zip handling for sticker packs |

---

## 📬 Connect with the Developer

<div align="center">

**Aizen** — Creator & Lead Developer of NEXORA MD

| Platform | Link |
|----------|------|
| 💬 WhatsApp | [wa.me/233533416608](https://wa.me/233533416608) |
| ✈️ Telegram | [@DeathCore_Xr](https://t.me/DeathCore_Xr) |
| 📢 WhatsApp Channel | [Join for updates & announcements](https://whatsapp.com/channel/0029Vb7eSHf42Dcmdd3XA326) |

> Star ⭐ the repo if you find it useful.

</div>

---

<div align="center">

**© NEXORA MD — By Aizen**

*Use responsibly. This project is not affiliated with or endorsed by WhatsApp Inc.*

</div>
