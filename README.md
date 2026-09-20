# Nova

### A little space to think.

Nova is a notes app for Mac and Windows that gives your words room to breathe. Write, collect ideas, and return to the passages that matter—all in ordinary text and Markdown files on your computer.

**[Download Nova](#download-nova)** · **[Take a look](#make-yourself-at-home)** · **[Get started](#your-first-few-minutes)**

![Nova's full workspace with a translucent Markdown editor, folder explorer, starred notes, and bookmarks panel](docs/screenshots/nova-showcase.png)

*Your files on the left. Your thoughts in the middle. Your favorite passages on the right.*

- **Keep your notes yours.** Open folders you already use. Your notes remain files you can open in other apps.
- **Find your way back.** Search for a filename or a phrase, star a favorite note, or give an important passage its own bookmark.
- **Settle into writing.** Adjust the text size, spacing, and layout, or hide the panels and focus on the page.
- **Speak a thought.** Voice typing turns English speech into text on your computer, after a one-time download.

## Download Nova

Choose the download for your computer:

| Your computer | Download |
| --- | --- |
| Mac with an Apple M-series chip | [Download for Mac — Apple Silicon](https://github.com/Sthakur27/Nova/releases/latest/download/Nova-mac-apple-silicon.dmg) |
| Mac with an Intel processor | [Download for Mac — Intel](https://github.com/Sthakur27/Nova/releases/latest/download/Nova-mac-intel.dmg) |
| Windows PC with an Intel or AMD 64-bit processor | [Download for Windows](https://github.com/Sthakur27/Nova/releases/latest/download/Nova-windows-x64.exe) |

Nova is free to download and use. You don't need a GitHub account or developer tools.

**Mac installation**

1. Open the downloaded DMG and drag **Nova** into **Applications**.
2. Open Nova from Applications. If macOS blocks it, open **System Settings → Privacy & Security** and click **Open Anyway** if available, then confirm.
3. If you see **“Nova is damaged”** or cannot open it that way, click **Cancel**, open **Terminal** (search for it with **⌘ Space**), paste this command, and press Return:

   ```sh
   xattr -dr com.apple.quarantine "/Applications/Nova.app"
   ```

   Open Nova from Applications again. Only use this command for a copy from this project's official downloads. It removes the download restriction for Nova alone; no administrator password is needed for a copy you own. A new download may need this step again.

Nova's Mac builds use free ad-hoc signing, but aren't Apple-notarized, so macOS may require this extra approval.

Not sure which Mac you have? Open **Apple menu → About This Mac**: choose Apple Silicon for an Apple M-series **Chip**, or Intel for an Intel **Processor**.

**Windows installation:** open the EXE and follow the installer steps. These preview builds aren't publisher-signed, so Windows may display a security warning.

See [all releases and release notes](https://github.com/Sthakur27/Nova/releases/latest) for available builds.

## Make yourself at home

### A little glow, or a quieter view

Turn **Galaxy mode** on for translucent surfaces and glowing edges, or off for a simple, solid background. Your notes and bookmarks stay right where they are.

With Galaxy mode enabled, the overlapping-circles **Background** button cycles the page through Translucent, Black, and Frosted. Use **Frosted panels** beside it to change the surrounding panels independently. Native desktop builds blur the background in Frosted mode.

| Galaxy on | Galaxy off |
| :---: | :---: |
| ![Galaxy mode with violet accents and glowing panel edges](docs/screenshots/galaxy-mode.jpg) | ![The same note with Galaxy off and a solid dark background](docs/screenshots/standard-mode.jpg) |

### Comfortable controls, close at hand

Give a long paragraph more breathing room with **Line spacing**, or choose a comfortable reading width with **Text width**. These controls, along with **Font** and **Text size**, are right above your note. Drag the side-panel dividers to resize them, and use the arrows around the edges to tuck panels away.

![Nova's writing view with the line-spacing menu open, formatting toolbar, and panel controls](docs/screenshots/ergonomic-controls.jpg)

Open **Terminal** from the icon above your note or the control in the status bar to run a shell below your note in the desktop app. Use **+** for another terminal tab, resize the tray by dragging its top edge or empty tab-bar area, and collapse it without stopping your shells. See the [terminal guide](docs/user-guide.md#terminal) for session controls and shortcuts.

Open **Settings** using the gear in the lower-left corner to adjust text size, spacing, and other reading and writing preferences. Nova remembers your choices on this computer.

![Settings showing Galaxy mode, text size, text width, line spacing, and line highlighting](docs/screenshots/editor-settings.jpg)

### Just you and the page

Enter **focus mode** to hide the folders, bookmarks, and toolbars. Choose your preferred text width first, then settle into the page. Press **⌘ G** on Mac or **Ctrl G** on Windows to bring all the panels back.

![Focus mode with a centered note and the surrounding panels hidden](docs/screenshots/focus-mode.jpg)

*The opening showcase shows the desktop app. The other screenshots show sample notes in the browser preview. The Galaxy comparison uses a soft blue-purple backdrop to show the editor's translucency. Open your own folders and use voice typing in the desktop app.*

## Your first few minutes

1. **Open a folder.** Click **Add folders** and choose where you keep your notes. You can add more than one.
2. **Start a note.** Open a file from the sidebar, or click **+** beside the tabs to create one. New notes start as plain text; choose `.md` as the default file extension in Settings if you want headings, lists, and other formatting.
3. **Choose your view.** For Markdown notes, **Edit** lets you write with formatting, **Read** gives you a reading view, and **Source** shows the underlying text.
4. **Mark a good passage.** Select some text and use **Add bookmark** in the bookmarks panel. Give it a name so you can find it again.
5. **Save your work.** Press **⌘ S** on Mac or **Ctrl S** on Windows to save changes to the original file. Nova also keeps recovery drafts on this computer as you work.

### A few handy shortcuts

Use **⌘ + arrow keys** on Mac or **Ctrl + arrow keys** on Windows to toggle panels: **← navigation**, **→ bookmarks**, **↑ top bars**, and **↓ terminal**. These shortcuts also work while editing a note or using the terminal; adding Shift keeps the normal text-selection shortcut.

| What you'd like to do | Mac | Windows |
| --- | --- | --- |
| Find a note, bookmark, or phrase | ⌘ K | Ctrl K |
| Open / close find within the current note | ⌘ F | Ctrl F |
| Create a note | ⌘ T | Ctrl T |
| Close the current tab | ⌘ W | Ctrl W |
| Bookmark a passage | ⌘ Shift B | Ctrl Shift B |
| Save | ⌘ S | Ctrl S |
| Start / stop dictation | ⌘ Shift D | Click Dictate |
| Enter or leave focus mode | ⌘ G | Ctrl G |
| Open Settings | ⌘ , | Ctrl , |
| Zoom in / out | ⌘ + / − | Ctrl + / − |

### Prefer to say it?

Click **Dictate**, the microphone above your note. On first use, Nova asks you to download its English speech model (about 78 MB). Place your cursor and start recording: words appear with a short processing delay and may be revised as you speak. Stop to finalize them. Recordings can be up to two minutes long. On Mac, **⌘ Shift D** starts or stops dictation.

Your audio stays on your computer and isn't uploaded. Voice typing requires the desktop app and microphone access. See the [voice typing guide](docs/user-guide.md#voice-typing) for details.

## A few things to know

Nova is still a prototype. Alongside plain text and Markdown notes, it offers basic code editing for Python, TypeScript/JavaScript (including JSX/TSX), Java, JSON, HTML, and CSS. Open a file with the corresponding extension to get syntax highlighting, completion suggestions, basic syntax diagnostics, bracket matching, indentation, and folding. See [code editing](docs/user-guide.md#code-editing) for shortcuts and limits. Image attachments are not available yet. Configured desktop and iOS builds can connect Google Drive to sync selected saved notes and restore a workspace onto another device. Selected workspaces check for incoming changes every minute while active; iOS resumes checks when the app returns to the foreground. Conflicting edits pause for review; automatic merging is not available. See the [Google Drive guide](docs/sync.md). If you change files in another app, refresh the folder and reopen the note to pick up the changes.

Recovery drafts help you return to unfinished work, but **Save** writes changes to your original files. Keep a separate backup of important notes. If a file changes outside Nova while you're editing, Nova stops the save so you can reconcile the two versions.

## Explore further

- **[Reference guide](docs/user-guide.md)** — detailed controls, bookmarks, tabs, saving, and current limits.
- **[Google Drive](docs/sync.md)** — connect, choose uploads, download a workspace, and understand current limits.
- **[iPhone and iPad](docs/mobile.md)** — native development setup, mobile storage, and sync verification.
- **[Developer guide](docs/development.md)** — run from source, build installers, and run checks.
- **[Release notes](https://github.com/Sthakur27/Nova/releases/latest)** — available downloads and changes.

## App updates

On desktop, Nova checks for updates shortly after launch. An **Update Nova** button appears in Settings only when an update is available. Click it to download, then choose **Restart to update** when ready. Downloads do not interrupt writing.

Before installation, Nova preserves the current session and recovery draft. Finish voice typing and close other Nova windows first; terminal sessions end on restart. Existing installations without this feature need one manual installation of an updater-enabled release.

Release maintainers: see [the updater release guide](docs/app-updates.md).
