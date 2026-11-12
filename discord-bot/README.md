# Bot Discord complet

Bot Discord en JavaScript, prêt à installer sur un hébergeur de bots Node.js. Le projet est indépendant du workspace : il utilise `npm`, sans commande `pnpm`.

## Installation

1. Crée une application et un bot dans le [portail développeur Discord](https://discord.com/developers/applications).
2. Dans **Bot**, active les intents privilégiés **Server Members Intent** et **Message Content Intent**. Ils servent aux messages de bienvenue/départ et au système de niveaux.
3. Invite le bot avec les scopes `bot` et `applications.commands`. Accorde uniquement les permissions nécessaires aux fonctionnalités que tu actives : gérer les messages, expulser/bannir, modérer les membres et gérer les salons.
4. Dans ce dossier, crée `.env` à partir de `.env.example`, puis renseigne `DISCORD_TOKEN` et `DISCORD_CLIENT_ID`. Ne partage jamais le token.
5. Lance `npm install`, puis `npm start`. Les commandes slash sont enregistrées automatiquement au démarrage. Pour un serveur de test, renseigne aussi `DISCORD_GUILD_ID` dans `.env`.

Sur un hébergeur, choisis Node.js 20 ou plus récent, installe les dépendances avec `npm install` et utilise `npm start` comme commande de démarrage. Configure les variables d'environnement dans l'espace sécurisé de l'hébergeur plutôt que dans le code.

## Commandes

- **Configuration** — `/config welcome`, `/config goodbye`, `/config logs`, `/config antiraid`, `/config levels`, `/config view`
- **Modération** — `/kick`, `/ban`, `/timeout`, `/untimeout`, `/warn`, `/warnings`, `/unwarn`, `/purge`, `/slowmode`, `/lock`, `/unlock`
- **Niveaux et profils** — `/profil`, `/classement`; l'XP est attribuée automatiquement aux messages avec un délai anti-spam
- **Informations et outils** — `/help`, `/ping`, `/serverinfo`, `/userinfo`, `/avatar`, `/botinfo`, `/invite`, `/sondage`
- **Jeux** — `/pileouface`, `/de`, `/8ball`, `/shifumi`

Les embeds utilisent la couleur `#FFFFFF`. Les cartes de profil, d'arrivée et de départ sont dessinées avec Canvas dans une palette bleue inspirée de l'exemple fourni.

## Anti-raid et données

L'anti-raid surveille les arrivées groupées. Lorsqu'il est activé, les nouveaux comptes à partir du seuil défini reçoivent un timeout temporaire et le bot envoie une alerte dans le salon de logs. Il est désactivé par défaut : configure un salon de logs et vérifie les permissions du bot avant de l'activer.

Les réglages, avertissements et statistiques sont conservés dans `data/bot-data.json`. Garde ce fichier sur un stockage persistant de l'hébergeur si tu veux conserver les données après redémarrage ou redéploiement.

## Commandes et permissions

Les commandes de modération et de configuration vérifient les permissions Discord à l'exécution. Les rôles du bot doivent être placés au-dessus des rôles des membres qu'il doit modérer. L'enregistrement des commandes globales peut prendre un peu de temps à apparaître ; `DISCORD_GUILD_ID` permet de les publier tout de suite sur un serveur de test.
