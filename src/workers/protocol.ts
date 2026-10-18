export interface GenerateChunkRequest {
  type: 'generate';
  id: number;
  seed: string;
  generatorVersion: number;
  cx: number;
  cz: number;
}

export interface ChunkGeneratedResponse {
  type: 'generated';
  id: number;
  cx: number;
  cz: number;
  blocks: ArrayBuffer;
}

export interface ChunkGenerationError {
  type: 'error';
  id: number;
  message: string;
}

export type GenerationRequest = GenerateChunkRequest;
export type GenerationResponse = ChunkGeneratedResponse | ChunkGenerationError;
