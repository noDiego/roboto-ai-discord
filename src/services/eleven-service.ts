import { Readable } from 'stream';
import { CONFIG } from '../config';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

export enum CVoices {
    JIRO = 'BWDzJ8HGBnd2LKnzyNZW',
    DARKAYSER = 'kSv7ExgVZm6PJMseGkKu',
    CHAINER = '170l9BgOYvdt9LkK6Bkg',
    CAIN = 'zq4MUhutQpQKs3OA6fgF',
    AKARA = 'teMPK4uoK2JqyNAxMUnI',
    PINERA = 'nppBs8tfCJ2smgETSuOb',
    PINOCHO = 'qcv1vSIo5ukABa4OPPm2',
    WENCHO = 'cNX4JVnC2gBtWgNynNSt',
    NOXFER = 'jlV396zr6NdomGXoB5aK',
}

export class ElevenLabsService {
    private readonly elevenlabs: ElevenLabsClient;

    constructor() {
        this.elevenlabs = new ElevenLabsClient({
            apiKey: CONFIG.ELEVENLABS.apiKey,
        });
    }

    async ttsStream(msg: string, voice: string, model?: string): Promise<Readable> {

        let voiceId;

        switch (voice.toLowerCase()) {
            case 'cain':
                voiceId = CVoices.CAIN; break;
            case 'darkayser':
                voiceId = CVoices.DARKAYSER; break;
            case 'piñera':
                voiceId = CVoices.PINERA; break;
            default:
                voiceId = CVoices.CAIN; break;
        }

        const audioStream = await this.elevenlabs.textToSpeech.stream(voiceId, {
            text: msg,
            voiceSettings: {
                stability: 0.5
            },
            modelId: CONFIG.ELEVENLABS.speechModel,
        });

        return audioStream as any;
    }

}
