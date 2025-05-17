export interface CallbackResponse {
    code: number;
    msg: string;
    data: CallbackData;
}

export interface CallbackData {
    callbackType: string;
    task_id: string;
    data: SunoItem[];
}

export interface SunoItem {
    id: string;
    audio_url: string;
    source_audio_url: string;
    stream_audio_url: string;
    source_stream_audio_url: string;
    image_url: string;
    source_image_url: string;
    prompt: string;
    model_name: string;
    title: string;
    tags: string;
    createTime: string; // Aquí podría ser Date si haces parsing después
    duration: number;
}

export enum TaskStatus {
    PENDING = "PENDING",                         // Task is waiting to be processed
    TEXT_SUCCESS = "TEXT_SUCCESS",               // Lyrics/text generation completed successfully
    FIRST_SUCCESS = "FIRST_SUCCESS",             // First track generation completed successfully
    SUCCESS = "SUCCESS",                         // All tracks generated successfully
    CREATE_TASK_FAILED = "CREATE_TASK_FAILED",   // Failed to create the generation task
    GENERATE_AUDIO_FAILED = "GENERATE_AUDIO_FAILED", // Failed to generate music tracks
    CALLBACK_EXCEPTION = "CALLBACK_EXCEPTION",   // Error occurred during callback
    SENSITIVE_WORD_ERROR = "SENSITIVE_WORD_ERROR"// Content contains prohibited words
}

// Interfaz para el contenido de "param"
export interface TaskParam {
    callBackUrl: string;
    customMode: boolean;
    instrumental: boolean;
    model: string;
    prompt: string;
}

// Interfaz para cada objeto dentro de sunoData
export interface SunoDataItem {
    id: string;
    audioUrl: string;
    sourceAudioUrl: string | null;
    streamAudioUrl: string;
    sourceStreamAudioUrl: string;
    imageUrl: string;
    sourceImageUrl: string;
    prompt: string;
    modelName: string;
    title: string;
    tags: string;
    createTime: number;
    duration: number | null;
}

// Interfaz para response
export interface TaskResponse {
    taskId: string;
    sunoData: SunoDataItem[] | null;
}

// Interfaz principal de "data"
export interface TaskData {
    taskId: string;
    parentMusicId: string;
    param: string | TaskParam; // puede ser el string original o el objeto parseado
    response: TaskResponse;
    status: TaskStatus;
    type: string;
    operationType: string;
    errorCode: number | null;
    errorMessage: string | null;
    createTime: number;
}

// Interfaz raíz de la respuesta del API
export interface SunoStatusResponse {
    code: number;
    msg: string;
    data: TaskData;
}