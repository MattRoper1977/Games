#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/'games.json'
ART=ROOT/'assets/cards/apex-tennis.svg'
ENTRY={
  'icon':'🎾',
  'title':'Apex Tennis',
  'desc':'Call the point before the serve, then build it on court. A complete offline tennis game with real rules, three rival styles and an honest Plan Rating.',
  'href':'/apextennis/',
  'tag':'Physics',
  'hue':'#3B6FD4',
  'featured':False,
  'hero':False,
  'art':'/assets/cards/apex-tennis.svg',
  'collection':'Sports'
}
SVG='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" role="img" aria-labelledby="t d"><title id="t">Apex Tennis</title><desc id="d">A blue tennis court in perspective with a bright ball trajectory and three plan clause markers.</desc><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0D1736"/><stop offset="1" stop-color="#17295A"/></linearGradient><pattern id="grain" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M0 18 18 0" stroke="#fff" stroke-opacity=".025"/></pattern></defs><rect width="640" height="400" rx="30" fill="url(#bg)"/><rect width="640" height="400" rx="30" fill="url(#grain)"/><path d="M128 342 207 86h226l79 256Z" fill="#3B6FD4" stroke="#DDE8FF" stroke-width="7"/><path d="M320 86v256M168 214h304M237 86l-42 256M403 86l42 256" fill="none" stroke="#DDE8FF" stroke-width="5" stroke-opacity=".92"/><path d="M168 214h304" stroke="#07132F" stroke-width="15"/><path d="M168 210h304" stroke="#F8FBFF" stroke-width="4"/><path d="M205 313C270 254 348 267 411 184" fill="none" stroke="#F6D65D" stroke-width="8" stroke-linecap="round" stroke-dasharray="15 15"/><circle cx="205" cy="313" r="18" fill="#F6D65D" stroke="#FFF" stroke-width="5"/><circle cx="411" cy="184" r="11" fill="#F6D65D"/><g font-family="system-ui,sans-serif" font-weight="800"><rect x="42" y="42" width="202" height="58" rx="18" fill="#07132F" stroke="#80A7FF" stroke-width="3"/><text x="66" y="80" fill="#FFF" font-size="29">CALL THE POINT</text><g transform="translate(445 36)"><circle cx="24" cy="24" r="20" fill="#B9E6CD"/><path d="m14 24 7 7 14-16" fill="none" stroke="#123A2A" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="76" cy="24" r="20" fill="#B9E6CD"/><path d="m66 24 7 7 14-16" fill="none" stroke="#123A2A" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="128" cy="24" r="20" fill="#F2A24A"/><text x="128" y="31" text-anchor="middle" fill="#281605" font-size="22">3</text></g><text x="42" y="378" fill="#DDE8FF" font-size="24" letter-spacing="5">APEX TENNIS</text></g></svg>'''

def main()->int:
    doc=json.loads(MANIFEST.read_text(encoding='utf-8'))
    games=doc.get('games')
    if not isinstance(games,list): raise SystemExit('games[] missing')
    hit=[i for i,g in enumerate(games) if g.get('title')==ENTRY['title'] or g.get('href')==ENTRY['href']]
    if hit:
        first=hit[0]
        games[:]=[g for i,g in enumerate(games) if i==first or not (g.get('title')==ENTRY['title'] or g.get('href')==ENTRY['href'])]
        first=next(i for i,g in enumerate(games) if g.get('title')==ENTRY['title'] or g.get('href')==ENTRY['href'])
        games[first]=ENTRY.copy()
    else:
        games.append(ENTRY.copy())
    out=json.dumps(doc,ensure_ascii=False,indent=2)+'\n'
    MANIFEST.write_text(out,encoding='utf-8')
    ART.parent.mkdir(parents=True,exist_ok=True)
    ART.write_text(SVG+'\n',encoding='utf-8')
    print(f'Apex Tennis manifest entries: {sum(g.get("title")==ENTRY["title"] for g in games)}; total: {len(games)}')
    return 0
if __name__=='__main__': raise SystemExit(main())
