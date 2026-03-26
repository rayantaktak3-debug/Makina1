# Advanced Coup

Projet multijoueur local/web avec React + Socket.IO.

## Lancer en local

### Serveur
```bash
cd server
npm install
npm run dev
```

### Client
```bash
cd client
npm install
npm run dev
```

Puis ouvre `http://localhost:5173`.

## Règles intégrées

- 7 rôles custom
- 21 cartes
- 3 cartes par joueur à 4 joueurs ou moins, sinon 2
- Coup à 7, stoppable par la victime à 9
- Terrorist coûte 3 et tue 1 carte choisie par la victime
- Colonel accuse pour 4
- Cop expose puis remplace une carte
- Business Man prend 4, jusqu’à 3 Taxman peuvent taxer 1 chacun

## Note

C’est une version jouable, mais encore perfectible pour les cas limites UI/réseau.
