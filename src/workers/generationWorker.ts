/// <reference lib="webworker" />

import { WorldGenerator } from '../world/WorldGenerator';
import type { GenerationRequest, GenerationResponse } from './protocol';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let generator: WorldGenerator | null = null;

workerScope.onmessage = (event: MessageEvent<GenerationRequest>) => {
  const request = event.data;
  if (!request || request.type !== 'generate') return;

  try {
    if (!generator || generator.seedString !== request.seed || generator.generatorVersion !== request.generatorVersion) {
      generator = new WorldGenerator(request.seed, request.generatorVersion);
    }
    const blocks = generator.generateChunk(request.cx, request.cz);
    const response: GenerationResponse = {
      type: 'generated',
      id: request.id,
      cx: request.cx,
      cz: request.cz,
      blocks: blocks.buffer as ArrayBuffer,
    };
    workerScope.postMessage(response, [blocks.buffer as ArrayBuffer]);
  } catch (error) {
    const response: GenerationResponse = {
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    };
    workerScope.postMessage(response);
  }
};
