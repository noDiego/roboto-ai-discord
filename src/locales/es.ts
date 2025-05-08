export default {
  responses: {
    thinking: "Pensando...",
    noresults: "No se encontraron resultados para {{query}}",
    addedToQueue: "Añadido a la cola: \"{{title}}\"{{extra}}",
    andMore: " y {{count}} canciones más.",
    nowPlaying: "Reproduciendo: \"{{title}}\".",
    errorPlaying: "Error al reproducir: \"{{title}}\". {{error}}",
    error: "Ha ocurrido un error"
  },
  music: {
    pause: "Pausar",
    play: "Reproducir",
    stop: "Detener",
    skip: "Saltar"
  },
  commands: {
    image:{
      description: "Genera una imagen con la instrucción recibida",
      promptDescription: "La instrucción para que la IA genere o edite una imagen"
    },
    youtube: {
      description: "Busca y reproduce una canción en YouTube",
      queryDescription: "El enlace o la búsqueda para encontrar una canción"
    },
    list: {
      description: "Busca y reproduce una canción en YouTube",
      title: "Lista de canciones",
      emptyMsg: "La lista de canciones está vacía"
    },
    stop: {
      description: "Detiene la reproducción de musica y limpia la lista de canciones",
      response: "* La musica fue detenida por **{{name}}**"
    },
    skip: {
      description: "Salta la canción actual para escuchar la siguiente en la lista",
      response: `* **{{name}}** ha saltado la canción "{{title}}"`
    },
    pause: {
      description: "Pausa la reproducción de la musica actual",
      response: "* **{{name}}** ha pausado la reproducción de musica"
    },
    resume: {
      description: "Resume la reproducción de la musica actual",
      response: "* **{{name}}** ha reanudado la reproducción de musica"
    },
    config: {
      description: "Permite configurar parámetros específicos de este servidor",
      options: {
        name: "Nombre amigable de este servidor",
        promptinfo: "Prompt de sistema personalizado para la IA",
        botname: "Nombre que mostrará el bot en sus respuestas",
        maxmessages: "Máximo de mensajes recientes que la IA considerará",
        ttsprovider: "Proveedor de TTS (voz)",
        imagecreationenabled: "¿Permitir generación/edición de imágenes?"
      },
      responses: {
        noGuild: "Este comando solo funciona en un servidor.",
        currentTitle: "Configuración actual",
        updatedTitle: "Configuración actualizada ✅"
      },
      fields: {
        name: "Nombre",
        prompt: "Prompt",
        botName: "Bot Name",
        maxMessages: "Max Messages",
        ttsProvider: "TTS Provider",
        imageCreation: "Image Creation"
      }
    }
  }
};