export default {
    responses: {
        thinking: "Réflexion en cours...",
        noresults: "Aucun résultat trouvé pour {{query}}",
        addedToQueue: "Ajouté à la file d'attente : \"{{title}}\"{{extra}}",
        andMore: " et {{count}} chansons de plus.",
        nowPlaying: "Lecture en cours : \"{{title}}\".",
        errorPlaying: "Erreur lors de la lecture : \"{{title}}\". {{error}}",
        error: "Une erreur est survenue",
    },
    music: {
        pause: "Pause",
        play: "Lecture",
        stop: "Arrêter",
        skip: "Passer",
        listeningMsg: 'Écoutant'
    },
    musicplayer: {
        authorListening: "En écoute: ",
        authorAddingOne: "Ajout de la chanson à la liste",
        authorAddingMany: "Ajout de {{count}} chansons à la liste."
    },
    commands: {
        image: {
            description: "Génère une image avec l'instruction reçue",
            promptDescription: "L'instruction pour que l'IA génère ou modifie une image"
        },
        youtube: {
            description: "Recherche et joue une chanson sur YouTube",
            queryDescription: "Le lien ou la requête pour trouver une chanson"
        },
        list: {
            description: "Recherche et joue une chanson sur YouTube",
            title: "Playlist",
            emptyMsg: "La playlist est vide"
        },
        stop: {
            description: "Arrête la lecture et vide la playlist",
            response: "* La musique a été arrêtée par **{{name}}**"
        },
        skip: {
            description: "Passe la chanson actuelle pour écouter la suivante dans la liste",
            response: '* **{{name}}** a passé la chanson "{{title}}"'
        },
        pause: {
            description: "Met en pause la lecture actuelle",
            response: "* **{{name}}** a mis la lecture en pause"
        },
        resume: {
            description: "Reprend la lecture actuelle",
            response: "* **{{name}}** a repris la lecture"
        },
        config: {
            description: "Configurer des paramètres spécifiques pour ce serveur",
            options: {
                name: "Nom convivial pour ce serveur",
                promptinfo: "Invite système personnalisée pour l'IA",
                botname: "Nom affiché par le bot dans ses réponses",
                maxmessages: "Nombre maximum de messages récents pris en compte par l'IA",
                ttsprovider: "Fournisseur de TTS (voix)",
                imagecreationenabled: "Autoriser la génération/édition d'images ?"
            },
            responses: {
                noGuild: "Cette commande ne fonctionne que dans un serveur.",
                currentTitle: "Configuration actuelle",
                updatedTitle: "Configuration mise à jour ✅"
            },
            fields: {
                name: "Nom",
                prompt: "Invite",
                botName: "Nom du bot",
                maxMessages: "Nombre max de messages",
                ttsProvider: "Fournisseur TTS",
                imageCreation: "Création d'images"
            }
        }
    }
};