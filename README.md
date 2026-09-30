<p align="center">
  <img src="resources/icons/128x128.png" width="96" alt="Ritim icon" />
</p>

<h1 align="center">Ritim</h1>

<p align="center">
  A weekly routine planner for the Linux desktop.<br />
  Plan your week once, get reminded as each block starts and ends, and see how much of the plan you actually did.
</p>

<p align="center">
  <img src="docs/today.png" alt="Today view" width="820" />
</p>

## Features

**Planning**
- Weekly template with repeating blocks, shown on a calendar grid
- Blocks that cross midnight, such as sleep from 23:30 to 07:30
- One-off blocks for a single date, and removing a block for just one day
- Categories with colors; breaks, sleep and free time can be excluded from tracking

**Reminders**
- Desktop notifications before a block starts, when it starts and before it ends
- Default reminder times, with per-block overrides
- Optional sound, do not disturb (1 hour or until tomorrow) and an end-of-day review reminder
- Tray icon that shows the current and next block

**Phone notifications**
- Reminders on your phone through the free [ntfy](https://ntfy.sh) app, no account needed
- Keeps working when the computer is off: the next three days of reminders are queued on the server
- Private mode sends only generic text such as "A block has started"
- Works with ntfy.sh or your own ntfy server

**Tracking**
- Mark each block as done, partly done or skipped, with an optional note
- Completion rate, planned and completed time per category, a daily chart and a streak

**Everything else**
- English and Turkish interface, light and dark theme
- Starts on login and keeps running in the tray
- All data stays in a single JSON file on your computer, with import and export

| Weekly template | Stats |
|---|---|
| ![Weekly template](docs/week.png) | ![Stats](docs/stats.png) |

## Installation

Ritim runs on Linux desktops and is tested on Ubuntu 26.04 with GNOME. Building it requires Node.js 22 or newer.

```bash
git clone https://github.com/<your-username>/ritim.git
cd ritim
npm install
npm run install:local
```

This builds the app and installs it for your user, without sudo. Ritim then appears in your app launcher. To remove it, delete `~/.local/share/ritim` and `~/.local/share/applications/ritim.desktop`.

To build installable packages instead, run `npm run dist`. The AppImage and .deb files are written to `dist/`.

On GNOME, the tray icon requires the AppIndicator extension. Ubuntu includes it by default.

## Getting started

1. Open Ritim and choose **Start with a sample week**, **Start empty** or **Import a file**.
2. On the **Week** page, click an empty slot to add a block, or click a block to edit it.
3. Adjust reminders, sound and autostart under **Settings**.
4. During the day, mark your blocks on the **Today** page. The **Stats** page fills up from there.

### Phone notifications

1. Install the **ntfy** app on your phone from Google Play, F-Droid or the App Store.
2. In Ritim, open **Settings → Phone notifications** and turn it on. Ritim creates a random topic name for you.
3. In the ntfy app, tap **+** and subscribe to that topic.
4. Press **Send test to phone** to check that it works.

On the public ntfy.sh server, anyone who knows your topic name can read its messages, so keep it private. Turn on **Private mode** if you don't want block names, times or notes to leave your computer.

## Your data

Everything is stored locally in `~/.config/Ritim/data.json`. Use **Settings → Export** to back it up or move it to another computer. Nothing is sent anywhere unless you turn on phone notifications.

## Development

```bash
npm run dev         # run with hot reload
npm test            # unit tests
npm run typecheck
```

## License

[MIT](LICENSE)
