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
- Drag blocks to move them, drag the bottom edge to change their length
- Blocks that cross midnight, such as sleep from 23:30 to 07:30
- Alternative day plans, such as a light day or a vacation day, that replace the template on any date you choose
- One-off blocks for a single date, and removing a block for just one day
- Calendar import: timed events from an .ics file become one-off blocks

**Reminders**
- Desktop notifications before a block starts, when it starts and before it ends
- Default reminder times, with per-block overrides
- Optional sound, do not disturb (1 hour or until tomorrow) and an end-of-day review reminder
- Tray menu that shows the current and next block and lets you mark the current one
- Focus timer with alternating focus and break periods

**Phone**
- Reminders on your phone through the free [ntfy](https://ntfy.sh) app, no account needed
- Keeps working when the computer is off: the next three days of reminders are queued on the server
- Done / Partly / Skip buttons in the notification mark the block in Ritim
- Private mode sends only generic text such as "A block has started"
- Works with ntfy.sh or your own ntfy server

**Daily checklist**
- Recurring to-dos for chosen weekdays, ticked off on the Today page, with a streak per item
- Optional reminder time per item; the reminder is skipped if it is already ticked off

**Tracking**
- Mark each block as done, partly done or skipped, with an optional note
- Completion rate, planned and completed time per category, a daily chart and a streak
- A year view that colors every day by how much of the plan you did

**Markdown export**
- Writes a note for every day and every week into a folder you choose
- Choose a folder inside your Obsidian vault and the notes show up in Obsidian, with properties and links between days and weeks

**Everything else**
- English and Turkish interface, light and dark theme
- Starts on login and keeps running in the tray
- Tells you when a new version is published
- All data stays in a single JSON file on your computer, with import and export

| Weekly template | Stats |
|---|---|
| ![Weekly template](docs/week.png) | ![Stats](docs/stats.png) |

## Installation

Ritim runs on Linux desktops and is tested on Ubuntu 26.04 with GNOME. Building it requires Node.js 22 or newer.

```bash
git clone https://github.com/emreygc7/ritim.git
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

With the Done / Partly / Skip buttons turned on, tapping one marks the block in Ritim. Taps made while the computer is off are applied the next time Ritim starts, within 12 hours.

On the public ntfy.sh server, anyone who knows your topic name can read its messages, so keep it private. Turn on **Private mode** if you don't want block names, times or notes to leave your computer.

### Obsidian and other Markdown apps

Open **Settings → Markdown export** and choose a folder, for example a `Ritim` folder in your Obsidian vault. Ritim keeps a note for each day (`2026-10-01.md`) and each week (`2026-W40.md`) up to date there. Use **Export last 30 days** to fill in the recent past.

## Updates

Ritim checks [GitHub Releases](https://github.com/emreygc7/ritim/releases) once a day and lets you know when a new version is out. You can turn this off in Settings.

## Your data

Everything is stored locally in `~/.config/Ritim/data.json`. Use **Settings → Export** to back it up or move it to another computer. Nothing leaves your computer unless you turn on phone notifications, apart from the daily update check, which only asks GitHub for the latest version number.

## Development

```bash
npm run dev         # run with hot reload
npm test            # unit tests
npm run typecheck
```

## License

[MIT](LICENSE)
