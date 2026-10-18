import { getItemDefinition, type ItemId } from '../items/ItemRegistry';
import { isTool, maxStackSize, stackFingerprint, type ItemStack } from '../items/ItemStack';
import { BlockId, getBlockDefinition, type BlockDefinition } from '../world/BlockRegistry';

export interface MiningTarget {
  x: number;
  y: number;
  z: number;
  block: BlockId;
}

export interface MiningTickResult {
  progress: number;
  completed: boolean;
}

export function selectedTool(stack: ItemStack | null): NonNullable<ReturnType<typeof getItemDefinition>>['tool'] {
  if (!stack || !isTool(stack)) return undefined;
  return getItemDefinition(stack.itemId)?.tool;
}

export function toolTier(stack: ItemStack | null): number {
  return selectedTool(stack)?.tier ?? 0;
}

export function requiredTier(block: BlockDefinition): number {
  return block.minimumToolTier;
}

export function canHarvestBlock(block: BlockDefinition, heldStack: ItemStack | null): boolean {
  if (!block.breakable || block.hardness === Number.POSITIVE_INFINITY) return false;
  if (block.harvestableByHand && !block.requiredTool) return true;
  const tool = selectedTool(heldStack);
  if (!block.harvestableByHand) {
    if (!tool || !block.requiredTool) return false;
    return tool.kind === block.requiredTool && tool.tier >= block.minimumToolTier;
  }
  if (!block.requiredTool) return true;
  if (!tool) return block.minimumToolTier === 0;
  if (tool.kind !== block.requiredTool) return block.minimumToolTier === 0;
  return tool.tier >= block.minimumToolTier;
}

export function effectiveMiningSpeed(block: BlockDefinition, heldStack: ItemStack | null): number {
  const tool = selectedTool(heldStack);
  if (tool && block.requiredTool === tool.kind) return tool.speed;
  return 1;
}

export function miningProgressPerSecond(
  blockId: BlockId,
  heldStack: ItemStack | null,
  instant: boolean,
): number {
  const block = getBlockDefinition(blockId);
  if (!block.breakable || block.hardness === Number.POSITIVE_INFINITY) return 0;
  if (instant || block.hardness <= 0) return Number.POSITIVE_INFINITY;
  return effectiveMiningSpeed(block, heldStack) / (1.5 * block.hardness);
}

export function isCorrectToolFor(blockId: BlockId, heldStack: ItemStack | null): boolean {
  const block = getBlockDefinition(blockId);
  const tool = selectedTool(heldStack);
  if (!block.requiredTool || !tool) return false;
  return tool.kind === block.requiredTool;
}

export class MiningSession {
  private key: string | null = null;
  private progressValue = 0;
  private toolKey = '';
  private blockIdValue = BlockId.Air;

  get progress(): number {
    return this.progressValue;
  }

  get targetKey(): string | null {
    return this.key;
  }

  get activeBlock(): BlockId {
    return this.blockIdValue;
  }

  reset(): void {
    this.key = null;
    this.progressValue = 0;
    this.toolKey = '';
    this.blockIdValue = BlockId.Air;
  }

  tick(
    dtSeconds: number,
    target: MiningTarget | null,
    heldStack: ItemStack | null,
    instant: boolean,
  ): MiningTickResult {
    if (!target) {
      this.reset();
      return { progress: 0, completed: false };
    }
    const key = `${target.x},${target.y},${target.z}`;
    const toolKey = stackFingerprint(heldStack);
    if (this.key !== key || this.toolKey !== toolKey || this.blockIdValue !== target.block) {
      this.key = key;
      this.toolKey = toolKey;
      this.blockIdValue = target.block;
      this.progressValue = 0;
    }
    const rate = miningProgressPerSecond(target.block, heldStack, instant);
    if (!Number.isFinite(rate)) {
      if (rate === 0) {
        this.reset();
        return { progress: 0, completed: false };
      }
      this.progressValue = 1;
    } else {
      this.progressValue = Math.min(1, this.progressValue + rate * dtSeconds);
    }
    if (this.progressValue >= 1) {
      this.progressValue = 0;
      this.key = null;
      this.toolKey = '';
      return { progress: 1, completed: true };
    }
    return { progress: this.progressValue, completed: false };
  }
}

/** Defence in depth: rejects invalid tool stacks before they reach item rules. */
export function sanitizeHeldTool(stack: ItemStack | null): ItemStack | null {
  if (!stack) return null;
  const definition = getItemDefinition(stack.itemId as ItemId);
  if (!definition) return null;
  if (stack.count > maxStackSize(stack)) return null;
  return stack;
}
