#!/usr/bin/env python3
"""Check the YouTube Playables build against Playables' rules, then zip it for upload.

    npm run youtube:build        (builds dist-youtube, then runs this on it)
    python3 tools/youtube-bundle.py dist-youtube

The rules checked (YouTube Playables' certification requirements, as the game meets them in
src/engine/host.ts):
- size: the initial bundle (everything loaded before gameReady: here, all of it but the music,
  which streams in once the menu is up) under 30 MiB (15 MiB recommended), the whole bundle under
  250 MiB, no file over 30 MiB;
- the SDK's script before the game's own in index.html;
- no browser storage (localStorage, sessionStorage, cookies) and no Page Visibility API
  (visibilitychange, document.hidden): saves and pausing go through the SDK;
- no code made from strings (eval, new Function);
- no outside addresses but the SDK's (the game makes no calls out of YouTube): a URL that's only
  text in a library (a licence, a warning message) is listed as such, not failed.

Writes corner-cutters-youtube.zip next to the build folder, and says what it found.
"""
import os
import re
import sys
import zipfile

MIB = 1024 * 1024
SDK = 'https://www.youtube.com/game_api/v1'
INITIAL_FAIL, INITIAL_WARN, TOTAL_FAIL, FILE_FAIL = 30 * MIB, 15 * MIB, 250 * MIB, 30 * MIB
# loaded after gameReady (the music streams in once the menu is up)
LAZY = re.compile(r'^music/')
FORBIDDEN = ['localStorage', 'sessionStorage', 'document.cookie', 'visibilitychange', 'document.hidden']
EVAL = [('eval(', re.compile(r'(?<![\w$.])eval\s*\(')), ('new Function', re.compile(r'\bnew\s+Function\s*\('))]
# names, never fetched: XML namespaces, and three.js's own text (a paper its shaders cite in a comment)
TEXT_ONLY = re.compile(r'^https?://(www\.w3\.org/|threejs\.org|github\.com/mrdoob/three\.js|jcgt\.org/)')
URL = re.compile(r'https?://[a-z0-9.-]+\.[a-z]{2,}(?:/[^\s"\'`)<>\\]*)?', re.I)


def main(dist: str) -> int:
    files = []
    for root, _, names in os.walk(dist):
        for n in names:
            p = os.path.join(root, n)
            files.append((os.path.relpath(p, dist).replace(os.sep, '/'), os.path.getsize(p)))
    total = sum(b for _, b in files)
    initial = sum(b for p, b in files if not LAZY.match(p))
    biggest = max(files, key=lambda f: f[1])
    fails, warns, notes = [], [], []
    if initial > INITIAL_FAIL:
        fails.append(f'initial bundle {initial / MIB:.2f} MiB (over 30)')
    elif initial > INITIAL_WARN:
        warns.append(f'initial bundle {initial / MIB:.2f} MiB (over the 15 recommended)')
    if total > TOTAL_FAIL:
        fails.append(f'whole bundle {total / MIB:.2f} MiB (over 250)')
    if biggest[1] > FILE_FAIL:
        fails.append(f'{biggest[0]} is {biggest[1] / MIB:.2f} MiB (over 30)')

    index = open(os.path.join(dist, 'index.html'), encoding='utf-8').read()
    sdk_at = index.find(f'<script src="{SDK}"')
    game_at = index.find('<script type="module"')
    if sdk_at < 0 or game_at < 0 or sdk_at > game_at:
        fails.append("index.html: the SDK's script isn't ahead of the game's")

    text_only = set()
    for path, _ in files:
        if not re.search(r'\.(js|html|css|json)$', path):
            continue
        text = open(os.path.join(dist, path), encoding='utf-8', errors='replace').read()
        for word in FORBIDDEN:
            for m in re.finditer(re.escape(word), text):
                # (three.js's Timer, made by its EffectComposer, which only reads the time from it: its page-visibility
                # hook is wired up only by Timer.connect(document), which nothing calls)
                if word in ('visibilitychange', 'document.hidden') and '_pageVisibilityHandler' in text[max(0, m.start() - 400):m.end() + 400]:
                    text_only.add(f"three.js Timer's {word} (wired up only by Timer.connect, never called)")
                    continue
                fails.append(f'{path}: {word}')
                break
        for what, rx in EVAL:
            if rx.search(text):
                fails.append(f'{path}: {what}')
        for m in URL.finditer(text):
            url = m.group(0)
            if url == SDK:
                continue
            if TEXT_ONLY.match(url):
                text_only.add(url)
                continue
            fails.append(f'{path}: address {url}')

    print(f'YouTube build: {len(files)} files, {total / MIB:.2f} MiB in all, {initial / MIB:.2f} MiB before the game is ready (the music after)')
    print(f'  biggest file: {biggest[0]} ({biggest[1] / MIB:.2f} MiB)')
    for u in sorted(text_only):
        notes.append(u if u.startswith('three.js') else f'text only, never fetched: {u}')
    for n in notes:
        print(f'  note: {n}')
    for w in warns:
        print(f'  warning: {w}')
    for f in fails:
        print(f'  FAIL: {f}')
    if fails:
        return 1

    out = os.path.join(os.path.dirname(os.path.abspath(dist)), 'corner-cutters-youtube.zip')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for path, _ in sorted(files):
            z.write(os.path.join(dist, path), path)
    print(f'  all checks passed: {os.path.relpath(out)} ({os.path.getsize(out) / MIB:.2f} MiB), ready to upload')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else 'dist-youtube'))
