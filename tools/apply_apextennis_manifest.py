#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
MANIFEST=Path(__file__).resolve().parents[1]/'games.json'
ENTRY={
  'icon':'🎾','title':'Apex Tennis',
  'desc':'Call the point before the serve, then build it on court. A complete offline tennis game with real rules, three rival styles and an honest Plan Rating.',
  'href':'/apextennis/','tag':'Physics','hue':'#3B6FD4','featured':False,'hero':False,
  'art':'/assets/cards/apex-tennis.svg','collection':'Sports'
}
def main()->int:
    doc=json.loads(MANIFEST.read_text(encoding='utf-8'))
    games=doc.get('games')
    if not isinstance(games,list): raise SystemExit('games[] missing')
    matches=[i for i,g in enumerate(games) if g.get('title')==ENTRY['title'] or g.get('href')==ENTRY['href']]
    if matches:
        first=matches[0]
        games[:]=[g for i,g in enumerate(games) if i==first or not (g.get('title')==ENTRY['title'] or g.get('href')==ENTRY['href'])]
        games[next(i for i,g in enumerate(games) if g.get('title')==ENTRY['title'] or g.get('href')==ENTRY['href'])]=ENTRY.copy()
    else:
        games.append(ENTRY.copy())
    MANIFEST.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Apex Tennis manifest entries: {sum(g.get("title")==ENTRY["title"] for g in games)}; total: {len(games)}')
    return 0
if __name__=='__main__': raise SystemExit(main())
