import type { Page } from '@playwright/test';

export interface SurvivalFlowResult {
  finalCounts: Record<string, number>;
  loadedCounts: Record<string, number>;
  afterReload: {
    mode: 'creative' | 'survival';
    generatorVersion: number;
    blocks: { table: number; furnace: number };
    furnaces: Array<{
      input: { itemId: string; count: number } | null;
      fuel: { itemId: string; count: number } | null;
      output: { itemId: string; count: number } | null;
    }>;
    itemEntities: number;
    selectedSlot: number;
  };
}

export function runFullSurvivalLoop(page: Page): Promise<SurvivalFlowResult>;
